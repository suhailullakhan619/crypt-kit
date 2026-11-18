import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, ImageUp, SwitchCamera } from 'lucide-react';
import { Button } from '../ui/button';
import { decodeQr, decodeQrFile, cameraAvailable } from './decodeQr';

/**
 * QR reader with two inputs, both decoded in every browser (built-in detector or jsQR):
 *  - the live camera (rear camera first; switch between cameras when there are several)
 *  - a photo or screenshot of a QR code (on phones this can take the picture directly)
 * Calls `onResult(text)` once with the text inside the code. `overlay` decorates the camera view.
 */
export function QrReader({ onResult, overlay = null, hint = 'Point the camera at a QR code.' }) {
  const video = useRef(null);
  const fileInput = useRef(null);
  const [state, setState] = useState('idle'); // idle | starting | scanning | error
  const [error, setError] = useState('');
  const [busyPhoto, setBusyPhoto] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [cameraIndex, setCameraIndex] = useState(0);
  const live = state === 'starting' || state === 'scanning';

  useEffect(() => {
    if (!live) return undefined;
    let stream;
    let timer;
    let stopped = false;
    (async () => {
      try {
        const deviceId = cameras[cameraIndex]?.deviceId;
        stream = await navigator.mediaDevices.getUserMedia({
          video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (stopped) return;
        video.current.srcObject = stream;
        await video.current.play();
        setState('scanning');
        // Labels for the camera list only become available after permission is granted.
        const all = (await navigator.mediaDevices.enumerateDevices?.()) ?? [];
        const vids = all.filter((d) => d.kind === 'videoinput');
        if (vids.length !== cameras.length) setCameras(vids);
        const tick = async () => {
          if (stopped) return;
          const v = video.current;
          if (v && v.videoWidth) {
            try {
              const text = await decodeQr(v, v.videoWidth, v.videoHeight);
              if (text && !stopped) { stopped = true; onResult(text); return; }
            } catch { /* frame not ready yet */ }
          }
          timer = setTimeout(tick, 200);
        };
        tick();
      } catch (err) {
        const denied = err?.name === 'NotAllowedError' || err?.name === 'SecurityError';
        setError(denied
          ? 'Camera access was blocked. Allow the camera for this site, or scan from a photo instead.'
          : 'The camera could not be started. Scan from a photo or type the ID instead.');
        setState('error');
      }
    })();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [live, cameraIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusyPhoto(true);
    setError('');
    try {
      const text = await decodeQrFile(file);
      if (text) onResult(text);
      else setError('No QR code was found in that picture. Try a closer, sharper photo with the whole code in view.');
    } catch {
      setError('That picture could not be read. Try another photo or screenshot.');
    } finally {
      setBusyPhoto(false);
    }
  };

  const photoButton = (
    <>
      {/* No `capture`: phones then offer both "take photo" and "choose from gallery" (screenshots too). */}
      <input ref={fileInput} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={onPhoto} data-testid="qr-photo-input" />
      <Button variant="secondary" onClick={() => fileInput.current?.click()} disabled={busyPhoto}>
        <ImageUp className="h-4 w-4" aria-hidden /> {busyPhoto ? 'Reading the picture…' : 'Scan from a photo'}
      </Button>
    </>
  );

  if (!live) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          {cameraAvailable() && (
            <Button onClick={() => { setError(''); setState('starting'); }}><Camera className="h-4 w-4" aria-hidden /> Scan with camera</Button>
          )}
          {photoButton}
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-xl border-2 border-primary/70 bg-black">
        <video ref={video} className="h-full w-full object-cover" muted playsInline aria-label="Camera preview" />
        <div aria-hidden className="pointer-events-none absolute inset-8 rounded-lg border-2 border-dashed border-primary/80" />
        {overlay}
      </div>
      <p className="text-center text-sm text-muted-foreground" aria-live="polite">{state === 'starting' ? 'Starting the camera…' : hint}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {cameras.length > 1 && (
          <Button variant="secondary" onClick={() => setCameraIndex((i) => (i + 1) % cameras.length)}>
            <SwitchCamera className="h-4 w-4" aria-hidden /> Switch camera
          </Button>
        )}
        <Button variant="outline" onClick={() => setState('idle')}><CameraOff className="h-4 w-4" aria-hidden /> Stop camera</Button>
      </div>
    </div>
  );
}
