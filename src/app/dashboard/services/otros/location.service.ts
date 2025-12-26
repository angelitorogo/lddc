import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

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

@Injectable({ providedIn: 'root' })
export class GeolocationService {
  private watchId: number | null = null;

  constructor(private readonly http: HttpClient) {}

  /** GPS una sola vez */
  getBrowserLocationOnce(opts?: {
    timeoutMs?: number;
    enableHighAccuracy?: boolean;
    maximumAgeMs?: number;
  }): Observable<GeoPoint | null> {
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
  getBestLocation(opts?: {
    timeoutMs?: number;
    enableHighAccuracy?: boolean;
    maximumAgeMs?: number;
  }): Observable<GeoPoint | null> {
    return this.getBrowserLocationOnce(opts).pipe(
      switchMap((gps) => (gps ? of(gps) : this.getIpApproxLocation())),
      catchError(() => of(null))
    );
  }

  /** Watch GPS (seguimiento) */
  watchBrowserLocation(
    onNext: (p: GeoPoint) => void,
    onError?: (msg?: string) => void,
    opts?: {
      timeoutMs?: number;
      enableHighAccuracy?: boolean;
      maximumAgeMs?: number;
    }
  ): void {
    if (!('geolocation' in navigator)) {
      onError?.('Tu navegador no soporta geolocalización.');
      return;
    }

    if (this.watchId !== null) return;

    const timeout = opts?.timeoutMs ?? 10_000;
    const enableHighAccuracy = opts?.enableHighAccuracy ?? true;
    const maximumAge = opts?.maximumAgeMs ?? 10_000;

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        onNext({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          source: 'gps',
          accuracy: pos.coords.accuracy,
        });
      },
      (err) => {
        // perm denied / timeout / unavailable
        onError?.(this.humanGeolocationError(err));
      },
      { timeout, enableHighAccuracy, maximumAge }
    );
  }

  stopWatch(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
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
