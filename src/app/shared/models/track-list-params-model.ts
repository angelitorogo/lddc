// src/app/core/models/track-list-params.model.ts

import { Difficulty, RouteType } from './track.model';

export type TrackSortBy = 'date' | 'distance' | 'ascent' | 'time';
export type TrackSortOrder = 'asc' | 'desc';

export interface TrackListParams {
  userId?: string;
  page?: number;
  limit?: number;
  routeType?: RouteType;
  minDistance?: number; // en metros
  maxDistance?: number; // en metros
  sortBy?: TrackSortBy;
  sortOrder?: TrackSortOrder;
  difficulty?: Difficulty;
}
