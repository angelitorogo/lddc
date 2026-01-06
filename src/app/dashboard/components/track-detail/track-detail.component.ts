import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  AfterViewInit,
  HostListener,
} from '@angular/core';
import { ActivatedRoute, Router, RouterStateSnapshot } from '@angular/router';
import { TracksService } from '../../services/track.service';
import {
  DetailResponse,
  ElevationProfile,
  TrackPoint,
  WaypointPatchDto,
} from '../../../shared/responses/detail.response';
import { environment } from '../../../../environments/environment';

import Chart from 'chart.js/auto';
import { ChartOptions } from 'chart.js';

import { GoogleMap } from '@angular/google-maps';
import { Track } from '../../../shared/models/track.model';
import { finalize, Subscription } from 'rxjs';
import { AuthService } from '../../../auth/services/auth.service';

import { Waypoint, WaypointType } from '../../../shared/responses/detail.response';
import { UpdateUserResponse } from '../../../auth/interfaces/update-user.interface';

type ModalType = 'DELETE' | 'SUCCESS';

type PoiOnProfile = {
  id: string;
  name: string;
  type: WaypointType;
  lat: number;
  lon: number;
  // “anclaje” al perfil
  index: number; // índice en elevationProfile / polylinePath
  distanceMeters: number; // X
  elevationMeters: number; // Y
};

@Component({
  selector: 'app-track-detail',
  templateUrl: './track-detail.component.html',
  styleUrl: './track-detail.component.css',
})
export class TrackDetailComponent
  implements OnInit, OnDestroy, AfterViewInit {
  private readonly baseUrl = `${environment.API_URL}/tracks`;

  private routeSub?: Subscription;

  public isMobileView = window.matchMedia('(max-width: 960px)').matches;

  private readonly onResize = () => {
    this.isMobileView = window.matchMedia('(max-width: 960px)').matches;
  };

  track: DetailResponse | null = null;

  // ====== MAPA / POLILÍNEA ======
  @ViewChild('detailMap') mapComponent?: GoogleMap;

  mapOptions: google.maps.MapOptions = {
    mapTypeId: 'satellite',
    clickableIcons: true,
    disableDefaultUI: false,
    draggable: true,
    scrollwheel: true,
    gestureHandling: 'greedy',
    disableDoubleClickZoom: true,
    keyboardShortcuts: false,
  };

  mapCenter: google.maps.LatLngLiteral | null = null;
  mapZoom = 15;

  polylinePath: google.maps.LatLngLiteral[] = [];
  polylineOptions: google.maps.PolylineOptions = {
    clickable: true,
    strokeColor: '#00e676',
    strokeOpacity: 1,
    strokeWeight: 4,
  };

  private originalBounds: google.maps.LatLngBounds | null = null;
  private originalCenter: google.maps.LatLngLiteral | null = null;
  private originalZoom: number | null = null;
  private recenterResetTimer: any = null;

  isDescriptionExpanded = false;

  @ViewChild('elevationCanvas', { static: false }) elevationCanvas!: ElementRef<HTMLCanvasElement>;
  private elevationChart?: Chart;
  private viewInitialized = false;
  elevationProfile: ElevationProfile[] = [];

  @ViewChild('profileWrap', { static: false }) profileWrap!: ElementRef<HTMLDivElement>;

  elevTooltip = {
    visible: false,
    x: 0,
    y: 0,
    distanceKm: 0,
    altitudeM: 0,
  };

  hoverMapPoint: google.maps.LatLngLiteral | null = null;

  hoverMarkerOptions: google.maps.MarkerOptions = {
    clickable: true,
    draggable: false,
    zIndex: 9999,
    optimized: true,
    icon: this.buildHoverMarkerIcon(),
  };

  private cumulativeDistancesMeters: number[] = [];

  @ViewChild('tooltipUpEl', { static: false }) tooltipUpEl?: ElementRef<HTMLDivElement>;

  @ViewChild('tooltipDownEl', { static: false }) tooltipDownEl?: ElementRef<HTMLDivElement>;

  public pendiente?: string;

  nearbyTracks: any[] = [];
  isLoadingNearby = false;
  nearbyError: string | null = null;

  isGalleryOpen = false;
  galleryIndex = 0;

  private touchStartX: number | null = null;
  private touchCurrentX: number | null = null;
  private scrollYBeforeGallery = 0;

  private scrollLocked = false;
  private lockedEls: Array<{
    el: HTMLElement;
    prevOverflow: string;
    prevOverscroll: string;
  }> = [];

  // ===== POIs (solo markers) =====
  poiMarkers: Array<{
    id: string;
    position: google.maps.LatLngLiteral;
    options: google.maps.MarkerOptions;
    data: Waypoint;
  }> = [];

  confirmDeleteOpen = false;
  typeModal: ModalType = 'DELETE';
  titleModal = '';
  textModal = '';

  private waypointToDelete: { trackId: string; waypointId: string } | null = null;

  private deleteInProgress = false;

  poiOnProfile: PoiOnProfile[] = [];
  hoverPoi: PoiOnProfile | null = null;

  private readonly POI_HOVER_THRESHOLD_INDEX = 2; // 1-3 suele ir bien

  showPois = false;

  user: UpdateUserResponse | null = null;
  avatarPreviewUrl = 'assets/images/poster-placeholder.png';

  @ViewChild('descTa', { static: false }) descTa?: ElementRef<HTMLTextAreaElement>;


  private lastHoverPolylineIdx: number | null = null;

  currentUrl!: string;

  // ✅ Modal Waypoint
  waypointModalOpen = false;
  selectedWaypoint: Waypoint | null = null;
  selectedWaypointOnProfile: PoiOnProfile | null = null;

  onHoverWayPoint: boolean = false;

  // =========================
  // Modal Waypoint
  // =========================// si lo usas como PoiOnProfile, tipa como corresponda


  isEditingWaypoint = false;
  savingWaypoint = false;
  waypointSaveError: string | null = null;

  editWp: {
    name: string;
    type: WaypointType;
    desc: string;
    cmt: string;
    lat: number | null;
    lon: number | null;
    ele: number | null;
  } = {
      name: '',
      type: 'INFORMATION',
      desc: '',
      cmt: '',
      lat: null,
      lon: null,
      ele: null,
    };


  // crear waypoint
  isAddWaypointMode = false;
  pendingWaypointLatLng: google.maps.LatLngLiteral | null = null;
  isCreatingWaypoint = false;
  isCreatingNewWaypoint = false;


  //pines inicio-final
  pinStartUrl: string = this.svgToDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24">
      <path fill="#1e8e3e" d="M12 2c-3.314 0-6 2.686-6 6 0 4.418 6 14 6 14s6-9.582 6-14c0-3.314-2.686-6-6-6z"/>
      <circle cx="12" cy="8" r="2.5" fill="#ffffff"/>
    </svg>
  `);

  pinEndUrl: string = this.svgToDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24">
      <path fill="#d93025" d="M12 2c-3.314 0-6 2.686-6 6 0 4.418 6 14 6 14s6-9.582 6-14c0-3.314-2.686-6-6-6z"/>
      <circle cx="12" cy="8" r="2.5" fill="#ffffff"/>
    </svg>
  `);

  startMarkerPos: google.maps.LatLngLiteral | null = null;
  endMarkerPos: google.maps.LatLngLiteral | null = null;

  startMarkerOptions: google.maps.MarkerOptions = {
    title: 'Inicio del track',
    clickable: false,
    zIndex: 100,
    icon: {
      url: this.pinStartUrl,
      scaledSize: new google.maps.Size(36, 36),
      anchor: new google.maps.Point(18, 36),
    },
  };

  endMarkerOptions: google.maps.MarkerOptions = {
    title: 'Fin del track',
    clickable: false,
    zIndex: 100,
    icon: {
      url: this.pinEndUrl,
      scaledSize: new google.maps.Size(36, 36),
      anchor: new google.maps.Point(18, 36),
    },
  };


  // ✅ Modal deleted Waypoint
  deleteOpenWp = false;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private trackService: TracksService,
    public authService: AuthService,
  ) { }

  // =========================================================
  // ✅ CICLO DE VIDA
  // =========================================================

  /**
   * Se ejecuta al inicializar el componente.
   * - Se suscribe al paramMap de la ruta para detectar el id del track.
   * - Cada vez que cambia, recarga el detalle del track.
   */
  ngOnInit(): void {

    this.currentUrl = this.router.url;

    this.routeSub = this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (!id) return;
      this.loadDetailTrack(id);
    });


  }

  /**
   * Se ejecuta cuando Angular ya renderizó el template (canvas/mapa disponibles).
   * - Ajusta el mapa a la polilínea si existe.
   * - Construye el gráfico del perfil si hay datos.
   * - Registra listener de resize para recalcular vista móvil/escritorio.
   */
  ngAfterViewInit(): void {
    this.viewInitialized = true;

    setTimeout(() => {
      this.fitMapToPolyline();
      if (this.hasElevationProfile()) this.buildElevationChart();
    }, 50);

    window.addEventListener('resize', this.onResize, { passive: true });
  }

  /**
   * Limpieza al destruir el componente.
   * - Elimina listeners.
   * - Desbloquea scroll (por si la galería estaba abierta).
   * - Cancela suscripción de la ruta.
   * - Destruye el chart para evitar leaks.
   */
  ngOnDestroy(): void {
    window.removeEventListener('resize', this.onResize);

    this.unlockScrollEverywhere();

    this.routeSub?.unsubscribe();
    if (this.elevationChart) {
      this.elevationChart.destroy();
      this.elevationChart = undefined;
    }
    this.elevTooltip.visible = false;
  }

  // =========================================================
  // ✅ NAVEGACIÓN
  // =========================================================

  /**
   * Navega de vuelta a la home del dashboard.
   */
  onBack(): void {
    this.router.navigate(['/dashboard/home']);
  }

  /**
   * Carga el detalle del track desde el backend.
   * Flujo principal:
   * - Resetea el chart (canvas/hover).
   * - Guarda resp en this.track.
   * - Prepara marcadores POI del mapa.
   * - Carga tracks cercanos.
   * - Construye polilínea + distancias acumuladas.
   * - Carga perfil de elevación.
   * - Vincula POIs al perfil (poiOnProfile).
   * - Reconstruye mapa + chart si la vista ya existe.
   */
  private loadDetailTrack(id: string): void {
    this.resetElevationChartHard();

    this.trackService.getTrackById(id).subscribe((resp: DetailResponse) => {
      this.track = resp;

      setTimeout(() => this.autoResizeDesc(), 0);

      this.userById(this.track);
      this.preparePoiMarkers();
      this.loadNearbyTracks();

      if (!this.track.trackPointsForFront) {
        this.track.trackPointsForFront = [];
      }

      this.preparePolylineFromTrack();
      this.loadElevationProfileFromTrack();
      this.buildPoiOnProfile();

      if (this.viewInitialized && this.hasElevationProfile()) {
        setTimeout(() => {
          if (this.elevationCanvas) this.buildElevationChart();
        }, 50);
      }

      if (this.viewInitialized) {
        setTimeout(() => {
          this.fitMapToPolyline();
          if (this.hasElevationProfile()) this.buildElevationChart();
        }, 50);
      }
    });
  }

  private userById(track: DetailResponse) {
    this.authService.getUserById(track.authorUserId).subscribe((user: UpdateUserResponse) => {
      this.user = user;
      if (this.user.image) {
        this.avatarPreviewUrl = `${environment.API_URL}/files/${user.image}?v=${user.updated_at ?? Date.now()}`;
      } else {
        this.avatarPreviewUrl = 'assets/images/poster-placeholder.png';
      }
    });
  }

  // =========================================================
  // ✅ MAPA / POLILÍNEA
  // =========================================================

  /**
   * Construye la polilínea del mapa (polylinePath) a partir de trackPointsForFront.
   * - Calcula distancias acumuladas (cumulativeDistancesMeters).
   * - Define un centro inicial aproximado (punto medio).
   */
  private preparePolylineFromTrack(): void {
    if (!this.track) {
      this.polylinePath = [];
      this.mapCenter = null;
      return;
    }

    const points: TrackPoint[] = this.track.trackPointsForFront ?? [];
    if (!points.length) {
      this.polylinePath = [];
      this.mapCenter = null;
      return;
    }

    this.polylinePath = points.map((p) => ({
      lat: p.lat,
      lng: p.lon,
    }));

    if (this.polylinePath.length) {
      this.startMarkerPos = this.polylinePath[0];
      this.endMarkerPos = this.polylinePath[this.polylinePath.length - 1];
    }

    this.buildCumulativeDistances();

    const middleIndex = Math.floor(this.polylinePath.length / 2);
    this.mapCenter = this.polylinePath[middleIndex];
  }

  /**
   * Construye la lista poiOnProfile:
   * - Para cada POI: encuentra el índice más cercano en la polilínea.
   * - Obtiene su distancia acumulada.
   * - Traduce esa distancia a un índice del elevationProfile.
   * - Guarda el POI "anclado" al perfil (x=distancia, y=elevación).
   */
  private buildPoiOnProfile(): void {
    if (!this.track?.waypoints?.length) {
      this.poiOnProfile = [];
      return;
    }
    if (!this.elevationProfile?.length) {
      this.poiOnProfile = [];
      return;
    }
    if (!this.polylinePath?.length) {
      this.poiOnProfile = [];
      return;
    }

    const MAX = 250;

    const list: PoiOnProfile[] = [];

    for (const p of this.track.waypoints.slice(0, MAX)) {
      const poiPos: google.maps.LatLngLiteral = { lat: p.lat, lng: p.lon };

      const nearestIdx = this.findNearestPolylineIndexByLatLng(poiPos);

      const n = this.elevationProfile.length;
      const m = this.polylinePath.length;

      const profIdx = Math.max(
        0,
        Math.min(n - 1, Math.round(nearestIdx * (n - 1) / (m - 1)))
      );

      const ep = this.elevationProfile[profIdx];

      if (!ep) continue;

      list.push({
        id: p.id,
        name: this.getPoiTitle(p),
        type: p.type,
        lat: p.lat,
        lon: p.lon,
        index: profIdx,
        distanceMeters: ep.distanceMeters,
        elevationMeters: ep.elevationMeters,
      });
    }

    this.poiOnProfile = list;


  }

  /**
   * Devuelve el índice del punto de la polilínea más cercano a un target lat/lng.
   * Usa Haversine punto a punto (O(n)).
   */
  private findNearestPolylineIndexByLatLng(
    target: google.maps.LatLngLiteral
  ): number {
    if (!this.polylinePath?.length) return 0;

    let bestIdx = 0;
    let best = Number.POSITIVE_INFINITY;

    for (let i = 0; i < this.polylinePath.length; i++) {
      const d = this.haversineMeters(this.polylinePath[i], target);
      if (d < best) {
        best = d;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  /**
   * Ajusta el mapa para que la polilínea entre completa (fitBounds).
   * Además guarda bounds/center/zoom iniciales para poder restaurarlos luego.
   */
  private fitMapToPolyline(): void {
    if (!this.mapComponent) return;
    if (!this.polylinePath || this.polylinePath.length === 0) return;

    const bounds = new google.maps.LatLngBounds();
    this.polylinePath.forEach((p) => bounds.extend(p));

    const PADDING: google.maps.Padding = {
      top: 20,
      bottom: 20,
      left: 20,
      right: 20,
    };
    this.mapComponent.fitBounds(bounds, PADDING);

    this.originalBounds = bounds;
    this.originalCenter = this.mapCenter;
    this.originalZoom = this.mapZoom;

    setTimeout(() => {
      const map = this.mapComponent?.googleMap;
      if (!map) return;

      const c = map.getCenter();
      if (c) this.originalCenter = { lat: c.lat(), lng: c.lng() };

      const z = map.getZoom();
      if (typeof z === 'number') this.originalZoom = z;
    }, 80);
  }

  /**
   * Construye el icono SVG del marcador de hover del mapa (halo + núcleo).
   * Se usa para hoverMapPoint.
   */
  private buildHoverMarkerIcon(): google.maps.Icon {
    const halo = 'rgba(180, 123, 245, 0.589)';
    const core = 'rgb(156, 91, 231)';
    const stroke = 'rgba(5, 16, 13, 0.95)';

    const size = 40;
    const cx = 20;
    const cy = 20;

    const haloR = 8;
    const coreR = 4.2;
    const strokeW = 1;

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <defs>
          <filter id="blur">
            <feGaussianBlur stdDeviation="1.6"/>
          </filter>
        </defs>
        <circle cx="${cx}" cy="${cy}" r="${haloR}" fill="${halo}" filter="url(#blur)" />
        <circle cx="${cx}" cy="${cy}" r="${coreR}" fill="${core}" stroke="${stroke}" stroke-width="${strokeW}" />
      </svg>
    `.trim();

    const url = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;

    return {
      url,
      scaledSize: new google.maps.Size(size, size),
      anchor: new google.maps.Point(cx, cy),
    };
  }


  private ensurePointVisibleOnMap(point: google.maps.LatLngLiteral): void {
    const map = this.mapComponent?.googleMap;
    if (!map) return;

    const latLng = new google.maps.LatLng(point.lat, point.lng);
    map.panTo(latLng);
  }


  /**
   * Restaura el encuadre original del mapa:
   * - si existe originalBounds => fitBounds (recomendado)
   * - si no => panTo originalCenter + setZoom originalZoom
   */
  private resetMapToOriginalFitBounds(): void {
    const map = this.mapComponent?.googleMap;
    if (!map) return;

    if (this.originalBounds) {
      const PADDING: google.maps.Padding = {
        top: 20,
        bottom: 20,
        left: 20,
        right: 20,
      };
      this.mapComponent?.fitBounds(this.originalBounds, PADDING);
      return;
    }

    if (this.originalCenter) map.panTo(this.originalCenter);
    if (typeof this.originalZoom === 'number') map.setZoom(this.originalZoom);
  }

  // =========================================================
  // ✅ HELPERS DE PRESENTACIÓN
  // =========================================================

  /**
   * Construye la URL de una imagen del track (endpoint /tracks/images/:id).
   */
  getUrlImage(trackImage: any): string {
    return `${this.baseUrl}/images/${trackImage.id}`;
  }

  /**
   * Devuelve el texto de dificultad en español según el enum del backend.
   */
  getDifficultyLabel(): string {
    switch (this.track?.difficulty) {
      case 'EASY':
        return 'FÁCIL';
      case 'MODERATE':
        return 'MODERADA';
      case 'HARD':
        return 'DIFÍCIL';
      default:
        return 'SIN DATOS';
    }
  }

  /**
   * Devuelve la clase CSS asociada al nivel de dificultad.
   */
  getDifficultyClass(): string {
    switch (this.track?.difficulty) {
      case 'EASY':
        return 'track-detail__difficulty--easy';
      case 'MODERATE':
        return 'track-detail__difficulty--moderate';
      case 'HARD':
        return 'track-detail__difficulty--hard';
      default:
        return '';
    }
  }

  /**
   * Devuelve la etiqueta humana del tipo de ruta (circular/ida-vuelta/lineal).
   */
  getRouteTypeLabel(): string {
    switch (this.track?.routeType) {
      case 'CIRCULAR':
        return 'Circular';
      case 'OUT_AND_BACK':
        return 'Ida y vuelta';
      case 'POINT_TO_POINT':
        return 'Lineal';
      default:
        return 'Ruta';
    }
  }

  /**
   * Formatea el tiempo total (segundos) a "X.Y h" o "Z min".
   */
  getFormattedTime(): string {
    if (!this.track?.totalTimeSeconds) return '';
    const seconds = this.track.totalTimeSeconds;
    const hours = seconds / 3600;
    if (hours >= 1) return `${hours.toFixed(1)} h`;
    const minutes = seconds / 60;
    return `${Math.round(minutes)} min`;
  }

  // =========================================================
  // ✅ DESCRIPCIÓN / ACCIONES
  // =========================================================

  /**
   * Alterna la expansión/colapso del bloque de descripción.
   */
  /*
  toggleDescription(): void {
    this.isDescriptionExpanded = !this.isDescriptionExpanded;
  }*/

  /**
   * Navega al editor del track actual.
   */
  onEditTrack(): void {

    this.authService.setRedirectUrl(this.currentUrl);

    this.router.navigate(['/dashboard/edit', this.track?.id]);
  }

  /**
   * Acción placeholder (por ahora solo log).
   */
  onDeleteTrack(): void {
    console.log('Eliminar ruta', this.track?.id);
  }

  onClickFollow(): void {
    this.authService.setRedirectUrl(this.currentUrl);

    const url = '/dashboard/tracks/' + this.track!.id + '/follow';

    this.router.navigate([url]);

  }

  // =========================================================
  // ✅ PERFIL DE ELEVACIÓN (Chart.js)
  // =========================================================

  /**
   * Resetea el gráfico del perfil de forma “dura”:
   * - Limpia hover (tooltip/marker/etc.)
   * - Destruye el chart existente
   * - Limpia el canvas
   */
  private resetElevationChartHard(): void {
    this.clearElevationHover(false);

    if (this.elevationChart) {
      this.elevationChart.destroy();
      this.elevationChart = undefined;
    }

    if (this.elevationCanvas?.nativeElement) {
      const ctx = this.elevationCanvas.nativeElement.getContext('2d');
      if (ctx)
        ctx.clearRect(
          0,
          0,
          this.elevationCanvas.nativeElement.width,
          this.elevationCanvas.nativeElement.height
        );
    }
  }

  /**
   * Indica si hay suficiente perfil para pintar un chart (mínimo 2 puntos).
   */
  hasElevationProfile(): boolean {
    return !!this.elevationProfile && this.elevationProfile.length > 1;
  }

  /**
   * Calcula límites “bonitos” para el eje Y, evitando exageraciones en tracks planos.
   * - Aplica rango mínimo (MIN_RANGE_METERS)
   * - Añade padding según gracePct (aire arriba/abajo)
   * - Redondea a múltiplos de 10
   */
  private computeNiceYBounds(
    values: number[],
    gracePct: number = 0.12
  ): { min: number; max: number } {
    const finite = values.filter((v) => Number.isFinite(v));
    if (!finite.length) return { min: 0, max: 100 };

    const realMin = Math.min(...finite);
    const realMax = Math.max(...finite);
    const realRange = Math.max(1, realMax - realMin);

    // 1) Si el track es muy plano, forzamos un rango mínimo para que no se vea exagerado
    const MIN_RANGE_METERS = 120; // ajusta: 80-150
    const baseRange = Math.max(realRange, MIN_RANGE_METERS);

    // 2) “Grace” manual (aire arriba/abajo) aplicado al rango base
    const pad = Math.max(8, baseRange * gracePct);

    // centrado en el centro real
    const mid = (realMin + realMax) / 2;
    let min = mid - baseRange / 2 - pad;
    let max = mid + baseRange / 2 + pad;

    // redondeo bonito a múltiplos de 10
    const step = 10;
    min = Math.floor(min / step) * step;
    max = Math.ceil(max / step) * step;

    if (min < 0) min = 0;

    return { min, max };
  }

  /**
   * Calcula un stepSize razonable para los ticks del eje Y, según el rango.
   * Evita tener demasiadas marcas (ticks) o una escala ilegible.
   */
  private computeYTickStep(min: number, max: number): number {
    const range = Math.max(1, max - min);
    if (range <= 80) return 10;
    if (range <= 160) return 20;
    if (range <= 300) return 50;
    if (range <= 600) return 100;
    return 200;
  }

  /**
   * Carga el elevationProfile desde el track ya descargado.
   */
  private loadElevationProfileFromTrack(): void {
    if (!this.track) return;
    this.elevationProfile = this.track.elevationProfile ?? [];
  }

  /**
   * Construye el Chart.js del perfil:
   * - Suaviza elevaciones (media móvil) para reducir “dientes” o ruido
   * - Calcula yBounds y yStep
   * - Define plugin de hover + POIs sobre la curva
   * - Configura interacción (hover/touch)
   */
  private buildElevationChart(): void {
    if (!this.elevationCanvas) return;
    if (!this.hasElevationProfile()) return;

    if (this.elevationChart) {
      this.elevationChart.destroy();
      this.elevationChart = undefined;
    }

    const ctx = this.elevationCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    // ✅ suavizado visual SOLO para el chart (no altera this.elevationProfile)
    const smoothedProfile = this.smoothElevations(this.elevationProfile, 5);

    // ✅ X numérico real (km) + Y (m)
    const series = smoothedProfile.map((p) => ({
      x: p.distanceMeters / 1000, // km
      y: p.elevationMeters,       // m
    }));

    // ✅ recorte del hueco final: max X exacto a los datos (para cualquier track)
    const maxKmRaw =
      smoothedProfile.length > 0
        ? smoothedProfile[smoothedProfile.length - 1].distanceMeters / 1000
        : 0;

    // ✅ evita que Chart “suba” al siguiente tick grande (ej: 13.2 -> 14)
    //    Lo dejamos a 1 decimal hacia abajo (se ve natural en la UI)
    const maxKm = Math.floor(maxKmRaw * 10) / 10;

    // bounds de Y
    const yValues = smoothedProfile.map((p) => p.elevationMeters);
    const gracePct = 0.10; // prueba: 0.06, 0.10, 0.15, 0.20
    const yBounds = this.computeNiceYBounds(yValues, gracePct);
    const yStep = this.computeYTickStep(yBounds.min, yBounds.max);

    const verticalLinePlugin = {
      id: 'verticalLinePlugin',
      afterDraw: (chart: any) => {
        const ctx = chart.ctx;
        const { top, bottom, left, right } = chart.chartArea;

        // ===============================
        // HOVER (línea vertical + punto morado)
        // ===============================
        const active = chart.tooltip?._active;
        if (active && active.length) {
          const activePoint = active[0];
          const x = activePoint.element.x;
          const y = activePoint.element.y;

          ctx.save();
          ctx.beginPath();
          ctx.moveTo(x, top);
          ctx.lineTo(x, bottom);
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = 'rgba(0, 230, 118, 0.8)';
          ctx.stroke();
          ctx.restore();

          ctx.save();
          ctx.beginPath();
          ctx.arc(x, y, 8, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(180, 123, 245, 0.589)';
          ctx.fill();
          ctx.restore();

          ctx.save();
          ctx.beginPath();
          ctx.arc(x, y, 4.2, 0, Math.PI * 2);
          ctx.fillStyle = 'rgb(156, 91, 231)';
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = 'rgba(5, 16, 13, 0.95)';
          ctx.stroke();
          ctx.restore();
        }

        // ===============================
        // POIs pegados a la CURVA
        // (solo si showPois = true)
        // ===============================
        if (!this.showPois || !this.poiOnProfile?.length) return;

        const meta0 = chart.getDatasetMeta(0); // dataset de la línea
        if (!meta0?.data?.length) return;

        const pois = [...this.poiOnProfile].sort((a, b) => a.index - b.index);

        ctx.save();
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const isMobile = this.isMobileView;

        // tamaños según viewport
        const baseRadius = isMobile ? 2.0 : 3.2;
        const innerRadius = isMobile ? 2.8 : 4.2;

        const badgeW = isMobile ? 0 : 18;
        const badgeH = isMobile ? 0 : 18;
        const offsetY = isMobile ? 10 : 14;
        const r = isMobile ? 4 : 5;
        const iconFontSize = isMobile ? 9 : 12; // ajusta a gusto

        for (const poi of pois) {
          const el = meta0.data[poi.index];
          if (!el) continue;

          const x = el.x;
          const y = el.y;

          // si queda fuera del área útil, no lo pintes
          if (x < left || x > right || y < top || y > bottom) continue;

          // punto base en la curva
          ctx.beginPath();
          ctx.arc(x, y, baseRadius, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(180, 123, 245, 0.95)';
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = 'rgba(5, 16, 13, 0.95)';
          ctx.stroke();

          const bx = x - badgeW / 2;
          const by = y - offsetY - badgeH / 2;

          const byClamped = Math.max(top + 6, by);

          // rect redondeado
          ctx.arc(x, y, innerRadius, 0, Math.PI * 2);
          ctx.beginPath();
          ctx.moveTo(bx + r, byClamped);
          ctx.lineTo(bx + badgeW - r, byClamped);
          ctx.quadraticCurveTo(bx + badgeW, byClamped, bx + badgeW, byClamped + r);
          ctx.lineTo(bx + badgeW, byClamped + badgeH - r);
          ctx.quadraticCurveTo(
            bx + badgeW,
            byClamped + badgeH,
            bx + badgeW - r,
            byClamped + badgeH
          );
          ctx.lineTo(bx + r, byClamped + badgeH);
          ctx.quadraticCurveTo(bx, byClamped + badgeH, bx, byClamped + badgeH - r);
          ctx.lineTo(bx, byClamped + r);
          ctx.quadraticCurveTo(bx, byClamped, bx + r, byClamped);
          ctx.closePath();

          ctx.fillStyle = 'rgba(5, 16, 13, 0.85)';
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = 'rgba(255,255,255,0.10)';
          ctx.stroke();

          ctx.fillStyle = 'rgba(255,255,255,0.92)';
          ctx.font = `${iconFontSize}px Arial`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(this.getPoiEmoji(poi.type), x, byClamped + badgeH / 2);
        }

        ctx.restore();
      },
    };

    const chartData = {
      datasets: [
        {
          label: this.isMobileView ? '' : 'Altitud (m)',
          data: series,     // ✅ [{x,y}]
          parsing: false,   // ✅ importantísimo para que use x/y
          yAxisID: 'y',
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 0,
          fill: true,
          borderColor: 'rgba(0, 230, 118, 1)',
          backgroundColor: 'rgba(0, 230, 118, 0.15)',
        },
      ],
    };

    const options: ChartOptions<'line'> = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: { enabled: false },
        legend: { display: false },
      },
      interaction: {
        mode: 'index',
        intersect: false,
      },

      /**
       * Evento hover del chart:
       * - Actualiza tooltip (distancia/altitud)
       * - Sincroniza punto en mapa
       * - Calcula pendiente
       * - Detecta POI cercano (hoverPoi)
       */


      onHover: (event: any, activeEls: any[], chart: any) => {
        if (!this.profileWrap) return;

        if (!activeEls || activeEls.length === 0) {
          this.clearElevationHover(true);
          return;
        }

        const el = activeEls[0].element;
        const x = el.x;
        const yTop = chart.chartArea.top;

        // ✅ con eje X "linear", getValueForPixel devuelve KM
        const xScale = chart.scales.x;
        const kmAtCursor = Number(xScale.getValueForPixel(x));

        // ✅ convertimos km -> índice real en elevationProfile (distanciaMeters)
        const nearestIdx = this.findNearestElevationIndexByKm(kmAtCursor);

        const p = this.elevationProfile[nearestIdx];
        if (!p) {
          this.elevTooltip.visible = false;
          return;
        }

        const canvasRect = this.elevationCanvas.nativeElement.getBoundingClientRect();
        const wrapRect = this.profileWrap.nativeElement.getBoundingClientRect();
        const xInWrap = x + (canvasRect.left - wrapRect.left);

        const tooltipY = Math.max(6, yTop - 46);

        const wrapWidth = wrapRect.width;
        const PADDING = 12;
        const clampedX = Math.max(PADDING, Math.min(wrapWidth - PADDING, xInWrap));

        this.elevTooltip.visible = true;
        this.elevTooltip.x = clampedX;
        this.elevTooltip.y = tooltipY;
        this.elevTooltip.distanceKm = p.distanceMeters / 1000;
        this.elevTooltip.altitudeM = p.elevationMeters;

        if (
          this.polylinePath &&
          this.polylinePath.length > 0 &&
          this.cumulativeDistancesMeters.length === this.polylinePath.length
        ) {
          /*
          const targetDist = p.distanceMeters;
          const nearestPolylineIdx = this.findNearestPolylineIndexByDistance(targetDist);
          this.hoverMapPoint = this.polylinePath[nearestPolylineIdx];
          this.ensurePointVisibleOnMap(this.hoverMapPoint);
          */
          const polyIdx = this.mapProfileIndexToPolylineIndex(nearestIdx);

          // ✅ Actualiza SIEMPRE el punto (marker morado) con el MISMO índice
          this.hoverMapPoint = this.polylinePath[polyIdx];

          // ✅ PAN solo si cambia el índice
          if (this.lastHoverPolylineIdx !== polyIdx) {
            this.lastHoverPolylineIdx = polyIdx;
            this.ensurePointVisibleOnMap(this.hoverMapPoint);
          }

        }

        if (this.recenterResetTimer) {
          clearTimeout(this.recenterResetTimer);
          this.recenterResetTimer = null;
        }

        this.applyHoverIndex(nearestIdx);
      },

      onClick: (event: any, activeEls: any[], chart: any) => {
        if (!activeEls || activeEls.length === 0) return;

        const el = activeEls[0].element;
        const x = el.x;

        // eje X linear -> km
        const xScale = chart.scales.x;
        const kmAtCursor = Number(xScale.getValueForPixel(x));

        // índice del perfil (punto “real” del click)
        const nearestIdx = this.findNearestElevationIndexByKm(kmAtCursor);

        // ✅ siempre pintamos línea/tooltip donde has clicado
        this.elevationChart?.setActiveElements([{ datasetIndex: 0, index: nearestIdx }]);
        // @ts-ignore
        this.elevationChart?.tooltip?.setActiveElements(
          [{ datasetIndex: 0, index: nearestIdx }],
          { x: 0, y: 0 }
        );
        this.elevationChart?.update('none');

        this.applyHoverIndex(nearestIdx);

        // =========================================================
        // 1) SI hay POIs y click cerca de uno -> abrir modal existente
        // =========================================================
        if (this.showPois && this.poiOnProfile?.length && this.track?.waypoints?.length) {
          let best: PoiOnProfile | null = null;
          let bestDiff = Number.POSITIVE_INFINITY;

          for (const poi of this.poiOnProfile) {
            const diff = Math.abs(poi.index - nearestIdx);
            if (diff < bestDiff) {
              bestDiff = diff;
              best = poi;
            }
          }

          // umbral: cuántos puntos “de distancia” aceptas
          const threshold = this.isMobileView ? 10 : 6;

          if (best && bestDiff <= threshold) {
            const wp = this.track.waypoints.find(w => w?.id === best!.id);
            if (wp) {
              // abre modal existente
              this.onWaypointMarkerClick(wp);
              return; // ✅ importante: si abrimos uno existente, no creamos
            }
          }
        }

        // =========================================================
        // 2) Si NO era un POI y estás en modo “Añadir waypoint”
        //    -> abrir modal de creación en ese punto del track
        // =========================================================
        if (!this.isAddWaypointMode) return;

        // Mapear profileIdx -> polyIdx (tú ya lo usas en hover)
        const polyIdx = this.mapProfileIndexToPolylineIndex(nearestIdx);
        const snapped = this.polylinePath?.[polyIdx];
        if (!snapped) return;

        // ele (si trackPointsForFront está alineado con polylinePath)
        let ele: number | null = null;
        let time: string | null = null;

        if (this.track?.trackPointsForFront?.length === this.polylinePath.length) {
          const tp = this.track?.trackPointsForFront[polyIdx];
          if (tp && typeof tp.ele === 'number') ele = tp.ele;
          if (tp && typeof tp.time === 'string') time = tp.time;
        }

        this.openCreateWaypointModalFromTrackPoint({
          lat: snapped.lat,
          lon: snapped.lng,
          ele,
          time,
          polyIdx,
        });
      },



      scales: {
        x: {
          type: 'linear',
          min: 0,
          max: maxKm,        // ✅ recorta el hueco final (para cualquier track)
          offset: false,
          bounds: 'data',
          grace: 0,
          title: { display: !this.isMobileView, text: 'Distancia (km)' },
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: {
            display: true,
            maxTicksLimit: this.isMobileView ? 6 : 8,
            maxRotation: 0,
            minRotation: 0,
            callback: (value: any) => {
              const km = Number(value);
              if (!Number.isFinite(km)) return '';
              return km.toFixed(1);
            },
          },
          border: { display: !this.isMobileView },
        },
        y: {
          position: 'left',
          grace: 0,
          min: yStep < 100 ? yBounds.min : this.redondearACentenaDown(yBounds.min),
          max: yStep < 100 ? yBounds.max : this.redondearACentenaDown(yBounds.max + yStep),
          title: { display: !this.isMobileView, text: 'Altitud (m)' },
          ticks: {
            stepSize: this.redondearACentenaUp(yStep),
            display: true,
            callback: (value: any, index: number, ticks: any[]) => {
              // ❌ Oculta el primer tick y el último
              if (index === 0) return '';
              if (index === ticks.length - 1) return '';
              return `${Number(value).toFixed(0)}`;
            },
          },
          border: { display: !this.isMobileView },
          grid: {
            color: 'rgba(255, 255, 255, 0.08)',
            drawTicks: !this.isMobileView,
          },
        },
      },
    };

    this.elevationChart = new Chart(ctx, {
      type: 'line',
      data: chartData as any,
      options,
      plugins: [verticalLinePlugin],
    });
  }

  /**
   * ✅ NUEVO helper: dado un km del chart (X linear), encuentra el índice más cercano
   * en this.elevationProfile (que va por distanceMeters).
   */
  private findNearestElevationIndexByKm(targetKm: number): number {
    const arr = this.elevationProfile;
    if (!arr?.length) return 0;

    const targetM = targetKm * 1000;

    let lo = 0;
    let hi = arr.length - 1;

    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      const d = arr[mid].distanceMeters ?? 0;
      if (d < targetM) lo = mid + 1;
      else hi = mid;
    }

    const i = lo;
    if (i <= 0) return 0;

    const prev = i - 1;
    const d1 = Math.abs((arr[i].distanceMeters ?? 0) - targetM);
    const d0 = Math.abs((arr[prev].distanceMeters ?? 0) - targetM);

    return d0 <= d1 ? prev : i;
  }


  /**
   * Construye el array de distancias acumuladas a lo largo de la polilínea.
   * cumulativeDistancesMeters[i] = distancia desde el inicio hasta el punto i.
   */
  private buildCumulativeDistances(): void {
    this.cumulativeDistancesMeters = [];
    if (!this.polylinePath || this.polylinePath.length === 0) return;

    let acc = 0;
    this.cumulativeDistancesMeters.push(0);

    for (let i = 1; i < this.polylinePath.length; i++) {
      acc += this.haversineMeters(this.polylinePath[i - 1], this.polylinePath[i]);
      this.cumulativeDistancesMeters.push(acc);
    }
  }

  /**
   * Suaviza elevaciones con una media móvil:
   * - Ajusta window a impar y mínimo 3.
   * - Calcula la media local para cada punto.
   * Devuelve un nuevo array con misma distancia y elevación suavizada.
   */
  private smoothElevations(
    profile: ElevationProfile[],
    window: number = 5
  ): ElevationProfile[] {
    if (!profile?.length) return [];
    if (profile.length < 3) return profile;

    let w = Math.max(3, Math.floor(window));
    if (w % 2 === 0) w += 1;

    const half = Math.floor(w / 2);

    const elevs = profile.map((p) => Number(p.elevationMeters ?? 0));

    const prefix: number[] = new Array(elevs.length + 1).fill(0);
    for (let i = 0; i < elevs.length; i++) {
      prefix[i + 1] = prefix[i] + elevs[i];
    }

    const smoothedElevs: number[] = new Array(elevs.length);

    for (let i = 0; i < elevs.length; i++) {
      const start = Math.max(0, i - half);
      const end = Math.min(elevs.length - 1, i + half);

      const sum = prefix[end + 1] - prefix[start];
      const count = end - start + 1;

      smoothedElevs[i] = sum / count;
    }

    return profile.map((p, i) => ({
      ...p,
      elevationMeters: smoothedElevs[i],
    }));
  }

  // =========================================================
  // ✅ CÁLCULOS GEO / MAPEOS
  // =========================================================

  /**
   * Distancia en metros entre dos coordenadas usando fórmula de Haversine.
   */
  private haversineMeters(
    a: google.maps.LatLngLiteral,
    b: google.maps.LatLngLiteral
  ): number {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;

    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);

    const sinDLat = Math.sin(dLat / 2);
    const sinDLng = Math.sin(dLng / 2);

    const h =
      sinDLat * sinDLat +
      Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;

    return 2 * R * Math.asin(Math.sqrt(h));
  }

  /**
   * Dada una distancia acumulada objetivo (metros),
   * devuelve el índice más cercano dentro de cumulativeDistancesMeters.
   * Implementa búsqueda binaria (O(log n)).
   */
  private findNearestPolylineIndexByDistance(targetMeters: number): number {
    const arr = this.cumulativeDistancesMeters;
    if (!arr || arr.length === 0) return 0;

    let lo = 0;
    let hi = arr.length - 1;

    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (arr[mid] < targetMeters) lo = mid + 1;
      else hi = mid;
    }

    const i = lo;
    if (i === 0) return 0;

    const prev = i - 1;
    const d1 = Math.abs(arr[i] - targetMeters);
    const d0 = Math.abs(arr[prev] - targetMeters);

    return d0 <= d1 ? prev : i;
  }

  // =========================================================
  // ✅ INTERACCIÓN PERFIL (hover / touch)
  // =========================================================

  /**
   * Se llama cuando el ratón sale del contenedor del perfil.
   * Limpia hover y reencuadra el mapa.
   */
  onProfileLeave(): void {
    this.clearElevationHover(true);
  }

  /**
   * Limpia el estado “hover” del perfil:
   * - Oculta tooltip
   * - Quita hoverMapPoint (marker)
   * - Resetea pendiente
   * - Limpia activeElements del chart
   * - (opcional) reencuadra el mapa tras pequeño delay
   * - Limpia hoverPoi
   */
  private clearElevationHover(resetMap: boolean): void {
    this.elevTooltip.visible = false;
    this.hoverMapPoint = null;
    this.lastHoverPolylineIdx = null;
    this.pendiente = undefined;

    if (this.elevationChart) {
      this.elevationChart.setActiveElements([]);
      // @ts-ignore
      this.elevationChart.tooltip?.setActiveElements([], { x: 0, y: 0 });
      this.elevationChart.update('none');
    }

    if (resetMap) {
      if (this.recenterResetTimer) clearTimeout(this.recenterResetTimer);
      this.recenterResetTimer = setTimeout(
        () => this.resetMapToOriginalFitBounds(),
        200
      );
    }

    this.hoverPoi = null;
  }

  /**
   * Manejo de interacción táctil sobre el perfil:
   * - Convierte X del dedo a índice del dataset
   * - Activa ese índice en el chart
   * - Llama a applyHoverIndex para sincronizar tooltip/mapa/POI
   */
  onProfileTouch(ev: TouchEvent): void {

    if (!this.elevationChart) return;
    if (!this.profileWrap) return;

    ev.preventDefault();

    const touch = ev.touches[0];
    if (!touch) return;

    const canvasRect = this.elevationCanvas.nativeElement.getBoundingClientRect();
    const xInCanvas = touch.clientX - canvasRect.left;

    const xScale = (this.elevationChart as any).scales?.x;
    if (!xScale) return;

    // ✅ ahora es km (por ser scale linear)
    const kmAtCursor = Number(xScale.getValueForPixel(xInCanvas));

    // ✅ convertir km -> índice real del elevationProfile
    const idx = this.findNearestElevationIndexByKm(kmAtCursor);

    this.elevationChart.setActiveElements([{ datasetIndex: 0, index: idx }]);
    // @ts-ignore
    this.elevationChart.tooltip?.setActiveElements(
      [{ datasetIndex: 0, index: idx }],
      { x: xInCanvas, y: 0 }
    );
    this.elevationChart.update('none');

    this.applyHoverIndex(idx);
  }


  /**
   * Aplica un índice “hover” de perfil y sincroniza UI:
   * - Calcula posición del tooltip (clamp a bordes)
   * - Rellena distancia/altitud
   * - Calcula pendiente local
   * - Sincroniza hoverMapPoint a la distancia equivalente
   * - Si showPois=true, detecta POI cercano y lo guarda en hoverPoi
   */
  private applyHoverIndex(idx: number): void {
    const p = this.elevationProfile[idx];
    if (!p) return;

    const chart: any = this.elevationChart;
    const el = chart.getDatasetMeta(0).data[idx];
    if (!el) return;

    const x = el.x;
    const yTop = chart.chartArea.top;

    const canvasRect = this.elevationCanvas.nativeElement.getBoundingClientRect();
    const wrapRect = this.profileWrap.nativeElement.getBoundingClientRect();
    const xInWrap = x + (canvasRect.left - wrapRect.left);

    const isMobile = this.isMobileView;
    const tooltipY = isMobile ? wrapRect.height - 44 : Math.max(6, yTop - 46);

    const wrapWidth = wrapRect.width;

    this.elevTooltip.visible = true;

    this.elevTooltip.x = this.computeStickyTooltipX(xInWrap, wrapWidth);
    this.elevTooltip.y = tooltipY;
    this.elevTooltip.distanceKm = p.distanceMeters / 1000;
    this.elevTooltip.altitudeM = p.elevationMeters;

    const slope = this.getSlopePercentAt(idx);
    if (slope !== null) this.pendiente = slope.toFixed(1);

    requestAnimationFrame(() => {
      if (!this.elevTooltip.visible) return;
      const wrapRect2 = this.profileWrap.nativeElement.getBoundingClientRect();
      this.elevTooltip.x = this.computeStickyTooltipX(xInWrap, wrapRect2.width);
    });

    if (this.polylinePath?.length) {
      const polyIdx = this.mapProfileIndexToPolylineIndex(idx);
      this.hoverMapPoint = this.polylinePath[polyIdx];
    }

    this.hoverPoi = this.showPois ? this.findHoverPoiByIndex(idx) : null;
  }

  /**
   * Devuelve el ancho actual del tooltip (el que esté visible arriba/abajo),
   * con fallback si todavía no se puede medir.
   */
  private getActiveTooltipWidth(): number {
    const fallback = 180;
    const downW = this.tooltipDownEl?.nativeElement?.offsetWidth ?? 0;
    const upW = this.tooltipUpEl?.nativeElement?.offsetWidth ?? 0;
    const w = Math.max(downW, upW);
    return w > 0 ? w : fallback;
  }

  /**
   * Calcula una X “pegajosa” para el tooltip,
   * evitando que se salga de los bordes del contenedor.
   */
  private computeStickyTooltipX(xInWrap: number, wrapWidth: number): number {
    const EDGE_MARGIN = 8;
    const tooltipWidth = this.getActiveTooltipWidth();

    let x = xInWrap;
    const leftEdge = x - tooltipWidth / 2;
    const rightEdge = x + tooltipWidth / 2;

    if (leftEdge < EDGE_MARGIN) x = tooltipWidth / 2 + EDGE_MARGIN;
    else if (rightEdge > wrapWidth - EDGE_MARGIN)
      x = wrapWidth - tooltipWidth / 2 - EDGE_MARGIN;

    return x;
  }

  /**
   * Alterna el estado showPois.
   * - Si se ocultan, limpia hoverPoi (para evitar “enganche” visual).
   * - Fuerza repaint del chart sin animación para que el plugin pinte/borre POIs ya.
   */
  togglePois(): void {
    this.showPois = !this.showPois;

    if (!this.showPois) this.hoverPoi = null;

    if (this.elevationChart) {
      this.elevationChart.update('none');
    }
  }

  // =========================================================
  // ✅ TRACKS CERCANOS
  // =========================================================

  /**
   * Carga tracks cercanos al punto inicial del track actual.
   * - Controla loading y errores.
   * - Filtra para no incluir el track actual.
   */
  private loadNearbyTracks(): void {
    if (!this.track) return;

    const first = this.track.trackPointsForFront?.[0];
    if (!first) return;

    this.isLoadingNearby = true;
    this.nearbyError = null;

    this.trackService
      .getNearbyTracks({
        lat: first.lat,
        lon: first.lon,
        radiusMeters: 500000,
        limit: 20,
        trackExcluded: this.track.id,
      })
      .subscribe({
        next: (items) => {
          this.nearbyTracks = (items ?? []).filter(
            (t) => t?.id && t.id !== this.track?.id
          );
          this.isLoadingNearby = false;
        },
        error: (err) => {
          console.error('❌ nearby error', err);
          this.nearbyTracks = [];
          this.nearbyError = 'No se han podido cargar las rutas cercanas.';
          this.isLoadingNearby = false;
        },
      });
  }

  /**
   * Navega a la vista de detalle de un track cercano.
   */
  navigateNearbyTrack(track: Track): void {
    this.router.navigate(['/dashboard/track', track.id]);
  }

  // =========================================================
  // ✅ PENDIENTE / CLASIFICACIÓN
  // =========================================================

  /**
   * Calcula pendiente (%) alrededor de un índice del perfil usando una ventana (idx-2..idx+2).
   * Esto suaviza el cálculo y reduce picos por ruido.
   */
  private getSlopePercentAt(idx: number): number | null {
    if (!this.elevationProfile || this.elevationProfile.length < 2) return null;
    if (idx < 0 || idx >= this.elevationProfile.length) return null;

    const i0 = Math.max(0, idx - 2);
    const i1 = Math.min(this.elevationProfile.length - 1, idx + 2);

    const p0 = this.elevationProfile[i0];
    const p1 = this.elevationProfile[i1];

    const d = (p1.distanceMeters ?? 0) - (p0.distanceMeters ?? 0);
    const h = (p1.elevationMeters ?? 0) - (p0.elevationMeters ?? 0);

    if (!d || d <= 0) return null;
    return (h / d) * 100;
  }

  /**
   * Devuelve una clase CSS en función de la pendiente (por tramos).
   */
  getSlopeClass(slope: number | null | undefined): string {
    if (slope == null) return 'slope--none';
    const abs = Math.abs(slope);
    if (abs < 10) return 'slope--easy';
    if (abs < 17) return 'slope--moderate';
    if (abs < 25) return 'slope--hard';
    return 'slope--extreme';
  }

  // =========================================================
  // ✅ URL / COMPARTIR
  // =========================================================

  /**
   * Construye una URL pública del track (para copiar o compartir).
   */
  private buildPublicTrackUrl(): string {
    if (!this.track?.id) return environment.DOMAIN_URL;
    return `${environment.DOMAIN_URL}/#/dashboard/track/${this.track.id}`;
  }

  /**
   * Copia el enlace al portapapeles.
   * - Usa Clipboard API si está disponible
   * - Fallback a textarea + execCommand('copy')
   */
  async onCopyLink(): Promise<void> {
    const url = this.buildPublicTrackUrl();

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        return;
      }

      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (err) {
      console.error('❌ No se pudo copiar el enlace', err);
    }
  }

  /**
   * Comparte el enlace usando Web Share API si existe; si no, copia el enlace.
   */
  /*
  async onShareLink(): Promise<void> {
    const url = this.buildPublicTrackUrl();
    const title = this.track?.name ?? 'Ruta';
    const text = 'Mira esta ruta';

    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
        return;
      }
      await this.onCopyLink();
    } catch (err) {
      console.log('ℹ️ Share cancelado o no disponible', err);
    }
  }
  */

  async onShareLink(): Promise<void> {
    const url = this.buildPublicTrackUrl();
    const title = this.track?.name ?? 'Ruta';
    const text = 'Mira esta ruta';

    try {
      // Si hay Web Share 2 (files), intentamos adjuntar portada
      const cover = this.track?.images?.[0];

      if (cover && navigator.share) {
        const coverUrl = this.trackService.getUrlImage(cover);

        // Descarga y convierte a File
        const file = await this.fetchUrlAsFile(coverUrl, 'cover.webp');

        // Solo si el navegador soporta compartir archivos
        const canShareFiles =
          typeof (navigator as any).canShare === 'function' &&
          (navigator as any).canShare({ files: [file] });

        if (canShareFiles) {
          await navigator.share({
            title,
            text,
            url,
            files: [file],
          } as any);
          return;
        }
      }

      // Fallback clásico (Web Share 1 o sin soporte de files)
      if (navigator.share) {
        await navigator.share({ title, text, url });
        return;
      }

      await this.onCopyLink();
    } catch (err) {
      console.log('ℹ️ Share cancelado o no disponible', err);
    }
  }

  /** Convierte una URL (misma origin / CORS permitido) en File para Web Share 2 */
  private async fetchUrlAsFile(fileUrl: string, filename: string): Promise<File> {
    const res = await fetch(fileUrl, { credentials: 'include' });
    if (!res.ok) throw new Error(`No se pudo descargar imagen (${res.status})`);

    const blob = await res.blob();

    // Intentar usar el mime real; si no, caer a image/webp
    const type = blob.type || 'image/webp';

    // Si el filename no coincide con mime, no pasa nada; el type manda
    return new File([blob], filename, { type });
  }


  // =========================================================
  // ✅ DESCARGA GPX
  // =========================================================

  /**
   * Lanza la descarga del GPX del track actual mediante el servicio.
   */
  onDownloadGpx(): void {
    this.trackService.downloadGpx(this.track?.id ?? '');
  }

  // =========================================================
  // ✅ GALERÍA / LIGHTBOX
  // =========================================================

  /**
   * Abre la galería (lightbox) en un índice concreto:
   * - bloquea scroll
   * - guarda posición previa
   */
  openGallery(index: number): void {
    if (!this.track?.images?.length) return;

    const max = this.track.images.length - 1;
    this.galleryIndex = Math.max(0, Math.min(max, index));

    this.isGalleryOpen = true;

    this.scrollYBeforeGallery = window.scrollY || 0;
    document.body.style.top = `-${this.scrollYBeforeGallery}px`;

    this.lockScrollEverywhere();
  }

  /**
   * Cierra la galería y restaura el scroll a la posición previa.
   */
  closeGallery(): void {
    this.isGalleryOpen = false;
    this.touchStartX = null;
    this.touchCurrentX = null;

    this.unlockScrollEverywhere();

    const y = this.scrollYBeforeGallery || 0;
    window.scrollTo(0, y);
  }

  /**
   * Indica si hay imagen anterior disponible.
   */
  hasPrevImage(): boolean {
    return !!this.track?.images?.length && this.galleryIndex > 1;
  }

  /**
   * Indica si hay imagen siguiente disponible.
   */
  hasNextImage(): boolean {
    return (
      !!this.track?.images?.length &&
      this.galleryIndex < this.track!.images.length - 1
    );
  }

  /**
   * Navega a la imagen anterior.
   */
  prevImage(): void {
    if (!this.hasPrevImage() || this.galleryIndex === 1) return;
    this.galleryIndex -= 1;
  }

  /**
   * Navega a la imagen siguiente.
   */
  nextImage(): void {
    if (!this.hasNextImage()) return;
    this.galleryIndex += 1;
  }

  /**
   * Listener de teclado para la galería:
   * - Escape cierra
   * - Flechas cambian imagen
   */
  @HostListener('document:keydown', ['$event'])
  onKeyDown(ev: KeyboardEvent): void {
    if (!this.isGalleryOpen) return;

    if (ev.key === 'Escape') return this.closeGallery();
    if (ev.key === 'ArrowLeft') return this.prevImage();
    if (ev.key === 'ArrowRight') return this.nextImage();
  }

  /**
   * Inicio de gesto táctil (swipe) en la galería:
   * guarda X inicial.
   */
  onLightboxTouchStart(ev: TouchEvent): void {
    const t = ev.touches?.[0];
    if (!t) return;
    this.touchStartX = t.clientX;
    this.touchCurrentX = t.clientX;
  }

  /**
   * Movimiento del gesto táctil:
   * actualiza X actual.
   */
  onLightboxTouchMove(ev: TouchEvent): void {
    const t = ev.touches?.[0];
    if (!t) return;
    this.touchCurrentX = t.clientX;
  }

  /**
   * Fin del gesto táctil:
   * - si delta supera el umbral => cambia imagen.
   */
  onLightboxTouchEnd(): void {
    if (this.touchStartX == null || this.touchCurrentX == null) return;

    const delta = this.touchCurrentX - this.touchStartX;
    const THRESHOLD = 40;

    if (delta > THRESHOLD) this.prevImage();
    else if (delta < -THRESHOLD) this.nextImage();

    this.touchStartX = null;
    this.touchCurrentX = null;
  }

  // =========================================================
  // ✅ BLOQUEO DE SCROLL (galería)
  // =========================================================

  /**
   * Handler para cancelar scroll (wheel/touchmove) cuando se bloquea la página.
   */
  private preventScrollHandler = (e: Event) => {
    e.preventDefault();
  };

  /**
   * Devuelve una lista de elementos que son scrollables en la página,
   * para poder bloquear los principales cuando se abre el lightbox.
   */
  private getScrollableElements(): HTMLElement[] {
    const all = Array.from(document.querySelectorAll<HTMLElement>('body *'));
    const res: HTMLElement[] = [];

    for (const el of all) {
      const style = getComputedStyle(el);
      const overflowY = style.overflowY;
      const overflowX = style.overflowX;

      const canScrollY =
        (overflowY === 'auto' || overflowY === 'scroll') &&
        el.scrollHeight > el.clientHeight + 1;
      const canScrollX =
        (overflowX === 'auto' || overflowX === 'scroll') &&
        el.scrollWidth > el.clientWidth + 1;

      if (canScrollY || canScrollX) res.push(el);
    }

    res.sort(
      (a, b) =>
        b.scrollHeight -
        b.clientHeight -
        (a.scrollHeight - a.clientHeight)
    );
    return res;
  }

  /**
   * Bloquea scroll global + de los elementos más scrollables,
   * para que el lightbox sea “modal” de verdad.
   */
  private lockScrollEverywhere(): void {
    if (this.scrollLocked) return;
    this.scrollLocked = true;

    document.documentElement.classList.add('no-scroll');
    document.body.classList.add('no-scroll');

    const scrollables = this.getScrollableElements();
    const targets = scrollables.slice(0, 2);

    this.lockedEls = targets.map((el) => {
      const prevOverflow = el.style.overflow;
      const prevOverscroll = el.style.overscrollBehavior;
      el.style.overflow = 'hidden';
      el.style.overscrollBehavior = 'none';
      return { el, prevOverflow, prevOverscroll };
    });

    document.addEventListener('wheel', this.preventScrollHandler, {
      passive: false,
    });
    document.addEventListener('touchmove', this.preventScrollHandler, {
      passive: false,
    });
  }

  /**
   * Desbloquea scroll y restaura estilos previos de los elementos bloqueados.
   */
  private unlockScrollEverywhere(): void {
    if (!this.scrollLocked) return;
    this.scrollLocked = false;

    document.documentElement.classList.remove('no-scroll');
    document.body.classList.remove('no-scroll');
    document.body.style.top = '';

    for (const item of this.lockedEls) {
      item.el.style.overflow = item.prevOverflow;
      item.el.style.overscrollBehavior = item.prevOverscroll;
    }
    this.lockedEls = [];

    document.removeEventListener('wheel', this.preventScrollHandler as any);
    document.removeEventListener('touchmove', this.preventScrollHandler as any);
  }

  // =========================================================
  // ✅ POIs (MAPA)
  // =========================================================

  /**
   * Prepara poiMarkers para el mapa:
   * - Recorta a MAX
   * - Genera iconos SVG
   * - Construye options (title, zIndex, etc.)
   */
  private preparePoiMarkers(): void {
    if (!this.track?.waypoints?.length) {
      this.poiMarkers = [];
      return;
    }

    const MAX = 250;

    this.poiMarkers = this.track.waypoints.slice(0, MAX).map((p) => {
      const icon = this.buildPoiMarkerIcon(p.type);
      const title = this.getPoiTitle(p);

      return {
        id: p.id,
        data: p,
        position: { lat: p.lat, lng: p.lon },
        options: {
          title,
          clickable: true,
          zIndex: 50,
          optimized: true,
          icon,
        },
      };
    });


  }

  /**
   * Construye un google.maps.Icon a partir del SVG según tipo POI.
   */
  private buildPoiMarkerIcon(type: WaypointType): google.maps.Icon {
    const { svg, size, anchorX, anchorY } = this.getPoiSvg(type);
    const url = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;

    return {
      url,
      scaledSize: new google.maps.Size(size, size),
      anchor: new google.maps.Point(anchorX, anchorY),
    };
  }

  /**
   * Devuelve el SVG completo del POI:
   * - color por tipo
   * - emoji en el centro
   * - anchor centrado
   */
  private getPoiSvg(type: WaypointType): {
    svg: string;
    size: number;
    anchorX: number;
    anchorY: number;
  } {
    const size = 24;
    const cx = 12;
    const cy = 12;

    const color = this.getPoiColor(type);

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 34 34">
        <defs>
          <filter id="s" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.55)"/>
          </filter>
        </defs>

        <circle cx="${cx}" cy="${cy}" r="12" fill="${color}" filter="url(#s)"/>
        <circle cx="${cx}" cy="${cy}" r="11" fill="rgba(5,16,13,0.45)"/>
        <text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="14" font-family="Arial" fill="white">
          ${this.getPoiEmoji(type)}
        </text>
      </svg>
    `.trim();

    return { svg, size, anchorX: cx, anchorY: cy };
  }

  /**
   * Color base del POI según tipo.
   */
  private getPoiColor(type: WaypointType): string {
    switch (type) {
      case 'DRINKING_WATER':
        return '#1e88e5';
      case 'VIEWPOINT':
        return '#8e24aa';
      case 'SHELTER':
        return '#43a047';
      case 'PARKING':
        return '#546e7a';
      case 'CAMP_SITE':
        return '#f9a825';
      case 'PICNIC_SITE':
        return '#fb8c00';
      case 'INFORMATION':
        return '#00acc1';
      default:
        return '#607d8b';
    }
  }

  /**
   * Emoji del POI según tipo.
   */
  private getPoiEmoji(type: WaypointType): string {
    switch (type) {
      case 'DRINKING_WATER':
        return '💧';
      case 'VIEWPOINT':
        return '👁️';
      case 'SHELTER':
        return '🛖';
      case 'PARKING':
        return '🅿️';
      case 'CAMP_SITE':
        return '⛺';
      case 'PICNIC_SITE':
        return '🧺';
      case 'INFORMATION':
        return 'ℹ️';
      default:
        return '📍';
    }
  }

  /**
   * Etiqueta humana del tipo de POI.
   */
  private getPoiTypeLabel(type: WaypointType): string {
    switch (type) {
      case 'DRINKING_WATER':
        return 'Fuente';
      case 'VIEWPOINT':
        return 'Mirador';
      case 'SHELTER':
        return 'Refugio';
      case 'PARKING':
        return 'Aparcamiento';
      case 'CAMP_SITE':
        return 'Camping';
      case 'PICNIC_SITE':
        return 'Merendero';
      case 'INFORMATION':
        return 'Información';
      default:
        return 'POI';
    }
  }

  /**
   * Título del POI:
   * - Si p.name existe => lo usa
   * - Si no => usa el label por tipo
   */
  private getPoiTitle(p: Waypoint): string {
    const base = this.getPoiTypeLabel(p.type);
    if (p.name && p.name.trim().length) return p.name.trim();
    return base;
  }

  /**
   * trackBy para ngFor de markers:
   * mejora rendimiento evitando recrear elementos por cambios menores.
   */
  trackByPoiId = (_: number, item: any) => item.id;

  // =========================================================
  // ✅ MODAL BORRADO
  // =========================================================

  /**
   * Abre el modal de confirmación de borrado del track.
   */
  openDeleteTrackModal(): void {
    if (!this.track) return;

    this.typeModal = 'DELETE';
    this.titleModal = 'Eliminar ruta';
    this.textModal =
      '¿Seguro que quieres eliminar esta ruta? Esta acción no se puede deshacer.';
    this.confirmDeleteOpen = true;
  }

  /**
   * Cancela el modal de borrado (si no hay borrado en curso).
   */
  cancelDelete(): void {
    if (this.deleteInProgress) return;
    this.confirmDeleteOpen = false;
    this.typeModal = 'DELETE';
  }

  /**
   * Confirma borrado:
   * - Llama al endpoint delete
   * - Si OK => muestra modal SUCCESS
   * - Si error => muestra mensaje de error usando el mismo modal
   */
  confirmDelete(): void {
    if (!this.track || this.deleteInProgress) return;

    this.deleteInProgress = true;

    this.trackService.deleteTrack(this.track.id).subscribe({
      next: () => {
        this.typeModal = 'SUCCESS';
        this.titleModal = 'Ruta eliminada';
        this.textModal = 'La ruta se ha eliminado correctamente.';
        this.deleteInProgress = false;
      },
      error: (err) => {
        console.error('Error al eliminar la ruta', err);
        this.typeModal = 'SUCCESS';
        this.titleModal = 'No se pudo eliminar';
        this.textModal =
          'Ha ocurrido un error al eliminar la ruta. Inténtalo de nuevo.';
        this.deleteInProgress = false;
      },
    });
  }

  /**
   * Acción al aceptar el modal “SUCCESS”.
   * Cierra modal y navega a /tracks.
   */
  successOk(): void {
    this.confirmDeleteOpen = false;
    this.router.navigate(['/tracks']);
  }

  // =========================================================
  // ✅ POI HOVER (en el perfil)
  // =========================================================

  /**
   * Busca el POI más cercano al índice del perfil actual.
   * Devuelve el POI si está dentro del umbral (POI_HOVER_THRESHOLD_INDEX).
   */
  private findHoverPoiByIndex(idx: number): PoiOnProfile | null {
    if (!this.poiOnProfile?.length) return null;

    let best: PoiOnProfile | null = null;
    let bestDelta = Number.POSITIVE_INFINITY;

    for (const poi of this.poiOnProfile) {
      const d = Math.abs(poi.index - idx);
      if (d < bestDelta) {
        bestDelta = d;
        best = poi;
      }
    }

    if (best && bestDelta <= this.POI_HOVER_THRESHOLD_INDEX) return best;
    return null;
  }

  toggleDescription(): void {
    this.isDescriptionExpanded = !this.isDescriptionExpanded;


    // al cambiar, recalculamos altura
    setTimeout(() => this.autoResizeDesc(), 0);
  }

  private autoResizeDesc(): void {
    const ta = this.descTa?.nativeElement;
    if (!ta) return;

    // 1) reset para recalcular bien
    ta.style.height = 'auto';

    // 2) altura real del contenido
    const full = ta.scrollHeight;

    // 3) si está expandido: toda la altura
    //    si está colapsado: lo dejamos en la altura por rows (CSS + wrapper recortan)
    if (this.isDescriptionExpanded) {
      ta.style.height = `${full}px`;
    } else {
      // al colapsar, volvemos a “altura natural” del rows
      // (auto + wrapper con max-height hace el recorte)
      ta.style.height = '';
    }
  }


  showProfile() {

    if (!this.authService.user) {
      this.router.navigateByUrl(`/dashboard/profile/${this.track?.authorUserId}`);
    } else {



      if (this.track?.authorUserId === this.authService.user?.id) {
        this.router.navigateByUrl('/dashboard/profile');
      } else {
        this.router.navigateByUrl(`/dashboard/profile/${this.track?.authorUserId}`);
      }


    }



  }


  redondearACentenaDown(num: number): number {
    return Math.floor(num / 100) * 100;
  }

  redondearACentenaUp(num: number): number {
    return Math.round(num / 100) * 100;
  }



  // =========================
  // Abrir modal desde marker
  // =========================
  onWaypointMarkerClick(wp: Waypoint): void {
    this.selectedWaypoint = wp;

    // ancla si quieres mostrar distancia/altitud del perfil
    this.selectedWaypointOnProfile =
      this.poiOnProfile?.find((p: any) => p.id === wp.id) ?? null;

    this.isEditingWaypoint = false;
    this.savingWaypoint = false;
    this.waypointSaveError = null;

    this.waypointModalOpen = true;

    // ✅ Pintar línea fija en el perfil al abrir modal (si existe en poiOnProfile)
    if (this.selectedWaypointOnProfile?.index != null) {
      const idx = this.selectedWaypointOnProfile.index;

      this.elevationChart?.setActiveElements([{ datasetIndex: 0, index: idx }]);
      // @ts-ignore
      this.elevationChart?.tooltip?.setActiveElements(
        [{ datasetIndex: 0, index: idx }],
        { x: 0, y: 0 }
      );
      this.elevationChart?.update('none');

      this.applyHoverIndex(idx);
    }
  }

  // =========================
  // Editar
  // =========================
  startEditWaypoint(): void {
    if (!this.selectedWaypoint) return;

    this.isEditingWaypoint = true;
    this.waypointSaveError = null;

    // ✅ copiar valores actuales al formulario
    this.editWp = {
      name: (this.selectedWaypoint.name ?? '').trim(),
      type: (this.selectedWaypoint.type ?? 'INFORMATION') as WaypointType,
      desc: (this.selectedWaypoint.desc ?? '').trim(),
      cmt: (this.selectedWaypoint.cmt ?? '').trim(),
      lat: this.selectedWaypoint.lat ?? null,
      lon: this.selectedWaypoint.lon ?? null,
      ele: this.selectedWaypoint.ele ?? null,
    };
  }

  

  cancelEditWaypoint(): void {
    this.isEditingWaypoint = false;
    this.waypointSaveError = null;
  }

  // =========================
  // Guardar (PATCH)
  // =========================
  saveWaypointEdit(): void {
    if (!this.track?.id) return;
    if (this.savingWaypoint) return;

    // En editar, necesito id real
    if (!this.isCreatingNewWaypoint && !this.selectedWaypoint?.id) return;

    // En crear, necesito lat/lon
    if (this.isCreatingNewWaypoint) {
      const hasLatLon =
        this.selectedWaypoint &&
        typeof this.selectedWaypoint.lat === 'number' &&
        typeof this.selectedWaypoint.lon === 'number';
      if (!hasLatLon) {
        this.waypointSaveError = 'No hay coordenadas para crear el waypoint.';
        return;
      }
    }

    this.savingWaypoint = true;
    this.waypointSaveError = null;

    const trackId = this.track.id;

    // ✅ payload (común)
    const dto: WaypointPatchDto = {
      name: this.editWp.name?.trim() || null,
      type: this.editWp.type,
      desc: this.editWp.desc?.trim() || null,
      cmt: this.editWp.cmt?.trim() || null,
    };

    // ✅ si estamos creando, mandamos también lat/lon (y lo que quieras en el futuro)
    if (this.isCreatingNewWaypoint) {
      dto.lat = this.selectedWaypoint!.lat;
      dto.lon = this.selectedWaypoint!.lon;
      dto.time = this.selectedWaypoint!.time?.toString();
      dto.ele = this.selectedWaypoint!.ele;
    }

    const req$ = this.isCreatingNewWaypoint
      ? this.trackService.createWaypoint(trackId, dto)
      : this.trackService.updateWaypoint(trackId, this.selectedWaypoint!.id, dto);

    req$
      .pipe(finalize(() => (this.savingWaypoint = false)))
      .subscribe({
        next: (saved: Partial<Waypoint> | null) => {
          if (!saved?.id) {
            this.waypointSaveError = 'El backend devolvió un waypoint inválido (null/sin id).';
            console.log(this.waypointSaveError, saved);
            return;
          }

          // ✅ asegurar array consistente
          if (!this.track!.waypoints) this.track!.waypoints = [];
          this.track!.waypoints = (this.track!.waypoints ?? []).filter((w): w is Waypoint => !!w);

          // ✅ upsert en la lista local
          const idx = this.track!.waypoints.findIndex((w) => w?.id === saved.id);
          if (idx >= 0) {
            this.track!.waypoints[idx] = { ...this.track!.waypoints[idx], ...saved } as Waypoint;
          } else {
            this.track!.waypoints.push(saved as Waypoint);
          }

          // ✅ actualizar seleccionado (ya con id real si era creación)
          this.selectedWaypoint = {
            ...(this.selectedWaypoint as any),
            ...(saved as any),
          };

          // ✅ reconstruye POIs del perfil y markers
          this.buildPoiOnProfile();
          this.preparePoiMarkers();

          // ✅ salir edición
          this.isEditingWaypoint = false;

          // ✅ si era creación, ya no estamos creando
          if (this.isCreatingNewWaypoint) {
            this.isCreatingNewWaypoint = false;
            //this.isAddWaypointMode = false; // si lo usas
            this.pendingWaypointLatLng = null; // si lo usas
          }

          // ✅ mantener línea fija tras rebuild (recalcula anchor)
          this.selectedWaypointOnProfile =
            this.poiOnProfile?.find((p: any) => p.id === saved.id) ?? null;

          if (this.selectedWaypointOnProfile?.index != null) {
            const pIdx = this.selectedWaypointOnProfile.index;

            this.elevationChart?.setActiveElements([{ datasetIndex: 0, index: pIdx }]);
            // @ts-ignore
            this.elevationChart?.tooltip?.setActiveElements(
              [{ datasetIndex: 0, index: pIdx }],
              { x: 0, y: 0 }
            );
            this.elevationChart?.update('none');

            this.applyHoverIndex(pIdx);
          }
        },
        error: (err) => {
          this.waypointSaveError = err?.error?.message ?? 'No se pudo guardar el waypoint';
        },
      });
  }

  // =========================
  // Cerrar modal
  // =========================
  closeWaypointModal(): void {
    this.waypointModalOpen = false;
    this.selectedWaypoint = null;
    this.selectedWaypointOnProfile = null;

    this.isEditingWaypoint = false;
    this.savingWaypoint = false;
    this.waypointSaveError = null;

    // ✅ quitar línea vertical al cerrar
    this.clearElevationHover(false);
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.waypointModalOpen) this.closeWaypointModal();
  }


  private mapProfileIndexToPolylineIndex(profileIdx: number): number {
    const n = this.elevationProfile?.length ?? 0;
    const m = this.polylinePath?.length ?? 0;

    if (n <= 1 || m <= 1) return 0;

    const i = Math.max(0, Math.min(n - 1, profileIdx));
    const j = Math.round(i * (m - 1) / (n - 1));

    return Math.max(0, Math.min(m - 1, j));
  }


  toggleAddWaypointMode(): void {
    this.isAddWaypointMode = !this.isAddWaypointMode;
    this.pendingWaypointLatLng = null;
  }

  
  onTrackPolylineClick(ev: google.maps.MapMouseEvent): void {
    // Solo si estás en modo "añadir waypoint"
    if (!this.isAddWaypointMode) return;

    const latLng = ev.latLng?.toJSON();
    if (!latLng) return;

    // 1) “Snap” al track: buscamos el punto más cercano de la polilínea
    const nearestIdx = this.findNearestPolylineIndexByLatLng({
      lat: latLng.lat,
      lng: latLng.lng,
    });

    const snapped = this.polylinePath?.[nearestIdx];
    if (!snapped) return;

    // 2) Ele: la sacamos del trackPointsForFront (si está alineado con polylinePath)
    let ele: number | null = null;
    let time: string | null = null;

    if (this.track!.trackPointsForFront.length === this.polylinePath.length) {
      const tp = this.track!.trackPointsForFront[nearestIdx];
      if (tp && typeof tp.ele === 'number') ele = tp.ele;
      if (tp && typeof tp.time === 'string') time = tp.time;
    }

    // 3) Abrir modal en modo creación usando snapped + ele
    this.openCreateWaypointModalFromTrackPoint({
      lat: snapped.lat,
      lon: snapped.lng,
      ele,
      time,
      polyIdx: nearestIdx,
    });
  }
  


  openCreateWaypointModalFromTrackPoint(p: {
    lat: number;
    lon: number;
    ele: number | null;
    time: string | null;
    polyIdx: number;
  }): void {
    this.isCreatingNewWaypoint = true;

    // mock seleccionado (sin id real todavía)
    this.selectedWaypoint = {
      id: 'NEW',
      created_at: new Date(),
      updated_at: new Date(),
      trackId: this.track!.id,
      type: 'INFORMATION',
      name: null,
      desc: null,
      cmt: null,
      time: p.time,
      ele: p.ele,
      lat: p.lat,
      lon: p.lon,
      distanceFromStart: null,
      gpxIndex: null,
    };

    // form state (incluye lat/lon/ele readonly)
    this.editWp = {
      name: '',
      type: 'INFORMATION',
      desc: '',
      cmt: '',
      lat: p.lat,
      lon: p.lon,
      ele: p.ele,
    };

    this.waypointModalOpen = true;
    this.isEditingWaypoint = true;
    this.waypointSaveError = null;

    // ✅ pinta línea del perfil en esa posición (mapeo polyIdx -> profileIdx)
    const profIdx = this.mapPolylineIndexToProfileIndex(p.polyIdx);

    if (profIdx != null) {
      this.elevationChart?.setActiveElements([{ datasetIndex: 0, index: profIdx }]);
      // @ts-ignore
      this.elevationChart?.tooltip?.setActiveElements(
        [{ datasetIndex: 0, index: profIdx }],
        { x: 0, y: 0 }
      );
      this.elevationChart?.update('none');

      this.applyHoverIndex(profIdx);
    }
  }

  private mapPolylineIndexToProfileIndex(polyIdx: number): number | null {
    if (!this.cumulativeDistancesMeters?.length) return null;
    if (!this.elevationProfile?.length) return null;

    const distMeters = this.cumulativeDistancesMeters[polyIdx];
    if (typeof distMeters !== 'number') return null;

    const km = distMeters / 1000;

    return this.findNearestElevationIndexByKm(km);
  }


  private svgToDataUrl(svg: string): string {
    const cleaned = svg.replace(/\n/g, '').replace(/\s+/g, ' ').trim();
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(cleaned)}`;
  }

  removeWaypoint(trackId: string, waypointId: string): void {

    this.trackService.deleteWaypoint(trackId, waypointId).subscribe({
      next: () => {

        // 1) quítalo del array local para no recargar
        this.track!.waypoints = this.track!.waypoints.filter((w: any) => w.id !== waypointId);
        // reconstruye POIs del perfil y markers
        this.buildPoiOnProfile();
        this.preparePoiMarkers();
        // 2) Cambiar modal a SUCCESS
        this.deleteOpenWp = true;
          
      },
      error: (err) => {
        console.error(err)
      },
    });
  }

  successOkWp():void {
    this.deleteOpenWp = false;
    this.closeWaypointModal()
  }

}
