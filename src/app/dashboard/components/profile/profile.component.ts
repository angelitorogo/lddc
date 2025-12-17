import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService } from '../../../auth/services/auth.service';
import { environment } from '../../../../environments/environment';
import { UpdateUserPayload } from '../../../auth/interfaces/update-user.interface';
import { Subscription } from 'rxjs';

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

  // transform actual
  zoom = 1;          // lo exponemos para slider
  public minZoom = 4;
  public maxZoom = 8;

  private offsetX = 0;
  private offsetY = 0;

  // para aplicar en template
  get avatarTransform(): string {
    return `translate(${this.offsetX}px, ${this.offsetY}px) scale(${this.zoom})`;
  }

  messageOk: string | null = null;
  messageErr: string | null = null;

  constructor(
    private fb: FormBuilder,
    public authService: AuthService
  ) {}

  ngOnInit(): void {

    // OJO: esto no hace nada si no te suscribes; lo dejo como lo tenías
    this.authService.getUserInfo();

    //console.log(this.authService.user)

    this.form = this.fb.group({
      fullname: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      telephone: [null],
    });

    this.passForm = this.fb.group({
      password: ['', [Validators.required, Validators.minLength(8)]],
      password2: ['', [Validators.required]],
    });

    this.userSub = this.authService.user$.subscribe((u) => {
      if (!u) return;

      this.form.patchValue(
        {
          fullname: u.fullname ?? '',
          email: u.email ?? '',
          telephone: u.telephone ?? null,
        },
        { emitEvent: false }
      );

      this.setAvatarFromUser(u);
    });
  }

  ngOnDestroy(): void {
    this.userSub?.unsubscribe();
    this.stopDragging();
  }

  // =========================
  // Avatar (cargar)
  // =========================
  private setAvatarFromUser(user?: any): void {
    this.isEditingAvatar = false;
    this.resetTransform();

    if (user?.image) {
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
    // (cuando <img> haga load, ajustamos zoom mínimo para que cubra el círculo)
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

  // llamamos en (load) del <img> para ajustar zoom mínimo
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

    // Queremos que la imagen cubra todo el círculo (como object-fit: cover)
    const coverScale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);

    this.minZoom = coverScale;

    const initialBoost = 12; // zoom inicial tras escoger imagen
    this.zoom = Math.min(this.maxZoom, this.minZoom * initialBoost);

    this.offsetX = 0;
    this.offsetY = 0;

    this.clampOffsets();
  }

  // iniciar drag
  onAvatarPointerDown(ev: PointerEvent): void {
    if (!this.isEditingAvatar) return;

    this.isDragging = true;
    this.lastClientX = ev.clientX;
    this.lastClientY = ev.clientY;

    // capturar pointer para que siga aunque salgas del círculo
    (ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId);
  }

  onAvatarPointerMove(ev: PointerEvent): void {
    if (!this.isDragging) return;

    const dx = ev.clientX - this.lastClientX;
    const dy = ev.clientY - this.lastClientY;
    this.lastClientX = ev.clientX;
    this.lastClientY = ev.clientY;

    this.offsetX += dx;
    this.offsetY += dy;

    this.clampOffsets();
  }

  onAvatarPointerUp(): void {
    this.stopDragging();
  }

  private stopDragging(): void {
    this.isDragging = false;
  }

  // zoom con rueda
  onAvatarWheel(ev: WheelEvent): void {
    if (!this.isEditingAvatar) return;

    ev.preventDefault();

    const delta = ev.deltaY;
    const step = 0.08; // ✅ puedes tocar este valor para más/menos sensibilidad

    let next = this.zoom + (delta > 0 ? -step : step);
    next = Math.max(this.minZoom, Math.min(this.maxZoom, next));
    this.zoom = next;

    this.clampOffsets();
  }

  // slider de zoom (opcional)
  onZoomChange(value: number): void {
    if (!this.isEditingAvatar) return;
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, value));
    this.clampOffsets();
  }

  // evita que al mover se vean “huecos” dentro del círculo
  private clampOffsets(): void {
    const container = this.avatarContainer?.nativeElement;
    const img = this.avatarImg?.nativeElement;
    if (!container || !img) return;
    if (!img.naturalWidth || !img.naturalHeight) return;

    const cw = container.clientWidth;
    const ch = container.clientHeight;

    // tamaño renderizado (natural * zoom)
    const iw = img.naturalWidth * this.zoom;
    const ih = img.naturalHeight * this.zoom;

    // límites: no permitir que la imagen deje ver fondo en el contenedor
    const maxX = Math.max(0, (iw - cw) / 2);
    const maxY = Math.max(0, (ih - ch) / 2);

    this.offsetX = Math.max(-maxX, Math.min(maxX, this.offsetX));
    this.offsetY = Math.max(-maxY, Math.min(maxY, this.offsetY));
  }

  // medio funciona
  /*
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

    // Escala real renderizada (incluye tu zoom/transform)
    const scaleX = imgRect.width / img.naturalWidth;
    const scaleY = imgRect.height / img.naturalHeight;

    // Coordenadas del área visible del contenedor dentro de la imagen (en píxeles naturales)
    let sx = (containerRect.left - imgRect.left) / scaleX;
    let sy = (containerRect.top - imgRect.top) / scaleY;
    let sw = containerRect.width / scaleX;
    let sh = containerRect.height / scaleY;

    // Clamp para no salirnos de la imagen
    if (sx < 0) { sw += sx; sx = 0; }
    if (sy < 0) { sh += sy; sy = 0; }

    if (sx + sw > img.naturalWidth) sw = img.naturalWidth - sx;
    if (sy + sh > img.naturalHeight) sh = img.naturalHeight - sy;

    // IMPORTANTE: evitar deformaciones => recortar un CUADRADO
    const side = Math.min(sw, sh);
    sx += (sw - side) / 2;
    sy += (sh - side) / 2;
    sw = side;
    sh = side;

    const canvas = document.createElement('canvas');
    canvas.width = outputSize;
    canvas.height = outputSize;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo crear contexto 2D');

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outputSize, outputSize);

    const dataUrl = canvas.toDataURL('image/png', 0.92);
    const comma = dataUrl.indexOf(',');
    return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  }
  */

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

    // Rect del contenedor (exterior)
    const containerRect = container.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();

    // =========================
    // 🎛️ AJUSTES FINOS (TOCAR AQUÍ)
    // =========================
    const NUDGE_X = 0;         // (lo dejas aquí por si luego lo retomas)
    const NUDGE_Y = 0;         // (lo dejas aquí por si luego lo retomas)
    const INNER_PAD = 0;       // (lo dejas aquí por si luego lo retomas)
    const USE_ROUNDING = true; // (lo dejas aquí por si luego lo retomas)

    // ✅ MEDIDAS VISUALES (lo que tú ves en pantalla)
    const rectW = containerRect.width;
    const rectH = containerRect.height;

    // ✅ client (a veces 158) vs rect (a veces 160) => diff típico 2px
    const clientW = container.clientWidth;
    const clientH = container.clientHeight;

    const diffW = rectW - clientW;
    const diffH = rectH - clientH;

    const autoNudgeX = diffW / 2;
    const autoNudgeY = diffH / 2;

    const cw = rectW - diffW;
    const ch = rectH - diffH;

    const innerLeft = containerRect.left + autoNudgeX + NUDGE_X;
    const innerTop  = containerRect.top  + autoNudgeY + NUDGE_Y;

    // Escala renderizada (incluye tu zoom/transform)
    const scaleX = imgRect.width / img.naturalWidth;
    const scaleY = imgRect.height / img.naturalHeight;

    // Coordenadas del área visible del contenedor dentro de la imagen (en píxeles naturales)
    let sx = (innerLeft - imgRect.left) / scaleX;
    let sy = (innerTop - imgRect.top) / scaleY;
    let sw = (cw - INNER_PAD * 2) / scaleX;
    let sh = (ch - INNER_PAD * 2) / scaleY;

    // Clamp para no salirnos de la imagen
    if (sx < 0) { sw += sx; sx = 0; }
    if (sy < 0) { sh += sy; sy = 0; }

    if (sx + sw > img.naturalWidth) sw = img.naturalWidth - sx;
    if (sy + sh > img.naturalHeight) sh = img.naturalHeight - sy;

    // Evitar valores inválidos (esto previene “imagen negra”)
    sw = Math.max(1, sw);
    sh = Math.max(1, sh);

    // ✅ Asegurar cuadrado perfecto
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

    // ✅ Redondeo final para matar subpíxeles
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
  // Guardar perfil (sin cambios funcionales)
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
  // Password (igual)
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

    const p1 = this.passForm.value.password;
    const p2 = this.passForm.value.password2;
    if (p1 !== p2) {
      this.messageErr = 'Las contraseñas no coinciden.';
      return;
    }

    const payload: UpdateUserPayload = {
      id: u.id,
      password: p1,
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

  // 🔹 Cerrar el modal
  closeModal() {
    this.messageErr = null;
    this.messageOk = null;
  }
}
