import { useCallback, useState } from 'react';
import { useSpeech, canRecognise } from './useSpeech';

/**
 * Hands-free dictation for intake (Req 4.6), built on the skeleton's voice hook: one tap listens once
 * (browser Web Speech API) and resolves with the transcript; a second tap stops early.
 * Never saves anything: callers turn the transcript into a draft.
 */
export function useDictation() {
  const speech = useSpeech();
  const [listening, setListening] = useState(false);
  const available = canRecognise();
  const toggle = useCallback(async () => {
    if (listening) {
      speech.stopListening();
      return null;
    }
    setListening(true);
    try {
      return (await speech.listen()) || null;
    } finally {
      setListening(false);
    }
  }, [listening, speech]);
  return { available, listening, busy: false, toggle, speak: speech.speak };
}
