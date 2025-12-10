// src/app/shared/components/cookie-banner/cookie-banner.component.ts
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  CookiePreferencesService,
  CookiePrefs
} from '../../../services/otros/cookie-preferences.service';

@Component({
  selector: 'app-cookie-banner',
  templateUrl: './cookie-banner.component.html',
  styleUrl: './cookie-banner.component.css'
})
export class CookieBannerComponent implements OnInit {

  visible = false;

  constructor(
    private cookiePrefs: CookiePreferencesService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    // Si YA hay prefs guardadas, no mostramos el banner
    this.visible = !this.cookiePrefs.hasStoredPrefs;
  }

  // Solo funcionales → analytics: false, ads: false
  // => Analytics desactivado y Ads en modo NO personalizado (por tu AdsService)
  acceptEssential(): void {
    const prefs: CookiePrefs = {
      functional: true,
      analytics: false,
      ads: false,
    };
    this.cookiePrefs.setPrefs(prefs);
    this.visible = false;
  }

  // Aceptar todo → analytics: true, ads: true
  // => Analytics activo y Ads personalizados
  acceptAll(): void {
    const prefs: CookiePrefs = {
      functional: true,
      analytics: true,
      ads: true,
    };
    this.cookiePrefs.setPrefs(prefs);
    this.visible = false;
  }

  // Abre la pantalla de configuración avanzada
  openSettings(): void {
    // Aseguramos funcional como imprescindible
    this.cookiePrefs.updatePrefs({ functional: true });
    this.visible = false;
    this.router.navigate(['/dashboard/cookies']);
  }

}
