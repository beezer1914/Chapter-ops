import { useMemo, useState } from "react";
import { Search } from "lucide-react";

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
  deletion_scheduled_at: string | null;
}

interface Props {
  chapters: ChapterHealthRow[];
  showRegionColumn?: boolean;
  onChapterClick?: (chapterId: string) => void;
}

type SortKey = "name" | "member_count" | "financial_rate" | "dues_ytd";

export default function ChapterHealthTable({
  chapters,
  showRegionColumn = true,
  onChapterClick,
}: Props) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = chapters;
    if (q) {
      rows = rows.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.designation || "").toLowerCase().includes(q) ||
          (c.city || "").toLowerCase().includes(q)
      );
    }
    rows = [...rows].sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return rows;
  }, [chapters, search, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  const fmtRate = (r: number | null) => (r === null ? "—" : `${r.toFixed(1)}%`);
  const fmtDues = (d: string | null) =>
    d === null ? "—" : `$${parseFloat(d).toLocaleString(undefined, {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    })}`;

  return (
    <div className="space-y-3">
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

      <div className="bg-surface-card-solid rounded-xl border border-[var(--color-border)] overflow-x-auto">
        {filtered.length === 0 ? (
          <p className="px-5 py-10 text-center text-content-muted text-sm">
            No chapters match your filters.
          </p>
        ) : (
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-content-muted text-xs uppercase tracking-wider">
                <th className="px-5 py-3 text-left font-semibold cursor-pointer" onClick={() => toggleSort("name")}>
                  Chapter
                </th>
                {showRegionColumn && <th className="px-5 py-3 text-left font-semibold">Region</th>}
                <th className="px-5 py-3 text-right font-semibold cursor-pointer" onClick={() => toggleSort("member_count")}>
                  Members
                </th>
                <th className="px-5 py-3 text-right font-semibold cursor-pointer" onClick={() => toggleSort("financial_rate")}>
                  Financial Rate
                </th>
                <th className="px-5 py-3 text-right font-semibold cursor-pointer" onClick={() => toggleSort("dues_ytd")}>
                  Dues YTD
                </th>
                <th className="px-5 py-3 text-left font-semibold">Tier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  className={`transition-colors group ${c.suspended ? "bg-orange-900/5" : ""} ${onChapterClick ? "cursor-pointer hover:bg-white/[0.02]" : ""}`}
                  onClick={onChapterClick ? () => onChapterClick(c.id) : undefined}
                >
                  <td className="px-5 py-3.5">
                    <div className="font-medium text-content-primary">{c.name}</div>
                    {c.designation && <div className="text-xs text-content-muted">{c.designation}</div>}
                  </td>
                  {showRegionColumn && (
                    <td className="px-5 py-3.5 text-content-secondary">{c.region_name ?? "—"}</td>
                  )}
                  <td className="px-5 py-3.5 text-right text-content-primary">{c.member_count ?? "—"}</td>
                  <td className="px-5 py-3.5 text-right text-content-primary">{fmtRate(c.financial_rate)}</td>
                  <td className="px-5 py-3.5 text-right text-content-primary">{fmtDues(c.dues_ytd)}</td>
                  <td className="px-5 py-3.5 text-content-secondary capitalize">{c.subscription_tier}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
