import { AfterViewInit, Component, OnDestroy, ViewChild } from '@angular/core';
import { GoogleMap } from '@angular/google-maps';
import { Subscription } from 'rxjs';
import { GeolocationService } from '../../services/otros/location.service';
import { TrackRecorderService } from '../../services/track-recorder.service';
import { GpxExportService } from '../../services/gpx-export.service';


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

  constructor(
    private readonly geo: GeolocationService,
    public readonly rec: TrackRecorderService,
    private readonly gpx: GpxExportService
  ) {}

  ngAfterViewInit(): void {
    // ✅ orden: primero suscripción, luego arrancar geolocalización en microtarea
    this.bindState();

    queueMicrotask(() => {
      this.startLocation();
    });
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
    this.geo.stopWatch();
  }

  private bindState(): void {
    this.sub.add(
      this.rec.state$.subscribe((s) => {
        // ✅ importantísimo: aplicar cambios del template fuera del check
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

  private startLocation(): void {
    // primer fix
    this.sub.add(
      this.geo
        .getBestLocation({ timeoutMs: 8000, enableHighAccuracy: true, maximumAgeMs: 15000 })
        .subscribe((p) => {
          if (!p) return;

          // ✅ actualiza servicio (estado) y el resto viene del subscribe
          this.rec.updateMyLocation({
            lat: p.lat,
            lng: p.lng,
            accuracy: p.accuracy ?? null,
            time: new Date(),
          });

          // ✅ solo center/zoom también fuera del check
          queueMicrotask(() => {
            this.center = { lat: p.lat, lng: p.lng };
            this.zoom = Math.max(this.zoom, 15);
          });
        })
    );

    // watch gps
    this.geo.watchBrowserLocation(
      (p) => {
        this.rec.updateMyLocation({
          lat: p.lat,
          lng: p.lng,
          accuracy: p.accuracy ?? null,
          time: new Date(),
          // ele: si lo obtienes, pásalo aquí
        });
      },
      () => {},
      { timeoutMs: 10_000, enableHighAccuracy: true, maximumAgeMs: 5_000 }
    );
  }

  toggleRecording(): void {
    if (this.isRecording) this.rec.stop();
    else this.rec.start();
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
    queueMicrotask(() => this.rec.reset());
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
    // Si no hay distancia:
    // - grabando => 0 (para mostrar "0 m")
    // - no grabando => null (para mostrar "—")
    if (!meters || meters <= 0) return isRecording ? 0 : null;

    return Math.round((meters / 1000) * 10) / 10;
  }

  distanceLabel(km: number | null): string {
    if (km === null) return '—';
    if (km < 1) return `${Math.round(km * 1000)} m`;
    return `${km.toFixed(1)} km`;
  }

  
}
