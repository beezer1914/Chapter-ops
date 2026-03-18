import { useEffect, useState } from "react";
import { Map, Building2, Users } from "lucide-react";
import Layout from "@/components/Layout";
import api from "@/lib/api";
import type { RegionDashboardData } from "@/types";

export default function RegionDashboard() {
  const [data, setData] = useState<RegionDashboardData | null>(null);
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
  }, []);

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-heading font-extrabold text-gray-900 tracking-tight">
            Regional Dashboard
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            High-level overview of your regions.
          </p>
        </div>

        {loading && (
          <div className="text-gray-500 text-sm py-10 text-center">
            Loading regional data...
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">
            {error}
          </div>
        )}

        {!loading && !error && data && (
          <>
            {/* Top stat cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-lg shadow border border-gray-200 p-6 flex items-center gap-4">
                <div className="p-3 rounded-lg bg-brand-primary-light">
                  <Map className="w-6 h-6 text-brand-primary-dark" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                    Total Regions
                  </p>
                  <p className="text-2xl font-heading font-extrabold text-gray-900 mt-0.5">
                    {data.total_regions}
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow border border-gray-200 p-6 flex items-center gap-4">
                <div className="p-3 rounded-lg bg-brand-primary-light">
                  <Building2 className="w-6 h-6 text-brand-primary-dark" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                    Total Chapters
                  </p>
                  <p className="text-2xl font-heading font-extrabold text-gray-900 mt-0.5">
                    {data.total_chapters}
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow border border-gray-200 p-6 flex items-center gap-4">
                <div className="p-3 rounded-lg bg-brand-primary-light">
                  <Users className="w-6 h-6 text-brand-primary-dark" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                    Total Members
                  </p>
                  <p className="text-2xl font-heading font-extrabold text-gray-900 mt-0.5">
                    {data.total_members}
                  </p>
                </div>
              </div>
            </div>

            {/* Per-region cards */}
            {data.regions.length === 0 ? (
              <div className="bg-white rounded-lg shadow border border-gray-200 p-8 text-center text-gray-500 text-sm">
                You are not a regional director of any regions.
              </div>
            ) : (
              <div className="space-y-6">
                {data.regions.map((region) => (
                  <div
                    key={region.id}
                    className="bg-white rounded-lg shadow border border-gray-200 p-6"
                  >
                    {/* Region header */}
                    <div className="flex items-center gap-3 mb-4">
                      <h2 className="text-lg font-heading font-bold text-gray-900">
                        {region.name}
                      </h2>
                      {region.abbreviation && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-primary-light text-brand-primary-dark">
                          {region.abbreviation}
                        </span>
                      )}
                    </div>

                    {/* Inline stats */}
                    <div className="flex items-center gap-6 mb-5 text-sm text-gray-600">
                      <span className="flex items-center gap-1.5">
                        <Building2 className="w-4 h-4 text-brand-primary-main" />
                        <span>
                          <strong className="text-gray-900">{region.chapter_count}</strong> chapter
                          {region.chapter_count !== 1 ? "s" : ""}
                        </span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-brand-primary-main" />
                        <span>
                          <strong className="text-gray-900">{region.total_members}</strong> member
                          {region.total_members !== 1 ? "s" : ""}
                        </span>
                      </span>
                    </div>

                    {/* Chapters table */}
                    {region.chapters.length === 0 ? (
                      <p className="text-sm text-gray-400 italic">No active chapters in this region.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border border-gray-100">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-100">
                              <th className="text-left px-4 py-2.5 font-semibold text-gray-600 text-xs uppercase tracking-wide">
                                Chapter
                              </th>
                              <th className="text-right px-4 py-2.5 font-semibold text-gray-600 text-xs uppercase tracking-wide">
                                Members
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {region.chapters.map((ch) => (
                              <tr key={ch.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-4 py-3 text-gray-900 font-medium">
                                  {ch.name}
                                  {ch.abbreviation && (
                                    <span className="ml-2 text-xs text-gray-400">
                                      ({ch.abbreviation})
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right text-gray-600">
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
              <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
                <h3 className="text-sm font-heading font-semibold text-gray-900 mb-1">
                  Recent Chapter Activity
                </h3>
                <p className="text-xs text-gray-400">Activity feed coming soon.</p>
              </div>
              <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
                <h3 className="text-sm font-heading font-semibold text-gray-900 mb-1">
                  Financial Overview
                </h3>
                <p className="text-xs text-gray-400">Regional financial summary coming soon.</p>
              </div>
              <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
                <h3 className="text-sm font-heading font-semibold text-gray-900 mb-1">
                  Upcoming Regional Events
                </h3>
                <p className="text-xs text-gray-400">Event aggregation coming soon.</p>
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
