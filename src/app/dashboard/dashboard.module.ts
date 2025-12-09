import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashboardComponent } from './components/dashboard/dashboard.component';

import { DashboardRoutingModule } from './dashboard-routing.module';
import { SharedModule } from '../shared/shared.module';

import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { ContactComponent } from './components/contact/contact.component';
import { RecaptchaModule, RecaptchaFormsModule } from 'ng-recaptcha';
import { TermsPrivacyComponent } from './components/terms-privacy/terms-privacy.component';
import { CookiesSettingsComponent } from './components/cookies-settings/cookies-settings.component';
import { ManualAdComponent } from './components/manual-ad/manual-ad.component';
import { HomeComponent } from './components/home/home.component';
import { NavbarComponent } from './components/navbar/navbar.component';
import { FooterComponent } from './components/footer/footer.component';



@NgModule({
  declarations: [
    DashboardComponent,
    HomeComponent,
    ContactComponent,
    TermsPrivacyComponent,
    CookiesSettingsComponent,
    ManualAdComponent,
    NavbarComponent,
    FooterComponent
  ],
  imports: [
    CommonModule,
    DashboardRoutingModule,
    SharedModule,
    FormsModule,
    ReactiveFormsModule,
    RecaptchaModule,
    RecaptchaFormsModule,
  ],

})
export class DashboardModule { }
