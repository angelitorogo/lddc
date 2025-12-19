import { AfterViewInit, Component, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { GoogleMap } from '@angular/google-maps';
import { Subject, debounceTime, finalize } from 'rxjs';

import {
  ViewportDensity,
  ViewportTrackItem,
  ViewportTracksResponse,
} from '../../../shared/interfaces/viewport.interfaces';

import { TracksService } from '../../services/track.service';

@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.css'],
})
export class MapComponent implements AfterViewInit {
  @ViewChild(GoogleMap) googleMap!: GoogleMap;

  // UI estado
  loading = false;
  error = '';
  total = 0;
  density: ViewportDensity | null = null;
  lastResponse: ViewportTracksResponse | null = null;

  // límite y estado de aviso
  readonly MAX_MARKERS_WHEN_HIGH = 50;
  showingCount = 0;
  showHighDensityWarning = false;

  // lista para el panel derecho (cards)
  viewportTracks: ViewportTrackItem[] = [];

  // Config mapa
  center: google.maps.LatLngLiteral = { lat: 40.4168, lng: -3.7038 }; // Madrid
  zoom = 11;

  options: google.maps.MapOptions = {
    mapTypeId: 'hybrid',
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    clickableIcons: false,
    gestureHandling: 'greedy',
    disableDefaultUI: false,
    draggable: true,
    scrollwheel: true,
    disableDoubleClickZoom: true,
    keyboardShortcuts: false,
  };

  // ✅ Base markers (normales)
  markers: Array<{
    position: google.maps.LatLngLiteral;
    title: string;
    trackId: string;
    track: ViewportTrackItem;
  }> = [];

  // ✅ Hover marker (solo 1, se pinta después para quedar encima)
  hoveredMarkers: Array<{
    position: google.maps.LatLngLiteral;
    title: string;
    trackId: string;
    track: ViewportTrackItem;
  }> = [];

  private readonly viewportChanged$ = new Subject<void>();

  // Anti-duplicados (dragend -> idle, zoom_changed -> idle)
  private lastTriggerAt = 0;

  // Guardamos listeners (opcional)
  private nativeListeners: google.maps.MapsEventListener[] = [];

  private wheelTimeout: any = null;
  private lastWheelDirection: 'IN' | 'OUT' | null = null;

  // =========================
  // Hover sync (cards -> marker)
  // =========================
  hoveredTrackId: string | null = null;

  // Pin estilo Google (misma forma, solo cambia el color)
  readonly pinNormalUrl: string = this.svgToDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24">
      <path fill="#d93025" d="M12 2c-3.314 0-6 2.686-6 6 0 4.418 6 14 6 14s6-9.582 6-14c0-3.314-2.686-6-6-6z"/>
      <circle cx="12" cy="8" r="2.5" fill="#ffffff"/>
    </svg>
  `);

  readonly pinHoverUrl: string = this.svgToDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24">
      <path fill="#f5c400" d="M12 2c-3.314 0-6 2.686-6 6 0 4.418 6 14 6 14s6-9.582 6-14c0-3.314-2.686-6-6-6z"/>
      <circle cx="12" cy="8" r="2.5" fill="#111a16"/>
    </svg>
  `);

  // ✅ Icono hover como DATA URL (string), compatible con map-marker
  // (Círculo blanco con borde oscuro; puedes cambiarlo luego)
  readonly hoverIconUrl: string = this.svgToDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30">
      <circle cx="15" cy="15" r="9" fill="#ffffff" stroke="#111a16" stroke-width="3"/>
    </svg>
  `);

  constructor(
    private readonly tracksService: TracksService,
    private readonly router: Router
  ) {}

  ngAfterViewInit(): void {
    this.viewportChanged$
      .pipe(debounceTime(250))
      .subscribe(() => this.loadViewport());

    queueMicrotask(() => {
      this.attachNativeMapListeners();
      this.viewportChanged$.next(); // primera carga
    });
  }

  // =========================
  // Eventos (template)
  // =========================

  onIdle(): void {
    this.triggerViewportRefresh();
  }

  onDragEnd(): void {
    this.triggerViewportRefresh();
  }

  refresh(): void {
    this.viewportChanged$.next();
  }

  recenterMadrid(): void {
    this.center = { lat: 40.4168, lng: -3.7038 };
    this.zoom = 11;
    queueMicrotask(() => this.viewportChanged$.next());
  }

  // =========================
  // Listeners nativos (zoom/pan fiables)
  // =========================

  private attachNativeMapListeners(): void {
    const map = this.googleMap?.googleMap;
    if (!map) return;

    for (const l of this.nativeListeners) l.remove();
    this.nativeListeners = [];

    this.nativeListeners.push(
      map.addListener('zoom_changed', () => this.triggerViewportRefresh())
    );

    this.nativeListeners.push(
      map.addListener('dragend', () => this.triggerViewportRefresh())
    );
  }

  private triggerViewportRefresh(): void {
    const now = Date.now();
    if (now - this.lastTriggerAt < 300) return;
    this.lastTriggerAt = now;
    this.viewportChanged$.next();
  }

  // =========================
  // Carga de viewport
  // =========================

  private loadViewport(): void {
    const map = this.googleMap?.googleMap;
    if (!map) return;

    const bounds = map.getBounds();
    if (!bounds) return;

    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();

    const minLat = sw.lat();
    const maxLat = ne.lat();
    const minLng = sw.lng();
    const maxLng = ne.lng();
    const zoomLevel = map.getZoom() ?? this.zoom;

    this.loading = true;
    this.error = '';

    this.tracksService
      .getTracksInViewport({ minLat, maxLat, minLng, maxLng, zoomLevel })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (res) => {
          this.lastResponse = res;
          this.total = res.total;
          this.density = res.density;

          this.viewportTracks = res.items ?? [];

          // Render base markers (con limitación)
          this.renderMarkers(res.items);

          // ✅ Mantén coherente el hover si el track ya no está visible
          this.syncHoveredMarkerAfterRefresh();
        },
        error: (err) => {
          this.error =
            err?.error?.message ||
            err?.message ||
            'No se pudieron cargar las rutas del mapa.';
          this.lastResponse = null;
          this.total = 0;
          this.density = null;

          this.markers = [];
          this.hoveredMarkers = [];
          this.viewportTracks = [];

          this.showHighDensityWarning = false;
          this.showingCount = 0;

          this.hoveredTrackId = null;
        },
      });
  }

  private renderMarkers(items: ViewportTrackItem[]): void {
    this.showHighDensityWarning = false;
    this.showingCount = 0;

    let visibleItems = items;

    if (this.density === 'HIGH' && items.length > this.MAX_MARKERS_WHEN_HIGH) {
      visibleItems = items.slice(0, this.MAX_MARKERS_WHEN_HIGH);
      this.showHighDensityWarning = true;
    }

    this.markers = visibleItems
      .map((t) => {
        const lat = Number(t.startLat);
        const lng = Number(t.startLon);
        if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

        return {
          position: { lat, lng },
          title: t.name || 'Ruta',
          trackId: t.id,
          track: t,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    this.showingCount = this.markers.length;
  }

  // =========================
  // Hover logic
  // =========================

  onCardEnter(trackId: string): void {
    this.hoveredTrackId = trackId;
    this.rebuildHoveredMarkers();
  }

  onCardLeave(trackId: string): void {
    if (this.hoveredTrackId === trackId) {
      this.hoveredTrackId = null;
      this.hoveredMarkers = [];
    }
  }

  private rebuildHoveredMarkers(): void {
    if (!this.hoveredTrackId) {
      this.hoveredMarkers = [];
      return;
    }

    // Buscamos el marker base correspondiente
    const found = this.markers.find((m) => m.trackId === this.hoveredTrackId);
    if (!found) {
      this.hoveredMarkers = [];
      return;
    }

    // Dibujamos solo ese marker en una "capa" aparte (se renderiza después)
    this.hoveredMarkers = [found];
  }

  private syncHoveredMarkerAfterRefresh(): void {
    if (!this.hoveredTrackId) return;
    const stillExists = this.markers.some((m) => m.trackId === this.hoveredTrackId);
    if (!stillExists) {
      this.hoveredTrackId = null;
      this.hoveredMarkers = [];
      return;
    }
    this.rebuildHoveredMarkers();
  }

  // =========================
  // Navegación / util
  // =========================

  onMarkerClick(m: (typeof this.markers)[number]): void {
    this.router.navigate(['/dashboard/track', m.trackId]);
  }

  trackById(_index: number, t: ViewportTrackItem): string {
    return t.id;
  }

  trackByMarkerId(_index: number, m: { trackId: string }): string {
    return m.trackId;
  }

  get densityLabel(): string {
    if (!this.density) return '—';
    if (this.density === 'LOW') return 'Baja';
    if (this.density === 'MEDIUM') return 'Media';
    return 'Alta';
  }

  onMouseWheel(event: WheelEvent): void {
    if (event.deltaY < 0) this.lastWheelDirection = 'IN';
    else if (event.deltaY > 0) this.lastWheelDirection = 'OUT';

    if (this.wheelTimeout) clearTimeout(this.wheelTimeout);

    this.wheelTimeout = setTimeout(() => {
      if (this.lastWheelDirection === 'IN') this.triggerViewportRefresh();
      else if (this.lastWheelDirection === 'OUT') this.triggerViewportRefresh();

      this.lastWheelDirection = null;
      this.wheelTimeout = null;
    }, 300);
  }

  // Convierte SVG -> data URL (para icon string)
  private svgToDataUrl(svg: string): string {
    const cleaned = svg
      .replace(/\n/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(cleaned)}`;
  }

  getMarkerIconFor(trackId: string): string | undefined {
    if (this.hoveredTrackId === trackId) {
      return this.hoverIconUrl; // el SVG dorado/blanco/lo que quieras
    }
    return undefined; // marker normal de Google
  }

  onMarkerMouseOver(trackId: string): void {
    this.hoveredTrackId = trackId;
    this.scrollCardIntoView(trackId);
  }


  onMarkerMouseOut(trackId: string): void {
    if (this.hoveredTrackId === trackId) {
      this.hoveredTrackId = null;
    }
  }
  

  scrollCardIntoView(trackId: string): void {
    const el = document.getElementById(`track-card-${trackId}`);
    if (!el) return;

    el.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    });
  }

 
}
