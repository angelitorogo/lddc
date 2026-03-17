import { Component } from '@angular/core';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-downloads',
  templateUrl: './downloads.component.html',
  styleUrl: './downloads.component.css'
})
export class DownloadsComponent {

  /**
   * URL de descarga directa de la app Android.
   * Ahora mismo apunta a /files/download/app/1.0 en tu backend.
   */
  readonly appDownloadUrl = `${environment.API_URL}/files/download/app/1.0`;

  /**
   * Capturas de pantalla de la app.
   * Están en assets/images/capture_1.jpeg ... capture_4.jpeg
   */
  readonly screenshots = [
    { src: 'assets/images/capture_1.jpeg', alt: 'Pantalla de listado de rutas en la app' },
    { src: 'assets/images/capture_2.jpeg', alt: 'Detalle de una ruta en la app' },
    { src: 'assets/images/capture_3.jpeg', alt: 'Mapa y track en la app' },
    { src: 'assets/images/capture_4.jpeg', alt: 'Perfil de elevación y datos de ruta' }
  ];

  /**
   * Control del modal de ayuda de instalación.
   */
  showInstallModal = false;

  /**
   * Control de la galería de capturas (lightbox).
   */
  isGalleryOpen = false;
  galleryIndex = 0;

  // ========================
  // Modal instalación APK
  // ========================

  openInstallModal(): void {
    this.showInstallModal = true;
  }

  closeInstallModal(): void {
    this.showInstallModal = false;
  }

  // ========================
  // Galería de capturas
  // ========================

  openGallery(index: number): void {
    if (!this.screenshots.length) {
      return;
    }
    this.galleryIndex = index;
    this.isGalleryOpen = true;
  }

  closeGallery(): void {
    this.isGalleryOpen = false;
  }

  hasPrevImage(): boolean {
    return this.galleryIndex > 0;
  }

  hasNextImage(): boolean {
    return this.galleryIndex < this.screenshots.length - 1;
  }

  prevImage(): void {
    if (this.hasPrevImage()) {
      this.galleryIndex--;
    }
  }

  nextImage(): void {
    if (this.hasNextImage()) {
      this.galleryIndex++;
    }
  }
}
