import type { BrandColors } from "@/types";

export interface BrandingPreset {
  id: string;
  name: string;
  colors: BrandColors;
  description?: string;
}

/**
 * Starter color palettes for quick branding setup.
 * Organizations can customize these or build from scratch.
 */
export const BRANDING_PRESETS: BrandingPreset[] = [
  {
    id: "royal-blue-gold",
    name: "Royal Blue & Gold",
    description: "Classic collegiate palette",
    colors: {
      primary: { light: "#E3F2FD", main: "#0047AB", dark: "#002F6C" },
      secondary: { light: "#FAFAFA", main: "#FFFFFF", dark: "#E0E0E0" },
      accent: { light: "#FFF9E6", main: "#FFD700", dark: "#B8860B" },
    },
  },
  {
    id: "crimson-cream",
    name: "Crimson & Cream",
    description: "Bold and warm",
    colors: {
      primary: { light: "#FFEBEE", main: "#DC143C", dark: "#8B0000" },
      secondary: { light: "#FFFEF0", main: "#FFFACD", dark: "#F0E68C" },
      accent: { light: "#E3F2FD", main: "#2196F3", dark: "#1976D2" },
    },
  },
  {
    id: "black-gold",
    name: "Black & Gold",
    description: "Timeless and refined",
    colors: {
      primary: { light: "#424242", main: "#000000", dark: "#000000" },
      secondary: { light: "#FFF9E6", main: "#CFB53B", dark: "#B8860B" },
      accent: { light: "#E0E0E0", main: "#9E9E9E", dark: "#616161" },
    },
  },
  {
    id: "purple-gold",
    name: "Purple & Gold",
    description: "Regal and commanding",
    colors: {
      primary: { light: "#E1BEE7", main: "#6A0DAD", dark: "#4B0082" },
      secondary: { light: "#FFF9E6", main: "#CFB53B", dark: "#B8860B" },
      accent: { light: "#424242", main: "#000000", dark: "#000000" },
    },
  },
  {
    id: "forest-silver",
    name: "Forest & Silver",
    description: "Natural and distinguished",
    colors: {
      primary: { light: "#E8F5E9", main: "#2E7D32", dark: "#1B5E20" },
      secondary: { light: "#F5F5F5", main: "#BDBDBD", dark: "#9E9E9E" },
      accent: { light: "#FFF8E1", main: "#FFA000", dark: "#F57F17" },
    },
  },
  {
    id: "maroon-white",
    name: "Maroon & White",
    description: "Strong and classic",
    colors: {
      primary: { light: "#FFCDD2", main: "#800000", dark: "#4A0000" },
      secondary: { light: "#FAFAFA", main: "#FFFFFF", dark: "#E0E0E0" },
      accent: { light: "#FFF9E6", main: "#CFB53B", dark: "#B8860B" },
    },
  },
];

/**
 * Get a preset by ID
 */
export function getPresetById(id: string): BrandingPreset | undefined {
  return BRANDING_PRESETS.find((preset) => preset.id === id);
}
