import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { AuthService } from '../../../../auth/services/auth.service';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.css'
})
export class NavbarComponent implements OnInit{

  appName = environment.APP_NAME;
  @ViewChild('btnAccount') btnAccount?: ElementRef<HTMLInputElement>;

  constructor(private router: Router, public authService: AuthService) {}

  

  ngOnInit(): void {

  }


  isMenuOpen = false;

  toggleMenu(): void {
    this.isMenuOpen = !this.isMenuOpen;
  }

  closeMenu(): void {
    this.isMenuOpen = false;
  }

  onNavigate(): void {
    this.closeMenu();
  }

  onAccountClick(): void {
    this.closeMenu();

    if (this.authService.user) {

      //console.log('Usuario logado:', this.authService.user);
      this.router.navigate(['/dashboard/profile']);

    } else {
      this.router.navigate(['/auth/login']);
    }

  }


  logout() {


    this.authService.logout().subscribe({
      next: () => {
        this.authService.setUser(null);

        //Aqui
        const currentRoute = this.router.url;
        //console.log('Ruta actual:', currentRoute);

        if (currentRoute === '/dashboard/profile' || currentRoute === '/dashboard/create' || currentRoute === '/dashboard/tracks/record' || currentRoute.includes('/follow')) {
          this.router.navigate(['/dashboard/home']);
        }


      },
      error: (error) => console.error('Error al cerrar sesión:', error)
    });
  }




}
