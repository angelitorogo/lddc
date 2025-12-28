import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DashboardComponent } from './components/principal/dashboard/dashboard.component';
import { HomeComponent } from './components/home/home.component';
import { TrackDetailComponent } from './components/track-detail/track-detail.component';
import { TrackCreateComponent } from './components/track-create/track-create.component';
import { TrackEditComponent } from './components/track-edit/track-edit.component';
import { ProfileComponent } from './components/profile/profile.component';
import { TracksUserComponent } from './components/tracks-user/tracks-user.component';
import { MapComponent } from './components/map/map.component';
import { ContactComponent } from './components/contact/contact.component';
import { TermsPrivacyComponent } from './components/otros/terms-privacy/terms-privacy.component';
import { CookiesSettingsComponent } from './components/otros/cookies-settings/cookies-settings.component';
import { TrackFollowComponent } from './components/track-follow/track-follow.component';
import { TrackRecorderComponent } from './components/track-recorder/track-recorder.component';



const routes: Routes = [

  {
    path: '',
    component: DashboardComponent,
    children: [
      {
        path: 'home',
        component: HomeComponent,
      },
      { 
        path: 'track/:id', 
        component: TrackDetailComponent 
      },
      { 
        path: 'create', 
        component: TrackCreateComponent
      },
      { 
        path: 'edit/:id', 
        component: TrackEditComponent 
      },
      {
        path: 'profile',
        component: ProfileComponent,
      },
      {
        path: 'profile/:id',
        component: ProfileComponent,
      },
      { 
        path: 'tracks-user/:id', 
        component: TracksUserComponent 
      },
      { 
        path: 'map', 
        component: MapComponent 
      },
      {
        path: 'contact',
        component: ContactComponent
      },
      {
        path: 'terms-privacy',
        component: TermsPrivacyComponent
      },
      {
        path: 'info-cookies',
        component: CookiesSettingsComponent
      },
      {
        path: 'tracks/:id/follow',
        component: TrackFollowComponent,
      },
      {
        path: 'tracks/record',
        component: TrackRecorderComponent,
      },
      /*
      {
        path: 'home2',
        canActivate: [AuthGuard], // Protege la ruta con el AuthGuard
      },
      */
      {
        path: '**',
        redirectTo: 'home',
        pathMatch: 'full'
      }
    ]
  }

];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class DashboardRoutingModule { }
