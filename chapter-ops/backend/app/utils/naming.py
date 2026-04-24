"""Name normalization helpers used for dedup on chapter names.

Two chapter requests with the same (org, region, normalized_name) cannot
both be pending simultaneously. A new chapter request cannot collide with
an existing active Chapter's normalized name either.
"""


def normalize_chapter_name(name: str | None) -> str:
    """
    Normalize a chapter name for dedup comparison.

    Lowercases, strips whitespace, strips all non-alphanumeric characters
    (punctuation, separators). Unicode letters (including Greek) are
    preserved case-folded. Returns empty string for None/empty input.
    """
    if not name:
        return ""
    return "".join(ch for ch in name.casefold() if ch.isalnum())
