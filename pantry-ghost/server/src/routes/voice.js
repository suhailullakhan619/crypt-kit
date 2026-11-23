import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import * as voiceController from '../controllers/voiceController.js';

const router = Router();

router.post('/ask', authenticate, voiceController.ask);
router.get('/examples', authenticate, voiceController.examples);

export default router;
