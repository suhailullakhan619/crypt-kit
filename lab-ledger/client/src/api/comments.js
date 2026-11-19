/** Record comments: /api/r/:key/:id/comments */
export const listComments = (api, key, id) => api.get(`/r/${key}/${id}/comments`).then((r) => r.data.items);
export const addComment = (api, key, id, body) => api.post(`/r/${key}/${id}/comments`, { body }).then((r) => r.data.item ?? r.data);
export const deleteComment = (api, key, id, commentId) => api.delete(`/r/${key}/${id}/comments/${commentId}`).then(() => null);
