import { Injectable } from '@angular/core';
import { DetailResponse } from '../../shared/responses/detail.response';
import { TracksService } from './track.service';

@Injectable({ providedIn: 'root' })
export class ShareTracksService {
    constructor(private tracksService: TracksService) { }

    async shareTrack(detail: DetailResponse): Promise<'shared' | 'copied' | 'cancelled' | 'unsupported'> {
        const trackId = (detail as any)?.id;
        if (!trackId) return 'unsupported';

        const url = this.tracksService.buildShareUrl(trackId);
        const title = this.buildShareTitle(detail);
        const text = this.buildShareText(detail);

        try {
            // ✅ Web Share 2 (files) SOLO en móvil
            if (navigator.share) {
                const file = await this.tryBuildShareCardFile(detail);
                if (file) {
                    const canShareFiles =
                        typeof (navigator as any).canShare === 'function' &&
                        (navigator as any).canShare({ files: [file] });

                    if (canShareFiles) {
                        await navigator.share({ title, text, url, files: [file] } as any);
                        return 'shared';
                    }
                }
            }


            return 'unsupported';
        } catch (err: any) {
            if (err?.name === 'AbortError') return 'cancelled';

            try {
                await this.copyToClipboard(url);
                return 'copied';
            } catch {
                return 'unsupported';
            }
        }
    }

    /*
    private isMobile(): boolean {
        const ua = navigator.userAgent || '';
        return /Android|iPhone|iPad|iPod/i.test(ua);
    }
    */

    // ------------------------
    // Texto atractivo
    // ------------------------

    private buildShareTitle(detail: any): string {
        const name = (detail?.name ?? '').trim();
        return name ? `Ruta: ${name}` : 'Ruta para descubrir';
    }

    private buildShareText(detail: any): string {
        const name = (detail?.name ?? '').trim() || 'esta ruta';

        const stats = this.getStats(detail);

        const lines: string[] = [];
        lines.push(`🥾 Planazo de senderismo: ${name}`);

        const pills: string[] = [];
        if (typeof stats.km === 'number') pills.push(`📍 ${stats.km.toFixed(1)} km`);
        if (typeof stats.up === 'number') pills.push(`⛰️ +${Math.round(stats.up)} m`);
        if (typeof stats.durMin === 'number') {
            const h = Math.floor(stats.durMin / 60);
            const m = stats.durMin % 60;
            pills.push(`⏱️ ${h > 0 ? `${h}h ` : ''}${m}min`);
        }

        if (pills.length) lines.push(pills.join(' · '));
        lines.push(`🌄 Échale un ojo, guárdala y dime si te animas 👇`);

        return lines.join('\n');
    }

    private getStats(detail: any): { km?: number; up?: number; durMin?: number } {
        // Según tu backend senderismo-ms:
        // totalDistanceMeters, totalAscent, totalTimeSeconds

        const km =
            typeof detail?.totalDistanceMeters === 'number'
                ? detail.totalDistanceMeters / 1000
                : undefined;

        const up =
            typeof detail?.totalAscent === 'number'
                ? detail.totalAscent
                : undefined;

        const durMin =
            typeof detail?.totalTimeSeconds === 'number'
                ? Math.round(detail.totalTimeSeconds / 60)
                : undefined;

        return { km, up, durMin };
    }

    // ------------------------
    // Share-card (canvas)
    // ------------------------

    private async tryBuildShareCardFile(detail: any): Promise<File | null> {
        try {
            // Tu detail incluye images: [{ id, url, order... }] según tu micro
            // Pero en tu TracksService, getUrlImage(image) usa /tracks/images/general/:id
            // Para share-card nos interesa UNA URL "de verdad":
            // - si detail.images[0].url existe y empieza por /uploads => usamos esa
            // - si no, usamos getUrlImage por id (pero puede requerir cookies y CORS)
            const img = detail?.images?.[0];
            let coverUrl: string | null = null;

            coverUrl = this.tracksService.toAbsoluteUrl(img.id);


            // si no hay cover, no construimos share-card
            if (!coverUrl) return null;

            const title = (detail?.name ?? '').trim() || 'Ruta';
            const { km, up, durMin } = this.getStats(detail);
            const text: string =  '🌄 Échale un ojo, guárdala y dime si te animas 👇';

            const blob = await this.buildShareCardPng({
                title,
                coverUrl,
                km,
                up,
                durMin,
                text,
                brand: 'La Dama del Cancho',
            });

            return new File([blob], 'ruta.png', { type: 'image/png' });
        } catch {
            return null;
        }
    }

    private async buildShareCardPng(args: {
        title: string;
        coverUrl: string;
        km?: number;
        up?: number;
        durMin?: number;
        text: string;
        brand: string;
    }): Promise<Blob> {
        const W = 1200;
        const H = 630;

        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;

        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('No canvas ctx');

        // Fondo
        ctx.fillStyle = '#0b1220';
        ctx.fillRect(0, 0, W, H);

        // Imagen de fondo
        const img = await this.loadImage(args.coverUrl);
        const scale = Math.max(W / img.width, H / img.height);
        const iw = img.width * scale;
        const ih = img.height * scale;
        const ix = (W - iw) / 2;
        const iy = (H - ih) / 2;
        ctx.drawImage(img, ix, iy, iw, ih);

        // Oscurecer
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, 0, W, H);

        // Banda inferior
        const bandH = 220;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, H - bandH, W, bandH);

        // Título
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 56px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        const title = this.ellipsize(ctx, args.title.replaceAll('-', ' '), W - 80);
        ctx.fillText(title, 40, H - bandH + 80);

        // Stats
        const pills: string[] = [];
        if (typeof args.km === 'number') pills.push(`📍 ${args.km.toFixed(1)} km`);
        if (typeof args.up === 'number') pills.push(`⛰️ +${Math.round(args.up)} m`);
        if (typeof args.durMin === 'number') {
            const h = Math.floor(args.durMin / 60);
            const m = args.durMin % 60;
            pills.push(`⏱️ ${h > 0 ? `${h}h ` : ''}${m}min`);
        }
        if(typeof args.brand === 'string' && args.brand.length > 0) {
            pills.push(`🔗 ${args.brand}`);
        }
        

        ctx.font = '500 36px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fillText(pills.join('   '), 40, H - bandH + 140);

        // Marca
        ctx.font = '600 30px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillText(args.text, 43, H - bandH + 200);

        return await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
                (b) => (b ? resolve(b) : reject(new Error('toBlob null'))),
                'image/png',
                0.92,
            );
        });
    }

    private loadImage(url: string): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
            const img = new Image();

            // Para canvas: si la imagen está en otro origen o no manda CORS, fallará.
            img.crossOrigin = 'anonymous';

            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = url;
        });
    }

    private ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
        if (ctx.measureText(text).width <= maxWidth) return text;

        let t = text;
        while (t.length > 0 && ctx.measureText(t + '…').width > maxWidth) {
            t = t.slice(0, -1);
        }
        return t + '…';
    }

    // ------------------------
    // Clipboard fallback
    // ------------------------

    private async copyToClipboard(text: string): Promise<void> {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return;
        }

        const ta = document.createElement('textarea');
        //ta.value = text; //por no repetir el texto de "echale un ojo..." que ya va en la imagen, solo copiamos la url
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
    }
}
