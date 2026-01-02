import { AfterViewInit, Component, OnDestroy, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { GoogleMap } from '@angular/google-maps';
import { Subscription } from 'rxjs';

import { TracksService } from '../../services/track.service';
import { GeolocationService } from '../../services/otros/location.service';
import { TrackFollowOnlyService } from '../../services/track-follow-only.service';
import { AuthService } from '../../../auth/services/auth.service';

type LatLngLiteral = google.maps.LatLngLiteral;

@Component({
  selector: 'app-track-follow',
  templateUrl: './track-follow.component.html',
  styleUrls: ['./track-follow.component.css'],
})
export class TrackFollowComponent implements AfterViewInit, OnDestroy {
  @ViewChild(GoogleMap) googleMap!: GoogleMap;

  loading = false;
  error = '';

  trackId = '';
  trackName = 'Ruta';

  // track objetivo
  targetPath: LatLngLiteral[] = [];

  // mi ubicación
  myLocation: LatLngLiteral | null = null;
  myAccuracy: number | null = null;
  myHeadingDeg: number | null = null;

  // estado alertas
  offTrack = false;
  offTrackMeters = 0;
  wrongDirection = false;

  // mapa
  center: LatLngLiteral = { lat: 40.4168, lng: -3.7038 };
  zoom = 14;

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

  targetPolylineOptions: google.maps.PolylineOptions = {
    strokeColor: '#00e676',
    strokeOpacity: 0.9,
    strokeWeight: 4,
    zIndex: 20,
  };

  // Flecha azul (símbolo) — rotaremos por heading
  myArrowSymbol: google.maps.Symbol = {
    path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
    fillColor: '#1a73e8',
    fillOpacity: 1,
    strokeColor: '#ffffff',
    strokeOpacity: 1,
    strokeWeight: 2,
    scale: 5,
    rotation: 0,
    anchor: new google.maps.Point(0, 2),
  };

  myAccuracyCircleOptions: google.maps.CircleOptions = {
    strokeOpacity: 0,
    fillColor: '#1a73e8',
    fillOpacity: 0.18,
    zIndex: 10,
  };

  // “seguir mi posición” (centrado continuo)
  followMe = true;

  private sub = new Subscription();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly tracksService: TracksService,
    private authService: AuthService,
    private readonly geo: GeolocationService,
    private readonly follow: TrackFollowOnlyService,
    private router: Router
  ) {}

  ngAfterViewInit(): void {
    this.trackId = this.route.snapshot.paramMap.get('id') ?? '';
    if (!this.trackId) {
      this.error = 'No se ha proporcionado trackId.';
      return;
    }

    this.bindState();
    this.startLocation();

    queueMicrotask(() => {
      this.loadTargetTrack();
    });
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
    // ❌ NO parar el watch global aquí
    // this.geo.stop();
  }

  private loadTargetTrack(): void {
    queueMicrotask(() => {
      this.loading = true;
      this.error = '';
    });

    this.sub.add(
      this.tracksService.getTrackById(this.trackId).subscribe({
        next: (detail: any) => {
          this.trackName = detail?.name ?? 'Ruta';

          const pts = detail?.trackPointsForFront ?? [];
          this.targetPath = Array.isArray(pts)
            ? pts.map((p: any) => ({ lat: p.lat, lng: p.lon }))
            : [];

          this.follow.initTarget(this.targetPath);
          this.fitToPath(this.targetPath);
        },
        error: () => {
          queueMicrotask(() => {
            this.error = 'No se pudo cargar el track.';
          });
        },
        complete: () => {
          queueMicrotask(() => {
            this.loading = false;
          });
        },
      })
    );
  }

  private fitToPath(path: LatLngLiteral[]): void {
    const map = this.googleMap?.googleMap;
    if (!map || !path || path.length < 2) return;

    const bounds = new google.maps.LatLngBounds();
    for (const p of path) bounds.extend(p);
    map.fitBounds(bounds);

    const c = bounds.getCenter();
    this.center = { lat: c.lat(), lng: c.lng() };
  }

  private bindState(): void {
    this.sub.add(
      this.follow.state$.subscribe((s) => {
        queueMicrotask(() => {
          this.myLocation = s.myLocation;
          this.myAccuracy = s.myAccuracy ? Math.max(30, Math.round(s.myAccuracy)) : null;
          this.myHeadingDeg = s.myHeadingDeg;

          this.offTrack = s.offTrack;
          this.offTrackMeters = Math.round(s.offTrackMeters);
          this.wrongDirection = s.wrongDirection;

          // actualizar rotación de flecha
          if (typeof this.myHeadingDeg === 'number') {
            this.myArrowSymbol = { ...this.myArrowSymbol, rotation: this.myHeadingDeg };
          }

          // follow me
          if (this.followMe && this.myLocation) {
            const map = this.googleMap?.googleMap;
            if (map) map.panTo(this.myLocation);
          }
        });
      })
    );
  }

  // ✅ ahora consume la ubicación global
  private startLocation(): void {
    this.sub.add(
      this.geo.location$.subscribe((p) => {
        if (!p) return;

        queueMicrotask(() => {
          this.follow.updateMyPosition({
            lat: p.lat,
            lng: p.lng,
            accuracy: p.accuracy ?? null,
          });

          if (this.followMe) {
            this.center = { lat: p.lat, lng: p.lng };
            this.zoom = Math.max(this.zoom, 15);
          }
        });
      })
    );
  }


  toggleFollowMe(): void {
    this.followMe = !this.followMe;
  }

  centerOnMe(): void {
    if (!this.myLocation) return;
    const map = this.googleMap?.googleMap;
    const target = { lat: this.myLocation.lat, lng: this.myLocation.lng };
    this.center = { ...target };
    this.zoom = Math.max(this.zoom, 15);
    if (map) {
      map.panTo(target);
      map.setZoom(this.zoom);
    }
  }

  statusLabel(): string {
    if (this.offTrack) return 'FUERA DE RUTA';
    if (this.wrongDirection) return 'SENTIDO CONTRARIO';
    return 'EN RUTA';
  }

  onBack(): void {
    const redirectFromGuard = this.authService.consumeRedirectUrl();
    const redirectTo = redirectFromGuard || '/dashboard/home';

    this.router.navigateByUrl(redirectTo);
  }

}
