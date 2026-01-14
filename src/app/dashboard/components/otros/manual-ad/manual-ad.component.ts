import { AfterViewInit, Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { AdsService } from '../../../services/otros/ads.service';
import { CookiePreferencesService } from '../../../services/otros/cookie-preferences.service';

@Component({
  selector: 'app-manual-ad',
  templateUrl: './manual-ad.component.html',
})
export class ManualAdComponent implements AfterViewInit, OnChanges {

  @Input() adSlot!: string;

  constructor(
    public adsService: AdsService,
    public cookiePrefs: CookiePreferencesService,
  ) {}

  ngAfterViewInit(): void {
    this.tryRenderAd();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['adSlot'] && !changes['adSlot'].firstChange) {
      this.tryRenderAd();
    }
  }

  private tryRenderAd(): void {
    // ✅ Si el usuario no ha elegido, no hacemos nada (no hueco)
    if (!this.cookiePrefs.hasStoredPrefs) return;

    // ✅ Render del anuncio (personalizado o NPA según prefs actuales)
    this.adsService.pushManualAd();
  }
}
