import axios, {
  AxiosError,
} from 'axios';
import { clearAuthStorage } from '@/shared/lib/auth';

const API_BASE_URL = '/backend-api';
const API_TIMEOUT_MS = 10_000;

export const AUTH_UNAUTHORIZED_EVENT = 'auth:unauthorized';

type UnauthorizedHandler = (() => void) | null;

type ApiErrorPayload = {
  message?: string | string[];
  error?: string;
  statusCode?: number;
};

let unauthorizedHandler: UnauthorizedHandler = null;
let isHandlingUnauthorized = false;

// Permet au futur AuthContext de brancher un logout centralisé.
export function registerUnauthorizedHandler(
  handler: UnauthorizedHandler,
): void {
  unauthorizedHandler = handler;
}

function handleUnauthorized(): void {
  if (typeof window === 'undefined' || isHandlingUnauthorized) {
    return;
  }

  isHandlingUnauthorized = true;
  clearAuthStorage();

  if (unauthorizedHandler) {
    unauthorizedHandler();
  }

  window.dispatchEvent(new CustomEvent(AUTH_UNAUTHORIZED_EVENT));

  if (!unauthorizedHandler && !window.location.pathname.startsWith('/login')) {
    const nextPath = `${window.location.pathname}${window.location.search}`;
    window.location.href = `/login?next=${encodeURIComponent(nextPath)}`;
  }

  window.setTimeout(() => {
    isHandlingUnauthorized = false;
  }, 0);
}

export function getApiErrorMessage(error: unknown): string {
  const axiosError = error as AxiosError<ApiErrorPayload>;
  const message = axiosError.response?.data?.message;
  const status = axiosError.response?.status;

  const isTimeout =
    axiosError.code === 'ECONNABORTED' ||
    axiosError.message.toLowerCase().includes('timeout');

  if (isTimeout) {
    return 'The request is taking longer than expected. Check GitLab then retry in a few seconds.';
  }

  if (Array.isArray(message)) {
    return message.join(', ');
  }

  if (typeof message === 'string' && message.trim()) {
    return message;
  }

  if (axiosError.response?.data?.error) {
    return axiosError.response.data.error;
  }

  if (status === 401) {
    return 'Authentification invalide. Reconnectez-vous.';
  }

  if (status === 403) {
    return 'Access denied. Check your permissions.';
  }

  if (status === 404) {
    return 'Ressource introuvable.';
  }

  if (status === 409) {
    return 'Conflict detected. Retry after refreshing.';
  }

  if (status === 422) {
    return 'GitLab rejected the request (protected branch, invalid payload, or file conflict).';
  }

  if (axiosError.message) {
    return axiosError.message;
  }

  return 'Une erreur inattendue est survenue.';
}

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT_MS,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorPayload>) => {
    if (error.response?.status === 401) {
      handleUnauthorized();
    }

    return Promise.reject(error);
  },
);

export default api;
