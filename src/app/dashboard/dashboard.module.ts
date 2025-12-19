import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashboardComponent } from './components/principal/dashboard/dashboard.component';

import { DashboardRoutingModule } from './dashboard-routing.module';
import { SharedModule } from '../shared/shared.module';

import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { ContactComponent } from './components/contact/contact.component';
import { RecaptchaModule, RecaptchaFormsModule } from 'ng-recaptcha';
import { TermsPrivacyComponent } from './components/otros/terms-privacy/terms-privacy.component';
import { CookiesSettingsComponent } from './components/otros/cookies-settings/cookies-settings.component';
import { ManualAdComponent } from './components/otros/manual-ad/manual-ad.component';
import { HomeComponent } from './components/home/home.component';
import { NavbarComponent } from './components/principal/navbar/navbar.component';
import { FooterComponent } from './components/principal/footer/footer.component';
import { TrackDetailComponent } from './components/track-detail/track-detail.component';
import { TrackCreateComponent } from './components/track-create/track-create.component';
import { GoogleMapsModule } from '@angular/google-maps';
import { TrackEditComponent } from './components/track-edit/track-edit.component';
import { ProfileComponent } from './components/profile/profile.component';
import { TracksUserComponent } from './components/tracks-user/tracks-user.component';
import { MapComponent } from './components/map/map.component';



@NgModule({
  declarations: [
    DashboardComponent,
    HomeComponent,
    ContactComponent,
    TermsPrivacyComponent,
    CookiesSettingsComponent,
    ManualAdComponent,
    NavbarComponent,
    FooterComponent,
    TrackDetailComponent,
    TrackCreateComponent,
    TrackEditComponent,
    ProfileComponent,
    TracksUserComponent,
    MapComponent,
  ],
  imports: [
    CommonModule,
    DashboardRoutingModule,
    SharedModule,
    FormsModule,
    ReactiveFormsModule,
    RecaptchaModule,
    RecaptchaFormsModule,
    GoogleMapsModule
  ],

})
export class DashboardModule { }
