// src/app/dashboard/pages/home/home.component.ts

import { Component, HostListener, OnInit } from '@angular/core';
import { Difficulty, RouteType, Track, TrackListResponse } from '../../../shared/models/track.model';
import { TrackListParams, TrackSortBy, TrackSortOrder } from '../../../shared/models/track-list-params-model';
import { TracksService } from '../../services/track.service';
import { Router } from '@angular/router';
import { environment } from '../../../../environments/environment';


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

  // 🔹 Estado del modal de error
  showErrorModal = false;
  errorMessage = '';

  isRouteTypeOpen = false;
  isDifficultyOpen = false;
  isSortByOpen = false;
  isSortOrderOpen = false;

  // para mostrar en el template
  readonly routeTypes: { value: RouteType; label: string }[] = [
    { value: 'CIRCULAR', label: 'Circular' },
    { value: 'OUT_AND_BACK', label: 'Ida y vuelta' },
    { value: 'POINT_TO_POINT', label: 'Lineal' },
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

        //console.log(this.tracks)

        if(this.tracks.length === 0 ) {
          // 🔹 Guardamos el mensaje y abrimos el modal
          this.errorMessage = 'No se han encontrado rutas con esos filtros.'
          this.showErrorModal = true;
        }

        
      },
      error: (err) => {
        console.error(err);
        this.error = 'Error cargando rutas';
        this.loading = false;

        // 🔹 Guardamos el mensaje y abrimos el modal
        this.errorMessage = this.error
        this.showErrorModal = true;
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

  


}
