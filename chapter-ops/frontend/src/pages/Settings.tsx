import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import ImageUpload from "@/components/ImageUpload";
import { useAuthStore } from "@/stores/authStore";
import { useConfigStore } from "@/stores/configStore";
import { useRegionStore } from "@/stores/regionStore";
// import { useBrandingStore } from "@/stores/brandingStore";
import { updateOrgConfig, updateChapterConfig } from "@/services/configService";
import { updateMember } from "@/services/chapterService";
import {
  getStripeAccountStatus,
  getStripeConnectUrl,
  disconnectStripe,
} from "@/services/stripeService";
import {
  uploadOrganizationFavicon,
  deleteOrganizationFavicon,
  uploadChapterFavicon,
  deleteChapterFavicon,
  uploadOrganizationLogo,
  deleteOrganizationLogo,
  uploadChapterLogo,
  deleteChapterLogo,
  uploadProfilePicture,
  deleteProfilePicture,
} from "@/services/fileService";
import {
  fetchMyTransfers,
  fetchChapterTransfers,
  fetchAvailableChapters,
  createTransferRequest,
  approveTransfer,
  denyTransfer,
  type AvailableChapter,
} from "@/services/transferService";
import api from "@/lib/api";
import type {
  MemberRole,
  OrganizationConfig,
  ChapterConfig,
  CustomFieldDefinition,
  FeeType,
  StripeAccountStatus,
  BrandColors,
  Typography,
  ChapterTransferRequest,
} from "@/types";
import { BRANDING_PRESETS, getPresetById } from "@/data/brandingPresets";

const ROLE_HIERARCHY: Record<MemberRole, number> = {
  member: 0, secretary: 1, treasurer: 2, vice_president: 3, president: 4, admin: 5,
};

const INTERNAL_ROLES: MemberRole[] = ["president", "vice_president", "treasurer", "secretary", "member"];

type Tab = "profile" | "organization" | "chapter" | "payments" | "branding";

const TAB_LABELS: Record<Tab, string> = {
  profile: "Profile",
  organization: "Organization",
  chapter: "Chapter",
  payments: "Payments",
  branding: "Branding",
};

export default function Settings() {
  const { memberships, user } = useAuthStore();
  const { orgConfig, chapterConfig, organizationId, chapterId, setOrgConfig, setChapterConfig } = useConfigStore();
  const { isOrgAdmin } = useRegionStore();

  const currentMembership = memberships.find(
    (m) => m.chapter_id === user?.active_chapter_id
  );
  const currentRole = currentMembership?.role ?? "member";
  const isAdmin = isOrgAdmin || ROLE_HIERARCHY[currentRole] >= ROLE_HIERARCHY["admin"];
  const isOfficer = isOrgAdmin || ROLE_HIERARCHY[currentRole] >= ROLE_HIERARCHY["secretary"];

  // Members default to Profile tab; officers default to Organization
  const [tab, setTab] = useState<Tab>(isOfficer ? "organization" : "profile");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Profile tab is always visible; officer tabs only for secretary+
  const visibleTabs: Tab[] = isOfficer
    ? ["profile", "organization", "chapter", "payments", "branding"]
    : ["profile"];

  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-content-primary mb-6">Settings</h2>

        {error && (
          <div className="mb-4 p-3 bg-red-900/20 text-red-400 rounded-lg text-sm">
            {error}
            <button onClick={() => setError(null)} className="ml-2 font-medium underline">Dismiss</button>
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 bg-green-900/20 text-green-400 rounded-lg text-sm">
            {success}
            <button onClick={() => setSuccess(null)} className="ml-2 font-medium underline">Dismiss</button>
          </div>
        )}

        {isOfficer && !isAdmin && tab !== "profile" && (
          <div className="mb-4 p-3 bg-yellow-900/20 text-yellow-400 rounded-lg text-sm">
            You are viewing settings in read-only mode. Only admins can edit configuration.
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-[var(--color-border)] mb-6">
          <nav className="flex gap-6">
            {visibleTabs.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors ${tab === t
                  ? "border-brand-primary text-brand-primary"
                  : "border-transparent text-content-secondary hover:text-content-secondary"
                  }`}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </nav>
        </div>

        {tab === "profile" ? (
          <ProfileTab
            currentRole={currentRole}
            setError={setError}
            setSuccess={setSuccess}
          />
        ) : tab === "organization" ? (
          <OrgConfigTab
            config={orgConfig}
            isAdmin={isAdmin}
            setError={setError}
            setSuccess={setSuccess}
            onSave={setOrgConfig}
          />
        ) : tab === "chapter" ? (
          <ChapterConfigTab
            config={chapterConfig}
            isAdmin={isAdmin}
            currentRole={currentRole}
            setError={setError}
            setSuccess={setSuccess}
            onSave={setChapterConfig}
          />
        ) : tab === "payments" ? (
          <StripeConnectSection
            currentRole={currentRole}
            setError={setError}
            setSuccess={setSuccess}
          />
        ) : (
          <BrandingTab
            orgConfig={orgConfig}
            chapterConfig={chapterConfig}
            isAdmin={isAdmin}
            currentRole={currentRole}
            organizationId={organizationId}
            chapterId={chapterId}
            setError={setError}
            setSuccess={setSuccess}
            onOrgUpdate={setOrgConfig}
            onChapterUpdate={setChapterConfig}
          />
        )}
      </div>
    </Layout>
  );
}

// ── Profile Tab ───────────────────────────────────────────────────────────────

function ProfileTab({
  currentRole,
  setError,
  setSuccess,
}: {
  currentRole: MemberRole;
  setError: (e: string | null) => void;
  setSuccess: (s: string | null) => void;
}) {
  const { user: authUser, memberships } = useAuthStore();
  const { getCustomFields } = useConfigStore();
  const customFieldDefs: CustomFieldDefinition[] = getCustomFields();

  // Profile picture
  async function handleAvatarUpload(file: File) {
    const res = await uploadProfilePicture(file);
    if (res.user) {
      useAuthStore.setState({ user: res.user });
    }
    setSuccess("Profile picture updated.");
  }

  async function handleAvatarDelete() {
    await deleteProfilePicture();
    useAuthStore.setState((s) => ({ user: s.user ? { ...s.user, profile_picture_url: null } : s.user }));
    setSuccess("Profile picture removed.");
  }

  // Name / email form
  const [firstName, setFirstName] = useState(authUser?.first_name ?? "");
  const [lastName, setLastName] = useState(authUser?.last_name ?? "");
  const [email, setEmail] = useState(authUser?.email ?? "");
  const [savingProfile, setSavingProfile] = useState(false);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setError(null);
    try {
      const res = await api.put("/auth/profile", {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
      });
      useAuthStore.setState({ user: res.data.user });
      setSuccess("Profile updated.");
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } }).response?.data?.error || "Failed to update profile.";
      setError(message);
    } finally {
      setSavingProfile(false);
    }
  }

  // Password form
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPw !== confirmPw) {
      setError("New passwords do not match.");
      return;
    }
    setSavingPw(true);
    setError(null);
    try {
      await api.put("/auth/change-password", {
        current_password: currentPw,
        new_password: newPw,
      });
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
      setSuccess("Password changed successfully.");
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } }).response?.data?.error || "Failed to change password.";
      setError(message);
    } finally {
      setSavingPw(false);
    }
  }

  // Custom member fields
  const activeMembership = memberships.find((m) => m.chapter_id === authUser?.active_chapter_id);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>(() => {
    const vals: Record<string, string> = {};
    for (const def of customFieldDefs) {
      const v = activeMembership?.custom_fields?.[def.key];
      vals[def.key] = v != null ? String(v) : "";
    }
    return vals;
  });
  const [savingCustomFields, setSavingCustomFields] = useState(false);

  async function handleSaveCustomFields(e: React.FormEvent) {
    e.preventDefault();
    if (!activeMembership) return;
    setSavingCustomFields(true);
    setError(null);
    try {
      await updateMember(activeMembership.id, { custom_fields: customFieldValues });
      setSuccess("Chapter profile updated.");
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } }).response?.data?.error || "Failed to update chapter profile.";
      setError(message);
    } finally {
      setSavingCustomFields(false);
    }
  }

  // Transfer request
  const isPresident = ROLE_HIERARCHY[currentRole] >= ROLE_HIERARCHY["president"];
  const [myTransfers, setMyTransfers] = useState<ChapterTransferRequest[]>([]);
  const [availableChapters, setAvailableChapters] = useState<AvailableChapter[]>([]);
  const [toChapterId, setToChapterId] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [submittingTransfer, setSubmittingTransfer] = useState(false);
  const hasPending = myTransfers.some((t) => t.status === "pending" || t.status === "approved_by_from");

  useEffect(() => {
    fetchMyTransfers().then(setMyTransfers).catch(() => {});
    fetchAvailableChapters().then(setAvailableChapters).catch(() => {});
  }, []);

  async function handleSubmitTransfer(e: React.FormEvent) {
    e.preventDefault();
    if (!toChapterId) return;
    setSubmittingTransfer(true);
    setError(null);
    try {
      const created = await createTransferRequest({ to_chapter_id: toChapterId, reason: transferReason.trim() || undefined });
      setMyTransfers((prev) => [created, ...prev]);
      setToChapterId(""); setTransferReason("");
      setSuccess("Transfer request submitted. Both chapter presidents will be notified.");
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } }).response?.data?.error || "Failed to submit transfer request.";
      setError(message);
    } finally {
      setSubmittingTransfer(false);
    }
  }

  const TRANSFER_STATUS_STYLE: Record<string, string> = {
    pending: "bg-yellow-900/30 text-yellow-400",
    approved_by_from: "bg-blue-900/30 text-blue-400",
    approved: "bg-green-900/30 text-green-400",
    denied: "bg-red-900/30 text-red-400",
  };
  const TRANSFER_STATUS_LABEL: Record<string, string> = {
    pending: "Pending",
    approved_by_from: "Partially approved",
    approved: "Approved",
    denied: "Denied",
  };

  // Sync local form state when auth user changes (e.g., after save)
  useEffect(() => {
    if (authUser) {
      setFirstName(authUser.first_name);
      setLastName(authUser.last_name);
      setEmail(authUser.email);
    }
  }, [authUser?.id]);

  return (
    <div className="space-y-8">
      {/* Profile Picture */}
      <div className="bg-surface-card-solid rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-content-primary mb-1">Profile Picture</h3>
        <p className="text-sm text-content-secondary mb-4">Upload a photo to personalize your account.</p>
        <ImageUpload
          label="Profile picture"
          currentImageUrl={authUser?.profile_picture_url}
          onUpload={handleAvatarUpload}
          onDelete={authUser?.profile_picture_url ? handleAvatarDelete : undefined}
          maxSizeMB={5}
        />
      </div>

      {/* Name & Email */}
      <div className="bg-surface-card-solid rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-content-primary mb-1">Personal Information</h3>
        <p className="text-sm text-content-secondary mb-4">Update your name and email address.</p>
        <form onSubmit={handleSaveProfile} className="space-y-4 max-w-md">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">First Name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">Last Name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>
          <button
            type="submit"
            disabled={savingProfile}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-brand-primary-dark disabled:opacity-50"
          >
            {savingProfile ? "Saving..." : "Save Changes"}
          </button>
        </form>
      </div>

      {/* Password */}
      <div className="bg-surface-card-solid rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-content-primary mb-1">Change Password</h3>
        <p className="text-sm text-content-secondary mb-4">Choose a strong password (12+ characters, mixed case, number, symbol).</p>
        <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">Current Password</label>
            <input
              type="password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">New Password</label>
            <input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              required
              minLength={12}
              autoComplete="new-password"
              className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">Confirm New Password</label>
            <input
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>
          <button
            type="submit"
            disabled={savingPw}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-brand-primary-dark disabled:opacity-50"
          >
            {savingPw ? "Updating..." : "Update Password"}
          </button>
        </form>
      </div>

      {/* Custom Member Fields */}
      {customFieldDefs.length > 0 && activeMembership && (
        <div className="bg-surface-card-solid rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-content-primary mb-1">Chapter Profile</h3>
          <p className="text-sm text-content-secondary mb-4">Additional information tracked by your chapter.</p>
          <form onSubmit={handleSaveCustomFields} className="space-y-4 max-w-md">
            {customFieldDefs.map((field) => (
              <div key={field.key}>
                <label className="block text-sm font-medium text-content-secondary mb-1">
                  {field.label}
                  {field.required && <span className="text-red-500 ml-0.5">*</span>}
                </label>
                <input
                  type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                  value={customFieldValues[field.key] ?? ""}
                  onChange={(e) => setCustomFieldValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  required={field.required}
                  className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                />
              </div>
            ))}
            <button
              type="submit"
              disabled={savingCustomFields}
              className="px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-brand-primary-dark disabled:opacity-50"
            >
              {savingCustomFields ? "Saving..." : "Save Chapter Profile"}
            </button>
          </form>
        </div>
      )}

      {/* Chapter Transfer — hide for presidents (they manage transfers, not request them) */}
      {!isPresident && (
        <div className="bg-surface-card-solid rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-content-primary mb-1">Transfer to Another Chapter</h3>
          <p className="text-sm text-content-secondary mb-4">
            Request to move to a different chapter in your organization. Both chapter presidents must approve before the transfer is completed.
          </p>

          {!hasPending && availableChapters.length > 0 && (
            <form onSubmit={handleSubmitTransfer} className="space-y-4 max-w-md mb-6">
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">Destination Chapter</label>
                <select
                  value={toChapterId}
                  onChange={(e) => setToChapterId(e.target.value)}
                  required
                  className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                >
                  <option value="">Select a chapter...</option>
                  {availableChapters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.city && c.state ? ` (${c.city}, ${c.state})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">
                  Reason <span className="text-content-muted font-normal">(optional)</span>
                </label>
                <textarea
                  value={transferReason}
                  onChange={(e) => setTransferReason(e.target.value)}
                  rows={3}
                  placeholder="Why are you transferring? (e.g., relocating for work)"
                  className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary resize-none"
                />
              </div>
              <button
                type="submit"
                disabled={submittingTransfer || !toChapterId}
                className="px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-brand-primary-dark disabled:opacity-50"
              >
                {submittingTransfer ? "Submitting..." : "Submit Transfer Request"}
              </button>
            </form>
          )}

          {hasPending && (
            <div className="mb-4 p-3 bg-blue-900/20 text-blue-400 rounded-lg text-sm">
              You have a pending transfer request. You cannot submit another until it is resolved.
            </div>
          )}

          {availableChapters.length === 0 && !hasPending && (
            <p className="text-sm text-content-muted mb-4">No other chapters available in your organization.</p>
          )}

          {myTransfers.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-content-secondary mb-2">Your Transfer History</h4>
              <div className="space-y-2">
                {myTransfers.map((t) => (
                  <div key={t.id} className="flex items-center justify-between border border-[var(--color-border)] rounded-lg px-4 py-3 text-sm">
                    <div>
                      <span className="font-medium">{t.from_chapter_name}</span>
                      <span className="text-content-muted mx-2">→</span>
                      <span className="font-medium">{t.to_chapter_name}</span>
                      {t.denial_reason && (
                        <p className="text-xs text-red-400 mt-0.5">Denied: {t.denial_reason}</p>
                      )}
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TRANSFER_STATUS_STYLE[t.status] ?? "bg-gray-800/50 text-gray-400"}`}>
                      {TRANSFER_STATUS_LABEL[t.status] ?? t.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Organization Config Tab ──────────────────────────────────────────────────

function OrgConfigTab({
  config,
  isAdmin,
  setError,
  setSuccess,
  onSave,
}: {
  config: OrganizationConfig;
  isAdmin: boolean;
  setError: (e: string | null) => void;
  setSuccess: (s: string | null) => void;
  onSave: (c: OrganizationConfig) => void;
}) {
  const [roleTitles, setRoleTitles] = useState<Record<string, string>>(
    config.role_titles ?? {}
  );
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>(
    config.custom_member_fields ?? []
  );
  const [saving, setSaving] = useState(false);

  async function handleSaveRoleTitles() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateOrgConfig({ role_titles: roleTitles });
      onSave(updated);
      setSuccess("Role titles updated.");
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error || "Failed to update role titles.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveFields() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateOrgConfig({ custom_member_fields: customFields });
      onSave(updated);
      setSuccess("Custom fields updated.");
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error || "Failed to update custom fields.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  function addField() {
    setCustomFields((prev) => [
      ...prev,
      { key: "", label: "", type: "text", required: false },
    ]);
  }

  function removeField(index: number) {
    setCustomFields((prev) => prev.filter((_, i) => i !== index));
  }

  function updateField(index: number, updates: Partial<CustomFieldDefinition>) {
    setCustomFields((prev) =>
      prev.map((f, i) => (i === index ? { ...f, ...updates } : f))
    );
  }

  return (
    <div className="space-y-8">
      {/* Role Titles */}
      <div className="bg-surface-card-solid rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-content-primary mb-1">Role Titles</h3>
        <p className="text-sm text-content-secondary mb-4">
          Customize how role names appear throughout the platform. Internal permissions remain unchanged.
        </p>
        <div className="space-y-3">
          {INTERNAL_ROLES.map((role) => (
            <div key={role} className="flex items-center gap-4">
              <span className="text-sm text-content-secondary w-32 capitalize">
                {role.replace("_", " ")}
              </span>
              <input
                type="text"
                value={roleTitles[role] ?? ""}
                onChange={(e) =>
                  setRoleTitles((prev) => ({ ...prev, [role]: e.target.value }))
                }
                disabled={!isAdmin}
                placeholder={role.replace("_", " ")}
                className="flex-1 max-w-xs rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-[var(--color-bg-input)] disabled:text-content-secondary"
              />
            </div>
          ))}
        </div>
        {isAdmin && (
          <button
            onClick={handleSaveRoleTitles}
            disabled={saving}
            className="mt-4 px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-brand-primary-dark disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Role Titles"}
          </button>
        )}
      </div>

      {/* Custom Member Fields */}
      <div className="bg-surface-card-solid rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-content-primary mb-1">Custom Member Fields</h3>
        <p className="text-sm text-content-secondary mb-4">
          Define additional fields for member profiles (e.g., line number, crossing date).
        </p>
        {customFields.length === 0 ? (
          <p className="text-sm text-content-muted mb-4">No custom fields defined.</p>
        ) : (
          <div className="space-y-3 mb-4">
            {customFields.map((field, i) => (
              <div key={i} className="flex items-center gap-3">
                <input
                  type="text"
                  value={field.key}
                  onChange={(e) => updateField(i, { key: e.target.value.replace(/\s/g, "_").toLowerCase() })}
                  disabled={!isAdmin}
                  placeholder="key"
                  className="w-32 rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-[var(--color-bg-input)]"
                />
                <input
                  type="text"
                  value={field.label}
                  onChange={(e) => updateField(i, { label: e.target.value })}
                  disabled={!isAdmin}
                  placeholder="Label"
                  className="flex-1 rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-[var(--color-bg-input)]"
                />
                <select
                  value={field.type}
                  onChange={(e) => updateField(i, { type: e.target.value as "text" | "number" | "date" })}
                  disabled={!isAdmin}
                  className="w-28 rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-[var(--color-bg-input)]"
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                </select>
                <label className="flex items-center gap-1 text-sm text-content-secondary">
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={(e) => updateField(i, { required: e.target.checked })}
                    disabled={!isAdmin}
                    className="rounded"
                  />
                  Req
                </label>
                {isAdmin && (
                  <button
                    onClick={() => removeField(i)}
                    className="text-red-400 hover:text-red-300 text-sm"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {isAdmin && (
          <div className="flex gap-3">
            <button
              onClick={addField}
              className="px-4 py-2 text-sm font-medium text-content-secondary bg-white/10 rounded-lg hover:bg-white/10"
            >
              Add Field
            </button>
            <button
              onClick={handleSaveFields}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-brand-primary-dark disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Custom Fields"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Chapter Config Tab ───────────────────────────────────────────────────────

function ChapterConfigTab({
  config,
  isAdmin,
  currentRole,
  setError,
  setSuccess,
  onSave,
}: {
  config: ChapterConfig;
  isAdmin: boolean;
  currentRole: MemberRole;
  setError: (e: string | null) => void;
  setSuccess: (s: string | null) => void;
  onSave: (c: ChapterConfig) => void;
}) {
  const [feeTypes, setFeeTypes] = useState<FeeType[]>(config.fee_types ?? []);
  const [settings, setSettings] = useState(config.settings ?? {});
  const [saving, setSaving] = useState(false);

  async function handleSaveFeeTypes() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateChapterConfig({ fee_types: feeTypes });
      onSave(updated);
      setSuccess("Fee types updated.");
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error || "Failed to update fee types.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveSettings() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateChapterConfig({ settings });
      onSave(updated);
      setSuccess("Settings updated.");
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error || "Failed to update settings.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  function addFeeType() {
    setFeeTypes((prev) => [...prev, { id: "", label: "", default_amount: 0 }]);
  }

  function removeFeeType(index: number) {
    setFeeTypes((prev) => prev.filter((_, i) => i !== index));
  }

  function updateFeeType(index: number, updates: Partial<FeeType>) {
    setFeeTypes((prev) =>
      prev.map((f, i) => (i === index ? { ...f, ...updates } : f))
    );
  }

  return (
    <div className="space-y-8">
      {/* Fee Types */}
      <div className="bg-surface-card-solid rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-content-primary mb-1">Fee Types</h3>
        <p className="text-sm text-content-secondary mb-4">
          Define the types of fees your chapter collects (dues, initiation fees, etc.).
        </p>
        {feeTypes.length === 0 ? (
          <p className="text-sm text-content-muted mb-4">No fee types defined.</p>
        ) : (
          <div className="space-y-3 mb-4">
            {feeTypes.map((ft, i) => (
              <div key={i} className="flex items-center gap-3">
                <input
                  type="text"
                  value={ft.id}
                  onChange={(e) => updateFeeType(i, { id: e.target.value.replace(/\s/g, "_").toLowerCase() })}
                  disabled={!isAdmin}
                  placeholder="id"
                  className="w-32 rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-[var(--color-bg-input)]"
                />
                <input
                  type="text"
                  value={ft.label}
                  onChange={(e) => updateFeeType(i, { label: e.target.value })}
                  disabled={!isAdmin}
                  placeholder="Label"
                  className="flex-1 rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-[var(--color-bg-input)]"
                />
                <div className="flex items-center gap-1">
                  <span className="text-sm text-content-secondary">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={ft.default_amount}
                    onChange={(e) => updateFeeType(i, { default_amount: parseFloat(e.target.value) || 0 })}
                    disabled={!isAdmin}
                    className="w-24 rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-[var(--color-bg-input)]"
                  />
                </div>
                {isAdmin && (
                  <button
                    onClick={() => removeFeeType(i)}
                    className="text-red-400 hover:text-red-300 text-sm"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {isAdmin && (
          <div className="flex gap-3">
            <button
              onClick={addFeeType}
              className="px-4 py-2 text-sm font-medium text-content-secondary bg-white/10 rounded-lg hover:bg-white/10"
            >
              Add Fee Type
            </button>
            <button
              onClick={handleSaveFeeTypes}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-brand-primary-dark disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Fee Types"}
            </button>
          </div>
        )}
      </div>

      {/* Chapter Settings */}
      <div className="bg-surface-card-solid rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-content-primary mb-1">Chapter Settings</h3>
        <p className="text-sm text-content-secondary mb-4">
          Operational configuration for your chapter.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">
              Default Dues Amount ($)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={settings.default_dues_amount ?? ""}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  default_dues_amount: parseFloat(e.target.value) || 0,
                }))
              }
              disabled={!isAdmin}
              className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-[var(--color-bg-input)]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">
              Fiscal Year Start Month
            </label>
            <select
              value={settings.fiscal_year_start_month ?? 1}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  fiscal_year_start_month: parseInt(e.target.value),
                }))
              }
              disabled={!isAdmin}
              className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-[var(--color-bg-input)]"
            >
              {["January", "February", "March", "April", "May", "June",
                "July", "August", "September", "October", "November", "December",
              ].map((month, i) => (
                <option key={i + 1} value={i + 1}>{month}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">
              Payment Deadline Day
            </label>
            <input
              type="number"
              min="1"
              max="28"
              value={settings.payment_deadline_day ?? ""}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  payment_deadline_day: parseInt(e.target.value) || undefined,
                }))
              }
              disabled={!isAdmin}
              placeholder="Day of month (1-28)"
              className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-[var(--color-bg-input)]"
            />
          </div>
          <div className="flex items-center">
            <label className="flex items-center gap-2 text-sm text-content-secondary">
              <input
                type="checkbox"
                checked={settings.allow_payment_plans ?? true}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    allow_payment_plans: e.target.checked,
                  }))
                }
                disabled={!isAdmin}
                className="rounded"
              />
              Allow Payment Plans
            </label>
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={handleSaveSettings}
            disabled={saving}
            className="mt-4 px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-brand-primary-dark disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
        )}
      </div>

      {/* Transfer Approvals — visible to presidents */}
      {ROLE_HIERARCHY[currentRole] >= ROLE_HIERARCHY["president"] && (
        <TransferApprovalsSection setError={setError} setSuccess={setSuccess} />
      )}
    </div>
  );
}

// ── Transfer Approvals Section ────────────────────────────────────────────────

function TransferApprovalsSection({
  setError,
  setSuccess,
}: {
  setError: (e: string | null) => void;
  setSuccess: (s: string | null) => void;
}) {
  const [transfers, setTransfers] = useState<ChapterTransferRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [denyId, setDenyId] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState("");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchChapterTransfers()
      .then((data) => setTransfers(data.filter((t) => t.status === "pending" || t.status === "approved_by_from")))
      .catch(() => setTransfers([]))
      .finally(() => setLoading(false));
  }, []);

  async function handleApprove(id: string) {
    setProcessing(true);
    try {
      const updated = await approveTransfer(id);
      if (updated.status === "approved") {
        setTransfers((prev) => prev.filter((t) => t.id !== id));
        setSuccess("Transfer approved. Member has been moved to the new chapter.");
      } else {
        setTransfers((prev) => prev.map((t) => (t.id === id ? updated : t)));
        setSuccess("Your approval recorded. Waiting for the other chapter president.");
      }
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } }).response?.data?.error || "Failed to approve transfer.";
      setError(message);
    } finally {
      setProcessing(false);
    }
  }

  async function handleDeny(id: string) {
    setProcessing(true);
    try {
      await denyTransfer(id, { reason: denyReason.trim() || undefined });
      setTransfers((prev) => prev.filter((t) => t.id !== id));
      setDenyId(null);
      setDenyReason("");
      setSuccess("Transfer request denied.");
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } }).response?.data?.error || "Failed to deny transfer.";
      setError(message);
    } finally {
      setProcessing(false);
    }
  }

  const STATUS_LABELS: Record<string, string> = {
    pending: "Pending both approvals",
    approved_by_from: "Approved by sending chapter",
  };

  return (
    <div className="bg-surface-card-solid rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-content-primary mb-1">Chapter Transfer Requests</h3>
      <p className="text-sm text-content-secondary mb-4">
        Pending transfer requests involving your chapter. Both chapter presidents must approve.
      </p>

      {loading ? (
        <p className="text-sm text-content-muted">Loading...</p>
      ) : transfers.length === 0 ? (
        <p className="text-sm text-content-muted">No pending transfer requests.</p>
      ) : (
        <div className="space-y-4">
          {transfers.map((t) => (
            <div key={t.id} className="border border-[var(--color-border)] rounded-lg p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-content-primary">{t.requesting_user_name}</p>
                  <p className="text-sm text-content-secondary mt-0.5">
                    {t.from_chapter_name} → {t.to_chapter_name}
                  </p>
                  {t.reason && (
                    <p className="text-sm text-content-secondary mt-1 italic">"{t.reason}"</p>
                  )}
                  <span className={`inline-block mt-2 text-xs font-medium px-2 py-0.5 rounded-full ${
                    t.status === "approved_by_from"
                      ? "bg-blue-900/30 text-blue-400"
                      : "bg-yellow-900/30 text-yellow-400"
                  }`}>
                    {STATUS_LABELS[t.status] ?? t.status}
                  </span>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => handleApprove(t.id)}
                    disabled={processing}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => setDenyId(t.id)}
                    disabled={processing}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    Deny
                  </button>
                </div>
              </div>

              {denyId === t.id && (
                <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
                  <label className="block text-sm font-medium text-content-secondary mb-1">
                    Reason for denial (optional)
                  </label>
                  <input
                    type="text"
                    value={denyReason}
                    onChange={(e) => setDenyReason(e.target.value)}
                    placeholder="e.g. Dues outstanding"
                    className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 mb-2"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDeny(t.id)}
                      disabled={processing}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
                    >
                      Confirm Denial
                    </button>
                    <button
                      onClick={() => { setDenyId(null); setDenyReason(""); }}
                      className="px-3 py-1.5 text-xs font-medium text-content-secondary bg-white/10 rounded-lg hover:bg-white/10"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Stripe Connect Section ────────────────────────────────────────────────────

function StripeConnectSection({
  currentRole,
  setError,
  setSuccess,
}: {
  currentRole: MemberRole;
  setError: (e: string | null) => void;
  setSuccess: (s: string | null) => void;
}) {
  const isTreasurer = ROLE_HIERARCHY[currentRole] >= ROLE_HIERARCHY["treasurer"];
  const isPresident = ROLE_HIERARCHY[currentRole] >= ROLE_HIERARCHY["president"];

  const [status, setStatus] = useState<StripeAccountStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    if (!isTreasurer) { setLoading(false); return; }
    getStripeAccountStatus()
      .then(setStatus)
      .catch(() => setError("Failed to load Stripe account status."))
      .finally(() => setLoading(false));
  }, [isTreasurer]);

  async function handleConnect() {
    setConnecting(true);
    setError(null);
    try {
      const url = await getStripeConnectUrl();
      window.location.href = url;
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error ?? "Failed to initiate Stripe connection.";
      setError(msg);
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("Disconnect Stripe? Members will no longer be able to pay online.")) return;
    setDisconnecting(true);
    setError(null);
    try {
      await disconnectStripe();
      setStatus({ connected: false });
      setSuccess("Stripe account disconnected.");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error ?? "Failed to disconnect Stripe.";
      setError(msg);
    } finally {
      setDisconnecting(false);
    }
  }

  if (!isTreasurer) {
    return (
      <div className="bg-surface-card-solid rounded-lg shadow p-6 text-content-secondary">
        You need Treasurer permissions or higher to manage payment settings.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-surface-card-solid rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-content-primary mb-1">Stripe Connect</h3>
        <p className="text-sm text-content-secondary mb-4">
          Connect your chapter's Stripe account to accept online dues payments and donations.
          Members pay directly — funds go straight to your chapter's bank account.
        </p>

        {loading ? (
          <div className="text-sm text-content-muted">Loading Stripe status...</div>
        ) : status?.connected ? (
          <div className="space-y-4">
            {/* Connected status */}
            <div className="flex items-center gap-3 p-4 bg-emerald-900/20 rounded-lg">
              <div className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />
              <div className="flex-1">
                <div className="font-medium text-emerald-400 text-sm">
                  {status.display_name ?? "Stripe account"} connected
                </div>
                <div className="flex gap-4 mt-1">
                  <span className={`text-xs ${status.charges_enabled ? "text-green-400" : "text-yellow-400"}`}>
                    {status.charges_enabled ? "✓ Charges enabled" : "⚠ Charges not yet enabled"}
                  </span>
                  <span className={`text-xs ${status.payouts_enabled ? "text-green-400" : "text-yellow-400"}`}>
                    {status.payouts_enabled ? "✓ Payouts enabled" : "⚠ Payouts not yet enabled"}
                  </span>
                </div>
              </div>
              <span className="text-xs text-content-muted font-mono">{status.stripe_account_id}</span>
            </div>

            {!status.charges_enabled && (
              <div className="p-3 bg-yellow-900/20 text-yellow-400 text-sm rounded-lg">
                Your Stripe account needs additional verification before charges are enabled.
                Log into your Stripe Dashboard to complete onboarding.
              </div>
            )}

            {isPresident && (
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="px-4 py-2 text-sm font-medium text-red-400 bg-red-900/20 rounded-lg hover:bg-red-900/30 disabled:opacity-50"
              >
                {disconnecting ? "Disconnecting..." : "Disconnect Stripe"}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-white/5 rounded-lg">
              <div className="w-2.5 h-2.5 rounded-full bg-gray-400 flex-shrink-0" />
              <span className="text-sm text-content-secondary">No Stripe account connected</span>
            </div>
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-brand-primary-dark disabled:opacity-50"
            >
              {connecting ? "Redirecting to Stripe..." : "Connect Stripe Account"}
            </button>
            <p className="text-xs text-content-muted">
              You'll be redirected to Stripe to authorize the connection. You can connect an existing
              Stripe account or create a new one.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Branding Tab ─────────────────────────────────────────────────────────────

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

function BrandingTab({
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
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to delete favicon");
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
          branding: brandingConfig,
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
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to save branding");
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
          Select your organization to auto-fill official brand colors. You can customize them after applying.
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
