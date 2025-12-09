// src/app/shared/services/ads.service.ts
import { Injectable, Inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { environment } from '../../../../environments/environment';
import { CookiePreferencesService } from './cookie-preferences.service';

declare global {
  interface Window {
    adsbygoogle: any[];
    // Propiedad usada para modo no personalizado
    requestNonPersonalizedAds?: number;
  }
}

@Injectable({ providedIn: 'root' })
export class AdsService {
  private scriptId = 'adsense-script';
  private initialized = false;

  // Tu client de AdSense definido en environment.prod.ts
  public readonly clientId = environment.ADSCLIENTID; // ej: 'ca-pub-XXXXXXXXXXXX'

  constructor(
    @Inject(DOCUMENT) private document: Document,
    private cookiePrefs: CookiePreferencesService,
  ) {}

  /**
   * Llamar una vez (por ejemplo en AppComponent.ngOnInit)
   */
  init(): void {
    if (!environment.PRODUCTION) {
      //console.log('[Ads] Desactivado en entorno no producción');
      return;
    }

    if (this.initialized) {
      return;
    }

    if (!this.clientId) {
      //console.warn('[Ads] No hay ADSCLIENTID configurado. No se carga AdSense.');
      return;
    }

    const hasAdsConsent = this.cookiePrefs.hasConsent('ads');

    if (!hasAdsConsent) {
      // Modo NO PERSONALIZADO (contextual)
      (window as any).adsbygoogle = (window as any).adsbygoogle || [];
      (window as any).adsbygoogle.requestNonPersonalizedAds = 1;
      //console.log('[Ads] Consentimiento de Ads denegado: se usarán anuncios NO personalizados.');
    } else {
      //console.log('[Ads] Consentimiento de Ads aceptado: se usarán anuncios PERSONALIZADOS.');
    }

    this.loadScript();
    this.initialized = true;
  }

  /**
   * Script global de AdSense (Auto Ads + manuales)
   */
  private loadScript(): void {
    if (this.document.getElementById(this.scriptId)) {
      return;
    }

    const script = this.document.createElement('script');
    script.id = this.scriptId;
    script.async = true;
    script.src =
      `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${this.clientId}`;
    script.setAttribute('crossorigin', 'anonymous');
    this.document.head.appendChild(script);

    //console.log('[Ads] Script de AdSense inyectado');
  }

  /**
   * Para banners manuales: empuja un nuevo anuncio en un <ins>
   * A estas alturas:
   *  - si el usuario aceptó Ads → personalizados
   *  - si el usuario NO aceptó Ads → no personalizados (requestNonPersonalizedAds = 1)
   */
  pushManualAd(): void {
    if (!environment.PRODUCTION) {
      return;
    }

    // Aseguramos que el script esté inicializado
    if (!this.initialized) {
      this.init();
    }

    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      console.warn('[Ads] Error en adsbygoogle.push', e);
    }
  }

  /**
   * Llamar cuando cambien las preferencias de cookies
   * (por ejemplo, desde tu CookiePreferencesService o desde el banner)
   */
  onPreferencesChanged(): void {
    if (!environment.PRODUCTION) return;

    const prefs = this.cookiePrefs.getSnapshot();

    // Si aún no se ha inicializado AdSense, no hacemos nada:
    // cuando se llame a init() se aplicará el modo correcto según las prefs actuales.
    if (!this.initialized) {
      return;
    }

    if (!prefs.ads) {
      // El usuario retira el consentimiento de Ads:
      // pasamos a modo NO PERSONALIZADO para las futuras impresiones.
      (window as any).adsbygoogle = (window as any).adsbygoogle || [];
      (window as any).adsbygoogle.requestNonPersonalizedAds = 1;

      console.warn(
        '[Ads] El usuario ha retirado el consentimiento de Ads. ' +
        'Los próximos anuncios serán NO personalizados. ' +
        'Para limpiar totalmente cookies y estado de AdSense, se recomienda recargar la página.'
      );
    } else {
      // El usuario acepta Ads (o cambia de no → sí).
      // Técnicamente, lo más limpio es recargar la página para que AdSense
      // vuelva a inicializarse sin requestNonPersonalizedAds.
      console.info(
        '[Ads] El usuario ha aceptado Ads. ' +
        'Para que los anuncios pasen a PERSONALIZADOS puede ser necesario recargar la página.'
      );

      // Si quieres forzar recarga automática (opcional):
      // location.reload();
    }
  }


  // Getter público solo para plantillas
  get adsClientId(): string {
    return this.clientId;
  }

}
