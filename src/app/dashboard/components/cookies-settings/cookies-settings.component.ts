// src/app/features/legal/cookies-settings/cookies-settings.component.ts
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup } from '@angular/forms';
import { CookiePreferencesService, CookiePrefs } from '../../services/otros/cookie-preferences.service';


@Component({
  selector: 'app-cookies-settings',
  templateUrl: './cookies-settings.component.html',
  styleUrl: './cookies-settings.component.css'
})
export class CookiesSettingsComponent implements OnInit {

  form!: FormGroup<{
    functional: FormControl<boolean>;
    analytics: FormControl<boolean>;
    ads: FormControl<boolean>;
  }>;

  currentYear = new Date().getFullYear();
  lastUpdate = '24 de noviembre de 2025';

  saveMessage: string | null = null;

  constructor(
    private fb: FormBuilder,
    private cookiePrefs: CookiePreferencesService,
  ) {}

  ngOnInit(): void {
    const snapshot = this.cookiePrefs.getSnapshot();

    this.form = this.fb.group({
      functional: this.fb.nonNullable.control(snapshot.functional),
      analytics: this.fb.nonNullable.control(snapshot.analytics),
      ads: this.fb.nonNullable.control(snapshot.ads),
    });
  }

  savePrefs(): void {
    const prefs = this.form.getRawValue() as CookiePrefs;

    this.cookiePrefs.setPrefs(prefs);

    this.saveMessage = 'Tus preferencias de cookies se han guardado correctamente.';
    setTimeout(() => (this.saveMessage = null), 4000);
  }
}
