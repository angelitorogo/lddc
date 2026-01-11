// src/app/dashboard/components/track-create/track-create.component.ts

import { Component, ElementRef, ViewChild, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { GoogleMap } from '@angular/google-maps';
import { Router } from '@angular/router';
import { TracksService } from '../../services/track.service';

import { Subscription, timer } from 'rxjs';
import { switchMap, takeWhile, tap } from 'rxjs/operators';
import { AuthService } from '../../../auth/services/auth.service';

interface LatLngLiteral {
  lat: number;
  lng: number;
}

interface ImagePreview {
  file: File;
  url: string;
}

@Component({
  selector: 'app-track-create',
  templateUrl: './track-create.component.html',
  styleUrls: ['./track-create.component.css'],
})
export class TrackCreateComponent implements OnDestroy {
  @ViewChild('fileInput', { static: false }) fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('imageInput') imageInput!: ElementRef<HTMLInputElement>;
  @ViewChild('bulkGpxInput', { static: false }) bulkGpxInput!: ElementRef<HTMLInputElement>;

  @ViewChild(GoogleMap) mapComponent?: GoogleMap;

  form: FormGroup;

  // ---- modo normal (1 GPX) ----
  selectedFile: File | null = null;
  selectedImages: File[] = [];
  imagePreviews: ImagePreview[] = [];
  previewPoints: LatLngLiteral[] = [];
  isPreviewVisible = false;
  fileError: string | null = null;

  creating = false;

  // ---- modo bulk (asíncrono) ----
  bulkMode = false;
  bulkFiles: File[] = [];
  bulkUploading = false;

  bulkJobId: string | null = null;
  bulkProgressText = '';

  private bulkPollSub?: Subscription;

  mapOptions: google.maps.MapOptions = {
    center: { lat: 40.4168, lng: -3.7038 },
    zoom: 8,
    zoomControl: false,
    mapTypeId: 'satellite',
    disableDefaultUI: true,
    scrollwheel: false,
    disableDoubleClickZoom: true,
    draggable: false,
  };

  polylineOptions: google.maps.PolylineOptions = {
    strokeColor: '#00e676',
    strokeOpacity: 1,
    strokeWeight: 4,
  };

  private mapInstance?: google.maps.Map;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private trackService: TracksService,
    public authService: AuthService
  ) {
    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(120)]],
      description: ['', [Validators.maxLength(5000)]],
    });
  }

  ngOnDestroy(): void {
    this.bulkPollSub?.unsubscribe();
    this.clearImagePreviews();
  }

  // -----------------------
  // Navegación / mapa
  // -----------------------
  onBack(): void {
    this.router.navigate(['/home']);
  }

  onMapReady(map: google.maps.Map): void {
    this.mapInstance = map;
    this.fitMapToPreview();
  }

  private fitMapToPreview(): void {
    if (!this.mapInstance || this.previewPoints.length === 0) return;

    const bounds = new google.maps.LatLngBounds();
    this.previewPoints.forEach((p) => bounds.extend(p));
    this.mapInstance.fitBounds(bounds);
  }

  // -----------------------
  // ✅ Toggle modo BULK
  // -----------------------
  setBulkMode(on: boolean): void {
    if (this.bulkUploading || this.creating) return;

    this.fileError = null;
    this.bulkMode = on;

    this.bulkPollSub?.unsubscribe();
    this.bulkPollSub = undefined;

    if (on) {
      // entrar en bulk: limpiar modo normal
      this.form.reset();
      this.clearFileAndPreview(true);
      this.onCancelImages();
    } else {
      // salir de bulk: limpiar selección bulk
      this.cancelBulk();
    }
  }

  // -----------------------
  // ✅ BULK (asíncrono)
  // -----------------------
  openBulkDialog(): void {
    this.fileError = null;
    this.bulkGpxInput?.nativeElement.click();
  }

  onBulkFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files;

    this.fileError = null;
    this.bulkFiles = [];
    this.bulkJobId = null;
    this.bulkProgressText = '';

    if (!files || !files.length) return;

    const list = Array.from(files);

    const onlyGpx = list.filter((f) => f.name.toLowerCase().endsWith('.gpx'));
    if (!onlyGpx.length) {
      this.fileError = 'Debes seleccionar uno o más archivos GPX (.gpx).';
      if (this.bulkGpxInput?.nativeElement) this.bulkGpxInput.nativeElement.value = '';
      return;
    }

    // quitar duplicados por name+size (por si seleccionas repetidos)
    const seen = new Set<string>();
    const unique: File[] = [];
    for (const f of onlyGpx) {
      const k = `${f.name}::${f.size}`;
      if (seen.has(k)) continue;
      seen.add(k);
      unique.push(f);
    }

    this.bulkFiles = unique;
  }

  cancelBulk(): void {
    this.bulkPollSub?.unsubscribe();
    this.bulkPollSub = undefined;

    this.bulkFiles = [];
    this.bulkUploading = false;
    this.bulkJobId = null;
    this.bulkProgressText = '';

    if (this.bulkGpxInput?.nativeElement) {
      this.bulkGpxInput.nativeElement.value = '';
    }
  }

  uploadBulk(): void {
    this.fileError = null;

    if (this.bulkUploading) return;

    if (!this.bulkFiles.length) {
      this.fileError = 'Selecciona primero los GPX que quieres subir.';
      return;
    }

    this.bulkUploading = true;
    this.bulkProgressText = 'Creando job...';

    this.trackService.createFromGpxBulkAsync(this.bulkFiles).subscribe({
      next: (res) => {
        this.bulkJobId = res.jobId;
        this.bulkProgressText = 'Job creado. Procesando...';

        // polling cada 2s
        this.bulkPollSub?.unsubscribe();
        this.bulkPollSub = timer(0, 2000)
          .pipe(
            switchMap(() => this.trackService.getBulkJob(this.bulkJobId!)),
            tap((job) => {
              const done = job?.done ?? 0;
              const total = job?.total ?? this.bulkFiles.length;
              const status = job?.status ?? '...';
              this.bulkProgressText = `Estado: ${status} · ${done}/${total}`;
            }),
            takeWhile((job) => job?.status !== 'DONE' && job?.status !== 'FAILED', true)
          )
          .subscribe({
            next: (job) => {
              if (job?.status === 'DONE') {
                this.bulkUploading = false;

                const created = Array.isArray(job?.created) ? job.created : [];
                const failed = Array.isArray(job?.failed) ? job.failed : [];

                // limpiar selección bulk
                this.cancelBulk();

                if (failed.length && !created.length) {
                  this.fileError = `No se ha podido crear ningún track (${failed.length} fallo/s).`;
                  return;
                }

                if (created.length) {
                  // navegar al último creado
                  const last = created[created.length - 1];
                  this.router.navigate(['/dashboard/track', last.id]);
                  return;
                }

                this.fileError = 'Job finalizado pero no se creó ningún track.';
              }

              if (job?.status === 'FAILED') {
                this.bulkUploading = false;
                this.fileError = job?.error ?? 'Job fallido.';
              }
            },
            error: (err) => {
              console.error('Polling bulk error', err);
              this.bulkUploading = false;
              this.fileError = 'Error consultando el progreso del job.';
            },
          });
      },
      error: (err) => {
        console.error('Error creando job bulk', err);
        this.bulkUploading = false;
        this.fileError = 'Error iniciando la importación masiva.';
      },
    });
  }

  // -----------------------
  // MODO NORMAL (1 GPX)
  // -----------------------
  openFileDialog(): void {
    this.fileInput.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] || null;

    this.fileError = null;

    if (!file) {
      this.clearFileAndPreview();
      return;
    }

    if (!file.name.toLowerCase().endsWith('.gpx')) {
      this.fileError = 'El archivo debe ser un GPX válido (.gpx).';
      this.clearFileAndPreview(false);
      return;
    }

    this.selectedFile = file;

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const text = reader.result as string;
        this.parseGpxAndBuildPreview(text);
      } catch (err) {
        console.error(err);
        this.fileError = 'No se ha podido leer el archivo GPX.';
        this.clearFileAndPreview(false);
      }
    };

    reader.onerror = () => {
      this.fileError = 'Error leyendo el archivo GPX.';
      this.clearFileAndPreview(false);
    };

    reader.readAsText(file);
  }

  clearFileAndPreview(clearFileInput: boolean = true): void {
    this.selectedFile = null;
    this.previewPoints = [];
    this.isPreviewVisible = false;

    if (clearFileInput && this.fileInput?.nativeElement) {
      this.fileInput.nativeElement.value = '';
    }
  }

  onCancelFile(): void {
    this.fileError = null;
    this.clearFileAndPreview(true);
  }

  private parseGpxAndBuildPreview(gpxText: string): void {
    const parser = new DOMParser();
    const xml = parser.parseFromString(gpxText, 'application/xml');

    const trkpts = Array.from(xml.getElementsByTagName('trkpt'));

    if (!trkpts.length) {
      this.fileError = 'El archivo GPX no contiene trackpoints (trkpt).';
      this.clearFileAndPreview(false);
      return;
    }

    const points: LatLngLiteral[] = [];

    for (const trkpt of trkpts) {
      const latAttr = trkpt.getAttribute('lat');
      const lonAttr = trkpt.getAttribute('lon');

      if (!latAttr || !lonAttr) continue;

      const lat = parseFloat(latAttr);
      const lng = parseFloat(lonAttr);

      if (!isNaN(lat) && !isNaN(lng)) points.push({ lat, lng });
    }

    if (points.length === 0) {
      this.fileError = 'El GPX no tiene coordenadas válidas.';
      this.clearFileAndPreview(false);
      return;
    }

    this.previewPoints = points;
    this.isPreviewVisible = true;

    setTimeout(() => this.fitMapToPreview(), 0);
  }

  // -----------------------
  // Imágenes (NORMAL)
  // -----------------------
  openImageDialog(): void {
    this.imageInput.nativeElement.click();
  }

  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files;

    this.clearImagePreviews();

    if (!files || !files.length) {
      this.selectedImages = [];
      return;
    }

    this.selectedImages = Array.from(files);

    this.imagePreviews = this.selectedImages.map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }));
  }

  onCancelImages(): void {
    this.selectedImages = [];
    this.clearImagePreviews();

    if (this.imageInput?.nativeElement) {
      this.imageInput.nativeElement.value = '';
    }
  }

  private clearImagePreviews(): void {
    this.imagePreviews.forEach((p) => URL.revokeObjectURL(p.url));
    this.imagePreviews = [];
  }

  removeImage(index: number): void {
    const preview = this.imagePreviews[index];
    if (preview) URL.revokeObjectURL(preview.url);

    this.imagePreviews.splice(index, 1);
    this.selectedImages.splice(index, 1);

    if (!this.selectedImages.length && this.imageInput?.nativeElement) {
      this.imageInput.nativeElement.value = '';
    }
  }

  // -----------------------
  // Submit NORMAL
  // -----------------------
  onSubmit(): void {
    // ✅ si estás en bulk, NO uses submit normal
    if (this.bulkMode) return;

    this.form.markAllAsTouched();
    this.fileError = null;

    if (this.form.invalid) return;

    if (!this.selectedFile) {
      this.fileError = 'Debes seleccionar un archivo GPX antes de crear el track.';
      return;
    }

    if (this.creating) return;

    const { name, description } = this.form.value;

    this.creating = true;

    this.trackService
      .createFromGpx(
        name,
        description || null,
        this.selectedFile,
        this.selectedImages
      )
      .subscribe({
        next: (res) => {
          this.form.reset();
          this.clearFileAndPreview(true);
          this.onCancelImages();

          this.creating = false;
          this.router.navigate(['/dashboard/track', res.id]);
        },
        error: (err) => {
          //console.error('Error creando track', err.error.message);
          this.fileError = err.error.message || 'Error creando el track.';
          this.creating = false;
        },
      });
  }
}
