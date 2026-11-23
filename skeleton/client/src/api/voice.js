/** `tzOffset` lets "tomorrow at 5pm" and "today" mean the user's own day, not the server's. */
export const ask = (api, text) => api.post('/voice/ask', { text, tzOffset: new Date().getTimezoneOffset() }).then((r) => r.data);
export const examples = (api) => api.get('/voice/examples').then((r) => r.data);

