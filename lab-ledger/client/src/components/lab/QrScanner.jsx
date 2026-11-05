import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff } from 'lucide-react';
import { Button } from '../ui/button';
import { tagFromScan } from '../../lib/lab';

/** True when the browser can decode QR codes natively (Chromium on Android/desktop, Safari 17+ behind a flag…). */
export const canScan = () => typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;

const BUBBLES = [
  { left: '18%', delay: '0s', size: 'h-3 w-3' },
  { left: '34%', delay: '0.8s', size: 'h-2 w-2' },
  { left: '58%', delay: '0.4s', size: 'h-4 w-4' },
  { left: '76%', delay: '1.3s', size: 'h-2.5 w-2.5' },
];

/**
 * Camera QR scanner (lab-ledger Req 5.2). Uses the BarcodeDetector API on the rear camera and calls
 * `onTag(assetTag)` once a label is read. The camera only starts when the user asks for it.
 * The green "bubbling beaker" overlay is decorative and frozen under prefers-reduced-motion.
 */
export function QrScanner({ onTag }) {
  const video = useRef(null);
  const [state, setState] = useState('idle'); // idle | starting | scanning | error
  const [error, setError] = useState('');

  useEffect(() => {
    if (state !== 'starting') return undefined;
    let stream;
    let timer;
    let stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stopped) return;
        video.current.srcObject = stream;
        await video.current.play();
        setState('scanning');
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        const tick = async () => {
          if (stopped) return;
          try {
            const codes = await detector.detect(video.current);
            const tag = codes[0] ? tagFromScan(codes[0].rawValue) : '';
            if (tag) { stopped = true; onTag(tag); return; }
          } catch { /* frame not ready */ }
          timer = setTimeout(tick, 250);
        };
        tick();
      } catch (err) {
        setError(err?.name === 'NotAllowedError' ? 'Camera permission was denied.' : 'The camera could not be started.');
        setState('error');
      }
    })();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [state === 'starting' || state === 'scanning']); // eslint-disable-line react-hooks/exhaustive-deps

  if (state === 'idle' || state === 'error') {
    return (
      <div className="flex flex-col items-start gap-2">
        <Button onClick={() => { setError(''); setState('starting'); }}><Camera className="h-4 w-4" aria-hidden /> Scan with camera</Button>
        {error && <p role="alert" className="text-sm text-destructive">{error} Type the asset tag below instead.</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-xl border-2 border-primary/70 bg-black">
        <video ref={video} className="h-full w-full object-cover" muted playsInline aria-label="Camera preview" />
        <div aria-hidden className="pointer-events-none absolute inset-6 rounded-lg border-2 border-dashed border-primary/80" />
        <div aria-hidden className="pointer-events-none absolute inset-x-8 h-0.5 animate-scanline bg-primary shadow-[0_0_12px_hsl(var(--primary))]" />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-primary/35 to-transparent">
          {BUBBLES.map((b) => (
            <span key={b.left} className={`absolute bottom-2 rounded-full bg-primary/80 ${b.size} animate-bubble`} style={{ left: b.left, animationDelay: b.delay }} />
          ))}
        </div>
      </div>
      <p className="text-center text-sm text-muted-foreground" aria-live="polite">{state === 'starting' ? 'Warming up the camera…' : 'Point the camera at an equipment label.'}</p>
      <Button variant="outline" className="self-center" onClick={() => setState('idle')}><CameraOff className="h-4 w-4" aria-hidden /> Stop camera</Button>
    </div>
  );
}
