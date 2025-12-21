import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormControl } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, filter, finalize, switchMap, takeUntil, catchError, of } from 'rxjs';
import { TracksService } from '../../../dashboard/services/track.service';

@Component({
  selector: 'app-searchbar',
  templateUrl: './searchbar.component.html',
  styleUrls: ['./searchbar.component.css'],
})
export class SearchbarComponent implements OnInit, OnDestroy {
  @ViewChild('inputEl') inputEl!: ElementRef<HTMLInputElement>;

  control = new FormControl<string>('', { nonNullable: true });

  loading = false;
  error = '';
  open = false;

  // resultados
  results: any[] = [];
  total = 0;

  // paginación simple (si luego quieres “ver más”)
  private page = 1;
  private readonly limit = 8;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly tracksService: TracksService,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    this.control.valueChanges
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(250),
        distinctUntilChanged(),
        // si está vacío, cerramos
        switchMap((raw) => {
          const q = (raw ?? '').trim();

          this.error = '';
          this.page = 1;

          if (!q) {
            this.results = [];
            this.total = 0;
            this.open = false;
            return of(null);
          }

          this.loading = true;
          this.open = true;

          return this.tracksService.searchTracks({ q, page: this.page, limit: this.limit }).pipe(
            finalize(() => (this.loading = false)),
            catchError((err) => {
              this.error =
                err?.error?.message ||
                err?.message ||
                'No se pudo completar la búsqueda.';
              this.results = [];
              this.total = 0;
              return of(null);
            })
          );
        }),
        filter((res) => res !== null)
      )
      .subscribe((res: any) => {
        // asumimos shape: { items, total } (ajústalo si tu backend devuelve otro)
        const items = res?.items ?? res?.data?.items ?? [];
        const total = res?.total ?? res?.data?.total ?? items.length;

        this.results = items;
        this.total = total;
        this.open = true;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // =========================
  // UI events
  // =========================

  onFocus(): void {
    if ((this.control.value ?? '').trim() && (this.results.length > 0 || this.loading || this.error)) {
      this.open = true;
    }
  }

  clear(): void {
    this.control.setValue('');
    this.results = [];
    this.total = 0;
    this.error = '';
    this.open = false;
    // opcional: mantener focus
    queueMicrotask(() => this.inputEl?.nativeElement?.focus());
  }

  onSubmit(): void {
    const q = (this.control.value ?? '').trim();
    if (!q) return;

    // Opción A: navegar a una pantalla de resultados (si la tienes o la crearás)
    // this.router.navigate(['/dashboard/search'], { queryParams: { q } });

    // Opción B: quedarte en el dropdown y no navegar (no hago nada)
    this.open = true;
  }

  onPickTrack(track: any): void {
    if (!track?.id) return;
    this.open = false;
    this.router.navigate(['/dashboard/track', track.id]);
  }

  // cerrar dropdown al click fuera
  @HostListener('document:click', ['$event'])
  onDocumentClick(ev: MouseEvent): void {
    const target = ev.target as HTMLElement | null;
    if (!target) return;

    // Si el click ocurre dentro del propio componente, no cerramos
    const host = target.closest('app-searchbar');
    if (host) return;

    this.open = false;
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown(ev: KeyboardEvent): void {
    if (ev.key === 'Escape') {
      this.open = false;
    }
  }

  // helpers UI
  trackTitle(t: any): string {
    return t?.name ?? 'Ruta';
  }

  trackMeta(t: any): string {
    const km = typeof t?.totalDistanceMeters === 'number'
      ? (t.totalDistanceMeters / 1000).toFixed(1) + ' km'
      : null;

    const ascent = typeof t?.totalAscent === 'number'
      ? `+${t.totalAscent} m`
      : null;

    return [km, ascent].filter(Boolean).join(' · ');
  }
}
