"""
Pagination helper for list endpoints.

Usage:
    from app.utils.pagination import paginate

    page, per_page, pagination_meta = paginate(query)
    items = page.items

Response format:
    {
        "data_key": [...],
        "pagination": {
            "page": 1,
            "per_page": 50,
            "total": 243,
            "pages": 5
        }
    }
"""

from flask import request

_DEFAULT_PER_PAGE = 50
_MAX_PER_PAGE = 200


def paginate(query):
    """
    Apply pagination to a SQLAlchemy query using ?page and ?per_page query params.

    Returns (page_obj, meta_dict) where page_obj has .items and meta_dict is
    the JSON-serialisable pagination block for the response.
    """
    try:
        page = max(1, int(request.args.get("page", 1)))
    except (ValueError, TypeError):
        page = 1

    try:
        per_page = min(_MAX_PER_PAGE, max(1, int(request.args.get("per_page", _DEFAULT_PER_PAGE))))
    except (ValueError, TypeError):
        per_page = _DEFAULT_PER_PAGE

    paged = query.paginate(page=page, per_page=per_page, error_out=False)

    meta = {
        "page": paged.page,
        "per_page": paged.per_page,
        "total": paged.total,
        "pages": paged.pages,
    }

    return paged, meta
