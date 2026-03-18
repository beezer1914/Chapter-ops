import { create } from "zustand";
import type { BrandColors, Typography, ResolvedBranding, OrganizationConfig, ChapterConfig } from "@/types";

// Default ChapterOps branding
const DEFAULT_COLORS: BrandColors = {
  primary: { light: "#eff6ff", main: "#3b82f6", dark: "#1e40af" },
  secondary: { light: "#f3f4f6", main: "#6b7280", dark: "#374151" },
  accent: { light: "#fef3c7", main: "#f59e0b", dark: "#d97706" },
};

const DEFAULT_TYPOGRAPHY: Typography = {
  heading_font: "Inter",
  body_font: "Inter",
  font_source: "system",
};

interface BrandingState {
  branding: ResolvedBranding;
  isInitialized: boolean;

  initializeBranding: (orgConfig: OrganizationConfig | undefined, chapterConfig: ChapterConfig | undefined) => void;
  applyBranding: () => void;
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

    // Resolve branding with inheritance logic:
    // If chapter override is enabled, use chapter branding, otherwise use org branding
    const resolved: ResolvedBranding = {
      // Logo comes from Organization model, not config
      logo_url: null, // Will be set by org.logo_url or chapter.logo_url separately

      // Favicon from config.branding
      favicon_url: chapterOverrideEnabled && chapterBranding.favicon_url
        ? chapterBranding.favicon_url
        : orgBranding.favicon_url || null,

      // Colors
      colors: chapterOverrideEnabled && chapterBranding.colors
        ? chapterBranding.colors
        : orgBranding.colors || DEFAULT_COLORS,

      // Typography
      typography: chapterOverrideEnabled && chapterBranding.typography
        ? chapterBranding.typography
        : orgBranding.typography || DEFAULT_TYPOGRAPHY,

      // Custom CSS (future feature, not implemented yet)
      custom_css: null,
    };

    set({ branding: resolved, isInitialized: true });
    get().applyBranding();
  },

  applyBranding: () => {
    const { branding } = get();
    const root = document.documentElement;

    // Inject CSS custom properties for colors
    root.style.setProperty("--color-primary-light", branding.colors.primary.light);
    root.style.setProperty("--color-primary-main", branding.colors.primary.main);
    root.style.setProperty("--color-primary-dark", branding.colors.primary.dark);

    root.style.setProperty("--color-secondary-light", branding.colors.secondary.light);
    root.style.setProperty("--color-secondary-main", branding.colors.secondary.main);
    root.style.setProperty("--color-secondary-dark", branding.colors.secondary.dark);

    root.style.setProperty("--color-accent-light", branding.colors.accent.light);
    root.style.setProperty("--color-accent-main", branding.colors.accent.main);
    root.style.setProperty("--color-accent-dark", branding.colors.accent.dark);

    // Apply typography
    root.style.setProperty("--font-heading", branding.typography.heading_font);
    root.style.setProperty("--font-body", branding.typography.body_font);

    // Load Google Fonts if needed
    if (branding.typography.font_source === "google") {
      loadGoogleFont(branding.typography.heading_font);
      if (branding.typography.body_font !== branding.typography.heading_font) {
        loadGoogleFont(branding.typography.body_font);
      }
    }

    // Update favicon
    if (branding.favicon_url) {
      updateFavicon(branding.favicon_url);
    }
  },
}));

// Helper function to load Google Fonts dynamically
function loadGoogleFont(fontName: string) {
  const fontId = `google-font-${fontName.replace(/\s+/g, "-")}`;

  // Check if already loaded
  if (document.getElementById(fontId)) {
    return;
  }

  const link = document.createElement("link");
  link.id = fontId;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${fontName.replace(/\s+/g, "+")}:wght@400;500;600;700&display=swap`;
  document.head.appendChild(link);
}

// Helper function to update favicon
function updateFavicon(faviconUrl: string) {
  let link = document.querySelector("link[rel='icon']") as HTMLLinkElement;

  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }

  link.href = faviconUrl;
}
