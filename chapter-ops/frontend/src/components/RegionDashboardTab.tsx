import { Building2, Users, TrendingUp, DollarSign, FileText, AlertCircle } from "lucide-react";
import ChapterHealthTable from "@/components/ChapterHealthTable";
import type { RegionDashboardPayload, RegionDashboardOfficer } from "@/types";

const ROLE_LABELS: Record<RegionDashboardOfficer["role"], string> = {
  regional_director: "Regional Director",
  regional_1st_vice: "Regional 1st Vice",
  regional_2nd_vice: "Regional 2nd Vice",
  regional_secretary: "Regional Secretary",
  regional_treasurer: "Regional Treasurer",
};

function formatCurrency(s: string): string {
  return `$${parseFloat(s).toLocaleString(undefined, {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;
}

interface Props {
  payload: RegionDashboardPayload;
}

export default function RegionDashboardTab({ payload }: Props) {
  const { kpis, chapters, invoice_snapshot, officer_summary, agent_findings } = payload;

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard
          icon={<Building2 className="w-5 h-5" />}
          label="Chapters"
          value={String(kpis.chapter_count)}
          sublabel={`${kpis.chapter_count_active} active · ${kpis.chapter_count_suspended} suspended`}
        />
        <KpiCard
          icon={<Users className="w-5 h-5" />}
          label="Members"
          value={String(kpis.member_count)}
        />
        <KpiCard
          icon={<TrendingUp className="w-5 h-5" />}
          label="Financial Rate"
          value={`${kpis.financial_rate.toFixed(1)}%`}
        />
        <KpiCard
          icon={<DollarSign className="w-5 h-5" />}
          label="Dues YTD"
          value={formatCurrency(kpis.dues_ytd)}
        />
        <KpiCard
          icon={<FileText className="w-5 h-5" />}
          label="Invoices Outstanding"
          value={formatCurrency(kpis.invoices_outstanding_total)}
        />
      </div>

      {/* Chapter Health table */}
      <section>
        <h3 className="text-lg font-heading font-bold text-content-primary mb-3">Chapter Health</h3>
        <ChapterHealthTable chapters={chapters} showRegionColumn={false} />
      </section>

      {/* Invoice snapshot + Officer roster + Agent findings (3-column grid on desktop) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card title="Regional Invoices">
          <div className="space-y-1.5 text-sm">
            <SnapshotRow label="Draft" value={invoice_snapshot.draft} />
            <SnapshotRow label="Sent" value={invoice_snapshot.sent} />
            <SnapshotRow label="Paid" value={invoice_snapshot.paid} />
            <SnapshotRow label="Overdue" value={invoice_snapshot.overdue} />
            <SnapshotRow label="Cancelled" value={invoice_snapshot.cancelled} />
            <div className="pt-2 mt-2 border-t border-[var(--color-border)] flex justify-between font-semibold">
              <span className="text-content-secondary">Outstanding</span>
              <span className="text-content-primary">{formatCurrency(invoice_snapshot.outstanding_total)}</span>
            </div>
          </div>
        </Card>

        <Card title="Officers">
          {officer_summary.length === 0 ? (
            <p className="text-sm text-content-muted">No officers assigned.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {officer_summary.map((o) => (
                <li key={o.user_id}>
                  <p className="font-medium text-content-primary">{o.full_name}</p>
                  <p className="text-xs text-content-muted">{ROLE_LABELS[o.role]}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Agent Findings">
          {agent_findings.length === 0 ? (
            <div className="text-sm text-content-muted flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>No findings yet. Color-coded chapter health and Ops Agent suggestions will appear here once that feature ships.</span>
            </div>
          ) : (
            <ul className="space-y-2 text-sm">
              {agent_findings.map((f, i) => (
                <li key={i} className="border-l-2 border-amber-400 pl-3">
                  <p className="font-medium text-content-primary">{f.summary}</p>
                  {f.detail && <p className="text-xs text-content-muted">{f.detail}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  icon, label, value, sublabel,
}: { icon: React.ReactNode; label: string; value: string; sublabel?: string }) {
  return (
    <div className="bg-surface-card-solid rounded-xl border border-[var(--color-border)] p-4">
      <div className="flex items-center gap-2 text-content-muted">
        {icon}
        <span className="text-xs uppercase tracking-wide font-semibold">{label}</span>
      </div>
      <p className="text-2xl font-heading font-extrabold text-content-primary mt-2">{value}</p>
      {sublabel && <p className="text-xs text-content-muted mt-1">{sublabel}</p>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-card-solid rounded-xl border border-[var(--color-border)] p-5">
      <h4 className="font-heading font-bold text-content-primary mb-3">{title}</h4>
      {children}
    </div>
  );
}

function SnapshotRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-content-secondary">{label}</span>
      <span className="text-content-primary font-medium">{value}</span>
    </div>
  );
}
