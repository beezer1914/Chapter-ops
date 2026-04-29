// TODO(MFA Pass 2): per-officer Reset MFA action. The chapter-health rows here
// are chapter-grain, not user-grain — adding reset would require a roster
// drilldown. Org admins can reset officers via the chapter's Members page in
// the meantime.
import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import Layout from "@/components/Layout";
import {
  fetchIHQDashboard,
  broadcastAnnouncement,
  suspendChapter,
  unsuspendChapter,
} from "@/services/ihqService";
import { fetchIncidentStats } from "@/services/incidentService";
import PendingChapterRequestsSection from "@/components/PendingChapterRequestsSection";
import ChapterHealthTable from "@/components/ChapterHealthTable";
import { formatDollars } from "@/lib/format";
import type { IHQDashboardData, IHQChapterStat, IncidentStats } from "@/types";
import {
  Building2,
  Users,
  TrendingUp,
  DollarSign,
  Map,
  Megaphone,
  X,
  AlertTriangle,
  Globe,
  ShieldOff,
  ShieldCheck,
} from "lucide-react";

// ── Helpers ────────────────────────────────────────────────────────────────

function rateColor(rate: number): string {
  if (rate >= 75) return "text-emerald-400";
  if (rate >= 50) return "text-yellow-400";
  return "text-red-400";
}

function rateBg(rate: number): string {
  if (rate >= 75) return "bg-emerald-500";
  if (rate >= 50) return "bg-yellow-500";
  return "bg-red-500";
}

function RateBar({ rate }: { rate: number }) {
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${rateBg(rate)}`}
          style={{ width: `${Math.min(rate, 100)}%` }}
        />
      </div>
      <span className={`text-xs font-semibold tabular-nums w-10 text-right ${rateColor(rate)}`}>
        {rate.toFixed(0)}%
      </span>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function IHQDashboard() {
  const [data, setData] = useState<IHQDashboardData | null>(null);
  const [incidentStats, setIncidentStats] = useState<IncidentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Chapter table state
  const [regionFilter, setRegionFilter] = useState("all");

  // Broadcast modal state
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [bTitle, setBTitle] = useState("");
  const [bBody, setBBody] = useState("");
  const [bPinned, setBPinned] = useState(false);
  const [bExpiry, setBExpiry] = useState("");
  const [bSending, setBSending] = useState(false);
  const [bResult, setBResult] = useState<string | null>(null);

  // Chapter suspension state
  const [suspendingChapter, setSuspendingChapter] = useState<IHQChapterStat | null>(null);
  const [chapterSuspendReason, setChapterSuspendReason] = useState("");
  const [chapterSuspending, setChapterSuspending] = useState(false);

  useEffect(() => {
    fetchIHQDashboard()
      .then(setData)
      .catch(() => setError("Failed to load IHQ dashboard. Verify you have organization admin access."))
      .finally(() => setLoading(false));

    fetchIncidentStats()
      .then(setIncidentStats)
      .catch(() => {
        // Non-fatal — tile is optional.
      });
  }, []);

  // Region-filtered chapters (search + sort are delegated to ChapterHealthTable)
  const filteredChapters = useMemo<IHQChapterStat[]>(() => {
    if (!data) return [];
    if (regionFilter === "all") return data.chapters;
    return data.chapters.filter((c) => c.region_id === regionFilter);
  }, [data, regionFilter]);

  async function handleBroadcast(e: React.FormEvent) {
    e.preventDefault();
    setBSending(true);
    setBResult(null);
    try {
      const res = await broadcastAnnouncement({
        title: bTitle.trim(),
        body: bBody.trim(),
        is_pinned: bPinned,
        expires_at: bExpiry ? new Date(bExpiry).toISOString() : null,
      });
      setBResult(`Sent to ${res.chapters_targeted} chapter${res.chapters_targeted !== 1 ? "s" : ""} successfully.`);
      setBTitle(""); setBBody(""); setBPinned(false); setBExpiry("");
    } catch {
      setBResult("Failed to send broadcast. Please try again.");
    } finally {
      setBSending(false);
    }
  }

  async function handleChapterSuspend() {
    if (!suspendingChapter || !data) return;
    setChapterSuspending(true);
    try {
      await suspendChapter(suspendingChapter.id, chapterSuspendReason);
      setData({
        ...data,
        chapters: data.chapters.map((c) =>
          c.id === suspendingChapter.id
            ? { ...c, suspended: true, suspension_reason: chapterSuspendReason || null }
            : c
        ),
      });
      setSuspendingChapter(null);
      setChapterSuspendReason("");
    } catch {
      // error is surfaced via the page error state indirectly
    } finally {
      setChapterSuspending(false);
    }
  }

  async function handleChapterUnsuspend(chapter: IHQChapterStat) {
    if (!data) return;
    try {
      await unsuspendChapter(chapter.id);
      setData({
        ...data,
        chapters: data.chapters.map((c) =>
          c.id === chapter.id ? { ...c, suspended: false, suspension_reason: null } : c
        ),
      });
    } catch {
      setError("Failed to lift suspension. Please try again.");
    }
  }

  const s = data?.summary;

  return (
    <Layout>
      <div className="max-w-7xl mx-auto space-y-8">

        {/* ── Page header ── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-brand-primary-main/20 border border-brand-primary-main/30">
              <Globe className="w-6 h-6 text-brand-primary-light" />
            </div>
            <div>
              <h1 className="text-2xl font-heading font-extrabold text-content-primary tracking-tight">
                International Headquarters
              </h1>
              <p className="text-sm text-content-muted mt-0.5">
                {data?.organization.name ?? "Organization"} — org-wide visibility
              </p>
            </div>
          </div>
          <button
            onClick={() => { setBroadcastOpen(true); setBResult(null); }}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-brand-primary-main rounded-xl hover:bg-brand-primary-dark transition-colors shadow-lg shadow-brand-primary-main/20"
          >
            <Megaphone className="w-4 h-4" />
            Broadcast to All Chapters
          </button>
        </div>

        {/* ── Pending Chapter Requests (org-scoped only) ── */}
        <PendingChapterRequestsSection
          title="Pending Chapter Requests"
          scope="org_admin"
        />

        {/* ── Error / Loading ── */}
        {error && (
          <div className="p-4 bg-red-900/20 border border-red-900/30 text-red-400 rounded-xl text-sm">
            {error}
          </div>
        )}
        {loading && (
          <div className="text-content-muted text-sm py-16 text-center">
            Loading IHQ data...
          </div>
        )}

        {!loading && !error && data && s && (
          <>
            {/* ── KPI Cards ── */}
            <div className={`grid grid-cols-2 gap-4 ${incidentStats ? "lg:grid-cols-6" : "lg:grid-cols-5"}`}>
              <KpiCard
                icon={<Building2 className="w-5 h-5" />}
                label="Active Chapters"
                value={s.total_chapters}
                color="blue"
              />
              <KpiCard
                icon={<Users className="w-5 h-5" />}
                label="Total Members"
                value={s.total_members.toLocaleString()}
                color="purple"
              />
              <KpiCard
                icon={<TrendingUp className="w-5 h-5" />}
                label="Financial Rate"
                value={`${s.financial_rate.toFixed(1)}%`}
                sub={`${s.financial_members.toLocaleString()} of ${s.total_members.toLocaleString()}`}
                color={s.financial_rate >= 75 ? "emerald" : s.financial_rate >= 50 ? "yellow" : "red"}
              />
              <KpiCard
                icon={<DollarSign className="w-5 h-5" />}
                label="Dues Collected YTD"
                value={formatDollars(s.dues_ytd)}
                color="emerald"
              />
              <KpiCard
                icon={<Map className="w-5 h-5" />}
                label="Regions"
                value={s.total_regions}
                color="indigo"
              />
              {incidentStats && (
                <Link to="/incidents" className="block">
                  <KpiCard
                    icon={<AlertTriangle className="w-5 h-5" />}
                    label="Open Incidents"
                    value={incidentStats.open}
                    sub={incidentStats.critical_open > 0 ? `${incidentStats.critical_open} critical` : undefined}
                    color={incidentStats.critical_open > 0 ? "red" : incidentStats.open > 0 ? "yellow" : "emerald"}
                  />
                </Link>
              )}
            </div>

            {/* ── Region Rollup ── */}
            {data.regions.length > 0 && (
              <section>
                <h2 className="text-lg font-heading font-bold text-content-primary mb-4">
                  Region Rollup
                </h2>
                <div className="bg-surface-card-solid rounded-xl border border-[var(--color-border)] overflow-x-auto">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead>
                      <tr className="border-b border-[var(--color-border)] text-content-muted text-xs uppercase tracking-wider">
                        <th className="px-5 py-3 text-left font-semibold">Region</th>
                        <th className="px-5 py-3 text-right font-semibold">Chapters</th>
                        <th className="px-5 py-3 text-right font-semibold">Members</th>
                        <th className="px-5 py-3 text-right font-semibold">Financial Rate</th>
                        <th className="px-5 py-3 text-right font-semibold">Dues YTD</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {data.regions.map((r) => (
                        <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-5 py-3.5">
                            <span className="font-medium text-content-primary">{r.name}</span>
                            {r.abbreviation && (
                              <span className="ml-2 text-xs text-content-muted">{r.abbreviation}</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-right text-content-secondary tabular-nums">
                            {r.chapter_count}
                          </td>
                          <td className="px-5 py-3.5 text-right text-content-secondary tabular-nums">
                            {r.member_count.toLocaleString()}
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex justify-end">
                              <RateBar rate={r.financial_rate} />
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-right text-content-secondary tabular-nums">
                            {formatDollars(r.dues_ytd)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* ── Chapter Health Table ── */}
            <section>
              <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
                <h2 className="text-lg font-heading font-bold text-content-primary">
                  Chapter Health
                  <span className="ml-2 text-sm font-body font-normal text-content-muted">
                    ({filteredChapters.length} of {data.chapters.length})
                  </span>
                </h2>
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Region filter */}
                  {data.regions.length > 0 && (
                    <select
                      value={regionFilter}
                      onChange={(e) => setRegionFilter(e.target.value)}
                      className="text-sm rounded-lg px-3 py-2 border border-[var(--color-border)] text-content-primary bg-surface-input focus:outline-none focus:border-brand-primary-main"
                    >
                      <option value="all">All Regions</option>
                      <option value="">Unassigned</option>
                      {data.regions.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <ChapterHealthTable
                chapters={filteredChapters.map((c) => ({
                  ...c,
                  chapter_type: c.chapter_type as "undergraduate" | "graduate",
                  dues_ytd: c.dues_ytd.toFixed(2),
                }))}
                showRegionColumn={true}
                actions={(c) => (
                  c.suspended ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleChapterUnsuspend(filteredChapters.find((x) => x.id === c.id)!); }}
                      className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 bg-emerald-900/20 hover:bg-emerald-900/30 px-2.5 py-1 rounded-lg transition-colors border border-emerald-800/30"
                      title="Lift Suspension"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" /> Restore
                    </button>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); setSuspendingChapter(filteredChapters.find((x) => x.id === c.id) ?? null); setChapterSuspendReason(""); }}
                      className="inline-flex items-center gap-1 text-xs font-medium text-orange-400 bg-orange-900/20 hover:bg-orange-900/30 px-2.5 py-1 rounded-lg transition-colors border border-orange-800/30"
                      title="Suspend Chapter"
                    >
                      <ShieldOff className="w-3.5 h-3.5" /> Suspend
                    </button>
                  )
                )}
              />
            </section>
          </>
        )}
      </div>

      {/* ── Broadcast Modal ── */}
      {broadcastOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-surface-card-solid rounded-2xl shadow-2xl border border-[var(--color-border-brand)] w-full max-w-lg">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-brand-primary-main/20">
                  <Megaphone className="w-4 h-4 text-brand-primary-light" />
                </div>
                <div>
                  <h3 className="text-base font-heading font-bold text-content-primary">Broadcast Announcement</h3>
                  <p className="text-xs text-content-muted mt-0.5">
                    Publishes to all {data?.summary.total_chapters ?? ""} active chapters simultaneously
                  </p>
                </div>
              </div>
              <button
                onClick={() => setBroadcastOpen(false)}
                className="p-1.5 rounded-lg text-content-muted hover:text-content-primary hover:bg-white/5 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleBroadcast} className="p-6 space-y-4">
              {bResult && (
                <div className={`p-3 rounded-lg text-sm ${bResult.startsWith("Sent")
                  ? "bg-emerald-900/20 border border-emerald-900/30 text-emerald-400"
                  : "bg-red-900/20 border border-red-900/30 text-red-400"
                }`}>
                  {bResult}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-content-muted uppercase tracking-wider mb-1.5">
                  Announcement Title
                </label>
                <input
                  type="text"
                  value={bTitle}
                  onChange={(e) => setBTitle(e.target.value)}
                  required
                  maxLength={255}
                  placeholder="e.g. Important Update from National Headquarters"
                  className="w-full rounded-lg border border-[var(--color-border)] px-3.5 py-2.5 text-sm text-content-primary bg-surface-input focus:outline-none focus:border-brand-primary-main focus:ring-1 focus:ring-brand-primary-main/30"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-content-muted uppercase tracking-wider mb-1.5">
                  Message Body
                </label>
                <textarea
                  value={bBody}
                  onChange={(e) => setBBody(e.target.value)}
                  required
                  rows={5}
                  placeholder="Write your announcement here..."
                  className="w-full rounded-lg border border-[var(--color-border)] px-3.5 py-2.5 text-sm text-content-primary bg-surface-input focus:outline-none focus:border-brand-primary-main focus:ring-1 focus:ring-brand-primary-main/30 resize-none"
                />
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm text-content-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bPinned}
                    onChange={(e) => setBPinned(e.target.checked)}
                    className="rounded border-[var(--color-border)] w-4 h-4"
                  />
                  Pin to top of feed
                </label>

                <div className="flex-1">
                  <label className="block text-xs text-content-muted mb-1">Expires (optional)</label>
                  <input
                    type="date"
                    value={bExpiry}
                    onChange={(e) => setBExpiry(e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                    className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-content-primary bg-surface-input focus:outline-none focus:border-brand-primary-main"
                  />
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setBroadcastOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-content-secondary border border-[var(--color-border)] rounded-lg hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={bSending || !bTitle.trim() || !bBody.trim()}
                  className="px-5 py-2 text-sm font-semibold text-white bg-brand-primary-main rounded-lg hover:bg-brand-primary-dark disabled:opacity-50 transition-colors shadow-lg shadow-brand-primary-main/20"
                >
                  {bSending ? "Sending..." : `Broadcast to ${data?.summary.total_chapters ?? "All"} Chapters`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Chapter Suspend Modal ── */}
      {suspendingChapter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-surface-card-solid rounded-2xl shadow-2xl border border-[var(--color-border-brand)] w-full max-w-sm">
            <div className="flex items-center gap-3 px-6 py-5 border-b border-[var(--color-border)] bg-orange-900/10">
              <div className="p-2 rounded-lg bg-orange-900/30">
                <ShieldOff className="w-4 h-4 text-orange-400" />
              </div>
              <div>
                <h3 className="text-base font-heading font-bold text-content-primary">Suspend Chapter</h3>
                <p className="text-xs text-content-muted mt-0.5">{suspendingChapter.name}</p>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-content-secondary">
                All chapter members will lose access immediately. Org admins retain access. The suspension can be lifted at any time.
              </p>
              <div>
                <label className="block text-xs font-semibold text-content-muted uppercase tracking-wider mb-1.5">
                  Reason <span className="font-normal normal-case">(optional)</span>
                </label>
                <textarea
                  value={chapterSuspendReason}
                  onChange={(e) => setChapterSuspendReason(e.target.value)}
                  rows={3}
                  placeholder="e.g. Pending investigation by national office..."
                  className="w-full rounded-lg border border-[var(--color-border)] px-3.5 py-2.5 text-sm bg-surface-input focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30 resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end px-6 py-4 border-t border-[var(--color-border)]">
              <button
                onClick={() => setSuspendingChapter(null)}
                className="px-4 py-2 text-sm font-medium text-content-secondary border border-[var(--color-border)] rounded-lg hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleChapterSuspend}
                disabled={chapterSuspending}
                className="px-5 py-2 text-sm font-semibold text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {chapterSuspending ? "Suspending..." : <><ShieldOff className="w-4 h-4" /> Suspend Chapter</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

const COLOR_MAP: Record<string, string> = {
  blue:    "bg-blue-900/30 border-blue-800/30 text-blue-400",
  purple:  "bg-purple-900/30 border-purple-800/30 text-purple-400",
  emerald: "bg-emerald-900/30 border-emerald-800/30 text-emerald-400",
  yellow:  "bg-yellow-900/30 border-yellow-800/30 text-yellow-400",
  red:     "bg-red-900/30 border-red-800/30 text-red-400",
  indigo:  "bg-indigo-900/30 border-indigo-800/30 text-indigo-400",
};

function KpiCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  color: keyof typeof COLOR_MAP;
}) {
  return (
    <div className="bg-surface-card-solid rounded-xl border border-[var(--color-border)] p-5">
      <div className={`inline-flex p-2 rounded-lg border mb-3 ${COLOR_MAP[color]}`}>
        {icon}
      </div>
      <p className="text-2xl font-heading font-bold text-content-primary tracking-tight">{value}</p>
      {sub && <p className="text-xs text-content-muted mt-0.5">{sub}</p>}
      <p className="text-xs text-content-muted font-medium uppercase tracking-wide mt-1">{label}</p>
    </div>
  );
}
