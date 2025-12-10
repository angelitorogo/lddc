import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DashboardComponent } from './components/principal/dashboard/dashboard.component';
import { HomeComponent } from './components/home/home.component';
import { TrackDetailComponent } from './components/track-detail/track-detail.component';
import { TrackCreateComponent } from './components/track-create/track-create.component';



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
