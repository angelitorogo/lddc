import { Component, HostListener, OnInit } from '@angular/core';

@Component({
  selector: 'app-mobile-sticky-legal-footer',
  templateUrl: './mobile-sticky-legal-footer.component.html',
  styleUrls: ['./mobile-sticky-legal-footer.component.css'],
})
export class MobileStickyLegalFooterComponent implements OnInit {
  isMobile = false;

  ngOnInit(): void {
    this.recalcIsMobile();
  }

  @HostListener('window:resize')
  onResize(): void {
    this.recalcIsMobile();
  }

  private recalcIsMobile(): void {
    this.isMobile = window.matchMedia('(max-width: 580px)').matches;
  }
}
