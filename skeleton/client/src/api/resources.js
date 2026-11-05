/** Generic resource API: /api/r/:key */
export const listRecords = (api, key, params) => api.get(`/r/${key}`, { params }).then((r) => r.data);
export const getRecord = (api, key, id) => api.get(`/r/${key}/${id}`).then((r) => r.data.item);
export const createRecord = (api, key, body) => api.post(`/r/${key}`, body).then((r) => r.data.item);
export const updateRecord = (api, key, id, body) => api.patch(`/r/${key}/${id}`, body).then((r) => r.data.item);
export const deleteRecord = (api, key, id) => api.delete(`/r/${key}/${id}`).then((r) => r.data?.item ?? null);
export const recordActivity = (api, key, id) => api.get(`/r/${key}/${id}/activity`).then((r) => r.data.items);
