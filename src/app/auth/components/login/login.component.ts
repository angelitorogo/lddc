import { Component, OnInit } from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent implements OnInit {
  formLogin: FormGroup;

  // 🔹 si aún quieres soportar ?returnUrl=..., lo dejamos como fallback
  returnUrl: string | null = null;

  // 🔹 Estado del modal de error
  showErrorModal = false;
  errorMessage = '';

  constructor(
    private fb: FormBuilder,
    private _router: Router,
    private _authService: AuthService,
    private route: ActivatedRoute
  ) {
    this.formLogin = this.fb.group({
      email: new FormControl('angelitorogo@hotmail.com', [
        Validators.required,
        Validators.email,
      ]),
      password: new FormControl('Rod00gom!', Validators.required),
    });
  }

  ngOnInit(): void {
    // (opcional) mantienes el returnUrl antiguo como fallback
    this.returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    if (this.returnUrl) this.returnUrl = decodeURIComponent(this.returnUrl);

    // ✅ 1) Si ya está logueado en memoria, redirige directo
    if (this._authService.isLoggedIn()) {
      this._router.navigateByUrl('/dashboard/home');
      return;
    }

    // ✅ 2) Robusto con cookies: si hay sesión válida, verify devuelve user
    this._authService.getUserInfo().subscribe({
      next: (resp) => {
        if (resp?.user) {
          this._authService.setUser(resp.user);

          // si venía de un guard, puedes llevarlo ahí; si no, home
          const redirectFromGuard = this._authService.consumeRedirectUrl();
          const redirectTo = redirectFromGuard || '/dashboard/home';

          this._router.navigateByUrl(redirectTo);
        }
      },
      error: () => {
        // no hay sesión -> se queda en login
      },
    });
  }


  submit() {
    if (this.formLogin.invalid) {
      this.formLogin.markAllAsTouched();
      return;
    }

    const { email, password } = this.formLogin.value;

    this._authService.login(email, password).subscribe({
      next: () => {
        // ✅ MUY IMPORTANTE en tu arquitectura:
        // tras login por cookies, “loggedIn” solo se pone a true cuando llamas a setUser(...)
        // así que comprobamos el usuario (verify) y luego redirigimos.
        this._authService.getUserInfo().subscribe({
          next: (response) => {
            this._authService.setUser(response.user);

            // ✅ Prioridad:
            // 1) URL guardada por el guard (lo que intentaba abrir: /tracks/:id/follow)
            // 2) returnUrl por query param (fallback antiguo)
            // 3) home por defecto
            const redirectFromGuard = this._authService.consumeRedirectUrl();
            const redirectTo =
              redirectFromGuard || this.returnUrl || '/dashboard/home';

            this._router.navigateByUrl(redirectTo);
          },
          error: () => {
            // Si por lo que sea falla verify, al menos no lo dejamos colgado
            const redirectFromGuard = this._authService.consumeRedirectUrl();
            const redirectTo =
              redirectFromGuard || this.returnUrl || '/dashboard/home';

            this._router.navigateByUrl(redirectTo);
          },
        });
      },
      error: (err) => {
        const error =
          'Login fallido: ' + (err?.error?.message || 'Error desconocido');
        console.error(error);

        this.errorMessage = error;
        this.showErrorModal = true;
      },
    });
  }

  closeErrorModal() {
    this.showErrorModal = false;
  }
}
