/**
 * QR decoding that works in every browser: the built-in BarcodeDetector when the browser has one
 * (Chrome on Android/macOS, Safari 17+), otherwise jsQR, a small pure-JavaScript decoder loaded only
 * when needed. Desktop Chrome and Edge on Windows and Firefox have no BarcodeDetector.
 */

let detector;
const native = () => {
  if (typeof window === 'undefined' || !('BarcodeDetector' in window)) return null;
  try { detector ??= new window.BarcodeDetector({ formats: ['qr_code'] }); } catch { detector = null; }
  return detector;
};
let jsqr;
const loadJsQr = async () => (jsqr ??= (await import('jsqr')).default);

/** Draws `source` (video, image, bitmap) into a canvas no larger than `max` pixels per side. */
function toImageData(source, width, height, max = 1280) {
  const scale = Math.min(1, max / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

/**
 * Reads a QR code from a video frame, image or bitmap.
 * @returns {Promise<string|null>} the text inside the code, or null when none was found
 */
export async function decodeQr(source, width, height) {
  const d = native();
  if (d) {
    try {
      const found = await d.detect(source);
      if (found[0]?.rawValue) return found[0].rawValue;
    } catch { /* fall back to jsQR below */ }
  }
  const decode = await loadJsQr();
  // Try the full picture, then a smaller copy: large photos decode faster and more reliably downscaled.
  for (const max of [1280, 640]) {
    const img = toImageData(source, width, height, max);
    const hit = decode(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
    if (hit?.data) return hit.data;
  }
  return null;
}

/** Reads a QR code from an image file (a photo, a screenshot or a downloaded QR image). */
export async function decodeQrFile(file) {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    try { return await decodeQr(bitmap, bitmap.width, bitmap.height); } finally { bitmap.close?.(); }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return await decodeQr(img, img.naturalWidth, img.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** True when this browser can open a camera at all (decoding then works everywhere). */
export const cameraAvailable = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
