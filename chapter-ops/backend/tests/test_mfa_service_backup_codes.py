"""Tests for backup code generation, hashing, and verification."""

import pytest

from app.services.mfa_service import (
    generate_backup_codes, hash_backup_codes, consume_backup_code,
)


class TestBackupCodes:
    def test_generate_returns_10_codes_in_dashed_format(self):
        codes = generate_backup_codes()
        assert len(codes) == 10
        for c in codes:
            # XXXX-XXXX format
            assert len(c) == 9
            assert c[4] == "-"
            # No ambiguous chars (no 0, O, 1, I, L)
            for char in (c[:4] + c[5:]):
                assert char not in "0OIL1"

    def test_codes_are_unique(self):
        codes = generate_backup_codes()
        assert len(set(codes)) == 10

    def test_hash_returns_list_of_strings(self, app):
        with app.app_context():
            codes = generate_backup_codes()
            hashes = hash_backup_codes(codes)
            assert len(hashes) == 10
            for h in hashes:
                assert isinstance(h, str)
                assert h.startswith("$2")  # bcrypt prefix

    def test_consume_matches_correct_code(self, app):
        with app.app_context():
            codes = generate_backup_codes()
            hashes = hash_backup_codes(codes)
            # Consume the third code
            new_hashes, matched = consume_backup_code(hashes, codes[2])
            assert matched is True
            # Slot 2 is now null; others unchanged
            assert new_hashes[2] is None
            for i in [0, 1, 3, 4, 5, 6, 7, 8, 9]:
                assert new_hashes[i] == hashes[i]

    def test_consume_returns_false_for_wrong_code(self, app):
        with app.app_context():
            codes = generate_backup_codes()
            hashes = hash_backup_codes(codes)
            new_hashes, matched = consume_backup_code(hashes, "XXXX-XXXX")
            assert matched is False
            assert new_hashes == hashes  # nothing consumed

    def test_consume_skips_already_used_slots(self, app):
        """A code that was already consumed (slot=null) cannot be re-used."""
        with app.app_context():
            codes = generate_backup_codes()
            hashes = hash_backup_codes(codes)
            # First consumption succeeds
            hashes, matched = consume_backup_code(hashes, codes[5])
            assert matched is True
            # Second attempt with the same code fails (slot is null now)
            hashes, matched = consume_backup_code(hashes, codes[5])
            assert matched is False

    def test_consume_is_case_insensitive(self, app):
        with app.app_context():
            codes = generate_backup_codes()
            hashes = hash_backup_codes(codes)
            # User typed it in lowercase
            new_hashes, matched = consume_backup_code(hashes, codes[0].lower())
            assert matched is True
