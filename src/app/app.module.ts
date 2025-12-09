import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { HTTP_INTERCEPTORS, HttpClientModule } from '@angular/common/http';
import { CsrfInterceptor } from './interceptors/csrf.interceptor';
import { registerLocaleData } from '@angular/common';

import { LOCALE_ID } from '@angular/core';
import localeEs from '@angular/common/locales/es';
import { CookieBannerComponent } from './dashboard/components/cookie-banner/cookie-banner.component';

registerLocaleData(localeEs, 'es-ES');

@NgModule({
  declarations: [
    AppComponent,
    CookieBannerComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    HttpClientModule,
  ],
  providers: [
    {
      provide: HTTP_INTERCEPTORS,
      useClass: CsrfInterceptor,
      multi: true, // Permite múltiples interceptores
    },
    { 
      provide: LOCALE_ID, useValue: 'es-ES' 
    },
      
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
