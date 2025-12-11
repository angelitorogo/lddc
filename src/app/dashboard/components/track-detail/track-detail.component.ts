import { Component, Input, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../auth/services/auth.service';
import { Track } from '../../../shared/models/track.model';
import { TracksService } from '../../services/track.service';
import { DetailResponse } from '../../../shared/responses/detail.response';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-track-detail',
  templateUrl: './track-detail.component.html',
  styleUrl: './track-detail.component.css'
})
export class TrackDetailComponent implements OnInit{

  private readonly baseUrl = `${environment.API_URL}/tracks`;
  isDescriptionExpanded = false;

  track: DetailResponse | null = null;

  constructor(private router: Router,private route: ActivatedRoute, private trackService: TracksService) {}


  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
  if (id) {
    this.trackService.getTrackById(id).subscribe( (resp: DetailResponse) => {
      this.track = resp;
    });
  }
  }

  onBack(): void {
    this.router.navigate(['/dashboard/home']);
  }

  getUrlImage(trackImage: any): string {

    const url = this.baseUrl + '/images/' + trackImage.id;
    return url;

  }

  getDifficultyLabel(): string {
    switch (this.track?.difficulty) {
      case 'EASY':
        return 'FÁCIL';
      case 'MODERATE':
        return 'MODERADA';
      case 'HARD':
        return 'DIFÍCIL';
      default:
        return 'SIN DATOS';
    }
  }

  getDifficultyClass(): string {
    switch (this.track?.difficulty) {
      case 'EASY':
        return 'track-detail__difficulty--easy';
      case 'MODERATE':
        return 'track-detail__difficulty--moderate';
      case 'HARD':
        return 'track-detail__difficulty--hard';
      default:
        return '';
    }
  }

  getRouteTypeLabel(): string {
    switch (this.track?.routeType) {
      case 'CIRCULAR':
        return 'Circular';
      case 'OUT_AND_BACK':
        return 'Ida y vuelta';
      case 'POINT_TO_POINT':
        return 'Lineal';
      default:
        return 'Ruta';
    }
  }

  getFormattedTime(): string {
    if (!this.track?.totalTimeSeconds) return '';

    const seconds = this.track.totalTimeSeconds;
    const hours = seconds / 3600;

    if (hours >= 1) {
      return `${hours.toFixed(1)} h`;
    }

    const minutes = seconds / 60;
    return `${Math.round(minutes)} min`;
  }

  toggleDescription(): void {
    this.isDescriptionExpanded = !this.isDescriptionExpanded;
  }

  onEditTrack(): void {
    // TODO: implementar navegación a pantalla de edición
    console.log('Editar ruta', this.track?.id);
  }

  onDeleteTrack(): void {
    // TODO: implementar confirmación y borrado
    console.log('Eliminar ruta', this.track?.id);
  }

}
