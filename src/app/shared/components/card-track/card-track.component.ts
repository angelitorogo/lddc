import { Component, Input } from '@angular/core';
import { Track } from '../../models/track.model';
import { Router } from '@angular/router';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-card-track',
  templateUrl: './card-track.component.html',
  styleUrl: './card-track.component.css'
})
export class CardTrackComponent {

  @Input() track: any; // 👈 aquí recibes el track
  private readonly baseUrl = `${environment.API_URL}/tracks`;

  constructor(private router: Router){}



  trackImageUrl(track: Track): string |null {
    if (track.images && track.images.length > 0) {
      return this.baseUrl + '/images/' + track.images[0].id;
    }
    return null;

  }

  trackType(track: Track): string {
    switch (track.routeType) {
      case 'CIRCULAR':
        return 'CIRCULAR';
      case 'OUT_AND_BACK':
        return 'IDA Y VUELTA';  
      case 'POINT_TO_POINT':
        return 'LINEAL';

    }
  }

  trackDistanceKm(track: Track): string {
    return (track.totalDistanceMeters / 1000).toFixed(1);
  }

  trackAscent(track: Track): string {
    return `${track.totalAscent} m`;
  }

  trackDate(track: Track): string {
    if (!track.dateTrack) return '-';
    return new Date(track.dateTrack).toLocaleDateString();
  }

  onOpenDetail(track: Track) {
    console.log(track)
    this.router.navigate(['/dashboard/track', track.id]);
  }

}
