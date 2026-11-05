export const publicMeta = (api) => api.get('/meta/public').then((r) => r.data);
export const meta = (api) => api.get('/meta').then((r) => r.data);
