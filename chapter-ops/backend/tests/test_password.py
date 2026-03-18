"""Tests for password validation utility."""

from app.utils.password import validate_password


class TestValidatePassword:
    def test_valid_password(self):
        is_valid, error = validate_password("Str0ng!Password1")
        assert is_valid is True
        assert error is None

    def test_too_short(self):
        is_valid, error = validate_password("Short!1aB")
        assert is_valid is False
        assert "12 characters" in error

    def test_missing_uppercase(self):
        is_valid, error = validate_password("str0ng!password1")
        assert is_valid is False
        assert "uppercase" in error

    def test_missing_lowercase(self):
        is_valid, error = validate_password("STR0NG!PASSWORD1")
        assert is_valid is False
        assert "lowercase" in error

    def test_missing_digit(self):
        is_valid, error = validate_password("Strong!PasswordX")
        assert is_valid is False
        assert "digit" in error

    def test_missing_special_char(self):
        is_valid, error = validate_password("Str0ngPassword1x")
        assert is_valid is False
        assert "special character" in error

    def test_exactly_12_chars_valid(self):
        is_valid, error = validate_password("Abcdefgh!1ab")
        assert is_valid is True
        assert error is None

    def test_empty_password(self):
        is_valid, error = validate_password("")
        assert is_valid is False
