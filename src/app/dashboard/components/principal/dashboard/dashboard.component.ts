import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';

import { AuthService } from '../../../../auth/services/auth.service';
import { GeolocationService, GeoPoint } from '../../../services/otros/location.service';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit, OnDestroy {
  constructor(public authService: AuthService, private geo: GeolocationService) {}

  currentYear = new Date().getFullYear();

  private subs = new Subscription();

  // ✅ para debug/UI global si quieres
  userLocation: GeoPoint | null = null;
  locationError: string | null = null;

  ngOnInit(): void {
    this.authService.comprobarUser();

    // ✅ arranque global: un único watch para todo el dashboard
    this.geo.start({
      timeoutMs: 15_000,
      enableHighAccuracy: true,
      maximumAgeMs: 5_000,
    });

    // ✅ escuchar ubicación global
    this.subs.add(
      this.geo.location$.subscribe((p) => {
        this.userLocation = p;
      })
    );

    // ✅ escuchar error global
    this.subs.add(
      this.geo.error$.subscribe((e) => {
        this.locationError = e;
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();

    // ⚠️ Normalmente NO pares el GPS aquí si Dashboard es tu layout/shell.
    // Si de verdad quieres parar al salir del dashboard, descomenta:
    // this.geo.stop();
  }
}
