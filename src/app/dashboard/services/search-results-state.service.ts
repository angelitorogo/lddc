import { Injectable } from '@angular/core';
import { Difficulty, RouteType, Track } from '../../shared/models/track.model';
import { TrackSortBy, TrackSortOrder } from '../../shared/models/track-list-params-model';

export type SearchResultsSnapshot = {
  q: string;

  tracks: Track[];
  total: number;
  page: number;
  limit: number;

  filterRouteType: RouteType | '';
  filterDifficulty: Difficulty | '';
  filterMinDistanceKm: number | null;
  filterMaxDistanceKm: number | null;
  sortBy: TrackSortBy;
  sortOrder: TrackSortOrder;

  canLoadMore: boolean;
  lastRequestedPage: number;

  scrollY: number;
};

@Injectable({ providedIn: 'root' })
export class SearchResultsStateService {
  private snapshot: SearchResultsSnapshot | null = null;

  set(snapshot: SearchResultsSnapshot) {
    this.snapshot = snapshot;
  }

  get(): SearchResultsSnapshot | null {
    return this.snapshot;
  }

  clear() {
    this.snapshot = null;
  }

  has(): boolean {
    return !!this.snapshot;
  }
}
