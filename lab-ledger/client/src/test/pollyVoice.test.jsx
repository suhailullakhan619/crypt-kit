// Spoken answers: Amazon Polly when the server has it, the browser voice otherwise or when Polly fails.
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { renderAt, signIn } from './render';
import VoiceAgent from '../pages/VoiceAgent';
import { ask, examples, speakAudio } from '../api/voice';

vi.mock('../appRoutes', () => ({ default: [], reportPresets: [], bulkActions: {} }));
vi.mock('../api/meta', () => ({
  meta: vi.fn(async () => ({ appName: 'T', roles: ['Admin', 'Member'], superuserRole: 'Admin', resources: [] })),
  publicMeta: vi.fn(async () => ({})),
}));
vi.mock('../api/voice', () => ({ ask: vi.fn(), examples: vi.fn(), speakAudio: vi.fn() }));

const spoken = [];
beforeEach(() => {
  localStorage.clear();
  signIn({ role: 'Member' });
  vi.clearAllMocks();
  spoken.length = 0;
  ask.mockResolvedValue({ transcript: 'hi', intent: 'GREETING', answer: 'Hello there.', data: null });
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
  window.HTMLMediaElement.prototype.pause = vi.fn();
  window.HTMLMediaElement.prototype.play = vi.fn(function play() { setTimeout(() => this.onended?.(), 0); return Promise.resolve(); });
  window.SpeechSynthesisUtterance = function Utterance(text) { this.text = text; };
  window.speechSynthesis = { cancel: vi.fn(), speak: vi.fn((u) => { spoken.push(u.text); u.onend?.(); }) };
});

const provider = (p) => examples.mockResolvedValue({ examples: [], provider: p });
const send = async (text = 'hi') => {
  fireEvent.change(await screen.findByLabelText('Or type a question'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Ask', exact: true }));
};

describe('read answers aloud', () => {
  it('polly: the answer is fetched from the server and played, the browser voice stays quiet', async () => {
    provider('polly');
    speakAudio.mockResolvedValue(new Blob(['mp3'], { type: 'audio/mpeg' }));
    renderAt(<VoiceAgent />);
    expect(await screen.findByText(/Amazon Polly/)).toBeInTheDocument();
    await send();
    await waitFor(() => expect(speakAudio).toHaveBeenCalledWith(expect.anything(), 'Hello there.'));
    await waitFor(() => expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled());
    expect(spoken).toEqual([]);
  });

  it('polly failure: falls back to the browser voice and still shows the answer', async () => {
    provider('polly');
    speakAudio.mockRejectedValue(new Error('502'));
    renderAt(<VoiceAgent />);
    await send();
    expect(await screen.findByText('Hello there.')).toBeInTheDocument();
    await waitFor(() => expect(spoken).toEqual(['Hello there.']));
  });

  it('browser provider: never calls Polly', async () => {
    provider('browser');
    renderAt(<VoiceAgent />);
    await send();
    await waitFor(() => expect(spoken).toEqual(['Hello there.']));
    expect(speakAudio).not.toHaveBeenCalled();
  });

  it('the checkbox turns speaking off, and the choice is remembered', async () => {
    provider('polly');
    renderAt(<VoiceAgent />);
    const box = await screen.findByRole('checkbox', { name: /Read answers aloud/ });
    expect(box).toBeChecked();
    fireEvent.click(box);
    expect(localStorage.getItem('crypt_read_aloud')).toBe('off');
    await send();
    expect(await screen.findByText('Hello there.')).toBeInTheDocument();
    expect(speakAudio).not.toHaveBeenCalled();
    expect(spoken).toEqual([]);
  });

  it('starts switched off when it was switched off before', async () => {
    localStorage.setItem('crypt_read_aloud', 'off');
    provider('browser');
    renderAt(<VoiceAgent />);
    expect(await screen.findByRole('checkbox', { name: /Read answers aloud/ })).not.toBeChecked();
  });
});
