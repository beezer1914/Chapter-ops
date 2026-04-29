import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Layout from "@/components/Layout";
import { useRegionStore } from "@/stores/regionStore";
import {
  updateRegion,
  reassignChapter,
  assignRegionMember,
  updateRegionMember,
  removeRegionMember,
  searchEligibleUsers,
  searchDirectory,
  fetchDirectoryMemberDetail,
  fetchRegionDashboard,
} from "@/services/regionService";
import {
  fetchRegionalInvoices,
  createRegionalInvoice,
  bulkCreateRegionalInvoices,
  updateRegionalInvoice,
} from "@/services/invoiceService";
import RegionDashboardTab from "@/components/RegionDashboardTab";
import type {
  RegionWithStats,
  RegionDetail,
  ChapterWithMemberCount,
  RegionMembershipWithUser,
  RegionRole,
  MemberUser,
  OrgDirectoryMember,
  OrgDirectoryChapter,
  OrgDirectoryMemberDetail,
  InvoiceWithChapter,
  RegionDashboardPayload,
} from "@/types";

const REGION_ROLE_LABELS: Record<RegionRole, string> = {
  regional_director: "Regional Director",
  regional_1st_vice: "Regional 1st Vice",
  regional_2nd_vice: "Regional 2nd Vice",
  regional_secretary: "Regional Secretary",
  regional_treasurer: "Regional Treasurer",
  member: "Member",
};

const REGION_ROLE_COLORS: Record<RegionRole, string> = {
  regional_director: "bg-amber-900/30 text-amber-400",
  regional_1st_vice: "bg-orange-900/30 text-orange-400",
  regional_2nd_vice: "bg-yellow-900/30 text-yellow-400",
  regional_secretary: "bg-blue-900/30 text-blue-400",
  regional_treasurer: "bg-green-900/30 text-green-400",
  member: "bg-gray-800/50 text-gray-400",
};

export default function Regions() {
  const {
    regions,
    selectedRegion,
    isOrgAdmin,
    loading,
    error,
    loadRegions,
    loadRegionDetail,
    clearSelectedRegion,
    clearError,
  } = useRegionStore();

  const [activeTab, setActiveTab] = useState<"regions" | "directory">("regions");

  useEffect(() => {
    // Clear any stale selection carried over from a prior chapter/org session.
    // The regionStore is module-global, so selectedRegion survives unmount;
    // without this clear, a user who selected a region under Org A and then
    // switched active chapter to Org B would see Org A's region detail on
    // first render of this page.
    clearSelectedRegion();
    loadRegions();
  }, [loadRegions, clearSelectedRegion]);

  if (selectedRegion) {
    return (
      <Layout>
        <RegionDetailView
          detail={selectedRegion}
          isOrgAdmin={isOrgAdmin}
          allRegions={regions}
          onBack={() => {
            clearSelectedRegion();
            loadRegions();
          }}
          onRefresh={() => loadRegionDetail(selectedRegion.region.id)}
        />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-content-primary">Regions</h1>
          <p className="text-sm text-content-secondary mt-1">
            {isOrgAdmin
              ? "Manage regions, chapters, and regional officers."
              : "Browse your organization's regions and search across chapters."}
          </p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-[var(--color-border)]">
          {(["regions", "directory"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-brand-primary text-brand-primary-dark"
                  : "border-transparent text-content-secondary hover:text-content-secondary"
              }`}
            >
              {tab === "directory" ? "Directory" : "Regions"}
            </button>
          ))}
        </div>

        {error && (
          <div className="p-3 bg-red-900/20 border border-red-900/30 text-red-400 rounded-md text-sm flex justify-between">
            {error}
            <button onClick={clearError} className="text-red-400 hover:text-red-300 font-medium">
              Dismiss
            </button>
          </div>
        )}

        {activeTab === "directory" ? (
          <DirectoryView />
        ) : loading ? (
          <p className="text-content-secondary text-sm py-8 text-center">Loading regions...</p>
        ) : regions.length === 0 ? (
          <div className="bg-surface-card-solid rounded-lg shadow p-8 text-center">
            <p className="text-content-secondary">No regions found for your organization.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {regions.map((region) => (
              <RegionCard
                key={region.id}
                region={region}
                onClick={() => loadRegionDetail(region.id)}
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

// ── Region Card ─────────────────────────────────────────────────────────

function RegionCard({
  region,
  onClick,
}: {
  region: RegionWithStats;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-surface-card-solid rounded-lg shadow p-5 text-left hover:shadow-glass hover:border-brand-primary border border-[var(--color-border)] transition w-full"
    >
      <h3 className="font-semibold text-content-primary text-lg">{region.name}</h3>
      {region.abbreviation && (
        <p className="text-sm text-content-secondary">{region.abbreviation}</p>
      )}
      {region.description && (
        <p className="text-sm text-content-secondary mt-1 line-clamp-2">{region.description}</p>
      )}
      <div className="mt-3 flex gap-4 text-sm text-content-secondary">
        <span>{region.chapter_count} chapter{region.chapter_count !== 1 ? "s" : ""}</span>
        <span>{region.member_count} officer{region.member_count !== 1 ? "s" : ""}</span>
      </div>
    </button>
  );
}

// ── Directory View ──────────────────────────────────────────────────────

function DirectoryView() {
  const [query, setQuery] = useState("");
  const [chapters, setChapters] = useState<OrgDirectoryChapter[]>([]);
  const [members, setMembers] = useState<OrgDirectoryMember[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedMember, setSelectedMember] = useState<{ userId: string; chapterId: string } | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const result = await searchDirectory(query);
        setChapters(result.chapters);
        setMembers(result.members);
      } catch {
        // silently ignore
      } finally {
        setLoading(false);
      }
    }, 300);
  }, [query]);

  return (
    <div className="space-y-6">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search chapters or members across your organization…"
        className="w-full border border-[var(--color-border-brand)] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
      />

      {loading && <p className="text-sm text-content-muted text-center py-4">Searching…</p>}

      {!loading && chapters.length === 0 && members.length === 0 && (
        <p className="text-sm text-content-secondary text-center py-8">
          {query ? "No results found." : "Start typing to search chapters and members."}
        </p>
      )}

      {chapters.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-content-secondary uppercase tracking-wide mb-3">
            Chapters ({chapters.length})
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {chapters.map((ch) => (
              <div key={ch.id} className="bg-surface-card-solid rounded-lg shadow border border-[var(--color-border)] p-4">
                <p className="font-semibold text-content-primary">{ch.name}</p>
                {ch.abbreviation && <p className="text-xs text-content-secondary">{ch.abbreviation}</p>}
                <p className="text-sm text-content-secondary mt-1">{ch.member_count} member{ch.member_count !== 1 ? "s" : ""}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {members.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-content-secondary uppercase tracking-wide mb-3">
            Members ({members.length})
          </h3>
          <div className="bg-surface-card-solid rounded-lg shadow border border-[var(--color-border)] divide-y divide-white/5">
            {members.map((m) => (
              <button
                key={`${m.id}-${m.chapter_id}`}
                onClick={() => setSelectedMember({ userId: m.id, chapterId: m.chapter_id })}
                className="flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-white/5 transition-colors"
              >
                {m.profile_picture_url ? (
                  <img src={m.profile_picture_url} alt={m.full_name} className="w-9 h-9 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-brand-primary flex items-center justify-center text-white text-sm font-semibold shrink-0">
                    {m.first_name[0]}{m.last_name[0]}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-brand-primary-dark hover:underline truncate">{m.full_name}</p>
                  <p className="text-xs text-content-secondary truncate">{m.chapter_name} · <span className="capitalize">{m.role.replace("_", " ")}</span></p>
                </div>
                <svg className="w-4 h-4 text-content-muted shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedMember && (
        <MemberDetailModal
          userId={selectedMember.userId}
          chapterId={selectedMember.chapterId}
          onClose={() => setSelectedMember(null)}
        />
      )}
    </div>
  );
}

// ── Member Detail Modal ─────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  member: "Member",
  secretary: "Secretary",
  treasurer: "Treasurer",
  vice_president: "Vice President",
  president: "President",
  admin: "Admin",
};

const FINANCIAL_STATUS_STYLES: Record<string, string> = {
  financial: "bg-green-900/30 text-green-400",
  not_financial: "bg-red-900/30 text-red-400",
  neophyte: "bg-purple-900/30 text-purple-400",
  exempt: "bg-gray-800/50 text-gray-400",
};

function MemberDetailModal({
  userId,
  chapterId,
  onClose,
}: {
  userId: string;
  chapterId: string;
  onClose: () => void;
}) {
  const [member, setMember] = useState<OrgDirectoryMemberDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchDirectoryMemberDetail(userId, chapterId)
      .then((data) => {
        if (!cancelled) setMember(data);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load member details.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [userId, chapterId]);

  function formatDate(iso: string | null) {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-surface-card-solid rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div className="p-8 text-center text-content-secondary text-sm">Loading member details...</div>
        ) : error ? (
          <div className="p-8 text-center">
            <p className="text-red-400 text-sm">{error}</p>
            <button onClick={onClose} className="mt-4 text-sm text-content-secondary hover:text-content-secondary">Close</button>
          </div>
        ) : member ? (
          <>
            {/* Header */}
            <div className="p-6 pb-4 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-4">
                {member.profile_picture_url ? (
                  <img
                    src={member.profile_picture_url}
                    alt={member.full_name}
                    className="w-16 h-16 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-brand-primary flex items-center justify-center text-white text-xl font-semibold shrink-0">
                    {member.first_name[0]}{member.last_name[0]}
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-content-primary truncate">{member.full_name}</h3>
                  <p className="text-sm text-content-secondary truncate">{member.chapter_name}</p>
                  {member.chapter_designation && (
                    <p className="text-xs text-content-muted">{member.chapter_designation}</p>
                  )}
                </div>
              </div>

              <div className="flex gap-2 mt-3">
                <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-900/30 text-blue-400 capitalize">
                  {ROLE_LABELS[member.role] || member.role.replace("_", " ")}
                </span>
                <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${FINANCIAL_STATUS_STYLES[member.financial_status] || "bg-gray-800/50 text-gray-400"}`}>
                  {member.financial_status.replace("_", " ")}
                </span>
              </div>
            </div>

            {/* Details */}
            <div className="p-6 space-y-4">
              <DetailRow label="Email" value={member.email} />
              {member.phone && <DetailRow label="Phone" value={member.phone} />}
              {(member.chapter_city || member.chapter_state) && (
                <DetailRow
                  label="Chapter Location"
                  value={[member.chapter_city, member.chapter_state].filter(Boolean).join(", ")}
                />
              )}
              {member.join_date && (
                <DetailRow label="Join Date" value={formatDate(member.join_date)} />
              )}
              {member.initiation_date && (
                <DetailRow label="Initiation Date" value={formatDate(member.initiation_date)} />
              )}
              {member.created_at && (
                <DetailRow label="Account Created" value={formatDate(member.created_at)} />
              )}

              {/* Custom fields */}
              {Object.keys(member.custom_fields).length > 0 && (
                <div className="pt-3 border-t border-[var(--color-border)]">
                  <h4 className="text-xs font-semibold text-content-secondary uppercase tracking-wide mb-2">Additional Info</h4>
                  {Object.entries(member.custom_fields).map(([key, value]) => {
                    const def = member.custom_field_definitions.find((d) => d.key === key);
                    const label = def?.label || key.replace(/_/g, " ");
                    return <DetailRow key={key} label={label} value={String(value ?? "—")} />;
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 pb-6">
              <button
                onClick={onClose}
                className="w-full px-4 py-2 text-sm text-content-secondary border border-[var(--color-border-brand)] rounded-md hover:bg-white/5"
              >
                Close
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs text-content-secondary capitalize">{label}</dt>
      <dd className="text-sm text-content-primary mt-0.5">{value}</dd>
    </div>
  );
}

// ── Region Detail View ──────────────────────────────────────────────────

function RegionDetailView({
  detail,
  isOrgAdmin,
  allRegions,
  onBack,
  onRefresh,
}: {
  detail: RegionDetail;
  isOrgAdmin: boolean;
  allRegions: RegionWithStats[];
  onBack: () => void;
  onRefresh: () => void;
}) {
  // Use the current user's role in THIS region (not a global flag)
  const userRole = detail.current_user_region_role;
  const isAdmin = detail.is_org_admin || isOrgAdmin;
  const isDirector = userRole === "regional_director";
  const isTreasurer = userRole === "regional_treasurer";
  const isRegionalOfficer = isDirector || userRole === "regional_1st_vice" || isTreasurer;

  const canEdit = isAdmin || isDirector;
  const canManageChapters = isAdmin;
  const canManageOfficers = isAdmin;
  const canManageInvoices = isAdmin || isDirector || isTreasurer;
  const canViewInvoices = isAdmin || isRegionalOfficer;

  const { regionsWithDashboardAccess } = useRegionStore();
  const hasDashboardAccess = regionsWithDashboardAccess.includes(detail.region.id);

  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") === "manage" ? "manage" : "dashboard";

  const [dashboardPayload, setDashboardPayload] = useState<RegionDashboardPayload | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasDashboardAccess || activeTab !== "dashboard") return;
    setDashboardError(null);
    fetchRegionDashboard(detail.region.id)
      .then(setDashboardPayload)
      .catch((err: { response?: { status?: number } }) => {
        if (err?.response?.status === 403) {
          // Defensive — sidebar should never link here for users without access,
          // but if it does (role removed mid-session), bounce them home with a
          // notice. This codebase has no toast library, so we use window.alert.
          window.alert("You don't have access to that region.");
          window.location.assign("/dashboard");
          return;
        }
        setDashboardError("Failed to load dashboard.");
      });
  }, [hasDashboardAccess, activeTab, detail.region.id]);

  const manageSections = (
    <>
      <RegionInfoSection detail={detail} canEdit={canEdit} onUpdated={onRefresh} />
      <ChaptersSection
        chapters={detail.chapters}
        currentRegionId={detail.region.id}
        isOrgAdmin={canManageChapters}
        allRegions={allRegions}
        onRefresh={onRefresh}
      />
      <RegionalOfficersSection detail={detail} isOrgAdmin={canManageOfficers} onUpdated={onRefresh} />
      {canViewInvoices && (
        <RegionalInvoicesSection
          regionId={detail.region.id}
          chapters={detail.chapters}
          canManage={canManageInvoices}
        />
      )}
    </>
  );

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="text-sm text-brand-primary hover:underline font-medium flex items-center gap-1"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Back to Regions
      </button>

      {hasDashboardAccess ? (
        <>
          <div className="flex gap-1 border-b border-[var(--color-border)]">
            {(["dashboard", "manage"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setSearchParams({ tab })}
                className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
                  activeTab === tab
                    ? "border-brand-primary text-brand-primary-dark"
                    : "border-transparent text-content-secondary hover:text-content-secondary"
                }`}
              >
                {tab === "dashboard" ? "Dashboard" : "Manage"}
              </button>
            ))}
          </div>

          {activeTab === "dashboard" ? (
            dashboardError ? (
              <div className="p-3 bg-red-900/20 border border-red-900/30 text-red-400 rounded-md text-sm flex justify-between items-center">
                {dashboardError}
                <button
                  onClick={() => {
                    setDashboardError(null);
                    fetchRegionDashboard(detail.region.id)
                      .then(setDashboardPayload)
                      .catch(() => setDashboardError("Failed to load dashboard."));
                  }}
                  className="underline"
                >
                  Retry
                </button>
              </div>
            ) : !dashboardPayload ? (
              <p className="text-sm text-content-muted py-8 text-center">Loading dashboard...</p>
            ) : (
              <RegionDashboardTab payload={dashboardPayload} />
            )
          ) : (
            manageSections
          )}
        </>
      ) : (
        manageSections
      )}
    </div>
  );
}

// ── Regional Invoices Section ───────────────────────────────────────────

const INV_DRAFT = { label: "Draft", cls: "bg-gray-800/50 text-gray-400" };
const INV_STATUS: Record<string, { label: string; cls: string }> = {
  draft: INV_DRAFT,
  sent: { label: "Sent", cls: "bg-blue-900/30 text-blue-400" },
  paid: { label: "Paid", cls: "bg-emerald-900/30 text-emerald-400" },
  overdue: { label: "Overdue", cls: "bg-red-900/30 text-red-400" },
  cancelled: { label: "Cancelled", cls: "bg-gray-800/50 text-gray-400" },
};

function RegionalInvoicesSection({
  regionId,
  chapters,
  canManage,
}: {
  regionId: string;
  chapters: ChapterWithMemberCount[];
  canManage: boolean;
}) {
  const [invoices, setInvoices] = useState<InvoiceWithChapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState<"single" | "bulk" | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Single form state
  const [chapterId, setChapterId] = useState("");
  const [rateOrFlat, setRateOrFlat] = useState<"rate" | "flat">("rate");
  const [rate, setRate] = useState("");
  const [flatAmount, setFlatAmount] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");

  // Bulk form state
  const [bulkRate, setBulkRate] = useState("");
  const [bulkDescription, setBulkDescription] = useState("");
  const [bulkDueDate, setBulkDueDate] = useState("");
  const [bulkNotes, setBulkNotes] = useState("");

  useEffect(() => { load(); }, [regionId]);

  async function load() {
    setLoading(true);
    try {
      const data = await fetchRegionalInvoices(regionId);
      setInvoices(data);
    } catch {
      setError("Failed to load regional invoices.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateSingle(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const inv = await createRegionalInvoice(regionId, {
        billed_chapter_id: chapterId,
        description,
        due_date: dueDate,
        per_member_rate: rateOrFlat === "rate" ? parseFloat(rate) : undefined,
        amount: rateOrFlat === "flat" ? parseFloat(flatAmount) : undefined,
        notes: notes || undefined,
      });
      setInvoices((prev) => [inv, ...prev]);
      setShowForm(null);
      setChapterId(""); setRate(""); setFlatAmount(""); setDescription(""); setDueDate(""); setNotes("");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error || "Failed to create invoice.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateBulk(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await bulkCreateRegionalInvoices(regionId, {
        per_member_rate: parseFloat(bulkRate),
        description: bulkDescription,
        due_date: bulkDueDate,
        notes: bulkNotes || undefined,
      });
      setInvoices((prev) => [...result.invoices, ...prev]);
      setShowForm(null);
      setBulkRate(""); setBulkDescription(""); setBulkDueDate(""); setBulkNotes("");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error || "Failed to create invoices.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(invoiceId: string, status: string) {
    try {
      const updated = await updateRegionalInvoice(regionId, invoiceId, { status });
      setInvoices((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    } catch {
      setError("Failed to update invoice.");
    }
  }

  const fmt = (v: string | number) =>
    `$${parseFloat(String(v)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtDate = (iso: string) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";

  return (
    <div className="bg-surface-card-solid rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-content-primary">Head Tax & Regional Invoices</h2>
        {canManage && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowForm(showForm === "single" ? null : "single")}
              className="text-sm bg-brand-primary text-white px-3 py-1.5 rounded-lg font-medium hover:bg-brand-primary-dark transition"
            >
              + Invoice Chapter
            </button>
            <button
              onClick={() => setShowForm(showForm === "bulk" ? null : "bulk")}
              className="text-sm bg-surface-card-solid border border-[var(--color-border-brand)] text-content-secondary px-3 py-1.5 rounded-lg font-medium hover:bg-white/5 transition"
            >
              Invoice All Chapters
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/20 border border-red-900/30 text-red-400 rounded-md text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline text-red-400">Dismiss</button>
        </div>
      )}

      {/* Single invoice form */}
      {showForm === "single" && canManage && (
        <form onSubmit={handleCreateSingle} className="border border-[var(--color-border)] rounded-lg p-4 mb-4 space-y-3">
          <h3 className="font-semibold text-content-primary text-sm">Invoice a Chapter</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-content-secondary mb-1">Chapter</label>
              <select value={chapterId} onChange={(e) => setChapterId(e.target.value)} required
                className="w-full px-3 py-2 border border-[var(--color-border-brand)] rounded-lg text-sm focus:ring-2 focus:ring-brand-primary">
                <option value="">Select chapter...</option>
                {chapters.map((ch) => (
                  <option key={ch.id} value={ch.id}>{ch.name} ({ch.designation}) — {ch.member_count} members</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-content-secondary mb-1">Billing Method</label>
              <div className="flex gap-3 mt-1">
                <label className="flex items-center gap-1.5 text-sm">
                  <input type="radio" checked={rateOrFlat === "rate"} onChange={() => setRateOrFlat("rate")} className="text-brand-primary" />
                  Per Member Rate
                </label>
                <label className="flex items-center gap-1.5 text-sm">
                  <input type="radio" checked={rateOrFlat === "flat"} onChange={() => setRateOrFlat("flat")} className="text-brand-primary" />
                  Flat Amount
                </label>
              </div>
            </div>
            {rateOrFlat === "rate" ? (
              <div>
                <label className="block text-xs font-medium text-content-secondary mb-1">Rate per Member ($)</label>
                <input type="number" step="0.01" min="0.01" value={rate} onChange={(e) => setRate(e.target.value)} required
                  placeholder="e.g., 10.00"
                  className="w-full px-3 py-2 border border-[var(--color-border-brand)] rounded-lg text-sm focus:ring-2 focus:ring-brand-primary" />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-content-secondary mb-1">Amount ($)</label>
                <input type="number" step="0.01" min="0.01" value={flatAmount} onChange={(e) => setFlatAmount(e.target.value)} required
                  className="w-full px-3 py-2 border border-[var(--color-border-brand)] rounded-lg text-sm focus:ring-2 focus:ring-brand-primary" />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-content-secondary mb-1">Due Date</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required
                className="w-full px-3 py-2 border border-[var(--color-border-brand)] rounded-lg text-sm focus:ring-2 focus:ring-brand-primary" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-content-secondary mb-1">Description</label>
              <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} required
                placeholder="e.g., Spring 2026 Head Tax"
                className="w-full px-3 py-2 border border-[var(--color-border-brand)] rounded-lg text-sm focus:ring-2 focus:ring-brand-primary" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-content-secondary mb-1">Notes <span className="text-content-muted">(optional)</span></label>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 border border-[var(--color-border-brand)] rounded-lg text-sm focus:ring-2 focus:ring-brand-primary" />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={submitting}
              className="bg-brand-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-primary-dark transition disabled:opacity-50">
              {submitting ? "Creating..." : "Create Invoice"}
            </button>
            <button type="button" onClick={() => setShowForm(null)} className="text-content-secondary text-sm font-medium px-3 py-2">Cancel</button>
          </div>
        </form>
      )}

      {/* Bulk form */}
      {showForm === "bulk" && canManage && (
        <form onSubmit={handleCreateBulk} className="border border-[var(--color-border)] rounded-lg p-4 mb-4 space-y-3">
          <h3 className="font-semibold text-content-primary text-sm">Bulk Head Tax — All Chapters</h3>
          <p className="text-xs text-content-secondary">Creates an invoice for every active chapter based on their current member count.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-content-secondary mb-1">Rate per Member ($)</label>
              <input type="number" step="0.01" min="0.01" value={bulkRate} onChange={(e) => setBulkRate(e.target.value)} required
                placeholder="e.g., 10.00"
                className="w-full px-3 py-2 border border-[var(--color-border-brand)] rounded-lg text-sm focus:ring-2 focus:ring-brand-primary" />
            </div>
            <div>
              <label className="block text-xs font-medium text-content-secondary mb-1">Due Date</label>
              <input type="date" value={bulkDueDate} onChange={(e) => setBulkDueDate(e.target.value)} required
                className="w-full px-3 py-2 border border-[var(--color-border-brand)] rounded-lg text-sm focus:ring-2 focus:ring-brand-primary" />
            </div>
            <div>
              <label className="block text-xs font-medium text-content-secondary mb-1">Description</label>
              <input type="text" value={bulkDescription} onChange={(e) => setBulkDescription(e.target.value)} required
                placeholder="e.g., Spring 2026 Head Tax"
                className="w-full px-3 py-2 border border-[var(--color-border-brand)] rounded-lg text-sm focus:ring-2 focus:ring-brand-primary" />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={submitting}
              className="bg-brand-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-primary-dark transition disabled:opacity-50">
              {submitting ? "Creating..." : `Invoice ${chapters.length} Chapters`}
            </button>
            <button type="button" onClick={() => setShowForm(null)} className="text-content-secondary text-sm font-medium px-3 py-2">Cancel</button>
          </div>
        </form>
      )}

      {/* Invoice list */}
      {loading ? (
        <p className="text-content-secondary text-sm py-6 text-center">Loading invoices...</p>
      ) : invoices.length === 0 ? (
        <p className="text-content-muted text-sm py-6 text-center">No regional invoices yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/5">
            <thead className="bg-white/5">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Invoice</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Chapter</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Members</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Due</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Status</th>
                {canManage && <th className="px-4 py-3 text-right text-xs font-medium text-content-secondary uppercase">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {invoices.map((inv) => {
                const s = INV_STATUS[inv.status] ?? INV_DRAFT;
                return (
                  <tr key={inv.id} className="hover:bg-white/5 transition">
                    <td className="px-4 py-3">
                      <p className="text-xs font-mono text-content-muted">{inv.invoice_number}</p>
                      <p className="text-sm text-content-primary">{inv.description}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-content-secondary">
                      {inv.billed_chapter ? `${inv.billed_chapter.name} (${inv.billed_chapter.designation})` : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-content-secondary">
                      {inv.member_count != null ? `${inv.member_count} × ${fmt(inv.per_member_rate ?? "0")}` : "Flat"}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-content-primary">{fmt(inv.amount)}</td>
                    <td className="px-4 py-3 text-sm text-content-secondary">{fmtDate(inv.due_date)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>{s.label}</span>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {inv.status === "draft" && (
                            <button onClick={() => handleStatusChange(inv.id, "sent")}
                              className="text-xs text-blue-400 hover:text-blue-300 font-medium">Send</button>
                          )}
                          {(inv.status === "sent" || inv.status === "overdue") && (
                            <button onClick={() => handleStatusChange(inv.id, "paid")}
                              className="text-xs text-emerald-400 hover:text-emerald-300 font-medium">Mark Paid</button>
                          )}
                          {inv.status !== "paid" && inv.status !== "cancelled" && (
                            <button onClick={() => handleStatusChange(inv.id, "cancelled")}
                              className="text-xs text-content-muted hover:text-red-400 font-medium">Cancel</button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Region Info Section ─────────────────────────────────────────────────

function RegionInfoSection({
  detail,
  canEdit,
  onUpdated,
}: {
  detail: RegionDetail;
  canEdit: boolean;
  onUpdated: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(detail.region.name);
  const [abbreviation, setAbbreviation] = useState(detail.region.abbreviation || "");
  const [description, setDescription] = useState(detail.region.description || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await updateRegion(detail.region.id, {
        name: name.trim(),
        abbreviation: abbreviation.trim() || undefined,
        description: description.trim() || undefined,
      });
      setSuccess(true);
      setEditing(false);
      onUpdated();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error || "Failed to update region.";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-surface-card-solid rounded-lg shadow p-6">
      <div className="flex justify-between items-start mb-4">
        <h2 className="text-xl font-bold text-content-primary">Region Details</h2>
        {canEdit && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-sm text-brand-primary hover:underline font-medium"
          >
            Edit
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/20 border border-red-900/30 text-red-400 rounded-md text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-900/20 border border-green-900/30 text-green-400 rounded-md text-sm">
          Region updated successfully.
        </div>
      )}

      {editing ? (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="block w-full rounded-md border border-[var(--color-border-brand)] px-3 py-2 shadow-glass focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">Abbreviation</label>
            <input
              type="text"
              value={abbreviation}
              onChange={(e) => setAbbreviation(e.target.value)}
              className="block w-full rounded-md border border-[var(--color-border-brand)] px-3 py-2 shadow-glass focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="block w-full rounded-md border border-[var(--color-border-brand)] px-3 py-2 shadow-glass focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setEditing(false)}
              className="px-4 py-2 text-sm text-content-secondary border border-[var(--color-border-brand)] rounded-md hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="px-4 py-2 text-sm text-white bg-brand-primary rounded-md hover:bg-brand-primary-dark disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div>
            <span className="text-sm text-content-secondary">Name:</span>
            <span className="ml-2 text-content-primary font-medium">{detail.region.name}</span>
          </div>
          {detail.region.abbreviation && (
            <div>
              <span className="text-sm text-content-secondary">Abbreviation:</span>
              <span className="ml-2 text-content-primary">{detail.region.abbreviation}</span>
            </div>
          )}
          {detail.region.description && (
            <div>
              <span className="text-sm text-content-secondary">Description:</span>
              <span className="ml-2 text-content-primary">{detail.region.description}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Chapters Section ────────────────────────────────────────────────────

function ChaptersSection({
  chapters,
  currentRegionId,
  isOrgAdmin,
  allRegions,
  onRefresh,
}: {
  chapters: ChapterWithMemberCount[];
  currentRegionId: string;
  isOrgAdmin: boolean;
  allRegions: RegionWithStats[];
  onRefresh: () => void;
}) {
  const [movingChapterId, setMovingChapterId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const otherRegions = allRegions.filter((r) => r.id !== currentRegionId);

  const handleMove = async (chapterId: string, targetRegionId: string) => {
    setError(null);
    try {
      await reassignChapter(targetRegionId, chapterId);
      setMovingChapterId(null);
      onRefresh();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error || "Failed to move chapter.";
      setError(message);
    }
  };

  return (
    <div className="bg-surface-card-solid rounded-lg shadow p-6">
      <h2 className="text-xl font-bold text-content-primary mb-4">
        Chapters ({chapters.length})
      </h2>

      {error && (
        <div className="mb-4 p-3 bg-red-900/20 border border-red-900/30 text-red-400 rounded-md text-sm">
          {error}
        </div>
      )}

      {chapters.length === 0 ? (
        <p className="text-content-secondary text-sm">No chapters in this region yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/5">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">
                  Location
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-content-secondary uppercase">
                  Members
                </th>
                {isOrgAdmin && otherRegions.length > 0 && (
                  <th className="px-4 py-3 text-right text-xs font-medium text-content-secondary uppercase">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {chapters.map((ch) => (
                <tr key={ch.id} className="hover:bg-white/5">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-content-primary">{ch.name}</p>
                      {ch.designation && (
                        <p className="text-sm text-content-secondary">{ch.designation}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-content-secondary capitalize">
                    {ch.chapter_type}
                  </td>
                  <td className="px-4 py-3 text-sm text-content-secondary">
                    {[ch.city, ch.state].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-content-primary text-right font-medium">
                    {ch.member_count}
                  </td>
                  {isOrgAdmin && otherRegions.length > 0 && (
                    <td className="px-4 py-3 text-right">
                      {movingChapterId === ch.id ? (
                        <select
                          autoFocus
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value) handleMove(ch.id, e.target.value);
                          }}
                          onBlur={() => setMovingChapterId(null)}
                          className="text-sm border border-[var(--color-border-brand)] rounded px-2 py-1"
                        >
                          <option value="" disabled>
                            Select region...
                          </option>
                          {otherRegions.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <button
                          onClick={() => setMovingChapterId(ch.id)}
                          className="text-sm text-brand-primary hover:underline"
                        >
                          Move
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Regional Officers Section ───────────────────────────────────────────

function RegionalOfficersSection({
  detail,
  isOrgAdmin,
  onUpdated,
}: {
  detail: RegionDetail;
  isOrgAdmin: boolean;
  onUpdated: () => void;
}) {
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpdateRole = async (
    membership: RegionMembershipWithUser,
    newRole: RegionRole,
  ) => {
    setError(null);
    try {
      await updateRegionMember(detail.region.id, membership.id, {
        role: newRole,
      });
      onUpdated();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error || "Failed to update role.";
      setError(message);
    }
  };

  const handleRemove = async (membership: RegionMembershipWithUser) => {
    if (!confirm(`Remove ${membership.user.full_name} from this region?`)) return;
    setError(null);
    try {
      await removeRegionMember(detail.region.id, membership.id);
      onUpdated();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error || "Failed to remove member.";
      setError(message);
    }
  };

  return (
    <div className="bg-surface-card-solid rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-content-primary">
          Regional Officers ({detail.members.length})
        </h2>
        {isOrgAdmin && (
          <button
            onClick={() => setShowAssignModal(true)}
            className="text-sm bg-brand-primary text-white px-4 py-2 rounded-md hover:bg-brand-primary-dark transition"
          >
            Assign Officer
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/20 border border-red-900/30 text-red-400 rounded-md text-sm">
          {error}
        </div>
      )}

      {detail.members.length === 0 ? (
        <p className="text-content-secondary text-sm">No regional officers assigned yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/5">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">
                  Role
                </th>
                {isOrgAdmin && (
                  <th className="px-4 py-3 text-right text-xs font-medium text-content-secondary uppercase">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {detail.members.map((m) => (
                <tr key={m.id} className="hover:bg-white/5">
                  <td className="px-4 py-3 font-medium text-content-primary">
                    {m.user.full_name}
                  </td>
                  <td className="px-4 py-3 text-sm text-content-secondary">
                    {m.user.email}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${REGION_ROLE_COLORS[m.role]}`}
                    >
                      {REGION_ROLE_LABELS[m.role]}
                    </span>
                  </td>
                  {isOrgAdmin && (
                    <td className="px-4 py-3 text-right space-x-2">
                      <select
                        value={m.role}
                        onChange={(e) =>
                          handleUpdateRole(m, e.target.value as RegionRole)
                        }
                        className="text-sm border border-[var(--color-border-brand)] rounded px-2 py-1"
                      >
                        <option value="member">Member</option>
                        <option value="regional_director">Regional Director</option>
                        <option value="regional_1st_vice">Regional 1st Vice</option>
                        <option value="regional_2nd_vice">Regional 2nd Vice</option>
                        <option value="regional_secretary">Regional Secretary</option>
                        <option value="regional_treasurer">Regional Treasurer</option>
                      </select>
                      <button
                        onClick={() => handleRemove(m)}
                        className="text-sm text-red-400 hover:underline"
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAssignModal && (
        <AssignOfficerModal
          regionId={detail.region.id}
          onClose={() => setShowAssignModal(false)}
          onAssigned={() => {
            setShowAssignModal(false);
            onUpdated();
          }}
        />
      )}
    </div>
  );
}

// ── Assign Officer Modal ────────────────────────────────────────────────

function AssignOfficerModal({
  regionId,
  onClose,
  onAssigned,
}: {
  regionId: string;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemberUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<MemberUser | null>(null);
  const [role, setRole] = useState<RegionRole>("regional_director");
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const users = await searchEligibleUsers(regionId, query.trim());
      setResults(users);
    } catch {
      setError("Failed to search users.");
    } finally {
      setSearching(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedUser) return;
    setAssigning(true);
    setError(null);
    try {
      await assignRegionMember(regionId, {
        user_id: selectedUser.id,
        role,
      });
      onAssigned();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error || "Failed to assign member.";
      setError(message);
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface-card-solid rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-bold text-content-primary mb-4">
          Assign Regional Officer
        </h3>

        {error && (
          <div className="mb-4 p-3 bg-red-900/20 border border-red-900/30 text-red-400 rounded-md text-sm">
            {error}
          </div>
        )}

        {!selectedUser ? (
          <>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                placeholder="Search by name or email..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="flex-1 rounded-md border border-[var(--color-border-brand)] px-3 py-2 shadow-glass focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
              />
              <button
                onClick={handleSearch}
                disabled={searching || !query.trim()}
                className="px-4 py-2 text-sm bg-brand-primary text-white rounded-md hover:bg-brand-primary-dark disabled:opacity-50"
              >
                {searching ? "..." : "Search"}
              </button>
            </div>

            {results.length > 0 ? (
              <div className="max-h-60 overflow-y-auto space-y-1">
                {results.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => setSelectedUser(u)}
                    className="w-full text-left p-3 rounded-md hover:bg-brand-primary-light border border-[var(--color-border)] transition"
                  >
                    <p className="font-medium text-content-primary">{u.full_name}</p>
                    <p className="text-sm text-content-secondary">{u.email}</p>
                  </button>
                ))}
              </div>
            ) : query && !searching ? (
              <p className="text-sm text-content-secondary text-center py-4">
                No eligible users found.
              </p>
            ) : null}
          </>
        ) : (
          <div className="space-y-4">
            <div className="p-3 bg-white/5 border border-[var(--color-border)] rounded-md">
              <p className="font-medium text-content-primary">{selectedUser.full_name}</p>
              <p className="text-sm text-content-secondary">{selectedUser.email}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">
                Role
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as RegionRole)}
                className="block w-full rounded-md border border-[var(--color-border-brand)] px-3 py-2 shadow-glass focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
              >
                <option value="regional_director">Regional Director</option>
                <option value="regional_1st_vice">Regional 1st Vice</option>
                <option value="regional_2nd_vice">Regional 2nd Vice</option>
                <option value="regional_secretary">Regional Secretary</option>
                <option value="regional_treasurer">Regional Treasurer</option>
                <option value="member">Member</option>
              </select>
            </div>
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button
            onClick={selectedUser ? () => setSelectedUser(null) : onClose}
            className="flex-1 px-4 py-2 text-sm text-content-secondary border border-[var(--color-border-brand)] rounded-md hover:bg-white/5"
          >
            {selectedUser ? "Back" : "Cancel"}
          </button>
          {selectedUser && (
            <button
              onClick={handleAssign}
              disabled={assigning}
              className="flex-1 px-4 py-2 text-sm text-white bg-brand-primary rounded-md hover:bg-brand-primary-dark disabled:opacity-50"
            >
              {assigning ? "Assigning..." : "Assign"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
