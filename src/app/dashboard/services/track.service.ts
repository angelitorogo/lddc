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


@Injectable({
  providedIn: 'root',
})
export class TracksService {
  private readonly baseUrl = `${environment.API_URL}/tracks`;

  constructor(private http: HttpClient) {}

  /**
   * Lista tracks con filtros y paginación.
   * Mapea directamente al endpoint GET /tracks del client-gateway.
   */
  getTracks(params: TrackListParams = {}): Observable<TrackListResponse> {
    let httpParams = new HttpParams();

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
    const formData = new FormData();

    formData.append('name', name);
    if (description) {
      formData.append('description', description);
    }

    // campo "gpx" -> coincide con FileFieldsInterceptor({ name: 'gpx' })
    formData.append('gpx', gpxFile, gpxFile.name);

    // campo "images" -> puede haber varias
    images.forEach((img) => {
      formData.append('images', img, img.name);
    });

    return this.http.post<CreateTrackResponse>(
      `${this.baseUrl}/gpx`,
      formData,
      {
        withCredentials: true, // para cookies de sesión
      },
    );
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

}
