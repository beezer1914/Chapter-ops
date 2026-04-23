"""Tests for name normalization used in chapter dedup."""

from app.utils.naming import normalize_chapter_name


def test_lowercases():
    assert normalize_chapter_name("Alpha Chapter") == "alphachapter"


def test_strips_whitespace():
    assert normalize_chapter_name("  Alpha  Chapter  ") == "alphachapter"


def test_strips_interior_whitespace():
    assert normalize_chapter_name("Alpha\tChapter\n") == "alphachapter"


def test_strips_punctuation():
    assert normalize_chapter_name("Alpha-Chapter, Inc.") == "alphachapterinc"


def test_treats_unicode_letters_as_letters():
    # Greek letters should survive (stripped of anything non-alphanumeric,
    # but letters themselves are preserved and case-folded)
    assert normalize_chapter_name("ΣΔΣ Chapter") == "σδσchapter"


def test_empty_returns_empty():
    assert normalize_chapter_name("") == ""
    assert normalize_chapter_name("   ") == ""


def test_none_returns_empty():
    assert normalize_chapter_name(None) == ""


def test_equivalent_variants_collide():
    a = normalize_chapter_name("Alpha Chapter")
    b = normalize_chapter_name("alpha chapter")
    c = normalize_chapter_name("ALPHACHAPTER")
    d = normalize_chapter_name("  Alpha-Chapter  ")
    assert a == b == c == d
