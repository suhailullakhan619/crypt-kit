/**
 * Pure status-flow checks (Req 5.8, 16.3).
 */

/**
 * @param {{ transitions: Record<string, string[]> }} flow
 * @param {string} from
 * @param {string} to
 * @returns {boolean} true when `to` is reachable from `from` in one step (or unchanged)
 */
export function canTransition(flow, from, to) {
  if (from === to) return true;
  return (flow?.transitions?.[from] ?? []).includes(to);
}

/**
 * Check used by the GENERIC update path. Workflow-only states can be neither entered nor left
 * through generic PATCH, regardless of the transitions map; domain services set them directly.
 *
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function checkGenericTransition(flow, from, to) {
  if (from === to) return { ok: true };
  const locked = flow?.workflowOnly ?? [];
  if (locked.includes(from) || locked.includes(to)) {
    const which = locked.includes(to) ? to : from;
    return { ok: false, message: `Status "${which}" is managed by a workflow and cannot be set directly` };
  }
  if (!canTransition(flow, from, to)) {
    return { ok: false, message: `Cannot change status from "${from}" to "${to}"` };
  }
  return { ok: true };
}

/** Allowed next statuses for UI buttons on the generic detail page. */
export function nextStatuses(flow, from) {
  const locked = flow?.workflowOnly ?? [];
  if (locked.includes(from)) return [];
  return (flow?.transitions?.[from] ?? []).filter((s) => !locked.includes(s));
}
