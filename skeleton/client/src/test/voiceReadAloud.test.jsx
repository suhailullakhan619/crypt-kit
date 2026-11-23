// Reading answers aloud: the best installed voice, sentence by sentence, with a switch to turn it off.
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { renderAt, signIn } from './render';
import VoiceAgent from '../pages/VoiceAgent';
import { pickVoice, splitSentences } from '../hooks/useSpeech';
import { ask, examples } from '../api/voice';

vi.mock('../appRoutes', () => ({ default: [], reportPresets: [], bulkActions: {} }));
vi.mock('../api/meta', () => ({
  meta: vi.fn(async () => ({ appName: 'T', roles: ['Admin', 'Member'], superuserRole: 'Admin', resources: [] })),
  publicMeta: vi.fn(async () => ({})),
}));
vi.mock('../api/voice', () => ({ ask: vi.fn(), examples: vi.fn() }));

const v = (name, lang = 'en-US', extra = {}) => ({ name, lang, ...extra });

describe('pickVoice', () => {
  it('prefers a natural/neural voice over everything else', () => {
    const voices = [v('Google US English'), v('Microsoft Aria Online (Natural) - English (United States)'), v('Samantha')];
    expect(pickVoice(voices, 'en-US').name).toMatch(/Natural/);
  });
  it('then Google or a well-known clear voice, and never a robotic or novelty one', () => {
    expect(pickVoice([v('eSpeak English'), v('Zarvox'), v('Google US English'), v('Some Voice')], 'en-US').name).toBe('Google US English');
    expect(pickVoice([v('eSpeak English'), v('Zarvox')], 'en-US')).toBeNull();
  });
  it('matches the language, preferring the exact region', () => {
    const voices = [v('Google UK English Female', 'en-GB'), v('Google US English', 'en-US'), v('Google español', 'es-ES')];
    expect(pickVoice(voices, 'en-GB').lang).toBe('en-GB');
    expect(pickVoice(voices, 'es-MX').name).toBe('Google español');
    expect(pickVoice(voices, 'fr-FR')).toBeNull();
  });
  it('copes with no voices at all', () => {
    expect(pickVoice([], 'en-US')).toBeNull();
    expect(pickVoice(undefined)).toBeNull();
  });
});

describe('splitSentences', () => {
  it('breaks an answer into short sentences and ignores extra whitespace', () => {
    expect(splitSentences('You have 2 tasks.  The first is due today! Anything else?')).toEqual(['You have 2 tasks.', 'The first is due today!', 'Anything else?']);
    expect(splitSentences('no full stop')).toEqual(['no full stop']);
    expect(splitSentences('   ')).toEqual([]);
  });
});

describe('read answers aloud', () => {
  const spoken = [];
  beforeEach(() => {
    localStorage.clear();
    signIn({ role: 'Member' });
    vi.clearAllMocks();
    spoken.length = 0;
    ask.mockResolvedValue({ transcript: 'hi', intent: 'GREETING', answer: 'Hello there. You have two tasks.', data: null });
    examples.mockResolvedValue({ examples: [], provider: 'browser' });
    window.SpeechSynthesisUtterance = function Utterance(text) { this.text = text; };
    window.speechSynthesis = {
      getVoices: () => [v('Google US English'), v('Microsoft Aria Online (Natural) - English (United States)')],
      cancel: vi.fn(),
      speak: vi.fn((u) => { spoken.push({ text: u.text, voice: u.voice?.name }); setTimeout(() => u.onend?.(), 0); }),
    };
  });
  const send = async () => {
    fireEvent.change(await screen.findByLabelText('Or type a question'), { target: { value: 'hi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask', exact: true }));
  };

  it('speaks each sentence in the natural voice', async () => {
    renderAt(<VoiceAgent />);
    await send();
    await waitFor(() => expect(spoken.map((s) => s.text)).toEqual(['Hello there.', 'You have two tasks.']));
    expect(spoken.every((s) => /Natural/.test(s.voice))).toBe(true);
  });

  it('the checkbox turns speaking off, and the choice is remembered', async () => {
    renderAt(<VoiceAgent />);
    const box = await screen.findByRole('checkbox', { name: /Read answers aloud/ });
    expect(box).toBeChecked();
    fireEvent.click(box);
    expect(localStorage.getItem('crypt_read_aloud')).toBe('off');
    await send();
    expect(await screen.findByText('Hello there. You have two tasks.')).toBeInTheDocument();
    expect(spoken).toEqual([]);
  });

  it('starts switched off when it was switched off before', async () => {
    localStorage.setItem('crypt_read_aloud', 'off');
    renderAt(<VoiceAgent />);
    expect(await screen.findByRole('checkbox', { name: /Read answers aloud/ })).not.toBeChecked();
  });
});
