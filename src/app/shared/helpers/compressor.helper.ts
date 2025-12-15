// src/app/shared/utils/image-compress.util.ts

export type CompressOptions = {
  maxWidth?: number;     // px
  maxHeight?: number;    // px
  quality?: number;      // 0..1
  mimeType?: 'image/webp' | 'image/jpeg'; // recomendado webp
  keepExifName?: boolean; // si quieres conservar nombre base
};

const DEFAULTS: Required<CompressOptions> = {
  maxWidth: 1920,
  maxHeight: 1920,
  quality: 0.82,
  mimeType: 'image/webp',
  keepExifName: true,
};

/**
 * Comprime/redimensiona imágenes (File) antes de subirlas.
 * - Convierte a webp/jpeg
 * - Mantiene proporción
 * - Devuelve Files nuevos listos para FormData
 */
export async function compressImages(
  files: File[],
  options: CompressOptions = {},
): Promise<File[]> {
  const opts = { ...DEFAULTS, ...options };

  const out: File[] = [];
  for (const f of files) {
    // solo imágenes
    if (!f.type.startsWith('image/')) {
      out.push(f);
      continue;
    }

    // Si ya es webp/jpg y pesa poco, puedes saltarte (opcional)
    // if (f.size < 400 * 1024) { out.push(f); continue; }

    const compressed = await compressSingleImage(f, opts);
    out.push(compressed);
  }
  return out;
}

async function compressSingleImage(file: File, opts: Required<CompressOptions>): Promise<File> {
  const { maxWidth, maxHeight, quality, mimeType, keepExifName } = opts;

  // 1) decode imagen (createImageBitmap si está disponible)
  const bitmap = await decodeToBitmap(file);

  // 2) calcular nuevo tamaño manteniendo ratio
  const { width: srcW, height: srcH } = bitmap;
  const { w: dstW, h: dstH } = fitInside(srcW, srcH, maxWidth, maxHeight);

  // 3) canvas y draw
  const canvas = document.createElement('canvas');
  canvas.width = dstW;
  canvas.height = dstH;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    // fallback: si no hay contexto, devolvemos original
    return file;
  }

  // Mejora calidad de reescalado
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Opcional: fondo blanco para JPEG (si quieres evitar transparencias negras)
  if (mimeType === 'image/jpeg') {
    ctx.fillStyle = '#000000'; // o '#ffffff'
    ctx.fillRect(0, 0, dstW, dstH);
  }

  ctx.drawImage(bitmap as any, 0, 0, dstW, dstH);

  // 4) obtener blob comprimido
  const blob = await canvasToBlob(canvas, mimeType, quality);

  // 5) nombre nuevo (misma base, extensión según mime)
  const ext = mimeType === 'image/webp' ? 'webp' : 'jpg';
  const baseName = keepExifName ? stripExtension(file.name) : `image-${Date.now()}`;
  const newName = `${baseName}.${ext}`;

  // 6) crear nuevo File
  return new File([blob], newName, { type: mimeType, lastModified: Date.now() });
}

async function decodeToBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // createImageBitmap suele ser más rápido y consume menos
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      // fallback debajo
    }
  }

  const img = new Image();
  img.decoding = 'async';

  const url = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('No se pudo cargar imagen'));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function fitInside(srcW: number, srcH: number, maxW: number, maxH: number) {
  // si ya entra, no escalamos
  if (srcW <= maxW && srcH <= maxH) return { w: srcW, h: srcH };

  const ratio = Math.min(maxW / srcW, maxH / srcH);
  return {
    w: Math.max(1, Math.round(srcW * ratio)),
    h: Math.max(1, Math.round(srcH * ratio)),
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('No se pudo generar blob'));
      else resolve(blob);
    }, type, quality);
  });
}

function stripExtension(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}
