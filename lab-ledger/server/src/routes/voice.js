import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { audioUpload } from '../middleware/upload.js';
import * as voiceController from '../controllers/voiceController.js';

const router = Router();

router.post('/ask', authenticate, voiceController.ask);
router.post('/query', authenticate, audioUpload, voiceController.query);
router.get('/examples', authenticate, voiceController.examples);

export default router;
