---
inclusion: fileMatch
fileMatchPattern: "**/server/src/**/*.js"
---

# Server Conventions

Follow the layered pattern exactly. Each layer has one job.

## Route → Controller → Service → Model

```js
// routes/checkouts.js — wiring only: path + middleware + controller
router.post('/', authenticate, requirePermission('checkouts', 'create'), checkoutController.create);

// controllers/checkoutController.js — thin: read req, call service, send res
export const create = asyncHandler(async (req, res) => {
  const checkout = await checkoutService.checkout(req.body, req.user);
  res.status(201).json({ checkout });
});

// services/checkoutService.js — all logic; throws httpError(status, message)
export async function checkout({ equipmentId, dueBack }, actor) {
  const item = await Equipment.findById(equipmentId);
  if (!item) throw httpError(404, 'Equipment not found');
  if (item.status !== 'Available') throw httpError(409, 'Equipment is not available');
  // ...
}
```

## Rules

- Wrap every async controller in `asyncHandler`.
- Throw `httpError(status, message)` from `utils/httpError.js`. Never `res.status()` inside a service.
- Response shape: a single object goes under a named key (`{ asset }`), and a list uses `{ items, total, page, pages }`.
- Multi-document writes that must be atomic use `mongoose.startSession()` + `withTransaction`. In DEMO_MODE the memory server runs as a replica set so transactions work.
- Every mutation in a service calls `activityService.record({ actor, resource, recordId, action, diff })`.
- Validate request bodies against the resource definition before hitting Mongoose. Unknown fields are stripped, never stored.
- JSDoc every exported service function: params, return, and `@throws` with status codes.
