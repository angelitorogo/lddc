import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, map, Observable, of, tap, switchMap } from 'rxjs';
import { UpdateUserPayload, UpdateUserResponse } from '../interfaces/update-user.interface';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  apiUrl = environment.API_URL;
  private loggedIn = false;
  csrfToken: string = '';

  private usuario: any = null; // Almacena la información del usuario

  // para que reaccione a cualquier cambio de usuario
  private _user$ = new BehaviorSubject<any>(null);
  user$ = this._user$.asObservable();

  private redirectUrl: string | null = null;

  constructor(private http: HttpClient, private router: Router) { }

  // Método para inicializar el token
  async initializeCsrfToken(): Promise<void> {
    const response = await this.getCsrfToken().toPromise();
    this.csrfToken = response.csrfToken; // Guardar el token
    //console.log('CSRF Token obtenido:', this.csrfToken);
  }


  // Obtener CSRF-Token
  getCsrfToken(): Observable<any> {
    return this.http.get(`${this.apiUrl}/auth/csrf-token`, { withCredentials: true });
  }

  // Guardar el token CSRF en memoria
  setCsrfToken(token: string): void {
    this.csrfToken = token;
  }

  // Obtener el token CSRF actual
  getStoredCsrfToken(): string | null {
    return this.csrfToken;
  }

  // Método de login
  login(email: string, password: string): Observable<any> {

    // Ya hay un interceptor que le incluye en los header el X-CSRF-Token
    return this.http.post<any>(
      `${this.apiUrl}/auth/login`,
      { email, password },
      { withCredentials: true }
    ).pipe(
      tap(() => {
        //console.log('Login exitoso');
      })
    );
  }

  // Método de register
  register(fullname: string, email: string, password: string): Observable<any> {

    // Ya hay un interceptor que le incluye en los header el X-CSRF-Token
    return this.http.post<any>(
      `${this.apiUrl}/auth/register`,
      { fullname, email, password },
      { withCredentials: true }
    ).pipe(
      tap(() => {
        //console.log('Register exitoso');
      })
    );
  }

  // Método para realizar el logout
  logout(): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.apiUrl}/auth/logout`,
      {}, // Cuerpo vacío
      { withCredentials: true } // Enviar cookies al backend
    ).pipe(
      tap(() => {
        //console.log('Logout exitoso');
        this.loggedIn = false;
        this.usuario = null;
        this._user$.next(null);          // 👈 avisar al resto de la app
      })
    );
  }

  // Método para verificar y obtener la información del usuario
  getUserInfo(userId?: string): Observable<any> {

    const url = userId ? `${this.apiUrl}/auth/user/${userId}` : `${this.apiUrl}/auth/verify`

    //console.log(url)

    return this.http.get<any>(url, {
      withCredentials: true, // Necesario para enviar cookies
    });
  }

  // Método para almacenar localmente la información del usuario
  setUser(user: any) {
    //console.log('setUser en AuthService:', user);
    this.usuario = user;
    this.loggedIn = !!user;  // 👈 true solo si hay usuario
    this._user$.next(user);  // 👈 emitir al observable (OnPush reaccionará)
  }

  get user(): any {
    return this.usuario;
  }

  isLoggedIn(): boolean {
    return this.loggedIn;
  }

  comprobarUser() {
    //console.log('Comprobando user en authService...');
    this.getUserInfo().subscribe({
      next: (response) => {
        //console.log(response)
        this.setUser(response.user)
      },
      error: () => this.setUser(null),  // 👈 ahora deja loggedIn = false y emite null
    });
  }

  updateUser(payload: UpdateUserPayload): Observable<any> {
    return this.http.put<any>(
      `${this.apiUrl}/auth/update`,
      payload,
      { withCredentials: true }
    ).pipe(
      tap((resp) => {
        // resp = { isLogged: true, user: {...} }
        this.setUser(resp)
      })
    );
  }

  // =========================================================
  // ✅ NUEVO: Eliminar cuenta (desactivar)
  // =========================================================
  deleteAccount(): Observable<any> {
    return this.http.delete<any>(
      `${this.apiUrl}/auth/me`,
      { withCredentials: true }
    ).pipe(
      tap(() => {
        
        // si el backend no hace logout, aquí al menos limpiamos estado local


        this.loggedIn = false;
        this.usuario = null;
        this._user$.next(null);
      })
    );
  }


  getUserById(userId?: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/auth/user/${userId}`);
  }

  setRedirectUrl(url: string): void {
    this.redirectUrl = url;
  }

  deleteRedirectUrl(): void {
    this.redirectUrl = null;
  }

  consumeRedirectUrl(): string | null {
    const url = this.redirectUrl;
    this.redirectUrl = null; // 🔥 importante: solo se usa una vez
    return url;
  }

}
