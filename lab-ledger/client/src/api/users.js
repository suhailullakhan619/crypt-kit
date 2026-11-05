export const listUsers = (api, params) => api.get('/users', { params }).then((r) => r.data);
export const createUser = (api, body) => api.post('/users', body).then((r) => r.data.user);
export const updateUser = (api, id, body) => api.patch(`/users/${id}`, body).then((r) => r.data.user);
export const searchUsers = (api, q) => api.get('/users/search', { params: { q } }).then((r) => r.data.items);
