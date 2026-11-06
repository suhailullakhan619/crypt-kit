import { can } from '../core/permissions.js';
import { nextStatuses } from '../core/statusFlow.js';

const humanise = (name) =>
  name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

/**
 * Public view of one field: secret/hidden fields never reach this function's output.
 */
function publicField(name, spec) {
  const out = { name, type: spec.type, label: spec.label ?? humanise(name) };
  for (const k of ['required', 'list', 'filter', 'search', 'min', 'max', 'values', 'multiple', 'ref', 'default', 'help', 'placeholder', 'unique']) {
    if (spec[k] !== undefined) out[k] = spec[k];
  }
  return out;
}

/**
 * Public metadata for one resource as seen by `role`.
 */
export function publicResource(resource, role, roles) {
  const { def } = resource;
  const disabled = def.genericDisabled ?? [];
  const fields = Object.entries(def.fields)
    .filter(([, s]) => !s.secret && !s.hidden)
    .map(([n, s]) => publicField(n, s));
  const flow = def.statusFlow
    ? {
        field: def.statusFlow.field,
        transitions: Object.fromEntries(def.statusFlow.transitions ? Object.keys(def.statusFlow.transitions).map((from) => [from, nextStatuses(def.statusFlow, from)]) : []),
        workflowOnly: def.statusFlow.workflowOnly ?? [],
      }
    : null;
  return {
    key: def.key,
    label: def.label,
    icon: def.icon ?? 'database',
    description: def.description ?? null,
    titleField: def.titleField ?? fields[0]?.name ?? null,
    fields,
    // Generic actions the UI may offer: role permission AND not genericDisabled (Req 16.12).
    permissions: {
      read: can(role, def, 'read', roles),
      create: can(role, def, 'create', roles) && !disabled.includes('create'),
      update: can(role, def, 'update', roles) && !disabled.includes('update'),
      delete: can(role, def, 'delete', roles) && !disabled.includes('delete'),
    },
    genericDisabled: disabled,
    rolePermissions: def.permissions,
    statusFlow: flow,
    due: def.due ?? null,
    softDelete: def.softDelete ? { field: def.softDelete.field, value: def.softDelete.value } : null,
    report: { columns: def.report?.columns ?? fields.filter((f) => f.list).map((f) => f.name) },
    searchable: fields.some((f) => f.search),
  };
}

/**
 * Full metadata for an authenticated user (Req 7.2, 7.3). Pure.
 * @param {{ all: () => any[] }} registry
 * @param {{ appName: string, theme: string, roles: string[] }} config
 * @param {{ role: string, name?: string, userId?: string }} user
 */
export function buildMeta(registry, config, user) {
  const resources = (registry?.all() ?? [])
    .filter((r) => can(user.role, r.def, 'read', config.roles))
    .map((r) => publicResource(r, user.role, config.roles));
  return {
    appName: config.appName,
    theme: config.theme,
    roles: config.roles,
    superuserRole: config.roles[0],
    user: { userId: user.userId, role: user.role, name: user.name ?? null },
    resources,
  };
}

/**
 * Unauthenticated metadata (Req 7.1, 15.3). Demo users are listed only in DEMO_MODE (no passwords).
 */
export function buildPublicMeta(config, env) {
  return {
    appName: config.appName,
    theme: config.theme,
    demo: env.DEMO_MODE,
    voiceProvider: env.VOICE_PROVIDER,
    demoUsers: env.DEMO_MODE ? (config.demoUsers ?? []).map(({ name, email, role }) => ({ name, email, role })) : [],
  };
}
