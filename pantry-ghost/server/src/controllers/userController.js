import * as userService from '../services/userService.js';
import asyncHandler from '../utils/asyncHandler.js';

/** GET /api/users?page&limit → 200 { items, total, page, pages } (Superuser) */
export const list = asyncHandler(async (req, res) => {
  res.status(200).json(await userService.listUsers(req.query));
});

/** POST /api/users → 201 { user } (Superuser) */
export const create = asyncHandler(async (req, res) => {
  const user = await userService.createUser(req.body ?? {});
  res.status(201).json({ user });
});

/** PATCH /api/users/:id → 200 { user } (Superuser) */
export const update = asyncHandler(async (req, res) => {
  const user = await userService.updateUser(req.params.id, req.body ?? {}, req.user);
  res.status(200).json({ user });
});

/** GET /api/users/search?q → 200 { items: [{ _id, name }] } (any authenticated user; for ref pickers) */
export const search = asyncHandler(async (req, res) => {
  res.status(200).json({ items: await userService.searchUsers(String(req.query.q ?? '')) });
});
