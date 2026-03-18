import axios from "axios";

/**
 * Pre-configured Axios instance for API calls.
 *
 * - Base URL points to the Flask backend (proxied in dev via Vite)
 * - Credentials included for session cookie auth
 * - Response interceptor handles 401 (redirect to login)
 */
const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

// Response interceptor — handle auth errors globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Redirect to login if not authenticated
      const currentPath = window.location.pathname;
      if (currentPath !== "/login" && currentPath !== "/register") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;
