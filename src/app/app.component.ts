import { Component, OnDestroy, OnInit } from '@angular/core';
import { AuthService } from './auth/services/auth.service';
import { CookiePreferencesService } from './dashboard/services/otros/cookie-preferences.service';
import { AdsService } from './dashboard/services/otros/ads.service';
import { Subscription } from 'rxjs';
import { AnalyticsService } from './dashboard/services/otros/analitics.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'Sala2';
  private prefsSub?: Subscription;

  constructor(
    private _authService: AuthService,
    private cookiePrefs: CookiePreferencesService,
    private ads: AdsService,
    private analytics: AnalyticsService
  ) {}

  ngOnInit(): void {
    // ✅ Solo hará algo si ya hay decisión guardada
    this.ads.init();
    this.analytics.init();

    this.prefsSub = this.cookiePrefs.prefs$.subscribe(() => {
      this.ads.onPreferencesChanged();
      this.analytics.onPreferencesChanged();
    });

    this.initializeCsrfToken();
  }

  ngOnDestroy(): void {
    this.prefsSub?.unsubscribe();
  }

  private initializeCsrfToken(): void {
    this._authService.getCsrfToken().subscribe({
      next: (response) => this._authService.setCsrfToken(response.csrfToken),
      error: (err) => console.error('Error al obtener el CSRF Token:', err),
    });
  }
}
