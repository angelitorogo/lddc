import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { Difficulty, RouteType, Track } from '../../../shared/models/track.model';
import {
  TrackListParams,
  TrackSortBy,
  TrackSortOrder,
} from '../../../shared/models/track-list-params-model';

import { TrackListResponse } from '../../../shared/responses/list.response';
import { TracksService } from '../../services/track.service';
import { SearchResultsStateService } from '../../services/search-results-state.service';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-search-results',
  templateUrl: './search-results.component.html',
  styleUrls: ['./search-results.component.css'],
})
export class SearchResultsComponent implements OnInit, OnDestroy {
  q = '';

  tracks: Track[] = [];
  loading = false;
  error: string | null = null;

  // paginación
  page = 1;
  limit = 12;
  total = 0;

  // filtros (UI)
  filterRouteType: RouteType | '' = '';
  filterDifficulty: Difficulty | '' = '';
  filterMinDistanceKm: number | null = null;
  filterMaxDistanceKm: number | null = null;
  sortBy: TrackSortBy = 'date';
  sortOrder: TrackSortOrder = 'desc';

  // modal error
  showErrorModal = false;
  errorMessage = '';

  isRouteTypeOpen = false;
  isDifficultyOpen = false;
  isSortByOpen = false;
  isSortOrderOpen = false;

  isMobile = window.matchMedia('(max-width: 580px)').matches;

  loadingMore = false;
  canLoadMore = true;
  private lastRequestedPage = 0;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly tracksService: TracksService,
    private readonly searchState: SearchResultsStateService
  ) {}

  ngOnInit(): void {
    this.route.queryParamMap
      .pipe(takeUntil(this.destroy$))
      .subscribe((m) => {
        const nextQ = (m.get('q') ?? '').trim();

        // evita dobles cargas
        if (nextQ === this.q) return;

        this.q = nextQ;

        // ✅ 1) Intentar restaurar snapshot si coincide el q
        const snap = this.searchState.get();
        if (snap && snap.q === this.q) {
          this.tracks = snap.tracks ?? [];
          this.total = snap.total ?? 0;
          this.page = snap.page ?? 1;
          this.limit = snap.limit ?? 12;

          this.filterRouteType = snap.filterRouteType ?? '';
          this.filterDifficulty = snap.filterDifficulty ?? '';
          this.filterMinDistanceKm = snap.filterMinDistanceKm ?? null;
          this.filterMaxDistanceKm = snap.filterMaxDistanceKm ?? null;
          this.sortBy = snap.sortBy ?? 'date';
          this.sortOrder = snap.sortOrder ?? 'desc';

          this.canLoadMore = snap.canLoadMore ?? true;
          this.loading = false;
          this.loadingMore = false;
          this.error = null;
          this.lastRequestedPage = snap.lastRequestedPage ?? 0;

          setTimeout(() => window.scrollTo({ top: snap.scrollY ?? 0 }), 0);
          return;
        }

        // ✅ 2) Si no hay snapshot válido, limpiar snapshot viejo (de otro q)
        this.searchState.clear();

        // reset estado
        this.page = 1;
        this.total = 0;
        this.canLoadMore = true;
        this.tracks = [];
        this.error = null;
        this.loading = false;
        this.loadingMore = false;
        this.lastRequestedPage = 0;

        // si no hay q, no cargamos
        if (!this.q) return;

        // reset filtros a default (como Home)
        this.filterRouteType = '';
        this.filterDifficulty = '';
        this.filterMinDistanceKm = null;
        this.filterMaxDistanceKm = null;
        this.sortBy = 'date';
        this.sortOrder = 'desc';

        setTimeout(() => this.loadTracks(true), 0);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  

  loadTracks(reset: boolean = false): void {
    if (!this.q) return;

    if (reset) {
      this.page = 1;
      this.total = 0;
      this.canLoadMore = true;
      this.tracks = [];
    }

    if (this.lastRequestedPage === this.page && !reset) return;
    this.lastRequestedPage = this.page;

    if (this.isMobile && !reset && this.page > 1) {
      this.loadingMore = true;
    } else {
      this.loading = true;
    }

    this.error = null;

    const params: TrackListParams & { q: string } = {
      q: this.q,
      page: this.page,
      limit: this.limit,
      sortBy: this.sortBy,
      sortOrder: this.sortOrder,
    };

    if (this.filterRouteType) params.routeType = this.filterRouteType;
    if (this.filterDifficulty) params.difficulty = this.filterDifficulty;

    if (this.filterMinDistanceKm !== null && !Number.isNaN(this.filterMinDistanceKm)) {
      params.minDistance = Math.round(this.filterMinDistanceKm * 1000);
    }
    if (this.filterMaxDistanceKm !== null && !Number.isNaN(this.filterMaxDistanceKm)) {
      params.maxDistance = Math.round(this.filterMaxDistanceKm * 1000);
    }

    this.tracksService.searchTracks(params).subscribe({
      next: (res: TrackListResponse) => {
        if (this.isMobile && !reset && this.page > 1) {
          const existingIds = new Set(this.tracks.map((t) => t.id));
          const newOnes = res.items.filter((t) => !existingIds.has(t.id));
          this.tracks = [...this.tracks, ...newOnes];
        } else {
          this.tracks = res.items;
        }

        this.total = res.total;
        this.page = res.page;
        this.limit = res.limit;

        this.canLoadMore = this.page < this.totalPages;

        this.loading = false;
        this.loadingMore = false;

        if (this.tracks.length === 0 && reset) {
          this.errorMessage = 'No se han encontrado rutas para esa búsqueda y filtros.';
          this.showErrorModal = true;
        }
      },
      error: (err) => {
        console.error(err);
        this.error = 'Error cargando resultados';

        this.loading = false;
        this.loadingMore = false;

        this.errorMessage = this.error;
        this.showErrorModal = true;
      },
    });
  }

  loadMore(): void {
    if (!this.q) return;
    if (!this.canLoadMore) return;
    this.page++;
    this.loadTracks(false);
  }

  onApplyFilters(): void {
    this.loadTracks(true);
  }

  onResetFilters(): void {
    this.filterRouteType = '';
    this.filterDifficulty = '';
    this.filterMinDistanceKm = null;
    this.filterMaxDistanceKm = null;
    this.sortBy = 'date';
    this.sortOrder = 'desc';
    this.page = 1;
    this.loadTracks(true);
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

  closeErrorModal() {
    this.showErrorModal = false;
  }

  private closeAllSelects() {
    this.isRouteTypeOpen = false;
    this.isDifficultyOpen = false;
    this.isSortByOpen = false;
    this.isSortOrderOpen = false;
  }

  toggleRouteType() {
    const willOpen = !this.isRouteTypeOpen;
    this.closeAllSelects();
    this.isRouteTypeOpen = willOpen;
  }
  closeRouteType() {
    this.isRouteTypeOpen = false;
  }

  toggleDifficulty() {
    const willOpen = !this.isDifficultyOpen;
    this.closeAllSelects();
    this.isDifficultyOpen = willOpen;
  }
  closeDifficulty() {
    this.isDifficultyOpen = false;
  }

  toggleSortBy() {
    const willOpen = !this.isSortByOpen;
    this.closeAllSelects();
    this.isSortByOpen = willOpen;
  }
  closeSortBy() {
    this.isSortByOpen = false;
  }

  toggleSortOrder() {
    const willOpen = !this.isSortOrderOpen;
    this.closeAllSelects();
    this.isSortOrderOpen = willOpen;
  }
  closeSortOrder() {
    this.isSortOrderOpen = false;
  }

  @HostListener('document:click')
  onDocumentClick() {
    this.closeAllSelects();
  }

  @HostListener('window:scroll', [])
  onWindowScroll() {
    if (!this.isMobile) return;
    if (!this.q) return;
    if (this.loading || this.loadingMore || !this.canLoadMore) return;

    const threshold = 250;
    const pos = window.innerHeight + window.scrollY;
    const max = document.documentElement.scrollHeight;

    if (max - pos < threshold) {
      this.loadMore();
    }
  }

  @HostListener('window:resize')
  onResize() {
    const next = window.matchMedia('(max-width: 580px)').matches;

    if (next !== this.isMobile) {
      this.isMobile = next;
      this.page = 1;
      this.canLoadMore = true;
      this.tracks = [];
      if (this.q) this.loadTracks(true);
    }
  }

  trackById = (_: number, t: Track) => t.id;
  
  onOpenDetailFromHome(track: Track) {
    if (!track?.id) return;

    this.searchState.set({
      q: this.q,

      tracks: this.tracks,
      total: this.total,
      page: this.page,
      limit: this.limit,

      filterRouteType: this.filterRouteType,
      filterDifficulty: this.filterDifficulty,
      filterMinDistanceKm: this.filterMinDistanceKm,
      filterMaxDistanceKm: this.filterMaxDistanceKm,
      sortBy: this.sortBy,
      sortOrder: this.sortOrder,

      canLoadMore: this.canLoadMore,
      lastRequestedPage: this.lastRequestedPage,

      scrollY: window.scrollY ?? 0,
    });

    this.router.navigate(['/dashboard/track', track.id]);
}

}
