/** Auth API. Every function takes the axios instance from useApi() first. */
export const login = (api, email, password) => api.post('/auth/login', { email, password }).then((r) => r.data);
export const demoLogin = (api, email) => api.post('/auth/demo-login', { email }).then((r) => r.data);
export const me = (api) => api.get('/auth/me').then((r) => r.data.user);
export const signup = (api, body) => api.post('/auth/signup', body).then((r) => r.data);
export const forgotPassword = (api, email) => api.post('/auth/forgot-password', { email }).then((r) => r.data);
export const resetPassword = (api, token, password) => api.post('/auth/reset-password', { token, password }).then((r) => r.data);
