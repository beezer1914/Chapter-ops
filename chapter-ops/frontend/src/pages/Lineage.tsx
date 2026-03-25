import { useEffect, useState, useMemo } from "react";
import Layout from "@/components/Layout";
import { useAuthStore } from "@/stores/authStore";
import {
  fetchLineage,
  fetchMilestones,
  updateMemberLineage,
  createMilestone,
  updateMilestone,
  deleteMilestone,
} from "@/services/lineageService";
import type {
  LineageMember,
  ChapterMilestone,
  MilestoneType,
  UpdateLineageRequest,
} from "@/types";
import {
  GitBranch,
  BookOpen,
  Users,
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  X,
  Check,
  Award,
  Star,
  Zap,
  AlertTriangle,
  RefreshCw,
  Flag,
  ScrollText,
} from "lucide-react";

// ── Constants ──────────────────────────────────────────────────────────────────

const MILESTONE_TYPE_CONFIG: Record<
  MilestoneType,
  { label: string; icon: typeof Flag; color: string; bg: string }
> = {
  founding: { label: "Founding", icon: Star, color: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
  charter: { label: "Charter Granted", icon: ScrollText, color: "text-blue-600", bg: "bg-blue-50 border-blue-200" },
  recharter: { label: "Re-Charted", icon: RefreshCw, color: "text-teal-600", bg: "bg-teal-50 border-teal-200" },
  suspended: { label: "Suspended", icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50 border-red-200" },
  reactivated: { label: "Reactivated", icon: Zap, color: "text-green-600", bg: "bg-green-50 border-green-200" },
  award: { label: "Award", icon: Award, color: "text-purple-600", bg: "bg-purple-50 border-purple-200" },
  achievement: { label: "Achievement", icon: Star, color: "text-indigo-600", bg: "bg-indigo-50 border-indigo-200" },
  other: { label: "Other", icon: Flag, color: "text-gray-600", bg: "bg-gray-50 border-gray-200" },
};

const MILESTONE_TYPES: MilestoneType[] = [
  "founding", "charter", "recharter", "suspended",
  "reactivated", "award", "achievement", "other",
];

const ROLE_HIERARCHY: Record<string, number> = {
  member: 0, secretary: 1, treasurer: 2, vice_president: 3, president: 4, admin: 5,
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
}

function Avatar({ member, size = "sm" }: { member: LineageMember; size?: "sm" | "md" }) {
  const sz = size === "md" ? "w-10 h-10 text-sm" : "w-7 h-7 text-xs";
  const initials = `${member.first_name[0] ?? ""}${member.last_name[0] ?? ""}`;
  if (member.profile_picture_url) {
    return <img src={member.profile_picture_url} alt={member.full_name} className={`${sz} rounded-full object-cover`} />;
  }
  return (
    <div className={`${sz} rounded-full bg-brand-primary-main/20 text-brand-primary-dark font-bold flex items-center justify-center`}>
      {initials}
    </div>
  );
}

// ── Family tree builder ────────────────────────────────────────────────────────

function buildTree(members: LineageMember[]): LineageMember[] {
  const byUserId = new Map(members.map((m) => [m.user_id, m]));
  return members.filter((m) => !m.big_id || !byUserId.has(m.big_id));
}

function getLittles(big: LineageMember, all: LineageMember[]): LineageMember[] {
  return all.filter((m) => m.big_id === big.user_id);
}

function TreeNode({
  member,
  all,
  depth,
  canEdit,
  onEditLineage,
}: {
  member: LineageMember;
  all: LineageMember[];
  depth: number;
  canEdit: boolean;
  onEditLineage: (m: LineageMember) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const littles = getLittles(member, all);

  return (
    <div className={depth > 0 ? "ml-6 mt-2 pl-4 border-l-2 border-gray-200" : ""}>
      <div className="flex items-center gap-2 group py-1.5">
        {littles.length > 0 ? (
          <button onClick={() => setExpanded(!expanded)} className="text-gray-400 hover:text-gray-600 shrink-0">
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        ) : (
          <div className="w-3.5 shrink-0" />
        )}
        <Avatar member={member} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 leading-tight truncate">{member.full_name}</p>
          {member.line_name && (
            <p className="text-xs text-brand-primary font-medium truncate">"{member.line_name}"</p>
          )}
          {member.line_number && (
            <p className="text-xs text-gray-400">#{member.line_number}</p>
          )}
        </div>
        {canEdit && (
          <button
            onClick={() => onEditLineage(member)}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {expanded && littles.map((little) => (
        <TreeNode key={little.user_id} member={little} all={all} depth={depth + 1} canEdit={canEdit} onEditLineage={onEditLineage} />
      ))}
    </div>
  );
}

// ── Edit Lineage Modal ─────────────────────────────────────────────────────────

function EditLineageModal({
  member,
  allMembers,
  onClose,
  onSave,
}: {
  member: LineageMember;
  allMembers: LineageMember[];
  onClose: () => void;
  onSave: (membershipId: string, data: UpdateLineageRequest) => Promise<void>;
}) {
  const [bigId, setBigId] = useState(member.big_id ?? "");
  const [lineSeason, setLineSeason] = useState(member.line_season ?? "");
  const [lineNumber, setLineNumber] = useState(member.line_number?.toString() ?? "");
  const [lineName, setLineName] = useState(member.line_name ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const otherMembers = allMembers.filter((m) => m.user_id !== member.user_id);

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await onSave(member.membership_id, {
        big_id: bigId || null,
        line_season: lineSeason || null,
        line_number: lineNumber ? parseInt(lineNumber) : null,
        line_name: lineName || null,
      });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-lg font-heading font-bold text-gray-900">Edit Lineage — {member.full_name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Big Brother / Big Sister</label>
            <select
              value={bigId}
              onChange={(e) => setBigId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-primary-main/20 focus:border-brand-primary-main"
            >
              <option value="">— None —</option>
              {otherMembers.map((m) => (
                <option key={m.user_id} value={m.user_id}>{m.full_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Line Season</label>
            <input
              type="text"
              value={lineSeason}
              onChange={(e) => setLineSeason(e.target.value)}
              placeholder="e.g. Spring 2024 Line"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-primary-main/20 focus:border-brand-primary-main"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Line Number</label>
            <input
              type="number"
              min={1}
              value={lineNumber}
              onChange={(e) => setLineNumber(e.target.value)}
              placeholder="e.g. 3"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-primary-main/20 focus:border-brand-primary-main"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Line Name / Alias</label>
            <input
              type="text"
              value={lineName}
              onChange={(e) => setLineName(e.target.value)}
              placeholder='e.g. "The Iron Fist"'
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-primary-main/20 focus:border-brand-primary-main"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2 bg-brand-primary-main text-white rounded-xl text-sm font-semibold hover:bg-brand-primary-dark disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Milestone Modal ────────────────────────────────────────────────────────────

function MilestoneModal({
  milestone,
  onClose,
  onSave,
}: {
  milestone?: ChapterMilestone;
  onClose: () => void;
  onSave: (data: { title: string; date: string; milestone_type: MilestoneType; description?: string; is_public: boolean }) => Promise<void>;
}) {
  const [title, setTitle] = useState(milestone?.title ?? "");
  const [date, setDate] = useState(milestone?.date ?? "");
  const [milestoneType, setMilestoneType] = useState<MilestoneType>(milestone?.milestone_type ?? "other");
  const [description, setDescription] = useState(milestone?.description ?? "");
  const [isPublic, setIsPublic] = useState(milestone?.is_public ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!title.trim() || !date) { setError("Title and date are required."); return; }
    setSaving(true);
    setError("");
    try {
      await onSave({ title: title.trim(), date, milestone_type: milestoneType, description: description.trim() || undefined, is_public: isPublic });
      onClose();
    } catch {
      setError("Failed to save milestone.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-lg font-heading font-bold text-gray-900">
            {milestone ? "Edit Milestone" : "Add Milestone"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Chapter Founded"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-primary-main/20 focus:border-brand-primary-main"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-primary-main/20 focus:border-brand-primary-main"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={milestoneType}
              onChange={(e) => setMilestoneType(e.target.value as MilestoneType)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-primary-main/20 focus:border-brand-primary-main"
            >
              {MILESTONE_TYPES.map((t) => (
                <option key={t} value={t}>{MILESTONE_TYPE_CONFIG[t].label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Optional details about this milestone…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-primary-main/20 focus:border-brand-primary-main resize-none"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="rounded" />
            <span className="text-sm text-gray-700">Visible to all members</span>
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2 bg-brand-primary-main text-white rounded-xl text-sm font-semibold hover:bg-brand-primary-dark disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

type Tab = "history" | "lines" | "tree";

export default function Lineage() {
  const { user, memberships } = useAuthStore();
  const [tab, setTab] = useState<Tab>("history");

  const [members, setMembers] = useState<LineageMember[]>([]);
  const [lines, setLines] = useState<Record<string, LineageMember[]>>({});
  const [milestones, setMilestones] = useState<ChapterMilestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editingLineage, setEditingLineage] = useState<LineageMember | null>(null);
  const [editingMilestone, setEditingMilestone] = useState<ChapterMilestone | null | "new">(null);
  const [confirmDeleteMilestone, setConfirmDeleteMilestone] = useState<ChapterMilestone | null>(null);

  const currentMembership = memberships.find((m) => m.chapter_id === user?.active_chapter_id);
  const currentRole = currentMembership?.role ?? "member";
  const canEdit = ROLE_HIERARCHY[currentRole] >= ROLE_HIERARCHY["secretary"];

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [lineageData, milestonesData] = await Promise.all([
        fetchLineage(),
        fetchMilestones(),
      ]);
      setMembers(lineageData.members);
      setLines(lineageData.lines);
      setMilestones(milestonesData.milestones);
    } catch {
      setError("Failed to load lineage data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSaveLineage(membershipId: string, data: UpdateLineageRequest) {
    const updated = await updateMemberLineage(membershipId, data);
    setMembers((prev) => prev.map((m) => m.membership_id === membershipId ? { ...m, ...updated } : m));
    setLines((prev) => {
      const next: Record<string, LineageMember[]> = {};
      Object.entries(prev).forEach(([season, list]) => {
        next[season] = list.map((m) => m.membership_id === membershipId ? { ...m, ...updated } : m);
      });
      return next;
    });
  }

  async function handleSaveMilestone(data: { title: string; date: string; milestone_type: MilestoneType; description?: string; is_public: boolean }) {
    if (editingMilestone === "new") {
      const m = await createMilestone(data);
      setMilestones((prev) => [...prev, m].sort((a, b) => a.date.localeCompare(b.date)));
    } else if (editingMilestone) {
      const m = await updateMilestone(editingMilestone.id, data);
      setMilestones((prev) => prev.map((x) => x.id === m.id ? m : x));
    }
  }

  async function handleDeleteMilestone(milestone: ChapterMilestone) {
    await deleteMilestone(milestone.id);
    setMilestones((prev) => prev.filter((m) => m.id !== milestone.id));
    setConfirmDeleteMilestone(null);
  }

  const treeRoots = useMemo(() => buildTree(members), [members]);

  const tabs: { key: Tab; label: string; icon: typeof BookOpen }[] = [
    { key: "history", label: "Chapter History", icon: BookOpen },
    { key: "lines", label: "Line History", icon: Users },
    { key: "tree", label: "Family Tree", icon: GitBranch },
  ];

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-heading font-bold text-gray-900">Lineage & History</h1>
            <p className="text-sm text-gray-500 mt-0.5">Chapter milestones, line history, and big/little family tree</p>
          </div>
          {canEdit && tab === "history" && (
            <button
              onClick={() => setEditingMilestone("new")}
              className="flex items-center gap-2 px-4 py-2 bg-brand-primary-main text-white rounded-xl text-sm font-semibold hover:bg-brand-primary-dark transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Milestone
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === key
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-brand-primary-main border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
        ) : (
          <>
            {/* ── Chapter History Tab ── */}
            {tab === "history" && (
              <div className="space-y-4">
                {milestones.length === 0 ? (
                  <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
                    <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">No milestones yet</p>
                    {canEdit && (
                      <p className="text-sm text-gray-400 mt-1">Add your chapter's founding date, charter events, awards, and more.</p>
                    )}
                  </div>
                ) : (
                  <div className="relative">
                    {/* Timeline line */}
                    <div className="absolute left-[23px] top-0 bottom-0 w-0.5 bg-gray-200" />
                    <div className="space-y-0">
                      {milestones.map((m, idx) => {
                        const config = MILESTONE_TYPE_CONFIG[m.milestone_type];
                        const Icon = config.icon;
                        return (
                          <div key={m.id} className="relative flex gap-5 pb-6">
                            {/* Timeline dot */}
                            <div className={`relative z-10 w-12 h-12 rounded-full border-2 flex items-center justify-center shrink-0 ${config.bg}`}>
                              <Icon className={`w-5 h-5 ${config.color}`} />
                            </div>
                            {/* Card */}
                            <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 group mt-1.5">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-0.5">{config.label}</p>
                                  <h3 className="font-heading font-bold text-gray-900">{m.title}</h3>
                                  <p className="text-sm text-gray-500 mt-0.5">{formatDate(m.date)}</p>
                                  {m.description && <p className="text-sm text-gray-600 mt-2">{m.description}</p>}
                                </div>
                                {canEdit && (
                                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                    <button
                                      onClick={() => setEditingMilestone(m)}
                                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => setConfirmDeleteMilestone(m)}
                                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Line History Tab ── */}
            {tab === "lines" && (
              <div className="space-y-6">
                {Object.keys(lines).length === 0 ? (
                  <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
                    <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">No line data yet</p>
                    {canEdit && (
                      <p className="text-sm text-gray-400 mt-1">
                        Edit member lineage info to assign line seasons, numbers, and names.
                      </p>
                    )}
                  </div>
                ) : (
                  Object.entries(lines).map(([season, lineMembers]) => (
                    <div key={season} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
                        <h3 className="font-heading font-bold text-gray-900">{season}</h3>
                        <p className="text-xs text-gray-500 mt-0.5">{lineMembers.length} member{lineMembers.length !== 1 ? "s" : ""}</p>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {lineMembers
                          .sort((a, b) => (a.line_number ?? 999) - (b.line_number ?? 999))
                          .map((m) => (
                            <div key={m.user_id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/50 group">
                              {m.line_number ? (
                                <div className="w-8 h-8 rounded-full bg-brand-primary-main/10 text-brand-primary-dark font-bold text-xs flex items-center justify-center shrink-0">
                                  {m.line_number}
                                </div>
                              ) : (
                                <Avatar member={m} />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-900">{m.full_name}</p>
                                {m.line_name && <p className="text-xs text-brand-primary">"{m.line_name}"</p>}
                              </div>
                              {canEdit && (
                                <button
                                  onClick={() => setEditingLineage(m)}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          ))}
                      </div>
                    </div>
                  ))
                )}

                {/* Members without line data */}
                {canEdit && members.some((m) => !m.line_season) && (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                    <p className="text-sm font-medium text-amber-800">
                      {members.filter((m) => !m.line_season).length} member{members.filter((m) => !m.line_season).length !== 1 ? "s" : ""} have no line season assigned
                    </p>
                    <p className="text-xs text-amber-600 mt-0.5">Use the Family Tree tab to assign line info to historical members.</p>
                  </div>
                )}
              </div>
            )}

            {/* ── Family Tree Tab ── */}
            {tab === "tree" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">
                    {members.length} total member{members.length !== 1 ? "s" : ""} · {treeRoots.length} root node{treeRoots.length !== 1 ? "s" : ""}
                  </p>
                  {canEdit && (
                    <p className="text-xs text-gray-400">Hover a member to edit their lineage info</p>
                  )}
                </div>

                {members.length === 0 ? (
                  <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
                    <GitBranch className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">No members found</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                    {treeRoots.map((root) => (
                      <TreeNode
                        key={root.user_id}
                        member={root}
                        all={members}
                        depth={0}
                        canEdit={canEdit}
                        onEditLineage={setEditingLineage}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Edit Lineage Modal */}
      {editingLineage && (
        <EditLineageModal
          member={editingLineage}
          allMembers={members}
          onClose={() => setEditingLineage(null)}
          onSave={handleSaveLineage}
        />
      )}

      {/* Milestone Modal */}
      {editingMilestone !== null && (
        <MilestoneModal
          milestone={editingMilestone === "new" ? undefined : editingMilestone}
          onClose={() => setEditingMilestone(null)}
          onSave={handleSaveMilestone}
        />
      )}

      {/* Delete Confirmation */}
      {confirmDeleteMilestone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="font-heading font-bold text-gray-900 mb-2">Delete Milestone?</h3>
            <p className="text-sm text-gray-600 mb-6">
              "{confirmDeleteMilestone.title}" will be permanently removed from the chapter timeline.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteMilestone(null)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteMilestone(confirmDeleteMilestone)}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
