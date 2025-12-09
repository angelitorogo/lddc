// src/app/features/legal/terms-privacy/terms-privacy.component.ts
import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-terms-privacy',
  templateUrl: './terms-privacy.component.html',
  styleUrl: './terms-privacy.component.css'
})
export class TermsPrivacyComponent implements OnInit {

  currentYear = new Date().getFullYear();
  lastUpdate = '24 de noviembre de 2025'; // cámbialo cuando quieras

  constructor() {}

  ngOnInit(): void {
    // Opcional: hacer scroll al inicio por si vienes de una vista con scroll abajo
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

}
