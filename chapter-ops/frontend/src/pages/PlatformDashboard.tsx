import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import PendingChapterRequestsSection from "@/components/PendingChapterRequestsSection";
import { fetchPlatformDashboard } from "@/services/platformService";
import { formatDollars } from "@/lib/format";
import type { PlatformDashboardData } from "@/types/platform";
import { Building2, Users, Map, DollarSign } from "lucide-react";

function SummaryTile({
  label,
  value,
  delta,
  icon: Icon,
}: {
  label: string;
  value: string;
  delta?: string;
  icon: typeof Building2;
}) {
  return (
    <div className="bg-surface-card-solid rounded-xl border border-[var(--color-border)] p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-content-muted">
          {label}
        </span>
        <Icon className="w-4 h-4 text-content-muted" />
      </div>
      <div className="text-3xl font-heading font-black text-content-primary tabular-nums">
        {value}
      </div>
      {delta !== undefined && (
        <div className="text-xs text-content-muted mt-1.5">{delta}</div>
      )}
    </div>
  );
}

function TierMixCard({
  title,
  rows,
}: {
  title: string;
  rows: { tier: string; count: number }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="bg-surface-card-solid rounded-xl border border-[var(--color-border)] p-5">
      <h3 className="text-sm font-heading font-bold text-content-primary mb-4">{title}</h3>
      <div className="space-y-2.5">
        {rows.map((r) => (
          <div key={r.tier} className="flex items-center gap-3">
            <span className="text-xs text-content-secondary capitalize w-24 shrink-0">
              {r.tier}
            </span>
            <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-brand-primary-main transition-all"
                style={{ width: `${(r.count / max) * 100}%` }}
              />
            </div>
            <span className="text-sm font-semibold text-content-primary tabular-nums w-8 text-right">
              {r.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopChaptersTable({
  rows,
}: {
  rows: { id: string; name: string; organization_name: string; dues_ytd: string }[];
}) {
  if (rows.length === 0) {
    return (
      <div className="bg-surface-card-solid rounded-xl border border-[var(--color-border)] p-10 text-center text-content-muted text-sm">
        No chapters with recorded dues yet.
      </div>
    );
  }
  return (
    <div className="bg-surface-card-solid rounded-xl border border-[var(--color-border)] overflow-x-auto">
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr className="border-b border-[var(--color-border)] text-content-muted text-xs uppercase tracking-wider">
            <th className="px-5 py-3 text-left font-semibold">Chapter</th>
            <th className="px-5 py-3 text-left font-semibold">Organization</th>
            <th className="px-5 py-3 text-right font-semibold">Dues YTD</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
              <td className="px-5 py-3.5 font-medium text-content-primary">{r.name}</td>
              <td className="px-5 py-3.5 text-content-secondary">{r.organization_name}</td>
              <td className="px-5 py-3.5 text-right text-content-primary tabular-nums font-semibold">
                ${parseFloat(r.dues_ytd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PlatformDashboard() {
  const [data, setData] = useState<PlatformDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPlatformDashboard()
      .then(setData)
      .catch(() => setError("Failed to load platform dashboard."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 space-y-8">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-content-muted mb-2">
            Platform Admin
          </div>
          <h1 className="font-heading text-4xl font-black tracking-tight">
            Platform Dashboard
          </h1>
          <p className="text-content-secondary mt-2 max-w-2xl">
            Cross-org metrics and actions for Blue Column Systems staff.
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-900/20 border border-red-900/30 text-red-400 rounded-lg text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-content-muted text-sm">Loading platform metrics…</p>
        ) : data && (
          <>
            {/* Summary tiles */}
            <section>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <SummaryTile
                  label="Organizations"
                  value={data.summary.organizations.total.toString()}
                  delta={`+${data.summary.organizations.new_30d} last 30d`}
                  icon={Building2}
                />
                <SummaryTile
                  label="Chapters"
                  value={data.summary.chapters.total.toString()}
                  delta={`+${data.summary.chapters.new_30d} last 30d`}
                  icon={Map}
                />
                <SummaryTile
                  label="Members"
                  value={data.summary.members.total.toLocaleString()}
                  delta={`+${data.summary.members.new_30d} last 30d`}
                  icon={Users}
                />
                <SummaryTile
                  label="Dues YTD"
                  value={formatDollars(data.summary.dues_ytd)}
                  icon={DollarSign}
                />
              </div>
            </section>

            {/* Tier mix */}
            <section>
              <h2 className="text-lg font-heading font-bold text-content-primary mb-4">
                Tier Mix
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <TierMixCard
                  title="Organizations by Plan"
                  rows={data.tier_breakdown.organizations}
                />
                <TierMixCard
                  title="Chapters by Tier"
                  rows={data.tier_breakdown.chapters}
                />
              </div>
            </section>

            {/* Top chapters by dues */}
            <section>
              <h2 className="text-lg font-heading font-bold text-content-primary mb-4">
                Top Chapters by Dues YTD
              </h2>
              <TopChaptersTable rows={data.top_chapters_by_dues} />
            </section>
          </>
        )}

        <PendingChapterRequestsSection
          title="Chapter Requests — Unaffiliated Orgs"
          scope="platform_admin"
          emptyMessage="No pending chapter requests for unaffiliated organizations."
        />
      </div>
    </Layout>
  );
}
