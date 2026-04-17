import axios from "axios";

/**
 * Pre-configured Axios instance for API calls.
 *
 * - Base URL points to the Flask backend (proxied in dev via Vite)
 * - Credentials included for session cookie auth
 * - Request interceptor injects X-CSRFToken on all state-changing requests
 * - Response interceptor handles 401 (redirect to login)
 */

let csrfToken: string | null = null;

export function setCsrfToken(token: string) {
  csrfToken = token;
}

export async function refreshCsrfToken(): Promise<void> {
  const res = await api.get<{ csrf_token: string }>("/auth/csrf");
  setCsrfToken(res.data.csrf_token);
}

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor — attach CSRF token to all state-changing requests
api.interceptors.request.use((config) => {
  const method = (config.method || "get").toLowerCase();
  if (csrfToken && !["get", "head", "options"].includes(method)) {
    config.headers["X-CSRFToken"] = csrfToken;
  }
  return config;
});

// Response interceptor — handle auth errors globally and auto-recover stale CSRF tokens
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const currentPath = window.location.pathname;
      const publicPaths = ["/", "/login", "/register", "/forgot-password", "/reset-password"];
      const isPublic =
        publicPaths.includes(currentPath) ||
        currentPath.startsWith("/e/") ||
        currentPath.startsWith("/legal/");
      if (!isPublic) {
        window.location.href = "/login";
      }
    }

    // Auto-refresh CSRF token and retry once when the session token is missing.
    // This happens after Flask restarts (new SECRET_KEY) or after logout clears the session.
    if (
      error.response?.status === 400 &&
      !error.config._csrfRetry
    ) {
      const body = error.response?.data;
      const isCsrfError =
        typeof body === "string"
          ? body.toLowerCase().includes("csrf")
          : typeof body?.message === "string" && body.message.toLowerCase().includes("csrf");

      if (isCsrfError) {
        error.config._csrfRetry = true;
        try {
          await refreshCsrfToken();
          const method = (error.config.method || "get").toLowerCase();
          if (!["get", "head", "options"].includes(method)) {
            error.config.headers["X-CSRFToken"] = csrfToken;
          }
          return api(error.config);
        } catch {
          // Refresh failed — fall through and reject with original error
        }
      }
    }

    return Promise.reject(error);
  }
);

export default api;
