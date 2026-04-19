import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Map, Building2, Users, AlertTriangle } from "lucide-react";
import Layout from "@/components/Layout";
import api from "@/lib/api";
import type { RegionDashboardData, IncidentStats } from "@/types";
import { fetchIncidentStats } from "@/services/incidentService";

export default function RegionDashboard() {
  const [data, setData] = useState<RegionDashboardData | null>(null);
  const [incidentStats, setIncidentStats] = useState<IncidentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get("/regions/my-dashboard")
      .then((res) => {
        setData(res.data);
      })
      .catch(() => {
        setError("Failed to load regional data.");
      })
      .finally(() => {
        setLoading(false);
      });

    fetchIncidentStats()
      .then(setIncidentStats)
      .catch(() => {
        // Incidents tile is optional — non-fatal if user lacks scope.
      });
  }, []);

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-heading font-extrabold text-content-primary tracking-tight">
            Regional Dashboard
          </h1>
          <p className="text-sm text-content-muted mt-1">
            High-level overview of your regions.
          </p>
        </div>

        {loading && (
          <div className="text-content-muted text-sm py-10 text-center">
            Loading regional data...
          </div>
        )}

        {error && (
          <div className="bg-red-900/20 border border-red-900/30 text-red-400 rounded-lg p-4 text-sm">
            {error}
          </div>
        )}

        {!loading && !error && data && (
          <>
            {/* Top stat cards */}
            <div className={`grid grid-cols-1 gap-4 ${incidentStats ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
              <div className="bg-surface-card-solid rounded-lg shadow border border-[var(--color-border)] p-6 flex items-center gap-4">
                <div className="p-3 rounded-lg bg-brand-primary-light">
                  <Map className="w-6 h-6 text-brand-primary-dark" />
                </div>
                <div>
                  <p className="text-xs text-content-muted font-medium uppercase tracking-wide">
                    Total Regions
                  </p>
                  <p className="text-2xl font-heading font-extrabold text-content-primary mt-0.5">
                    {data.total_regions}
                  </p>
                </div>
              </div>

              <div className="bg-surface-card-solid rounded-lg shadow border border-[var(--color-border)] p-6 flex items-center gap-4">
                <div className="p-3 rounded-lg bg-brand-primary-light">
                  <Building2 className="w-6 h-6 text-brand-primary-dark" />
                </div>
                <div>
                  <p className="text-xs text-content-muted font-medium uppercase tracking-wide">
                    Total Chapters
                  </p>
                  <p className="text-2xl font-heading font-extrabold text-content-primary mt-0.5">
                    {data.total_chapters}
                  </p>
                </div>
              </div>

              <div className="bg-surface-card-solid rounded-lg shadow border border-[var(--color-border)] p-6 flex items-center gap-4">
                <div className="p-3 rounded-lg bg-brand-primary-light">
                  <Users className="w-6 h-6 text-brand-primary-dark" />
                </div>
                <div>
                  <p className="text-xs text-content-muted font-medium uppercase tracking-wide">
                    Total Members
                  </p>
                  <p className="text-2xl font-heading font-extrabold text-content-primary mt-0.5">
                    {data.total_members}
                  </p>
                </div>
              </div>

              {incidentStats && (
                <Link
                  to="/incidents"
                  className={`rounded-lg shadow border p-6 flex items-center gap-4 transition-colors ${
                    incidentStats.critical_open > 0
                      ? "bg-red-50 border-red-300 hover:bg-red-100"
                      : incidentStats.open > 0
                        ? "bg-amber-50 border-amber-300 hover:bg-amber-100"
                        : "bg-surface-card-solid border-[var(--color-border)] hover:bg-[var(--color-bg-card-hover)]"
                  }`}
                >
                  <div
                    className={`p-3 rounded-lg ${
                      incidentStats.critical_open > 0
                        ? "bg-red-200"
                        : incidentStats.open > 0
                          ? "bg-amber-200"
                          : "bg-brand-primary-light"
                    }`}
                  >
                    <AlertTriangle
                      className={`w-6 h-6 ${
                        incidentStats.critical_open > 0
                          ? "text-red-800"
                          : incidentStats.open > 0
                            ? "text-amber-800"
                            : "text-brand-primary-dark"
                      }`}
                    />
                  </div>
                  <div>
                    <p className="text-xs text-content-muted font-medium uppercase tracking-wide">
                      Open Incidents
                    </p>
                    <p className="text-2xl font-heading font-extrabold text-content-primary mt-0.5">
                      {incidentStats.open}
                    </p>
                    {incidentStats.critical_open > 0 && (
                      <p className="text-[11px] font-semibold text-red-700 uppercase tracking-wide mt-0.5">
                        {incidentStats.critical_open} critical
                      </p>
                    )}
                  </div>
                </Link>
              )}
            </div>

            {/* Per-region cards */}
            {data.regions.length === 0 ? (
              <div className="bg-surface-card-solid rounded-lg shadow border border-[var(--color-border)] p-8 text-center text-content-muted text-sm">
                You are not a regional director of any regions.
              </div>
            ) : (
              <div className="space-y-6">
                {data.regions.map((region) => (
                  <div
                    key={region.id}
                    className="bg-surface-card-solid rounded-lg shadow border border-[var(--color-border)] p-6"
                  >
                    {/* Region header */}
                    <div className="flex items-center gap-3 mb-4">
                      <h2 className="text-lg font-heading font-bold text-content-primary">
                        {region.name}
                      </h2>
                      {region.abbreviation && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-primary-light text-brand-primary-dark">
                          {region.abbreviation}
                        </span>
                      )}
                    </div>

                    {/* Inline stats */}
                    <div className="flex items-center gap-6 mb-5 text-sm text-content-secondary">
                      <span className="flex items-center gap-1.5">
                        <Building2 className="w-4 h-4 text-brand-primary-main" />
                        <span>
                          <strong className="text-content-primary">{region.chapter_count}</strong> chapter
                          {region.chapter_count !== 1 ? "s" : ""}
                        </span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-brand-primary-main" />
                        <span>
                          <strong className="text-content-primary">{region.total_members}</strong> member
                          {region.total_members !== 1 ? "s" : ""}
                        </span>
                      </span>
                    </div>

                    {/* Chapters table */}
                    {region.chapters.length === 0 ? (
                      <p className="text-sm text-content-muted italic">No active chapters in this region.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="bg-white/5 border-b border-[var(--color-border)]">
                              <th className="text-left px-4 py-2.5 font-semibold text-content-secondary text-xs uppercase tracking-wide">
                                Chapter
                              </th>
                              <th className="text-right px-4 py-2.5 font-semibold text-content-secondary text-xs uppercase tracking-wide">
                                Members
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {region.chapters.map((ch) => (
                              <tr key={ch.id} className="hover:bg-white/5 transition-colors">
                                <td className="px-4 py-3 text-content-primary font-medium">
                                  {ch.name}
                                  {ch.abbreviation && (
                                    <span className="ml-2 text-xs text-content-muted">
                                      ({ch.abbreviation})
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right text-content-secondary">
                                  {ch.member_count}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Coming Soon stub cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-surface-card-solid rounded-lg shadow border border-[var(--color-border)] p-6">
                <h3 className="text-sm font-heading font-semibold text-content-primary mb-1">
                  Recent Chapter Activity
                </h3>
                <p className="text-xs text-content-muted">Activity feed coming soon.</p>
              </div>
              <div className="bg-surface-card-solid rounded-lg shadow border border-[var(--color-border)] p-6">
                <h3 className="text-sm font-heading font-semibold text-content-primary mb-1">
                  Financial Overview
                </h3>
                <p className="text-xs text-content-muted">Regional financial summary coming soon.</p>
              </div>
              <div className="bg-surface-card-solid rounded-lg shadow border border-[var(--color-border)] p-6">
                <h3 className="text-sm font-heading font-semibold text-content-primary mb-1">
                  Upcoming Regional Events
                </h3>
                <p className="text-xs text-content-muted">Event aggregation coming soon.</p>
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
