import { useState } from "react";
import Layout from "@/components/Layout";
import { useAuthStore } from "@/stores/authStore";
import { useConfigStore } from "@/stores/configStore";
import { useRegionStore } from "@/stores/regionStore";
import type { MemberRole } from "@/types";
import ProfileTab from "./settings/ProfileTab";
import OrgConfigTab from "./settings/OrgConfigTab";
import ChapterConfigTab from "./settings/ChapterConfigTab";
import StripeConnectSection from "./settings/StripeConnectSection";
import BrandingTab from "./settings/BrandingTab";
import AccessControlTab from "./settings/AccessControlTab";

const ROLE_HIERARCHY: Record<MemberRole, number> = {
  member: 0, secretary: 1, treasurer: 2, vice_president: 3, president: 4, admin: 5,
};

type Tab = "profile" | "organization" | "chapter" | "payments" | "branding" | "access";

const TAB_LABELS: Record<Tab, string> = {
  profile: "Profile",
  organization: "Organization",
  chapter: "Chapter",
  payments: "Payments",
  branding: "Branding",
  access: "Access Control",
};

export default function Settings() {
  const { memberships, user } = useAuthStore();
  const { orgConfig, chapterConfig, organizationId, chapterId, setOrgConfig, setChapterConfig } = useConfigStore();
  const { isOrgAdmin } = useRegionStore();

  const currentMembership = memberships.find(
    (m) => m.chapter_id === user?.active_chapter_id
  );
  const currentRole = currentMembership?.role ?? "member";
  const isAdmin = isOrgAdmin || ROLE_HIERARCHY[currentRole] >= ROLE_HIERARCHY["admin"];
  const isOfficer = isOrgAdmin || ROLE_HIERARCHY[currentRole] >= ROLE_HIERARCHY["secretary"];
  const isPresident = isAdmin || ROLE_HIERARCHY[currentRole] >= ROLE_HIERARCHY["president"];

  // Members default to Profile tab; officers default to Organization
  const [tab, setTab] = useState<Tab>(isOfficer ? "organization" : "profile");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Profile tab is always visible; officer tabs only for secretary+; access tab only for president+
  const visibleTabs: Tab[] = isOfficer
    ? ["profile", "organization", "chapter", "payments", "branding", ...(isPresident ? ["access" as Tab] : [])]
    : ["profile"];

  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-content-primary mb-6">Settings</h2>

        {error && (
          <div className="mb-4 p-3 bg-red-900/20 text-red-400 rounded-lg text-sm">
            {error}
            <button onClick={() => setError(null)} className="ml-2 font-medium underline">Dismiss</button>
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 bg-green-900/20 text-green-400 rounded-lg text-sm">
            {success}
            <button onClick={() => setSuccess(null)} className="ml-2 font-medium underline">Dismiss</button>
          </div>
        )}

        {isOfficer && !isAdmin && tab !== "profile" && (
          <div className="mb-4 p-3 bg-yellow-900/20 text-yellow-400 rounded-lg text-sm">
            You are viewing settings in read-only mode. Only admins can edit configuration.
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-[var(--color-border)] mb-6">
          <nav className="flex gap-6">
            {visibleTabs.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors ${tab === t
                  ? "border-brand-primary text-brand-primary"
                  : "border-transparent text-content-secondary hover:text-content-secondary"
                  }`}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </nav>
        </div>

        {tab === "profile" ? (
          <ProfileTab
            currentRole={currentRole}
            setError={setError}
            setSuccess={setSuccess}
          />
        ) : tab === "organization" ? (
          <OrgConfigTab
            config={orgConfig}
            isAdmin={isAdmin}
            setError={setError}
            setSuccess={setSuccess}
            onSave={setOrgConfig}
          />
        ) : tab === "chapter" ? (
          <ChapterConfigTab
            config={chapterConfig}
            isAdmin={isAdmin}
            currentRole={currentRole}
            setError={setError}
            setSuccess={setSuccess}
            onSave={setChapterConfig}
          />
        ) : tab === "payments" ? (
          <StripeConnectSection
            currentRole={currentRole}
            setError={setError}
            setSuccess={setSuccess}
          />
        ) : tab === "branding" ? (
          <BrandingTab
            orgConfig={orgConfig}
            chapterConfig={chapterConfig}
            isAdmin={isAdmin}
            currentRole={currentRole}
            organizationId={organizationId}
            chapterId={chapterId}
            setError={setError}
            setSuccess={setSuccess}
            onOrgUpdate={setOrgConfig}
            onChapterUpdate={setChapterConfig}
          />
        ) : (
          <AccessControlTab
            config={chapterConfig}
            isAdmin={isPresident}
            setError={setError}
            setSuccess={setSuccess}
            onSave={setChapterConfig}
          />
        )}
      </div>
    </Layout>
  );
}
