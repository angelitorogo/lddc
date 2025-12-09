import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  constructor(private _authService: AuthService, private router: Router) {}

  canActivate(): boolean {
    if (this._authService.isLoggedIn()) {
      // El usuario está autenticado, permitir acceso
      return true;
    } else {
      // El usuario no está autenticado, redirigir al login
      this.router.navigate(['/auth/login']);
      return false;
    }
  }
}
