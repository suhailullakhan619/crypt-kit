import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Mic, Square, Send, Volume2 } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useSpeech, canRecognise } from '../hooks/useSpeech';
import { ask, examples as fetchExamples, speakAudio } from '../api/voice';
import { PageHeader } from '../components/layout/AppShell';
import { Card } from '../components/ui/display';
import { Button } from '../components/ui/button';
import { Input, Label } from '../components/ui/input';
import { GhostOrb } from '../components/spooky';
import { errorMessage, cn } from '../lib/utils';

// Rich renderers for intent data: client/src/voice/<INTENT>.jsx (Req 16.9)
const renderers = import.meta.glob('../voice/*.jsx', { eager: true });
const rendererFor = (intent) => renderers[`../voice/${intent}.jsx`]?.default ?? null;

const READ_ALOUD_KEY = 'crypt_read_aloud';
const STATUS_TEXT = {
  idle: 'Tap the beaker and ask a question',
  listening: 'Listening… tap again when you are done',
  thinking: 'Consulting the spirits…',
  speaking: 'Speaking…',
  error: 'Something went wrong',
};

/**
 * Voice agent (Req 11.4-11.10). Listening uses the browser's SpeechRecognition; typing always works.
 * Answers are spoken with Amazon Polly when the server has it switched on (provider "polly"), and with the
 * browser's own voice otherwise, or whenever Polly fails, so a spoken answer never depends on AWS.
 */
export default function VoiceAgent() {
  const api = useApi();
  const speech = useSpeech();
  const audioRef = useRef(null);
  const [state, setState] = useState('idle');
  const [result, setResult] = useState(null);
  const [answerId, setAnswerId] = useState(0); // new answer, new card: a confirm card must not keep the last answer's state
  const [error, setError] = useState(null);
  const [readAloud, setReadAloud] = useState(() => localStorage.getItem(READ_ALOUD_KEY) !== 'off');
  const [text, setText] = useState('');

  const { data: ex } = useQuery({ queryKey: ['voice', 'examples'], queryFn: () => fetchExamples(api) });
  const provider = ex?.provider ?? 'browser';
  const micAvailable = canRecognise();

  const toggleReadAloud = (on) => {
    setReadAloud(on);
    localStorage.setItem(READ_ALOUD_KEY, on ? 'on' : 'off');
    if (!on) { audioRef.current?.pause?.(); window.speechSynthesis?.cancel?.(); }
  };
  /** Speaks an answer: Polly first when it is on, the browser voice if Polly is off or fails. */
  const sayAloud = async (answer) => {
    if (provider === 'polly') {
      try {
        const blob = await speakAudio(api, answer);
        const url = URL.createObjectURL(blob);
        const audio = audioRef.current;
        await new Promise((resolve, reject) => {
          audio.src = url;
          audio.onended = resolve;
          audio.onerror = () => reject(new Error('audio'));
          Promise.resolve(audio.play()).catch(reject);
        }).finally(() => URL.revokeObjectURL(url));
        return;
      } catch {
        /* fall through to the browser voice */
      }
    }
    await speech.speak(answer);
  };
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
      if (speak && readAloud) {
        setState('speaking');
        await sayAloud(res.answer);
      }
      setState('idle');
    } catch (err) {
      fail(err);
    }
  };

  const onOrb = async () => {
    setError(null);
    try {
      if (state === 'listening') { speech.stopListening(); return; }
      setState('listening');
      const heard = await speech.listen();
      if (!heard) { setState('idle'); return; }
      setText(heard);
      await askText(heard);
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

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={readAloud} onChange={(e) => toggleReadAloud(e.target.checked)} />
          Read answers aloud{provider === 'polly' ? ' (Amazon Polly)' : ''}
        </label>
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
          <p className="mt-1 break-words text-sm">“{result.transcript}”</p>
          <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">Answer</p>
          <p className="mt-1 break-words font-display text-xl leading-snug">{result.answer}</p>
          {Renderer && <div className="mt-4"><Renderer key={answerId} result={result} /></div>}
        </Card>
      )}
    </div>
  );
}
