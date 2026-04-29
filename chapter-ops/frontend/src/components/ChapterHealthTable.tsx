import { useMemo, useState } from "react";
import {
  Search,
  ChevronUp,
  ChevronDown,
  ShieldOff,
  AlertTriangle,
} from "lucide-react";
import { formatDollars } from "@/lib/format";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ChapterHealthRow {
  id: string;
  name: string;
  designation: string | null;
  region_id?: string | null;
  region_name?: string | null;
  chapter_type: "undergraduate" | "graduate";
  city: string | null;
  state: string | null;
  member_count: number | null;
  financial_rate: number | null;
  dues_ytd: string | null;
  subscription_tier: string;
  suspended: boolean;
  suspension_reason?: string | null;
  deletion_scheduled_at: string | null;
}

interface Props {
  chapters: ChapterHealthRow[];
  showRegionColumn?: boolean;
  onChapterClick?: (chapterId: string) => void;
  actions?: (chapter: ChapterHealthRow) => React.ReactNode;
}

type SortKey = "name" | "member_count" | "financial_rate" | "dues_ytd";
type SortDir = "asc" | "desc";

// ── Internal sub-components ────────────────────────────────────────────────

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

const TIER_STYLES: Record<string, string> = {
  starter:      "bg-zinc-800/60 text-zinc-400",
  pro:          "bg-blue-900/30 text-blue-400",
  elite:        "bg-amber-900/30 text-amber-400",
  organization: "bg-purple-900/30 text-purple-400",
  beta:         "bg-emerald-900/30 text-emerald-400",
};

function TierBadge({ tier }: { tier: string }) {
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${TIER_STYLES[tier] ?? TIER_STYLES.starter}`}>
      {tier}
    </span>
  );
}

function SortableTh({
  col,
  current,
  dir,
  onSort,
  children,
  right,
}: {
  col: SortKey;
  current: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
  children: React.ReactNode;
  right?: boolean;
}) {
  return (
    <th
      className={`px-5 py-3 font-semibold text-xs uppercase tracking-wider cursor-pointer hover:text-content-primary transition-colors select-none ${right ? "text-right" : "text-left"}`}
      onClick={() => onSort(col)}
    >
      <span className={`inline-flex items-center gap-1 ${right ? "flex-row-reverse" : ""}`}>
        {children}
        {current === col
          ? (dir === "asc"
            ? <ChevronUp className="w-3 h-3 text-brand-primary-light" />
            : <ChevronDown className="w-3 h-3 text-brand-primary-light" />)
          : <ChevronUp className="w-3 h-3 opacity-20" />
        }
      </span>
    </th>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function ChapterHealthTable({
  chapters,
  showRegionColumn = true,
  onChapterClick,
  actions,
}: Props) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const filtered = useMemo(() => {
    let rows = chapters;
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.designation?.toLowerCase() ?? "").includes(q) ||
          (c.city?.toLowerCase() ?? "").includes(q) ||
          (c.state?.toLowerCase() ?? "").includes(q)
      );
    }
    rows = [...rows].sort((a, b) => {
      let av: string | number = a[sortKey] ?? 0;
      let bv: string | number = b[sortKey] ?? 0;
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return rows;
  }, [chapters, search, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  // colspan for "no results" row
  const colCount =
    1 + // Chapter
    (showRegionColumn ? 1 : 0) + // Region
    3 + // Members, Financial Rate, Dues YTD
    1 + // Tier
    (actions ? 1 : 0); // Actions (optional)

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-muted" />
        <input
          type="text"
          placeholder="Search chapters..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 pr-4 py-2 text-sm rounded-lg border border-[var(--color-border)] text-content-primary bg-surface-input focus:outline-none focus:border-brand-primary-main w-full"
        />
      </div>

      <div className="bg-surface-card-solid rounded-xl border border-[var(--color-border)] overflow-hidden">
        {/* ── Desktop table ── */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-content-muted text-xs uppercase tracking-wider">
                <SortableTh col="name" current={sortKey} dir={sortDir} onSort={toggleSort}>
                  Chapter
                </SortableTh>
                {showRegionColumn && (
                  <th className="px-5 py-3 text-left font-semibold">Region</th>
                )}
                <SortableTh col="member_count" current={sortKey} dir={sortDir} onSort={toggleSort} right>
                  Members
                </SortableTh>
                <SortableTh col="financial_rate" current={sortKey} dir={sortDir} onSort={toggleSort} right>
                  Financial Rate
                </SortableTh>
                <SortableTh col="dues_ytd" current={sortKey} dir={sortDir} onSort={toggleSort} right>
                  Dues YTD
                </SortableTh>
                <th className="px-5 py-3 text-left font-semibold">Tier</th>
                {actions && (
                  <th className="px-5 py-3 text-right font-semibold">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-5 py-10 text-center text-content-muted text-sm">
                    No chapters match your filters.
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr
                    key={c.id}
                    className={`transition-colors group ${
                      c.suspended
                        ? "bg-orange-900/5 hover:bg-orange-900/10"
                        : c.deletion_scheduled_at
                          ? "opacity-60 hover:bg-white/[0.02]"
                          : "hover:bg-white/[0.02]"
                    } ${onChapterClick ? "cursor-pointer" : ""}`}
                    onClick={onChapterClick ? () => onChapterClick(c.id) : undefined}
                  >
                    <td className="px-5 py-3.5">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-content-primary">{c.name}</span>
                          {c.designation && (
                            <span className="text-xs text-content-muted">{c.designation}</span>
                          )}
                          {c.suspended && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-orange-400 bg-orange-900/30 px-1.5 py-0.5 rounded-full">
                              <ShieldOff className="w-2.5 h-2.5" /> Suspended
                            </span>
                          )}
                          {c.deletion_scheduled_at && (
                            <span className="inline-flex items-center gap-0.5 text-xs text-red-400">
                              <AlertTriangle className="w-3 h-3" />
                              Closing
                            </span>
                          )}
                        </div>
                        {c.suspended && c.suspension_reason && (
                          <p className="text-xs text-orange-400/70 mt-0.5">Reason: {c.suspension_reason}</p>
                        )}
                        {(c.city || c.state) && (
                          <p className="text-xs text-content-muted mt-0.5">
                            {[c.city, c.state].filter(Boolean).join(", ")}
                          </p>
                        )}
                      </div>
                    </td>
                    {showRegionColumn && (
                      <td className="px-5 py-3.5 text-content-secondary text-xs">
                        {c.region_name ?? <span className="text-content-muted italic">None</span>}
                      </td>
                    )}
                    <td className="px-5 py-3.5 text-right text-content-secondary tabular-nums">
                      {c.member_count !== null ? c.member_count.toLocaleString() : "—"}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end">
                        {c.financial_rate !== null
                          ? <RateBar rate={c.financial_rate} />
                          : <span className="text-content-muted text-xs">—</span>
                        }
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right text-content-secondary tabular-nums">
                      {c.dues_ytd !== null ? formatDollars(c.dues_ytd) : "—"}
                    </td>
                    <td className="px-5 py-3.5">
                      <TierBadge tier={c.subscription_tier} />
                    </td>
                    {actions && (
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          {actions(c)}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── Mobile card list ── */}
        <div className="md:hidden divide-y divide-white/5">
          {filtered.length === 0 ? (
            <p className="px-5 py-10 text-center text-content-muted text-sm">
              No chapters match your filters.
            </p>
          ) : (
            filtered.map((c) => (
              <div
                key={c.id}
                className={`px-4 py-4 ${c.suspended ? "bg-orange-900/5" : ""} ${c.deletion_scheduled_at ? "opacity-60" : ""}`}
                onClick={onChapterClick ? () => onChapterClick(c.id) : undefined}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-content-primary text-sm">{c.name}</span>
                      {c.designation && (
                        <span className="text-xs text-content-muted">{c.designation}</span>
                      )}
                      {c.suspended && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-orange-400 bg-orange-900/30 px-1.5 py-0.5 rounded-full">
                          <ShieldOff className="w-2.5 h-2.5" /> Suspended
                        </span>
                      )}
                      {c.deletion_scheduled_at && (
                        <span className="inline-flex items-center gap-0.5 text-xs text-red-400">
                          <AlertTriangle className="w-3 h-3" /> Closing
                        </span>
                      )}
                    </div>
                    {c.suspended && c.suspension_reason && (
                      <p className="text-xs text-orange-400/70 mt-0.5">Reason: {c.suspension_reason}</p>
                    )}
                    {(c.city || c.state) && (
                      <p className="text-xs text-content-muted">{[c.city, c.state].filter(Boolean).join(", ")}</p>
                    )}
                  </div>
                  <TierBadge tier={c.subscription_tier} />
                </div>
                <div className="flex items-center gap-4 text-xs text-content-muted">
                  <span>{c.member_count !== null ? c.member_count : "—"} members</span>
                  <span>{c.dues_ytd !== null ? formatDollars(c.dues_ytd) : "—"} YTD</span>
                  {c.financial_rate !== null && (
                    <span className={rateColor(c.financial_rate)}>{c.financial_rate.toFixed(0)}% financial</span>
                  )}
                </div>
                {showRegionColumn && c.region_name && (
                  <p className="text-xs text-content-muted mt-1">{c.region_name}</p>
                )}
                {actions && (
                  <div className="mt-3 flex gap-2">
                    {actions(c)}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
