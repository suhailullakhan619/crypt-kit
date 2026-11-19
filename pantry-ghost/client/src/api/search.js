/** Global search: GET /api/search?q= → [{ key, label, icon, items: [{ _id, title, subtitle }] }] */
export const searchAll = (api, q) => api.get('/search', { params: { q } }).then((r) => r.data.results ?? []);
