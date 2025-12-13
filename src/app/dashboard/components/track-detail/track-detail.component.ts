import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  AfterViewInit,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TracksService } from '../../services/track.service';
import { DetailResponse, ElevationProfile, TrackPoint } from '../../../shared/responses/detail.response';
import { environment } from '../../../../environments/environment';

import Chart from 'chart.js/auto';
import {
  ChartOptions,
} from 'chart.js';

import { GoogleMap } from '@angular/google-maps';
import { Track } from '../../../shared/models/track.model';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-track-detail',
  templateUrl: './track-detail.component.html',
  styleUrl: './track-detail.component.css',
})
export class TrackDetailComponent implements OnInit, OnDestroy, AfterViewInit {
  private readonly baseUrl = `${environment.API_URL}/tracks`;

  private routeSub?: Subscription;

  track: DetailResponse | null = null;

  // ====== MAPA / POLILÍNEA ======
  @ViewChild('detailMap') mapComponent?: GoogleMap;

  mapOptions: google.maps.MapOptions = {
    mapTypeId: 'satellite',
    disableDefaultUI: true,
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

  yAutoMin?: number;
  yAutoMax?: number;

  elevTooltip = {
    visible: false,
    x: 0,          // px dentro del contenedor
    y: 0,          // px dentro del contenedor (arriba)
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

  public isMobileView = window.matchMedia('(max-width: 960px)').matches;
  
  @ViewChild('tooltipUpEl', { static: false })
  tooltipUpEl?: ElementRef<HTMLDivElement>;

  @ViewChild('tooltipDownEl', { static: false })
  tooltipDownEl?: ElementRef<HTMLDivElement>;

  public pendiente?: string;


  nearbyTracks: any[] = [];
  isLoadingNearby = false;
  nearbyError: string | null = null;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private trackService: TracksService,
  ) {}

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
    //console.log('👀 AfterViewInit, canvas:', this.elevationCanvas);

    // Puede que el track ya esté cargado; esperamos un tick para que exista el mapa
    setTimeout(() => {
      this.fitMapToPolyline();
      if (this.hasElevationProfile()) {
        this.buildElevationChart();
      }
    }, 50);

    // Si ya tenemos datos (por ejemplo en cargas muy rápidas), pintamos
    if (this.hasElevationProfile()) {
      this.buildElevationChart();
    }

    window.addEventListener('resize', () => {
      this.isMobileView = window.matchMedia('(max-width: 960px)').matches;
    }, { passive: true });

  }

  ngOnDestroy(): void {
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

  private loadDetailTrack(id: string) {

    this.resetElevationChartHard();

    this.trackService.getTrackById(id).subscribe((resp: DetailResponse) => {
      this.track = resp;
      //console.log(this.track);

      this.loadNearbyTracks();

      if (!this.track.trackPointsForFront) {
        this.track.trackPointsForFront = [];
      }

      // 🔹 polilínea para el mapa
      this.preparePolylineFromTrack();

      this.loadElevationProfileFromTrack();
      //console.log('📈 elevationProfile length:', this.elevationProfile.length);

      // Si la vista ya está lista y tenemos perfil, pintamos
      if (this.viewInitialized && this.hasElevationProfile()) {
        setTimeout(() => {
          if (this.elevationCanvas) {
            this.buildElevationChart();
          } else {
            console.error("Canvas sigue sin existir!");
          }
        }, 50);
      }

      if (this.viewInitialized) {
        // 🔹 Esperamos a que Angular pinte el <google-map>
        setTimeout(() => {
          this.fitMapToPolyline();
          if (this.hasElevationProfile()) {
            this.buildElevationChart();
          }
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

    //console.log('📌 TrackPoints para front:', points.length);

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

    // centro aproximado por si acaso antes de fitBounds
    const middleIndex = Math.floor(this.polylinePath.length / 2);
    this.mapCenter = this.polylinePath[middleIndex];

  }


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

    //console.log(bounds.toJSON())

    // 👉 usamos el wrapper de Angular
    this.mapComponent.fitBounds(bounds, PADDING);

    // ✅ Guardamos el encuadre original
    this.originalBounds = bounds;
    this.originalCenter = this.mapCenter; // aproximado; luego lo refinamos si hay mapa real
    this.originalZoom = this.mapZoom;

    // Si ya tenemos instancia real del mapa, guardamos center/zoom reales tras el fitBounds
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
    // Colores (igual que en el gráfico)
    const halo = 'rgba(180, 123, 245, 0.589)';     // glow
    const core = 'rgb(156, 91, 231)';              // punto sólido
    const stroke = 'rgba(5, 16, 13, 0.95)';        // borde oscuro

    // Medidas (en px dentro del SVG)
    const size = 40;           // canvas del icono
    const cx = 20;
    const cy = 20;

    const haloR = 8;           // como tu ctx.arc(..., 8)
    const coreR = 4.2;         // como tu ctx.arc(..., 4.2)
    const strokeW = 1;         // como tu ctx.lineWidth = 1

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

    // SVG -> data URL (robusto: encodeURIComponent)
    const url = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;

    return {
      url,
      // el tamaño visual que verá el usuario
      scaledSize: new google.maps.Size(size, size),
      // ancla en el centro exacto del SVG para que “caiga” justo en la coordenada
      anchor: new google.maps.Point(cx, cy),
    };
  }

  private ensurePointVisibleOnMap(point: google.maps.LatLngLiteral): void {
    const map = this.mapComponent?.googleMap;
    if (!map) return;

    const bounds = map.getBounds();
    if (!bounds) return;

    const latLng = new google.maps.LatLng(point.lat, point.lng);

    // ✅ si ya está visible, no hacemos nada (evita mareo)
    if (bounds.contains(latLng)) return;

    // ✅ si está fuera, centramos suave
    map.panTo(latLng);
  }

  private resetMapToOriginalFitBounds(): void {
    const map = this.mapComponent?.googleMap;
    if (!map) return;

    // Si tenemos bounds originales, mejor: vuelve al encuadre exacto
    if (this.originalBounds) {
      const PADDING: google.maps.Padding = { top: 20, bottom: 20, left: 20, right: 20 };
      this.mapComponent?.fitBounds(this.originalBounds, PADDING);
      return;
    }

    // fallback: center/zoom
    if (this.originalCenter) map.panTo(this.originalCenter);
    if (typeof this.originalZoom === 'number') map.setZoom(this.originalZoom);
  }


  // ========== HELPERS DE PRESENTACIÓN ==========

  getUrlImage(trackImage: any): string {
    return `${this.baseUrl}/images/${trackImage.id}`;
  }

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

  getFormattedTime(): string {
    if (!this.track?.totalTimeSeconds) return '';

    const seconds = this.track.totalTimeSeconds;
    const hours = seconds / 3600;

    if (hours >= 1) {
      return `${hours.toFixed(1)} h`;
    }

    const minutes = seconds / 60;
    return `${Math.round(minutes)} min`;
  }

  // ========== DESCRIPCIÓN ==========

  toggleDescription(): void {
    this.isDescriptionExpanded = !this.isDescriptionExpanded;
  }

  onEditTrack(): void {
    console.log('Editar ruta', this.track?.id);
  }

  onDeleteTrack(): void {
    console.log('Eliminar ruta', this.track?.id);
  }

  // ========== PERFIL DE ELEVACIÓN ==========

  private resetElevationChartHard(): void {
    // Limpia hover/tooltip (por si se quedó activo)
    this.clearElevationHover(false);

    // Resetea rango auto (para que no se herede entre tracks)
    this.yAutoMin = undefined;
    this.yAutoMax = undefined;

    // Destruye chart
    if (this.elevationChart) {
      this.elevationChart.destroy();
      this.elevationChart = undefined;
    }

    // Limpia canvas a pelo (evita “restos” visuales o escalas pegadas)
    if (this.elevationCanvas?.nativeElement) {
      const ctx = this.elevationCanvas.nativeElement.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, this.elevationCanvas.nativeElement.width, this.elevationCanvas.nativeElement.height);
      }
    }
  }


  hasElevationProfile(): boolean {
    return !!this.elevationProfile && this.elevationProfile.length > 1;
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

    const labels = this.elevationProfile.map(p =>
      (p.distanceMeters / 1000).toFixed(2)
    );

    const data = this.elevationProfile.map(p => p.elevationMeters);


    // 🔥 Plugin: dibuja la línea vertical como crosshair
    const verticalLinePlugin = {
      id: 'verticalLinePlugin',
      afterDraw: (chart: any) => {
        const active = chart.tooltip?._active;
        if (!active || !active.length) return;

        const ctx = chart.ctx;
        const { top, bottom, left, right } = chart.chartArea;

        const activePoint = active[0];
        const x = activePoint.element.x;
        const y = activePoint.element.y; // 👈 intersección real con el perfil

        // ===== Línea vertical =====
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(0, 230, 118, 0.8)'; // cámbialo a tu gusto
        ctx.stroke();
        ctx.restore();

        // ===== Punto de intersección =====
        // 1) Halo (glow)
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fillStyle = 'rgb(180, 123, 245, 0.589)';
        ctx.fill();
        ctx.restore();

        // 2) Punto sólido con borde
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, 4.2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgb(156, 91, 231)';
        ctx.fill();

        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(5, 16, 13, 0.95)'; // “borde oscuro” para contraste
        ctx.stroke();
        ctx.restore();
      },
    };

    const chartData = {
      labels,
      datasets: [
        {
          label: 'Altitud (m)',
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

      // 🔥 Desactivamos tooltip
      plugins: {
        tooltip: {
          enabled: false,
        },
        legend: {
          display: false,
        },
      },

      // 🔥 Necesario para que funcione la línea vertical
      interaction: {
        mode: 'index',
        intersect: false,
      },

      // 👇 aquí está la magia
      onHover: (event: any, activeEls: any[], chart: any) => {
        if (!this.profileWrap) return;

        

        const idx = activeEls[0].index;
        const p = this.elevationProfile[idx];
        if (!p) {
          this.elevTooltip.visible = false;
          return;
        }

        // X exacta del punto (la misma donde dibujas la línea vertical)
        const el = activeEls[0].element;
        const x = el.x; // px dentro del canvas
        const yTop = chart.chartArea.top; // px dentro del canvas

        // Convertimos coords de canvas -> coords del contenedor (profileWrap)
        // Como el canvas ocupa todo el contenedor, normalmente coincide,
        // pero esto lo hace robusto ante paddings/bordes.
        const canvasRect = this.elevationCanvas.nativeElement.getBoundingClientRect();
        const wrapRect = this.profileWrap.nativeElement.getBoundingClientRect();

        const xInWrap = x + (canvasRect.left - wrapRect.left);

        // Tooltip arriba del área del gráfico (un poco por encima del chartArea)
        const tooltipY = Math.max(6, yTop - 46);

        // Evitar que se salga por los bordes
        const wrapWidth = wrapRect.width;
        const PADDING = 12;
        const clampedX = Math.max(PADDING, Math.min(wrapWidth - PADDING, xInWrap));

        this.elevTooltip.visible = true;
        this.elevTooltip.x = clampedX;
        this.elevTooltip.y = tooltipY;
        this.elevTooltip.distanceKm = p.distanceMeters / 1000;
        this.elevTooltip.altitudeM = p.elevationMeters;

        // ===== mover punto en el mapa según la distancia del perfil =====
        if (this.polylinePath && this.polylinePath.length > 0 && this.cumulativeDistancesMeters.length === this.polylinePath.length) {
          const targetDist = p.distanceMeters; // del elevationProfile
          const nearestIdx = this.findNearestPolylineIndexByDistance(targetDist);
          this.hoverMapPoint = this.polylinePath[nearestIdx];
          
          // ✅ opcional UX: aseguramos que el punto esté visible sin marear
          this.ensurePointVisibleOnMap(this.hoverMapPoint);
        }

        if (this.recenterResetTimer) {
          clearTimeout(this.recenterResetTimer);
          this.recenterResetTimer = null;
        }

        // Si no hay punto activo (fuera del área)
        if (!activeEls || activeEls.length === 0) {
          this.clearElevationHover(true);
          return;
        }

        // ✅ Desktop: reutilizamos la misma lógica que móvil
        this.applyHoverIndex(activeEls[0].index);

        if (this.recenterResetTimer) {
          clearTimeout(this.recenterResetTimer);
          this.recenterResetTimer = null;
        }
        


      },


      scales: {
        x: {
          title: { display: !this.isMobileView, text: 'Distancia (km)' },
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: {
            display: true,      // en móvil, fuera ticks del eje X también
            maxTicksLimit: this.isMobileView ? 6 : 8,
            maxRotation: 0,
            minRotation: 0,
          },
          border: { display: !this.isMobileView }, // opcional
        },

        y: {
          position: 'left',
          grace: '5%',
          min: this.yAutoMin,
          max: this.yAutoMax,
          title: { display: !this.isMobileView, text: 'Altitud (m)' },

          // ✅ en móvil: fuera números del eje Y
          ticks: {
            display: true,
            callback: (value) => `${value} m`,
          },

          // ✅ en móvil: fuera la línea del eje Y
          border: {
            display: !this.isMobileView,
          },

          // ✅ grid horizontal (si la quieres mantener suave)
          grid: {
            color: 'rgba(255, 255, 255, 0.08)',
            drawTicks: !this.isMobileView,     // quita las “marquitas” del eje
          },
        },

        yRight: {
          display: !this.isMobileView,
          min: this.yAutoMin,
          max: this.yAutoMax,
          position: 'right',
          grace: '5%',
          title: { display: !this.isMobileView, text: 'Altitud (m)' },

          // ✅ en móvil: fuera números del eje Y
          ticks: {
            display: true,
            callback: (value) => `${value} m`,
          },

          // ✅ en móvil: fuera la línea del eje Y
          border: {
            display: !this.isMobileView,
          },

          // ✅ grid horizontal (si la quieres mantener suave)
          grid: {
            color: 'rgba(255, 255, 255, 0.08)',
            drawTicks: !this.isMobileView,     // quita las “marquitas” del eje
          },
        },
      },


    };

    this.elevationChart = new Chart(ctx, {
      type: 'line',
      data: chartData,
      options,
      plugins: [verticalLinePlugin]
    });

    requestAnimationFrame(() => {
      const chart: any = this.elevationChart;
      if (!chart) return;

      const y: any = chart.scales?.y;
      if (!y) return;

      // ✅ valores reales calculados por Chart.js (incluye grace)
      this.yAutoMin = y.min;
      this.yAutoMax = y.max;

      //console.log('📐 Y auto range:', this.yAutoMin, this.yAutoMax);

      // ✅ aplicar esos valores al eje derecho
      const yRightOpts = chart.options?.scales?.yRight;
      if (yRightOpts) {
        yRightOpts.min = this.yAutoMin;
        yRightOpts.max = this.yAutoMax;
      }

      chart.update('none'); // refresco sin animación
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

  private haversineMeters(
    a: google.maps.LatLngLiteral,
    b: google.maps.LatLngLiteral
  ): number {
    const R = 6371000; // metros
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

    // Búsqueda binaria (rápida)
    let lo = 0;
    let hi = arr.length - 1;

    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (arr[mid] < targetMeters) lo = mid + 1;
      else hi = mid;
    }

    // lo es el primer índice con arr[lo] >= targetMeters
    const i = lo;
    if (i === 0) return 0;

    // Comparamos i con i-1 para el más cercano
    const prev = i - 1;
    const d1 = Math.abs(arr[i] - targetMeters);
    const d0 = Math.abs(arr[prev] - targetMeters);

    return d0 <= d1 ? prev : i;
  }

  onProfileLeave(): void {
    this.clearElevationHover(true);
  }

  private clearElevationHover(resetMap: boolean): void {
    // Ocultar tooltip + marcador
    this.elevTooltip.visible = false;
    this.hoverMapPoint = null;
    this.pendiente = undefined;

    // Limpiar estado “active” interno de Chart.js (muy importante)
    if (this.elevationChart) {
      this.elevationChart.setActiveElements([]);
      // Limpia tooltip interno por si acaso
      // @ts-ignore
      this.elevationChart.tooltip?.setActiveElements([], { x: 0, y: 0 });
      this.elevationChart.update('none');
    }

    // Reset del mapa (si lo estás usando)
    if (resetMap) {
      if (this.recenterResetTimer) clearTimeout(this.recenterResetTimer);
      this.recenterResetTimer = setTimeout(() => {
        this.resetMapToOriginalFitBounds();
      }, 200);
    }
  }


  onProfileTouch(ev: TouchEvent): void {
    if (!this.elevationChart) return;
    if (!this.profileWrap) return;

    ev.preventDefault(); // evita scroll mientras arrastras por el gráfico

    const touch = ev.touches[0];
    if (!touch) return;

    const wrapRect = this.profileWrap.nativeElement.getBoundingClientRect();
    const xInWrap = touch.clientX - wrapRect.left;

    // Convertimos la X del wrapper a X del canvas
    const canvasRect = this.elevationCanvas.nativeElement.getBoundingClientRect();
    const xInCanvas = touch.clientX - canvasRect.left;

    // Buscamos el índice más cercano usando la escala X
    const xScale = (this.elevationChart as any).scales?.x;
    if (!xScale) return;

    const idxFloat = xScale.getValueForPixel(xInCanvas);
    let idx = Math.round(idxFloat);

    idx = Math.max(0, Math.min(this.elevationProfile.length - 1, idx));

    // Activamos el elemento en Chart.js (para que tu plugin pinte línea + punto)
    this.elevationChart.setActiveElements([{ datasetIndex: 0, index: idx }]);
    // @ts-ignore
    this.elevationChart.tooltip?.setActiveElements([{ datasetIndex: 0, index: idx }], { x: xInCanvas, y: 0 });
    this.elevationChart.update('none');

    // Y ahora reutilizamos tu lógica: actualizamos tooltip + mapa por idx
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

    // ✅ En móvil normalmente quieres tooltip abajo (para no tapar el gráfico)
    const isMobile = this.isMobileView;
    const tooltipY = isMobile ? (wrapRect.height - 44) : Math.max(6, yTop - 46);

    const wrapWidth = wrapRect.width;

    // 1) ponemos visible primero para que Angular cree los tooltips
    this.elevTooltip.visible = true;

    // 2) primer cálculo (puede usar fallback si aún no están en DOM)
    this.elevTooltip.x = this.computeStickyTooltipX(xInWrap, wrapWidth);
    this.elevTooltip.y = tooltipY;
    this.elevTooltip.distanceKm = p.distanceMeters / 1000;
    this.elevTooltip.altitudeM = p.elevationMeters;


    const slope = this.getSlopePercentAt(idx);
    if (slope !== null) {
      //console.log(`📐 Pendiente: ${slope.toFixed(1)}%`);
      this.pendiente = slope.toFixed(1);
    }
    

    // 3) recalcular en el siguiente frame ya con anchos reales (clave para evitar cortes)
    requestAnimationFrame(() => {
      if (!this.elevTooltip.visible) return;
      const wrapRect2 = this.profileWrap.nativeElement.getBoundingClientRect();
      this.elevTooltip.x = this.computeStickyTooltipX(xInWrap, wrapRect2.width);
      
    });

    // mover punto en mapa
    if (
      this.polylinePath?.length &&
      this.cumulativeDistancesMeters.length === this.polylinePath.length
    ) {
      const nearestIdx = this.findNearestPolylineIndexByDistance(p.distanceMeters);
      this.hoverMapPoint = this.polylinePath[nearestIdx];
    }

    
  }


  private getActiveTooltipWidth(): number {
    const fallback = 180;

    // Down siempre existe cuando visible=true
    const downW = this.tooltipDownEl?.nativeElement?.offsetWidth ?? 0;

    // Up solo existe en desktop
    const upW = this.tooltipUpEl?.nativeElement?.offsetWidth ?? 0;

    // Usamos el mayor de los visibles para que ninguno se corte
    const w = Math.max(downW, upW);

    return w > 0 ? w : fallback;
  }

  private computeStickyTooltipX(xInWrap: number, wrapWidth: number): number {
    const EDGE_MARGIN = 8;
    const tooltipWidth = this.getActiveTooltipWidth();

    let x = xInWrap;
    const leftEdge = x - tooltipWidth / 2;
    const rightEdge = x + tooltipWidth / 2;

    if (leftEdge < EDGE_MARGIN) {
      x = tooltipWidth / 2 + EDGE_MARGIN;
    } else if (rightEdge > wrapWidth - EDGE_MARGIN) {
      x = wrapWidth - tooltipWidth / 2 - EDGE_MARGIN;
    }

    return x;
  }

  private loadNearbyTracks(): void {
    if (!this.track) return;

    // ✅ Necesitamos un punto base (inicio de la ruta)
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
        //console.log(this.nearbyTracks)
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

    //console.log(track)
    this.router.navigate(['/dashboard/track', track.id]);

  }


  private getSlopePercentAt(idx: number): number | null {
    if (!this.elevationProfile || this.elevationProfile.length < 2) return null;
    if (idx < 0 || idx >= this.elevationProfile.length) return null;

    // usamos un pequeño "window" para que no sea tan ruidoso
    const i0 = Math.max(0, idx - 2);
    const i1 = Math.min(this.elevationProfile.length - 1, idx + 2);

    const p0 = this.elevationProfile[i0];
    const p1 = this.elevationProfile[i1];

    const d = (p1.distanceMeters ?? 0) - (p0.distanceMeters ?? 0);     // metros
    const h = (p1.elevationMeters ?? 0) - (p0.elevationMeters ?? 0);   // metros

    if (!d || d <= 0) return null;

    return (h / d) * 100;
  }

  getSlopeClass(slope: number | null | undefined): string {

    if (slope == null) return 'slope--none';

    const abs = Math.abs(slope); // 🔥 muy importante (bajada también cuenta)

    if (abs < 10) return 'slope--easy';
    if (abs < 17) return 'slope--moderate';
    if (abs < 25) return 'slope--hard';
    return 'slope--extreme';
  }

}
