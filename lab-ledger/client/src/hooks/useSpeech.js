import { useCallback, useRef } from 'react';

const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition ?? window.webkitSpeechRecognition : undefined;

/** True when the browser offers speech recognition (Web Speech API). */
export const canRecognise = () => !!Recognition;

/**
 * Browser speech provider (Req 11.7): recognition via SpeechRecognition, playback via speechSynthesis.
 */
export function useSpeech() {
  const recognition = useRef(null);

  /** Listens once; resolves with the transcript ('' when nothing was heard). */
  const listen = useCallback(
    () =>
      new Promise((resolve, reject) => {
        if (!Recognition) return reject(new Error('Speech recognition is not supported in this browser'));
        const r = new Recognition();
        recognition.current = r;
        r.lang = navigator.language || 'en-US';
        r.interimResults = false;
        r.maxAlternatives = 1;
        let heard = '';
        r.onresult = (e) => { heard = e.results[0]?.[0]?.transcript ?? ''; };
        r.onerror = (e) => (e.error === 'no-speech' ? resolve('') : reject(new Error(`Speech recognition error: ${e.error}`)));
        r.onend = () => resolve(heard);
        r.start();
      }),
    []
  );

  const stopListening = useCallback(() => recognition.current?.stop(), []);

  /** Speaks text; resolves when finished (or immediately if synthesis is unavailable). */
  const speak = useCallback(
    (text) =>
      new Promise((resolve) => {
        if (!('speechSynthesis' in window) || !text) return resolve();
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 1;
        u.pitch = 0.9;
        // Some browsers never fire onend (no voices installed); don't leave the UI stuck on "Speaking".
        const fallback = setTimeout(resolve, 1500 + text.length * 90);
        const done = () => { clearTimeout(fallback); resolve(); };
        u.onend = done;
        u.onerror = done;
        window.speechSynthesis.speak(u);
      }),
    []
  );

  return { listen, stopListening, speak };
}
