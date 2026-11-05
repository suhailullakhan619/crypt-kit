/** Pantry Ghost workflow API. Every function takes the axios instance from useApi() first. */

/** POST /intake/parse → Intake Draft (never saves). */
export const parseIntake = (api, text) => api.post('/intake/parse', { text }).then((r) => r.data.draft);

/** POST /intake → created lots. */
export const saveIntake = (api, lots) => api.post('/intake', { lots }).then((r) => r.data.items);

/** POST /distributions/plan → { household, lines, shortfalls } */
export const planDistribution = (api, body) => api.post('/distributions/plan', body).then((r) => r.data);

/** POST /distributions → the Distribution (409 carries `short`). */
export const commitDistribution = (api, body) => api.post('/distributions', body).then((r) => r.data.distribution);

/** GET /reports/impact/preview?month=YYYY-MM → aggregates */
export const impactPreview = (api, month) => api.get('/reports/impact/preview', { params: { month } }).then((r) => r.data.impact);

/** POST /reports/impact → Report record */
export const generateImpact = (api, month) => api.post('/reports/impact', { month }).then((r) => r.data.report);
