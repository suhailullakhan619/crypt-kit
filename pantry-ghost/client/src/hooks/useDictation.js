import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApi } from './useApi';
import { useRecorder, canRecord } from './useRecorder';
import { useSpeech, canRecognise } from './useSpeech';
import { examples as fetchExamples, query as voiceQuery } from '../api/voice';

/**
 * Hands-free dictation for intake (Req 4.6), built on the skeleton's voice hooks.
 *  - browser provider: one tap listens once (Web Speech API) and resolves with the transcript;
 *  - openai provider: first tap starts recording (resolves null), second tap stops, sends the
 *    audio to /voice/query (Whisper) and resolves with the transcript.
 * Never saves anything: callers turn the transcript into a draft.
 */
export function useDictation() {
  const api = useApi();
  const recorder = useRecorder();
  const speech = useSpeech();
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({ queryKey: ['voice', 'examples'], queryFn: () => fetchExamples(api), staleTime: 300_000 });
  const provider = data?.provider ?? 'browser';
  const available = provider === 'openai' ? canRecord() : canRecognise();

  const toggle = useCallback(async () => {
    if (provider === 'openai') {
      if (!recorder.recording) {
        await recorder.start();
        setListening(true);
        return null;
      }
      const blob = await recorder.stop();
      setListening(false);
      setBusy(true);
      try {
        return (await voiceQuery(api, blob)).transcript || null;
      } finally {
        setBusy(false);
      }
    }
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
  }, [api, listening, provider, recorder, speech]);

  return { available, listening, busy, toggle, speak: speech.speak };
}
