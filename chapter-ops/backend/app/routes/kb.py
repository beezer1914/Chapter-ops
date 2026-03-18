"""
Knowledge Base routes.

Endpoints:
  GET    /api/kb              list articles visible to current user
  POST   /api/kb              create article (secretary+)
  GET    /api/kb/<id>         get article detail (increments view_count)
  PATCH  /api/kb/<id>         update article (secretary+)
  DELETE /api/kb/<id>         delete article (secretary+)
"""

from flask import Blueprint, g, jsonify, request
from flask_login import current_user, login_required
from sqlalchemy import or_

from app.extensions import db
from app.models.knowledge_article import KnowledgeArticle, KB_CATEGORIES, KB_SCOPES, KB_STATUSES
from app.models.organization import Organization
from app.models.chapter import Chapter
from app.utils.decorators import chapter_required, role_required

kb_bp = Blueprint("kb", __name__, url_prefix="/api/kb")


def _get_chapter_prefix(chapter: Chapter) -> str:
    """Derive a short prefix from chapter name, e.g. 'Sigma Delta Sigma' → 'SDS'."""
    words = [w for w in chapter.name.split() if w[0].isalpha()]
    if len(words) >= 2:
        return "".join(w[0].upper() for w in words)[:5]
    return chapter.name[:3].upper()


def _next_article_number(prefix: str) -> str:
    """Generate next sequential article number for a given prefix."""
    last = (
        db.session.query(KnowledgeArticle)
        .filter(KnowledgeArticle.article_number.like(f"{prefix}-%"))
        .order_by(KnowledgeArticle.created_at.desc())
        .first()
    )
    if last:
        try:
            num = int(last.article_number.split("-", 1)[1]) + 1
        except (ValueError, IndexError):
            num = 1
    else:
        num = 1
    return f"{prefix}-{num:04d}"


# ── List / Search articles ────────────────────────────────────────────────────

@kb_bp.route("", methods=["GET"])
@login_required
@chapter_required
@role_required("member")
def list_articles():
    chapter = g.current_chapter
    org_id = chapter.organization_id

    scope_filter = request.args.get("scope")   # organization | chapter | None (both)
    category = request.args.get("category")
    status_filter = request.args.get("status", "published")
    q = request.args.get("q", "").strip()

    # Base: org-level articles for this org OR chapter-level for this chapter
    query = db.session.query(KnowledgeArticle).filter(
        or_(
            KnowledgeArticle.organization_id == org_id,
            KnowledgeArticle.chapter_id == chapter.id,
        )
    )

    # Officers can see drafts; members only see published
    membership = current_user.get_membership(chapter.id)
    from app.utils.decorators import _is_org_admin
    is_officer = membership and membership.has_role("secretary")
    is_org_admin = _is_org_admin(current_user, org_id)

    if not (is_officer or is_org_admin):
        query = query.filter(KnowledgeArticle.status == "published")
    elif status_filter:
        query = query.filter(KnowledgeArticle.status == status_filter)

    if scope_filter in KB_SCOPES:
        query = query.filter(KnowledgeArticle.scope == scope_filter)

    if category and category in KB_CATEGORIES:
        query = query.filter(KnowledgeArticle.category == category)

    if q:
        search = f"%{q}%"
        query = query.filter(
            or_(
                KnowledgeArticle.title.ilike(search),
                KnowledgeArticle.body.ilike(search),
                KnowledgeArticle.tags.ilike(search),
            )
        )

    articles = query.order_by(
        KnowledgeArticle.is_featured.desc(),
        KnowledgeArticle.updated_at.desc()
    ).all()

    return jsonify([a.to_dict(include_body=False) for a in articles])


# ── Create article ─────────────────────────────────────────────────────────────

@kb_bp.route("", methods=["POST"])
@login_required
@chapter_required
@role_required("secretary")
def create_article():
    chapter = g.current_chapter
    org_id = chapter.organization_id
    data = request.get_json() or {}

    title = data.get("title", "").strip()
    body = data.get("body", "")
    category = data.get("category", "general")
    scope = data.get("scope", "chapter")
    status = data.get("status", "draft")
    is_featured = bool(data.get("is_featured", False))
    tags = data.get("tags", [])

    if not title:
        return jsonify({"error": "Title is required."}), 400
    if category not in KB_CATEGORIES:
        return jsonify({"error": f"Invalid category."}), 400
    if scope not in KB_SCOPES:
        return jsonify({"error": "Invalid scope."}), 400
    if status not in KB_STATUSES:
        return jsonify({"error": "Invalid status."}), 400

    # Determine prefix and chapter_id
    if scope == "organization":
        org = db.session.get(Organization, org_id)
        prefix = org.abbreviation if org else "ORG"
        article_chapter_id = None
    else:
        prefix = _get_chapter_prefix(chapter)
        article_chapter_id = chapter.id

    article_number = _next_article_number(prefix)

    article = KnowledgeArticle(
        scope=scope,
        organization_id=org_id,
        chapter_id=article_chapter_id,
        created_by_id=current_user.id,
        article_number=article_number,
        title=title,
        body=body,
        category=category,
        status=status,
        is_featured=is_featured,
        tags=",".join(t.strip() for t in tags if t.strip()) if tags else None,
    )
    db.session.add(article)
    db.session.commit()

    return jsonify(article.to_dict()), 201


# ── Get article detail ────────────────────────────────────────────────────────

@kb_bp.route("/<article_id>", methods=["GET"])
@login_required
@chapter_required
@role_required("member")
def get_article(article_id: str):
    chapter = g.current_chapter
    org_id = chapter.organization_id

    article = db.session.query(KnowledgeArticle).filter(
        KnowledgeArticle.id == article_id,
        or_(
            KnowledgeArticle.organization_id == org_id,
            KnowledgeArticle.chapter_id == chapter.id,
        )
    ).first()

    if not article:
        return jsonify({"error": "Article not found."}), 404

    # Increment view count
    article.view_count = (article.view_count or 0) + 1
    db.session.commit()

    return jsonify(article.to_dict(include_body=True))


# ── Update article ────────────────────────────────────────────────────────────

@kb_bp.route("/<article_id>", methods=["PATCH"])
@login_required
@chapter_required
@role_required("secretary")
def update_article(article_id: str):
    chapter = g.current_chapter
    org_id = chapter.organization_id

    article = db.session.query(KnowledgeArticle).filter(
        KnowledgeArticle.id == article_id,
        or_(
            KnowledgeArticle.organization_id == org_id,
            KnowledgeArticle.chapter_id == chapter.id,
        )
    ).first()

    if not article:
        return jsonify({"error": "Article not found."}), 404

    data = request.get_json() or {}

    if "title" in data:
        if not data["title"].strip():
            return jsonify({"error": "Title cannot be empty."}), 400
        article.title = data["title"].strip()
    if "body" in data:
        article.body = data["body"]
    if "category" in data:
        if data["category"] not in KB_CATEGORIES:
            return jsonify({"error": "Invalid category."}), 400
        article.category = data["category"]
    if "status" in data:
        if data["status"] not in KB_STATUSES:
            return jsonify({"error": "Invalid status."}), 400
        article.status = data["status"]
    if "is_featured" in data:
        article.is_featured = bool(data["is_featured"])
    if "tags" in data:
        tags = data["tags"]
        article.tags = ",".join(t.strip() for t in tags if t.strip()) if tags else None

    db.session.commit()
    return jsonify(article.to_dict(include_body=True))


# ── Delete article ────────────────────────────────────────────────────────────

@kb_bp.route("/<article_id>", methods=["DELETE"])
@login_required
@chapter_required
@role_required("secretary")
def delete_article(article_id: str):
    chapter = g.current_chapter
    org_id = chapter.organization_id

    article = db.session.query(KnowledgeArticle).filter(
        KnowledgeArticle.id == article_id,
        or_(
            KnowledgeArticle.organization_id == org_id,
            KnowledgeArticle.chapter_id == chapter.id,
        )
    ).first()

    if not article:
        return jsonify({"error": "Article not found."}), 404

    db.session.delete(article)
    db.session.commit()
    return jsonify({"success": True})
