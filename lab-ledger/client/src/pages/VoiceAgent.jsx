import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Mic, Square, Send, Volume2 } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useRecorder, canRecord } from '../hooks/useRecorder';
import { useSpeech, canRecognise } from '../hooks/useSpeech';
import { ask, examples as fetchExamples, query as voiceQuery } from '../api/voice';
import { PageHeader } from '../components/layout/AppShell';
import { Card } from '../components/ui/display';
import { Button } from '../components/ui/button';
import { Input, Label } from '../components/ui/input';
import { GhostOrb } from '../components/spooky';
import { errorMessage, cn } from '../lib/utils';

// Rich renderers for intent data: client/src/voice/<INTENT>.jsx (Req 16.9)
const renderers = import.meta.glob('../voice/*.jsx', { eager: true });
const rendererFor = (intent) => renderers[`../voice/${intent}.jsx`]?.default ?? null;

const STATUS_TEXT = {
  idle: 'Tap the beaker and ask a question',
  listening: 'Listening… tap again when you are done',
  thinking: 'Consulting the spirits…',
  speaking: 'Speaking…',
  error: 'Something went wrong',
};

/**
 * Voice agent (Req 11.4–11.10). Providers:
 *  - openai: record with MediaRecorder → /voice/query → play audio/mpeg
 *  - browser: SpeechRecognition → /voice/ask → speechSynthesis
 *  - text: always available, and the only option when neither is supported.
 */
export default function VoiceAgent() {
  const api = useApi();
  const recorder = useRecorder();
  const speech = useSpeech();
  const audioRef = useRef(null);
  const [state, setState] = useState('idle');
  const [result, setResult] = useState(null);
  const [answerId, setAnswerId] = useState(0); // new answer, new card: a confirm card must not keep the last answer's state
  const [error, setError] = useState(null);
  const [text, setText] = useState('');

  const { data: ex } = useQuery({ queryKey: ['voice', 'examples'], queryFn: () => fetchExamples(api) });
  const provider = ex?.provider ?? 'browser';
  const micAvailable = provider === 'openai' ? canRecord() : canRecognise();

  const fail = (err) => {
    setError(errorMessage(err));
    setState('error');
  };

  const askText = async (question, { speak = true } = {}) => {
    if (!question.trim()) return;
    setError(null);
    setState('thinking');
    try {
      const res = await ask(api, question);
      setResult(res);
      setAnswerId((n) => n + 1);
      if (speak) {
        setState('speaking');
        await speech.speak(res.answer);
      }
      setState('idle');
    } catch (err) {
      fail(err);
    }
  };

  const onOrb = async () => {
    setError(null);
    try {
      if (provider === 'openai') {
        if (!recorder.recording) {
          await recorder.start();
          setState('listening');
          return;
        }
        const blob = await recorder.stop();
        setState('thinking');
        const res = await voiceQuery(api, blob);
        setResult(res);
        setAnswerId((n) => n + 1);
        setState('speaking');
        const url = URL.createObjectURL(res.audio);
        audioRef.current.src = url;
        audioRef.current.onended = () => { URL.revokeObjectURL(url); setState('idle'); };
        await audioRef.current.play();
      } else {
        if (state === 'listening') { speech.stopListening(); return; }
        setState('listening');
        const heard = await speech.listen();
        if (!heard) { setState('idle'); return; }
        setText(heard);
        await askText(heard);
      }
    } catch (err) {
      fail(err.name === 'NotAllowedError' ? new Error('Microphone permission was denied. You can type your question instead.') : err);
    }
  };

  const Renderer = result ? rendererFor(result.intent) : null;
  const busy = state === 'thinking' || state === 'speaking';

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader title="Voice agent" description="Ask about your records out loud, or type if your hands are free." icon={<Volume2 className="h-6 w-6 text-primary" />} />

      <Card className="flex flex-col items-center gap-5 px-5 py-8 text-center">
        <button
          type="button"
          onClick={onOrb}
          disabled={!micAvailable || busy}
          aria-label={state === 'listening' ? 'Stop listening' : 'Start listening'}
          aria-pressed={state === 'listening'}
          className="rounded-full disabled:cursor-not-allowed"
        >
          <GhostOrb state={state} />
        </button>

        <p aria-live="polite" className={cn('text-sm font-medium', state === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
          {state === 'error' ? error : micAvailable ? STATUS_TEXT[state] : 'Voice input is not available in this browser. Type your question below.'}
        </p>

        {micAvailable && (
          <Button variant={state === 'listening' ? 'destructive' : 'default'} onClick={onOrb} disabled={busy}>
            {state === 'listening' ? <><Square className="h-4 w-4" aria-hidden /> Stop</> : <><Mic className="h-4 w-4" aria-hidden /> Ask by voice</>}
          </Button>
        )}

        <form onSubmit={(e) => { e.preventDefault(); askText(text); }} className="flex w-full max-w-xl items-end gap-2 text-left">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="voice-text" className="text-xs text-muted-foreground">Or type a question</Label>
            <Input id="voice-text" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder="e.g. what is due this week?" />
          </div>
          <Button type="submit" size="icon" className="h-10 w-10" disabled={busy || !text.trim()} aria-label="Ask">
            <Send className="h-4 w-4" />
          </Button>
        </form>

        {ex?.examples?.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2" aria-label="Example questions">
            {ex.examples.map((q) => (
              <button key={q} type="button" disabled={busy} onClick={() => { setText(q); askText(q); }}
                className="rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-50">
                “{q}”
              </button>
            ))}
          </div>
        )}
        <audio ref={audioRef} className="hidden" />
      </Card>

      {result && (
        <Card className="animate-fade-up p-5" aria-live="polite">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">You asked</p>
          <p className="mt-1 text-sm">“{result.transcript}”</p>
          <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">Answer</p>
          <p className="mt-1 font-display text-xl leading-snug">{result.answer}</p>
          {Renderer && <div className="mt-4"><Renderer key={answerId} result={result} /></div>}
        </Card>
      )}
    </div>
  );
}
