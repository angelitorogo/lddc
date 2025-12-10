import { Component, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../../auth/services/auth.service';


@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit{

  constructor(public authService: AuthService) {}
  

  currentYear = new Date().getFullYear();

  ngOnInit(): void {
    this.authService.comprobarUser();
  }

}
