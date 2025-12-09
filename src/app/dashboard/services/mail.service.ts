// src/app/core/services/mail.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

const API_BASE = environment.API_URL;

export interface CreateMailPayload {
  nombre: string;
  apellido: string;
  email: string;
  asunto: string;
  text: string;
  nameApp: string;
}

@Injectable({ providedIn: 'root' })
export class MailService {

  constructor(private http: HttpClient) {}

  createMail(payload: CreateMailPayload): Observable<any> {
    return this.http.post<any>(`${API_BASE}/mail/create-mail`, payload);
  }

}
