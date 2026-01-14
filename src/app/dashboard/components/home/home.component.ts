// src/app/dashboard/pages/home/home.component.ts

import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';

import { Difficulty, RouteType, Track } from '../../../shared/models/track.model';
import {
  TrackListParams,
  TrackSortBy,
  TrackSortOrder,
} from '../../../shared/models/track-list-params-model';
import { TracksService } from '../../services/track.service';
import { TrackListResponse } from '../../../shared/responses/list.response';
import { filter, Subscription } from 'rxjs';
import { NavigationStart, Router } from '@angular/router';
import { HomeStateService } from '../../services/state/home-state.service';
import { AuthService } from '../../../auth/services/auth.service';
import { CookiePreferencesService } from '../../services/otros/cookie-preferences.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css'],
})
export class HomeComponent implements OnInit  {
  tracks: Track[] = [];
  loading = false;
  error: string | null = null;

  // paginación
  page = 1;
  limit = 36;
  total = 0;

  // filtros (UI)
  filterRouteType: RouteType | '' = '';
  filterDifficulty: Difficulty | '' = '';
  filterMinDistanceKm: number | null = null;
  filterMaxDistanceKm: number | null = null;
  sortBy: TrackSortBy = 'date';
  sortOrder: TrackSortOrder = 'desc';

  // 🔹 Estado del modal de error
  showErrorModal = false;
  errorMessage = '';

  showSuccessModal = false;


  isRouteTypeOpen = false;
  isDifficultyOpen = false;
  isSortByOpen = false;
  isSortOrderOpen = false;

  isMobile = window.matchMedia('(max-width: 580px)').matches;

  loadingMore = false; // para infinite scroll
  canLoadMore = true; // si ya no hay más páginas, lo paramos
  private lastRequestedPage = 0; // evita dobles cargas

  // para mostrar en el template
  readonly routeTypes: { value: RouteType; label: string }[] = [
    { value: 'CIRCULAR', label: 'Circular' },
    { value: 'OUT_AND_BACK', label: 'Ida y vuelta' },
    { value: 'POINT_TO_POINT', label: 'Lineal' },
  ];

  


  constructor(private tracksService: TracksService, private router: Router,
    private homeState: HomeStateService, public authService: AuthService, public cookiePrefs: CookiePreferencesService) {}

  ngOnInit(): void {
    // ✅ Si venimos de un Track y hay snapshot -> restaurar y NO recargar
    const snap = this.homeState.get();
    if (snap) {
      this.tracks = snap.tracks ?? [];
      this.total = snap.total ?? this.total;
      this.page = snap.page ?? this.totalPages;
      this.limit = snap.limit ?? this.limit;

      this.filterRouteType = snap.filterRouteType ?? '';
      this.filterDifficulty = snap.filterDifficulty ?? '';
      this.filterMinDistanceKm = snap.filterMinDistanceKm ?? null;
      this.filterMaxDistanceKm = snap.filterMaxDistanceKm ?? null;
      this.sortBy = snap.sortBy ?? 'date';
      this.sortOrder = snap.sortOrder ?? 'desc';

      this.canLoadMore = snap.canLoadMore ?? true;
      this.loadingMore = false;
      this.lastRequestedPage = snap.lastRequestedPage ?? 0;

      // ✅ restaurar scroll
      setTimeout(() => window.scrollTo({ top: snap.scrollY ?? 0 }), 0);
      return;
    }

    // carga normal
    setTimeout(() => {
      this.loadTracks(true);
    }, 100);
  }

  get adInterval(): number {
    return this.isMobile ? 8 : 12;
  }

  loadTracks(reset: boolean = false): void {
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

    const params: TrackListParams = {
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

    this.tracksService.getTracks(params).subscribe({
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

        if (
          this.tracks.length === 0 &&
          !this.filterRouteType &&
          !this.filterDifficulty &&
          !this.filterMinDistanceKm &&
          !this.filterMaxDistanceKm &&
          this.sortBy === 'date' &&
          this.sortOrder === 'desc'
        ) {
          this.error = 'No hay ninguna ruta subida aún';
        } else {
          if (this.tracks.length === 0 && reset) {
            this.errorMessage = 'No se han encontrado rutas con esos filtros.';
            this.showErrorModal = true;
          }
        }
      },
      error: (err) => {
        console.error(err);
        this.error = 'Error cargando rutas';

        this.loading = false;
        this.loadingMore = false;

        this.errorMessage = this.error;
        this.showErrorModal = true;
      },
    });
  }

  loadMore(): void {
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

    // ✅ si limpias filtros, tiene sentido limpiar snapshot (opcional)
    this.homeState.clear();

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

      // ✅ cambio de layout: mejor limpiar snapshot
      this.homeState.clear();

      this.loadTracks(true);
    }
  }

  trackById = (_: number, t: Track) => t.id;

  onOpenDetailFromHome(track: Track) {
    if (!track?.id) return;

    this.homeState.set({
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

  deleteAllTracks():void {
    this.tracksService.deleteAllTracks().subscribe({
      next: (res) => {
        this.showSuccessModal = true;
        this.loadTracks(true);
      },
      error: (err) => console.error(err),
    });
  }

  closeSuccessModal() {
    this.showSuccessModal = false;
  }

  

}
