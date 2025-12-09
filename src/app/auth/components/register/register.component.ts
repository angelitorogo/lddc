import { Component } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrl: './register.component.css'
})
export class RegisterComponent {

  formRegister: FormGroup;
  returnUrl: string | null = null;

  // 🔹 Estado del modal de error
  showErrorModal = false;
  errorMessage = '';
  
  constructor(private fb: FormBuilder,
              private _router: Router,
              private _authService: AuthService
  ) {
    this.formRegister = this.fb.group({
      fullName: new FormControl('', [Validators.required, Validators.minLength(3)]),
      email: new FormControl('',[Validators.required, Validators.email]),
      password1: new FormControl('',Validators.required),
      password2: new FormControl('',Validators.required),
    });
  }


  submit() {

    const { fullName, email, password1, password2 } = this.formRegister.value;

    if( password1 != password2 ) return;

    this._authService.register(fullName, email, password1).subscribe({
      next: () => {
        this._router.navigate(['/auth/login']);
      },
      error: (err) => {
        const error = 'Registro fallido: ' + (err.error.message || 'Error desconocido');
        console.log(error);

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
