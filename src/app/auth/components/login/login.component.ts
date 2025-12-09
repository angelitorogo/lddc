import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent implements OnInit {

  formLogin: FormGroup;
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
      email: new FormControl('angelitorogo@hotmail.com', [Validators.required, Validators.email]),
      password: new FormControl('Rod00gom!', Validators.required),
    });
  }

  ngOnInit(): void {
    this.returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    if (this.returnUrl) {
      // decodificar la URL (%2F → /)
      this.returnUrl = decodeURIComponent(this.returnUrl);
    }
  }

  submit() {
    if (this.formLogin.invalid) {
      this.formLogin.markAllAsTouched();
      return;
    }

    const { email, password } = this.formLogin.value;

    this._authService.login(email, password).subscribe({
      next: () => {
        const redirectTo = this.returnUrl || '/dashboard/home';
        this._router.navigateByUrl(redirectTo);
      },
      error: (err) => {
        const error = 'Login fallido: ' + (err?.error?.message || 'Error desconocido');
        console.error(error);

        // 🔹 Guardamos el mensaje y abrimos el modal
        this.errorMessage = error;
        this.showErrorModal = true;
      },
    });
  }

  // 🔹 Cerrar el modal
  closeErrorModal() {
    this.showErrorModal = false;
  }

}
