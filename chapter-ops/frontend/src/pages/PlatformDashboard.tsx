import Layout from "@/components/Layout";
import PendingChapterRequestsSection from "@/components/PendingChapterRequestsSection";

export default function PlatformDashboard() {
  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8">
        <div className="mb-8">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-content-muted mb-2">
            Platform Admin
          </div>
          <h1 className="font-heading text-4xl font-black tracking-tight">
            Platform Dashboard
          </h1>
          <p className="text-content-secondary mt-2 max-w-2xl">
            Cross-org actions requiring platform admin attention. New IHQ claims,
            unaffiliated-org chapter requests, and other concerns that don't
            belong to any single organization live here.
          </p>
        </div>

        <PendingChapterRequestsSection
          title="Chapter Requests — Unaffiliated Orgs"
          scope="platform_admin"
          emptyMessage="No pending chapter requests for unaffiliated organizations."
        />
      </div>
    </Layout>
  );
}
