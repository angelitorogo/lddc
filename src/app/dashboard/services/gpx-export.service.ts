import { Injectable } from '@angular/core';

export interface RecordedPoint {
  lat: number;
  lng: number;
  ele?: number | null;
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

@Injectable({ providedIn: 'root' })
export class GpxExportService {

  /**
   * Genera un GPX 1.1 (track + waypoints) como string.
   * - points: puntos grabados del track
   * - waypoints: puntos marcados (con nombre/desc opcionales)
   */
  buildGpx(opts: {
    trackName: string;
    points: RecordedPoint[];
    waypoints?: Waypoint[];
  }): string {
    const { trackName, points, waypoints = [] } = opts;

    const esc = (s: string) =>
      s.replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

    const iso = (d: Date) => d.toISOString();

    const metaTime = new Date().toISOString();

    const wptXml = waypoints.map((w) => {
      const ele = (w.ele ?? null) !== null ? `<ele>${Number(w.ele).toFixed(1)}</ele>` : '';
      const time = w.time ? `<time>${iso(w.time)}</time>` : '';
      const name = w.name ? `<name>${esc(w.name)}</name>` : '';
      const desc = w.desc ? `<desc>${esc(w.desc)}</desc>` : '';
      return `<wpt lat="${w.lat}" lon="${w.lng}">${ele}${time}${name}${desc}</wpt>`;
    }).join('');

    const trkPtsXml = points.map((p) => {
      const ele = (p.ele ?? null) !== null ? `<ele>${Number(p.ele).toFixed(1)}</ele>` : '';
      return `<trkpt lat="${p.lat}" lon="${p.lng}">${ele}<time>${iso(p.time)}</time></trkpt>`;
    }).join('');

    // GPX 1.1 estándar
    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="La Dama del Cancho" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <time>${metaTime}</time>
  </metadata>
  ${wptXml}
  <trk>
    <name>${esc(trackName)}</name>
    <trkseg>
      ${trkPtsXml}
    </trkseg>
  </trk>
</gpx>`;
  }

  /**
   * Descarga el GPX en el navegador.
   */
  downloadGpx(filename: string, gpxContent: string): void {
    const safeName = (filename || 'track').trim().replace(/[^\w\-]+/g, '_');
    const finalName = safeName.endsWith('.gpx') ? safeName : `${safeName}.gpx`;

    const blob = new Blob([gpxContent], { type: 'application/gpx+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = finalName;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  }
}
