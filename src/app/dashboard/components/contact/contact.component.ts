// src/app/features/contact/contact.component.ts
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { MailService } from '../../services/mail.service';
import { environment } from '../../../../environments/environment';
import { CookiePreferencesService } from '../../services/otros/cookie-preferences.service';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';

@Component({
  selector: 'app-contact',
  templateUrl: './contact.component.html',
  styleUrl: './contact.component.css'
})
export class ContactComponent implements OnInit, OnDestroy {

  formContact: FormGroup;

  isSubmitting = false;
  submitSuccess: string | null = null;
  submitError: string | null = null;
  titleModal: string | null = null;
  showModal: boolean = false;

  siteKey = environment.KEY_RCAPTCHA;
  appName = environment.APP_NAME;

  recaptchaToken: string | null = null;

  functionalEnabled = false;
  private prefsSub?: Subscription;

  constructor(
    private fb: FormBuilder,
    private mailService: MailService,
    private cookiePrefs: CookiePreferencesService,
    private router: Router
  ) {
    this.formContact = this.fb.group({
      nombre:   new FormControl('', [Validators.required, Validators.minLength(2)]),
      apellido: new FormControl('', [Validators.required, Validators.minLength(2)]),
      email:    new FormControl('', [Validators.required, Validators.email]),
      asunto:   new FormControl('', [Validators.required, Validators.minLength(3)]),
      text:     new FormControl('', [Validators.required, Validators.minLength(10)]),

      recaptcha: new FormControl(null, [Validators.required]),
    });
  }

  ngOnInit(): void {
    // Estado inicial (por si ya había prefs guardadas)
    this.functionalEnabled = this.cookiePrefs.hasConsent('functional');
    const nombreCtrl = this.formContact.get('nombre');
    const apellidoCtrl = this.formContact.get('apellido');
    const emailCtrl = this.formContact.get('email');
    const asuntoCtrl = this.formContact.get('asunto');
    const textCtrl = this.formContact.get('text');

    if (!this.functionalEnabled) {
      nombreCtrl?.disable({ emitEvent: false });
      apellidoCtrl?.disable({ emitEvent: false });
      emailCtrl?.disable({ emitEvent: false });
      asuntoCtrl?.disable({ emitEvent: false });
      textCtrl?.disable({ emitEvent: false });
    }

    // Escuchar cambios en las preferencias (por si abre panel de cookies)
    this.prefsSub = this.cookiePrefs.prefs$.subscribe(prefs => {
      this.functionalEnabled = prefs.functional;
      // En cuanto pase de false -> true el <re-captcha> se pintará
      // y ng-recaptcha cargará el script de Google.

      const nombreCtrl = this.formContact.get('nombre');
      if (prefs.functional) {
        nombreCtrl?.enable({ emitEvent: false });
        apellidoCtrl?.enable({ emitEvent: false });
        emailCtrl?.enable({ emitEvent: false });
        asuntoCtrl?.enable({ emitEvent: false });
        textCtrl?.enable({ emitEvent: false });
      } else {
        nombreCtrl?.disable({ emitEvent: false });
        apellidoCtrl?.disable({ emitEvent: false });
        emailCtrl?.disable({ emitEvent: false });
        asuntoCtrl?.disable({ emitEvent: false });
        textCtrl?.disable({ emitEvent: false });
      }
      });

  }

  ngOnDestroy(): void {
    this.prefsSub?.unsubscribe();
  }

  

  // ✅ Captcha resuelto
  onCaptchaResolved(token: string | null): void {
    this.recaptchaToken = token;
    this.formContact.get('recaptcha')?.setValue(token);
    this.formContact.get('recaptcha')?.markAsDirty();
    this.formContact.get('recaptcha')?.updateValueAndValidity();
  }

  // ✅ Captcha con error interno (script de Google)
  onCaptchaError(_evt: any): void {
    console.warn('[Contact] Error interno de reCAPTCHA', _evt);
    this.recaptchaToken = null;
    this.formContact.get('recaptcha')?.setValue(null);
    this.formContact.get('recaptcha')?.updateValueAndValidity();
  }

  submit(): void {

    if (!this.functionalEnabled) {
      // Bloqueo suave si intenta enviar sin cookies funcionales
      alert('Para enviar este formulario necesitas aceptar las cookies funcionales (CAPTCHA).');
      return;
    }


    this.submitSuccess = null;
    this.submitError = null;

    if (this.formContact.invalid) {
      this.formContact.markAllAsTouched();
      return;
    }

    const { nombre, apellido, email, asunto, text } = this.formContact.value;

    this.isSubmitting = true;

    this.mailService.createMail({ nombre, apellido, email, asunto, text, nameApp: this.appName }).subscribe({
      next: () => {
        this.isSubmitting = false;

        this.showModal = true;
        
        this.titleModal = 'Mensaje envíado';
        this.submitSuccess = 'Tu mensaje se ha enviado correctamente. ¡Gracias por contactar!';

        this.formContact.reset();
        this.recaptchaToken = null;
      },
      error: (err: any) => {
        console.error('[Contact] Error al enviar mail', err);
        this.isSubmitting = false;
        this.showModal = true;
        this.titleModal = 'Error en el envío';
        this.submitError =
          'Ha ocurrido un error al enviar el mensaje. Inténtalo de nuevo en unos minutos.';
      }
    });
  }

  hasError(controlName: string, error: string): boolean {
    const ctrl = this.formContact.get(controlName);
    return !!ctrl && ctrl.touched && ctrl.hasError(error);
  }

  openCookieSettings() {
    this.router.navigate(['/dashboard/cookies']);
  }

  // 🔹 Cerrar el modal
  closeModal() {
    this.showModal = false;
  }

}
