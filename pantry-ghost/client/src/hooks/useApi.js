import axios from 'axios';
import { useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { trackRequest, finishRequest } from '../lib/slowServer';

/**
 * Axios instance that targets VITE_API_URL (or /api), attaches the Bearer token,
 * logs out + redirects on 401 ("Session expired"), toasts on 403, and tells the user when the (free-plan)
 * server is slow to wake up (lib/slowServer.js).
 * The only way components talk to the server (steering: client-conventions).
 */
export function useApi() {
  const { token, logout } = useAuth();
  const navigate = useNavigate();
  const navRef = useRef(navigate);
  navRef.current = navigate;

  return useMemo(() => {
    const instance = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });

    instance.interceptors.request.use((config) => {
      if (token) config.headers.Authorization = `Bearer ${token}`;
      return trackRequest(config); // shows a 'server is waking up' notice if this takes more than a few seconds
    });

    instance.interceptors.response.use(
      (res) => { finishRequest(res.config, true); return res; },
      async (error) => {
        finishRequest(error.config, false);
        const status = error.response?.status;
        // Blob responses (PDF/audio) carry JSON errors as Blobs — decode so callers see the message.
        if (error.response?.data instanceof Blob && error.response.data.type?.includes('json')) {
          try { error.response.data = JSON.parse(await error.response.data.text()); } catch { /* keep blob */ }
        }
        if (status === 401 && token) {
          logout();
          toast.error('Session expired — please sign in again');
          navRef.current('/login', { replace: true });
        } else if (status === 403) {
          toast.error("You don't have permission to do that");
        }
        return Promise.reject(error);
      }
    );
    return instance;
  }, [token, logout]);
}
