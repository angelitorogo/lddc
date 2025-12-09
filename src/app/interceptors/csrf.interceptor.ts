// src/app/interceptors/csrf.interceptor.ts
import { Injectable } from '@angular/core';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent,
} from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from '../auth/services/auth.service';
import { environment } from '../../environments/environment';

@Injectable()
export class CsrfInterceptor implements HttpInterceptor {
  constructor(private _authService: AuthService) {}

  /** Solo considera backend:
   *  - URLs absolutas que empiezan por environment.API_URL
   *  - URLs relativas ("/api/..." o similares)
   */
  private isBackendUrl(url: string): boolean {
    if (url.startsWith('http')) {
      return url.startsWith(environment.API_URL);
    }
    return true; // rutas relativas => backend
  }

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // ❌ No tocar peticiones que no sean a tu backend (p. ej., TMDb)
    if (!this.isBackendUrl(req.url)) {
      return next.handle(req);
    }

    const csrfToken = this._authService.getStoredCsrfToken();

    // ✅ Solo a tu backend añadimos CSRF + cookies
    const cloned = req.clone({
      setHeaders: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
      withCredentials: true,
    });

    return next.handle(cloned);
  }
}
