import { useEffect, useState } from "react";
import ImageUpload from "@/components/ImageUpload";
import { useAuthStore } from "@/stores/authStore";
import { useConfigStore } from "@/stores/configStore";
import { updateMember } from "@/services/chapterService";
import {
  uploadProfilePicture,
  deleteProfilePicture,
} from "@/services/fileService";
import {
  fetchMyTransfers,
  fetchAvailableChapters,
  createTransferRequest,
  type AvailableChapter,
} from "@/services/transferService";
import api from "@/lib/api";
import { useTour } from "@/tours/useTour";
import type { MemberRole, CustomFieldDefinition, ChapterTransferRequest } from "@/types";
import { ROLE_HIERARCHY } from "./shared";
import DeleteAccountSection from "./DeleteAccountSection";

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

export default function ProfileTab({
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
  const { replay } = useTour();

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
              <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} required
                className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">Last Name</label>
              <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} required
                className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">Email Address</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary" />
          </div>
          <button type="submit" disabled={savingProfile}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-brand-primary-dark disabled:opacity-50">
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
            <input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} required autoComplete="current-password"
              className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary" />
          </div>
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">New Password</label>
            <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} required minLength={12} autoComplete="new-password"
              className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary" />
          </div>
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">Confirm New Password</label>
            <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} required autoComplete="new-password"
              className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary" />
          </div>
          <button type="submit" disabled={savingPw}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-brand-primary-dark disabled:opacity-50">
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
            <button type="submit" disabled={savingCustomFields}
              className="px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-brand-primary-dark disabled:opacity-50">
              {savingCustomFields ? "Saving..." : "Save Chapter Profile"}
            </button>
          </form>
        </div>
      )}

      {/* Chapter Transfer — hide for presidents */}
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
                <select value={toChapterId} onChange={(e) => setToChapterId(e.target.value)} required
                  className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary">
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
                <textarea value={transferReason} onChange={(e) => setTransferReason(e.target.value)} rows={3}
                  placeholder="Why are you transferring? (e.g., relocating for work)"
                  className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary resize-none" />
              </div>
              <button type="submit" disabled={submittingTransfer || !toChapterId}
                className="px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-brand-primary-dark disabled:opacity-50">
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

      <div>
        <button
          type="button"
          onClick={replay}
          className="text-[11px] font-semibold uppercase tracking-[0.1em] text-content-muted hover:text-content-primary underline"
        >
          Replay onboarding tours
        </button>
      </div>

      <DeleteAccountSection setError={setError} />
    </div>
  );
}
