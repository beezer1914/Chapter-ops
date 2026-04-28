# MFA Enforcement for Officer Accounts — Design

**Status:** Draft
**Date:** 2026-04-27
**Author:** Brandon (with Claude)

## Purpose

Add TOTP-based multi-factor authentication to ChapterOps, with mandatory enrollment for officers who handle sensitive data: chapter Treasurers / VPs / Presidents, regional officers (Director / Treasurer / VPs / Secretary), Org Admins, and the Platform Admin. Regular members and Secretaries can opt in via Settings. Backup codes for self-service recovery; tiered admin reset as fallback. Enforcement gated behind a feature flag so the rollout can be coordinated.

The motivating concern is credential stuffing — leaked passwords from other services are reused on ChapterOps. Treasurers and Org Admins control real money and member PII, and a single compromised account can do meaningful damage. MFA closes that vector cleanly.

## Non-Goals

- Trusted-device cookies / "remember this device for N days" — every login requires TOTP verification (chosen during brainstorming for simplicity at beta scale; revisit if officer login frequency becomes a friction point)
- WebAuthn / passkeys — TOTP-only Pass 1; passkeys are a Pass 2 candidate
- SMS or Email OTP — intentionally rejected (SIM-swap risk + recurring cost; email defeats the security model since email is often the password-recovery channel)
- Self-service "I lost my MFA" via email magic link — also defeats the model; admin reset only
- Org-admin-configurable MFA policy ("our org requires MFA for all members" overrides) — Pass 2 if any IHQ requests it
- Step-up auth for sensitive actions on top of per-login MFA — overkill given per-login is already enforced

## Approach

Single-pass implementation behind a feature flag. The full feature ships in one PR: backend (model, endpoints, enforcement gate, audit) + frontend (enrollment wizard, modified login, Settings tab, admin reset UI) + tests. An env var `MFA_ENFORCEMENT_ENABLED` (default `false`) gates the role-based enforcement check. Brandon emails affected officers, then flips the flag in Render.

When enforcement is OFF, the codebase still ships everything: any user can opt in via Settings, the verification flow works, but no role is forced. When ON, required-role users hit the enrollment redirect at login.

Single PR with feature flag gives the rollout control of a multi-PR plan without the multi-PR overhead. Rollback is a one-line env var flip.

## Data Model

### `UserMFA` (new model, one-to-one with `User`)

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `user_id` | `String(36)`, FK `user.id`, **unique** | One MFA record per user |
| `secret` | `String(200)` | TOTP secret encrypted with Fernet using `MFA_SECRET_KEY` env var. Decrypted only at verification time. Cleartext secret is base32-encoded, ~32 chars; Fernet ciphertext fits comfortably in 200. |
| `enabled` | `Boolean`, default `False` | Set to `True` only after the user successfully verifies a TOTP code from their authenticator. Prevents half-enrolled state. |
| `backup_codes_hashed` | `JSON` | Array of 10 entries: each is either a bcrypt hash string (unused code) or `null` (consumed code). Codes are shown plaintext to the user exactly once at enrollment time and are never recoverable from the DB. |
| `enrolled_at` | `DateTime`, nullable | Set when `enabled` flips to `True`. |
| `last_used_at` | `DateTime`, nullable | Updated on every successful verification (TOTP or backup code). |
| `last_reset_at` | `DateTime`, nullable | Updated on admin reset (audit trail beyond the dedicated event log). |

Inherits `created_at` / `updated_at` from `BaseModel`.

### `MFAResetEvent` (new model, audit log)

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `created_at` | `DateTime` | Inherited from `BaseModel` |
| `target_user_id` | FK `user.id` | The user whose MFA was reset |
| `actor_user_id` | FK `user.id` | The user who performed the reset |
| `actor_role_at_reset` | `String(50)` | Snapshot at time of action — one of `"president"`, `"org_admin"`, `"platform_admin"` — preserved even if the actor's role later changes |
| `reason` | `Text`, nullable | Optional free text from the actor explaining why |

Plus standard `AuthEvent` records for the lighter-weight events (enroll, verify, fail, backup-used, disable, reset). The dedicated `MFAResetEvent` exists because resets are high-stakes and warrant a richer record than the generic auth log.

### Enforcement helper

```python
def user_role_requires_mfa(user) -> bool:
    """True if the user holds any role that mandates MFA enrollment.

    Always returns False when MFA_ENFORCEMENT_ENABLED is unset/false,
    regardless of the user's roles. This is the master kill-switch.
    """
    if not current_app.config.get("MFA_ENFORCEMENT_ENABLED", False):
        return False
    # Treasurer+ in any active chapter membership
    has_chapter_officer_role = ChapterMembership.query.filter(
        ChapterMembership.user_id == user.id,
        ChapterMembership.active.is_(True),
        ChapterMembership.role.in_(["treasurer", "vice_president", "president", "admin"]),
    ).first() is not None
    if has_chapter_officer_role:
        return True
    # Any active regional membership above plain "member"
    has_regional_role = RegionMembership.query.filter(
        RegionMembership.user_id == user.id,
        RegionMembership.active.is_(True),
        RegionMembership.role != "member",
    ).first() is not None
    if has_regional_role:
        return True
    # Org admin in any organization
    has_org_admin = OrganizationMembership.query.filter(
        OrganizationMembership.user_id == user.id,
        OrganizationMembership.active.is_(True),
        OrganizationMembership.role == "admin",
    ).first() is not None
    if has_org_admin:
        return True
    # Platform admin (founder)
    return is_founder_email(user.email)
```

`is_founder_email()` is a small helper extracted from the existing `is_founder()` so it can be called with an arbitrary email instead of `current_user`.

## Backend Endpoints

All paths under `/api/auth/mfa/*` (extends the existing auth blueprint).

### Enrollment

| Method + Path | Auth | Purpose |
|---|---|---|
| `POST /api/auth/mfa/enroll/start` | Logged-in OR enrollment-token | Generate fresh TOTP secret. Return `{secret_base32, qr_code_data_uri, otpauth_uri}`. UserMFA row created (or updated) with `enabled=False`. Idempotent: re-calling discards the previous unverified secret. Rate limit: 5/hour per user. |
| `POST /api/auth/mfa/enroll/verify` | Logged-in OR enrollment-token | Body: `{code: "123456"}`. Validates against the secret using `pyotp.TOTP.verify(code, valid_window=1)`. On success: flip `enabled=True`, generate 10 backup codes, hash with bcrypt, store hashes, return plaintext codes (one-time display), set `enrolled_at`. Rate limit: 5/15min per user. |
| `POST /api/auth/mfa/backup-codes/regenerate` | Logged-in + MFA-verified session | Generate fresh batch of 10 codes, replace stored hashes. Returns plaintext codes (one-time display). Rate limit: 3/hour per user. |

### Login + verification

| Method + Path | Auth | Purpose |
|---|---|---|
| `POST /api/auth/login` (extended) | None | Existing endpoint. After password check: <br>• If user has `UserMFA.enabled=True`: return `{requires_mfa: True, mfa_token: <short-lived JWT>}`. NO session established yet.<br>• Else if `user_role_requires_mfa(user)` returns True: return `{requires_enrollment: True, enrollment_token: <short-lived JWT>}`. NO session established.<br>• Else: establish session as today (no behavior change for non-required roles). |
| `POST /api/auth/mfa/verify` | mfa_token | Body: `{code}` OR `{backup_code}`. Validates either a 6-digit TOTP code OR an unused backup code (format `XXXX-XXXX`). On success: establish session, set `last_used_at`. If backup code consumed: that slot's hash → null. Rate limit: 5/15min per user. |

The `mfa_token` and `enrollment_token` are short-lived JWTs (~5 min TTL) signed with the existing `SECRET_KEY`. They authorize the verification/enrollment endpoints WITHOUT a real Flask-Login session existing yet — closing the window between password check and MFA verification where the user would otherwise be partially authenticated.

### Recovery + admin reset

| Method + Path | Auth | Purpose |
|---|---|---|
| `POST /api/auth/mfa/disable` | Logged-in + MFA-verified | Self-service disable. Returns 403 if `user_role_requires_mfa(current_user)` is True. Wipes `UserMFA` row. |
| `POST /api/users/<user_id>/mfa/reset` | Logged-in + caller's MFA verified + caller outranks target | Wipes target's `UserMFA` (sets `enabled=False`, clears secret + backup codes). Records `MFAResetEvent` with actor + reason. Target's next login goes through enrollment flow again. Rate limit: 10/hour per actor. |

`can_reset_mfa(actor, target)` helper:

- Platform Admin (founder) can reset anyone — escape hatch.
- Org Admin can reset any user in their organization (Presidents and below).
- President of a chapter can reset Treasurer / VP / Secretary in that same chapter.
- Caller MUST themselves be MFA-enrolled. This prevents a downgrade attack: an unenrolled actor cannot strip MFA off another account to make it as weak as theirs.

## Frontend Flows

### 1. Modified `pages/Login.tsx`

After successful password POST, branch on the response:

- `{requires_mfa: true, mfa_token}` → store token in component state, swap login form for a TOTP entry form ("Enter the 6-digit code from your authenticator app"). Subtle "Use a backup code instead" link toggles to backup-code input mode (8-char dashed format). On submit POST `/api/auth/mfa/verify`. Wrong-code error shown inline. After 5 failed attempts, show "Too many attempts — try again in 15 minutes."
- `{requires_enrollment: true, enrollment_token}` → store token, redirect to `/mfa/enroll`.
- Normal session response → existing post-login redirect (unchanged).

### 2. New `pages/MFAEnroll.tsx` — 3-step wizard

- **Step 1 — Intro.** "Two-factor authentication is required for your role." Brief explainer + "Get Started" button. Calls `enroll/start`.
- **Step 2 — Scan + Verify.** QR code displayed prominently. Below it: "Can't scan? Manual setup: `<base32 secret>`" with a copy button. Input field for the 6-digit verification code. Submit calls `enroll/verify`.
- **Step 3 — Backup codes (one-time display).** 10 codes in a monospaced grid. "Download as .txt" + "Copy to clipboard" + "I've saved these somewhere safe" checkbox. Continue button gated on the checkbox. After Continue, codes disappear and there is no path to view them again — user must regenerate to get new ones. Also shows a one-line warning: "Save these now. You won't see them again."

### 3. Modified `pages/Settings.tsx` → New "Security" tab

Section "Two-Factor Authentication" with three states:

- **Required + not enrolled** — "Required for your role. [Enroll Now]" (button → `/mfa/enroll`)
- **Enrolled** — green "✓ Enabled. Last used 3 days ago." + "Regenerate backup codes" button + "Disable" button (only shown if user is opt-in, hidden for required roles).
- **Opt-in available** — "Add an extra layer of security to your account. [Enable Two-Factor Authentication]"

Backup-codes regenerate opens a modal showing fresh codes with the same one-time-display + checkbox UX as enrollment Step 3.

### 4. Admin reset UI in `pages/Members.tsx` and other roster views

New row action **"Reset MFA"** — visible only when `can_reset_mfa(currentUser, member)` per the tier rules. Confirmation modal with mandatory reason text field ("Why are you resetting this user's MFA?"). On submit, POSTs `/api/users/<id>/mfa/reset` with the reason. Member sees enrollment flow on next login. `MFAResetEvent` created.

Same row action also available on:
- IHQ Dashboard's chapter health table (for Org Admin resetting Presidents)
- Platform Dashboard (for the founder resetting Org Admins or anyone)

### 5. Inbox alert (belt-and-suspenders)

Add a new `_item` to `dashboard.py:inbox()` for required-role users without MFA: critical priority, "Enable two-factor authentication", CTA → `/mfa/enroll`. Catches anyone who somehow slips past the login redirect (e.g., long-lived session that started before enforcement was enabled).

### QR code rendering choice

Server-side via Python `qrcode` library. The route returns a data URI (`data:image/png;base64,...`) the frontend embeds with `<img src={...}>`. Keeps the secret rendering on the trusted side; no extra JS surface area. Adds one Python dependency (`qrcode[pil]`).

## Security Details

### Crypto choices

- **TOTP secret encryption at rest** — Fernet (symmetric AES-128-CBC + HMAC). New env var `MFA_SECRET_KEY` (32 url-safe base64 bytes, generated once via `Fernet.generate_key().decode()`). Decryption happens only at verification time, in memory, never persisted. **Loss of `MFA_SECRET_KEY` is a disaster** — equivalent to losing the Postgres encryption key; all enrolled users would need admin reset. Document in the runbook with instructions to back up the key out-of-band.
- **Backup codes** — 10 codes, each 8 characters from base32 alphabet (no ambiguous chars: no `0`, `O`, `1`, `I`, `L`), displayed with a hyphen for readability (`XXXX-XXXX`). Hashed individually with bcrypt (same lib as passwords). Single-use: on match, the slot's hash is set to null in the JSON array.
- **TOTP verification window** — `pyotp.TOTP.verify(code, valid_window=1)` accepts the current 30-sec period plus one before/after (±30 sec). Standard tolerance for clock drift; doesn't meaningfully weaken security.

### Rate limits (Flask-Limiter)

| Endpoint | Limit |
|---|---|
| `enroll/start` | 5/hour per user |
| `enroll/verify` | 5/15min per user |
| `mfa/verify` (login) | 5/15min per user |
| `users/<id>/mfa/reset` | 10/hour per actor |
| `backup-codes/regenerate` | 3/hour per user |
| `mfa/disable` | 3/hour per user |

### Audit log

Extends the existing `AuthEvent` model (per `chapter-ops/CLAUDE.md`, used by the ops agent). New `event_type` values:

- `mfa_enrolled` — successful enrollment verification
- `mfa_verified` — successful login-time TOTP verification
- `mfa_failed` — failed code entry (TOTP or backup)
- `mfa_backup_used` — backup code consumed
- `mfa_disabled` — self-service disable
- `mfa_reset` — admin reset (in addition to the richer `MFAResetEvent`)

The dedicated `MFAResetEvent` table exists separately because resets are high-stakes and need actor + target + reason in a structured form, not free-text in `AuthEvent`.

### Error handling principles

- Wrong TOTP / backup code → 401 with `{"error": "Invalid verification code"}` (deliberately vague — no "expired" vs "wrong" distinction to avoid timing/info-leak signals)
- Lockout from too many attempts → 429 with `{"error": "Too many attempts. Try again in 15 minutes.", "retry_after": 900}`
- Lost / expired short-lived token → 401 with `{"error": "Verification session expired. Please log in again."}` — frontend redirects to login
- Admin reset attempt by ineligible actor → 403 with `{"error": "You don't have permission to reset this user's MFA."}`
- Missing `MFA_SECRET_KEY` env var on a write path → 500 with logged stack trace via Sentry. App still boots; only MFA endpoints fail.

### Sentry instrumentation

Already wired (commit `b2e81b3`); behavior here:

- `mfa_failed` events captured as Sentry breadcrumbs (not errors — too noisy)
- `mfa_reset` events captured as `sentry_sdk.capture_message(level="info")` so resets show in the Sentry feed for awareness
- Anything that raises in the enrollment / verification path goes to Sentry with traceback (covered by existing `FlaskIntegration`)

## File Layout

| File | Status | Responsibility |
|---|---|---|
| `chapter-ops/backend/app/models/user_mfa.py` | Create | `UserMFA` model |
| `chapter-ops/backend/app/models/mfa_reset_event.py` | Create | `MFAResetEvent` audit model |
| `chapter-ops/backend/app/models/__init__.py` | Modify | Export new models |
| `chapter-ops/backend/migrations/versions/<auto>.py` | Create | Migration for both new tables |
| `chapter-ops/backend/app/services/mfa_service.py` | Create | All MFA business logic: secret generation, enroll, verify, backup-code generation/check, admin reset, `user_role_requires_mfa()`, `can_reset_mfa()` |
| `chapter-ops/backend/app/routes/mfa.py` | Create | Blueprint with all `/api/auth/mfa/*` endpoints |
| `chapter-ops/backend/app/routes/auth.py` | Modify | Login endpoint extended for the 3-way response branch; `is_founder_email(email)` extracted helper |
| `chapter-ops/backend/app/routes/members.py` | Modify | Add `/api/users/<id>/mfa/reset` endpoint (or live in mfa.py — pick during planning) |
| `chapter-ops/backend/app/__init__.py` | Modify | Register `mfa_bp` blueprint |
| `chapter-ops/backend/app/utils/mfa_token.py` | Create | Short-lived JWT helpers for `mfa_token` / `enrollment_token` |
| `chapter-ops/backend/app/extensions.py` | Possibly modify | If we add a Fernet helper as a singleton |
| `chapter-ops/backend/requirements.txt` | Modify | Add `pyotp`, `qrcode[pil]`, `cryptography` (Fernet — usually transitively pulled) |
| `chapter-ops/backend/tests/test_mfa_*.py` | Create (multiple) | Test enrollment, verification, recovery, admin reset, enforcement gate, rate limits |
| `chapter-ops/frontend/src/pages/MFAEnroll.tsx` | Create | 3-step enrollment wizard |
| `chapter-ops/frontend/src/pages/Login.tsx` | Modify | Branch on `requires_mfa` / `requires_enrollment` |
| `chapter-ops/frontend/src/pages/Settings.tsx` | Modify | Add Security tab with MFA section |
| `chapter-ops/frontend/src/pages/Members.tsx` | Modify | Add "Reset MFA" row action |
| `chapter-ops/frontend/src/pages/IHQDashboard.tsx` | Modify | Add "Reset MFA" row action on chapter health table |
| `chapter-ops/frontend/src/pages/PlatformDashboard.tsx` | Modify | Add "Reset MFA" action where appropriate |
| `chapter-ops/frontend/src/services/mfaService.ts` | Create | API client for all MFA endpoints |
| `chapter-ops/frontend/src/types/mfa.ts` | Create | TS types for MFA responses |
| `chapter-ops/frontend/src/App.tsx` | Modify | Add `/mfa/enroll` route |
| `chapter-ops/backend/app/routes/dashboard.py` | Modify | Add `mfa_required` inbox item |

## Operational Notes

- **Generating `MFA_SECRET_KEY` for production:** run `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` once. Store the output in Render env. Back up out-of-band (1Password, etc.) — losing it means all enrolled users need admin reset.
- **Local dev:** if `MFA_SECRET_KEY` is unset, the MFA endpoints raise 500 on any write. Sentry captures the error. Document in README that local dev needs the key set even though `MFA_ENFORCEMENT_ENABLED=false`.
- **Rollout:**
  1. Ship the PR to main with `MFA_ENFORCEMENT_ENABLED=false`. Deploy.
  2. Self-test by enabling MFA on Brandon's own account via Settings (opt-in path), log out, log back in with TOTP.
  3. Confirm admin reset works (test on a demo user).
  4. Email all officers with affected roles: "MFA will be required starting [date]. Please enroll early at /mfa/enroll under Settings → Security."
  5. After the announcement window, set `MFA_ENFORCEMENT_ENABLED=true` in Render. Render redeploys automatically.
  6. Anyone in a required role who hasn't enrolled hits the enrollment redirect at next login.

## Open Questions for Implementation Plan

1. Where to put the admin reset endpoint — `routes/mfa.py` (alongside other MFA stuff) or `routes/members.py` (alongside other user-management endpoints)? Probably `mfa.py` for cohesion. Verified during planning.
2. Whether to add Fernet to `extensions.py` as a module-level singleton or instantiate per-call. Singleton is faster and standard; per-call is simpler. Verified during planning by reading `app/extensions.py`.
3. Whether the existing `AuthEvent` model needs schema changes for the new event_types or if its `event_type` column accepts arbitrary strings. Likely accepts arbitrary; verified during planning.
4. Whether the JWT for `mfa_token` / `enrollment_token` should be a real JWT or a simpler signed string (`itsdangerous.URLSafeTimedSerializer`). Either works; probably `itsdangerous` since it's already a Flask ecosystem default.

## Success Criteria

After deploy with `MFA_ENFORCEMENT_ENABLED=true` in production:

1. A user who is a chapter Treasurer (and has no MFA enrolled) logs in with their password and is redirected to the MFA enrollment wizard. They scan the QR with Google Authenticator, enter the 6-digit code, see their 10 backup codes, save them, and land on the dashboard. On next login, they enter password + TOTP and reach the dashboard.
2. A regular member logs in with just their password (no MFA prompt) and reaches the dashboard normally — confirming non-required roles are unaffected.
3. A member opts in to MFA via Settings → Security → Enable. Next login, they're prompted for TOTP. They can disable MFA from the same Settings page.
4. A Treasurer loses their phone, uses a backup code at the login screen to authenticate, then regenerates fresh backup codes from Settings.
5. A Treasurer loses both phone and backup codes. The chapter President opens Members, clicks "Reset MFA" on the Treasurer's row, enters a reason, and confirms. The Treasurer's next login goes through the enrollment wizard again. An `MFAResetEvent` is recorded with the President as actor.
6. An attempt by a Secretary to reset another member's MFA returns 403 (Secretaries don't outrank anyone for reset purposes).
7. Five wrong TOTP attempts in 15 minutes return 429 with a clear "try again in X minutes" message.
8. Setting `MFA_ENFORCEMENT_ENABLED=false` in Render and redeploying immediately stops new enforcement (existing enrolled users still need to verify, but unenrolled required-role users can log in without the enrollment redirect).
