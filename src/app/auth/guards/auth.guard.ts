import { Injectable } from '@angular/core';
import {
  CanActivate,
  Router,
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
} from '@angular/router';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  constructor(private _authService: AuthService, private router: Router) {}

  canActivate(
    _route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean {


    
    if (this._authService.isLoggedIn()) {
      return true;
    }

    // ✅ guardamos la ruta a la que intentaba ir
    this._authService.setRedirectUrl(state.url);
    
    

    // ✅ al login
    this.router.navigate(['/auth/login']);
    return false;
  }
}
