import { useState, useEffect, useRef } from "react";
import Layout from "@/components/Layout";
import { useAuthStore } from "@/stores/authStore";
import {
  fetchDocuments,
  uploadDocument,
  updateDocument,
  deleteDocument,
  getDownloadUrl,
} from "@/services/documentService";
import type { Document, DocumentCategory, MemberRole } from "@/types";
import {
  FileText,
  FileSpreadsheet,
  FileImage,
  File,
  Upload,
  Download,
  Trash2,
  Pencil,
  X,
  Check,
  Loader2,
  FolderOpen,
} from "lucide-react";

const ROLE_HIERARCHY: Record<MemberRole, number> = {
  member: 0, secretary: 1, treasurer: 2, vice_president: 3, president: 4, admin: 5,
  regional_director: 5, regional_1st_vice: 4,
};

const CATEGORIES: { value: DocumentCategory | "all"; label: string }[] = [
  { value: "all", label: "All Files" },
  { value: "minutes", label: "Meeting Minutes" },
  { value: "bylaws", label: "Bylaws & Policies" },
  { value: "financials", label: "Financials" },
  { value: "forms", label: "Forms" },
  { value: "other", label: "Other" },
];

const CATEGORY_COLORS: Record<DocumentCategory, string> = {
  minutes: "bg-blue-900/30 text-blue-400",
  bylaws: "bg-purple-900/30 text-purple-400",
  financials: "bg-emerald-900/30 text-emerald-400",
  forms: "bg-amber-900/30 text-amber-400",
  other: "bg-white/10 text-content-secondary",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function FileIcon({ mimeType, className }: { mimeType: string; className?: string }) {
  if (mimeType.startsWith("image/")) return <FileImage className={className} />;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType === "text/csv")
    return <FileSpreadsheet className={className} />;
  if (mimeType === "application/pdf" || mimeType.includes("word") || mimeType.includes("presentation"))
    return <FileText className={className} />;
  return <File className={className} />;
}

// ── Upload Modal ──────────────────────────────────────────────────────────────

function UploadModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (doc: Document) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<DocumentCategory>("other");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) { setError("Please select a file."); return; }
    if (!title.trim()) { setError("Title is required."); return; }
    setSaving(true);
    setError("");
    try {
      const doc = await uploadDocument(title.trim(), file, category, description.trim() || undefined);
      onSuccess(doc);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || "Upload failed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-card-solid rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <h2 className="text-lg font-semibold text-content-primary">Upload Document</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-5 h-5 text-content-secondary" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-900/20 border border-red-900/30 text-red-400 text-sm rounded-lg px-4 py-2.5">{error}</div>
          )}

          {/* File drop zone */}
          <div
            className="border-2 border-dashed border-[var(--color-border)] rounded-xl p-6 text-center cursor-pointer hover:border-brand-primary-main hover:bg-brand-primary-light/10 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileText className="w-8 h-8 text-brand-primary-main" />
                <div className="text-left">
                  <p className="text-sm font-medium text-content-primary truncate max-w-xs">{file.name}</p>
                  <p className="text-xs text-content-muted">{formatBytes(file.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setFile(null); }}
                  className="ml-2 p-1 hover:bg-white/10 rounded"
                >
                  <X className="w-4 h-4 text-content-muted" />
                </button>
              </div>
            ) : (
              <div>
                <Upload className="w-8 h-8 text-content-muted mx-auto mb-2" />
                <p className="text-sm text-content-secondary">Click to browse or drag a file here</p>
                <p className="text-xs text-content-muted mt-1">PDF, Word, Excel, PowerPoint, images — up to 25MB</p>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp,.txt,.csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setFile(f);
                if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
              }
            }}
          />

          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">Title <span className="text-red-500">*</span></label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary-main/30 focus:border-brand-primary-main"
              placeholder="Document title"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as DocumentCategory)}
              className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary-main/30 focus:border-brand-primary-main bg-[var(--color-bg-input)]"
            >
              {CATEGORIES.filter((c) => c.value !== "all").map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">Description <span className="text-content-muted">(optional)</span></label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary-main/30 focus:border-brand-primary-main resize-none"
              rows={2}
              placeholder="Brief description..."
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-[var(--color-border)] text-content-secondary text-sm font-medium rounded-lg hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !file}
              className="flex-1 px-4 py-2.5 bg-brand-primary-main text-white text-sm font-semibold rounded-lg hover:bg-brand-primary-dark disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</> : <><Upload className="w-4 h-4" /> Upload</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Edit Modal ────────────────────────────────────────────────────────────────

function EditModal({
  doc,
  onClose,
  onSuccess,
}: {
  doc: Document;
  onClose: () => void;
  onSuccess: (doc: Document) => void;
}) {
  const [title, setTitle] = useState(doc.title);
  const [description, setDescription] = useState(doc.description ?? "");
  const [category, setCategory] = useState<DocumentCategory>(doc.category);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError("Title is required."); return; }
    setSaving(true);
    setError("");
    try {
      const updated = await updateDocument(doc.id, {
        title: title.trim(),
        description: description.trim() || undefined,
        category,
      });
      onSuccess(updated);
    } catch {
      setError("Failed to save changes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-card-solid rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <h2 className="text-lg font-semibold text-content-primary">Edit Document</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-5 h-5 text-content-secondary" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-900/20 border border-red-900/30 text-red-400 text-sm rounded-lg px-4 py-2.5">{error}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary-main/30 focus:border-brand-primary-main"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as DocumentCategory)}
              className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary-main/30 focus:border-brand-primary-main bg-[var(--color-bg-input)]"
            >
              {CATEGORIES.filter((c) => c.value !== "all").map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary-main/30 focus:border-brand-primary-main resize-none"
              rows={2}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-[var(--color-border)] text-content-secondary text-sm font-medium rounded-lg hover:bg-white/5 transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-brand-primary-main text-white text-sm font-semibold rounded-lg hover:bg-brand-primary-dark disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><Check className="w-4 h-4" /> Save</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Documents() {
  const { user, memberships } = useAuthStore();
  const currentMembership = memberships.find((m) => m.chapter_id === user?.active_chapter_id);
  const currentRole = currentMembership?.role ?? "member";
  const isOfficer = ROLE_HIERARCHY[currentRole] >= ROLE_HIERARCHY["secretary"];

  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<DocumentCategory | "all">("all");
  const [showUpload, setShowUpload] = useState(false);
  const [editDoc, setEditDoc] = useState<Document | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [workflowBanner, setWorkflowBanner] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchDocuments(activeCategory === "all" ? undefined : activeCategory)
      .then(setDocs)
      .catch(() => setDocs([]))
      .finally(() => setLoading(false));
  }, [activeCategory]);

  const handleDownload = async (doc: Document) => {
    setDownloadingId(doc.id);
    try {
      const url = await getDownloadUrl(doc.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      // silently fail
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDocument(id);
      setDocs((prev) => prev.filter((d) => d.id !== id));
    } catch {
      // silently fail
    } finally {
      setDeleteConfirmId(null);
    }
  };

  const visibleDocs = docs;

  return (
    <Layout>
      <div className="max-w-6xl mx-auto relative z-10">
        {/* Workflow started banner */}
        {workflowBanner && (
          <div className="mb-4 flex items-center justify-between bg-green-900/20 border border-green-900/30 text-green-400 text-sm rounded-xl px-4 py-3">
            <span>Approval workflow started for <strong>{workflowBanner}</strong>. Reviewers have been notified.</span>
            <button onClick={() => setWorkflowBanner(null)} className="ml-4 text-green-400 hover:text-green-300 font-medium text-xs">Dismiss</button>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-heading font-extrabold text-content-primary">Document Vault</h1>
            <p className="text-sm text-content-secondary mt-0.5">{docs.length} document{docs.length !== 1 ? "s" : ""}</p>
          </div>
          {isOfficer && (
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-brand-primary-main text-white text-sm font-semibold rounded-xl hover:bg-brand-primary-dark shadow-glass transition-colors"
            >
              <Upload className="w-4 h-4" />
              Upload Document
            </button>
          )}
        </div>

        {/* Category tabs */}
        <div className="flex gap-1 bg-white/10 p-1 rounded-xl w-fit mb-6 flex-wrap">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setActiveCategory(cat.value)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                activeCategory === cat.value
                  ? "bg-surface-card-solid text-content-primary shadow-glass"
                  : "text-content-secondary hover:text-content-secondary"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Document grid */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 text-brand-primary-main animate-spin" />
          </div>
        ) : visibleDocs.length === 0 ? (
          <div className="text-center py-24">
            <FolderOpen className="w-14 h-14 text-content-muted mx-auto mb-4" />
            <p className="text-content-secondary font-medium">No documents yet</p>
            {isOfficer && (
              <button
                onClick={() => setShowUpload(true)}
                className="mt-4 px-4 py-2 text-sm font-medium text-brand-primary-main hover:text-brand-primary-dark transition-colors"
              >
                Upload the first document →
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleDocs.map((doc) => (
              <div
                key={doc.id}
                className="bg-surface-card-solid border border-[var(--color-border)] rounded-2xl shadow-glass p-5 flex flex-col gap-3 hover:shadow-glass transition-shadow"
              >
                {/* Icon + category */}
                <div className="flex items-start justify-between">
                  <div className="w-10 h-10 bg-brand-primary-light/30 rounded-xl flex items-center justify-center shrink-0">
                    <FileIcon mimeType={doc.mime_type} className="w-5 h-5 text-brand-primary-dark" />
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${CATEGORY_COLORS[doc.category]}`}>
                    {CATEGORIES.find((c) => c.value === doc.category)?.label ?? doc.category}
                  </span>
                </div>

                {/* Title + description */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-content-primary leading-snug line-clamp-2">{doc.title}</h3>
                  {doc.description && (
                    <p className="text-xs text-content-secondary mt-1 line-clamp-2">{doc.description}</p>
                  )}
                </div>

                {/* Meta */}
                <div className="text-xs text-content-muted space-y-0.5">
                  <p className="truncate">{doc.file_name} · {formatBytes(doc.file_size)}</p>
                  <p>
                    {doc.uploader
                      ? `${doc.uploader.first_name} ${doc.uploader.last_name}`
                      : "Unknown"}{" "}
                    · {formatDate(doc.created_at)}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1 border-t border-white/5">
                  <button
                    onClick={() => handleDownload(doc)}
                    disabled={downloadingId === doc.id}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-brand-primary-main bg-brand-primary-light/20 hover:bg-brand-primary-light/40 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {downloadingId === doc.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Download className="w-3.5 h-3.5" />}
                    Download
                  </button>
                  {isOfficer && (
                    <>
                      <button
                        onClick={() => setEditDoc(doc)}
                        className="p-2 text-content-muted hover:text-content-secondary hover:bg-white/10 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      {deleteConfirmId === doc.id ? (
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleDelete(doc.id)}
                            className="p-2 text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
                            title="Confirm delete"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="p-2 text-content-muted hover:bg-white/10 rounded-lg transition-colors"
                            title="Cancel"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirmId(doc.id)}
                          className="p-2 text-content-muted hover:text-red-500 hover:bg-red-900/20 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onSuccess={(doc) => {
            setDocs((prev) => [doc, ...prev]);
            setShowUpload(false);
            if (doc.workflow_instance_id) {
              setWorkflowBanner(doc.title);
            }
          }}
        />
      )}
      {editDoc && (
        <EditModal
          doc={editDoc}
          onClose={() => setEditDoc(null)}
          onSuccess={(updated) => {
            setDocs((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
            setEditDoc(null);
          }}
        />
      )}
    </Layout>
  );
}
