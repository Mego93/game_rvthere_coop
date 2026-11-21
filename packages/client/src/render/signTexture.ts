import * as THREE from 'three';

// A canvas drawn once and used as a texture; null where there is no canvas (tests). The caller owns it, so a scene's disposal frees it.
export function canvasTexture(width: number, height: number, draw: (context: CanvasRenderingContext2D, width: number, height: number) => void): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  draw(context, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// A rounded sign with centred text; colours are CSS strings.
export function textSignTexture(text: string, options: { width?: number; height?: number; background: string; foreground: string; border?: string }): THREE.CanvasTexture | null {
  const width = options.width ?? 512;
  const height = options.height ?? 128;
  return canvasTexture(width, height, (context) => {
    context.fillStyle = options.background;
    context.fillRect(0, 0, width, height);
    if (options.border) {
      context.strokeStyle = options.border;
      context.lineWidth = Math.round(height * 0.07);
      context.strokeRect(context.lineWidth / 2, context.lineWidth / 2, width - context.lineWidth, height - context.lineWidth);
    }
    context.fillStyle = options.foreground;
    context.font = `800 ${Math.round(height * 0.52)}px system-ui, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, width / 2, height / 2 + height * 0.04, width * 0.92);
  });
}
