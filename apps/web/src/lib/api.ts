import axios, {
  AxiosError,
  InternalAxiosRequestConfig,
} from 'axios';
import { clearAuthStorage, getToken } from '@/lib/auth';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;
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

if (!API_BASE_URL && process.env.NODE_ENV !== 'production') {
  console.warn(
    'NEXT_PUBLIC_API_URL est absente. Configure-la dans .env.local avant de lancer l application.',
  );
}

// Permet au futur AuthContext de brancher un logout centralisé.
export function registerUnauthorizedHandler(
  handler: UnauthorizedHandler,
): void {
  unauthorizedHandler = handler;
}

function attachAuthorizationHeader(
  config: InternalAxiosRequestConfig,
): InternalAxiosRequestConfig {
  const token = getToken();

  if (!token) {
    return config;
  }

  config.headers.Authorization = `Bearer ${token}`;
  return config;
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

  if (!unauthorizedHandler && window.location.pathname !== '/auth/login/developer') {
    const nextPath = `${window.location.pathname}${window.location.search}`;
    window.location.href = `/auth/login/developer?next=${encodeURIComponent(nextPath)}`;
  }

  window.setTimeout(() => {
    isHandlingUnauthorized = false;
  }, 0);
}

export function getApiErrorMessage(error: unknown): string {
  const axiosError = error as AxiosError<ApiErrorPayload>;
  const message = axiosError.response?.data?.message;

  if (Array.isArray(message)) {
    return message.join(', ');
  }

  if (typeof message === 'string' && message.trim()) {
    return message;
  }

  if (axiosError.response?.data?.error) {
    return axiosError.response.data.error;
  }

  if (axiosError.message) {
    return axiosError.message;
  }

  return 'Une erreur inattendue est survenue.';
}

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT_MS,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

api.interceptors.request.use(attachAuthorizationHeader);

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
