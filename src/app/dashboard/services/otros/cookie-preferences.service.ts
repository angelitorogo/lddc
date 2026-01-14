import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface CookiePrefs {
  functional: boolean;
  analytics: boolean;
  ads: boolean;
}

// ✅ Tu nueva key
const STORAGE_KEY = 'lddc.lddc.cookiePrefs';

@Injectable({ providedIn: 'root' })
export class CookiePreferencesService {

  private readonly defaultPrefs: CookiePrefs = {
    functional: true,
    analytics: false,
    ads: false,
  };

  private prefsSubject = new BehaviorSubject<CookiePrefs>(this.defaultPrefs);
  prefs$ = this.prefsSubject.asObservable();

  private hasStoredPrefsFlag = false;

  constructor() {
    this.loadFromStorage();
  }

  /** ¿El usuario ya eligió algo en algún momento? */
  get hasStoredPrefs(): boolean {
    return this.hasStoredPrefsFlag;
  }

  /** Snapshot sin necesidad de subscribirse */
  getSnapshot(): CookiePrefs {
    return this.prefsSubject.getValue();
  }

  /** Comprueba un tipo de consentimiento */
  hasConsent(kind: keyof CookiePrefs): boolean {
    const prefs = this.getSnapshot();
    return !!prefs[kind];
  }

  updatePrefs(partial: Partial<CookiePrefs>): void {
    const current = this.getSnapshot();
    const merged: CookiePrefs = { ...current, ...partial };
    this.prefsSubject.next(merged);
    this.saveToStorage(merged);
  }

  setPrefs(prefs: CookiePrefs): void {
    this.prefsSubject.next(prefs);
    this.saveToStorage(prefs);
  }

  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);

      if (!raw) {
        this.hasStoredPrefsFlag = false;
        this.prefsSubject.next(this.defaultPrefs);
        return;
      }

      const parsed = JSON.parse(raw) as Partial<CookiePrefs>;
      const prefs: CookiePrefs = {
        functional: parsed.functional ?? this.defaultPrefs.functional,
        analytics: parsed.analytics ?? this.defaultPrefs.analytics,
        ads: parsed.ads ?? this.defaultPrefs.ads,
      };

      this.hasStoredPrefsFlag = true;
      this.prefsSubject.next(prefs);

    } catch (e) {
      console.warn('[CookiePreferences] Error leyendo localStorage', e);
      this.hasStoredPrefsFlag = false;
      this.prefsSubject.next(this.defaultPrefs);
    }
  }

  private saveToStorage(prefs: CookiePrefs): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
      this.hasStoredPrefsFlag = true;
    } catch (e) {
      console.error('[CookiePreferences] Error guardando en localStorage', e);
    }
  }
}
