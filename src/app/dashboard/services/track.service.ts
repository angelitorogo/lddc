// src/app/core/services/tracks.service.ts

import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { TrackListParams } from '../../shared/models/track-list-params-model';
import { TrackListResponse } from '../../shared/models/track.model';


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

    return this.http.get<TrackListResponse>(this.baseUrl, {
      params: httpParams,
      withCredentials: true, // por si usas cookies de sesión (no afecta a GET)
    });
  }
}
