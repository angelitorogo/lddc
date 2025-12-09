// src/app/dashboard/pages/home/home.component.ts

import { Component, OnInit } from '@angular/core';
import { Difficulty, RouteType, Track, TrackListResponse } from '../../../shared/models/track.model';
import { TrackListParams, TrackSortBy, TrackSortOrder } from '../../../shared/models/track-list-params-model';
import { TracksService } from '../../services/track.service';


@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css'],
})
export class HomeComponent implements OnInit {
  tracks: Track[] = [];
  loading = false;
  error: string | null = null;

  // paginación
  page = 1;
  limit = 10;
  total = 0;

  // filtros (UI)
  filterRouteType: RouteType | '' = '';
  filterDifficulty: Difficulty | '' = '';
  filterMinDistanceKm: number | null = null;
  filterMaxDistanceKm: number | null = null;
  sortBy: TrackSortBy = 'date';
  sortOrder: TrackSortOrder = 'desc';

  // para mostrar en el template
  readonly routeTypes: { value: RouteType; label: string }[] = [
    { value: 'CIRCULAR', label: 'Circular' },
    { value: 'OUT_AND_BACK', label: 'Ida y vuelta' },
    { value: 'POINT_TO_POINT', label: 'Punto a punto' },
  ];

  constructor(private tracksService: TracksService) {}

  ngOnInit(): void {
    this.loadTracks();
  }

  loadTracks(): void {
    this.loading = true;
    this.error = null;

    const params: TrackListParams = {
      page: this.page,
      limit: this.limit,
      sortBy: this.sortBy,
      sortOrder: this.sortOrder,
    };

    if (this.filterRouteType) {
      params.routeType = this.filterRouteType;
    }

    if (this.filterDifficulty) {
      params.difficulty = this.filterDifficulty;
    }

    if (this.filterMinDistanceKm !== null && !Number.isNaN(this.filterMinDistanceKm)) {
      params.minDistance = Math.round(this.filterMinDistanceKm * 1000);
    }

    if (this.filterMaxDistanceKm !== null && !Number.isNaN(this.filterMaxDistanceKm)) {
      params.maxDistance = Math.round(this.filterMaxDistanceKm * 1000);
    }

    this.tracksService.getTracks(params).subscribe({
      next: (res: TrackListResponse) => {
        this.tracks = res.items;
        this.total = res.total;
        this.page = res.page;
        this.limit = res.limit;
        this.loading = false;
      },
      error: (err) => {
        console.error(err);
        this.error = 'Error cargando rutas';
        this.loading = false;
      },
    });
  }

  onApplyFilters(): void {
    this.page = 1;
    this.loadTracks();
  }

  onResetFilters(): void {
    this.filterRouteType = '';
    this.filterDifficulty = '';
    this.filterMinDistanceKm = null;
    this.filterMaxDistanceKm = null;
    this.sortBy = 'date';
    this.sortOrder = 'desc';
    this.page = 1;
    this.loadTracks();
  }

  get totalPages(): number {
    return this.total > 0 ? Math.ceil(this.total / this.limit) : 1;
  }

  canGoPrev(): boolean {
    return this.page > 1;
  }

  canGoNext(): boolean {
    return this.page < this.totalPages;
  }

  goPrev(): void {
    if (!this.canGoPrev()) return;
    this.page--;
    this.loadTracks();
  }

  goNext(): void {
    if (!this.canGoNext()) return;
    this.page++;
    this.loadTracks();
  }

  trackDistanceKm(track: Track): string {
    return (track.totalDistanceMeters / 1000).toFixed(1);
  }

  trackAscent(track: Track): string {
    return `${track.totalAscent} m`;
  }

  trackDate(track: Track): string {
    if (!track.dateTrack) return '-';
    return new Date(track.dateTrack).toLocaleDateString();
  }

  trackImageUrl(track: Track): string | null {
    if (track.images && track.images.length > 0) {
      return track.images[0].url;
    }
    return null;
  }
}
