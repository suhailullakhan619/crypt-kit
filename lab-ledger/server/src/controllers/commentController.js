import * as commentService from '../services/commentService.js';
import asyncHandler from '../utils/asyncHandler.js';

/** GET /api/r/:key/:id/comments ? 200 { items } oldest first */
export const list = asyncHandler(async (req, res) => {
  res.status(200).json({ items: await commentService.list(req.resource, req.params.id, req.user) });
});

/** POST /api/r/:key/:id/comments { body } ? 201 one comment */
export const add = asyncHandler(async (req, res) => {
  res.status(201).json(await commentService.add(req.resource, req.params.id, req.body?.body, req.user));
});

/** DELETE /api/r/:key/:id/comments/:commentId ? 204 (author or superuser) */
export const remove = asyncHandler(async (req, res) => {
  await commentService.remove(req.resource, req.params.id, req.params.commentId, req.user);
  res.status(204).end();
});
