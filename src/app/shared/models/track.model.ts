// src/app/core/models/track.model.ts

export type RouteType = 'CIRCULAR' | 'OUT_AND_BACK' | 'POINT_TO_POINT';
export type Difficulty = 'EASY' | 'MODERATE' | 'HARD';

export interface TrackImage {
  id: string;
  url: string;
  order: number | null;
  created_at: string;
  trackId: string;
}

export interface Track {
  id: string;
  name: string;
  description?: string | null;
  gpxFilePath: string;
  dateTrack?: string | null;

  totalTimeSeconds: number;
  totalDistanceMeters: number;
  totalAscent: number;
  totalDescent: number;

  maxElevation: number;
  minElevation: number;

  routeType: RouteType;
  difficulty: Difficulty;
  authorUserId: string;

  startLat?: number | null;
  startLon?: number | null;
  startEle?: number | null;
  startTime?: string | null;

  created_at: string;
  updated_at: string;

  images?: TrackImage[]; // portada (en listTracks viene 0 o 1 imagen)
}

export interface TrackListResponse {
  items: Track[];
  total: number;
  page: number;
  limit: number;
  sortBy: 'date' | 'distance' | 'ascent' | 'time';
  sortOrder: 'asc' | 'desc';
}
