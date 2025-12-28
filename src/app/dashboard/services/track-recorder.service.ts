import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RecordedPoint {
  lat: number;
  lng: number;
  ele?: number | null; // en web puede ser null
  time: Date;
}

export interface Waypoint {
  lat: number;
  lng: number;
  ele?: number | null;
  time: Date;
  name?: string;
  desc?: string;
}

export interface RecorderState {
  isRecording: boolean;
  startedAt: Date | null;

  myLocation: LatLng | null;
  myAccuracy: number | null;

  path: RecordedPoint[];
  waypoints: Waypoint[];

  distanceMeters: number;
  ascentMeters: number;
  descentMeters: number;
  lastSpeedMps: number | null;
}

@Injectable({ providedIn: 'root' })
export class TrackRecorderService {
  private readonly _state$ = new BehaviorSubject<RecorderState>(this.initial());
  readonly state$ = this._state$.asObservable();

  get snapshot(): RecorderState {
    return this._state$.value;
  }

  start(): void {
    this._state$.next({
      isRecording: true,
      startedAt: new Date(),
      myLocation: this.snapshot.myLocation,
      myAccuracy: this.snapshot.myAccuracy,
      path: [],
      waypoints: [],
      distanceMeters: 0,
      ascentMeters: 0,
      descentMeters: 0,
      lastSpeedMps: null,
    });
  }

  stop(): void {
    this._state$.next({ ...this.snapshot, isRecording: false });
  }

  reset(): void {
    const s = this.snapshot;

    this._state$.next({
      ...s,
      // mantenemos ubicación actual
      myLocation: s.myLocation,
      myAccuracy: s.myAccuracy,

      // reseteamos sesión de grabación
      isRecording: false,
      startedAt: null,
      path: [],
      waypoints: [],
      distanceMeters: 0,
      ascentMeters: 0,
      descentMeters: 0,
      lastSpeedMps: null,
    });
  }


  addWaypointFromCurrent(name?: string, desc?: string): void {
    const s = this.snapshot;
    if (!s.myLocation) return;

    const wp: Waypoint = {
      lat: s.myLocation.lat,
      lng: s.myLocation.lng,
      ele: this.lastEle(),
      time: new Date(),
      name,
      desc,
    };

    this._state$.next({ ...s, waypoints: [...s.waypoints, wp] });
  }

  updateMyLocation(p: { lat: number; lng: number; accuracy?: number | null; ele?: number | null; time?: Date }): void {
    const s = this.snapshot;
    const now = p.time ?? new Date();

    const myLocation = { lat: p.lat, lng: p.lng };
    const myAccuracy = typeof p.accuracy === 'number' ? p.accuracy : s.myAccuracy;

    // si no graba, solo actualiza blue dot
    if (!s.isRecording) {
      this._state$.next({ ...s, myLocation, myAccuracy: myAccuracy ?? null });
      return;
    }

    const prev = s.path.length ? s.path[s.path.length - 1] : null;
    const next: RecordedPoint = { lat: p.lat, lng: p.lng, ele: p.ele ?? null, time: now };

    // filtro mínimo anti-ruido
    if (prev) {
      const d = this.distanceMeters({ lat: prev.lat, lng: prev.lng }, myLocation);
      if (d < 2) {
        this._state$.next({ ...s, myLocation, myAccuracy: myAccuracy ?? null });
        return;
      }
    }

    let distance = s.distanceMeters;
    let ascent = s.ascentMeters;
    let descent = s.descentMeters;
    let speed: number | null = null;

    if (prev) {
      const d = this.distanceMeters({ lat: prev.lat, lng: prev.lng }, myLocation);
      distance += d;

      const dtSec = Math.max(0.5, (now.getTime() - prev.time.getTime()) / 1000);
      speed = d / dtSec;

      const e1 = prev.ele ?? null;
      const e2 = next.ele ?? null;
      if (e1 !== null && e2 !== null) {
        const de = e2 - e1;
        if (de > 0) ascent += de;
        else descent += Math.abs(de);
      }
    }

    this._state$.next({
      ...s,
      myLocation,
      myAccuracy: myAccuracy ?? null,
      path: [...s.path, next],
      distanceMeters: distance,
      ascentMeters: ascent,
      descentMeters: descent,
      lastSpeedMps: speed,
    });
  }

  // helpers
  private initial(): RecorderState {
    return {
      isRecording: false,
      startedAt: null,
      myLocation: null,
      myAccuracy: null,
      path: [],
      waypoints: [],
      distanceMeters: 0,
      ascentMeters: 0,
      descentMeters: 0,
      lastSpeedMps: null,
    };
  }

  private lastEle(): number | null {
    const p = this.snapshot.path;
    if (!p.length) return null;
    return p[p.length - 1].ele ?? null;
  }

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
}
