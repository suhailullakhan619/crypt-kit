/**
 * Creates an Error carrying an HTTP status. Services throw these; the global
 * error handler turns them into `{ error: message, ...extra }` responses.
 *
 * @param {number} status - HTTP status (400–599)
 * @param {string} message - safe, user-facing message
 * @param {object} [extra] - extra JSON fields to include in the response (e.g. `{ fields }`)
 * @returns {Error & { status: number, extra?: object }}
 */
export function httpError(status, message, extra) {
  const err = new Error(message);
  err.status = status;
  if (extra) err.extra = extra;
  return err;
}

export default httpError;
