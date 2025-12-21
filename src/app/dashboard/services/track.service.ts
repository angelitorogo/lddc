// src/app/core/services/tracks.service.ts

import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { TrackListParams } from '../../shared/models/track-list-params-model';
import { DetailResponse } from '../../shared/responses/detail.response';
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

  constructor(private http: HttpClient) { }

  /**
   * Lista tracks con filtros y paginación.
   * Mapea directamente al endpoint GET /tracks del client-gateway.
   */
  getTracks(params: TrackListParams = {}): Observable<TrackListResponse> {
    let httpParams = new HttpParams();

    //usuario
    if (params.userId !== undefined) {
      httpParams = httpParams.set('userId', params.userId.toString());
    }

    // paginación
    if (params.page !== undefined) {
      httpParams = httpParams.set('page', params.page.toString());
    }
    if (params.limit !== undefined) {
      httpParams = httpParams.set('limit', params.limit.toString());
    }

    // filtros
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

    // ordenación
    if (params.sortBy) {
      httpParams = httpParams.set('sortBy', params.sortBy);
    }
    if (params.sortOrder) {
      httpParams = httpParams.set('sortOrder', params.sortOrder);
    }

    //console.log(httpParams)

    return this.http.get<TrackListResponse>(this.baseUrl, {
      params: httpParams,
      withCredentials: true, // por si usas cookies de sesión (no afecta a GET)
    });
  }

  getTrackById(id: string): Observable<DetailResponse> {
    return this.http.get<any>(
      `${this.baseUrl}/${id}`,
      { withCredentials: true } // por si usas cookies de sesión (no afecta a GET)
    );
  }

  createFromGpx(
    name: string,
    description: string | null,
    gpxFile: File,
    images: File[],
  ): Observable<CreateTrackResponse> {

    // OJO: esto es async, así que lo convertimos a Observable con from(...)
    return new Observable<CreateTrackResponse>((observer) => {
      (async () => {
        try {
          const compressed = await compressImages(images, {
            maxWidth: 1920, //1600
            maxHeight: 1920, //1600
            quality: 0.82, //0.78
            mimeType: 'image/webp',
          });

          const formData = new FormData();
          formData.append('name', name);
          if (description) formData.append('description', description);
          formData.append('gpx', gpxFile, gpxFile.name);

          compressed.forEach((img) => formData.append('images', img, img.name));

          this.http.post<CreateTrackResponse>(`${this.baseUrl}/gpx`, formData, {
            withCredentials: true,
          }).subscribe({
            next: (res) => { observer.next(res); observer.complete(); },
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

    return this.http.get<NearbyTrackItem[]>(`${this.baseUrl}/nearby`, { params: httpParams });
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
            maxWidth: 1920, //1600
            maxHeight: 1920, //1600
            quality: 0.82, //0.78
            mimeType: 'image/webp',
          });

          const form = new FormData();
          if (data.name != null) form.append('name', data.name);
          if (data.description != null) form.append('description', data.description);

          for (const file of compressed) {
            form.append('images', file, file.name);
          }

          this.http.put<any>(`${this.baseUrl}/${trackId}`, form, {
            withCredentials: true,
          }).subscribe({
            next: (res) => { observer.next(res); observer.complete(); },
            error: (err) => observer.error(err),
          });

        } catch (e) {
          observer.error(e);
        }
      })();
    });
  }

  // ✅ NUEVO: borrar imagen existente
  deleteTrackImage(trackId: string, imageId: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/${trackId}/images/${imageId}`, {
      withCredentials: true,
    });
  }

  // ✅ si ya tienes esto en TrackDetail, puedes reutilizarlo aquí también
  getUrlImage(image: any): string {
    return `${this.baseUrl}/images/${image.id}`;
  }

  deleteTrack(trackId: string) {
    return this.http.delete(`${this.baseUrl}/${trackId}`, {
      withCredentials: true,
    });
  }

  /**
   * Obtiene tracks cuyo punto de inicio (startLat/startLon) cae dentro del viewport.
   * Importante: withCredentials por si estás usando cookies de sesión.
   */
  getTracksInViewport(query: ViewportTracksQuery): Observable<ViewportTracksResponse> {
    let params = new HttpParams()
      .set('minLat', String(query.minLat))
      .set('maxLat', String(query.maxLat))
      .set('minLng', String(query.minLng))
      .set('maxLng', String(query.maxLng));

    if (query.zoomLevel !== undefined && query.zoomLevel !== null) {
      params = params.set('zoomLevel', String(query.zoomLevel));
    }

    // Ajusta el path si tu controller usa otro prefijo
    return this.http.get<ViewportTracksResponse>(`${this.baseUrl}/viewport`, {
      params,
      withCredentials: true,
    });
  }


  /**
   * Busca tracks por texto (GET /tracks/search)
   */
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

}
