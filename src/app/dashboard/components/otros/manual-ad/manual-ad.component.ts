// src/app/shared/components/manual-ad/manual-ad.component.ts
import { AfterViewInit, Component } from '@angular/core';
import { AdsService } from '../../../services/otros/ads.service';

@Component({
  selector: 'app-manual-ad',
  templateUrl: './manual-ad.component.html',
})
export class ManualAdComponent implements AfterViewInit {

  // Slot que definas en AdSense para este hueco concreto
  adSlot = '1234567890'; // cambia por tu slot real

  constructor(
    public adsService: AdsService,
  ) {}

  ngAfterViewInit(): void {
    // Siempre empujamos el anuncio:
    // - Si el usuario aceptó Ads → personalizados
    // - Si no aceptó Ads → no personalizados (requestNonPersonalizedAds = 1)
    this.adsService.pushManualAd();
  }
}
