import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { AuthService } from '../../../auth/services/auth.service';
import { environment } from '../../../../environments/environment';
import { UpdateUserPayload, UpdateUserResponse } from '../../../auth/interfaces/update-user.interface';
import { Subscription } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { TracksService } from '../../services/track.service';
import { UserStatsResponse } from '../../../shared/responses/user-stats.response';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css'],
})
export class ProfileComponent implements OnInit, OnDestroy {
  private userSub?: Subscription;

  @ViewChild('fileInput', { static: false }) fileInput?: ElementRef<HTMLInputElement>;

  // ✅ referencias del “editor” dentro del círculo
  @ViewChild('avatarContainer', { static: false }) avatarContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('avatarImg', { static: false }) avatarImg?: ElementRef<HTMLImageElement>;

  form!: FormGroup;
  passForm!: FormGroup;

  loadingSave = false;
  loadingPass = false;

  avatarPreviewUrl = 'assets/images/poster-placeholder.png';
  private avatarBase64: string | null = null;

  // ✅ editor state
  isEditingAvatar = false;
  private isDragging = false;
  private lastClientX = 0;
  private lastClientY = 0;

  // =========================
  // Pinch to zoom (móvil)
  // =========================
  private activePointers = new Map<number, PointerEvent>();
  private initialPinchDistance = 0;
  private initialZoom = 1;

  // transform actual
  zoom = 1; // lo exponemos para slider
  public minZoom = 4;
  public maxZoom = 8;

  private offsetX = 0;
  private offsetY = 0;

  messageOk: string | null = null;
  messageErr: string | null = null;

  // ✅ para hint desktop/móvil
  isTouchLike = false;


  private routeSub?: Subscription;
  isOwnProfile = false; 
  userId?: string; 
  userFullname?: string;
  userActive?: boolean;
  userRole?: string;
  userNewDate?: Date;
  userUpdateDate?: Date;
  userImage?: string;

  profileUser: UpdateUserResponse | null = null;


  // =========================================================
  // ✅ RESUMEN RUTAS USUARIO
  // =========================================================
  summaryUserId: string | null = null;
  tracksCount = 0;
  lastTrackDate: string | null = null;
  loadingTracksSummary = false;

  // =========================================================
  // ✅ MODAL BORRADO CUENTA (Zona peligrosa)
  // =========================================================
  confirmDeleteOpen = false;
  deleteInProgress = false;
  typeModal: 'DELETE' | 'SUCCESS' = 'DELETE';
  titleModal = '';
  textModal = '';

  

  // si se ha eliminado correctamente, al aceptar redirigimos a home
  private accountDeletedOk = false;
  

  userStats: UserStatsResponse | null = null;
  


  constructor(private fb: FormBuilder, 
              public authService: AuthService, 
              private router: Router, 
              private route: ActivatedRoute,
              private tracksService: TracksService,
  ) {}

  ngOnInit(): void {

    this.routeSub = this.route.paramMap.subscribe((p) => {
      const id = p.get('id');



      if (!id) {
        // /profile => mi perfil
        this.isOwnProfile = true;
        return;
      }

      this.isOwnProfile = false;
      this.userId = id;

    });

    // Heurística simple: “móvil / táctil”
    this.isTouchLike =
      typeof window !== 'undefined' &&
      (navigator.maxTouchPoints > 0 || window.matchMedia?.('(pointer: coarse)')?.matches);

    this.form = this.fb.group({
      fullname: ['',[Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      telephone: [null],
    });

    // ✅ Validador de grupo para “passwords no coinciden”
    this.passForm = this.fb.group(
      {
        password: ['', [Validators.required, Validators.minLength(8)]],
        password2: ['', [Validators.required]],
      },
      { validators: this.passwordsMatchValidator }
    );



    if(this.isOwnProfile) {

      this.userSub = this.authService.user$.subscribe((u) => {
        if (!u) return;

        this.profileUser = u;

        this.form.patchValue(
          {
            fullname: u.fullname ?? '',
            email: u.email ?? '',
            telephone: u.telephone ?? null,
          },
          { emitEvent: false }
        );

        this.setAvatarFromUser(u);
        this.loadUserStats(u.id);
      });

      

      

    } else {
      this.authService.getUserInfo(this.userId).subscribe( (res:any) => {

        this.userFullname = res.fullname;
        this.userActive = res.active;
        this.userRole = res.role;
        this.userNewDate = res.created_at;
        this.userUpdateDate = res.updated_at;
        this.userImage = res.image;

        this.form.patchValue(
          {
            fullname: res.fullname ?? '',
            email: res.email ?? '',
            telephone: res.telephone ?? null,
          },
          { emitEvent: false }
        );

        this.setAvatarFromUser(res);
        this.loadUserStats(this.userId!);

        this.setReadOnlyMode(true);
        

      });


    }

    
  }

  loadUserStats(userId: string): void {
    this.tracksService.getUserStats(userId).subscribe( (res:any) => {
      
      this.userStats = res;

      this.summaryUserId = userId;
      
    });
  }

  ngOnDestroy(): void {
    this.userSub?.unsubscribe();
    this.routeSub?.unsubscribe();
    this.stopDragging();
  }

  setReadOnlyMode(readOnly: boolean) {
    const fullName = this.form.get('fullname');
    if (!fullName) return;
    const email = this.form.get('email');
    if (!email) return;
    const telephone = this.form.get('telephone');
    if (!telephone) return;

    readOnly ? fullName.disable() : fullName.enable();
    readOnly ? email.disable() : email.enable();
    readOnly ? telephone.disable() : telephone.enable();
  }


  // =========================
  // Helpers validación template
  // =========================
  isInvalid(form: FormGroup, controlName: string, errorKey: string): boolean {
    const c = form.get(controlName);
    if (!c) return false;
    return (c.touched || c.dirty) && !!c.errors?.[errorKey];
  }

  get passMismatch(): boolean {
    return (this.passForm.touched || this.passForm.dirty) && !!this.passForm.errors?.['passwordMismatch'];
  }

  private passwordsMatchValidator(group: AbstractControl): ValidationErrors | null {
    const p1 = group.get('password')?.value;
    const p2 = group.get('password2')?.value;
    if (!p1 || !p2) return null;
    return p1 === p2 ? null : { passwordMismatch: true };
  }

  get avatarHint(): string {
    // Solo aparece cuando isEditingAvatar (en HTML)
    return this.isTouchLike
      ? 'Arrastra para centrar. Pellizca para zoom.'
      : 'Arrastra para centrar. Rueda del ratón para zoom.';
  }

  // =========================
  // Avatar (cargar)
  // =========================
  private setAvatarFromUser(user?: any): void {
    this.isEditingAvatar = false;
    this.resetTransform();

    if (user.image) {
      this.avatarPreviewUrl = `${environment.API_URL}/files/${user.image}?v=${user.updated_at ?? Date.now()}`;
    } else {
      this.avatarPreviewUrl = 'assets/images/poster-placeholder.png';
    }
  }

  onAvatarError(): void {
    this.avatarPreviewUrl = 'assets/images/poster-placeholder.png';
  }

  openFilePicker(): void {
    this.fileInput?.nativeElement?.click();
  }

  async onFileSelected(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) {
      this.messageErr = 'Formato de imagen no soportado.';
      this.messageOk = null;
      input.value = '';
      return;
    }

    const base64 = await this.fileToBase64(file);
    this.avatarBase64 = base64;

    // Preview
    this.avatarPreviewUrl = `data:${file.type};base64,${base64}`;

    // ✅ entra en modo edición
    this.isEditingAvatar = true;

    // resetea encuadre y deja que al cargar la img calcule minZoom/centro
    this.resetTransform();
    setTimeout(() => this.fitImageToCircle(), 0);
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('No se pudo leer el fichero'));
      reader.onload = () => {
        const result = String(reader.result || '');
        const comma = result.indexOf(',');
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.readAsDataURL(file);
    });
  }

  // =========================
  // Drag + Zoom (editor)
  // =========================
  get avatarTransform(): string {
    return `translate(${this.offsetX}px, ${this.offsetY}px) scale(${this.zoom})`;
  }

  onAvatarImgLoad(): void {
    if (!this.isEditingAvatar) return;
    this.fitImageToCircle();
  }

  private resetTransform(): void {
    this.zoom = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.minZoom = 1;
    this.maxZoom = 4;
  }

  private fitImageToCircle(): void {
    const container = this.avatarContainer?.nativeElement;
    const img = this.avatarImg?.nativeElement;
    if (!container || !img) return;
    if (!img.naturalWidth || !img.naturalHeight) return;

    const cw = container.clientWidth;
    const ch = container.clientHeight;

    const coverScale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);

    this.minZoom = coverScale;

    const initialBoost = 12;
    this.zoom = Math.min(this.maxZoom, this.minZoom * initialBoost);

    this.offsetX = 0;
    this.offsetY = 0;

    this.clampOffsets();
  }

  onAvatarPointerDown(ev: PointerEvent): void {
  if (!this.isEditingAvatar) return;

  this.activePointers.set(ev.pointerId, ev);

  // 👉 si hay 2 dedos, iniciamos pinch
  if (this.activePointers.size === 2) {
    const [p1, p2] = Array.from(this.activePointers.values());
    this.initialPinchDistance = this.getDistanceBetweenPointers(p1, p2);
    this.initialZoom = this.zoom;
    return; // ⚠️ no iniciamos drag
  }

  // drag normal (1 dedo / ratón)
  this.isDragging = true;
  this.lastClientX = ev.clientX;
  this.lastClientY = ev.clientY;

  (ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId);
}


  onAvatarPointerMove(ev: PointerEvent): void {
  if (!this.isEditingAvatar) return;

  // actualizamos pointer
  if (this.activePointers.has(ev.pointerId)) {
    this.activePointers.set(ev.pointerId, ev);
  }

  // 👉 PINCH con dos dedos
  if (this.activePointers.size === 2) {
    const [p1, p2] = Array.from(this.activePointers.values());
    const currentDistance = this.getDistanceBetweenPointers(p1, p2);

    const scaleFactor = currentDistance / this.initialPinchDistance;
    let nextZoom = this.initialZoom * scaleFactor;

    nextZoom = Math.max(this.minZoom, Math.min(this.maxZoom, nextZoom));
    this.zoom = nextZoom;

    this.clampOffsets();
    return; // ⚠️ no drag
  }

  // 👉 DRAG normal
  if (!this.isDragging) return;

  const dx = ev.clientX - this.lastClientX;
  const dy = ev.clientY - this.lastClientY;
  this.lastClientX = ev.clientX;
  this.lastClientY = ev.clientY;

  this.offsetX += dx;
  this.offsetY += dy;

  this.clampOffsets();
}


  onAvatarPointerUp(ev?: PointerEvent): void {
  if (ev) {
    this.activePointers.delete(ev.pointerId);
  }

  // si ya no hay pinch, liberamos drag
  if (this.activePointers.size < 2) {
    this.initialPinchDistance = 0;
  }

  this.stopDragging();
}

  private stopDragging(): void {
    this.isDragging = false;
  }

  onAvatarWheel(ev: WheelEvent): void {
    if (!this.isEditingAvatar) return;

    ev.preventDefault();

    const delta = ev.deltaY;
    const step = 0.08;

    let next = this.zoom + (delta > 0 ? -step : step);
    next = Math.max(this.minZoom, Math.min(this.maxZoom, next));
    this.zoom = next;

    this.clampOffsets();
  }

  onZoomChange(value: number): void {
    if (!this.isEditingAvatar) return;
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, value));
    this.clampOffsets();
  }

  private clampOffsets(): void {
    const container = this.avatarContainer?.nativeElement;
    const img = this.avatarImg?.nativeElement;
    if (!container || !img) return;
    if (!img.naturalWidth || !img.naturalHeight) return;

    const cw = container.clientWidth;
    const ch = container.clientHeight;

    const iw = img.naturalWidth * this.zoom;
    const ih = img.naturalHeight * this.zoom;

    const maxX = Math.max(0, (iw - cw) / 2);
    const maxY = Math.max(0, (ih - ch) / 2);

    this.offsetX = Math.max(-maxX, Math.min(maxX, this.offsetX));
    this.offsetY = Math.max(-maxY, Math.min(maxY, this.offsetY));
  }

  private async captureAvatarFromContainerBase64(outputSize = 512): Promise<string> {
    const container = this.avatarContainer?.nativeElement;
    const img = this.avatarImg?.nativeElement;

    if (!container || !img) throw new Error('Avatar container/img no disponible');

    if (!img.complete || !img.naturalWidth || !img.naturalHeight) {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('No se pudo cargar la imagen del avatar'));
      });
    }

    const containerRect = container.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();

    const NUDGE_X = 0;
    const NUDGE_Y = 0;
    const INNER_PAD = 0;
    const USE_ROUNDING = true;

    const rectW = containerRect.width;
    const rectH = containerRect.height;

    const clientW = container.clientWidth;
    const clientH = container.clientHeight;

    const diffW = rectW - clientW;
    const diffH = rectH - clientH;

    const autoNudgeX = diffW / 2;
    const autoNudgeY = diffH / 2;

    const cw = rectW - diffW;
    const ch = rectH - diffH;

    const innerLeft = containerRect.left + autoNudgeX + NUDGE_X;
    const innerTop = containerRect.top + autoNudgeY + NUDGE_Y;

    const scaleX = imgRect.width / img.naturalWidth;
    const scaleY = imgRect.height / img.naturalHeight;

    let sx = (innerLeft - imgRect.left) / scaleX;
    let sy = (innerTop - imgRect.top) / scaleY;
    let sw = (cw - INNER_PAD * 2) / scaleX;
    let sh = (ch - INNER_PAD * 2) / scaleY;

    if (sx < 0) {
      sw += sx;
      sx = 0;
    }
    if (sy < 0) {
      sh += sy;
      sy = 0;
    }

    if (sx + sw > img.naturalWidth) sw = img.naturalWidth - sx;
    if (sy + sh > img.naturalHeight) sh = img.naturalHeight - sy;

    sw = Math.max(1, sw);
    sh = Math.max(1, sh);

    const side = Math.min(sw, sh);
    sx += (sw - side) / 2;
    sy += (sh - side) / 2;
    sw = side;
    sh = side;

    if (USE_ROUNDING) {
      sx = Math.round(sx);
      sy = Math.round(sy);
      sw = Math.round(sw);
      sh = Math.round(sh);
    }

    sx = Math.round(sx);
    sy = Math.round(sy);
    sw = Math.round(sw);
    sh = Math.round(sh);

    const canvas = document.createElement('canvas');
    canvas.width = outputSize;
    canvas.height = outputSize;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo crear contexto 2D');

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outputSize, outputSize);

    const dataUrl = canvas.toDataURL('image/png');
    const comma = dataUrl.indexOf(',');
    return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  }

  // =========================
  // Guardar perfil
  // =========================
  async saveProfile(): Promise<void> {
    this.messageOk = null;
    this.messageErr = null;

    const u = this.authService.user;
    if (!u?.id) {
      this.messageErr = 'No hay usuario cargado.';
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.messageErr = 'Revisa los campos del formulario.';
      return;
    }

    const payload: UpdateUserPayload = {
      id: u.id,
      fullname: this.form.value.fullname?.trim(),
      email: this.form.value.email?.trim(),
      telephone: (this.form.value.telephone ?? null)?.toString()?.trim() || null,
    };

    if (this.avatarBase64) {
      if (this.isEditingAvatar) {
        try {
          payload.image = await this.captureAvatarFromContainerBase64(512);
        } catch (e) {
          payload.image = this.avatarBase64;
        }
      } else {
        payload.image = this.avatarBase64;
      }
    }

    this.loadingSave = true;

    this.authService.updateUser(payload).subscribe({
      next: () => {
        this.loadingSave = false;
        this.messageOk = 'Perfil actualizado.';
        this.messageErr = null;

        this.isEditingAvatar = false;
        this.resetTransform();
        this.avatarBase64 = null;

        this.authService.comprobarUser();
      },
      error: () => {
        this.loadingSave = false;
        this.messageErr = 'No se pudo actualizar el perfil.';
        this.messageOk = null;
      },
    });
  }

  // =========================
  // Password
  // =========================
  changePassword(): void {
    this.messageOk = null;
    this.messageErr = null;

    const u = this.authService.user;
    if (!u?.id) {
      this.messageErr = 'No hay usuario cargado.';
      return;
    }

    if (this.passForm.invalid) {
      this.passForm.markAllAsTouched();
      this.messageErr = 'Revisa la contraseña.';
      return;
    }

    // si mismatch (validador de grupo)
    if (this.passForm.errors?.['passwordMismatch']) {
      this.passForm.markAllAsTouched();
      this.messageErr = 'Las contraseñas no coinciden.';
      return;
    }

    const payload: UpdateUserPayload = {
      id: u.id,
      password: this.passForm.value.password,
    };

    this.loadingPass = true;

    this.authService.updateUser(payload).subscribe({
      next: () => {
        this.loadingPass = false;
        this.messageOk = 'Contraseña actualizada.';
        this.messageErr = null;
        this.passForm.reset();
      },
      error: () => {
        this.loadingPass = false;
        this.messageErr = 'No se pudo actualizar la contraseña.';
        this.messageOk = null;
      },
    });
  }

  // =========================
  // Modal UX: ESC + click fuera
  // =========================

  onBackdropClick(_: MouseEvent): void {
    this.closeModal();
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.messageOk || this.messageErr) this.closeModal();
  }

  closeModal(): void {
    this.messageErr = null;
    this.messageOk = null;
  }

  private getDistanceBetweenPointers(p1: PointerEvent, p2: PointerEvent): number {
    const dx = p2.clientX - p1.clientX;
    const dy = p2.clientY - p1.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // =========================================================
  // ✅ Zona peligrosa: eliminar cuenta
  // =========================================================

  openDeleteAccountModal(): void {
    this.typeModal = 'DELETE';
    this.titleModal = 'Eliminar cuenta';
    this.textModal =
      '¿Seguro que quieres eliminar tu cuenta? Esta acción desactivará tu perfil y cerrará tu sesión. No se puede deshacer.';
    this.confirmDeleteOpen = true;
    this.deleteInProgress = false;
    this.accountDeletedOk = false;
  }

  cancelDeleteAccount(): void {
    if (this.deleteInProgress) return;
    this.confirmDeleteOpen = false;
    this.typeModal = 'DELETE';
    this.accountDeletedOk = false;
  }

  confirmDeleteAccount(): void {
    if (this.deleteInProgress) return;

    this.deleteInProgress = true;

    this.authService.deleteAccount().subscribe({
      next: () => {
        // dejamos la app limpia (sin usuario) inmediatamente
        this.authService.setUser(null);

        this.typeModal = 'SUCCESS';
        this.titleModal = 'Cuenta eliminada';
        this.textModal = 'Tu cuenta se ha desactivado correctamente.';
        this.deleteInProgress = false;
        this.accountDeletedOk = true;
      },
      error: (err) => {
        console.error('Error al eliminar la cuenta', err);
        this.typeModal = 'SUCCESS';
        this.titleModal = 'No se pudo eliminar';
        this.textModal = 'Ha ocurrido un error al eliminar la cuenta. Inténtalo de nuevo.';
        this.deleteInProgress = false;
        this.accountDeletedOk = false;
      },
    });
  }

  successOk(): void {
    this.confirmDeleteOpen = false;

    // ✅ aquí está la clave: al aceptar, nos vamos a Home
    if (this.accountDeletedOk) {
      this.router.navigateByUrl('/home'); // o '/' si tu home es la raíz
    }
  }

  

  goToUserTracks(): void {
    // ruta: { path: 'tracks-user/:id', component: TracksUserComponent }
    this.router.navigate(['/dashboard/tracks-user', this.summaryUserId]);
  }


}
