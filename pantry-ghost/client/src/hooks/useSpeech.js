import { useCallback, useRef } from 'react';

const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition ?? window.webkitSpeechRecognition : undefined;

/** True when the browser offers speech recognition (Web Speech API). */
export const canRecognise = () => !!Recognition;

const supportsSynthesis = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

/** Words that mark the clean, natural-sounding voices that ship with modern browsers and systems. */
const NATURAL = /natural|neural|premium|enhanced|online/i;
const FRIENDLY = /\b(aria|jenny|sonia|libby|ava|allison|samantha|serena|joanna|zira|google (us|uk) english|google \w+ \(female\))\b/i;
const ROBOTIC = /espeak|compact|festival|pico|novelty|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|junior|organ|trinoids|whisper|wobble|zarvox|albert|fred|ralph/i;

/**
 * Picks the most pleasant installed voice for `lang`: a natural/neural voice first (Edge and Windows 11
 * "Natural" voices, Apple "Premium"), then Google's and the well-known clear system voices, never a
 * novelty or robotic one. Returns null when the device has no voices (the browser default is used).
 * Pure, so it is unit tested.
 */
export function pickVoice(voices = [], lang = 'en-US') {
  const want = String(lang || 'en-US').toLowerCase();
  const base = want.split('-')[0];
  const score = (v) => {
    const l = String(v.lang ?? '').toLowerCase().replace('_', '-');
    if (l.split('-')[0] !== base) return -1;
    if (ROBOTIC.test(v.name)) return -1;
    let s = 1;
    if (l === want) s += 30;
    if (NATURAL.test(v.name)) s += 100;
    if (/google/i.test(v.name)) s += 40;
    if (FRIENDLY.test(v.name)) s += 30;
    if (v.default) s += 5;
    return s;
  };
  const best = [...voices].map((v) => [v, score(v)]).filter(([, s]) => s > 0).sort((x, y) => y[1] - x[1])[0];
  return best ? best[0] : null;
}

/** Splits an answer into sentences. Long utterances get cut off by some browsers; short ones never do. */
export function splitSentences(text) {
  const parts = String(text).replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]*\s*/g) ?? [];
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** Voices load late in some browsers; wait briefly for them once. */
function voicesReady() {
  const synth = window.speechSynthesis;
  if (synth.getVoices().length) return Promise.resolve();
  return new Promise((resolve) => {
    const t = setTimeout(resolve, 800);
    synth.addEventListener?.('voiceschanged', () => { clearTimeout(t); resolve(); }, { once: true });
  });
}

/**
 * Browser speech provider (Req 11.7): recognition via SpeechRecognition, playback via speechSynthesis.
 */
export function useSpeech() {
  const recognition = useRef(null);
  const run = useRef(0); // bumped by every speak() and stopSpeaking(), so a cancelled answer does not carry on with its next sentence

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

  /** Speaks text in the best voice this device has; resolves when finished (or at once if synthesis is unavailable). */
  const speak = useCallback(async (text) => {
    if (!supportsSynthesis() || !text) return;
    const synth = window.speechSynthesis;
    const mine = ++run.current;
    synth.cancel();
    const voice = await voicesReady().then(() => pickVoice(synth.getVoices(), navigator.language));
    for (const part of splitSentences(text)) {
      if (mine !== run.current) return;
      await new Promise((resolve) => {
        const u = new SpeechSynthesisUtterance(part);
        if (voice) { u.voice = voice; u.lang = voice.lang; }
        u.rate = 0.97;
        u.pitch = 1;
        // Some browsers never fire onend (no voices installed); don't leave the UI stuck on "Speaking".
        const fallback = setTimeout(resolve, 1500 + part.length * 90);
        const done = () => { clearTimeout(fallback); resolve(); };
        u.onend = done;
        u.onerror = done;
        synth.speak(u);
      });
    }
  }, []);
  /** Silences the current answer. */
  const stopSpeaking = useCallback(() => {
    run.current += 1;
    if (supportsSynthesis()) window.speechSynthesis.cancel();
  }, []);
  return { listen, stopListening, speak, stopSpeaking };
}
