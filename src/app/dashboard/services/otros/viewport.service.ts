import { Injectable } from '@angular/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import { map, shareReplay } from 'rxjs/operators';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ViewportService {

  /** True si el viewport es considerado "móvil" */
  readonly isMobile$: Observable<boolean>;

  /** True si es escritorio (lo contrario de móvil) */
  readonly isDesktop$: Observable<boolean>;

  constructor(private breakpointObserver: BreakpointObserver) {

    // aquí decides el ancho a partir del cual es "móvil"
    this.isMobile$ = this.breakpointObserver
      .observe(['(max-width: 1200px)'])
      .pipe(
        map(result => result.matches),
        shareReplay(1)   // cachea el último valor para todos los suscriptores
      );

    this.isDesktop$ = this.isMobile$.pipe(
      map(isMobile => !isMobile),
      shareReplay(1)
    );
  }
}
