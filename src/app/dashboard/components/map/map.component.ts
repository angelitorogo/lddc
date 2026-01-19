import { AfterViewInit, Component, OnDestroy, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { GoogleMap } from '@angular/google-maps';
import {
  Subject,
  Subscription,
  catchError,
  debounceTime,
  finalize,
  from,
  map,
  mergeMap,
  of,
  toArray,
} from 'rxjs';

import {
  ViewportDensity,
  ViewportTrackItem,
  ViewportTracksResponse,
} from '../../../shared/interfaces/viewport.interfaces';

import { TracksService } from '../../services/track.service';
import { GeolocationService } from '../../services/otros/location.service';
import { Track } from '../../../shared/models/track.model';
import { CookiePreferencesService } from '../../services/otros/cookie-preferences.service';

@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.css'],
})
export class MapComponent implements AfterViewInit, OnDestroy {
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

  private lastTriggerAt = 0;
  private nativeListeners: google.maps.MapsEventListener[] = [];

  private wheelTimeout: any = null;
  private lastWheelDirection: 'IN' | 'OUT' | null = null;

  // =========================
  // Hover sync (cards -> marker)
  // =========================
  hoveredTrackId: string | null = null;

  hoverPolylinePath: google.maps.LatLngLiteral[] = [];

  hoverPolylineOptions: google.maps.PolylineOptions = {
    strokeColor: '#FFee00',
    strokeOpacity: 0.95,
    strokeWeight: 3,
    zIndex: 999,
  };

  private hoverPolylineCache = new Map<string, google.maps.LatLngLiteral[]>();
  private hoverLoadTimer: any = null;

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

  readonly hoverIconUrl: string = this.svgToDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30">
      <circle cx="15" cy="15" r="9" fill="#ffffff" stroke="#111a16" stroke-width="5"/>
    </svg>
  `);

  // =========================
  // Viewport polylines
  // =========================
  showViewportPolylines = false;

  viewportPolylines: Array<{ trackId: string; path: google.maps.LatLngLiteral[] }> = [];

  viewportPolylineOptions: google.maps.PolylineOptions = {
    strokeColor: '#00e676',
    strokeOpacity: 0.8,
    strokeWeight: 2,
    zIndex: 50,
  };

  private polylineCache = new Map<string, google.maps.LatLngLiteral[]>();
  private polylineReqToken = 0;

  // =========================
  // My location (Google-like blue dot)
  // =========================
  isMyLocationEnabled = false;

  myLocation: google.maps.LatLngLiteral | null = null;

  myAccuracy: number | null = null;

  myBlueDotIcon: google.maps.Symbol = {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: '#1a73e8',
    fillOpacity: 1,
    strokeColor: '#ffffff',
    strokeOpacity: 1,
    strokeWeight: 1,
    scale: 5,
  };

  myAccuracyCircleOptions: google.maps.CircleOptions = {
    strokeOpacity: 0,
    fillColor: '#1a73e8',
    fillOpacity: 0.18,
    zIndex: 10,
  };

  private userMovedMap = false;

  distanceToStart: number | null = null;

  // ✅ subs para limpiar
  private sub = new Subscription();

  isMapExpanded = false;

  private hoverClearTimer: any = null;

  constructor(
    private readonly tracksService: TracksService,
    private readonly router: Router,
    private readonly geolocationService: GeolocationService,
    public cookiePrefs: CookiePreferencesService
  ) {}

  ngAfterViewInit(): void {
    this.sub.add(
      this.viewportChanged$.pipe(debounceTime(250)).subscribe(() => this.loadViewport())
    );

    queueMicrotask(() => {
      this.attachNativeMapListeners();
      this.viewportChanged$.next();

      // ✅ Si quieres que el punto azul se active al entrar:
      this.enableMyLocationOnEnter();
    });
  }

  ngOnDestroy(): void {
    // ✅ NO parar el GPS global aquí
    this.sub.unsubscribe();

    for (const l of this.nativeListeners) l.remove();
    this.nativeListeners = [];

    this.myLocation = null;
    this.myAccuracy = null;
  }

  // =========================
  // Eventos (template)
  // =========================

  onIdle(): void {
    this.triggerViewportRefresh();
  }

  onDragEnd(): void {
    this.userMovedMap = true;
    this.triggerViewportRefresh();
    this.viewportChanged$.next();
  }

  refresh(): void {
    this.viewportChanged$.next();
  }

  recenter(): void {
    const target = this.myLocation
      ? { lat: this.myLocation.lat, lng: this.myLocation.lng }
      : { lat: 40.4168, lng: -3.7038 };

    const targetZoom = this.myLocation ? 13 : 11;

    this.center = target;
    this.zoom = targetZoom;

    const map = this.googleMap?.googleMap;
    if (map) {
      map.panTo(target);
      // map.setZoom(targetZoom);
    }

    queueMicrotask(() => this.viewportChanged$.next());
  }

  // =========================
  // Listeners nativos
  // =========================

  private attachNativeMapListeners(): void {
    const map = this.googleMap?.googleMap;
    if (!map) return;

    for (const l of this.nativeListeners) l.remove();
    this.nativeListeners = [];

    this.nativeListeners.push(map.addListener('zoom_changed', () => this.triggerViewportRefresh()));
    this.nativeListeners.push(map.addListener('dragend', () => this.triggerViewportRefresh()));
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

          console.log(res)

          this.lastResponse = res;
          this.total = res.total;
          this.density = res.density;

          this.viewportTracks = res.items ?? [];

          this.sortViewportTracksByDistance();

          this.renderMarkers(res.items);

          this.syncHoveredMarkerAfterRefresh();
        },
        error: (err) => {
          this.error =
            err?.error?.message || err?.message || 'No se pudieron cargar las rutas del mapa.';
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

    console.log(visibleItems)

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

    
    if (this.showViewportPolylines) {
      this.loadViewportPolylines();
    }
    
  }

  // =========================
  // Hover logic
  // =========================

  onCardEnter(trackId: string): void {
    this.hoveredTrackId = trackId;
    this.loadHoverPolyline(trackId);
    this.rebuildHoveredMarkers();
  }

  onCardLeave(trackId: string): void {
    if (this.hoveredTrackId === trackId) {
      this.hoveredTrackId = null;
      this.hoveredMarkers = [];
      this.loadHoverPolyline(null);
    }
  }

  private rebuildHoveredMarkers(): void {
    if (!this.hoveredTrackId) {
      this.hoveredMarkers = [];
      return;
    }

    const found = this.markers.find((m) => m.trackId === this.hoveredTrackId);
    if (!found) {
      this.hoveredMarkers = [];
      return;
    }

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
    this.userMovedMap = true;
    if (event.deltaY < 0) this.lastWheelDirection = 'IN';
    else if (event.deltaY > 0) this.lastWheelDirection = 'OUT';

    if (this.wheelTimeout) clearTimeout(this.wheelTimeout);

    this.wheelTimeout = setTimeout(() => {
      this.triggerViewportRefresh();
      this.lastWheelDirection = null;
      this.wheelTimeout = null;
    }, 300);
  }

  private svgToDataUrl(svg: string): string {
    const cleaned = svg.replace(/\n/g, '').replace(/\s+/g, ' ').trim();
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(cleaned)}`;
  }

  getMarkerIconFor(trackId: string): string | undefined {
    if (this.hoveredTrackId === trackId) return this.hoverIconUrl;
    return undefined;
  }

  onMarkerMouseOver(trackId: string): void {
    // Cancelar limpieza pendiente
    if (this.hoverClearTimer) {
      clearTimeout(this.hoverClearTimer);
      this.hoverClearTimer = null;
    }

    this.hoveredTrackId = trackId;

    this.bumpTrackToTop(trackId);
    this.loadHoverPolyline(trackId);
    this.scrollCardIntoView(trackId);
    this.rebuildHoveredMarkers();
  }

  onMarkerMouseOut(trackId: string): void {
    this.scheduleHoverClear(trackId);
  }

  scrollCardIntoView(trackId: string): void {
    const el = document.getElementById(`track-card-${trackId}`);
    if (!el) return;

    el.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    });
  }

  private buildPolylineFromDetail(detail: any): google.maps.LatLngLiteral[] {
    const pts = detail?.trackPointsForFront ?? [];
    if (!Array.isArray(pts) || pts.length < 2) return [];
    return pts.map((p: any) => ({ lat: p.lat, lng: p.lon }));
  }

  private loadHoverPolyline(trackId: string | null): void {
    if (!trackId) {
      this.hoverPolylinePath = [];
      return;
    }

    const cached = this.hoverPolylineCache.get(trackId);
    if (cached?.length) {
      this.hoverPolylinePath = cached;
      return;
    }

    if (this.hoverLoadTimer) clearTimeout(this.hoverLoadTimer);

    this.hoverLoadTimer = setTimeout(() => {
      this.tracksService.getTrackById(trackId, { forMap: true, maxPoints: 300 }).subscribe({
        next: (detail: any) => {
          if (this.hoveredTrackId !== trackId) return;

          const path = this.buildPolylineFromDetail(detail);
          this.hoverPolylineCache.set(trackId, path);
          this.hoverPolylinePath = path;
        },
        error: () => {
          if (this.hoveredTrackId === trackId) this.hoverPolylinePath = [];
        },
      });
    }, 120);
  }

  // =========================
  // Toggle viewport polylines
  // =========================

  toggleViewportPolylines(ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    this.showViewportPolylines = checked;

    if (!checked) {
      this.viewportPolylines = [];
      return;
    }

    this.loadViewportPolylines();
  }

  private loadViewportPolylines(): void {
    const token = ++this.polylineReqToken;

    // ❌ Antes: todas las rutas del viewport
    // const ids = (this.viewportTracks ?? [])
    //   .map((t: any) => t?.id)
    //   .filter(Boolean) as string[];

    // ✅ Después: solo las rutas que realmente tienen marcador en el mapa
    const ids = (this.markers ?? [])
      .map((m) => m.trackId)
      .filter(Boolean);

    if (ids.length === 0) {
      this.viewportPolylines = [];
      return;
    }

    const initial: Array<{ trackId: string; path: google.maps.LatLngLiteral[] }> = [];
    const missing: string[] = [];

    for (const id of ids) {
      const cached = this.polylineCache.get(id);
      if (cached && cached.length > 1) initial.push({ trackId: id, path: cached });
      else missing.push(id);
    }

    this.viewportPolylines = initial;

    const concurrency = 3;

    from(missing)
      .pipe(
        mergeMap(
          (id) =>
            this.tracksService.getTrackById(id, { forMap: true, maxPoints: 300 }).pipe(
              map((detail: any) => {
                //console.log(detail)
                const pts = detail?.trackPointsForFront ?? [];
                const path = Array.isArray(pts)
                  ? pts.map((p: any) => ({ lat: p.lat, lng: p.lon }))
                  : [];
                return { id, path };
              }),
              catchError(() => of({ id, path: [] as google.maps.LatLngLiteral[] }))
            ),
          concurrency
        ),
        toArray()
      )
      .subscribe((results) => {
        if (token !== this.polylineReqToken) return;
        if (!this.showViewportPolylines) return;

        for (const r of results) {
          if (r.path.length > 1) this.polylineCache.set(r.id, r.path);
        }

        this.viewportPolylines = ids
          .map((id) => {
            const path = this.polylineCache.get(id) ?? [];
            return { trackId: id, path };
          })
          .filter((x) => x.path.length > 1);
      });
  }

  trackByPolylineId = (_: number, item: { trackId: string }) => item.trackId;

  // =========================
  // My location (centralizado con location$)
  // =========================

  private enableMyLocationOnEnter(): void {
    // Si quieres que al entrar aparezca el punto azul:
    this.isMyLocationEnabled = true;

    this.sub.add(
      this.geolocationService.location$.subscribe((p) => {
        if (!this.isMyLocationEnabled) return;
        if (!p) return;

        this.myLocation = { lat: p.lat, lng: p.lng };

        // halo solo si viene de GPS
        this.myAccuracy =
          p.source === 'gps' && typeof p.accuracy === 'number'
            ? Math.max(30, Math.round(p.accuracy))
            : null;

        this.sortViewportTracksByDistance();

        if (!this.userMovedMap) {
          this.center = this.myLocation;
          this.zoom = Math.max(this.zoom, 13);
          queueMicrotask(() => this.viewportChanged$.next());
        }
      })
    );
  }

  toggleMyLocation(): void {
    this.isMyLocationEnabled = !this.isMyLocationEnabled;

    if (!this.isMyLocationEnabled) {
      this.myLocation = null;
      this.myAccuracy = null;
      return;
    }

    // si se vuelve a activar, usa el último snapshot si existe (sin esperar al próximo tick)
    const snap = this.geolocationService.snapshot;
    if (snap) {
      this.myLocation = { lat: snap.lat, lng: snap.lng };
      this.myAccuracy =
        snap.source === 'gps' && typeof snap.accuracy === 'number'
          ? Math.max(30, Math.round(snap.accuracy))
          : null;

      if (!this.userMovedMap) {
        this.center = this.myLocation;
        this.zoom = Math.max(this.zoom, 13);
        queueMicrotask(() => this.viewportChanged$.next());
      }
    }

    this.sortViewportTracksByDistance();
  }

  // =========================
  // Distancias
  // =========================

  private distanceMeters(a: google.maps.LatLngLiteral, b: google.maps.LatLngLiteral): number {
    const R = 6371000;
    const toRad = (deg: number) => (deg * Math.PI) / 180;

    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);

    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);

    const sinDLat = Math.sin(dLat / 2);
    const sinDLng = Math.sin(dLng / 2);

    const h =
      sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * (sinDLng * sinDLng);

    const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    return R * c;
  }

  getDistanceToTrackStartMeters(track: { startLat: any; startLon: any }): number | null {
    if (!this.myLocation) return null;

    const lat = Number(track.startLat);
    const lng = Number(track.startLon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

    return this.distanceMeters(this.myLocation, { lat, lng });
  }

  formatDistance(meters: number | null): number | null {
    if (meters === null) return null;
    if (meters < 1000) return Math.round(meters) / 1000;
    return Math.round((meters / 1000) * 10) / 10;
  }

  getViewportTracksWithDistance(): Array<{ track: any; distanceMeters: number | null }> {
    const list = (this.viewportTracks ?? []).map((t: any) => ({
      track: t,
      distanceMeters: this.getDistanceToTrackStartMeters(t),
    }));

    if (!this.myLocation) return list;

    return list.sort((a, b) => {
      const da = a.distanceMeters ?? Number.POSITIVE_INFINITY;
      const db = b.distanceMeters ?? Number.POSITIVE_INFINITY;
      return da - db;
    });
  }

  private sortViewportTracksByDistance(): void {
    if (!this.myLocation) return;
    if (!Array.isArray(this.viewportTracks) || this.viewportTracks.length === 0) return;

    const list = [...this.viewportTracks];

    list.sort((a: any, b: any) => {
      const da = this.getDistanceToTrackStartMeters(a);
      const db = this.getDistanceToTrackStartMeters(b);

      const A = da ?? Number.POSITIVE_INFINITY;
      const B = db ?? Number.POSITIVE_INFINITY;

      return A - B;
    });

    this.viewportTracks = list;
  }

  toggleMapExpanded(): void {
    this.isMapExpanded = !this.isMapExpanded;

    // al cambiar el layout, el mapa necesita "resize" para renderizar bien
    queueMicrotask(() => {
      google.maps.event.trigger(this.googleMap.googleMap!, 'resize');

      // opcional: re-centrar ligeramente para evitar “mapa gris”
      /*
      const map = this.googleMap?.googleMap;
      if (map) {
        map.panTo(this.center);
      }
        */
    });
  }


   onOpenDetailFromMap(track: Track) {
    if (!track?.id) return;

    this.router.navigate(['/dashboard/track', track.id]);
  }


  toggleViewportPolylinesButton(): void {
    if (!this.viewportTracks || this.viewportTracks.length === 0) return;

    this.showViewportPolylines = !this.showViewportPolylines;

    if (!this.showViewportPolylines) {
      this.viewportPolylines = [];
      return;
    }

    this.loadViewportPolylines();
  }

  onViewportPolylineClick(trackId: string): void {
    if (!trackId) return;

    // Reutilizamos la misma lógica que cuando pasas el ratón por encima de un marcador
    this.onMarkerMouseOver(trackId);
  }

  onViewportPolylineEnter(trackId: string): void {
    if (!trackId) return;

    // Cancelar limpieza pendiente
    if (this.hoverClearTimer) {
      clearTimeout(this.hoverClearTimer);
      this.hoverClearTimer = null;
    }

    this.hoveredTrackId = trackId;

    this.bumpTrackToTop(trackId);
    this.loadHoverPolyline(trackId);
    this.scrollCardIntoView(trackId);
    this.rebuildHoveredMarkers();
  }

  onViewportPolylineLeave(trackId: string): void {
    this.scheduleHoverClear(trackId);
  }

  private bumpTrackToTop(trackId: string): void {
    if (!this.viewportTracks || this.viewportTracks.length === 0) return;

    const index = this.viewportTracks.findIndex((t: any) => t.id === trackId);
    if (index <= 0) return; // ya está el primero o no existe

    const [item] = this.viewportTracks.splice(index, 1);

    // reasignar para que Angular detecte el cambio
    this.viewportTracks = [item, ...this.viewportTracks];
  }


  private scheduleHoverClear(trackId: string): void {
    if (this.hoverClearTimer) {
      clearTimeout(this.hoverClearTimer);
      this.hoverClearTimer = null;
    }

    this.hoverClearTimer = setTimeout(() => {
      // Solo limpiar si seguimos en ese mismo track
      if (this.hoveredTrackId === trackId) {
        this.hoveredTrackId = null;
        this.hoverPolylinePath = [];
        this.hoveredMarkers = [];
      }
      this.hoverClearTimer = null;
    }, 120); // puedes ajustar 80–150ms según te guste
  }



}
