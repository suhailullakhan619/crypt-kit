import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import * as voiceController from '../controllers/voiceController.js';

const router = Router();
// Polly costs money per character, so each user gets a modest allowance.
export const speakLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  keyFn: (req) => req.user?.userId ?? '',
  message: 'You have asked for a lot of spoken answers. Please wait a few minutes.',
});

router.post('/ask', authenticate, voiceController.ask);
router.post('/speak', authenticate, speakLimit, voiceController.speak);
router.get('/examples', authenticate, voiceController.examples);

export default router;
