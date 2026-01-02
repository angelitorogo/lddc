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
import { ViewportTracksQuery, ViewportTracksResponse } from '../../shared/interfaces/viewport.interfaces';

@Injectable({
  providedIn: 'root',
})
export class TracksService {
  private readonly baseUrl = `${environment.API_URL}/tracks`;

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
    return `${this.baseUrl}/images/${image.id}`;
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

  searchTracks(params: {
    q: string;
    page?: number;
    limit?: number;
  }): Observable<any> {
    let httpParams = new HttpParams().set('q', params.q);

    httpParams = httpParams.set('page', String(params.page ?? 1));
    httpParams = httpParams.set('limit', String(params.limit ?? 10));

    return this.http.get<any>(`${this.baseUrl}/search`, {
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

}
