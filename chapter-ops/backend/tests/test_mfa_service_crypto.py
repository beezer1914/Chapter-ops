"""Tests for mfa_service crypto + secret + QR helpers."""

from app.services.mfa_service import (
    generate_secret, encrypt_secret, decrypt_secret, generate_qr_data_uri,
    build_otpauth_uri,
)


class TestMFASecretAndCrypto:
    def test_generate_secret_returns_base32(self, app):
        with app.app_context():
            secret = generate_secret()
            assert len(secret) >= 16
            # Base32 alphabet is uppercase A-Z + 2-7
            assert all(c in "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567=" for c in secret)

    def test_encrypt_decrypt_round_trip(self, app):
        with app.app_context():
            secret = "JBSWY3DPEHPK3PXP"  # canonical pyotp test vector
            encrypted = encrypt_secret(secret)
            assert encrypted != secret  # actually encrypted
            assert decrypt_secret(encrypted) == secret

    def test_encrypt_produces_different_ciphertext_each_call(self, app):
        """Fernet uses a random IV — same plaintext yields different ciphertext."""
        with app.app_context():
            secret = "JBSWY3DPEHPK3PXP"
            assert encrypt_secret(secret) != encrypt_secret(secret)

    def test_otpauth_uri_format(self, app):
        from urllib.parse import unquote
        with app.app_context():
            uri = build_otpauth_uri(
                secret="JBSWY3DPEHPK3PXP",
                user_email="brandon@example.com",
                issuer="ChapterOps",
            )
            decoded_uri = unquote(uri)
            assert uri.startswith("otpauth://totp/")
            assert "ChapterOps" in decoded_uri
            assert "brandon@example.com" in decoded_uri
            assert "secret=JBSWY3DPEHPK3PXP" in uri

    def test_qr_data_uri_returns_png(self, app):
        with app.app_context():
            data_uri = generate_qr_data_uri("otpauth://totp/Test:user@example.com?secret=XXX&issuer=Test")
            assert data_uri.startswith("data:image/png;base64,")
            assert len(data_uri) > 100  # actually contains content
