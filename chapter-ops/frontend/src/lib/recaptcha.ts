/**
 * Google reCAPTCHA v3 token acquisition.
 *
 * Call `executeRecaptcha("login" | "register")` right before submitting the
 * form. The returned token is sent to the backend for verification.
 *
 * When `VITE_RECAPTCHA_SITE_KEY` is unset (local dev) the function resolves
 * to `null` — the backend is also configured to fail open in that case.
 */

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, opts: { action: string }) => Promise<string>;
    };
  }
}

const SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined;

let loaderPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (!SITE_KEY) return Promise.reject(new Error("site key not configured"));
  if (loaderPromise) return loaderPromise;
  loaderPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-recaptcha="v3"]'
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("failed to load reCAPTCHA")));
      if (window.grecaptcha) resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(SITE_KEY)}`;
    s.async = true;
    s.defer = true;
    s.dataset.recaptcha = "v3";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("failed to load reCAPTCHA"));
    document.head.appendChild(s);
  });
  return loaderPromise;
}

export async function executeRecaptcha(action: string): Promise<string | null> {
  if (!SITE_KEY) return null;
  try {
    await loadScript();
    const grecaptcha = window.grecaptcha;
    if (!grecaptcha) return null;
    await new Promise<void>((resolve) => grecaptcha.ready(resolve));
    return await grecaptcha.execute(SITE_KEY, { action });
  } catch {
    // Network failure or blocked script — return null so the caller still
    // submits. The backend will reject if it has a secret configured and
    // no token arrives, so this is a no-op in production with correct setup.
    return null;
  }
}

/**
 * Preload the reCAPTCHA script as soon as a login/register page mounts so
 * there's no visible delay when the user hits submit.
 */
export function preloadRecaptcha(): void {
  if (!SITE_KEY) return;
  loadScript().catch(() => {
    /* swallow — executeRecaptcha handles the retry */
  });
}
