import { useEffect, useState } from "react";
import { useConfigStore } from "@/stores/configStore";
import { updateOrgConfig, updateChapterConfig } from "@/services/configService";
import {
  uploadOrganizationFavicon,
  deleteOrganizationFavicon,
  uploadChapterFavicon,
  deleteChapterFavicon,
  uploadOrganizationLogo,
  deleteOrganizationLogo,
  uploadChapterLogo,
  deleteChapterLogo,
} from "@/services/fileService";
import { BRANDING_PRESETS, getPresetById } from "@/data/brandingPresets";
import type { MemberRole, OrganizationConfig, ChapterConfig, BrandColors, Typography, ColorScheme } from "@/types";

// Heading fonts: serif/display faces that feel premium on the dark theme
const HEADING_FONTS = [
  "Cormorant Garamond",  // default — elegant serif
  "Playfair Display",    // high-contrast editorial serif
  "DM Serif Display",    // friendly but refined
  "Libre Baskerville",   // sturdy classic serif
  "Cinzel",              // Roman-inspired, great for Greek org gravitas
  "EB Garamond",         // scholarly serif
];

// Body fonts: clean, readable sans-serifs that work on dark backgrounds
const BODY_FONTS = [
  "Outfit",              // default — geometric, modern
  "DM Sans",             // warm geometric sans
  "Plus Jakarta Sans",   // sharp and versatile
  "Nunito",              // soft and approachable
  "Raleway",             // elegant thin geometric
  "Jost",                // minimalist German-influenced
];

const DEFAULT_COLORS: BrandColors = {
  primary: { light: "#eff6ff", main: "#3b82f6", dark: "#1e40af" },
  secondary: { light: "#f3f4f6", main: "#6b7280", dark: "#374151" },
  accent: { light: "#fef3c7", main: "#f59e0b", dark: "#d97706" },
};

const DEFAULT_TYPOGRAPHY: Typography = {
  heading_font: "Cormorant Garamond",
  body_font: "Outfit",
  font_source: "google",
};

interface BrandingTabProps {
  orgConfig: OrganizationConfig;
  chapterConfig: ChapterConfig;
  isAdmin: boolean;
  currentRole: MemberRole;
  organizationId: string | null;
  chapterId: string | null;
  setError: (msg: string) => void;
  setSuccess: (msg: string) => void;
  onOrgUpdate: (config: OrganizationConfig) => void;
  onChapterUpdate: (config: ChapterConfig) => void;
}

export default function BrandingTab({
  orgConfig,
  chapterConfig,
  isAdmin,
  currentRole,
  organizationId,
  chapterId,
  setError,
  setSuccess,
  onOrgUpdate,
  onChapterUpdate,
}: BrandingTabProps) {

  // Scope: "organization" or "chapter"
  const [scope, setScope] = useState<"organization" | "chapter">("organization");

  // Check if user can edit each scope
  const canEditOrg = isAdmin;
  const canEditChapter = currentRole === "president";

  // Determine which config to use based on scope
  const currentBranding = scope === "organization"
    ? orgConfig.branding
    : chapterConfig.branding;

  // State for branding fields
  const [colors, setColors] = useState<BrandColors>(
    currentBranding?.colors || DEFAULT_COLORS
  );
  const [typography, setTypography] = useState<Typography>(() => {
    const saved = currentBranding?.typography;
    if (!saved) return DEFAULT_TYPOGRAPHY;
    const headingValid = HEADING_FONTS.includes(saved.heading_font);
    const bodyValid = BODY_FONTS.includes(saved.body_font);
    return {
      heading_font: headingValid ? saved.heading_font : DEFAULT_TYPOGRAPHY.heading_font,
      body_font: bodyValid ? saved.body_font : DEFAULT_TYPOGRAPHY.body_font,
      font_source: "google",
    };
  });
  const { organization, chapter } = useConfigStore();
  const [logoPreview, setLogoPreview] = useState<string | null>(
    scope === "organization" ? (organization?.logo_url ?? null) : (chapter?.logo_url ?? null)
  );
  const [logoUploading, setLogoUploading] = useState(false);
  const [faviconFile, setFaviconFile] = useState<File | null>(null);
  const [faviconPreview, setFaviconPreview] = useState<string | null>(
    currentBranding?.favicon_url || null
  );
  const [chapterOverrideEnabled, setChapterOverrideEnabled] = useState<boolean>(
    chapterConfig.branding?.enabled ?? false
  );
  const [colorScheme, setColorScheme] = useState<ColorScheme>(
    orgConfig.branding?.color_scheme ?? "light"
  );
  const [saving, setSaving] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string>("");

  // Handle preset selection
  const handlePresetSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const presetId = e.target.value;
    setSelectedPreset(presetId);

    if (presetId) {
      const preset = getPresetById(presetId);
      if (preset) {
        setColors(preset.colors);
        setSuccess(`Applied ${preset.name} preset! You can customize the colors below.`);
      }
    }
  };

  // Update state when scope changes
  useEffect(() => {
    const currentBranding = scope === "organization"
      ? orgConfig.branding
      : chapterConfig.branding;

    const savedTypo = currentBranding?.typography;
    setColors(currentBranding?.colors || DEFAULT_COLORS);
    setTypography(savedTypo ? {
      heading_font: HEADING_FONTS.includes(savedTypo.heading_font) ? savedTypo.heading_font : DEFAULT_TYPOGRAPHY.heading_font,
      body_font: BODY_FONTS.includes(savedTypo.body_font) ? savedTypo.body_font : DEFAULT_TYPOGRAPHY.body_font,
      font_source: "google",
    } : DEFAULT_TYPOGRAPHY);
    setFaviconPreview(currentBranding?.favicon_url || null);
    setLogoPreview(scope === "organization" ? (organization?.logo_url ?? null) : (chapter?.logo_url ?? null));

    if (scope === "chapter") {
      setChapterOverrideEnabled(chapterConfig.branding?.enabled ?? false);
    } else {
      setColorScheme(orgConfig.branding?.color_scheme ?? "light");
    }
  }, [scope, orgConfig.branding, chapterConfig.branding, organization?.logo_url, chapter?.logo_url]);

  const handleColorChange = (
    palette: "primary" | "secondary" | "accent",
    shade: "light" | "main" | "dark",
    value: string
  ) => {
    setColors((prev) => ({
      ...prev,
      [palette]: {
        ...prev[palette],
        [shade]: value,
      },
    }));
  };

  const handleFaviconSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file
    if (!["image/x-icon", "image/png", "image/vnd.microsoft.icon"].includes(file.type)) {
      setError("Favicon must be .ico or .png format");
      return;
    }
    if (file.size > 1024 * 1024) {
      setError("Favicon must be less than 1MB");
      return;
    }

    setFaviconFile(file);
    // Create preview URL
    const previewUrl = URL.createObjectURL(file);
    setFaviconPreview(previewUrl);
  };

  const handleFaviconDelete = async () => {
    try {
      if (scope === "organization" && organizationId) {
        await deleteOrganizationFavicon(organizationId);
        setSuccess("Organization favicon deleted");
        setFaviconPreview(null);
        setFaviconFile(null);
        // Update config
        const updatedConfig = { ...orgConfig };
        if (updatedConfig.branding) {
          updatedConfig.branding.favicon_url = null;
        }
        onOrgUpdate(updatedConfig);
      } else if (scope === "chapter" && chapterId) {
        await deleteChapterFavicon(chapterId);
        setSuccess("Chapter favicon deleted");
        setFaviconPreview(null);
        setFaviconFile(null);
        // Update config
        const updatedConfig = { ...chapterConfig };
        if (updatedConfig.branding) {
          updatedConfig.branding.favicon_url = null;
        }
        onChapterUpdate(updatedConfig);
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error || "Failed to delete favicon");
    }
  };

  const handleLogoUpload = async (file: File) => {
    setLogoUploading(true);
    try {
      if (scope === "organization" && organizationId) {
        const result = await uploadOrganizationLogo(organizationId, file);
        setLogoPreview(result.url);
        if (organization) {
          useConfigStore.setState({ organization: { ...organization, logo_url: result.url } });
        }
        setSuccess("Organization logo updated");
      } else if (scope === "chapter" && chapterId) {
        const result = await uploadChapterLogo(chapterId, file);
        setLogoPreview(result.url);
        if (chapter) {
          useConfigStore.setState({ chapter: { ...chapter, logo_url: result.url } });
        }
        setSuccess("Chapter logo updated");
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error || "Failed to upload logo");
    } finally {
      setLogoUploading(false);
    }
  };

  const handleLogoDelete = async () => {
    try {
      if (scope === "organization" && organizationId) {
        await deleteOrganizationLogo(organizationId);
        setLogoPreview(null);
        if (organization) {
          useConfigStore.setState({ organization: { ...organization, logo_url: null } });
        }
        setSuccess("Organization logo removed");
      } else if (scope === "chapter" && chapterId) {
        await deleteChapterLogo(chapterId);
        setLogoPreview(null);
        if (chapter) {
          useConfigStore.setState({ chapter: { ...chapter, logo_url: null } });
        }
        setSuccess("Chapter logo removed");
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error || "Failed to delete logo");
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      // Upload favicon if selected
      let faviconUrl = faviconPreview;
      if (faviconFile) {
        if (scope === "organization" && organizationId) {
          const result = await uploadOrganizationFavicon(organizationId, faviconFile);
          faviconUrl = result.url;
        } else if (scope === "chapter" && chapterId) {
          const result = await uploadChapterFavicon(chapterId, faviconFile);
          faviconUrl = result.url;
        }
      }

      // Build branding config
      const brandingConfig = {
        favicon_url: faviconUrl,
        colors,
        typography,
      };

      // Save to appropriate scope
      if (scope === "organization") {
        const updatedConfig = {
          ...orgConfig,
          branding: { ...brandingConfig, color_scheme: colorScheme },
        };
        await updateOrgConfig(updatedConfig);
        onOrgUpdate(updatedConfig);
        setSuccess("Organization branding updated successfully");
      } else {
        const updatedConfig = {
          ...chapterConfig,
          branding: {
            ...brandingConfig,
            enabled: chapterOverrideEnabled,
          },
        };
        await updateChapterConfig(updatedConfig);
        onChapterUpdate(updatedConfig);
        setSuccess("Chapter branding updated successfully");
      }

      setFaviconFile(null);

      // Reload config to apply branding
      window.location.reload();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error || "Failed to save branding");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    const savedTypo = currentBranding?.typography;
    setColors(currentBranding?.colors || DEFAULT_COLORS);
    setTypography(savedTypo ? {
      heading_font: HEADING_FONTS.includes(savedTypo.heading_font) ? savedTypo.heading_font : DEFAULT_TYPOGRAPHY.heading_font,
      body_font: BODY_FONTS.includes(savedTypo.body_font) ? savedTypo.body_font : DEFAULT_TYPOGRAPHY.body_font,
      font_source: "google",
    } : DEFAULT_TYPOGRAPHY);
    setFaviconPreview(currentBranding?.favicon_url || null);
    setFaviconFile(null);
    if (scope === "chapter") {
      setChapterOverrideEnabled(chapterConfig.branding?.enabled ?? false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Color Scheme Toggle — org scope only */}
      {scope === "organization" && (
        <div className="bg-surface-card-solid p-5 rounded-xl border border-[var(--color-border)]">
          <p className="text-sm font-semibold text-content-primary mb-1">Color Scheme</p>
          <p className="text-xs text-content-muted mb-4">
            Sets the surface palette for your entire platform. Your brand colors apply on top of either scheme.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {/* Dark option */}
            <button
              type="button"
              onClick={() => setColorScheme("dark")}
              className={`relative rounded-xl border-2 p-4 text-left transition-all ${
                colorScheme === "dark"
                  ? "border-brand-primary-main bg-brand-primary-main/10"
                  : "border-[var(--color-border)] hover:border-[var(--color-border-brand)]"
              }`}
            >
              {/* Mini dark preview */}
              <div className="w-full h-16 rounded-lg bg-[#060b18] mb-3 overflow-hidden flex flex-col gap-1.5 p-2">
                <div className="h-2 w-3/4 rounded bg-[#0f1a3a]" />
                <div className="h-2 w-1/2 rounded bg-[#0f1a3a]" />
                <div className="mt-auto flex gap-1">
                  <div className="h-2 w-8 rounded bg-brand-primary-main/60" />
                  <div className="h-2 w-5 rounded bg-[#132248]" />
                </div>
              </div>
              <p className="text-sm font-semibold text-content-primary">Dark</p>
              <p className="text-xs text-content-muted mt-0.5">Luxury dark navy</p>
              {colorScheme === "dark" && (
                <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-brand-primary-main flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
              )}
            </button>

            {/* Light option */}
            <button
              type="button"
              onClick={() => setColorScheme("light")}
              className={`relative rounded-xl border-2 p-4 text-left transition-all ${
                colorScheme === "light"
                  ? "border-brand-primary-main bg-brand-primary-main/10"
                  : "border-[var(--color-border)] hover:border-[var(--color-border-brand)]"
              }`}
            >
              {/* Mini light preview */}
              <div className="w-full h-16 rounded-lg bg-[#eef2f9] mb-3 overflow-hidden flex flex-col gap-1.5 p-2">
                <div className="h-2 w-3/4 rounded bg-white shadow-sm" />
                <div className="h-2 w-1/2 rounded bg-white shadow-sm" />
                <div className="mt-auto flex gap-1">
                  <div className="h-2 w-8 rounded bg-brand-primary-main/70" />
                  <div className="h-2 w-5 rounded bg-[#e0e8f4]" />
                </div>
              </div>
              <p className="text-sm font-semibold text-content-primary">Light</p>
              <p className="text-xs text-content-muted mt-0.5">Editorial cream — default</p>
              {colorScheme === "light" && (
                <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-brand-primary-main flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Preset Selector */}
      <div className="bg-surface-card-solid p-4 rounded-lg border border-[var(--color-border)]">
        <label className="block text-sm font-medium text-content-secondary mb-3">
          Quick Start Presets (Optional)
        </label>
        <select
          value={selectedPreset}
          onChange={handlePresetSelect}
          className="w-full px-3 py-2 border border-[var(--color-border-brand)] rounded-lg focus:ring-2 focus:ring-brand-primary"
        >
          <option value="">-- Choose a palette or customize below --</option>
          {BRANDING_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name} — {preset.description}
            </option>
          ))}
        </select>
        <p className="text-xs text-content-secondary mt-2">
          Choose a starter palette, then customize the colors below to match your organization exactly.
        </p>
      </div>

      {/* Scope Selector */}
      <div className="bg-surface-card-solid p-4 rounded-lg border border-[var(--color-border)]">
        <label className="block text-sm font-medium text-content-secondary mb-3">
          Branding Scope
        </label>
        <div className="flex gap-3">
          <button
            onClick={() => setScope("organization")}
            disabled={!canEditOrg}
            className={`px-4 py-2 text-sm font-medium rounded-lg ${scope === "organization"
              ? "bg-brand-primary text-white"
              : "bg-white/10 text-content-secondary hover:bg-white/10"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            Organization
          </button>
          <button
            onClick={() => setScope("chapter")}
            disabled={!canEditChapter}
            className={`px-4 py-2 text-sm font-medium rounded-lg ${scope === "chapter"
              ? "bg-brand-primary text-white"
              : "bg-white/10 text-content-secondary hover:bg-white/10"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            Chapter Override
          </button>
        </div>
        {scope === "chapter" && (
          <div className="mt-4 flex items-center gap-2">
            <input
              type="checkbox"
              id="chapter-override-enabled"
              checked={chapterOverrideEnabled}
              onChange={(e) => setChapterOverrideEnabled(e.target.checked)}
              className="w-4 h-4 text-brand-primary border-[var(--color-border-brand)] rounded focus:ring-brand-primary"
            />
            <label htmlFor="chapter-override-enabled" className="text-sm text-content-secondary">
              Enable chapter branding override (if disabled, organization branding will be used)
            </label>
          </div>
        )}
      </div>

      {/* Logo Upload */}
      <div className="bg-surface-card-solid p-4 rounded-lg border border-[var(--color-border)]">
        <label className="block text-sm font-medium text-content-secondary mb-1">
          Logo
        </label>
        <p className="text-xs text-content-secondary mb-3">Displayed in the sidebar next to your organization name.</p>
        <div className="flex items-center gap-4">
          {logoPreview ? (
            <div className="flex items-center gap-3">
              <img
                src={logoPreview}
                alt="Logo preview"
                className="w-12 h-12 object-contain rounded border border-[var(--color-border)]"
              />
              <button
                onClick={handleLogoDelete}
                className="text-sm text-red-400 hover:text-red-300"
              >
                Remove
              </button>
            </div>
          ) : (
            <p className="text-sm text-content-secondary">No logo uploaded</p>
          )}
          <label className={`cursor-pointer inline-flex items-center px-4 py-2 text-sm font-medium text-content-secondary bg-surface-card-solid border border-[var(--color-border-brand)] rounded-lg hover:bg-white/5 ${logoUploading ? "opacity-50 cursor-not-allowed" : ""}`}>
            <input
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleLogoUpload(file);
              }}
              disabled={logoUploading}
              className="sr-only"
            />
            {logoUploading ? "Uploading…" : (logoPreview ? "Change Logo" : "Upload Logo")}
          </label>
        </div>
        <p className="text-xs text-content-secondary mt-2">Accepted: PNG, JPG, SVG, WebP (max 5MB)</p>
      </div>

      {/* Favicon Upload */}
      <div className="bg-surface-card-solid p-4 rounded-lg border border-[var(--color-border)]">
        <label className="block text-sm font-medium text-content-secondary mb-3">
          Favicon
        </label>
        <div className="flex items-center gap-4">
          {faviconPreview ? (
            <div className="flex items-center gap-3">
              <img
                src={faviconPreview}
                alt="Favicon preview"
                className="w-8 h-8 object-contain"
              />
              <button
                onClick={handleFaviconDelete}
                className="text-sm text-red-400 hover:text-red-300"
              >
                Remove
              </button>
            </div>
          ) : (
            <p className="text-sm text-content-secondary">No favicon uploaded</p>
          )}
          <label className="cursor-pointer inline-flex items-center px-4 py-2 text-sm font-medium text-content-secondary bg-surface-card-solid border border-[var(--color-border-brand)] rounded-lg hover:bg-white/5">
            <input
              type="file"
              accept=".ico,.png"
              onChange={handleFaviconSelect}
              className="sr-only"
            />
            {faviconPreview ? "Change" : "Upload"} Favicon
          </label>
        </div>
        <p className="text-xs text-content-secondary mt-2">
          Accepted formats: .ico or .png (max 1MB)
        </p>
      </div>

      {/* Color Pickers */}
      <div className="bg-surface-card-solid p-4 rounded-lg border border-[var(--color-border)]">
        <h3 className="text-sm font-medium text-content-secondary mb-4">Brand Colors</h3>
        <div className="space-y-6">
          {(["primary", "secondary", "accent"] as const).map((palette) => (
            <div key={palette}>
              <h4 className="text-xs font-medium text-content-secondary uppercase mb-3 tracking-wide">
                {palette}
              </h4>
              <div className="grid grid-cols-3 gap-4">
                {(["light", "main", "dark"] as const).map((shade) => (
                  <div key={shade}>
                    <label className="block text-xs text-content-secondary mb-2 capitalize">
                      {shade}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={colors[palette][shade]}
                        onChange={(e) => handleColorChange(palette, shade, e.target.value)}
                        className="w-12 h-12 rounded border border-[var(--color-border-brand)] cursor-pointer"
                      />
                      <input
                        type="text"
                        value={colors[palette][shade]}
                        onChange={(e) => handleColorChange(palette, shade, e.target.value)}
                        className="flex-1 px-3 py-2 text-sm border border-[var(--color-border-brand)] rounded-lg focus:ring-2 focus:ring-brand-primary"
                        placeholder="#000000"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Typography */}
      <div className="bg-surface-card-solid p-4 rounded-lg border border-[var(--color-border)]">
        <h3 className="text-sm font-medium text-content-secondary mb-4">Typography</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-content-secondary mb-2">Font Source</label>
            <select
              value={typography.font_source}
              onChange={(e) =>
                setTypography((prev) => ({
                  ...prev,
                  font_source: e.target.value as "google" | "system",
                }))
              }
              className="w-full px-3 py-2 border border-[var(--color-border-brand)] rounded-lg focus:ring-2 focus:ring-brand-primary"
            >
              <option value="google">Google Fonts</option>
              <option value="system">System Fonts</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-content-secondary mb-2">Heading Font</label>
            <select
              value={typography.heading_font}
              onChange={(e) =>
                setTypography((prev) => ({ ...prev, heading_font: e.target.value }))
              }
              className="w-full px-3 py-2 border border-[var(--color-border-brand)] rounded-lg focus:ring-2 focus:ring-brand-primary"
            >
              {HEADING_FONTS.map((font) => (
                <option key={font} value={font}>{font}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-content-secondary mb-2">Body Font</label>
            <select
              value={typography.body_font}
              onChange={(e) =>
                setTypography((prev) => ({ ...prev, body_font: e.target.value }))
              }
              className="w-full px-3 py-2 border border-[var(--color-border-brand)] rounded-lg focus:ring-2 focus:ring-brand-primary"
            >
              {BODY_FONTS.map((font) => (
                <option key={font} value={font}>{font}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Live Preview */}
      <div className="bg-surface-card-solid p-4 rounded-lg border border-[var(--color-border)]">
        <h3 className="text-sm font-medium text-content-secondary mb-4">Preview</h3>
        <div className="border border-[var(--color-border)] rounded-lg p-6 space-y-4">
          <div
            className="p-4 rounded-lg"
            style={{
              backgroundColor: colors.primary.light,
              color: colors.primary.dark,
              fontFamily: typography.heading_font,
            }}
          >
            <h4 className="text-lg font-semibold" style={{ fontFamily: typography.heading_font }}>
              Heading Example
            </h4>
            <p className="text-sm mt-2" style={{ fontFamily: typography.body_font }}>
              This is body text using your selected fonts and colors.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              className="px-4 py-2 rounded-lg text-white text-sm font-medium"
              style={{ backgroundColor: colors.primary.main }}
            >
              Primary Button
            </button>
            <button
              className="px-4 py-2 rounded-lg text-white text-sm font-medium"
              style={{ backgroundColor: colors.secondary.main }}
            >
              Secondary Button
            </button>
            <button
              className="px-4 py-2 rounded-lg text-white text-sm font-medium"
              style={{ backgroundColor: colors.accent.main }}
            >
              Accent Button
            </button>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3">
        <button
          onClick={handleReset}
          className="px-4 py-2 text-sm font-medium text-content-secondary bg-surface-card-solid border border-[var(--color-border-brand)] rounded-lg hover:bg-white/5"
        >
          Reset
        </button>
        <button
          onClick={handleSave}
          disabled={saving || (scope === "organization" && !canEditOrg) || (scope === "chapter" && !canEditChapter)}
          className="px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-brand-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
