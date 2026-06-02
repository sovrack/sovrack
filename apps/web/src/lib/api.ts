import axios, {
  AxiosError,
} from 'axios';
import { clearAuthStorage } from '@/lib/auth';

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
    return 'La requête prend plus de temps que prévu. Vérifiez GitLab puis réessayez dans quelques secondes.';
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
    return 'Accès refusé. Vérifiez vos permissions.';
  }

  if (status === 404) {
    return 'Ressource introuvable.';
  }

  if (status === 409) {
    return 'Conflit détecté. Réessayez après actualisation.';
  }

  if (status === 422) {
    return 'GitLab a rejeté la requête (branche protégée, payload invalide ou conflit de fichier).';
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
