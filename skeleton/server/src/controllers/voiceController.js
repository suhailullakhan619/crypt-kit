import * as voiceService from '../services/voiceService.js';
import * as speech from '../services/speechService.js';
import { getContext } from '../context.js';
import asyncHandler from '../utils/asyncHandler.js';
import { httpError } from '../utils/httpError.js';

/** POST /api/voice/ask — body { text } → 200 { transcript, intent, answer, data } */
export const ask = asyncHandler(async (req, res) => {
  res.status(200).json(await voiceService.answer(req.body?.text, req.user, { tzOffset: Number(req.body?.tzOffset) }));
});

/**
 * POST /api/voice/query — multipart field `audio` → audio/mpeg,
 * with X-Transcript / X-Answer / X-Intent headers (URI-encoded). openai provider only.
 */
export const query = asyncHandler(async (req, res) => {
  if (getContext().env.VOICE_PROVIDER !== 'openai') {
    throw httpError(400, 'Server-side voice is disabled; the browser speech provider is in use');
  }
  if (!req.file?.buffer?.length) throw httpError(400, 'An audio file is required (field "audio")');

  const transcript = await speech.transcribe(req.file.buffer, req.file.originalname, req.file.mimetype);
  const result = await voiceService.answer(transcript || ' ', req.user).catch((err) => {
    if (err.status === 400) return { transcript, intent: 'UNKNOWN', answer: "I didn't hear a question. Please try again." };
    throw err;
  });
  const audio = await speech.speak(result.answer);

  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('X-Transcript', encodeURIComponent(transcript));
  res.setHeader('X-Answer', encodeURIComponent(result.answer));
  res.setHeader('X-Intent', result.intent);
  res.status(200).send(audio);
});

/** GET /api/voice/examples → 200 { examples, provider } */
export const examples = (req, res) => {
  res.status(200).json({ examples: voiceService.examples(req.user), provider: getContext().env.VOICE_PROVIDER });
};
