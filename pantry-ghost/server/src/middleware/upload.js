import multer from 'multer';
import { httpError } from '../utils/httpError.js';

/**
 * Voice audio upload: memory storage only (never written to disk), 10 MB max, audio/* only.
 * Some browsers label MediaRecorder output as video/webm, so that is accepted too.
 */
export const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype.startsWith('audio/') || file.mimetype === 'video/webm';
    cb(ok ? null : httpError(415, 'Only audio uploads are accepted'), ok);
  },
}).single('audio');
