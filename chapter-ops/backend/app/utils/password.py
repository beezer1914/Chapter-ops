"""
Password validation — enforces strong password requirements.

Requirements (carried over from Sigma Finance):
- Minimum 12 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one digit
- At least one special character
"""

import re


def validate_password(password: str) -> tuple[bool, str | None]:
    """
    Validate a password against security requirements.

    Returns:
        (True, None) if valid
        (False, error_message) if invalid
    """
    if len(password) < 12:
        return False, "Password must be at least 12 characters long."

    if not re.search(r"[A-Z]", password):
        return False, "Password must contain at least one uppercase letter."

    if not re.search(r"[a-z]", password):
        return False, "Password must contain at least one lowercase letter."

    if not re.search(r"\d", password):
        return False, "Password must contain at least one digit."

    if not re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
        return False, "Password must contain at least one special character."

    return True, None
