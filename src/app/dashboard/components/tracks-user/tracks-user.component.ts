// src/app/dashboard/pages/home/home.component.ts

import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { Difficulty, RouteType, Track } from '../../../shared/models/track.model';
import { TrackListParams, TrackSortBy, TrackSortOrder } from '../../../shared/models/track-list-params-model';
import { TracksService } from '../../services/track.service';
import { TrackListResponse } from '../../../shared/responses/list.response';
import { Subscription } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../auth/services/auth.service';
import { UpdateUserResponse } from '../../../auth/interfaces/update-user.interface';


@Component({
  selector: 'app-tracks-user',
  templateUrl: './tracks-user.component.html',
  styleUrls: ['./tracks-user.component.css'],
})
export class TracksUserComponent implements OnInit, OnDestroy {

  private routeSub?: Subscription;

  tracks: Track[] = [];
  loading = false;
  error: string | null = null;

  // paginación
  page = 1;
  limit = 12;
  total = 0;

  //autor-track
  userId: string = '';

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

  isRouteTypeOpen = false;
  isDifficultyOpen = false;
  isSortByOpen = false;
  isSortOrderOpen = false;

  isMobile = window.matchMedia('(max-width: 580px)').matches;

  loadingMore = false;     // para infinite scroll
  canLoadMore = true;      // si ya no hay más páginas, lo paramos
  private lastRequestedPage = 0; // evita dobles cargas

  // para mostrar en el template
  readonly routeTypes: { value: RouteType; label: string }[] = [
    { value: 'CIRCULAR', label: 'Circular' },
    { value: 'OUT_AND_BACK', label: 'Ida y vuelta' },
    { value: 'POINT_TO_POINT', label: 'Lineal' },
  ];
  
  user: UpdateUserResponse | null = null;

  constructor(private tracksService: TracksService, public authService:AuthService, private router: Router,
      private route: ActivatedRoute) {}

  ngOnInit(): void {

    this.routeSub = this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (!id) return;

    
      this.userId = id;

      setTimeout(() => {
        this.loadUser(this.userId);
        this.loadTracks(this.userId, true);
      }, 100);

      

    });

  }

  ngOnDestroy(): void {
      this.routeSub?.unsubscribe();
  }

  loadUser(userId: string) {

    this.authService.getUserById(userId).subscribe( (res: UpdateUserResponse) => {
      this.user = res;
    })

  }

  loadTracks( userId: string, reset: boolean = false): void {
    // En reset: volver al estado inicial
    if (reset) {
      this.page = 1;
      this.total = 0;
      this.canLoadMore = true;
      this.tracks = [];
    }

    // evita pedir dos veces la misma page
    if (this.lastRequestedPage === this.page && !reset) return;
    this.lastRequestedPage = this.page;

    // flags de carga
    if (this.isMobile && !reset && this.page > 1) {
      this.loadingMore = true;
    } else {
      this.loading = true;
    }

    this.error = null;

    const params: TrackListParams = {
      userId: userId,
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

    //console.log(params)

    this.tracksService.getTracks(params).subscribe({
      next: (res: TrackListResponse) => {
        // concat en móvil si no es reset y page>1
        
        if (this.isMobile && !reset && this.page > 1) {
          const existingIds = new Set(this.tracks.map(t => t.id));
          const newOnes = res.items.filter(t => !existingIds.has(t.id));
          this.tracks = [...this.tracks, ...newOnes];
        } else {
          this.tracks = res.items;
        }

        //console.log(this.tracks)

        this.total = res.total;
        this.page = res.page;
        this.limit = res.limit;

        // ¿hay más páginas?
        this.canLoadMore = this.page < this.totalPages;

        this.loading = false;
        this.loadingMore = false;

        // tu lógica de “sin rutas” / modal:
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
          // IMPORTANTE: en móvil con infinite scroll NO queremos modal al cargar más.
          // Solo mostrar modal si es reset (aplicar filtros / limpiar)
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
    this.loadTracks(this.userId, false);
  }
    

  onApplyFilters(): void {
    this.loadTracks(this.userId, true);
  }

  onResetFilters(): void {
    this.filterRouteType = '';
    this.filterDifficulty = '';
    this.filterMinDistanceKm = null;
    this.filterMaxDistanceKm = null;
    this.sortBy = 'date';
    this.sortOrder = 'desc';
    this.page = 1;
    this.loadTracks(this.userId, true);
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
    this.loadTracks(this.userId);
  }

  goNext(): void {
    if (!this.canGoNext()) return;
    this.page++;
    this.loadTracks(this.userId);
  }

  
  // 🔹 Cerrar el modal
  closeErrorModal() {
    this.showErrorModal = false;
  }

  // 🔹 Cierra TODOS los selects
  private closeAllSelects() {
    this.isRouteTypeOpen = false;
    this.isDifficultyOpen = false;
    this.isSortByOpen = false;
    this.isSortOrderOpen = false;
  }


  // 🔹 Toggler de cada select (cierra los demás antes de abrir)
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

  // 🔹 Click en cualquier parte del documento → cerrar todos
  @HostListener('document:click')
  onDocumentClick() {
    this.closeAllSelects();
  }

  @HostListener('window:scroll', [])
  onWindowScroll() {
    if (!this.isMobile) return;
    if (this.loading || this.loadingMore || !this.canLoadMore) return;

    // umbral: cuando quede poco para el final
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

    // si cambia el modo (de desktop->móvil o al revés) reseteamos y recargamos
    if (next !== this.isMobile) {
      this.isMobile = next;
      this.page = 1;
      this.canLoadMore = true;
      this.tracks = [];
      this.loadTracks(this.userId, true);
    }
  }

  trackById = (_: number, t: Track) => t.id;


}
