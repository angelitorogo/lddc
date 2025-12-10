import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { RouterModule } from '@angular/router';
import { CardTrackComponent } from './components/card-track/card-track.component';

@NgModule({
  declarations: [
    CardTrackComponent
  ],
  imports: [CommonModule, RouterModule],
  exports: [
    CardTrackComponent
  ],
})
export class SharedModule {}
