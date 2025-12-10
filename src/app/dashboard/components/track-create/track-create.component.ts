// src/app/dashboard/components/track-create/track-create.component.ts

import {
  Component,
  ElementRef,
  ViewChild,
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { GoogleMap } from '@angular/google-maps';
import { Router } from '@angular/router';

interface LatLngLiteral {
  lat: number;
  lng: number;
}

@Component({
  selector: 'app-track-create',
  templateUrl: './track-create.component.html',
  styleUrls: ['./track-create.component.css'],
})
export class TrackCreateComponent {
  @ViewChild('fileInput', { static: false })
  fileInput!: ElementRef<HTMLInputElement>;

  @ViewChild(GoogleMap)
  mapComponent?: GoogleMap;

  form: FormGroup;

  selectedFile: File | null = null;

  previewPoints: LatLngLiteral[] = [];

  isPreviewVisible = false;

  fileError: string | null = null;

  mapOptions: google.maps.MapOptions = {
    center: { lat: 40.4168, lng: -3.7038 },
    zoom: 8,
    mapTypeId: 'terrain',
    disableDefaultUI: false,
  };

  polylineOptions: google.maps.PolylineOptions = {
    strokeColor: '#00e676',
    strokeOpacity: 1,
    strokeWeight: 4,
  };

  private mapInstance?: google.maps.Map;

  constructor(private fb: FormBuilder, private router: Router) {
    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(120)]],
      description: ['', [Validators.maxLength(5000)]],
    });
  }

  onMapReady(map: google.maps.Map): void {
    this.mapInstance = map;
    this.fitMapToPreview();
  }

  private fitMapToPreview(): void {
    if (!this.mapInstance || this.previewPoints.length === 0) {
      return;
    }

    const bounds = new google.maps.LatLngBounds();

    this.previewPoints.forEach((p) => {
      bounds.extend(p);
    });

    this.mapInstance.fitBounds(bounds);
  }

  onBack(): void {
    this.router.navigate(['/home']);
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

      if (!isNaN(lat) && !isNaN(lng)) {
        points.push({ lat, lng });
      }
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

  onSubmit(): void {
    this.form.markAllAsTouched();
    this.fileError = null;

    if (this.form.invalid) {
      return;
    }

    if (!this.selectedFile) {
      this.fileError = 'Debes seleccionar un archivo GPX antes de crear el track.';
      return;
    }

    const { name, description } = this.form.value;

    // Aquí prepararías el FormData o payload real
    console.log('Crear track (preview):', {
      name,
      description,
      fileName: this.selectedFile.name,
      pointsCount: this.previewPoints.length,
    });

    // TODO: llamada al servicio HTTP que suba el GPX + datos al backend.
  }
}
