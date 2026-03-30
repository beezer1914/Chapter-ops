import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { useAuthStore } from "@/stores/authStore";
import {
  fetchAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  previewEmailBlast,
  sendEmailBlast,
} from "@/services/commsService";
import type {
  Announcement,
  CreateAnnouncementRequest,
  EmailBlastAudience,
  MemberRole,
} from "@/types";
import {
  Megaphone,
  Mail,
  Pin,
  PinOff,
  Pencil,
  Trash2,
  Plus,
  X,
  CheckCircle,
  ChevronDown,
} from "lucide-react";

const ROLE_HIERARCHY: Record<MemberRole, number> = {
  member: 0, secretary: 1, treasurer: 2, vice_president: 3, president: 4, admin: 5,
};

const AUDIENCE_OPTIONS: { value: EmailBlastAudience; label: string; description: string }[] = [
  { value: "all", label: "All Members", description: "Everyone in the chapter" },
  { value: "financial", label: "Financial Members", description: "Members in good financial standing" },
  { value: "not_financial", label: "Non-Financial Members", description: "Members who owe dues" },
  { value: "secretary", label: "Officers (Secretary+)", description: "Secretary, treasurer, VPs, president" },
  { value: "treasurer", label: "Senior Officers (Treasurer+)", description: "Treasurer, VPs, president" },
  { value: "president", label: "Presidents Only", description: "Chapter president" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

type Tab = "announcements" | "email_blast";

export default function Communications() {
  const { memberships, user } = useAuthStore();
  const [tab, setTab] = useState<Tab>("announcements");

  const currentMembership = memberships.find((m) => m.chapter_id === user?.active_chapter_id);
  const currentRole = currentMembership?.role ?? "member";
  const isOfficer = ROLE_HIERARCHY[currentRole] >= ROLE_HIERARCHY["secretary"];

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-content-primary font-heading">Communications</h1>
          <p className="text-content-secondary mt-1">Announcements and chapter-wide messaging.</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white/10 rounded-xl p-1 w-fit">
          <button
            onClick={() => setTab("announcements")}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              tab === "announcements" ? "bg-surface-card-solid text-content-primary shadow-glass" : "text-content-secondary hover:text-content-secondary"
            }`}
          >
            <Megaphone className="w-4 h-4" />
            Announcements
          </button>
          {isOfficer && (
            <button
              onClick={() => setTab("email_blast")}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                tab === "email_blast" ? "bg-surface-card-solid text-content-primary shadow-glass" : "text-content-secondary hover:text-content-secondary"
              }`}
            >
              <Mail className="w-4 h-4" />
              Email Blast
            </button>
          )}
        </div>

        {tab === "announcements" && (
          <AnnouncementsTab isOfficer={isOfficer} currentUserId={user?.id ?? ""} />
        )}
        {tab === "email_blast" && isOfficer && <EmailBlastTab />}
      </div>
    </Layout>
  );
}

// ── Announcements Tab ─────────────────────────────────────────────────────────

function AnnouncementsTab({
  isOfficer,
  currentUserId,
}: {
  isOfficer: boolean;
  currentUserId: string;
}) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      setAnnouncements(await fetchAnnouncements());
    } catch {
      setError("Failed to load announcements.");
    } finally {
      setLoading(false);
    }
  }

  async function handleTogglePin(a: Announcement) {
    try {
      const updated = await updateAnnouncement(a.id, { is_pinned: !a.is_pinned });
      setAnnouncements((prev) => prev.map((x) => (x.id === updated.id ? updated : x))
        .sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned)));
    } catch {
      setError("Failed to update announcement.");
    }
  }

  async function handleDelete(a: Announcement) {
    if (!confirm(`Delete "${a.title}"?`)) return;
    try {
      await deleteAnnouncement(a.id);
      setAnnouncements((prev) => prev.filter((x) => x.id !== a.id));
    } catch {
      setError("Failed to delete announcement.");
    }
  }

  function openCreate() {
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(a: Announcement) {
    setEditing(a);
    setShowForm(true);
  }

  function handleSaved(a: Announcement) {
    setAnnouncements((prev) => {
      const exists = prev.find((x) => x.id === a.id);
      const next = exists ? prev.map((x) => (x.id === a.id ? a : x)) : [a, ...prev];
      return next.sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned));
    });
    setShowForm(false);
  }

  return (
    <div className="space-y-4">
      {isOfficer && (
        <div className="flex justify-end">
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-5 py-2.5 bg-brand-primary-main text-white font-semibold rounded-xl shadow-glass ring-1 ring-brand-primary-dark/20 hover:bg-brand-primary-dark transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Announcement
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-900/20 border border-red-900/30 rounded-xl text-sm text-red-400">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-brand-primary-light border-t-brand-primary-main rounded-full animate-spin" />
        </div>
      ) : announcements.length === 0 ? (
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-glass border border-white/40 p-12 text-center">
          <Megaphone className="w-12 h-12 text-content-muted mx-auto mb-3" />
          <p className="text-content-secondary text-sm">No announcements yet.</p>
        </div>
      ) : (
        announcements.map((a) => (
          <AnnouncementCard
            key={a.id}
            announcement={a}
            isOfficer={isOfficer}
            currentUserId={currentUserId}
            onTogglePin={() => void handleTogglePin(a)}
            onEdit={() => openEdit(a)}
            onDelete={() => void handleDelete(a)}
          />
        ))
      )}

      {showForm && (
        <AnnouncementFormModal
          editing={editing}
          onSaved={handleSaved}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}

function AnnouncementCard({
  announcement: a,
  isOfficer,
  onTogglePin,
  onEdit,
  onDelete,
}: {
  announcement: Announcement;
  isOfficer: boolean;
  currentUserId: string;
  onTogglePin: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = a.body.length > 300;
  const displayBody = isLong && !expanded ? a.body.slice(0, 300) + "…" : a.body;

  return (
    <div className={`bg-surface-card-solid backdrop-blur-xl rounded-2xl shadow-glass border p-6 ${
      a.is_pinned ? "border-brand-primary-main/30 ring-1 ring-brand-primary-main/20" : "border-[var(--color-border)]"
    }`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {a.is_pinned && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-brand-primary-main/10 text-brand-primary-dark text-xs font-semibold rounded-full">
                <Pin className="w-3 h-3" /> Pinned
              </span>
            )}
            {a.expires_at && (
              <span className="text-xs text-content-muted">Expires {formatDate(a.expires_at)}</span>
            )}
          </div>
          <h3 className="text-base font-semibold text-content-primary">{a.title}</h3>
          <p className="text-sm text-content-secondary mt-0.5">
            {a.author ? `${a.author.first_name} ${a.author.last_name}` : "Unknown"} · {formatDate(a.created_at)}
          </p>
        </div>

        {isOfficer && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onTogglePin}
              title={a.is_pinned ? "Unpin" : "Pin"}
              className="p-2 text-content-muted hover:text-brand-primary-dark hover:bg-white/10 rounded-lg transition-colors"
            >
              {a.is_pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
            </button>
            <button
              onClick={onEdit}
              className="p-2 text-content-muted hover:text-content-secondary hover:bg-white/10 rounded-lg transition-colors"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={onDelete}
              className="p-2 text-content-muted hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      <div className="mt-4 text-sm text-content-secondary leading-relaxed whitespace-pre-wrap">
        {displayBody}
      </div>
      {isLong && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-xs text-brand-primary-dark hover:underline font-medium"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}

function AnnouncementFormModal({
  editing,
  onSaved,
  onClose,
}: {
  editing: Announcement | null;
  onSaved: (a: Announcement) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(editing?.title ?? "");
  const [body, setBody] = useState(editing?.body ?? "");
  const [isPinned, setIsPinned] = useState(editing?.is_pinned ?? false);
  const [expiresAt, setExpiresAt] = useState(
    editing?.expires_at ? editing.expires_at.slice(0, 16) : ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      setError("Title and body are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: CreateAnnouncementRequest = {
        title: title.trim(),
        body: body.trim(),
        is_pinned: isPinned,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      };
      let result: Announcement;
      if (editing) {
        result = await updateAnnouncement(editing.id, payload);
      } else {
        result = await createAnnouncement(payload);
      }
      onSaved(result);
    } catch {
      setError("Failed to save announcement.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-surface-card-solid rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <h2 className="text-lg font-semibold text-content-primary">
            {editing ? "Edit Announcement" : "New Announcement"}
          </h2>
          <button onClick={onClose} className="p-1.5 text-content-muted hover:text-content-secondary hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-900/20 border border-red-900/30 rounded-lg text-sm text-red-400">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="Announcement title"
              className="w-full px-3 py-2 border border-[var(--color-border-brand)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary-main/30"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              rows={5}
              placeholder="Write your announcement here…"
              className="w-full px-3 py-2 border border-[var(--color-border-brand)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary-main/30 resize-none"
            />
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-content-secondary">
              <input
                type="checkbox"
                checked={isPinned}
                onChange={(e) => setIsPinned(e.target.checked)}
                className="w-4 h-4 accent-brand-primary-main"
              />
              Pin to top
            </label>

            <div className="flex-1">
              <label className="block text-xs font-medium text-content-secondary mb-1">Expires (optional)</label>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full px-2 py-1.5 border border-[var(--color-border-brand)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary-main/30"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-content-secondary bg-surface-card-solid border border-[var(--color-border-brand)] rounded-lg hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-sm font-medium text-white bg-brand-primary-main rounded-lg hover:bg-brand-primary-dark disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : editing ? "Save Changes" : "Post Announcement"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Email Blast Tab ───────────────────────────────────────────────────────────

function EmailBlastTab() {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<EmailBlastAudience>("all");
  const [preview, setPreview] = useState<{ count: number; audience_label: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadPreview(a: EmailBlastAudience) {
    setPreviewLoading(true);
    try {
      setPreview(await previewEmailBlast(a));
    } catch {
      // ignore preview errors
    } finally {
      setPreviewLoading(false);
    }
  }

  function handleAudienceChange(a: EmailBlastAudience) {
    setAudience(a);
    setResult(null);
    void loadPreview(a);
  }

  useEffect(() => {
    void loadPreview(audience);
  }, []);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !body.trim()) {
      setError("Subject and body are required.");
      return;
    }
    if (!confirm(`Send this email to ${preview?.count ?? "?"} recipients?`)) return;
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const res = await sendEmailBlast({ subject: subject.trim(), body: body.trim(), audience });
      setResult(res);
      setSubject("");
      setBody("");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || "Failed to send email blast.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-glass border border-white/40 p-6">
      <h2 className="text-lg font-semibold text-content-primary mb-5">Send Email Blast</h2>

      {result && (
        <div className="mb-5 p-4 bg-green-900/20 border border-green-900/30 rounded-xl flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-green-400">Email sent!</p>
            <p className="text-sm text-green-400 mt-0.5">
              {result.sent} delivered{result.failed > 0 && `, ${result.failed} failed`} out of {result.total} recipients.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-5 p-3 bg-red-900/20 border border-red-900/30 rounded-xl text-sm text-red-400">{error}</div>
      )}

      <form onSubmit={(e) => void handleSend(e)} className="space-y-5">
        {/* Audience */}
        <div>
          <label className="block text-sm font-medium text-content-secondary mb-1.5">Audience</label>
          <div className="relative">
            <select
              value={audience}
              onChange={(e) => handleAudienceChange(e.target.value as EmailBlastAudience)}
              className="w-full appearance-none px-3 py-2.5 border border-[var(--color-border-brand)] rounded-lg text-sm bg-[var(--color-bg-input)] focus:outline-none focus:ring-2 focus:ring-brand-primary-main/30 pr-8"
            >
              {AUDIENCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label} — {o.description}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted pointer-events-none" />
          </div>
          <p className="mt-1.5 text-xs text-content-secondary">
            {previewLoading ? "Counting recipients…" : preview ? (
              <span>
                <span className="font-semibold text-content-secondary">{preview.count}</span> recipient{preview.count !== 1 ? "s" : ""} will receive this email.
              </span>
            ) : null}
          </p>
        </div>

        {/* Subject */}
        <div>
          <label className="block text-sm font-medium text-content-secondary mb-1.5">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
            placeholder="e.g. Important Chapter Update"
            className="w-full px-3 py-2.5 border border-[var(--color-border-brand)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary-main/30"
          />
          <p className="mt-1 text-xs text-content-muted">
            Recipients will see: <span className="font-mono">[{"{Chapter Name}"}] {subject || "Your subject"}</span>
          </p>
        </div>

        {/* Body */}
        <div>
          <label className="block text-sm font-medium text-content-secondary mb-1.5">Message</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            rows={8}
            placeholder="Write your message here…"
            className="w-full px-3 py-2.5 border border-[var(--color-border-brand)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary-main/30 resize-none"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={sending || (preview?.count === 0)}
            className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-brand-primary-main rounded-xl shadow-glass ring-1 ring-brand-primary-dark/20 hover:bg-brand-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Mail className="w-4 h-4" />
            {sending ? "Sending…" : `Send to ${preview?.count ?? "?"} Recipients`}
          </button>
        </div>
      </form>
    </div>
  );
}
