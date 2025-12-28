import { Component, OnDestroy, OnInit } from '@angular/core';
import { AuthService } from '../../../../auth/services/auth.service';
import { Subscription } from 'rxjs';
import { GeolocationService, GeoPoint } from '../../../services/otros/location.service';


@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit, OnDestroy{

  constructor(public authService: AuthService, private geo: GeolocationService) {}
  
  currentYear = new Date().getFullYear();

  private subs = new Subscription();

  userLocation: GeoPoint | null = null;
  locationError: string | null = null;

  ngOnInit(): void {
    
    this.authService.comprobarUser();
    this.initLocation();
    //this.startWatchLocation();

  }

  ngOnDestroy(): void {

    this.subs.unsubscribe();
    //this.geo.stopWatch();

  }
  

  private initLocation(): void {
    this.locationError = null;

    const s = this.geo
      .getBestLocation({
        timeoutMs: 12_000,
        enableHighAccuracy: true,
        maximumAgeMs: 10_000,
      })
      .subscribe((p) => {
        if (!p) {
          this.userLocation = null;
          this.locationError =
            'No se pudo obtener la ubicación (GPS/IP). Revisa permisos o conexión.';
          return;
        }

        this.userLocation = p;

        /*
        console.log(
          '📍 Ubicación obtenida:',
          p.source,
          `(${p.lat}, ${p.lng})`,
          p.accuracy ? `±${Math.round(p.accuracy)}m` : ''
        );
        */
      });

    this.subs.add(s);
  }

  /*
  private startWatchLocation(): void {
    this.geo.watchBrowserLocation(
      (p) => {
        this.userLocation = p;
        console.log(
          '🛰️ Watch GPS:',
          `(${p.lat}, ${p.lng})`,
          p.accuracy ? `±${Math.round(p.accuracy)}m` : ''
        );
      },
      (msg) => {
        this.locationError = msg ?? 'Error en seguimiento GPS.';
        console.warn('⚠️ Watch GPS error:', this.locationError);
      },
      {
        timeoutMs: 15_000,
        enableHighAccuracy: true,
        maximumAgeMs: 5_000,
      }
    );
  }
    */
  





}
