import { Injectable } from '@angular/core';
import { Difficulty, RouteType, Track } from '../../../shared/models/track.model';
import { TrackSortBy, TrackSortOrder } from '../../../shared/models/track-list-params-model';
import { UpdateUserResponse } from '../../../auth/interfaces/update-user.interface';

export type TracksUserSnapshot = {
  userId: string;

  user: UpdateUserResponse | null;

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
export class TracksUserStateService {
  private snapshot: TracksUserSnapshot | null = null;

  set(s: TracksUserSnapshot) {
    this.snapshot = s;
  }

  get(): TracksUserSnapshot | null {
    return this.snapshot;
  }

  clear() {
    this.snapshot = null;
  }
}
