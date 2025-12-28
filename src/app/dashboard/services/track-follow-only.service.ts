import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface FollowOnlyState {
  // track objetivo
  targetPath: LatLng[];

  // mi posición
  myLocation: LatLng | null;
  myAccuracy: number | null; // metros (si hay)
  myHeadingDeg: number | null; // flecha (0..360)

  // métricas de seguimiento
  nearestIndex: number;
  offTrack: boolean;
  offTrackMeters: number;

  wrongDirection: boolean;

  // para estabilizar alertas
  offTrackStreak: number;
  onTrackStreak: number;

  dirWindow: number[]; // historial de nearestIndex
}

@Injectable({ providedIn: 'root' })
export class TrackFollowOnlyService {
  private readonly _state$ = new BehaviorSubject<FollowOnlyState>(this.initial());
  readonly state$ = this._state$.asObservable();

  get snapshot(): FollowOnlyState {
    return this._state$.value;
  }

  initTarget(path: LatLng[]): void {
    const s = this.snapshot;
    this._state$.next({
      ...s,
      targetPath: path ?? [],
      nearestIndex: 0,
      offTrack: false,
      offTrackMeters: 0,
      wrongDirection: false,
      offTrackStreak: 0,
      onTrackStreak: 0,
      dirWindow: [],
    });
  }

  /** Actualiza tu posición y recalcula estados */
  updateMyPosition(p: {
    lat: number;
    lng: number;
    accuracy?: number | null;
    time?: Date;
  }): void {
    const s = this.snapshot;
    const myLocation: LatLng = { lat: p.lat, lng: p.lng };
    const acc = typeof p.accuracy === 'number' ? p.accuracy : s.myAccuracy;

    const nearest = this.nearestIndexOnTrack(myLocation, s.targetPath);
    const offDist = this.distancePointToPolylineMeters(myLocation, s.targetPath, nearest);

    // ✅ histeresis simple (evita pitidos por ruido):
    // fuera si dist > thresh durante 3 lecturas
    // dentro si dist < thresh-10 durante 2 lecturas
    const thresh = this.offTrackThresholdMeters(acc);
    const offNow = offDist > thresh;
    const onNow = offDist < Math.max(0, thresh - 10);

    let offTrackStreak = s.offTrackStreak;
    let onTrackStreak = s.onTrackStreak;

    if (offNow) {
      offTrackStreak += 1;
      onTrackStreak = 0;
    } else if (onNow) {
      onTrackStreak += 1;
      offTrackStreak = 0;
    }

    let offTrack = s.offTrack;
    if (!offTrack && offTrackStreak >= 3) offTrack = true;
    if (offTrack && onTrackStreak >= 2) offTrack = false;

    // dirección: tendencia del nearestIndex
    const dirWindow = [...s.dirWindow, nearest].slice(-8);
    const wrongDirection = this.isWrongDirection(dirWindow);

    // heading: si no hay heading real, lo calculamos por bearing entre última posición y la actual
    let heading = s.myHeadingDeg;
    if (s.myLocation) {
      const d = this.distanceMeters(s.myLocation, myLocation);
      if (d >= 3) heading = this.bearingDeg(s.myLocation, myLocation);
    }

    this._state$.next({
      ...s,
      myLocation,
      myAccuracy: acc ?? null,
      myHeadingDeg: heading ?? null,

      nearestIndex: nearest,
      offTrack,
      offTrackMeters: offDist,

      wrongDirection,

      offTrackStreak,
      onTrackStreak,
      dirWindow,
    });
  }

  // ---------------------------
  // Cálculos
  // ---------------------------

  private initial(): FollowOnlyState {
    return {
      targetPath: [],
      myLocation: null,
      myAccuracy: null,
      myHeadingDeg: null,
      nearestIndex: 0,
      offTrack: false,
      offTrackMeters: 0,
      wrongDirection: false,
      offTrackStreak: 0,
      onTrackStreak: 0,
      dirWindow: [],
    };
  }

  private offTrackThresholdMeters(acc: number | null | undefined): number {
    const base = 35;
    const a = typeof acc === 'number' ? acc : 60;
    return Math.max(base, a * 1.5);
  }

  /** Haversine (m) */
  private distanceMeters(a: LatLng, b: LatLng): number {
    const R = 6371000;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);

    const sinDLat = Math.sin(dLat / 2);
    const sinDLng = Math.sin(dLng / 2);
    const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * (sinDLng * sinDLng);
    return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  /** Bearing 0..360 */
  private bearingDeg(a: LatLng, b: LatLng): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const toDeg = (rad: number) => (rad * 180) / Math.PI;

    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const dLng = toRad(b.lng - a.lng);

    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    const brng = toDeg(Math.atan2(y, x));
    return (brng + 360) % 360;
  }

  private nearestIndexOnTrack(p: LatLng, path: LatLng[]): number {
    if (!path || path.length === 0) return 0;

    let bestI = 0;
    let bestD = Number.POSITIVE_INFINITY;

    const prevI = this.snapshot.nearestIndex ?? 0;
    const start = Math.max(0, prevI - 80);
    const end = Math.min(path.length - 1, prevI + 80);

    const scan = (from: number, to: number) => {
      for (let i = from; i <= to; i++) {
        const d = this.distanceMeters(p, path[i]);
        if (d < bestD) {
          bestD = d;
          bestI = i;
        }
      }
    };

    scan(start, end);
    if (path.length <= 200 || bestD > 150) scan(0, path.length - 1);

    return bestI;
  }

  private distancePointToPolylineMeters(p: LatLng, path: LatLng[], nearIndex: number): number {
    if (!path || path.length < 2) return 0;

    const from = Math.max(0, nearIndex - 15);
    const to = Math.min(path.length - 2, nearIndex + 15);

    let best = Number.POSITIVE_INFINITY;
    for (let i = from; i <= to; i++) {
      const d = this.pointToSegmentDistanceMeters(p, path[i], path[i + 1]);
      if (d < best) best = d;
    }
    return Number.isFinite(best) ? best : 0;
  }

  private pointToSegmentDistanceMeters(p: LatLng, a: LatLng, b: LatLng): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const R = 6371000;

    const lat0 = toRad(p.lat);
    const x = (lng: number) => R * toRad(lng) * Math.cos(lat0);
    const y = (lat: number) => R * toRad(lat);

    const px = x(p.lng), py = y(p.lat);
    const ax = x(a.lng), ay = y(a.lat);
    const bx = x(b.lng), by = y(b.lat);

    const abx = bx - ax;
    const aby = by - ay;
    const apx = px - ax;
    const apy = py - ay;

    const ab2 = abx * abx + aby * aby;
    const t = ab2 === 0 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));

    const cx = ax + t * abx;
    const cy = ay + t * aby;

    const dx = px - cx;
    const dy = py - cy;

    return Math.sqrt(dx * dx + dy * dy);
  }

  private isWrongDirection(dirWindow: number[]): boolean {
    if (dirWindow.length < 6) return false;
    const delta = dirWindow[dirWindow.length - 1] - dirWindow[0];
    return delta < -15;
  }
}
