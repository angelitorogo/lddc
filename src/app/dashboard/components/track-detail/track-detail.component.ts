import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  AfterViewInit,
  HostListener,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TracksService } from '../../services/track.service';
import { DetailResponse, ElevationProfile, TrackPoint } from '../../../shared/responses/detail.response';
import { environment } from '../../../../environments/environment';

import Chart from 'chart.js/auto';
import { ChartOptions } from 'chart.js';

import { GoogleMap } from '@angular/google-maps';
import { Track } from '../../../shared/models/track.model';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../auth/services/auth.service';

import { Poi, PoiType } from '../../../shared/responses/detail.response';

type ModalType = 'DELETE' | 'SUCCESS';
type PoiOnProfile = {
  id: string;
  name: string;
  type: PoiType;
  lat: number;
  lon: number;
  // “anclaje” al perfil
  index: number;            // índice en elevationProfile / polylinePath
  distanceMeters: number;   // X
  elevationMeters: number;  // Y
};




@Component({
  selector: 'app-track-detail',
  templateUrl: './track-detail.component.html',
  styleUrl: './track-detail.component.css',
})
export class TrackDetailComponent implements OnInit, OnDestroy, AfterViewInit {
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
    disableDefaultUI: false,
    draggable: true,
    scrollwheel: true,
    disableDoubleClickZoom: true,
    keyboardShortcuts: false,
  };

  mapCenter: google.maps.LatLngLiteral | null = null;
  mapZoom = 15;

  polylinePath: google.maps.LatLngLiteral[] = [];
  polylineOptions: google.maps.PolylineOptions = {
    strokeColor: '#00e676',
    strokeOpacity: 1,
    strokeWeight: 4,
  };

  private originalBounds: google.maps.LatLngBounds | null = null;
  private originalCenter: google.maps.LatLngLiteral | null = null;
  private originalZoom: number | null = null;
  private recenterResetTimer: any = null;

  isDescriptionExpanded = false;

  @ViewChild('elevationCanvas', { static: false })
  elevationCanvas!: ElementRef<HTMLCanvasElement>;
  private elevationChart?: Chart;
  private viewInitialized = false;
  elevationProfile: ElevationProfile[] = [];

  @ViewChild('profileWrap', { static: false })
  profileWrap!: ElementRef<HTMLDivElement>;

  elevTooltip = {
    visible: false,
    x: 0,
    y: 0,
    distanceKm: 0,
    altitudeM: 0,
  };

  hoverMapPoint: google.maps.LatLngLiteral | null = null;

  hoverMarkerOptions: google.maps.MarkerOptions = {
    clickable: false,
    draggable: false,
    zIndex: 9999,
    optimized: true,
    icon: this.buildHoverMarkerIcon(),
  };

  private cumulativeDistancesMeters: number[] = [];

  @ViewChild('tooltipUpEl', { static: false })
  tooltipUpEl?: ElementRef<HTMLDivElement>;

  @ViewChild('tooltipDownEl', { static: false })
  tooltipDownEl?: ElementRef<HTMLDivElement>;

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
  private lockedEls: Array<{ el: HTMLElement; prevOverflow: string; prevOverscroll: string }> = [];

  // ===== POIs (solo markers) =====
  poiMarkers: Array<{
    id: string;
    position: google.maps.LatLngLiteral;
    options: google.maps.MarkerOptions;
    data: Poi;
  }> = [];

  confirmDeleteOpen = false;
  typeModal: ModalType = 'DELETE';
  titleModal = '';
  textModal = '';

  private deleteInProgress = false;

  poiOnProfile: PoiOnProfile[] = [];
  hoverPoi: PoiOnProfile | null = null;

  private readonly POI_HOVER_THRESHOLD_INDEX = 2; // 1-3 suele ir bien

  showPois = false;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private trackService: TracksService,
    public authService: AuthService
  ) { }

  // ========== CICLO DE VIDA ==========
  ngOnInit(): void {
    this.routeSub = this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (!id) return;
      this.loadDetailTrack(id);
    });
  }

  ngAfterViewInit(): void {
    this.viewInitialized = true;

    setTimeout(() => {
      this.fitMapToPolyline();
      if (this.hasElevationProfile()) this.buildElevationChart();
    }, 50);

    window.addEventListener('resize', this.onResize, { passive: true });
  }

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

  // ========== NAVEGACIÓN ==========
  onBack(): void {
    this.router.navigate(['/dashboard/home']);
  }

  private loadDetailTrack(id: string): void {
    this.resetElevationChartHard();

    this.trackService.getTrackById(id).subscribe((resp: DetailResponse) => {
      this.track = resp;

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

  // ========= MAPA / POLILÍNEA =========
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

    this.buildCumulativeDistances();

    const middleIndex = Math.floor(this.polylinePath.length / 2);
    this.mapCenter = this.polylinePath[middleIndex];
  }

  private buildPoiOnProfile(): void {
    if (!this.track?.pois?.length) {
      this.poiOnProfile = [];
      return;
    }
    if (!this.elevationProfile?.length) {
      this.poiOnProfile = [];
      return;
    }
    if (!this.polylinePath?.length || this.cumulativeDistancesMeters.length !== this.polylinePath.length) {
      this.poiOnProfile = [];
      return;
    }

    const MAX = 250;

    // Para cada POI -> buscamos el punto de la polilínea más cercano,
    // y lo convertimos en (distancia, elevación)
    const list: PoiOnProfile[] = [];

    for (const p of this.track.pois.slice(0, MAX)) {
      const poiPos: google.maps.LatLngLiteral = { lat: p.lat, lng: p.lon };

      const nearestIdx = this.findNearestPolylineIndexByLatLng(poiPos);
      const dist = this.cumulativeDistancesMeters[nearestIdx] ?? 0;

      // Elevación del perfil: tenemos distanceMeters por cada punto del perfil.
      // Como tu perfil ya lleva distanceMeters acumulada, buscamos el índice del perfil
      // más cercano a esa distancia.
      const profIdx = this.findNearestElevationIndexByDistance(dist);
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

    // Opcional: si hay varios POIs muy pegados, puedes filtrar por distancia mínima.
    // Aquí lo dejamos tal cual.
    this.poiOnProfile = list;
  }

  private findNearestPolylineIndexByLatLng(target: google.maps.LatLngLiteral): number {
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

  private findNearestElevationIndexByDistance(targetMeters: number): number {
    const arr = this.elevationProfile;
    if (!arr?.length) return 0;

    // Búsqueda binaria en elevationProfile por distanceMeters
    let lo = 0;
    let hi = arr.length - 1;

    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if ((arr[mid].distanceMeters ?? 0) < targetMeters) lo = mid + 1;
      else hi = mid;
    }

    const i = lo;
    if (i === 0) return 0;

    const prev = i - 1;
    const d1 = Math.abs((arr[i].distanceMeters ?? 0) - targetMeters);
    const d0 = Math.abs((arr[prev].distanceMeters ?? 0) - targetMeters);

    return d0 <= d1 ? prev : i;
  }


  private fitMapToPolyline(): void {
    if (!this.mapComponent) return;
    if (!this.polylinePath || this.polylinePath.length === 0) return;

    const bounds = new google.maps.LatLngBounds();
    this.polylinePath.forEach((p) => bounds.extend(p));

    const PADDING: google.maps.Padding = { top: 20, bottom: 20, left: 20, right: 20 };
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

    const bounds = map.getBounds();
    if (!bounds) return;

    const latLng = new google.maps.LatLng(point.lat, point.lng);
    if (bounds.contains(latLng)) return;

    map.panTo(latLng);
  }

  private resetMapToOriginalFitBounds(): void {
    const map = this.mapComponent?.googleMap;
    if (!map) return;

    if (this.originalBounds) {
      const PADDING: google.maps.Padding = { top: 20, bottom: 20, left: 20, right: 20 };
      this.mapComponent?.fitBounds(this.originalBounds, PADDING);
      return;
    }

    if (this.originalCenter) map.panTo(this.originalCenter);
    if (typeof this.originalZoom === 'number') map.setZoom(this.originalZoom);
  }

  // ========== HELPERS DE PRESENTACIÓN ==========
  getUrlImage(trackImage: any): string {
    return `${this.baseUrl}/images/${trackImage.id}`;
  }

  getDifficultyLabel(): string {
    switch (this.track?.difficulty) {
      case 'EASY': return 'FÁCIL';
      case 'MODERATE': return 'MODERADA';
      case 'HARD': return 'DIFÍCIL';
      default: return 'SIN DATOS';
    }
  }

  getDifficultyClass(): string {
    switch (this.track?.difficulty) {
      case 'EASY': return 'track-detail__difficulty--easy';
      case 'MODERATE': return 'track-detail__difficulty--moderate';
      case 'HARD': return 'track-detail__difficulty--hard';
      default: return '';
    }
  }

  getRouteTypeLabel(): string {
    switch (this.track?.routeType) {
      case 'CIRCULAR': return 'Circular';
      case 'OUT_AND_BACK': return 'Ida y vuelta';
      case 'POINT_TO_POINT': return 'Lineal';
      default: return 'Ruta';
    }
  }

  getFormattedTime(): string {
    if (!this.track?.totalTimeSeconds) return '';
    const seconds = this.track.totalTimeSeconds;
    const hours = seconds / 3600;
    if (hours >= 1) return `${hours.toFixed(1)} h`;
    const minutes = seconds / 60;
    return `${Math.round(minutes)} min`;
  }

  // ========== DESCRIPCIÓN ==========
  toggleDescription(): void {
    this.isDescriptionExpanded = !this.isDescriptionExpanded;
  }

  onEditTrack(): void {
    this.router.navigate(['/dashboard/edit', this.track?.id]);
  }

  onDeleteTrack(): void {
    console.log('Eliminar ruta', this.track?.id);
  }

  // ========== PERFIL DE ELEVACIÓN ==========
  private resetElevationChartHard(): void {
    this.clearElevationHover(false);

    if (this.elevationChart) {
      this.elevationChart.destroy();
      this.elevationChart = undefined;
    }

    if (this.elevationCanvas?.nativeElement) {
      const ctx = this.elevationCanvas.nativeElement.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, this.elevationCanvas.nativeElement.width, this.elevationCanvas.nativeElement.height);
    }
  }

  hasElevationProfile(): boolean {
    return !!this.elevationProfile && this.elevationProfile.length > 1;
  }

  private computeNiceYBounds(values: number[], gracePct: number = 0.12): { min: number; max: number } {
    const finite = values.filter(v => Number.isFinite(v));
    if (!finite.length) return { min: 0, max: 100 };

    const realMin = Math.min(...finite);
    const realMax = Math.max(...finite);
    const realRange = Math.max(1, realMax - realMin);

    // 1) Si el track es muy plano, forzamos un rango mínimo para que no se vea exagerado
    const MIN_RANGE_METERS = 120;          // ajusta: 80-150
    const baseRange = Math.max(realRange, MIN_RANGE_METERS);

    // 2) “Grace” manual (aire arriba/abajo) aplicado al rango base
    //    ejemplo: 0.12 => 12% de padding por arriba y por abajo
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


  private computeYTickStep(min: number, max: number): number {
    const range = Math.max(1, max - min);
    // escalado simple para que no salgan 200 ticks
    if (range <= 80) return 10;
    if (range <= 160) return 20;
    if (range <= 300) return 50;
    if (range <= 600) return 100;
    return 200;
  }


  private loadElevationProfileFromTrack(): void {
    if (!this.track) return;
    this.elevationProfile = this.track.elevationProfile ?? [];
  }

  private buildElevationChart(): void {
    if (!this.elevationCanvas) return;
    if (!this.hasElevationProfile()) return;

    if (this.elevationChart) {
      this.elevationChart.destroy();
      this.elevationChart = undefined;
    }

    const ctx = this.elevationCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    //const labels = this.elevationProfile.map(p => (p.distanceMeters / 1000).toFixed(2));
    //const data = this.elevationProfile.map(p => p.elevationMeters);

    
    const smoothedProfile = this.smoothElevations(this.elevationProfile, 5);
    const labels = smoothedProfile.map(p => (p.distanceMeters / 1000).toFixed(2));
    const data = smoothedProfile.map(p => p.elevationMeters);
    

    //const yBounds = this.computeNiceYBounds(data);
    //const yStep = this.computeYTickStep(yBounds.min, yBounds.max);

    const gracePct = 0.10; // prueba: 0.06, 0.10, 0.15, 0.20
    const yBounds = this.computeNiceYBounds(data, gracePct);
    const yStep = this.computeYTickStep(yBounds.min, yBounds.max);

    const verticalLinePlugin = {
      id: 'verticalLinePlugin',
      afterDraw: (chart: any) => {
        const ctx = chart.ctx;
        const { top, bottom, left, right } = chart.chartArea;

        // ===============================
        // HOVER (igual que lo tenías)
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
        // ===============================
        if (!this.showPois || !this.poiOnProfile?.length) return;

        const meta0 = chart.getDatasetMeta(0); // dataset de la línea
        if (!meta0?.data?.length) return;

        // orden para que quede consistente
        const pois = [...this.poiOnProfile].sort((a, b) => a.index - b.index);

        ctx.save();
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Para no “ensuciar” demasiado si hay muchos, puedes limitar
        // const MAX_DRAW = 80;
        // let drawn = 0;

        for (const poi of pois) {

          //console.log(poi.type)
          
          //if(poi.name === 'Información') return;

          const el = meta0.data[poi.index];
          if (!el) continue;

          const x = el.x;
          const y = el.y;

          // si queda fuera del área útil, no lo pintes
          if (x < left || x > right || y < top || y > bottom) continue;

          // punto base (un puntito pequeño en la curva)
          ctx.beginPath();
          ctx.arc(x, y, 3.2, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(180, 123, 245, 0.95)';
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = 'rgba(5, 16, 13, 0.95)';
          ctx.stroke();

          // chapita con emoji, cerca del punto (ligeramente arriba)
          const offsetY = 14; // separación respecto a la curva
          const badgeW = 18;
          const badgeH = 18;
          const r = 5;
          const bx = x - badgeW / 2;
          const by = (y - offsetY) - badgeH / 2;

          // clamp vertical para que no se salga por arriba
          const byClamped = Math.max(top + 6, by);

          // dibujar badge redondeado
          ctx.beginPath();
          ctx.moveTo(bx + r, byClamped);
          ctx.lineTo(bx + badgeW - r, byClamped);
          ctx.quadraticCurveTo(bx + badgeW, byClamped, bx + badgeW, byClamped + r);
          ctx.lineTo(bx + badgeW, byClamped + badgeH - r);
          ctx.quadraticCurveTo(bx + badgeW, byClamped + badgeH, bx + badgeW - r, byClamped + badgeH);
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

          // emoji dentro
          ctx.fillStyle = 'rgba(255,255,255,0.92)';
          ctx.fillText(this.getPoiEmoji(poi.type), x, byClamped + badgeH / 2);

          // drawn++;
          // if (drawn >= MAX_DRAW) break;
        }

        ctx.restore();
      },
    };

    const chartData = {
      labels,
      datasets: [
        {
          label: this.isMobileView ? '' : 'Altitud (m)',
          data,
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
      onHover: (event: any, activeEls: any[], chart: any) => {
        if (!this.profileWrap) return;

        if (!activeEls || activeEls.length === 0) {
          this.clearElevationHover(true);
          return;
        }

        const idx = activeEls[0].index;
        const p = this.elevationProfile[idx];
        if (!p) {
          this.elevTooltip.visible = false;
          return;
        }

        const el = activeEls[0].element;
        const x = el.x;
        const yTop = chart.chartArea.top;

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

        if (this.polylinePath && this.polylinePath.length > 0 && this.cumulativeDistancesMeters.length === this.polylinePath.length) {
          const targetDist = p.distanceMeters;
          const nearestIdx = this.findNearestPolylineIndexByDistance(targetDist);
          this.hoverMapPoint = this.polylinePath[nearestIdx];
          this.ensurePointVisibleOnMap(this.hoverMapPoint);
        }

        if (this.recenterResetTimer) {
          clearTimeout(this.recenterResetTimer);
          this.recenterResetTimer = null;
        }

        this.applyHoverIndex(idx);
      },

      scales: {
        x: {
          title: { display: !this.isMobileView, text: 'Distancia (km)' },
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: {
            display: true,
            maxTicksLimit: this.isMobileView ? 6 : 8,
            maxRotation: 0,
            minRotation: 0,
          },
          border: { display: !this.isMobileView },
        },
        y: {
          position: 'left',
          grace: '0%',
          min: yBounds.min,
          max: yBounds.max,
          title: { display: !this.isMobileView, text: 'Altitud (m)' },
          ticks: {
            stepSize: yStep,
            display: true,
            callback: (value) => `${value} m`,
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
      data: chartData,
      options,
      plugins: [verticalLinePlugin],
    });
  }

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

  private smoothElevations(profile: ElevationProfile[], window: number = 5): ElevationProfile[] {
    if (!profile?.length) return [];
    if (profile.length < 3) return profile;

    // ventana impar para que el punto central sea el actual
    let w = Math.max(3, Math.floor(window));
    if (w % 2 === 0) w += 1;

    const half = Math.floor(w / 2);

    // copiamos elevaciones
    const elevs = profile.map(p => Number(p.elevationMeters ?? 0));

    // prefijos para medias rápidas
    const prefix: number[] = new Array(elevs.length + 1).fill(0);
    for (let i = 0; i < elevs.length; i++) {
      prefix[i + 1] = prefix[i] + elevs[i];
    }

    const smoothedElevs: number[] = new Array(elevs.length);

    for (let i = 0; i < elevs.length; i++) {
      const start = Math.max(0, i - half);
      const end = Math.min(elevs.length - 1, i + half);

      const sum = prefix[end + 1] - prefix[start];
      const count = (end - start + 1);

      smoothedElevs[i] = sum / count;
    }

    // devolvemos nuevo perfil (misma distancia, elevación suavizada)
    return profile.map((p, i) => ({
      ...p,
      elevationMeters: smoothedElevs[i],
    }));
  }


  private haversineMeters(a: google.maps.LatLngLiteral, b: google.maps.LatLngLiteral): number {
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

  onProfileLeave(): void {
    this.clearElevationHover(true);
  }

  private clearElevationHover(resetMap: boolean): void {
    this.elevTooltip.visible = false;
    this.hoverMapPoint = null;
    this.pendiente = undefined;

    if (this.elevationChart) {
      this.elevationChart.setActiveElements([]);
      // @ts-ignore
      this.elevationChart.tooltip?.setActiveElements([], { x: 0, y: 0 });
      this.elevationChart.update('none');
    }

    if (resetMap) {
      if (this.recenterResetTimer) clearTimeout(this.recenterResetTimer);
      this.recenterResetTimer = setTimeout(() => this.resetMapToOriginalFitBounds(), 200);
    }

    this.hoverPoi = null;
  }

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

    const idxFloat = xScale.getValueForPixel(xInCanvas);
    let idx = Math.round(idxFloat);
    idx = Math.max(0, Math.min(this.elevationProfile.length - 1, idx));

    this.elevationChart.setActiveElements([{ datasetIndex: 0, index: idx }]);
    // @ts-ignore
    this.elevationChart.tooltip?.setActiveElements([{ datasetIndex: 0, index: idx }], { x: xInCanvas, y: 0 });
    this.elevationChart.update('none');

    this.applyHoverIndex(idx);
  }

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
    const tooltipY = isMobile ? (wrapRect.height - 44) : Math.max(6, yTop - 46);

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

    if (this.polylinePath?.length && this.cumulativeDistancesMeters.length === this.polylinePath.length) {
      const nearestIdx = this.findNearestPolylineIndexByDistance(p.distanceMeters);
      this.hoverMapPoint = this.polylinePath[nearestIdx];
    }

    this.hoverPoi = this.showPois ? this.findHoverPoiByIndex(idx) : null;

  }

  private getActiveTooltipWidth(): number {
    const fallback = 180;
    const downW = this.tooltipDownEl?.nativeElement?.offsetWidth ?? 0;
    const upW = this.tooltipUpEl?.nativeElement?.offsetWidth ?? 0;
    const w = Math.max(downW, upW);
    return w > 0 ? w : fallback;
  }

  private computeStickyTooltipX(xInWrap: number, wrapWidth: number): number {
    const EDGE_MARGIN = 8;
    const tooltipWidth = this.getActiveTooltipWidth();

    let x = xInWrap;
    const leftEdge = x - tooltipWidth / 2;
    const rightEdge = x + tooltipWidth / 2;

    if (leftEdge < EDGE_MARGIN) x = tooltipWidth / 2 + EDGE_MARGIN;
    else if (rightEdge > wrapWidth - EDGE_MARGIN) x = wrapWidth - tooltipWidth / 2 - EDGE_MARGIN;

    return x;
  }

  togglePois(): void {
    this.showPois = !this.showPois;

    // Al ocultar POIs, limpia el hoverPoi para que no se quede “enganchado”
    if (!this.showPois) this.hoverPoi = null;

    // Fuerza el repaint del canvas (esto hará que el plugin se ejecute ya)
    if (this.elevationChart) {
      this.elevationChart.update('none'); // 'none' = sin animación, más fluido
    }
  }

  private loadNearbyTracks(): void {
    if (!this.track) return;

    const first = this.track.trackPointsForFront?.[0];
    if (!first) return;

    this.isLoadingNearby = true;
    this.nearbyError = null;

    this.trackService.getNearbyTracks({
      lat: first.lat,
      lon: first.lon,
      radiusMeters: 50000,
      limit: 20,
      trackExcluded: this.track.id,
    }).subscribe({
      next: (items) => {
        this.nearbyTracks = (items ?? []).filter(t => t?.id && t.id !== this.track?.id);
        this.isLoadingNearby = false;
      },
      error: (err) => {
        console.error('❌ nearby error', err);
        this.nearbyTracks = [];
        this.nearbyError = 'No se han podido cargar las rutas cercanas.';
        this.isLoadingNearby = false;
      }
    });
  }

  navigateNearbyTrack(track: Track): void {
    this.router.navigate(['/dashboard/track', track.id]);
  }

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

  getSlopeClass(slope: number | null | undefined): string {
    if (slope == null) return 'slope--none';
    const abs = Math.abs(slope);
    if (abs < 10) return 'slope--easy';
    if (abs < 17) return 'slope--moderate';
    if (abs < 25) return 'slope--hard';
    return 'slope--extreme';
  }

  private buildPublicTrackUrl(): string {
    if (!this.track?.id) return environment.DOMAIN_URL;
    return `${environment.DOMAIN_URL}/dashboard/track/${this.track.id}`;
  }

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

  onDownloadGpx(): void {
    this.trackService.downloadGpx(this.track?.id ?? '');
  }

  openGallery(index: number): void {
    if (!this.track?.images?.length) return;

    const max = this.track.images.length - 1;
    this.galleryIndex = Math.max(0, Math.min(max, index));

    this.isGalleryOpen = true;

    this.scrollYBeforeGallery = window.scrollY || 0;
    document.body.style.top = `-${this.scrollYBeforeGallery}px`;

    this.lockScrollEverywhere();
  }

  closeGallery(): void {
    this.isGalleryOpen = false;
    this.touchStartX = null;
    this.touchCurrentX = null;

    this.unlockScrollEverywhere();

    const y = this.scrollYBeforeGallery || 0;
    window.scrollTo(0, y);
  }

  hasPrevImage(): boolean {
    return !!this.track?.images?.length && this.galleryIndex > 1;
  }

  hasNextImage(): boolean {
    return !!this.track?.images?.length && this.galleryIndex < (this.track!.images.length - 1);
  }

  prevImage(): void {
    if (!this.hasPrevImage() || this.galleryIndex === 1) return;
    this.galleryIndex -= 1;
  }

  nextImage(): void {
    if (!this.hasNextImage()) return;
    this.galleryIndex += 1;
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown(ev: KeyboardEvent): void {
    if (!this.isGalleryOpen) return;

    if (ev.key === 'Escape') return this.closeGallery();
    if (ev.key === 'ArrowLeft') return this.prevImage();
    if (ev.key === 'ArrowRight') return this.nextImage();
  }

  onLightboxTouchStart(ev: TouchEvent): void {
    const t = ev.touches?.[0];
    if (!t) return;
    this.touchStartX = t.clientX;
    this.touchCurrentX = t.clientX;
  }

  onLightboxTouchMove(ev: TouchEvent): void {
    const t = ev.touches?.[0];
    if (!t) return;
    this.touchCurrentX = t.clientX;
  }

  onLightboxTouchEnd(): void {
    if (this.touchStartX == null || this.touchCurrentX == null) return;

    const delta = this.touchCurrentX - this.touchStartX;
    const THRESHOLD = 40;

    if (delta > THRESHOLD) this.prevImage();
    else if (delta < -THRESHOLD) this.nextImage();

    this.touchStartX = null;
    this.touchCurrentX = null;
  }

  private preventScrollHandler = (e: Event) => {
    e.preventDefault();
  };

  private getScrollableElements(): HTMLElement[] {
    const all = Array.from(document.querySelectorAll<HTMLElement>('body *'));
    const res: HTMLElement[] = [];

    for (const el of all) {
      const style = getComputedStyle(el);
      const overflowY = style.overflowY;
      const overflowX = style.overflowX;

      const canScrollY = (overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1;
      const canScrollX = (overflowX === 'auto' || overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1;

      if (canScrollY || canScrollX) res.push(el);
    }

    res.sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight));
    return res;
  }

  private lockScrollEverywhere(): void {
    if (this.scrollLocked) return;
    this.scrollLocked = true;

    document.documentElement.classList.add('no-scroll');
    document.body.classList.add('no-scroll');

    const scrollables = this.getScrollableElements();
    const targets = scrollables.slice(0, 2);

    this.lockedEls = targets.map(el => {
      const prevOverflow = el.style.overflow;
      const prevOverscroll = el.style.overscrollBehavior;
      el.style.overflow = 'hidden';
      el.style.overscrollBehavior = 'none';
      return { el, prevOverflow, prevOverscroll };
    });

    document.addEventListener('wheel', this.preventScrollHandler, { passive: false });
    document.addEventListener('touchmove', this.preventScrollHandler, { passive: false });
  }

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

  // ===== POIs (solo markers) =====
  private preparePoiMarkers(): void {
    if (!this.track?.pois?.length) {
      this.poiMarkers = [];
      return;
    }

    const MAX = 250;

    this.poiMarkers = this.track.pois.slice(0, MAX).map((p) => {
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

  private buildPoiMarkerIcon(type: PoiType): google.maps.Icon {
    const { svg, size, anchorX, anchorY } = this.getPoiSvg(type);
    const url = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;

    return {
      url,
      scaledSize: new google.maps.Size(size, size),
      anchor: new google.maps.Point(anchorX, anchorY),
    };
  }

  private getPoiSvg(type: PoiType): { svg: string; size: number; anchorX: number; anchorY: number } {
    const size = 34;
    const cx = 17;
    const cy = 17;

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

  private getPoiColor(type: PoiType): string {
    switch (type) {
      case 'DRINKING_WATER': return '#1e88e5';
      case 'VIEWPOINT': return '#8e24aa';
      case 'SHELTER': return '#43a047';
      case 'PARKING': return '#546e7a';
      case 'CAMP_SITE': return '#f9a825';
      case 'PICNIC_SITE': return '#fb8c00';
      case 'INFORMATION': return '#00acc1';
      default: return '#607d8b';
    }
  }

  private getPoiEmoji(type: PoiType): string {
    switch (type) {
      case 'DRINKING_WATER': return '💧';
      case 'VIEWPOINT': return '👁️';
      case 'SHELTER': return '🛖';
      case 'PARKING': return '🅿️';
      case 'CAMP_SITE': return '⛺';
      case 'PICNIC_SITE': return '🧺';
      case 'INFORMATION': return 'ℹ️';
      default: return '📍';
    }
  }

  private getPoiTypeLabel(type: PoiType): string {
    switch (type) {
      case 'DRINKING_WATER': return 'Fuente';
      case 'VIEWPOINT': return 'Mirador';
      case 'SHELTER': return 'Refugio';
      case 'PARKING': return 'Aparcamiento';
      case 'CAMP_SITE': return 'Camping';
      case 'PICNIC_SITE': return 'Merendero';
      case 'INFORMATION': return 'Información';
      default: return 'POI';
    }
  }

  private getPoiTitle(p: Poi): string {
    const base = this.getPoiTypeLabel(p.type);
    if (p.name && p.name.trim().length) return p.name.trim();
    return base;
  }

  trackByPoiId = (_: number, item: any) => item.id;

  openDeleteTrackModal(): void {
    if (!this.track) return;

    this.typeModal = 'DELETE';
    this.titleModal = 'Eliminar ruta';
    this.textModal = '¿Seguro que quieres eliminar esta ruta? Esta acción no se puede deshacer.';
    this.confirmDeleteOpen = true;
  }

  cancelDelete(): void {
    if (this.deleteInProgress) return; // evita cerrar mientras borra
    this.confirmDeleteOpen = false;
    this.typeModal = 'DELETE';
  }

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
        // Si quieres, puedes reutilizar SUCCESS para mensaje de error, o crear 'ERROR'.
        this.typeModal = 'SUCCESS';
        this.titleModal = 'No se pudo eliminar';
        this.textModal = 'Ha ocurrido un error al eliminar la ruta. Inténtalo de nuevo.';
        this.deleteInProgress = false;
      }
    });
  }

  successOk(): void {
    this.confirmDeleteOpen = false;

    // Tras aceptar, navega donde te interese (lista / home)
    this.router.navigate(['/tracks']);
  }

  private findHoverPoiByIndex(idx: number): PoiOnProfile | null {
    if (!this.poiOnProfile?.length) return null;

    // buscamos el más cercano por índice
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


}
