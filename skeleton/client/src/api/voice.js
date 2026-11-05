export const ask = (api, text) => api.post('/voice/ask', { text }).then((r) => r.data);
export const examples = (api) => api.get('/voice/examples').then((r) => r.data);

/** Sends recorded audio; returns the spoken answer as a Blob plus the decoded headers. */
export async function query(api, blob) {
  const form = new FormData();
  form.append('audio', blob, blob.type.includes('ogg') ? 'question.ogg' : 'question.webm');
  const res = await api.post('/voice/query', form, { responseType: 'blob' });
  const header = (h) => decodeURIComponent(res.headers[h] ?? '');
  return { audio: res.data, transcript: header('x-transcript'), answer: header('x-answer'), intent: res.headers['x-intent'] ?? 'UNKNOWN' };
}
