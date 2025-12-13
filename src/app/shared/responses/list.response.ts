import { Track } from "../models/track.model";

export interface TrackListResponse {
  items: Track[];
  total: number;
  page: number;
  limit: number;
  sortBy: 'date' | 'distance' | 'ascent' | 'time';
  sortOrder: 'asc' | 'desc';
}