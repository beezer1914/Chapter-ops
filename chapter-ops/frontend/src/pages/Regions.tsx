import { useEffect, useRef, useState } from "react";
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
} from "@/services/regionService";
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
  regional_director: "bg-amber-100 text-amber-700",
  regional_1st_vice: "bg-orange-100 text-orange-700",
  regional_2nd_vice: "bg-yellow-100 text-yellow-700",
  regional_secretary: "bg-blue-100 text-blue-700",
  regional_treasurer: "bg-green-100 text-green-700",
  member: "bg-gray-100 text-gray-700",
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
    loadRegions();
  }, [loadRegions]);

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
          <h1 className="text-2xl font-bold text-gray-900">Regions</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isOrgAdmin
              ? "Manage regions, chapters, and regional officers."
              : "Browse your organization's regions and search across chapters."}
          </p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-gray-200">
          {(["regions", "directory"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-brand-primary text-brand-primary-dark"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab === "directory" ? "Directory" : "Regions"}
            </button>
          ))}
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm flex justify-between">
            {error}
            <button onClick={clearError} className="text-red-500 hover:text-red-700 font-medium">
              Dismiss
            </button>
          </div>
        )}

        {activeTab === "directory" ? (
          <DirectoryView />
        ) : loading ? (
          <p className="text-gray-500 text-sm py-8 text-center">Loading regions...</p>
        ) : regions.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500">No regions found for your organization.</p>
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
      className="bg-white rounded-lg shadow p-5 text-left hover:shadow-md hover:border-brand-primary border border-gray-200 transition w-full"
    >
      <h3 className="font-semibold text-gray-900 text-lg">{region.name}</h3>
      {region.abbreviation && (
        <p className="text-sm text-gray-500">{region.abbreviation}</p>
      )}
      {region.description && (
        <p className="text-sm text-gray-500 mt-1 line-clamp-2">{region.description}</p>
      )}
      <div className="mt-3 flex gap-4 text-sm text-gray-600">
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
        className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
      />

      {loading && <p className="text-sm text-gray-400 text-center py-4">Searching…</p>}

      {!loading && chapters.length === 0 && members.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-8">
          {query ? "No results found." : "Start typing to search chapters and members."}
        </p>
      )}

      {chapters.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Chapters ({chapters.length})
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {chapters.map((ch) => (
              <div key={ch.id} className="bg-white rounded-lg shadow border border-gray-200 p-4">
                <p className="font-semibold text-gray-900">{ch.name}</p>
                {ch.abbreviation && <p className="text-xs text-gray-500">{ch.abbreviation}</p>}
                <p className="text-sm text-gray-500 mt-1">{ch.member_count} member{ch.member_count !== 1 ? "s" : ""}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {members.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Members ({members.length})
          </h3>
          <div className="bg-white rounded-lg shadow border border-gray-200 divide-y divide-gray-100">
            {members.map((m) => (
              <button
                key={`${m.id}-${m.chapter_id}`}
                onClick={() => setSelectedMember({ userId: m.id, chapterId: m.chapter_id })}
                className="flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-gray-50 transition-colors"
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
                  <p className="text-xs text-gray-500 truncate">{m.chapter_name} · <span className="capitalize">{m.role.replace("_", " ")}</span></p>
                </div>
                <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
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
  financial: "bg-green-100 text-green-700",
  not_financial: "bg-red-100 text-red-700",
  neophyte: "bg-purple-100 text-purple-700",
  exempt: "bg-gray-100 text-gray-600",
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
        className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div className="p-8 text-center text-gray-500 text-sm">Loading member details...</div>
        ) : error ? (
          <div className="p-8 text-center">
            <p className="text-red-600 text-sm">{error}</p>
            <button onClick={onClose} className="mt-4 text-sm text-gray-500 hover:text-gray-700">Close</button>
          </div>
        ) : member ? (
          <>
            {/* Header */}
            <div className="p-6 pb-4 border-b border-gray-100">
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
                  <h3 className="text-lg font-bold text-gray-900 truncate">{member.full_name}</h3>
                  <p className="text-sm text-gray-500 truncate">{member.chapter_name}</p>
                  {member.chapter_designation && (
                    <p className="text-xs text-gray-400">{member.chapter_designation}</p>
                  )}
                </div>
              </div>

              <div className="flex gap-2 mt-3">
                <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 capitalize">
                  {ROLE_LABELS[member.role] || member.role.replace("_", " ")}
                </span>
                <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${FINANCIAL_STATUS_STYLES[member.financial_status] || "bg-gray-100 text-gray-600"}`}>
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
                <div className="pt-3 border-t border-gray-100">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Additional Info</h4>
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
                className="w-full px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
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
      <dt className="text-xs text-gray-500 capitalize">{label}</dt>
      <dd className="text-sm text-gray-900 mt-0.5">{value}</dd>
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
  const canEdit = isOrgAdmin || detail.members.some(
    (m) => m.role === "regional_director",
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

      <RegionInfoSection
        detail={detail}
        canEdit={canEdit}
        onUpdated={onRefresh}
      />

      <ChaptersSection
        chapters={detail.chapters}
        currentRegionId={detail.region.id}
        isOrgAdmin={isOrgAdmin}
        allRegions={allRegions}
        onRefresh={onRefresh}
      />

      <RegionalOfficersSection
        detail={detail}
        isOrgAdmin={isOrgAdmin}
        onUpdated={onRefresh}
      />
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
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-start mb-4">
        <h2 className="text-xl font-bold text-gray-900">Region Details</h2>
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
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-md text-sm">
          Region updated successfully.
        </div>
      )}

      {editing ? (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Abbreviation</label>
            <input
              type="text"
              value={abbreviation}
              onChange={(e) => setAbbreviation(e.target.value)}
              className="block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setEditing(false)}
              className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
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
            <span className="text-sm text-gray-500">Name:</span>
            <span className="ml-2 text-gray-900 font-medium">{detail.region.name}</span>
          </div>
          {detail.region.abbreviation && (
            <div>
              <span className="text-sm text-gray-500">Abbreviation:</span>
              <span className="ml-2 text-gray-900">{detail.region.abbreviation}</span>
            </div>
          )}
          {detail.region.description && (
            <div>
              <span className="text-sm text-gray-500">Description:</span>
              <span className="ml-2 text-gray-900">{detail.region.description}</span>
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
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-4">
        Chapters ({chapters.length})
      </h2>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
          {error}
        </div>
      )}

      {chapters.length === 0 ? (
        <p className="text-gray-500 text-sm">No chapters in this region yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Location
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Members
                </th>
                {isOrgAdmin && otherRegions.length > 0 && (
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {chapters.map((ch) => (
                <tr key={ch.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-gray-900">{ch.name}</p>
                      {ch.designation && (
                        <p className="text-sm text-gray-500">{ch.designation}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 capitalize">
                    {ch.chapter_type}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {[ch.city, ch.state].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
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
                          className="text-sm border border-gray-300 rounded px-2 py-1"
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
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-900">
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
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
          {error}
        </div>
      )}

      {detail.members.length === 0 ? (
        <p className="text-gray-500 text-sm">No regional officers assigned yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Role
                </th>
                {isOrgAdmin && (
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {detail.members.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {m.user.full_name}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
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
                        className="text-sm border border-gray-300 rounded px-2 py-1"
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
                        className="text-sm text-red-600 hover:underline"
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
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-bold text-gray-900 mb-4">
          Assign Regional Officer
        </h3>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
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
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
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
                    className="w-full text-left p-3 rounded-md hover:bg-brand-primary-light border border-gray-200 transition"
                  >
                    <p className="font-medium text-gray-900">{u.full_name}</p>
                    <p className="text-sm text-gray-500">{u.email}</p>
                  </button>
                ))}
              </div>
            ) : query && !searching ? (
              <p className="text-sm text-gray-500 text-center py-4">
                No eligible users found.
              </p>
            ) : null}
          </>
        ) : (
          <div className="space-y-4">
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-md">
              <p className="font-medium text-gray-900">{selectedUser.full_name}</p>
              <p className="text-sm text-gray-500">{selectedUser.email}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Role
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as RegionRole)}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
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
            className="flex-1 px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
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
