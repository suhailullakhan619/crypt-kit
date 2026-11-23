import * as voiceService from '../services/voiceService.js';
import { getContext } from '../context.js';
import asyncHandler from '../utils/asyncHandler.js';

/** POST /api/voice/ask - body { text, tzOffset? } -> 200 { transcript, intent, answer, data } */
export const ask = asyncHandler(async (req, res) => {
  res.status(200).json(await voiceService.answer(req.body?.text, req.user, { tzOffset: Number(req.body?.tzOffset) }));
});

/** GET /api/voice/examples -> 200 { examples, provider } */
export const examples = (req, res) => {
  res.status(200).json({ examples: voiceService.examples(req.user), provider: getContext().env.VOICE_PROVIDER });
};
