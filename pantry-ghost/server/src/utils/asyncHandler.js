/**
 * Wraps an async route handler so that any rejected promise is forwarded
 * to Express's next(err) error handler, avoiding unhandled rejections.
 *
 * @param {Function} fn - async (req, res, next) => Promise
 * @returns {Function}  (req, res, next) => void
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export default asyncHandler;
