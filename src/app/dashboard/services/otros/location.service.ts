import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of, Subscription } from 'rxjs';
import { catchError, map, switchMap, take } from 'rxjs/operators';

export interface GeoPoint {
  lat: number;
  lng: number;
  source: 'gps' | 'ip' | 'none';
  accuracy?: number;
}

interface IpApiResponse {
  latitude?: number;
  longitude?: number;
  lat?: number;
  lon?: number;
}

export interface GeoOptions {
  timeoutMs?: number;
  enableHighAccuracy?: boolean;
  maximumAgeMs?: number;
}

@Injectable({ providedIn: 'root' })
export class GeolocationService {
  private watchId: number | null = null;

  // ✅ Estado centralizado
  private readonly locationSubject = new BehaviorSubject<GeoPoint | null>(null);
  readonly location$ = this.locationSubject.asObservable();

  private readonly errorSubject = new BehaviorSubject<string | null>(null);
  readonly error$ = this.errorSubject.asObservable();

  private readonly runningSubject = new BehaviorSubject<boolean>(false);
  readonly running$ = this.runningSubject.asObservable();

  // para evitar doble arranque desde varios sitios
  private startSub: Subscription | null = null;

  constructor(private readonly http: HttpClient) {}

  // ------------------------------------------------------------
  // API pública (centralizada)
  // ------------------------------------------------------------

  /**
   * Arranca el seguimiento global (un único watch).
   * - hace un fix inicial (GPS->IP) y lo publica
   * - arranca watchPosition y va publicando en location$
   */
  start(opts?: GeoOptions): void {
    if (this.watchId !== null) return; // ya corriendo
    if (this.startSub) return; // arranque en curso

    this.errorSubject.next(null);

    // 1) Fix inicial (GPS->IP)
    this.startSub = this.getBestLocation(opts)
      .pipe(take(1))
      .subscribe({
        next: (p) => {
          if (p) this.locationSubject.next(p);
          // 2) Arranca watch global
          this.startWatchInternal(opts);
        },
        error: () => {
          // incluso si falla, intentamos watch (puede pedir permisos y luego OK)
          this.startWatchInternal(opts);
        },
        complete: () => {
          this.startSub?.unsubscribe();
          this.startSub = null;
        },
      });
  }

  /**
   * Para el watch global.
   */
  stop(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.runningSubject.next(false);
  }

  /**
   * Fuerza un “fix” puntual (GPS->IP) y lo publica en location$.
   * Útil si quieres refrescar a demanda sin tocar el watch.
   */
  refreshOnce(opts?: GeoOptions): void {
    this.errorSubject.next(null);

    this.getBestLocation(opts)
      .pipe(take(1))
      .subscribe((p) => {
        if (!p) {
          this.errorSubject.next('No se pudo obtener la ubicación (GPS/IP).');
          return;
        }
        this.locationSubject.next(p);
      });
  }

  /**
   * Snapshot síncrono del último valor (por si lo necesitas)
   */
  get snapshot(): GeoPoint | null {
    return this.locationSubject.value;
  }

  // ------------------------------------------------------------
  // Mantengo tus métodos (útiles internamente y también por si los usas)
  // ------------------------------------------------------------

  /** GPS una sola vez */
  getBrowserLocationOnce(opts?: GeoOptions): Observable<GeoPoint | null> {
    if (!('geolocation' in navigator)) return of(null);

    const timeout = opts?.timeoutMs ?? 10_000;
    const enableHighAccuracy = opts?.enableHighAccuracy ?? true;
    const maximumAge = opts?.maximumAgeMs ?? 10_000;

    return new Observable<GeoPoint | null>((observer) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          observer.next({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            source: 'gps',
            accuracy: pos.coords.accuracy,
          });
          observer.complete();
        },
        () => {
          observer.next(null);
          observer.complete();
        },
        { timeout, enableHighAccuracy, maximumAge }
      );
    });
  }

  /** IP aproximada (fallback) */
  getIpApproxLocation(): Observable<GeoPoint | null> {
    return this.http.get<IpApiResponse>('https://ipapi.co/json/').pipe(
      map((res) => {
        const lat = Number(res.latitude ?? res.lat);
        const lng = Number(res.longitude ?? res.lon);
        if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
        return { lat, lng, source: 'ip' as const };
      }),
      catchError(() => of(null))
    );
  }

  /** Mejor disponible: GPS -> si falla -> IP */
  getBestLocation(opts?: GeoOptions): Observable<GeoPoint | null> {
    return this.getBrowserLocationOnce(opts).pipe(
      switchMap((gps) => (gps ? of(gps) : this.getIpApproxLocation())),
      catchError(() => of(null))
    );
  }

  // ------------------------------------------------------------
  // Internos
  // ------------------------------------------------------------

  private startWatchInternal(opts?: GeoOptions): void {
    if (!('geolocation' in navigator)) {
      this.errorSubject.next('Tu navegador no soporta geolocalización.');
      this.runningSubject.next(false);
      return;
    }

    if (this.watchId !== null) return;

    const timeout = opts?.timeoutMs ?? 10_000;
    const enableHighAccuracy = opts?.enableHighAccuracy ?? true;
    const maximumAge = opts?.maximumAgeMs ?? 10_000;

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.runningSubject.next(true);
        this.errorSubject.next(null);

        this.locationSubject.next({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          source: 'gps',
          accuracy: pos.coords.accuracy,
        });
      },
      (err) => {
        this.runningSubject.next(false);
        this.errorSubject.next(this.humanGeolocationError(err));
      },
      { timeout, enableHighAccuracy, maximumAge }
    );
  }

  private humanGeolocationError(err: GeolocationPositionError): string {
    switch (err.code) {
      case err.PERMISSION_DENIED:
        return 'Permiso de ubicación denegado.';
      case err.POSITION_UNAVAILABLE:
        return 'No se pudo obtener la ubicación.';
      case err.TIMEOUT:
        return 'Tiempo de espera agotado al obtener la ubicación.';
      default:
        return 'Error al obtener la ubicación.';
    }
  }
}
