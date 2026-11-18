/**
 * Builds an OpenAPI 3.0 document from the resource registry, so the API docs can never drift from
 * the real resource definitions. Secret fields never appear; actions disabled with
 * `genericDisabled` are omitted. Open the JSON in Swagger Editor or import it into Postman.
 */

const SECURITY = [{ bearerAuth: [] }];
const ERR = { description: 'Error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };

function fieldSchema(spec) {
  let s;
  switch (spec.type) {
    case 'number': s = { type: 'number', ...(spec.min !== undefined && { minimum: spec.min }), ...(spec.max !== undefined && { maximum: spec.max }) }; break;
    case 'boolean': s = { type: 'boolean' }; break;
    case 'date': s = { type: 'string', format: 'date-time' }; break;
    case 'enum': s = spec.multiple ? { type: 'array', items: { type: 'string', enum: spec.values } } : { type: 'string', enum: spec.values }; break;
    case 'ref': s = { type: 'string', description: `Id of a ${spec.ref} record`, pattern: '^[0-9a-fA-F]{24}$' }; break;
    default: s = { type: 'string', ...(spec.min !== undefined && { minLength: spec.min }), ...(spec.max !== undefined && { maxLength: spec.max }) };
  }
  if (spec.label) s.title = spec.label;
  if (spec.help) s.description = s.description ? `${s.description}. ${spec.help}` : spec.help;
  if (spec.default !== undefined) s.default = spec.default;
  return s;
}

const pascal = (key) => key.split('-').map((p) => p[0].toUpperCase() + p.slice(1)).join('');

/** Fields visible in the API (never `secret`). */
const visible = (def) => Object.entries(def.fields).filter(([, s]) => !s.secret);

function resourceSchemas(def, name) {
  const properties = Object.fromEntries(visible(def).map(([n, s]) => [n, fieldSchema(s)]));
  const required = visible(def).filter(([, s]) => s.required).map(([n]) => n);
  return {
    [name]: {
      type: 'object',
      properties: { _id: { type: 'string' }, createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' }, ...properties },
    },
    [`${name}Input`]: { type: 'object', properties, ...(required.length && { required }) },
  };
}

const who = (roles) => (roles?.length ? `Roles: ${roles.join(', ')} (plus the superuser).` : 'Superuser only.');
const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } };

function resourcePaths(r) {
  const { key, def } = r;
  const name = pascal(key);
  const tag = def.label;
  const off = new Set(def.genericDisabled ?? []);
  const note = (action) => who(def.permissions?.[action]);
  const body = { required: true, content: { 'application/json': { schema: { $ref: `#/components/schemas/${name}Input` } } } };
  const one = { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { item: { $ref: `#/components/schemas/${name}` } } } } } };
  const filters = visible(def).filter(([, s]) => s.filter).map(([n, s]) => ({ name: n, in: 'query', schema: fieldSchema(s) }));
  const common = { tags: [tag], security: SECURITY };

  const collection = {
    get: {
      ...common, summary: `List ${def.label.toLowerCase()}`, description: note('read'),
      parameters: [
        { name: 'q', in: 'query', description: 'Search text', schema: { type: 'string' } },
        { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } },
        { name: 'sort', in: 'query', description: 'Field name, prefix with - for descending', schema: { type: 'string' } },
        ...filters,
      ],
      responses: {
        200: { description: 'A page of records', content: { 'application/json': { schema: { type: 'object', properties: {
          items: { type: 'array', items: { $ref: `#/components/schemas/${name}` } }, total: { type: 'integer' }, page: { type: 'integer' }, pages: { type: 'integer' } } } } } },
        401: ERR, 403: ERR,
      },
    },
  };
  if (!off.has('create')) {
    collection.post = { ...common, summary: `Create a ${def.label.replace(/s$/, '').toLowerCase()}`, description: note('create'), requestBody: body, responses: { 201: one, 400: ERR, 401: ERR, 403: ERR, 409: ERR } };
  }

  const item = { get: { ...common, summary: 'Get one record', description: note('read'), parameters: [idParam], responses: { 200: one, 401: ERR, 403: ERR, 404: ERR } } };
  if (!off.has('update')) item.patch = { ...common, summary: 'Update a record', description: note('update'), parameters: [idParam], requestBody: body, responses: { 200: one, 400: ERR, 401: ERR, 403: ERR, 404: ERR, 409: ERR } };
  if (!off.has('delete')) item.delete = { ...common, summary: def.softDelete ? `Retire a record (status becomes ${def.softDelete.value})` : 'Delete a record', description: note('delete'), parameters: [idParam], responses: { 200: one, 204: { description: 'Deleted' }, 401: ERR, 403: ERR, 404: ERR, 409: ERR } };

  const paths = {
    [`/r/${key}`]: collection,
    [`/r/${key}/{id}`]: item,
    [`/r/${key}/{id}/activity`]: { get: { ...common, summary: 'History of a record', description: note('read'), parameters: [idParam], responses: { 200: { description: 'Newest first' }, 401: ERR, 404: ERR } } },
    [`/r/${key}/export`]: { get: { ...common, summary: 'Export as CSV (same filters as the list)', description: note('read'), responses: { 200: { description: 'CSV file', content: { 'text/csv': { schema: { type: 'string' } } } }, 401: ERR, 403: ERR } } },
  };
  if (!off.has('create')) {
    paths[`/r/${key}/import`] = {
      post: {
        ...common, summary: 'Import from CSV (dry run by default)', description: `${note('create')} Send dryRun:false to write.`,
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['csv'], properties: { csv: { type: 'string' }, dryRun: { type: 'boolean', default: true } } } } } },
        responses: { 200: { description: 'Validation / import report' }, 400: ERR, 401: ERR, 403: ERR },
      },
    };
  }
  return { paths, schemas: resourceSchemas(def, name) };
}

const coreError = { 401: ERR };
const corePaths = {
  '/health': { get: { tags: ['System'], summary: 'Health check', responses: { 200: { description: 'OK' } } } },
  '/auth/login': { post: { tags: ['Auth'], summary: 'Sign in (rate limited)', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string' }, password: { type: 'string' } } } } } }, responses: { 200: { description: 'token and user' }, 401: ERR, 429: ERR } } },
  '/auth/me': { get: { tags: ['Auth'], summary: 'The signed-in user', security: SECURITY, responses: { 200: { description: 'user' }, ...coreError } } },
  '/auth/change-password': { post: { tags: ['Auth'], summary: 'Change own password', security: SECURITY, requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['currentPassword', 'newPassword'], properties: { currentPassword: { type: 'string' }, newPassword: { type: 'string', minLength: 8 } } } } } }, responses: { 204: { description: 'Changed' }, 400: ERR, 401: ERR } } },
  '/notifications': { get: { tags: ['Notifications'], summary: 'My notifications and unread count', security: SECURITY, responses: { 200: { description: 'items, unread' }, ...coreError } } },
  '/notifications/{id}/read': { post: { tags: ['Notifications'], summary: 'Mark one read', security: SECURITY, parameters: [idParam], responses: { 200: { description: 'item' }, 404: ERR, ...coreError } } },
  '/notifications/read-all': { post: { tags: ['Notifications'], summary: 'Mark all read', security: SECURITY, responses: { 200: { description: 'updated count' }, ...coreError } } },
  '/meta': { get: { tags: ['System'], summary: 'Resources and permissions for the signed-in role', security: SECURITY, responses: { 200: { description: 'meta' }, ...coreError } } },
  '/docs': { get: { tags: ['System'], summary: 'This document', security: SECURITY, responses: { 200: { description: 'OpenAPI 3.0 JSON' } } } },
};

/**
 * @param {{ all: () => Array<{ key: string, def: object }> }} registry
 * @param {{ appName: string, roles: string[] }} config
 */
export function buildOpenApi(registry, config) {
  const paths = { ...corePaths };
  const schemas = {
    Error: { type: 'object', properties: { error: { type: 'string' }, fields: { type: 'object', additionalProperties: { type: 'string' } } } },
  };
  for (const r of registry.all()) {
    const built = resourcePaths(r);
    Object.assign(paths, built.paths);
    Object.assign(schemas, built.schemas);
  }
  return {
    openapi: '3.0.3',
    info: {
      title: `${config.appName} API`,
      version: '1.0.0',
      description: `Roles, highest privilege first: ${config.roles.join(', ')}. The first role is the superuser and may do everything.`,
    },
    servers: [{ url: '/api' }],
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } }, schemas },
    paths,
  };
}
