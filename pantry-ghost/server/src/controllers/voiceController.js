import * as voiceService from '../services/voiceService.js';
import * as speech from '../services/speechService.js';
import { getContext } from '../context.js';
import asyncHandler from '../utils/asyncHandler.js';
import { httpError } from '../utils/httpError.js';

export const MAX_SPEAK_LENGTH = 1500;

/** POST /api/voice/ask - body { text, tzOffset? } -> 200 { transcript, intent, answer, data } */
export const ask = asyncHandler(async (req, res) => {
  res.status(200).json(await voiceService.answer(req.body?.text, req.user, { tzOffset: Number(req.body?.tzOffset) }));
});

/** POST /api/voice/speak - body { text } -> audio/mpeg from Amazon Polly. polly provider only. */
export const speak = asyncHandler(async (req, res) => {
  if (getContext().env.VOICE_PROVIDER !== 'polly') {
    throw httpError(400, 'Server-side voice is disabled; the browser speech provider is in use');
  }
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text) throw httpError(400, 'Text to speak is required');
  if (text.length > MAX_SPEAK_LENGTH) throw httpError(400, `Text is too long (max ${MAX_SPEAK_LENGTH} characters)`);
  const audio = await speech.speak(text);
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(audio);
});

/** GET /api/voice/examples -> 200 { examples, provider } */
export const examples = (req, res) => {
  res.status(200).json({ examples: voiceService.examples(req.user), provider: getContext().env.VOICE_PROVIDER });
};
