import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { useAuthStore } from "@/stores/authStore";
import { useConfigStore } from "@/stores/configStore";
import {
  fetchMembers,
  updateMember,
  deactivateMember,
} from "@/services/chapterService";
import type {
  MemberWithUser,
  MemberRole,
  FinancialStatus,
  MemberType,
  CustomFieldDefinition,
} from "@/types";
import { Edit2, UserX } from "lucide-react";

const ROLE_COLORS: Record<MemberRole, string> = {
  admin: "bg-red-900/30 text-red-400",
  president: "bg-purple-900/30 text-purple-400",
  vice_president: "bg-brand-primary-light text-brand-primary-dark",
  treasurer: "bg-blue-900/30 text-blue-400",
  secretary: "bg-teal-900/30 text-teal-400",
  member: "bg-gray-800/50 text-content-muted",
};

const FINANCIAL_LABELS: Record<FinancialStatus, string> = {
  financial: "Financial",
  not_financial: "Not Financial",
  neophyte: "Neophyte",
  exempt: "Exempt",
};

const FINANCIAL_COLORS: Record<FinancialStatus, string> = {
  financial: "bg-green-900/30 text-green-400",
  not_financial: "bg-red-900/30 text-red-400",
  neophyte: "bg-yellow-900/30 text-yellow-400",
  exempt: "bg-gray-800/50 text-content-muted",
};

const ROLE_HIERARCHY: Record<MemberRole, number> = {
  member: 0,
  secretary: 1,
  treasurer: 2,
  vice_president: 3,
  president: 4,
  admin: 5,
};

const MEMBER_TYPE_LABELS: Record<MemberType, string> = {
  collegiate: "Collegiate",
  graduate: "Graduate",
  life: "Life Member",
};

const MEMBER_TYPE_COLORS: Record<MemberType, string> = {
  collegiate: "bg-sky-900/30 text-sky-400",
  graduate: "bg-amber-900/30 text-amber-400",
  life: "bg-emerald-900/30 text-emerald-400",
};

export default function Members() {
  const { memberships, user } = useAuthStore();
  const { getRoleLabel, getCustomFields } = useConfigStore();
  const customFieldDefs: CustomFieldDefinition[] = getCustomFields();
  const [members, setMembers] = useState<MemberWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit modal state
  const [editingMember, setEditingMember] = useState<MemberWithUser | null>(null);
  const [editRole, setEditRole] = useState<MemberRole>("member");
  const [editFinancial, setEditFinancial] = useState<FinancialStatus>("not_financial");
  const [editMemberType, setEditMemberType] = useState<MemberType>("collegiate");
  const [editIntakeOfficer, setEditIntakeOfficer] = useState(false);
  const [editCustomFields, setEditCustomFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Current user's role in this chapter
  const currentMembership = memberships.find(
    (m) => m.chapter_id === user?.active_chapter_id
  );
  const currentRole = currentMembership?.role ?? "member";
  const canManage = ROLE_HIERARCHY[currentRole] >= ROLE_HIERARCHY["president"];

  useEffect(() => {
    loadMembers();
  }, []);

  async function loadMembers() {
    try {
      setLoading(true);
      const data = await fetchMembers();
      setMembers(data);
    } catch {
      setError("Failed to load members.");
    } finally {
      setLoading(false);
    }
  }

  function openEdit(member: MemberWithUser) {
    setEditingMember(member);
    setEditRole(member.role);
    setEditFinancial(member.financial_status);
    setEditMemberType(member.member_type ?? "collegiate");
    setEditIntakeOfficer(member.is_intake_officer ?? false);
    // Pre-populate custom fields from existing membership data
    const existing: Record<string, string> = {};
    for (const def of customFieldDefs) {
      const val = member.custom_fields?.[def.key];
      existing[def.key] = val != null ? String(val) : "";
    }
    setEditCustomFields(existing);
  }

  async function handleSave() {
    if (!editingMember) return;
    setSaving(true);
    try {
      const updated = await updateMember(editingMember.id, {
        role: editRole,
        financial_status: editFinancial,
        member_type: editMemberType,
        is_intake_officer: editIntakeOfficer,
        custom_fields: editCustomFields,
      });
      setMembers((prev) =>
        prev.map((m) => (m.id === updated.id ? updated : m))
      );
      setEditingMember(null);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error || "Failed to update member.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(member: MemberWithUser) {
    if (!confirm(`Deactivate ${member.user.full_name}? They will be removed from the roster.`)) {
      return;
    }
    try {
      await deactivateMember(member.id);
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error || "Failed to deactivate member.";
      setError(message);
    }
  }

  // Roles the current user can assign (up to their own level)
  const assignableRoles = (Object.keys(ROLE_HIERARCHY) as MemberRole[]).filter(
    (r) => ROLE_HIERARCHY[r] <= ROLE_HIERARCHY[currentRole] && r !== "admin"
  );

  return (
    <Layout>
      <div className="max-w-6xl mx-auto animate-fade-in">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-heading font-extrabold text-content-primary tracking-tight">Members Directory</h2>
            <p className="text-content-secondary mt-1">Manage your chapter's roster and roles.</p>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-900/20 border-l-4 border-red-500 text-red-400 rounded-lg text-sm font-medium animate-fade-in flex justify-between items-center shadow-glass">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300 text-lg font-bold px-2">
              &times;
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="w-8 h-8 border-4 border-brand-primary-light border-t-brand-primary-main rounded-full animate-spin"></div>
          </div>
        ) : members.length === 0 ? (
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-glass border border-white/40 p-12 text-center">
            <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-content-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
            </div>
            <h3 className="text-lg font-medium text-content-primary mb-1">No Members Yet</h3>
            <p className="text-sm text-content-secondary">Go to Invites to add members to your chapter.</p>
          </div>
        ) : (
          <>
            {/* ── Mobile card list ─────────────────────────────── */}
            <div className="md:hidden space-y-3">
              {members.map((member) => (
                <div key={member.id} className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-glass border border-[var(--color-border)] p-4">
                  <div className="flex items-center gap-3">
                    {member.user.profile_picture_url ? (
                      <img
                        src={member.user.profile_picture_url}
                        alt={member.user.full_name}
                        className="h-11 w-11 rounded-full object-cover shadow-soft border border-white/40 shrink-0"
                      />
                    ) : (
                      <div className="h-11 w-11 rounded-full bg-gradient-to-br from-brand-primary-light to-brand-primary-main flex items-center justify-center text-white font-bold shadow-soft border border-white/40 shrink-0">
                        {member.user.full_name.charAt(0)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-content-primary truncate">{member.user.full_name}</p>
                        {member.user_id === user?.id && (
                          <span className="text-xs text-brand-primary-main/60 bg-brand-primary-50 px-2 py-0.5 rounded-md font-semibold shrink-0">You</span>
                        )}
                      </div>
                      <p className="text-xs text-content-secondary truncate">{member.user.email}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${ROLE_COLORS[member.role]}`}>
                      {getRoleLabel(member.role)}
                    </span>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${FINANCIAL_COLORS[member.financial_status]}`}>
                      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${FINANCIAL_COLORS[member.financial_status].replace("text-", "bg-").split(" ")[1]}`}></span>
                      {FINANCIAL_LABELS[member.financial_status]}
                    </span>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${MEMBER_TYPE_COLORS[member.member_type ?? "collegiate"]}`}>
                      {MEMBER_TYPE_LABELS[member.member_type ?? "collegiate"]}
                    </span>
                    {member.join_date && (
                      <span className="text-xs text-content-secondary flex items-center">
                        Joined {new Date(member.join_date).toLocaleDateString(undefined, { year: 'numeric', month: 'short' })}
                      </span>
                    )}
                  </div>
                  {customFieldDefs.some((f) => member.custom_fields?.[f.key]) && (
                    <div className="mt-2 space-y-0.5">
                      {customFieldDefs.filter((f) => member.custom_fields?.[f.key]).map((f) => (
                        <p key={f.key} className="text-xs text-content-secondary">
                          <span className="font-medium text-content-secondary">{f.label}:</span> {String(member.custom_fields[f.key])}
                        </p>
                      ))}
                    </div>
                  )}
                  {canManage && member.user_id !== user?.id && (
                    <div className="mt-3 flex gap-2 pt-3 border-t border-[var(--color-border)]">
                      <button
                        onClick={() => openEdit(member)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 text-brand-primary-main bg-brand-primary-50 hover:bg-brand-primary-100 py-2 rounded-lg transition-colors text-xs font-medium border border-brand-primary-200/50"
                      >
                        <Edit2 className="w-3.5 h-3.5" /> Edit
                      </button>
                      <button
                        onClick={() => handleDeactivate(member)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 text-red-400 bg-red-900/20 hover:bg-red-900/30 py-2 rounded-lg transition-colors text-xs font-medium border border-red-200/50"
                      >
                        <UserX className="w-3.5 h-3.5" /> Remove
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>


            {/* ── Desktop table ─────────────────────────────────── */}
            <div className="hidden md:block bg-white/90 backdrop-blur-xl rounded-2xl shadow-glass border border-[var(--color-border)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-white/5">
                  <thead className="bg-white/5 backdrop-blur-sm">
                    <tr>
                      <th scope="col" className="px-6 py-5 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider">Member</th>
                      <th scope="col" className="px-6 py-5 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider">Role</th>
                      <th scope="col" className="px-6 py-5 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider">Financial Status</th>
                      <th scope="col" className="px-6 py-5 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider">Type</th>
                      <th scope="col" className="px-6 py-5 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider">Joined</th>
                      {canManage && (
                        <th scope="col" className="px-6 py-5 text-right text-xs font-semibold text-content-secondary uppercase tracking-wider">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="bg-surface-card-solid divide-y divide-white/5">
                    {members.map((member) => (
                      <tr key={member.id} className="hover:bg-brand-primary-50/30 transition-colors group">
                        <td className="px-6 py-5 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10">
                              {member.user.profile_picture_url ? (
                                <img
                                  src={member.user.profile_picture_url}
                                  alt={member.user.full_name}
                                  className="h-10 w-10 rounded-full object-cover shadow-soft border border-white/40"
                                />
                              ) : (
                                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-brand-primary-light to-brand-primary-main flex items-center justify-center text-white font-bold shadow-soft border border-white/40">
                                  {member.user.full_name.charAt(0)}
                                </div>
                              )}
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-semibold text-content-primary group-hover:text-brand-primary-dark transition-colors">
                                {member.user.full_name}
                              </div>
                              <div className="text-sm text-content-secondary">{member.user.email}</div>
                              {customFieldDefs.filter((f) => member.custom_fields?.[f.key]).map((f) => (
                                <div key={f.key} className="text-xs text-content-muted">
                                  <span className="font-medium">{f.label}:</span> {String(member.custom_fields[f.key])}
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${ROLE_COLORS[member.role].replace("bg-", "bg-opacity-20 bg-").replace("text-", "text-").replace("100", "50")} border-current/20`}>
                            {getRoleLabel(member.role)}
                          </span>
                        </td>
                        <td className="px-6 py-5 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${FINANCIAL_COLORS[member.financial_status].replace("bg-", "bg-opacity-20 bg-").replace("text-", "text-").replace("100", "50")} border-current/20`}>
                            <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${FINANCIAL_COLORS[member.financial_status].replace("text-", "bg-").split(" ")[1]}`}></span>
                            {FINANCIAL_LABELS[member.financial_status]}
                          </span>
                        </td>
                        <td className="px-6 py-5 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${MEMBER_TYPE_COLORS[member.member_type ?? "collegiate"]}`}>
                            {MEMBER_TYPE_LABELS[member.member_type ?? "collegiate"]}
                          </span>
                        </td>
                        <td className="px-6 py-5 whitespace-nowrap text-sm text-content-secondary font-medium">
                          {member.join_date
                            ? new Date(member.join_date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
                            : "—"}
                        </td>
                        {canManage && (
                          <td className="px-6 py-5 whitespace-nowrap text-right text-sm font-medium">
                            {member.user_id !== user?.id ? (
                              <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => openEdit(member)}
                                  className="inline-flex items-center justify-center text-brand-primary-main hover:text-brand-primary-dark bg-brand-primary-50 hover:bg-brand-primary-100 p-2 rounded-lg transition-colors border border-brand-primary-200/50"
                                  title="Edit Role"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeactivate(member)}
                                  className="inline-flex items-center justify-center text-red-400 hover:text-red-300 bg-red-900/20 hover:bg-red-900/30 p-2 rounded-lg transition-colors border border-red-200/50"
                                  title="Remove Member"
                                >
                                  <UserX className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-brand-primary-main/60 bg-brand-primary-50 px-3 py-1.5 rounded-md font-semibold">You</span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Premium Edit Modal */}
        {editingMember && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-primary-950/40 backdrop-blur-sm animate-fade-in">
            <div className="bg-surface-card-solid rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform animate-slide-up flex flex-col max-h-[90vh]">
              <div className="px-6 py-5 border-b border-[var(--color-border)] bg-white/5 flex justify-between items-center">
                <h3 className="text-lg font-heading font-semibold text-content-primary">
                  Edit Role & Status
                </h3>
                <button onClick={() => setEditingMember(null)} className="text-content-muted hover:text-content-secondary">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
              </div>

              <div className="p-6 space-y-5 overflow-y-auto flex-1">
                <div className="flex items-center mb-6">
                  {editingMember.user.profile_picture_url ? (
                    <img
                      src={editingMember.user.profile_picture_url}
                      alt={editingMember.user.full_name}
                      className="h-12 w-12 rounded-full object-cover shadow-glass"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-gradient-to-br from-brand-primary-light to-brand-primary-main flex items-center justify-center text-white font-bold text-lg shadow-glass">
                      {editingMember.user.full_name.charAt(0)}
                    </div>
                  )}
                  <div className="ml-4">
                    <p className="text-sm font-semibold text-content-primary">{editingMember.user.full_name}</p>
                    <p className="text-xs text-content-secondary">{editingMember.user.email}</p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1.5">
                    Assigned Role
                  </label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as MemberRole)}
                    className="w-full rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-sm bg-[var(--color-bg-input)] focus:bg-[var(--color-bg-input)] focus:outline-none focus:ring-2 focus:ring-brand-primary-main transition-colors"
                  >
                    {assignableRoles.map((role) => (
                      <option key={role} value={role}>
                        {getRoleLabel(role)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1.5">
                    Member Type
                  </label>
                  <select
                    value={editMemberType}
                    onChange={(e) => setEditMemberType(e.target.value as MemberType)}
                    className="w-full rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-sm bg-[var(--color-bg-input)] focus:bg-[var(--color-bg-input)] focus:outline-none focus:ring-2 focus:ring-brand-primary-main transition-colors"
                  >
                    {(Object.keys(MEMBER_TYPE_LABELS) as MemberType[]).map((type) => (
                      <option key={type} value={type}>
                        {MEMBER_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </select>
                  {editMemberType === "life" && (
                    <p className="mt-1.5 text-xs text-emerald-400 font-medium">
                      Life members are permanently exempt from dues.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1.5">
                    Financial Status
                  </label>
                  <select
                    value={editFinancial}
                    onChange={(e) =>
                      setEditFinancial(e.target.value as FinancialStatus)
                    }
                    disabled={editMemberType === "life"}
                    className="w-full rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-sm bg-[var(--color-bg-input)] focus:bg-[var(--color-bg-input)] focus:outline-none focus:ring-2 focus:ring-brand-primary-main transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {(
                      Object.keys(FINANCIAL_LABELS) as FinancialStatus[]
                    ).map((status) => (
                      <option key={status} value={status}>
                        {FINANCIAL_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-[var(--color-border)]">
                  <div>
                    <p className="text-sm font-medium text-content-secondary">Intake Officer</p>
                    <p className="text-xs text-content-secondary mt-0.5">Can access the MIP intake pipeline</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditIntakeOfficer((v) => !v)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${editIntakeOfficer ? "bg-brand-primary-main" : "bg-white/10"}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${editIntakeOfficer ? "translate-x-6" : "translate-x-1"}`} />
                  </button>
                </div>

                {customFieldDefs.length > 0 && (
                  <div className="border-t border-[var(--color-border)] pt-4 space-y-4">
                    <p className="text-xs font-semibold text-content-secondary uppercase tracking-wider">Custom Fields</p>
                    {customFieldDefs.map((field) => (
                      <div key={field.key}>
                        <label className="block text-sm font-medium text-content-secondary mb-1.5">
                          {field.label}{field.required && <span className="text-red-500 ml-0.5">*</span>}
                        </label>
                        <input
                          type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                          value={editCustomFields[field.key] ?? ""}
                          onChange={(e) => setEditCustomFields((prev) => ({ ...prev, [field.key]: e.target.value }))}
                          className="w-full rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-sm bg-[var(--color-bg-input)] focus:bg-[var(--color-bg-input)] focus:outline-none focus:ring-2 focus:ring-brand-primary-main transition-colors"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="px-6 py-4 bg-white/5 border-t border-[var(--color-border)] flex justify-end gap-3">
                <button
                  onClick={() => setEditingMember(null)}
                  className="px-5 py-2.5 text-sm font-medium text-content-secondary bg-surface-card-solid border border-[var(--color-border-brand)] rounded-xl hover:bg-white/5 shadow-glass transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-5 py-2.5 text-sm font-medium text-white bg-brand-primary-main rounded-xl hover:bg-brand-primary-dark shadow-glass transition-colors disabled:opacity-50 flex items-center justify-center min-w-[120px]"
                >
                  {saving ? (
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
