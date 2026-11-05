export const listReports = (api, params) => api.get('/reports', { params }).then((r) => r.data);
export const generateReport = (api, body) => api.post('/reports', body).then((r) => r.data.report);

/** Downloads a report PDF through the authenticated axios instance and saves it. */
export async function downloadReport(api, report) {
  const res = await api.get(`/reports/${report._id}/download`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${report.title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'report'}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
