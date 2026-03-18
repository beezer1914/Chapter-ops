import { useState, useEffect, useCallback } from "react";
import Layout from "@/components/Layout";
import { useAuthStore } from "@/stores/authStore";
import { useConfigStore } from "@/stores/configStore";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import {
  fetchArticles,
  fetchArticle,
  createArticle,
  updateArticle,
  deleteArticle,
} from "@/services/kbService";
import type { KnowledgeArticle, KbCategory, KbScope, KbStatus, MemberRole } from "@/types";
import {
  BookOpen,
  Search,
  Plus,
  Star,
  Eye,
  Clock,
  Tag,
  ChevronLeft,
  Pencil,
  Trash2,
  X,
  Check,
  Loader2,
  Building2,
  Home,
  Bold,
  Italic,
  UnderlineIcon,
  List,
  ListOrdered,
  Heading2,
  Heading3,
  Link as LinkIcon,
  Code,
  Minus,
} from "lucide-react";

const ROLE_HIERARCHY: Record<MemberRole, number> = {
  member: 0, secretary: 1, treasurer: 2, vice_president: 3, president: 4, admin: 5,
};

const CATEGORIES: { value: KbCategory | "all"; label: string; color: string }[] = [
  { value: "all", label: "All", color: "" },
  { value: "general", label: "General", color: "bg-gray-100 text-gray-700" },
  { value: "policy", label: "Policy", color: "bg-purple-100 text-purple-700" },
  { value: "procedure", label: "Procedure", color: "bg-blue-100 text-blue-700" },
  { value: "faq", label: "FAQ", color: "bg-amber-100 text-amber-700" },
  { value: "how_to", label: "How-To", color: "bg-emerald-100 text-emerald-700" },
];

function getCategoryColor(cat: KbCategory): string {
  return CATEGORIES.find((c) => c.value === cat)?.color ?? "bg-gray-100 text-gray-700";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Tiptap Toolbar ────────────────────────────────────────────────────────────

function EditorToolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;

  const btn = (active: boolean, onClick: () => void, icon: React.ReactNode, title: string) => (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`p-1.5 rounded transition-colors ${
        active ? "bg-brand-primary-main text-white" : "text-gray-600 hover:bg-gray-100"
      }`}
    >
      {icon}
    </button>
  );

  return (
    <div className="flex flex-wrap gap-0.5 px-3 py-2 border-b border-gray-200 bg-gray-50 rounded-t-xl">
      {btn(editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), <Bold className="w-4 h-4" />, "Bold")}
      {btn(editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), <Italic className="w-4 h-4" />, "Italic")}
      {btn(editor.isActive("underline"), () => editor.chain().focus().toggleUnderline().run(), <UnderlineIcon className="w-4 h-4" />, "Underline")}
      {btn(editor.isActive("code"), () => editor.chain().focus().toggleCode().run(), <Code className="w-4 h-4" />, "Inline code")}
      <div className="w-px bg-gray-200 mx-1 self-stretch" />
      {btn(editor.isActive("heading", { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), <Heading2 className="w-4 h-4" />, "Heading 2")}
      {btn(editor.isActive("heading", { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), <Heading3 className="w-4 h-4" />, "Heading 3")}
      <div className="w-px bg-gray-200 mx-1 self-stretch" />
      {btn(editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run(), <List className="w-4 h-4" />, "Bullet list")}
      {btn(editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run(), <ListOrdered className="w-4 h-4" />, "Numbered list")}
      {btn(editor.isActive("blockquote"), () => editor.chain().focus().toggleBlockquote().run(), <span className="text-sm font-bold px-0.5">"</span>, "Blockquote")}
      <div className="w-px bg-gray-200 mx-1 self-stretch" />
      <button
        type="button"
        title="Insert link"
        onClick={() => {
          const url = window.prompt("Enter URL");
          if (url) editor.chain().focus().setLink({ href: url }).run();
        }}
        className={`p-1.5 rounded transition-colors ${
          editor.isActive("link") ? "bg-brand-primary-main text-white" : "text-gray-600 hover:bg-gray-100"
        }`}
      >
        <LinkIcon className="w-4 h-4" />
      </button>
      <button
        type="button"
        title="Horizontal rule"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        className="p-1.5 rounded text-gray-600 hover:bg-gray-100 transition-colors"
      >
        <Minus className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── Article Editor Modal ──────────────────────────────────────────────────────

function ArticleEditorModal({
  article,
  onClose,
  onSuccess,
}: {
  article?: KnowledgeArticle;
  onClose: () => void;
  onSuccess: (a: KnowledgeArticle) => void;
}) {
  const isEdit = !!article;
  const [title, setTitle] = useState(article?.title ?? "");
  const [category, setCategory] = useState<KbCategory>(article?.category ?? "general");
  const [scope, setScope] = useState<KbScope>(article?.scope ?? "chapter");
  const [status, setStatus] = useState<KbStatus>(article?.status ?? "draft");
  const [isFeatured, setIsFeatured] = useState(article?.is_featured ?? false);
  const [tagInput, setTagInput] = useState(article?.tags?.join(", ") ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: "Write your article content here..." }),
    ],
    content: article?.body ?? "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError("Title is required."); return; }
    setSaving(true);
    setError("");
    const tags = tagInput.split(",").map((t) => t.trim()).filter(Boolean);
    const body = editor?.getHTML() ?? "";
    try {
      let result: KnowledgeArticle;
      if (isEdit) {
        result = await updateArticle(article.id, { title: title.trim(), body, category, status, is_featured: isFeatured, tags });
      } else {
        result = await createArticle({ title: title.trim(), body, category, scope, status, is_featured: isFeatured, tags });
      }
      onSuccess(result);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || "Failed to save article.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-8">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{isEdit ? "Edit Article" : "New Article"}</h2>
            {isEdit && <p className="text-xs text-gray-400 mt-0.5">{article.article_number}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title <span className="text-red-500">*</span></label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary-main/30 focus:border-brand-primary-main"
              placeholder="Article title"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {!isEdit && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Scope</label>
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value as KbScope)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-primary-main/30"
                >
                  <option value="organization">Organization-wide</option>
                  <option value="chapter">This Chapter</option>
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as KbCategory)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-primary-main/30"
              >
                {CATEGORIES.filter((c) => c.value !== "all").map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as KbStatus)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-primary-main/30"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tags <span className="text-gray-400">(comma-separated)</span></label>
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary-main/30"
              placeholder="dues, financial, onboarding"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="featured"
              type="checkbox"
              checked={isFeatured}
              onChange={(e) => setIsFeatured(e.target.checked)}
              className="rounded border-gray-300 text-brand-primary-main focus:ring-brand-primary-main"
            />
            <label htmlFor="featured" className="text-sm text-gray-700 cursor-pointer">
              Featured article (pinned to top)
            </label>
          </div>

          {/* Rich text editor */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <EditorToolbar editor={editor} />
              <EditorContent
                editor={editor}
                className="prose prose-sm max-w-none px-4 py-3 min-h-48 focus-within:outline-none text-gray-800"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-brand-primary-main text-white text-sm font-semibold rounded-lg hover:bg-brand-primary-dark disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><Check className="w-4 h-4" /> {isEdit ? "Save Changes" : "Create Article"}</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Article Reader Panel ──────────────────────────────────────────────────────

function ArticleReader({
  article,
  isOfficer,
  onClose,
  onEdit,
  onDelete,
}: {
  article: KnowledgeArticle;
  isOfficer: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  return (
    <div className="fixed inset-0 bg-black/40 flex justify-end z-50">
      <div className="bg-white w-full max-w-2xl h-full flex flex-col shadow-2xl overflow-hidden animate-slide-in-right">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs font-mono font-bold text-brand-primary-main bg-brand-primary-light/30 px-2 py-0.5 rounded">
                {article.article_number}
              </span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getCategoryColor(article.category)}`}>
                {CATEGORIES.find((c) => c.value === article.category)?.label}
              </span>
              {article.scope === "organization" ? (
                <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Building2 className="w-3 h-3" /> Org-wide
                </span>
              ) : (
                <span className="text-xs font-medium text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Home className="w-3 h-3" /> Chapter
                </span>
              )}
              {article.is_featured && (
                <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Star className="w-3 h-3" /> Featured
                </span>
              )}
            </div>
            <h2 className="text-lg font-bold text-gray-900 leading-snug">{article.title}</h2>
            <p className="text-xs text-gray-400 mt-1">
              {article.author ? `${article.author.first_name} ${article.author.last_name}` : "Unknown"}
              {" · "}Updated {formatDate(article.updated_at)}
              {" · "}
              <Eye className="w-3 h-3 inline mb-0.5" /> {article.view_count} views
            </p>
          </div>
          <div className="flex items-center gap-1 ml-3 shrink-0">
            {isOfficer && (
              <>
                <button onClick={onEdit} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors" title="Edit">
                  <Pencil className="w-4 h-4" />
                </button>
                {deleteConfirm ? (
                  <div className="flex gap-1">
                    <button onClick={onDelete} className="p-2 text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors" title="Confirm delete">
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={() => setDeleteConfirm(false)} className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setDeleteConfirm(true)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </>
            )}
            <button onClick={onClose} className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors ml-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tags */}
        {article.tags.length > 0 && (
          <div className="px-6 py-2 border-b border-gray-50 flex flex-wrap gap-1.5 shrink-0">
            <Tag className="w-3.5 h-3.5 text-gray-400 mt-0.5" />
            {article.tags.map((t) => (
              <span key={t} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{t}</span>
            ))}
          </div>
        )}

        {/* Body */}
        <div
          className="flex-1 overflow-y-auto px-6 py-6 prose prose-sm max-w-none prose-headings:font-bold prose-a:text-brand-primary-main"
          dangerouslySetInnerHTML={{ __html: article.body ?? "" }}
        />
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function KnowledgeBase() {
  const { user, memberships } = useAuthStore();
  const { organization } = useConfigStore();
  const currentMembership = memberships.find((m) => m.chapter_id === user?.active_chapter_id);
  const currentRole = currentMembership?.role ?? "member";
  const isOfficer = ROLE_HIERARCHY[currentRole] >= ROLE_HIERARCHY["secretary"];

  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeScope, setActiveScope] = useState<KbScope | "all">("all");
  const [activeCategory, setActiveCategory] = useState<KbCategory | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const [selectedArticle, setSelectedArticle] = useState<KnowledgeArticle | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editingArticle, setEditingArticle] = useState<KnowledgeArticle | undefined>();

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const load = useCallback(() => {
    setLoading(true);
    fetchArticles({
      scope: activeScope === "all" ? undefined : activeScope,
      category: activeCategory === "all" ? undefined : activeCategory,
      q: debouncedQuery || undefined,
    })
      .then(setArticles)
      .catch(() => setArticles([]))
      .finally(() => setLoading(false));
  }, [activeScope, activeCategory, debouncedQuery]);

  useEffect(() => { load(); }, [load]);

  const handleOpenArticle = async (article: KnowledgeArticle) => {
    // Fetch full body
    try {
      const full = await fetchArticle(article.id);
      setSelectedArticle(full);
      setArticles((prev) => prev.map((a) => a.id === full.id ? { ...a, view_count: full.view_count } : a));
    } catch {
      setSelectedArticle(article);
    }
  };

  const handleDelete = async () => {
    if (!selectedArticle) return;
    await deleteArticle(selectedArticle.id);
    setArticles((prev) => prev.filter((a) => a.id !== selectedArticle.id));
    setSelectedArticle(null);
  };

  const featured = articles.filter((a) => a.is_featured);
  const regular = articles.filter((a) => !a.is_featured);

  return (
    <Layout>
      <div className="max-w-6xl mx-auto relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-heading font-extrabold text-gray-900">Knowledge Base</h1>
            <p className="text-sm text-gray-500 mt-0.5">{articles.length} article{articles.length !== 1 ? "s" : ""}</p>
          </div>
          {isOfficer && (
            <button
              onClick={() => { setEditingArticle(undefined); setShowEditor(true); }}
              className="flex items-center gap-2 px-4 py-2.5 bg-brand-primary-main text-white text-sm font-semibold rounded-xl hover:bg-brand-primary-dark shadow-md transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Article
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative mb-5">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-primary-main/30 focus:border-brand-primary-main shadow-sm"
            placeholder="Search articles by title, content, or tags..."
          />
        </div>

        {/* Scope + Category filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          {/* Scope tabs */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            {([
              { value: "all", label: "All" },
              { value: "organization", label: organization?.abbreviation ?? "Org", icon: Building2 },
              { value: "chapter", label: "Chapter", icon: Home },
            ] as const).map((s) => (
              <button
                key={s.value}
                onClick={() => setActiveScope(s.value as KbScope | "all")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                  activeScope === s.value ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {"icon" in s && s.icon && <s.icon className="w-3.5 h-3.5" />}
                {s.label}
              </button>
            ))}
          </div>

          {/* Category chips */}
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                onClick={() => setActiveCategory(cat.value as KbCategory | "all")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-all border ${
                  activeCategory === cat.value
                    ? "bg-brand-primary-main text-white border-brand-primary-main"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 text-brand-primary-main animate-spin" />
          </div>
        ) : articles.length === 0 ? (
          <div className="text-center py-24">
            <BookOpen className="w-14 h-14 text-gray-200 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">
              {debouncedQuery ? `No results for "${debouncedQuery}"` : "No articles yet"}
            </p>
            {isOfficer && !debouncedQuery && (
              <button
                onClick={() => { setEditingArticle(undefined); setShowEditor(true); }}
                className="mt-4 px-4 py-2 text-sm font-medium text-brand-primary-main hover:text-brand-primary-dark transition-colors"
              >
                Create the first article →
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Featured articles */}
            {featured.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Star className="w-3.5 h-3.5 text-amber-500" /> Featured
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {featured.map((a) => <ArticleCard key={a.id} article={a} onClick={() => handleOpenArticle(a)} />)}
                </div>
              </div>
            )}

            {/* All articles */}
            {regular.length > 0 && (
              <div>
                {featured.length > 0 && (
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Articles</h3>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {regular.map((a) => <ArticleCard key={a.id} article={a} onClick={() => handleOpenArticle(a)} />)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Article reader */}
      {selectedArticle && (
        <ArticleReader
          article={selectedArticle}
          isOfficer={isOfficer}
          onClose={() => setSelectedArticle(null)}
          onEdit={() => { setEditingArticle(selectedArticle); setShowEditor(true); setSelectedArticle(null); }}
          onDelete={handleDelete}
        />
      )}

      {/* Editor modal */}
      {showEditor && (
        <ArticleEditorModal
          article={editingArticle}
          onClose={() => { setShowEditor(false); setEditingArticle(undefined); }}
          onSuccess={(a) => {
            setArticles((prev) =>
              editingArticle
                ? prev.map((x) => (x.id === a.id ? a : x))
                : [a, ...prev]
            );
            setShowEditor(false);
            setEditingArticle(undefined);
          }}
        />
      )}
    </Layout>
  );
}

// ── Article Card ──────────────────────────────────────────────────────────────

function ArticleCard({ article, onClick }: { article: KnowledgeArticle; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 text-left hover:shadow-md hover:border-brand-primary-main/20 transition-all w-full group"
    >
      {/* Number + badges */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-xs font-mono font-bold text-brand-primary-main bg-brand-primary-light/30 px-2 py-0.5 rounded">
          {article.article_number}
        </span>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getCategoryColor(article.category)}`}>
          {CATEGORIES.find((c) => c.value === article.category)?.label}
        </span>
        {article.scope === "organization" ? (
          <span className="text-xs text-indigo-500 flex items-center gap-0.5"><Building2 className="w-3 h-3" /></span>
        ) : (
          <span className="text-xs text-teal-500 flex items-center gap-0.5"><Home className="w-3 h-3" /></span>
        )}
        {article.is_featured && <Star className="w-3.5 h-3.5 text-amber-400" />}
        {article.status === "draft" && (
          <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Draft</span>
        )}
      </div>

      {/* Title */}
      <h3 className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2 group-hover:text-brand-primary-main transition-colors mb-2">
        {article.title}
      </h3>

      {/* Tags */}
      {article.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {article.tags.slice(0, 3).map((t) => (
            <span key={t} className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{t}</span>
          ))}
          {article.tags.length > 3 && <span className="text-xs text-gray-400">+{article.tags.length - 3}</span>}
        </div>
      )}

      {/* Meta */}
      <div className="flex items-center gap-3 text-xs text-gray-400 mt-auto">
        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDate(article.updated_at)}</span>
        <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{article.view_count}</span>
      </div>
    </button>
  );
}
