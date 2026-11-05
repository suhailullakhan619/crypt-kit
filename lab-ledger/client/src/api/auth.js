/** Auth API. Every function takes the axios instance from useApi() first. */
export const login = (api, email, password) => api.post('/auth/login', { email, password }).then((r) => r.data);
export const demoLogin = (api, email) => api.post('/auth/demo-login', { email }).then((r) => r.data);
export const me = (api) => api.get('/auth/me').then((r) => r.data.user);
