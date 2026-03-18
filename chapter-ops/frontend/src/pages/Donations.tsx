import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Layout from "@/components/Layout";
import { useAuthStore } from "@/stores/authStore";
import { fetchDonations, createDonation } from "@/services/paymentService";
import { fetchMembers } from "@/services/chapterService";
import { createDonationCheckout } from "@/services/stripeService";
import type { DonationWithUser, MemberWithUser, MemberRole } from "@/types";

const ROLE_HIERARCHY: Record<MemberRole, number> = {
  member: 0, secretary: 1, treasurer: 2, vice_president: 3, president: 4, admin: 5,
};

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash", check: "Check", bank_transfer: "Bank Transfer", manual: "Manual",
};

export default function Donations() {
  const { memberships, user } = useAuthStore();
  const [donations, setDonations] = useState<DonationWithUser[]>([]);
  const [members, setMembers] = useState<MemberWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [stripeToast, setStripeToast] = useState<"success" | "cancelled" | null>(null);
  const [showStripeModal, setShowStripeModal] = useState(false);
  const [stripeAmount, setStripeAmount] = useState("");
  const [stripeNotes, setStripeNotes] = useState("");
  const [stripeSubmitting, setStripeSubmitting] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Form state
  const [donorName, setDonorName] = useState("");
  const [donorEmail, setDonorEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  const [linkedUser, setLinkedUser] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const currentMembership = memberships.find(
    (m) => m.chapter_id === user?.active_chapter_id
  );
  const currentRole = currentMembership?.role ?? "member";
  const canManage = ROLE_HIERARCHY[currentRole] >= ROLE_HIERARCHY["treasurer"];
  const canView = ROLE_HIERARCHY[currentRole] >= ROLE_HIERARCHY["secretary"];

  // Handle Stripe redirect params
  useEffect(() => {
    if (searchParams.get("stripe_success") === "1") {
      setStripeToast("success");
      searchParams.delete("stripe_success");
      setSearchParams(searchParams, { replace: true });
    } else if (searchParams.get("stripe_cancelled") === "1") {
      setStripeToast("cancelled");
      searchParams.delete("stripe_cancelled");
      setSearchParams(searchParams, { replace: true });
    }
  }, []);

  useEffect(() => {
    if (stripeToast) {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setStripeToast(null), 5000);
    }
  }, [stripeToast]);

  async function handleStripeCheckout(e: React.FormEvent) {
    e.preventDefault();
    setStripeSubmitting(true);
    setError(null);
    try {
      const url = await createDonationCheckout({
        amount: parseFloat(stripeAmount),
        notes: stripeNotes || undefined,
      });
      window.location.href = url;
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error ?? "Failed to create donation session.";
      setError(msg);
      setStripeSubmitting(false);
    }
  }

  useEffect(() => {
    if (canView) loadData();
    else setLoading(false);
  }, [canView]);

  async function loadData() {
    setLoading(true);
    try {
      const [donationsData, membersData] = await Promise.all([
        fetchDonations(),
        fetchMembers(),
      ]);
      setDonations(donationsData);
      setMembers(membersData);
    } catch {
      setError("Failed to load donations.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const donation = await createDonation({
        donor_name: donorName,
        donor_email: donorEmail || undefined,
        amount: parseFloat(amount),
        method,
        notes: notes || undefined,
        user_id: linkedUser || undefined,
      });
      setDonations((prev) => [donation, ...prev]);
      setShowForm(false);
      setDonorName("");
      setDonorEmail("");
      setAmount("");
      setMethod("cash");
      setNotes("");
      setLinkedUser("");
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error || "Failed to record donation.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  // Compute total
  const totalDonations = donations.reduce(
    (sum, d) => sum + parseFloat(d.amount),
    0
  );

  // Members get a donate-only view (no access to donation records)
  if (!canView) {
    return (
      <Layout>
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Donations</h2>

          {stripeToast === "success" && (
            <div className="mb-4 p-3 bg-green-50 text-green-800 rounded-lg text-sm flex justify-between">
              Thank you for your donation! It is being processed.
              <button onClick={() => setStripeToast(null)} className="ml-2 font-medium underline">Dismiss</button>
            </div>
          )}
          {stripeToast === "cancelled" && (
            <div className="mb-4 p-3 bg-yellow-50 text-yellow-800 rounded-lg text-sm flex justify-between">
              Donation cancelled. You can try again whenever you're ready.
              <button onClick={() => setStripeToast(null)} className="ml-2 font-medium underline">Dismiss</button>
            </div>
          )}
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
              {error}
              <button onClick={() => setError(null)} className="ml-2 font-medium underline">Dismiss</button>
            </div>
          )}

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-1">Make a Donation</h3>
            <p className="text-sm text-gray-500 mb-4">Support your chapter by making a donation via Stripe's secure checkout.</p>
            <button
              onClick={() => setShowStripeModal(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-brand-primary-dark"
            >
              Donate via Stripe
            </button>
          </div>

          {showStripeModal && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
              <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Donate via Stripe</h3>
                <form onSubmit={handleStripeCheckout} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
                    <input
                      type="number" step="0.01" min="0.01"
                      value={stripeAmount}
                      onChange={(e) => setStripeAmount(e.target.value)}
                      required placeholder="0.00"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                    <input
                      type="text"
                      value={stripeNotes}
                      onChange={(e) => setStripeNotes(e.target.value)}
                      placeholder="Purpose or message..."
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                    />
                  </div>
                  <p className="text-xs text-gray-400">You'll be redirected to Stripe's secure checkout page.</p>
                  <div className="flex gap-3">
                    <button type="submit" disabled={stripeSubmitting}
                      className="flex-1 px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-brand-primary-dark disabled:opacity-50">
                      {stripeSubmitting ? "Redirecting..." : "Continue to Stripe"}
                    </button>
                    <button type="button" onClick={() => { setShowStripeModal(false); setStripeAmount(""); setStripeNotes(""); }}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Donations</h2>
          <div className="flex gap-3">
            <button
              onClick={() => setShowStripeModal(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-brand-primary-dark"
            >
              Donate via Stripe
            </button>
            {canManage && (
              <button
                onClick={() => setShowForm(!showForm)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                {showForm ? "Cancel" : "Record Donation"}
              </button>
            )}
          </div>
        </div>

        {stripeToast === "success" && (
          <div className="mb-4 p-3 bg-green-50 text-green-800 rounded-lg text-sm flex justify-between">
            Donation completed! Thank you — your donation will be recorded shortly.
            <button onClick={() => setStripeToast(null)} className="ml-2 font-medium underline">Dismiss</button>
          </div>
        )}
        {stripeToast === "cancelled" && (
          <div className="mb-4 p-3 bg-yellow-50 text-yellow-800 rounded-lg text-sm flex justify-between">
            Donation was cancelled. You can try again whenever you're ready.
            <button onClick={() => setStripeToast(null)} className="ml-2 font-medium underline">Dismiss</button>
          </div>
        )}

        {showStripeModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Donate via Stripe</h3>
              <form onSubmit={handleStripeCheckout} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={stripeAmount}
                    onChange={(e) => setStripeAmount(e.target.value)}
                    required
                    placeholder="0.00"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notes <span className="text-gray-400">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={stripeNotes}
                    onChange={(e) => setStripeNotes(e.target.value)}
                    placeholder="e.g., In memory of..."
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  />
                </div>
                <p className="text-xs text-gray-400">
                  You'll be redirected to Stripe's secure checkout. Your name will be recorded automatically.
                </p>
                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={stripeSubmitting}
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-brand-primary-dark disabled:opacity-50"
                  >
                    {stripeSubmitting ? "Redirecting..." : "Continue to Stripe"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowStripeModal(false); setStripeAmount(""); setStripeNotes(""); }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
            {error}
            <button onClick={() => setError(null)} className="ml-2 font-medium underline">Dismiss</button>
          </div>
        )}

        {/* Summary */}
        {donations.length > 0 && (
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <span className="text-sm text-gray-500">Total Donations: </span>
            <span className="text-lg font-bold text-gray-900">
              ${totalDonations.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </span>
          </div>
        )}

        {/* Form */}
        {showForm && (
          <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 mb-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Donor Name
                </label>
                <input
                  type="text"
                  value={donorName}
                  onChange={(e) => setDonorName(e.target.value)}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Donor Email <span className="text-gray-400">(optional)</span>
                </label>
                <input
                  type="email"
                  value={donorEmail}
                  onChange={(e) => setDonorEmail(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Method</label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                >
                  {Object.entries(METHOD_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Link to Member <span className="text-gray-400">(optional)</span>
                </label>
                <select
                  value={linkedUser}
                  onChange={(e) => setLinkedUser(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                >
                  <option value="">None (external donor)</option>
                  {members.map((m) => (
                    <option key={m.user.id} value={m.user.id}>
                      {m.user.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes <span className="text-gray-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g., Fundraiser event"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-brand-primary-dark disabled:opacity-50"
            >
              {submitting ? "Recording..." : "Record Donation"}
            </button>
          </form>
        )}

        {/* Table */}
        {loading ? (
          <div className="text-gray-500">Loading donations...</div>
        ) : donations.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-6 text-gray-500">
            No donations recorded yet.
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Donor</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {donations.map((d) => (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(d.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {d.donor_name}
                      {d.user && (
                        <span className="ml-1 text-xs text-brand-primary">(member)</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {d.donor_email ?? "—"}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      ${parseFloat(d.amount).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {METHOD_LABELS[d.method] ?? d.method}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-400 truncate max-w-[200px]">
                      {d.notes ?? "—"}
                    </td>
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
