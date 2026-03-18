import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { useAuthStore } from "@/stores/authStore";
import { useConfigStore } from "@/stores/configStore";
import {
  fetchInvites,
  createInvite,
  revokeInvite,
} from "@/services/chapterService";
import type { InviteCode, MemberRole } from "@/types";

const ROLE_HIERARCHY: Record<MemberRole, number> = {
  member: 0,
  secretary: 1,
  treasurer: 2,
  vice_president: 3,
  president: 4,
  admin: 5,
};

const CREATABLE_ROLES: MemberRole[] = [
  "member",
  "secretary",
  "treasurer",
  "vice_president",
  "president",
];

export default function Invites() {
  const { memberships, user } = useAuthStore();
  const { getRoleLabel } = useConfigStore();
  const [invites, setInvites] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Create form state
  const [showForm, setShowForm] = useState(false);
  const [newRole, setNewRole] = useState<MemberRole>("member");
  const [newExpiry, setNewExpiry] = useState(7);
  const [creating, setCreating] = useState(false);

  const currentMembership = memberships.find(
    (m) => m.chapter_id === user?.active_chapter_id
  );
  const currentRole = currentMembership?.role ?? "member";
  const canCreate = ROLE_HIERARCHY[currentRole] >= ROLE_HIERARCHY["treasurer"];
  const canView = ROLE_HIERARCHY[currentRole] >= ROLE_HIERARCHY["secretary"];

  // Roles this user can create invites for (up to their own level)
  const allowedRoles = CREATABLE_ROLES.filter(
    (r) => ROLE_HIERARCHY[r] <= ROLE_HIERARCHY[currentRole]
  );

  useEffect(() => {
    if (canView) loadInvites();
    else setLoading(false);
  }, [canView]);

  async function loadInvites() {
    try {
      setLoading(true);
      const data = await fetchInvites();
      setInvites(data);
    } catch {
      setError("Failed to load invites.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const invite = await createInvite({
        role: newRole,
        expires_in_days: newExpiry,
      });
      setInvites((prev) => [invite, ...prev]);
      setShowForm(false);
      setNewRole("member");
      setNewExpiry(7);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error || "Failed to create invite.";
      setError(message);
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(invite: InviteCode) {
    if (!confirm(`Revoke invite code ${invite.code}?`)) return;
    try {
      await revokeInvite(invite.id);
      setInvites((prev) => prev.filter((i) => i.id !== invite.id));
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error || "Failed to revoke invite.";
      setError(message);
    }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  }

  function statusBadge(invite: InviteCode) {
    if (invite.used) {
      return (
        <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
          Used
        </span>
      );
    }
    if (!invite.is_valid) {
      return (
        <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
          Expired
        </span>
      );
    }
    return (
      <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        Active
      </span>
    );
  }

  if (!canView) {
    return (
      <Layout>
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Invites</h2>
          <div className="bg-white rounded-lg shadow p-6 text-gray-500">
            You need at least Secretary permissions to view invites.
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Invites</h2>
          {canCreate && (
            <button
              onClick={() => setShowForm(!showForm)}
              className="px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-brand-primary-dark"
            >
              {showForm ? "Cancel" : "Create Invite"}
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
            {error}
            <button onClick={() => setError(null)} className="ml-2 font-medium underline">
              Dismiss
            </button>
          </div>
        )}

        {/* Create Form */}
        {showForm && (
          <form
            onSubmit={handleCreate}
            className="bg-white rounded-lg shadow p-6 mb-6 space-y-4"
          >
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role
                </label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as MemberRole)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                >
                  {allowedRoles.map((role) => (
                    <option key={role} value={role}>
                      {getRoleLabel(role)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Expires in (days)
                </label>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={newExpiry}
                  onChange={(e) => setNewExpiry(Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-brand-primary-dark disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create Invite Code"}
            </button>
          </form>
        )}

        {/* Invites Table */}
        {loading ? (
          <div className="text-gray-500">Loading invites...</div>
        ) : invites.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-6 text-gray-500">
            No invite codes yet.{" "}
            {canCreate && "Click \"Create Invite\" to generate one."}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Code
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created By
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Expires
                  </th>
                  {canCreate && (
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {invites.map((invite) => (
                  <tr key={invite.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">
                          {invite.code}
                        </code>
                        <button
                          onClick={() => copyCode(invite.code)}
                          className="text-xs text-brand-primary hover:text-brand-primary-dark"
                        >
                          {copied === invite.code ? "Copied!" : "Copy"}
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {getRoleLabel(invite.role)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {statusBadge(invite)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {invite.created_by_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {invite.expires_at
                        ? new Date(invite.expires_at).toLocaleDateString()
                        : "Never"}
                    </td>
                    {canCreate && (
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                        {invite.is_valid && !invite.used && (
                          <button
                            onClick={() => handleRevoke(invite)}
                            className="text-red-600 hover:text-red-800 font-medium"
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
