import { Injectable, Inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { environment } from '../../../../environments/environment';
import { CookiePreferencesService } from './cookie-preferences.service';

declare global {
  interface Window {
    adsbygoogle: any[];
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
   * ✅ Ahora solo prepara el script si ya hay decisión del usuario
   */
  init(): void {
    if (!environment.PRODUCTION) return;
    if (this.initialized) return;
    if (!this.clientId) return;

    // ✅ Si el usuario aún NO ha elegido cookies, NO hacemos nada (legal)
    if (!this.cookiePrefs.hasStoredPrefs) return;

    this.loadScript();
    this.initialized = true;
  }

  private loadScript(): void {
    if (this.document.getElementById(this.scriptId)) return;

    const script = this.document.createElement('script');
    script.id = this.scriptId;
    script.async = true;
    script.src =
      `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${this.clientId}`;
    script.setAttribute('crossorigin', 'anonymous');
    this.document.head.appendChild(script);
  }

  /**
   * ✅ Inserta un anuncio manual en el <ins class="adsbygoogle"> del componente.
   * - Si ads=true -> personalizado
   * - Si ads=false -> NO personalizado (NPA)
   */
  pushManualAd(): void {
    if (!environment.PRODUCTION) return;
    if (!this.clientId) return;

    // ✅ Si aún NO ha elegido, NO mostramos anuncios (legal)
    if (!this.cookiePrefs.hasStoredPrefs) return;

    // Asegura script cargado
    if (!this.initialized) {
      this.init();
    }

    const prefs = this.cookiePrefs.getSnapshot();
    const isNpa = !prefs.ads;

    try {
      (window.adsbygoogle = window.adsbygoogle || []).push(
        isNpa ? { params: { npa: 1 } } : {}
      );
    } catch (e) {
      console.warn('[Ads] Error en adsbygoogle.push', e);
    }
  }

  /**
   * ✅ Si el usuario cambia preferencias:
   * - No “reconfigura” anuncios ya servidos.
   * - Los siguientes manuales ya saldrán como NPA/personalizados según prefs.
   */
  onPreferencesChanged(): void {
    if (!environment.PRODUCTION) return;
    if (!this.clientId) return;

    // Si ahora ya hay decisión, nos aseguramos de tener el script
    if (this.cookiePrefs.hasStoredPrefs && !this.initialized) {
      this.init();
    }

    // Nota: no intentamos “unload” ni reiniciar el script.
    // Si quieres que TODO quede “limpio”, lo correcto es recomendar reload.
  }

  // Getter público para plantillas
  get adsClientId(): string {
    return this.clientId;
  }
}
