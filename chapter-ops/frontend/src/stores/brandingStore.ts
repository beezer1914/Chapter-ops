import { create } from "zustand";
import type { BrandColors, Typography, ResolvedBranding, OrganizationConfig, ChapterConfig } from "@/types";

// Match index.css :root defaults exactly — no drift
const DEFAULT_COLORS: BrandColors = {
  primary:   { light: "#3b7ddb", main: "#0f52ba", dark: "#0a3d8a" },
  secondary: { light: "#0d1630", main: "#0f1a3a", dark: "#132248" },
  accent:    { light: "rgba(251,191,36,0.1)", main: "#fbbf24", dark: "#d97706" },
};

const DEFAULT_TYPOGRAPHY: Typography = {
  heading_font: "Cormorant Garamond",
  body_font: "Outfit",
  font_source: "google",
};

interface BrandingState {
  branding: ResolvedBranding;
  isInitialized: boolean;

  initializeBranding: (orgConfig: OrganizationConfig | undefined, chapterConfig: ChapterConfig | undefined) => void;
  applyBranding: () => void;
}

// Convert a hex color to its RGB components so we can derive rgba() values.
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!result || !result[1] || !result[2] || !result[3]) return null;
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

export const useBrandingStore = create<BrandingState>((set, get) => ({
  branding: {
    logo_url: null,
    favicon_url: null,
    colors: DEFAULT_COLORS,
    typography: DEFAULT_TYPOGRAPHY,
    custom_css: null,
  },
  isInitialized: false,

  initializeBranding: (orgConfig, chapterConfig) => {
    const orgBranding = orgConfig?.branding || {};
    const chapterBranding = chapterConfig?.branding || {};
    const chapterOverrideEnabled = chapterBranding.enabled === true;

    // If no branding has ever been saved, leave index.css defaults untouched.
    // Overriding with DEFAULT_COLORS would cause a subtle color drift between
    // what the CSS file defines and what JS injects.
    if (!orgBranding.colors && !chapterBranding.colors) {
      set({ isInitialized: true });
      return;
    }

    const resolved: ResolvedBranding = {
      logo_url: null,

      favicon_url: chapterOverrideEnabled && chapterBranding.favicon_url
        ? chapterBranding.favicon_url
        : orgBranding.favicon_url || null,

      colors: chapterOverrideEnabled && chapterBranding.colors
        ? chapterBranding.colors
        : orgBranding.colors || DEFAULT_COLORS,

      typography: chapterOverrideEnabled && chapterBranding.typography
        ? chapterBranding.typography
        : orgBranding.typography || DEFAULT_TYPOGRAPHY,

      custom_css: null,
    };

    set({ branding: resolved, isInitialized: true });
    get().applyBranding();
  },

  applyBranding: () => {
    const { branding } = get();
    const root = document.documentElement;

    // ── Primary brand colors ──────────────────────────────────────────────
    root.style.setProperty("--color-primary-light", branding.colors.primary.light);
    root.style.setProperty("--color-primary-main",  branding.colors.primary.main);
    root.style.setProperty("--color-primary-dark",  branding.colors.primary.dark);

    // Derive glow and border vars from primary-main so they always stay in sync
    // with whatever color the org chose. Previously these were hardcoded to
    // Royal Blue in index.css and never updated when branding changed.
    const rgb = hexToRgb(branding.colors.primary.main);
    if (rgb) {
      const { r, g, b } = rgb;
      root.style.setProperty("--color-primary-glow",  `rgba(${r}, ${g}, ${b}, 0.14)`);
      root.style.setProperty("--color-border",        `rgba(${r}, ${g}, ${b}, 0.10)`);
      root.style.setProperty("--color-border-brand",  `rgba(${r}, ${g}, ${b}, 0.22)`);
    }

    // ── Secondary / accent ────────────────────────────────────────────────
    root.style.setProperty("--color-secondary-light", branding.colors.secondary.light);
    root.style.setProperty("--color-secondary-main",  branding.colors.secondary.main);
    root.style.setProperty("--color-secondary-dark",  branding.colors.secondary.dark);

    root.style.setProperty("--color-accent-light", branding.colors.accent.light);
    root.style.setProperty("--color-accent-main",  branding.colors.accent.main);
    root.style.setProperty("--color-accent-dark",  branding.colors.accent.dark);

    // ── Typography ────────────────────────────────────────────────────────
    root.style.setProperty("--font-heading", branding.typography.heading_font);
    root.style.setProperty("--font-body",    branding.typography.body_font);

    if (branding.typography.font_source === "google") {
      loadGoogleFont(branding.typography.heading_font);
      if (branding.typography.body_font !== branding.typography.heading_font) {
        loadGoogleFont(branding.typography.body_font);
      }
    }

    // ── Favicon ───────────────────────────────────────────────────────────
    if (branding.favicon_url) {
      updateFavicon(branding.favicon_url);
    }
  },
}));

function loadGoogleFont(fontName: string) {
  const fontId = `google-font-${fontName.replace(/\s+/g, "-")}`;
  if (document.getElementById(fontId)) return;

  const link = document.createElement("link");
  link.id = fontId;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${fontName.replace(/\s+/g, "+")}:wght@400;500;600;700&display=swap`;
  document.head.appendChild(link);
}

function updateFavicon(faviconUrl: string) {
  let link = document.querySelector("link[rel='icon']") as HTMLLinkElement;
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = faviconUrl;
}
