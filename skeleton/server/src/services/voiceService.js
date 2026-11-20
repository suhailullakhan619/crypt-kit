import { getContext, now as clockNow } from '../context.js';
import { can } from '../core/permissions.js';
import { parseIntent } from '../core/intentRegistry.js';
import { exampleQuestions } from '../core/assistantIntents.js';
import { httpError } from '../utils/httpError.js';
import { askAssistant } from './assistantService.js';

export const MAX_QUESTION_LENGTH = 500;

/** Shown when nothing understood the question. `hints` are example questions this user may ask. */
const fallback = (hints) =>
  `Sorry, I didn't catch that. ${hints.length ? `Try something like ${hints.slice(0, 3).map((h) => `"${h}"`).join(', ')}, or say help.` : 'Try asking how many records there are, or what is overdue.'}`;

/**
 * True when `user` may run `entry` (Req 11.9, 16.4). Intents that pick their resource while matching
 * (the general QUERY intent) say which one in `params.resource`.
 */
export function mayRun(entry, user, { registry, config }, params = {}) {
  const key = params.resource ?? entry.resource;
  if (!key) return true;
  if (entry.aggregateOnly && entry.requires?.includes(user.role)) return true;
  const resource = registry?.get(key);
  return !!resource && can(user.role, resource.def, 'read', config.roles);
}

/**
 * Answers a typed or transcribed question.
 * @param {string} text
 * @param {{ userId: string, role: string, name?: string }} user
 * @param {{ now?: Date, tzOffset?: number }} [opts] `tzOffset` is the asker's `Date#getTimezoneOffset()`
 * @returns {Promise<{ transcript: string, intent: string, answer: string, data: any }>}
 */
export async function answer(text, user, { now = clockNow(), tzOffset = 0 } = {}) {
  if (typeof text !== 'string' || !text.trim()) throw httpError(400, 'Question text is required');
  if (text.length > MAX_QUESTION_LENGTH) throw httpError(400, `Question is too long (max ${MAX_QUESTION_LENGTH} characters)`);
  const ctx = getContext();
  const tz = Number.isFinite(tzOffset) && Math.abs(tzOffset) <= 840 ? tzOffset : 0;
  const { intent, params, entry } = parseIntent(text, ctx.intents ?? []);
  if (!entry) {
    // Nothing understood it. A language model (optional) gets a read-only try before we give up.
    const ai = await askAssistant(text, user, { ...ctx, now, tz });
    if (ai) return { transcript: text, intent: 'ASSISTANT', answer: ai.answer, data: ai.data };
    return { transcript: text, intent: 'UNKNOWN', answer: fallback(exampleQuestions(ctx.registry, ctx.config, user)), data: null };
  }
  if (!mayRun(entry, user, ctx, params)) {
    const key = params.resource ?? entry.resource;
    const label = ctx.registry?.get(key)?.def.label ?? key;
    return { transcript: text, intent, answer: `Sorry, you don't have access to ${label}.`, data: null };
  }
  const data = await entry.handle(params, { registry: ctx.registry, config: ctx.config, user, now, tz });
  return { transcript: text, intent, answer: entry.respond(data, params), data };
}

const BUILT_IN = new Set(['COUNT_BY_VALUE', 'COUNT_ALL', 'LIST_OVERDUE', 'DUE_SOON', 'LOOKUP', 'OVERVIEW', 'GREETING', 'HELP', 'QUERY']);

/**
 * Up to 8 example questions the user is allowed to ask (Req 11.10): the app's own commands first
 * (they are what makes this app different), then role-aware general questions, then one example per
 * resource so the chips show variety rather than only the first resource's questions.
 */
export function examples(user) {
  const ctx = getContext();
  const out = [];
  const add = (s) => { if (s && !out.includes(s) && out.length < 8) out.push(s); };
  const runnable = (ctx.intents ?? []).filter((e) => mayRun(e, user, ctx));
  runnable.filter((e) => !BUILT_IN.has(e.name)).slice(0, 4).forEach((e) => add(e.examples?.[0]));
  exampleQuestions(ctx.registry, ctx.config, user).filter((e) => e !== 'help').slice(0, 3).forEach(add);
  const byResource = new Map();
  for (const entry of runnable) {
    const bucket = byResource.get(entry.resource ?? '*') ?? [];
    for (const ex of entry.examples ?? []) bucket.push(ex);
    byResource.set(entry.resource ?? '*', bucket);
  }
  // round-robin: first example of each resource, then second, and so on
  for (let i = 0; out.length < 8; i++) {
    let any = false;
    for (const bucket of byResource.values()) {
      if (bucket[i]) { any = true; add(bucket[i]); }
    }
    if (!any) break;
  }
  return out.slice(0, 8);
}