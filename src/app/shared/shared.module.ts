import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { RouterModule } from '@angular/router';
import { CardTrackComponent } from './components/card-track/card-track.component';
import { SearchbarComponent } from './components/searchbar/searchbar.component';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

@NgModule({
  declarations: [
    CardTrackComponent,
    SearchbarComponent
  ],
  imports: [
    CommonModule, 
    RouterModule,
    FormsModule,
    ReactiveFormsModule,
  ],
  exports: [
    CardTrackComponent,SearchbarComponent
  ],
})
export class SharedModule {}
