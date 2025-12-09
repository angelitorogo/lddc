// src/app/shared/services/analytics.service.ts
import { Injectable, Inject } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { DOCUMENT } from '@angular/common';
import { filter, Subscription } from 'rxjs';
import { CookiePreferencesService } from './cookie-preferences.service';
import { environment } from '../../../../environments/environment';

declare global {
  interface Window {
    dataLayer: any[];
    gtag: (...args: any[]) => void;
  }
}

@Injectable({ providedIn: 'root' })
export class AnalyticsService {

  private scriptId = 'ga4-script';
  private initialized = false;
  private routerSub?: Subscription;

  private measurementId = environment.GAMEASUREMENTID;

  constructor(
    @Inject(DOCUMENT) private document: Document,
    private router: Router,
    private cookiePrefs: CookiePreferencesService,
  ) {}

  /** Llamar una vez al arrancar la app (por ejemplo en AppComponent.ngOnInit) */
  init(): void {
    // 1) Solo en producción
    if (!environment.PRODUCTION) {
      //console.log('[Analytics] Desactivado en entorno no producción');
      return;
    }

    // 2) Sin consentimiento de analítica, no hacemos nada
    if (!this.cookiePrefs.hasConsent('analytics')) {
      //console.log('[Analytics] Sin consentimiento de analítica, no se carga GA4');
      return;
    }

    // 3) Si ya está inicializado o no tenemos ID, salimos
    if (this.initialized || !this.measurementId) {
      return;
    }

    this.loadScript();
    this.setupPageViewTracking();
    this.initialized = true;
  }

  /** Cargar script de GA4 */
  private loadScript(): void {
    if (this.document.getElementById(this.scriptId)) {
      return;
    }

    // Crea <script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXX"></script>
    const script = this.document.createElement('script');
    script.id = this.scriptId;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${this.measurementId}`;
    this.document.head.appendChild(script);

    // Inicializa dataLayer y gtag
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      window.dataLayer.push(arguments);
    };

    window.gtag('js', new Date());
    window.gtag('config', this.measurementId);

    //console.log('[Analytics] GA4 inicializado con ID', this.measurementId);
  }

  /** Track automático de page views con el router de Angular */
  private setupPageViewTracking(): void {
    this.routerSub = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        if (!this.initialized) return;

        window.gtag('event', 'page_view', {
          page_path: event.urlAfterRedirects,
        });
      });
  }

  /** Llamar cada vez que cambien las preferencias de cookies */
  onPreferencesChanged(): void {
    if (!environment.PRODUCTION) return;

    const prefs = this.cookiePrefs.getSnapshot();

    if (prefs.analytics && !this.initialized) {
      // Antes no había consentimiento, ahora sí → inicializamos
      this.init();
    }

    if (!prefs.analytics && this.initialized) {
      // En la práctica GA no tiene “unload” por script fácil.
      // Lo correcto legalmente suele ser:
      // - Dejar de enviar eventos (ya pasa, porque no llamamos más a nada).
      // - Sugerir recargar la página para limpiar cookies.
      console.warn('[Analytics] Se ha retirado el consentimiento de analítica. Para limpiar cookies puede ser necesario recargar la página.');
    }
  }

  ngOnDestroy(): void {
    this.routerSub?.unsubscribe();
  }
}
