import { useCallback, useRef, useState } from 'react';

/** True when the browser can record audio with MediaRecorder. */
export const canRecord = () =>
  typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

/**
 * Microphone recorder (MediaRecorder, webm/opus where available).
 * `start()` asks for the mic; `stop()` resolves with the recorded Blob.
 */
export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const rec = useRef(null);
  const chunks = useRef([]);
  const stream = useRef(null);

  const start = useCallback(async () => {
    stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find((m) => MediaRecorder.isTypeSupported?.(m));
    rec.current = new MediaRecorder(stream.current, mime ? { mimeType: mime } : undefined);
    chunks.current = [];
    rec.current.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    rec.current.start();
    setRecording(true);
  }, []);

  const stop = useCallback(
    () =>
      new Promise((resolve) => {
        const r = rec.current;
        if (!r) return resolve(null);
        r.onstop = () => {
          stream.current?.getTracks().forEach((t) => t.stop());
          setRecording(false);
          resolve(new Blob(chunks.current, { type: r.mimeType || 'audio/webm' }));
        };
        r.stop();
      }),
    []
  );

  return { recording, start, stop };
}
