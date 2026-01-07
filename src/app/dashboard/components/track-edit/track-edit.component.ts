import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { TracksService } from '../../services/track.service';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../auth/services/auth.service';

@Component({
  selector: 'app-track-edit',
  templateUrl: './track-edit.component.html',
  styleUrl: './track-edit.component.css',
})
export class TrackEditComponent implements OnInit, OnDestroy {
  private readonly baseUrl = `${environment.API_URL}/tracks`;
  private routeSub?: Subscription;

  trackId: string | null = null;

  // campos editables
  name = '';
  description = '';

  // estado
  error: string | null = null;
  isSaving = false;

  // imágenes existentes (del servidor)
  track: any = null;
  editableExistingImages: any[] = [];
  deletingImageIds = new Set<string>();

  // modal confirm delete
  confirmDeleteOpen = false;
  typeModal: 'DELETE' | 'SUCCESS' = 'DELETE';
  titleModal = '';
  textModal = '';
  private pendingDeleteImageId: string | null = null;

  // imágenes nuevas (local)
  @ViewChild('imageInput') imageInput?: ElementRef<HTMLInputElement>;

  selectedImages: File[] = [];
  imagePreviews: Array<{ file: File; url: string }> = [];

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private trackService: TracksService,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.routeSub = this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (!id) return;

      this.trackId = id;
      this.loadTrackForEdit(id);
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();

    // limpiar objectURLs para evitar leaks
    this.imagePreviews.forEach(p => URL.revokeObjectURL(p.url));
    this.imagePreviews = [];
  }

  // =========================
  // navegación
  // =========================
  onBack(): void {
    const redirectFromGuard = this.authService.consumeRedirectUrl();
    const redirectTo = redirectFromGuard || '/dashboard/home';

    this.router.navigateByUrl(redirectTo);
  }

  onCancel(): void {
    this.onBack();
  }

  // =========================
  // carga inicial
  // =========================
  private loadTrackForEdit(id: string): void {
    this.error = null;

    this.trackService.getTrackById(id).subscribe({
      next: (resp: any) => {
        this.track = resp;

        this.name = resp?.name ?? '';
        this.description = resp?.description ?? '';

        // ✅ no mostrar ni permitir borrar imagen índice 0 (mapa)
        const imgs: any[] = Array.isArray(resp?.images) ? resp.images : [];
        this.editableExistingImages = imgs.length > 1 ? imgs.slice(1) : [];
      },
      error: (err) => {
        console.error(err);
        this.error = 'No se ha podido cargar la ruta para editar.';
      }
    });
  }

  // =========================
  // helpers
  // =========================
  getUrlImage(trackImage: any): string {
    return `${this.baseUrl}/images/general/${trackImage.id}`;
  }

  // =========================
  // imágenes nuevas (igual que create)
  // =========================
  openImageDialog(): void {
    this.imageInput?.nativeElement?.click();
  }

  onImageSelected(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];

    // reset previews anteriores
    this.imagePreviews.forEach(p => URL.revokeObjectURL(p.url));
    this.imagePreviews = [];

    this.selectedImages = files;

    this.imagePreviews = files.map(file => ({
      file,
      url: URL.createObjectURL(file),
    }));
  }

  onCancelImages(): void {
    this.selectedImages = [];

    this.imagePreviews.forEach(p => URL.revokeObjectURL(p.url));
    this.imagePreviews = [];

    if (this.imageInput?.nativeElement) {
      this.imageInput.nativeElement.value = '';
    }
  }

  removeImage(index: number): void {
    if (index < 0 || index >= this.selectedImages.length) return;

    const removed = this.imagePreviews[index];
    if (removed?.url) URL.revokeObjectURL(removed.url);

    this.selectedImages.splice(index, 1);
    this.imagePreviews.splice(index, 1);

    // si se queda vacío, limpiamos el input para poder re-seleccionar las mismas
    if (!this.selectedImages.length && this.imageInput?.nativeElement) {
      this.imageInput.nativeElement.value = '';
    }
  }

  // =========================
  // borrar imagen existente (server) con modal
  // =========================
  requestDeleteExistingImage(imageId: string | null, type: 'DELETE' | 'SUCCESS' = 'DELETE', title: string = 'Eliminar imagen',  text: string = '¿Seguro que quieres eliminar esta imagen? Esta acción no se puede deshacer.'): void {
    this.pendingDeleteImageId = imageId;
    this.typeModal = type;
    this.titleModal = title;
    this.textModal = text;
    this.confirmDeleteOpen = true;
  }

  successOk(): void {
    this.confirmDeleteOpen = false;
  }

  cancelDelete(): void {
    this.confirmDeleteOpen = false;
    this.pendingDeleteImageId = null;
  }

  confirmDelete(): void {
    const imageId = this.pendingDeleteImageId;
    if (!imageId || !this.trackId) return;

    this.confirmDeleteOpen = false;
    this.pendingDeleteImageId = null;

    this.deletingImageIds.add(imageId);

    this.trackService.deleteTrackImage(this.trackId, imageId).subscribe({
      next: () => {
        // quita del array local
        this.editableExistingImages = this.editableExistingImages.filter(i => i.id !== imageId);
        this.deletingImageIds.delete(imageId);
      },
      error: (err) => {
        console.error(err);
        this.deletingImageIds.delete(imageId);
        this.error = 'No se ha podido eliminar la imagen.';
      }
    });
  }

  // =========================
  // guardar cambios (PATCH)
  // =========================
  onSave(): void {
    if (!this.trackId) return;

    this.isSaving = true;
    this.error = null;

    this.trackService.updateTrack(this.trackId, {
      name: this.name,
      description: this.description},
      this.selectedImages
    ).subscribe({
      next: (res) => {

        if(res.ok) {
          this.requestDeleteExistingImage(null, 'SUCCESS', 'Cambios guardados', 'Los cambios se han guardado correctamente.');
        }

        this.isSaving = false;

        // tras guardar, limpiamos selección local
        this.onCancelImages();

        // recargar para refrescar imágenes server (y re-aplicar slice(1))
        this.loadTrackForEdit(this.trackId!);
      },
      error: (err) => {
        console.error(err);
        this.isSaving = false;
        this.error = 'No se han podido guardar los cambios.';
      }
    });
  }
  
}
