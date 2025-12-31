import { AfterViewInit, Component, OnDestroy, ViewChild } from '@angular/core';
import { GoogleMap } from '@angular/google-maps';
import { Subscription } from 'rxjs';

import { GeolocationService } from '../../services/otros/location.service';
import { TrackRecorderService } from '../../services/track-recorder.service';
import { GpxExportService } from '../../services/gpx-export.service';
import { TracksService } from '../../services/track.service';

type LatLngLiteral = google.maps.LatLngLiteral;

@Component({
  selector: 'app-track-recorder',
  templateUrl: './track-recorder.component.html',
  styleUrls: ['./track-recorder.component.css'],
})
export class TrackRecorderComponent implements AfterViewInit, OnDestroy {
  @ViewChild(GoogleMap) googleMap!: GoogleMap;

  // mapa
  center: LatLngLiteral = { lat: 40.4168, lng: -3.7038 };
  zoom = 15;

  options: google.maps.MapOptions = {
    mapTypeId: 'hybrid',
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    clickableIcons: false,
    gestureHandling: 'greedy',
    disableDoubleClickZoom: true,
    keyboardShortcuts: false,
  };

  // estado UI
  myLocation: LatLngLiteral | null = null;
  myAccuracy: number | null = null;

  path: LatLngLiteral[] = [];
  waypointMarkers: Array<{ position: LatLngLiteral; title: string }> = [];

  isRecording = false;

  // stats
  distanceKm: number | null = null;
  ascent = 0;
  descent = 0;

  // icono blue dot
  myBlueDotIcon: google.maps.Symbol = {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: '#1a73e8',
    fillOpacity: 1,
    strokeColor: '#ffffff',
    strokeOpacity: 1,
    strokeWeight: 2,
    scale: 7,
  };

  myAccuracyCircleOptions: google.maps.CircleOptions = {
    strokeOpacity: 0,
    fillColor: '#1a73e8',
    fillOpacity: 0.18,
    zIndex: 10,
  };

  recordedPolylineOptions: google.maps.PolylineOptions = {
    strokeColor: '#1a73e8',
    strokeOpacity: 0.95,
    strokeWeight: 4,
    zIndex: 30,
  };

  private sub = new Subscription();

  // ------------------------------------------------------------------
  // ✅ NUEVO: batching de elevaciones (cada 2s o 5 puntos)
  // ------------------------------------------------------------------
  private elevationTimerId: any = null;
  private pendingBatch: Array<{ lat: number; lon: number; index: number }> = [];
  private readonly BATCH_MAX_POINTS = 5;
  private readonly BATCH_INTERVAL_MS = 2000;
  private elevationInFlight = false;

  constructor(
    private readonly geo: GeolocationService,
    public readonly rec: TrackRecorderService,
    private readonly gpx: GpxExportService,
    private readonly tracksApi: TracksService // ✅ este service debe exponer elevationBatch(points)
  ) {}

  ngAfterViewInit(): void {
    // ✅ orden: primero suscripción, luego enganchar al stream
    this.bindState();

    queueMicrotask(() => {
      this.startLocation();
      this.startElevationBatchLoop();
    });
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
    if (this.elevationTimerId) clearInterval(this.elevationTimerId);
    // ❌ NO parar el watch global aquí
    // this.geo.stop();
  }

  private bindState(): void {
    this.sub.add(
      this.rec.state$.subscribe((s) => {
        queueMicrotask(() => {
          this.isRecording = s.isRecording;

          this.myLocation = s.myLocation;
          this.myAccuracy = s.myAccuracy ? Math.max(30, Math.round(s.myAccuracy)) : null;

          this.path = s.path.map((p) => ({ lat: p.lat, lng: p.lng }));

          this.distanceKm = this.kmNumberForDisplay(s.distanceMeters, s.isRecording);
          this.ascent = Math.round(s.ascentMeters);
          this.descent = Math.round(s.descentMeters);

          this.waypointMarkers = s.waypoints.map((w, idx) => ({
            position: { lat: w.lat, lng: w.lng },
            title: w.name ?? `Waypoint ${idx + 1}`,
          }));

          if (this.myLocation) {
            const map = this.googleMap?.googleMap;
            if (map) map.panTo(this.myLocation);
          }
        });
      })
    );
  }

  // ------------------------------------------------------------------
  // ✅ NUEVO: loop de batch por tiempo (2s)
  // ------------------------------------------------------------------
  private startElevationBatchLoop(): void {
    if (this.elevationTimerId) return;

    this.elevationTimerId = setInterval(() => {
      if (!this.rec.snapshot.isRecording) return;
      if (this.elevationInFlight) return;
      if (this.pendingBatch.length === 0) return;

      this.flushElevationBatch();
    }, this.BATCH_INTERVAL_MS);
  }

  private flushElevationBatch(): void {
    if (this.elevationInFlight) return;
    if (this.pendingBatch.length === 0) return;

    // corta a máximo N puntos
    const batch = this.pendingBatch.splice(0, this.BATCH_MAX_POINTS);

    // si por lo que sea viniera vacío, salimos
    if (!batch.length) return;

    const startIndex = batch[0].index;

    // points en el orden de inserción
    const points = batch.map((b) => ({ lat: b.lat, lon: b.lon }));

    this.elevationInFlight = true;

    this.sub.add(
      this.tracksApi.elevationBatch(points).subscribe({
        next: (resp: { elevations: Array<number | null> }) => {
          const elevations = resp?.elevations ?? [];

          // aplica elevaciones desde startIndex (mismo orden)
          this.rec.applyElevationBatch(startIndex, elevations);

          this.elevationInFlight = false;
        },
        error: () => {
          // si falla, liberamos vuelo y seguimos
          this.elevationInFlight = false;
        },
      })
    );
  }

  // ✅ ahora consume ubicación global
  private startLocation(): void {
    this.sub.add(
      this.geo.location$.subscribe((p) => {
        if (!p) return;

        const beforeLen = this.rec.snapshot.path.length;

        this.rec.updateMyLocation({
          lat: p.lat,
          lng: p.lng,
          accuracy: p.accuracy ?? null,
          time: new Date(),
        });

        // si está grabando y se añadió un punto nuevo, lo metemos en cola de elevación
        const after = this.rec.snapshot;
        if (after.isRecording && after.path.length === beforeLen + 1) {
          const idx = after.path.length - 1;
          const last = after.path[idx];

          // si no tiene ele (lo normal en web), lo metemos en buffer
          if (last?.ele == null) {
            this.pendingBatch.push({ lat: last.lat, lon: last.lng, index: idx });

            // si ya llegamos al máximo, flush inmediato (sin esperar 2s)
            if (!this.elevationInFlight && this.pendingBatch.length >= this.BATCH_MAX_POINTS) {
              this.flushElevationBatch();
            }
          }
        }

        queueMicrotask(() => {
          this.center = { lat: p.lat, lng: p.lng };
          this.zoom = Math.max(this.zoom, 15);
        });
      })
    );
  }

  toggleRecording(): void {
    if (this.isRecording) {
      this.rec.stop();

      // opcional: flush final si queda algo pendiente
      if (!this.elevationInFlight && this.pendingBatch.length) {
        this.flushElevationBatch();
      }
    } else {
      // nueva sesión: vaciamos colas
      this.pendingBatch = [];
      this.elevationInFlight = false;

      this.rec.start();
    }
  }

  addWaypoint(): void {
    this.rec.addWaypointFromCurrent(`WP ${this.waypointMarkers.length + 1}`, 'Waypoint añadido en vivo');
  }

  exportGpx(): void {
    const s = this.rec.snapshot;
    if (!s.path.length) return;

    const gpxText = this.gpx.buildGpx({
      trackName: `Track grabado`,
      points: s.path,
      waypoints: s.waypoints,
    });

    this.gpx.downloadGpx(`track_grabado`, gpxText);
  }

  reset(): void {
    queueMicrotask(() => {
      this.pendingBatch = [];
      this.elevationInFlight = false;
      this.rec.reset();
    });
  }

  centerOnMe(): void {
    if (!this.myLocation) return;
    const map = this.googleMap?.googleMap;
    const target = { lat: this.myLocation.lat, lng: this.myLocation.lng };

    queueMicrotask(() => {
      this.center = { ...target };
      this.zoom = Math.max(this.zoom, 15);
    });

    if (map) {
      map.panTo(target);
      map.setZoom(Math.max(this.zoom, 15));
    }
  }

  // ---------------------------------
  // helpers
  // ---------------------------------

  private kmNumberForDisplay(meters: number, isRecording: boolean): number | null {
    if (!meters || meters <= 0) return isRecording ? 0 : null;
    return Math.round((meters / 1000) * 10) / 10;
  }

  distanceLabel(km: number | null): string {
    if (km === null) return '—';
    if (km < 1) return `${Math.round(km * 1000)} m`;
    return `${km.toFixed(1)} km`;
  }
}
