// src/app/core/services/tracks.service.ts

import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { TrackListParams } from '../../shared/models/track-list-params-model';
import { DetailResponse, WaypointPatchDto } from '../../shared/responses/detail.response';
import { CreateTrackResponse } from '../../shared/responses/create-track.response';
import { TrackListResponse } from '../../shared/responses/list.response';
import { NearbyTrackItem } from '../../shared/models/track.model';
import { compressImages } from '../../shared/helpers/compressor.helper';
import { TrackWaypointImage, ViewportTracksQuery, ViewportTracksResponse } from '../../shared/interfaces/viewport.interfaces';

@Injectable({
  providedIn: 'root',
})
export class TracksService {
  private readonly baseUrl = `${environment.API_URL}/tracks`;

  private appName = environment.APP_NAME || 'La Dama del Cancho';
  private domainName = environment.DOMAIN_URL || 'ladamadelcancho.com';

  constructor(private http: HttpClient) {}

  getTracks(params: TrackListParams = {}): Observable<TrackListResponse> {
    let httpParams = new HttpParams();

    if (params.userId !== undefined) {
      httpParams = httpParams.set('userId', params.userId.toString());
    }

    if (params.page !== undefined) {
      httpParams = httpParams.set('page', params.page.toString());
    }
    if (params.limit !== undefined) {
      httpParams = httpParams.set('limit', params.limit.toString());
    }

    if (params.routeType) {
      httpParams = httpParams.set('routeType', params.routeType);
    }
    if (params.minDistance !== undefined) {
      httpParams = httpParams.set('minDistance', params.minDistance.toString());
    }
    if (params.maxDistance !== undefined) {
      httpParams = httpParams.set('maxDistance', params.maxDistance.toString());
    }
    if (params.difficulty) {
      httpParams = httpParams.set('difficulty', params.difficulty);
    }

    if (params.sortBy) {
      httpParams = httpParams.set('sortBy', params.sortBy);
    }
    if (params.sortOrder) {
      httpParams = httpParams.set('sortOrder', params.sortOrder);
    }

    return this.http.get<TrackListResponse>(this.baseUrl, {
      params: httpParams,
      withCredentials: true,
    });
  }

  getTrackById(id: string): Observable<DetailResponse> {
    return this.http.get<any>(`${this.baseUrl}/${id}`, {
      withCredentials: true,
    });
  }

  getUserStats(userId: string): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/user/stats`, {id: userId}, {
      withCredentials: true,
    });
  }

  getTrackByName(name: string): Observable<DetailResponse> {
    return this.http.get<any>(`${this.baseUrl}/name/${name}`, {
      withCredentials: true,
    });
  }

  createFromGpx(
    name: string,
    description: string | null,
    gpxFile: File,
    images: File[],
  ): Observable<CreateTrackResponse> {
    return new Observable<CreateTrackResponse>((observer) => {
      (async () => {
        try {
          const compressed = await compressImages(images, {
            maxWidth: 1920,
            maxHeight: 1920,
            quality: 0.82,
            mimeType: 'image/webp',
          });

          const formData = new FormData();
          formData.append('name', name);
          formData.append('appName', this.appName);
          formData.append('domainName', this.domainName);
          if (description) formData.append('description', description);
          formData.append('gpx', gpxFile, gpxFile.name);

          compressed.forEach((img) => formData.append('images', img, img.name));

          this.http
            .post<CreateTrackResponse>(`${this.baseUrl}/gpx`, formData, {
              withCredentials: true,
            })
            .subscribe({
              next: (res) => {
                observer.next(res);
                observer.complete();
              },
              error: (err) => observer.error(err),
            });
        } catch (e) {
          observer.error(e);
        }
      })();
    });
  }

  getNearbyTracks(params: {
    lat: number;
    lon: number;
    radiusMeters?: number;
    limit?: number;
    trackExcluded?: string;
  }): Observable<NearbyTrackItem[]> {
    let httpParams = new HttpParams()
      .set('lat', String(params.lat))
      .set('lon', String(params.lon))
      .set('radiusMeters', String(params.radiusMeters ?? 50000))
      .set('limit', String(params.limit ?? 20));

    if (params.trackExcluded) {
      httpParams = httpParams.set('trackExcluded', params.trackExcluded);
    }

    return this.http.get<NearbyTrackItem[]>(`${this.baseUrl}/nearby`, {
      params: httpParams,
      withCredentials: true,
    });
  }

  downloadGpx(trackId: string): void {
    const url = `${environment.API_URL}/files/gpx/${trackId}`;
    window.open(url, '_self');
  }

  updateTrack(
    trackId: string,
    data: { name?: string; description?: string },
    images: File[] = [],
  ): Observable<any> {
    return new Observable<any>((observer) => {
      (async () => {
        try {
          const compressed = await compressImages(images, {
            maxWidth: 1920,
            maxHeight: 1920,
            quality: 0.82,
            mimeType: 'image/webp',
          });

          const form = new FormData();
          if (data.name != null) form.append('name', data.name);
          if (data.description != null) form.append('description', data.description);

          for (const file of compressed) {
            form.append('images', file, file.name);
          }

          this.http
            .put<any>(`${this.baseUrl}/${trackId}`, form, {
              withCredentials: true,
            })
            .subscribe({
              next: (res) => {
                observer.next(res);
                observer.complete();
              },
              error: (err) => observer.error(err),
            });
        } catch (e) {
          observer.error(e);
        }
      })();
    });
  }

  deleteTrackImage(trackId: string, imageId: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/${trackId}/images/${imageId}`, {
      withCredentials: true,
    });
  }

  getUrlImage(image: any): string {
    return `${this.baseUrl}/images/general/${image.id}`;
  }

  deleteTrack(trackId: string) {
    return this.http.delete(`${this.baseUrl}/${trackId}`, {
      withCredentials: true,
    });
  }

  getTracksInViewport(query: ViewportTracksQuery): Observable<ViewportTracksResponse> {
    let params = new HttpParams()
      .set('minLat', String(query.minLat))
      .set('maxLat', String(query.maxLat))
      .set('minLng', String(query.minLng))
      .set('maxLng', String(query.maxLng));

    if (query.zoomLevel !== undefined && query.zoomLevel !== null) {
      params = params.set('zoomLevel', String(query.zoomLevel));
    }

    return this.http.get<ViewportTracksResponse>(`${this.baseUrl}/viewport`, {
      params,
      withCredentials: true,
    });
  }

  searchTracks(params: TrackListParams & { q: string }): Observable<TrackListResponse> {
    let httpParams = new HttpParams().set('q', params.q);

    if (params.userId !== undefined) {
      httpParams = httpParams.set('userId', params.userId.toString());
    }

    if (params.page !== undefined) {
      httpParams = httpParams.set('page', params.page.toString());
    } else {
      httpParams = httpParams.set('page', '1');
    }

    if (params.limit !== undefined) {
      httpParams = httpParams.set('limit', params.limit.toString());
    } else {
      httpParams = httpParams.set('limit', '10');
    }

    if (params.routeType) {
      httpParams = httpParams.set('routeType', params.routeType);
    }
    if (params.minDistance !== undefined) {
      httpParams = httpParams.set('minDistance', params.minDistance.toString());
    }
    if (params.maxDistance !== undefined) {
      httpParams = httpParams.set('maxDistance', params.maxDistance.toString());
    }
    if (params.difficulty) {
      httpParams = httpParams.set('difficulty', params.difficulty);
    }

    if (params.sortBy) {
      httpParams = httpParams.set('sortBy', params.sortBy);
    }
    if (params.sortOrder) {
      httpParams = httpParams.set('sortOrder', params.sortOrder);
    }

    return this.http.get<TrackListResponse>(`${this.baseUrl}/search`, {
      params: httpParams,
      withCredentials: true,
    });
  }


  elevationBatch(points: { lat: number; lon: number }[]): Observable<{ elevations: Array<number | null> }> {
    return this.http.post<{ elevations: Array<number | null> }>(
      `${this.baseUrl}/elevation/batch`,
      { points },
      { withCredentials: true }
    );
  }

  createFromGpxBulkAsync(files: File[]): Observable<{ jobId: string }> {
    const formData = new FormData();
    formData.append('appName', this.appName);
    formData.append('domainName', this.domainName);
    for (const f of files) formData.append('gpx', f, f.name);


    return this.http.post<{ jobId: string }>(`${this.baseUrl}/gpx/bulk`, formData, {
      withCredentials: true,
    });
  }

  getBulkJob(jobId: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/gpx/bulk/${jobId}`, {
      withCredentials: true,
    });
  }

  updateWaypoint(trackId: string, waypointId: string, dto: WaypointPatchDto): Observable<any> {
    // Endpoint recomendado:
    // PATCH /tracks/:trackId/waypoints/:waypointId
    return this.http.patch<any>(`${this.baseUrl}/${trackId}/waypoints/${waypointId}`, dto, {
      withCredentials: true,
    });
  }


  createWaypoint(trackId: string, dto: WaypointPatchDto): Observable<WaypointPatchDto> {

    return this.http.post<WaypointPatchDto>(`${this.baseUrl}/${trackId}/waypoints`, dto, {
      withCredentials: true,
    });
  }

  deleteWaypoint(trackId: string, waypointId: string): Observable<any> {
    return this.http.delete<any>(`${this.baseUrl}/${trackId}/waypoints/${waypointId}`, {
      withCredentials: true,
    });
  }

  /**
   * ✅ Subir imágenes a un waypoint
   * - Campo multipart: "images"
   * - Puedes pasar un File[] (selección múltiple)
   */
  uploadWaypointImages(
    trackId: string,
    waypointId: string,
    files: File[],
  ): Observable<TrackWaypointImage[]> {
    return new Observable<TrackWaypointImage[]>((observer) => {
      (async () => {
        try {
          const compressed = await compressImages(files, {
            maxWidth: 1920,
            maxHeight: 1920,
            quality: 0.82,
            mimeType: 'image/webp',
          });

          const formData = new FormData();
          for (const file of compressed) {
            formData.append('images', file, file.name);
          }

          this.http
            .post<TrackWaypointImage[]>(
              `${this.baseUrl}/${trackId}/waypoints/${waypointId}/images`,
              formData,
              { withCredentials: true },
            )
            .subscribe({
              next: (res) => {
                observer.next(res);
                observer.complete();
              },
              error: (err) => observer.error(err),
            });
        } catch (e) {
          observer.error(e);
        }
      })();
    });
  }


  /**
   * ✅ Listar imágenes de un waypoint
   */
  listWaypointImages(
    trackId: string,
    waypointId: string,
  ): Observable<TrackWaypointImage[]> {
    return this.http.get<TrackWaypointImage[]>(
      `${this.baseUrl}/${trackId}/waypoints/${waypointId}/images`,
      { withCredentials: true },
    );
  }

  /**
   * ✅ Actualizar una imagen de waypoint (por ahora: order)
   */
  updateWaypointImage(
    trackId: string,
    waypointId: string,
    imageId: string,
    patch: { order?: number | null },
  ): Observable<TrackWaypointImage[]> {
    return this.http.patch<TrackWaypointImage[]>(
      `${this.baseUrl}/${trackId}/waypoints/${waypointId}/images/${imageId}`,
      patch,
      { withCredentials: true },
    );
  }

  /**
   * ✅ Borrar una imagen de waypoint
   */
  deleteWaypointImage(
    trackId: string,
    waypointId: string,
    imageId: string,
  ): Observable<{ ok: boolean; imageId: string; waypointId: string }> {
    return this.http.delete<{ ok: boolean; imageId: string; waypointId: string }>(
      `${this.baseUrl}/${trackId}/waypoints/${waypointId}/images/${imageId}`,
      { withCredentials: true },
    );
  }


  deleteAllTracks(): Observable<{ ok: boolean; deleted?: any; message?: string }> {
    return this.http.delete<{ ok: boolean; deleted?: any; message?: string }>(
      `${this.baseUrl}/purgue/all`,
      {withCredentials: true}
    );
  }


  /**
   * ✅ Link público “bonito” (con OG tags) para compartir en redes.
   * Backend ya lo tienes: GET /tracks/share/:id
   */
  buildShareUrl(trackId: string): string {
    // OJO: esto debe apuntar al dominio público, no al API_URL si API_URL es /api
    // Por eso uso DOMAIN_URL (sin /api)
    const domain = environment.DOMAIN_URL || 'https://ladamadelcancho.com';
    return `${domain}/#/dashboard/track/${encodeURIComponent(trackId)}`;
  }

  /**
   * ✅ Convierte una URL de imagen a absoluta si viene como "/uploads/..."
   * (Si tu getUrlImage actual devuelve endpoint por id, lo dejamos, pero
   * para share-card nos viene mejor tener la url pública directa si existe)
   */
  toAbsoluteUrl(id: string): string {
    if (!id) return '';

    const domain = environment.API_URL;
    // si url viene como "/uploads/track-images/xxx.png"
    return `${domain}/tracks/images/general/${id}`;
  }

}
