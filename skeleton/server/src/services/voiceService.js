import { getContext, now as clockNow } from '../context.js';
import { can } from '../core/permissions.js';
import { parseIntent } from '../core/intentRegistry.js';
import { httpError } from '../utils/httpError.js';

export const MAX_QUESTION_LENGTH = 500;

const FALLBACK =
  "Sorry, the spirits didn't catch that. Try asking how many records there are, which ones are overdue, or what is due this week.";

/**
 * True when `user` may run `entry` (Req 11.9, 16.4).
 */
export function mayRun(entry, user, { registry, config }) {
  if (!entry.resource) return true;
  if (entry.aggregateOnly && entry.requires?.includes(user.role)) return true;
  const resource = registry?.get(entry.resource);
  return !!resource && can(user.role, resource.def, 'read', config.roles);
}

/**
 * Answers a typed or transcribed question.
 * @param {string} text
 * @param {{ userId: string, role: string, name?: string }} user
 * @param {{ now?: Date }} [opts]
 * @returns {Promise<{ transcript: string, intent: string, answer: string, data: any }>}
 */
export async function answer(text, user, { now = clockNow() } = {}) {
  if (typeof text !== 'string' || !text.trim()) throw httpError(400, 'Question text is required');
  if (text.length > MAX_QUESTION_LENGTH) throw httpError(400, `Question is too long (max ${MAX_QUESTION_LENGTH} characters)`);

  const ctx = getContext();
  const { intent, params, entry } = parseIntent(text, ctx.intents ?? []);
  if (!entry) return { transcript: text, intent: 'UNKNOWN', answer: FALLBACK, data: null };

  if (!mayRun(entry, user, ctx)) {
    const label = ctx.registry?.get(entry.resource)?.def.label ?? entry.resource;
    return { transcript: text, intent, answer: `Sorry, you don't have access to ${label}.`, data: null };
  }

  const data = await entry.handle(params, { registry: ctx.registry, config: ctx.config, user, now });
  return { transcript: text, intent, answer: entry.respond(data, params), data };
}

/**
 * Up to 8 example questions the user is allowed to ask (Req 11.10).
 */
export function examples(user) {
  const ctx = getContext();
  const out = [];
  for (const entry of ctx.intents ?? []) {
    if (!mayRun(entry, user, ctx)) continue;
    for (const ex of entry.examples ?? []) if (!out.includes(ex)) out.push(ex);
    if (out.length >= 8) break;
  }
  return out.slice(0, 8);
}
