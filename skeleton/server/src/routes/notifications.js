import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import * as notifications from '../services/notificationService.js';
import asyncHandler from '../utils/asyncHandler.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = Router();
router.use(authenticate);

// GET /api/notifications?unread=true → { items, unread } (the caller's own, newest first)
router.get('/', asyncHandler(async (req, res) => {
  res.status(200).json(await notifications.listFor(req.user.userId, { unreadOnly: req.query.unread === 'true' }));
}));

// POST /api/notifications/read-all → { updated }
router.post('/read-all', asyncHandler(async (req, res) => {
  res.status(200).json({ updated: await notifications.markAllRead(req.user.userId) });
}));

// POST /api/notifications/test-email → { to } (emails the caller; 5 per 15 minutes)
router.post('/test-email', rateLimit({ max: 5, keyFn: (req) => req.user.userId, message: 'Too many test emails. Try again later.' }), asyncHandler(async (req, res) => {
  res.status(200).json(await notifications.sendTestEmail(req.user.userId));
}));

// POST /api/notifications/:id/read → { item }
router.post('/:id/read', asyncHandler(async (req, res) => {
  res.status(200).json({ item: await notifications.markRead(req.user.userId, req.params.id) });
}));

export default router;
