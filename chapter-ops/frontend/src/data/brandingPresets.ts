import type { BrandColors } from "@/types";

export interface BrandingPreset {
  id: string;
  name: string;
  abbreviation: string;
  greek_letters: string;
  council: "NPHC" | "IFC" | "Panhellenic" | "NALFO" | "MCGC" | "Custom";
  founded_year: number;
  colors: BrandColors;
  description?: string;
}

/**
 * Divine Nine - NPHC (National Pan-Hellenic Council) Organizations
 * Official brand colors for the historically Black Greek letter organizations.
 */
export const BRANDING_PRESETS: BrandingPreset[] = [
  // Divine Nine - Fraternities
  {
    id: "alpha-phi-alpha",
    name: "Alpha Phi Alpha Fraternity, Inc.",
    abbreviation: "Alpha",
    greek_letters: "ΑΦΑ",
    council: "NPHC",
    founded_year: 1906,
    description: "First intercollegiate historically Black fraternity",
    colors: {
      primary: { light: "#424242", main: "#000000", dark: "#000000" }, // Black
      secondary: { light: "#FFF9E6", main: "#CFB53B", dark: "#B8860B" }, // Old Gold
      accent: { light: "#E0E0E0", main: "#9E9E9E", dark: "#616161" }, // Gray accent
    },
  },
  {
    id: "kappa-alpha-psi",
    name: "Kappa Alpha Psi Fraternity, Inc.",
    abbreviation: "Kappa",
    greek_letters: "ΚΑΨ",
    council: "NPHC",
    founded_year: 1911,
    description: "Achievement in every field of human endeavor",
    colors: {
      primary: { light: "#FFEBEE", main: "#DC143C", dark: "#8B0000" }, // Crimson
      secondary: { light: "#FFFEF0", main: "#FFFACD", dark: "#F0E68C" }, // Cream
      accent: { light: "#E3F2FD", main: "#2196F3", dark: "#1976D2" }, // Blue accent
    },
  },
  {
    id: "omega-psi-phi",
    name: "Omega Psi Phi Fraternity, Inc.",
    abbreviation: "Omega",
    greek_letters: "ΩΨΦ",
    council: "NPHC",
    founded_year: 1911,
    description: "Friendship is essential to the soul",
    colors: {
      primary: { light: "#E1BEE7", main: "#6A0DAD", dark: "#4B0082" }, // Royal Purple
      secondary: { light: "#FFF9E6", main: "#CFB53B", dark: "#B8860B" }, // Old Gold
      accent: { light: "#424242", main: "#000000", dark: "#000000" }, // Black accent
    },
  },
  {
    id: "phi-beta-sigma",
    name: "Phi Beta Sigma Fraternity, Inc.",
    abbreviation: "Sigma",
    greek_letters: "ΦΒΣ",
    council: "NPHC",
    founded_year: 1914,
    description: "Culture For Service and Service For Humanity",
    colors: {
      primary: { light: "#E3F2FD", main: "#0047AB", dark: "#002F6C" }, // Royal Blue
      secondary: { light: "#FAFAFA", main: "#FFFFFF", dark: "#E0E0E0" }, // Pure White
      accent: { light: "#FFF9E6", main: "#FFD700", dark: "#B8860B" }, // Gold accent
    },
  },
  {
    id: "iota-phi-theta",
    name: "Iota Phi Theta Fraternity, Inc.",
    abbreviation: "Iota",
    greek_letters: "ΙΦΘ",
    council: "NPHC",
    founded_year: 1963,
    description: "Building a Tradition, Not Resting Upon One",
    colors: {
      primary: { light: "#D7CCC8", main: "#5D4037", dark: "#3E2723" }, // Charcoal Brown
      secondary: { light: "#FFF9E6", main: "#FFD700", dark: "#DAA520" }, // Gilded Gold
      accent: { light: "#E0E0E0", main: "#9E9E9E", dark: "#616161" }, // Gray accent
    },
  },

  // Divine Nine - Sororities
  {
    id: "alpha-kappa-alpha",
    name: "Alpha Kappa Alpha Sorority, Inc.",
    abbreviation: "AKA",
    greek_letters: "ΑΚΑ",
    council: "NPHC",
    founded_year: 1908,
    description: "First intercollegiate historically Black sorority",
    colors: {
      primary: { light: "#FFE0E6", main: "#FA8072", dark: "#E9967A" }, // Salmon Pink
      secondary: { light: "#E8F5E9", main: "#8BC34A", dark: "#689F38" }, // Apple Green
      accent: { light: "#FFF9E6", main: "#FFD700", dark: "#B8860B" }, // Gold accent
    },
  },
  {
    id: "delta-sigma-theta",
    name: "Delta Sigma Theta Sorority, Inc.",
    abbreviation: "Delta",
    greek_letters: "ΔΣΘ",
    council: "NPHC",
    founded_year: 1913,
    description: "Intelligence is the Torch of Wisdom",
    colors: {
      primary: { light: "#FFEBEE", main: "#DC143C", dark: "#8B0000" }, // Crimson
      secondary: { light: "#FFFEF0", main: "#FFFACD", dark: "#F0E68C" }, // Cream
      accent: { light: "#E3F2FD", main: "#2196F3", dark: "#1976D2" }, // Blue accent
    },
  },
  {
    id: "zeta-phi-beta",
    name: "Zeta Phi Beta Sorority, Inc.",
    abbreviation: "Zeta",
    greek_letters: "ΖΦΒ",
    council: "NPHC",
    founded_year: 1920,
    description: "Finer Womanhood",
    colors: {
      primary: { light: "#E3F2FD", main: "#0047AB", dark: "#002F6C" }, // Royal Blue
      secondary: { light: "#FAFAFA", main: "#FFFFFF", dark: "#E0E0E0" }, // White
      accent: { light: "#E0E0E0", main: "#9E9E9E", dark: "#616161" }, // Gray accent
    },
  },
  {
    id: "sigma-gamma-rho",
    name: "Sigma Gamma Rho Sorority, Inc.",
    abbreviation: "SGRho",
    greek_letters: "ΣΓΡ",
    council: "NPHC",
    founded_year: 1922,
    description: "Greater Service, Greater Progress",
    colors: {
      primary: { light: "#E3F2FD", main: "#0047AB", dark: "#002F6C" }, // Royal Blue
      secondary: { light: "#FFF9E6", main: "#FFD700", dark: "#DAA520" }, // Gold
      accent: { light: "#FAFAFA", main: "#FFFFFF", dark: "#E0E0E0" }, // White accent
    },
  },
];

/**
 * Get a preset by ID
 */
export function getPresetById(id: string): BrandingPreset | undefined {
  return BRANDING_PRESETS.find((preset) => preset.id === id);
}

/**
 * Get presets by council
 */
export function getPresetsByCouncil(
  council: BrandingPreset["council"]
): BrandingPreset[] {
  return BRANDING_PRESETS.filter((preset) => preset.council === council);
}

/**
 * Get all NPHC (Divine Nine) presets
 */
export function getDivineNinePresets(): BrandingPreset[] {
  return getPresetsByCouncil("NPHC").sort((a, b) => a.founded_year - b.founded_year);
}
