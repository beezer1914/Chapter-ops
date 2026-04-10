import { create } from "zustand";
import type { BrandColors, Typography, ResolvedBranding, OrganizationConfig, ChapterConfig, ColorScheme } from "@/types";

// Match index.css :root defaults exactly — no drift
const DEFAULT_COLORS: BrandColors = {
  primary:   { light: "#3b7ddb", main: "#0f52ba", dark: "#0a3d8a" },
  secondary: { light: "#0d1630", main: "#0f1a3a", dark: "#132248" },
  accent:    { light: "rgba(251,191,36,0.1)", main: "#fbbf24", dark: "#d97706" },
};

const DEFAULT_TYPOGRAPHY: Typography = {
  heading_font: "Playfair Display",
  body_font: "Instrument Sans",
  font_source: "google",
};

// Editorial light surface palette — cream backgrounds, ink text, always-dark sidebar.
const LIGHT_SURFACE = {
  "--color-bg-deep":         "#faf9f7",
  "--color-bg-primary":      "#f4f3f1",
  "--color-bg-card":         "rgba(255, 255, 255, 0.95)",
  "--color-bg-card-solid":   "#ffffff",
  "--color-bg-card-hover":   "#f0efed",
  "--color-bg-sidebar":      "#0a0a0a",
  "--color-bg-surface":      "#eceae6",
  "--color-bg-input":        "#ffffff",
  "--color-text-primary":    "#1a1a1a",
  "--color-text-secondary":  "#4a4a4a",
  "--color-text-muted":      "#6b6b6b",
  "--color-text-heading":    "#0a0a0a",
  "--color-border-subtle":   "rgba(0, 0, 0, 0.07)",
} as const;

// Dark surface palette — matches index.css :root exactly so we can restore it.
const DARK_SURFACE = {
  "--color-bg-deep":         "#060b18",
  "--color-bg-primary":      "#0a1128",
  "--color-bg-card":         "rgba(12, 20, 45, 0.6)",
  "--color-bg-card-solid":   "#0f1a3a",
  "--color-bg-card-hover":   "#132248",
  "--color-bg-sidebar":      "rgba(8, 14, 32, 0.75)",
  "--color-bg-surface":      "#0d1630",
  "--color-bg-input":        "#0c1530",
  "--color-text-primary":    "#f0f4fa",
  "--color-text-secondary":  "#94a3c0",
  "--color-text-muted":      "#5c6d8a",
  "--color-text-heading":    "#e4ecf7",
  "--color-border-subtle":   "rgba(255, 255, 255, 0.06)",
} as const;

interface BrandingState {
  branding: ResolvedBranding;
  colorScheme: ColorScheme;
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
  colorScheme: "light",
  isInitialized: false,

  initializeBranding: (orgConfig, chapterConfig) => {
    const orgBranding = orgConfig?.branding || {};
    const chapterBranding = chapterConfig?.branding || {};
    const chapterOverrideEnabled = chapterBranding.enabled === true;

    // Resolve color scheme — org-level only (chapters inherit)
    const colorScheme: ColorScheme = orgBranding.color_scheme ?? "light";

    // If no branding has ever been saved, leave index.css defaults untouched
    // but still apply the color scheme in case it was set.
    if (!orgBranding.colors && !chapterBranding.colors) {
      set({ colorScheme, isInitialized: true });
      applySurfacePalette(colorScheme);
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

    set({ branding: resolved, colorScheme, isInitialized: true });
    get().applyBranding();
  },

  applyBranding: () => {
    const { branding, colorScheme } = get();
    const root = document.documentElement;

    // ── Surface palette (dark / light) ────────────────────────────────────
    applySurfacePalette(colorScheme);

    // ── Primary brand colors ──────────────────────────────────────────────
    root.style.setProperty("--color-primary-light", branding.colors.primary.light);
    root.style.setProperty("--color-primary-main",  branding.colors.primary.main);
    root.style.setProperty("--color-primary-dark",  branding.colors.primary.dark);

    // Derive glow and border vars from primary-main so they always stay in sync
    // with whatever color the org chose. Border opacity is higher in light mode
    // so the subtle brand tint remains visible against white backgrounds.
    const rgb = hexToRgb(branding.colors.primary.main);
    if (rgb) {
      const { r, g, b } = rgb;
      const glowAlpha   = colorScheme === "light" ? 0.10 : 0.14;
      const borderAlpha = colorScheme === "light" ? 0.18 : 0.10;
      const brandAlpha  = colorScheme === "light" ? 0.30 : 0.22;
      root.style.setProperty("--color-primary-glow",  `rgba(${r}, ${g}, ${b}, ${glowAlpha})`);
      root.style.setProperty("--color-border",        `rgba(${r}, ${g}, ${b}, ${borderAlpha})`);
      root.style.setProperty("--color-border-brand",  `rgba(${r}, ${g}, ${b}, ${brandAlpha})`);
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

/** Swap the CSS surface variables based on the chosen color scheme. */
function applySurfacePalette(scheme: ColorScheme) {
  const root = document.documentElement;
  const palette = scheme === "light" ? LIGHT_SURFACE : DARK_SURFACE;
  for (const [key, value] of Object.entries(palette)) {
    root.style.setProperty(key, value);
  }
  // Toggle a data attribute so CSS can key off it if needed (e.g. noise overlay)
  root.setAttribute("data-color-scheme", scheme);
}

function loadGoogleFont(fontName: string) {
  const fontId = `google-font-${fontName.replace(/\s+/g, "-")}`;
  if (document.getElementById(fontId)) return;

  const link = document.createElement("link");
  link.id = fontId;
  link.rel = "stylesheet";
  const isPlayfair = fontName.includes("Playfair");
  const weights = isPlayfair ? "ital,wght@0,400;0,700;0,900;1,400;1,700" : "wght@400;500;600;700";
  link.href = `https://fonts.googleapis.com/css2?family=${fontName.replace(/\s+/g, "+")}:${weights}&display=swap`;
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
