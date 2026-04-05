import type { BrandColors } from "@/types";

export interface BrandingPreset {
  id: string;
  name: string;
  colors: BrandColors;
  description?: string;
}

/**
 * Starter palettes optimized for the dark luxury theme.
 *
 * Each `primary.light` is a BRIGHT, SATURATED variant of the org's color —
 * not a pale tint. It's used as accent text on dark backgrounds (sidebar nav
 * active item, heading accents, badge text) so it must be readable on navy.
 *
 * `secondary` and `accent` stay consistent dark-surface values across all
 * presets since those tokens remap to the platform's surface palette on
 * the dark theme anyway.
 */
export const BRANDING_PRESETS: BrandingPreset[] = [
  {
    id: "royal-blue-gold",
    name: "Royal Blue & Gold",
    description: "Classic collegiate — ΦΒΣ",
    colors: {
      primary: { light: "#6BA3E8", main: "#0047AB", dark: "#002F6C" },
      secondary: { light: "#0d1630", main: "#0f1a3a", dark: "#132248" },
      accent:    { light: "rgba(212,175,55,0.12)", main: "#D4AF37", dark: "#9E8A00" },
    },
  },
  {
    id: "crimson-cream",
    name: "Crimson & Cream",
    description: "Bold and warm — ΔΣΘ / ΑΚΑ",
    colors: {
      primary: { light: "#F07080", main: "#DC143C", dark: "#8B0000" },
      secondary: { light: "#0d1630", main: "#0f1a3a", dark: "#132248" },
      accent:    { light: "rgba(245,222,179,0.08)", main: "#F5DEB3", dark: "#DEB887" },
    },
  },
  {
    id: "old-gold-black",
    name: "Old Gold & Black",
    description: "Timeless and refined — ΑΦΑ",
    colors: {
      primary: { light: "#E8C94A", main: "#CFB53B", dark: "#9E8400" },
      secondary: { light: "#0d1630", main: "#0f1a3a", dark: "#132248" },
      accent:    { light: "rgba(207,181,59,0.1)", main: "#CFB53B", dark: "#9E8400" },
    },
  },
  {
    id: "purple-gold",
    name: "Purple & Gold",
    description: "Regal and commanding — ΩΨΦ",
    colors: {
      primary: { light: "#B06ED6", main: "#6A0DAD", dark: "#4B0082" },
      secondary: { light: "#0d1630", main: "#0f1a3a", dark: "#132248" },
      accent:    { light: "rgba(212,175,55,0.12)", main: "#D4AF37", dark: "#9E8A00" },
    },
  },
  {
    id: "forest-silver",
    name: "Forest & Silver",
    description: "Natural and distinguished",
    colors: {
      primary: { light: "#5DB562", main: "#2E7D32", dark: "#1B5E20" },
      secondary: { light: "#0d1630", main: "#0f1a3a", dark: "#132248" },
      accent:    { light: "rgba(176,176,192,0.1)", main: "#A0A0B8", dark: "#5C5C70" },
    },
  },
  {
    id: "maroon-white",
    name: "Maroon & White",
    description: "Strong and classic — ΚΑΨ",
    colors: {
      primary: { light: "#C44A5A", main: "#800000", dark: "#4A0000" },
      secondary: { light: "#0d1630", main: "#0f1a3a", dark: "#132248" },
      accent:    { light: "rgba(220,220,220,0.06)", main: "#D0D0D0", dark: "#A0A0A0" },
    },
  },
];

export function getPresetById(id: string): BrandingPreset | undefined {
  return BRANDING_PRESETS.find((preset) => preset.id === id);
}
