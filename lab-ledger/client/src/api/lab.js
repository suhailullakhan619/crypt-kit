/** Lab Ledger workflow API (server/src/routes/app/*.js). Every function takes the axios instance first. */

export const requestCheckout = (api, body) => api.post('/checkouts', body).then((r) => r.data.checkout);
export const approveCheckout = (api, id) => api.post(`/checkouts/${id}/approve`).then((r) => r.data.checkout);
export const rejectCheckout = (api, id, reason) => api.post(`/checkouts/${id}/reject`, { reason }).then((r) => r.data.checkout);
export const cancelCheckout = (api, id) => api.post(`/checkouts/${id}/cancel`).then((r) => r.data.checkout);
export const returnCheckout = (api, id, body) => api.post(`/checkouts/${id}/return`, body).then((r) => r.data.checkout);
export const myCheckouts = (api, params) => api.get('/checkouts/mine', { params }).then((r) => r.data);

/** { item, activeCheckout, pendingRequests } for an asset tag (404 → "No equipment haunts this tag"). */
export const equipmentByTag = (api, tag) => api.get(`/equipment/by-tag/${encodeURIComponent(tag)}`).then((r) => r.data);

/** Downloads the QR label sheet PDF for up to 60 equipment ids. */
export async function printLabels(api, ids) {
  const res = await api.post('/equipment/labels', { ids }, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `equipment-labels-${ids.length}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return ids.length;
}
