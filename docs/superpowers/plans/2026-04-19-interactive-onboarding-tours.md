# Interactive Onboarding Tours Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a role-aware first-login welcome modal + per-page contextual tooltips that guide new users through the high-value pages of ChapterOps, with server-side persistence and automatic re-fire on role promotion.

**Architecture:** Backend: one new `UserTourState` model + `app/routes/tours.py` blueprint exposing GET/PATCH/POST endpoints. Frontend: new `src/tours/` module containing a `TourProvider` context (mounted above the router), `Tooltip` component (Radix Popover + spotlight overlay), `WelcomeModal`, and a Zustand `tourStore` mirroring server state. Tour definitions and selector constants live in typed source files so renames break at compile-time, not runtime.

**Tech Stack:** Flask 3.x + SQLAlchemy 2.x + Alembic (backend); React 19 + TypeScript + Zustand + Radix UI Popover + Tailwind editorial theme (frontend); pytest + Vitest + Testing Library (tests).

**Spec reference:** [docs/superpowers/specs/2026-04-19-interactive-onboarding-tours-design.md](../specs/2026-04-19-interactive-onboarding-tours-design.md)

---

## Phase 1: Backend — Model, Migration, Endpoints

### Task 1: Create `UserTourState` model

**Files:**
- Create: `chapter-ops/backend/app/models/user_tour_state.py`
- Modify: `chapter-ops/backend/app/models/__init__.py` — add new import/export

- [ ] **Step 1: Write the failing model test**

File: `chapter-ops/backend/tests/test_user_tour_state_model.py`

```python
from app.extensions import db
from app.models import UserTourState


def test_user_tour_state_defaults_to_empty_seen(db_session, make_user):
    user = make_user()
    state = UserTourState(user_id=user.id)
    db_session.add(state)
    db_session.commit()

    fetched = UserTourState.query.filter_by(user_id=user.id).first()
    assert fetched is not None
    assert fetched.seen == {}


def test_user_tour_state_stores_jsonb(db_session, make_user):
    user = make_user()
    state = UserTourState(user_id=user.id, seen={"welcome": {"seen_at": "2026-04-19T00:00:00Z", "role": "member"}})
    db_session.add(state)
    db_session.commit()

    fetched = UserTourState.query.filter_by(user_id=user.id).first()
    assert fetched.seen["welcome"]["role"] == "member"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd chapter-ops/backend && python -m pytest tests/test_user_tour_state_model.py -v`
Expected: `ImportError: cannot import name 'UserTourState'`

- [ ] **Step 3: Implement the model**

File: `chapter-ops/backend/app/models/user_tour_state.py`

```python
from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db
from app.models.base import BaseModel


class UserTourState(BaseModel):
    __tablename__ = "user_tour_state"

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    seen: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
    )

    user = relationship("User", backref=db.backref("tour_state", uselist=False))
```

Add to `chapter-ops/backend/app/models/__init__.py` (after other imports/exports — follow existing pattern):

```python
from app.models.user_tour_state import UserTourState  # noqa: F401
```

And add `"UserTourState"` to the `__all__` list if one exists.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd chapter-ops/backend && python -m pytest tests/test_user_tour_state_model.py -v`
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add chapter-ops/backend/app/models/user_tour_state.py \
        chapter-ops/backend/app/models/__init__.py \
        chapter-ops/backend/tests/test_user_tour_state_model.py
git commit -m "feat(backend): add UserTourState model"
```

---

### Task 2: Alembic migration for `user_tour_state`

**Files:**
- Create: `chapter-ops/backend/migrations/versions/<hash>_add_user_tour_state.py`

- [ ] **Step 1: Generate the migration**

Run: `cd chapter-ops/backend && python -m flask db migrate -m "add user_tour_state"`
Expected: a new file appears in `migrations/versions/` with a hash prefix.

- [ ] **Step 2: Review and normalize the generated migration**

Open the generated file. Ensure the upgrade looks like this (adjust imports/revision IDs to match what was generated):

```python
def upgrade():
    op.create_table(
        "user_tour_state",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("seen", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index("ix_user_tour_state_user_id", "user_tour_state", ["user_id"])


def downgrade():
    op.drop_index("ix_user_tour_state_user_id", table_name="user_tour_state")
    op.drop_table("user_tour_state")
```

- [ ] **Step 3: Apply the migration**

Run: `cd chapter-ops/backend && python -m flask db upgrade`
Expected: "INFO ... Running upgrade ... -> <hash>, add user_tour_state"

- [ ] **Step 4: Verify the table exists**

Run: `cd chapter-ops/backend && python -m flask db current`
Expected: output shows the new revision as current.

- [ ] **Step 5: Commit**

```bash
git add chapter-ops/backend/migrations/versions/<hash>_add_user_tour_state.py
git commit -m "feat(backend): migration for user_tour_state"
```

---

### Task 3: `GET /api/tours/state` endpoint

**Files:**
- Create: `chapter-ops/backend/app/routes/tours.py`
- Modify: `chapter-ops/backend/app/__init__.py` — register blueprint
- Create: `chapter-ops/backend/tests/test_tours.py`

- [ ] **Step 1: Write the failing test**

File: `chapter-ops/backend/tests/test_tours.py`

```python
VALID_PASSWORD = "Str0ng!Password1"


def _login(client, email):
    client.post("/api/auth/login", json={"email": email, "password": VALID_PASSWORD})


def test_get_state_requires_auth(client):
    res = client.get("/api/tours/state")
    assert res.status_code == 401


def test_get_state_returns_empty_for_new_user(client, db_session, make_user):
    user = make_user(password=VALID_PASSWORD)
    db_session.commit()
    _login(client, user.email)

    res = client.get("/api/tours/state")
    assert res.status_code == 200
    assert res.json == {"seen": {}}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd chapter-ops/backend && python -m pytest tests/test_tours.py -v`
Expected: FAIL (404 because the route doesn't exist yet)

- [ ] **Step 3: Implement the route**

File: `chapter-ops/backend/app/routes/tours.py`

```python
"""User onboarding tour state endpoints."""
from __future__ import annotations

import re
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from app.extensions import db, limiter
from app.models import UserTourState

tours_bp = Blueprint("tours", __name__, url_prefix="/api/tours")

TOUR_ID_RE = re.compile(r"^[a-z_]{1,50}$")
VALID_ROLES = {"member", "secretary", "treasurer", "vice_president", "president", "admin"}


def _get_or_create_state(user_id) -> UserTourState:
    state = UserTourState.query.filter_by(user_id=user_id).first()
    if state is None:
        state = UserTourState(user_id=user_id, seen={})
        db.session.add(state)
    return state


@tours_bp.route("/state", methods=["GET"])
@login_required
def get_state():
    state = UserTourState.query.filter_by(user_id=current_user.id).first()
    return jsonify({"seen": state.seen if state else {}}), 200
```

Modify `chapter-ops/backend/app/__init__.py` — add import and registration alongside other blueprints:

```python
# (with the other route imports)
from app.routes.tours import tours_bp

# (with the other register_blueprint calls)
app.register_blueprint(tours_bp)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd chapter-ops/backend && python -m pytest tests/test_tours.py -v`
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add chapter-ops/backend/app/routes/tours.py \
        chapter-ops/backend/app/__init__.py \
        chapter-ops/backend/tests/test_tours.py
git commit -m "feat(backend): GET /api/tours/state"
```

---

### Task 4: `PATCH /api/tours/state` endpoint

**Files:**
- Modify: `chapter-ops/backend/app/routes/tours.py` — add PATCH handler
- Modify: `chapter-ops/backend/tests/test_tours.py` — add PATCH tests

- [ ] **Step 1: Write the failing tests**

Append to `chapter-ops/backend/tests/test_tours.py`:

```python
def test_patch_state_creates_row_on_first_write(client, db_session, make_user):
    user = make_user(password=VALID_PASSWORD)
    db_session.commit()
    _login(client, user.email)

    res = client.patch("/api/tours/state", json={"tour_id": "welcome", "role": "member"})
    assert res.status_code == 200
    assert "welcome" in res.json["seen"]
    assert res.json["seen"]["welcome"]["role"] == "member"
    assert "seen_at" in res.json["seen"]["welcome"]


def test_patch_state_upserts_without_clobbering(client, db_session, make_user):
    user = make_user(password=VALID_PASSWORD)
    db_session.commit()
    _login(client, user.email)

    client.patch("/api/tours/state", json={"tour_id": "welcome", "role": "member"})
    res = client.patch("/api/tours/state", json={"tour_id": "chapter_dues", "role": "treasurer"})

    assert res.status_code == 200
    assert set(res.json["seen"].keys()) == {"welcome", "chapter_dues"}
    assert res.json["seen"]["welcome"]["role"] == "member"
    assert res.json["seen"]["chapter_dues"]["role"] == "treasurer"


def test_patch_state_rejects_invalid_tour_id(client, db_session, make_user):
    user = make_user(password=VALID_PASSWORD)
    db_session.commit()
    _login(client, user.email)

    res = client.patch("/api/tours/state", json={"tour_id": "BAD-ID", "role": "member"})
    assert res.status_code == 400


def test_patch_state_rejects_invalid_role(client, db_session, make_user):
    user = make_user(password=VALID_PASSWORD)
    db_session.commit()
    _login(client, user.email)

    res = client.patch("/api/tours/state", json={"tour_id": "welcome", "role": "wizard"})
    assert res.status_code == 400


def test_patch_state_requires_auth(client):
    res = client.patch("/api/tours/state", json={"tour_id": "welcome", "role": "member"})
    assert res.status_code == 401
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd chapter-ops/backend && python -m pytest tests/test_tours.py -v`
Expected: new tests fail (PATCH route returns 405/404)

- [ ] **Step 3: Implement the PATCH handler**

Append to `chapter-ops/backend/app/routes/tours.py`:

```python
@tours_bp.route("/state", methods=["PATCH"])
@login_required
@limiter.limit("60 per minute")
def patch_state():
    payload = request.get_json(silent=True) or {}
    tour_id = payload.get("tour_id")
    role = payload.get("role")

    if not isinstance(tour_id, str) or not TOUR_ID_RE.match(tour_id):
        return jsonify({"error": "Invalid tour_id."}), 400
    if role not in VALID_ROLES:
        return jsonify({"error": "Invalid role."}), 400

    state = _get_or_create_state(current_user.id)
    seen = dict(state.seen or {})
    seen[tour_id] = {
        "seen_at": datetime.now(timezone.utc).isoformat(),
        "role": role,
    }
    state.seen = seen
    db.session.commit()

    return jsonify({"seen": state.seen}), 200
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd chapter-ops/backend && python -m pytest tests/test_tours.py -v`
Expected: 7 passed total

- [ ] **Step 5: Commit**

```bash
git add chapter-ops/backend/app/routes/tours.py chapter-ops/backend/tests/test_tours.py
git commit -m "feat(backend): PATCH /api/tours/state"
```

---

### Task 5: `POST /api/tours/reset` endpoint

**Files:**
- Modify: `chapter-ops/backend/app/routes/tours.py` — add POST handler
- Modify: `chapter-ops/backend/tests/test_tours.py` — add reset tests

- [ ] **Step 1: Write the failing tests**

Append to `chapter-ops/backend/tests/test_tours.py`:

```python
def test_reset_clears_seen(client, db_session, make_user):
    user = make_user(password=VALID_PASSWORD)
    db_session.commit()
    _login(client, user.email)

    client.patch("/api/tours/state", json={"tour_id": "welcome", "role": "member"})
    res = client.post("/api/tours/reset")

    assert res.status_code == 200
    assert res.json == {"seen": {}}


def test_reset_is_idempotent_for_new_user(client, db_session, make_user):
    user = make_user(password=VALID_PASSWORD)
    db_session.commit()
    _login(client, user.email)

    res = client.post("/api/tours/reset")
    assert res.status_code == 200
    assert res.json == {"seen": {}}


def test_reset_requires_auth(client):
    res = client.post("/api/tours/reset")
    assert res.status_code == 401
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd chapter-ops/backend && python -m pytest tests/test_tours.py -v`
Expected: new tests fail

- [ ] **Step 3: Implement the POST handler**

Append to `chapter-ops/backend/app/routes/tours.py`:

```python
@tours_bp.route("/reset", methods=["POST"])
@login_required
@limiter.limit("5 per hour")
def reset_state():
    state = _get_or_create_state(current_user.id)
    state.seen = {}
    db.session.commit()
    return jsonify({"seen": {}}), 200
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd chapter-ops/backend && python -m pytest tests/test_tours.py -v`
Expected: 10 passed total

- [ ] **Step 5: Commit**

```bash
git add chapter-ops/backend/app/routes/tours.py chapter-ops/backend/tests/test_tours.py
git commit -m "feat(backend): POST /api/tours/reset"
```

---

## Phase 2: Frontend — Types, Constants, Pure Logic

### Task 6: Install `@radix-ui/react-popover`

**Files:**
- Modify: `chapter-ops/frontend/package.json` — new dependency

- [ ] **Step 1: Install**

Run: `cd chapter-ops/frontend && npm install @radix-ui/react-popover`
Expected: dependency added; `package-lock.json` updated.

- [ ] **Step 2: Verify install**

Run: `cd chapter-ops/frontend && node -e "console.log(require('@radix-ui/react-popover/package.json').version)"`
Expected: prints a version string (e.g., `1.1.x`).

- [ ] **Step 3: Commit**

```bash
git add chapter-ops/frontend/package.json chapter-ops/frontend/package-lock.json
git commit -m "chore(frontend): install @radix-ui/react-popover"
```

---

### Task 7: Tour types and target constants

**Files:**
- Create: `chapter-ops/frontend/src/types/tour.ts`
- Create: `chapter-ops/frontend/src/tours/tourTargets.ts`
- Modify: `chapter-ops/frontend/src/types/index.ts` — re-export new types

- [ ] **Step 1: Create the types file**

File: `chapter-ops/frontend/src/types/tour.ts`

```ts
export type Role =
  | "member"
  | "secretary"
  | "treasurer"
  | "vice_president"
  | "president"
  | "admin";

export type TourSeenEntry = {
  seen_at: string;
  role: Role;
};

export type TourSeen = Record<string, TourSeenEntry>;

export type TourStep = {
  target: string;
  label: string;
  heading: string;
  body: string;
  placement?: "top" | "bottom" | "left" | "right";
};

export type TourDefinition = {
  id: string;
  route: string;
  roles: Role[];
  matcher?: () => boolean;
  steps: TourStep[];
};
```

- [ ] **Step 2: Create the target constants**

File: `chapter-ops/frontend/src/tours/tourTargets.ts`

```ts
export const TOUR_TARGETS = {
  // Dashboard
  DASHBOARD_INBOX: "dashboard-inbox",
  DASHBOARD_QUICK_ACTIONS: "dashboard-quick-actions",
  DASHBOARD_ANALYTICS_LINK: "dashboard-analytics-link",

  // MyDues
  MY_DUES_BREAKDOWN: "my-dues-breakdown",
  MY_DUES_PAY_CTA: "my-dues-pay-cta",
  MY_DUES_STATUS_BANNER: "my-dues-status-banner",

  // TreasurerDues
  CHAPTER_DUES_COLLECTION_STATS: "chapter-dues-collection-stats",
  CHAPTER_DUES_MATRIX: "chapter-dues-matrix",
  CHAPTER_DUES_INLINE_EDIT: "chapter-dues-inline-edit",
  CHAPTER_DUES_PERIOD_PICKER: "chapter-dues-period-picker",

  // Committees (inside Settings)
  COMMITTEES_CREATE: "committees-create",
  COMMITTEES_ASSIGN_CHAIR: "committees-assign-chair",
  COMMITTEES_BUDGET: "committees-budget",

  // Analytics
  ANALYTICS_PERIOD_COMPARISON: "analytics-period-comparison",
  ANALYTICS_MEMBER_STATUS: "analytics-member-status",
  ANALYTICS_MONTHLY_TREND: "analytics-monthly-trend",
} as const;

export type TourTargetId = (typeof TOUR_TARGETS)[keyof typeof TOUR_TARGETS];
```

- [ ] **Step 3: Re-export types**

Append to `chapter-ops/frontend/src/types/index.ts`:

```ts
export * from "./tour";
```

- [ ] **Step 4: Typecheck**

Run: `cd chapter-ops/frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add chapter-ops/frontend/src/types/tour.ts \
        chapter-ops/frontend/src/tours/tourTargets.ts \
        chapter-ops/frontend/src/types/index.ts
git commit -m "feat(frontend): tour types and target constants"
```

---

### Task 8: `shouldShowTour` pure function + role ranking

**Files:**
- Create: `chapter-ops/frontend/src/tours/shouldShowTour.ts`
- Create: `chapter-ops/frontend/src/tours/shouldShowTour.test.ts`

- [ ] **Step 1: Write the failing tests**

File: `chapter-ops/frontend/src/tours/shouldShowTour.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { shouldShowTour, ROLE_RANK } from "./shouldShowTour";
import type { TourDefinition, TourSeen } from "@/types/tour";

const chapterDuesTour: TourDefinition = {
  id: "chapter_dues",
  route: "^/chapter-dues$",
  roles: ["treasurer", "vice_president", "president", "admin"],
  steps: [],
};

const myDuesTour: TourDefinition = {
  id: "my_dues",
  route: "^/dues$",
  roles: ["member", "secretary", "treasurer", "vice_president", "president", "admin"],
  steps: [],
};

describe("shouldShowTour", () => {
  it("returns true for a new user who has never seen the tour", () => {
    expect(shouldShowTour(chapterDuesTour, "treasurer", {})).toBe(true);
  });

  it("returns false when the user's role is not in tour.roles", () => {
    expect(shouldShowTour(chapterDuesTour, "member", {})).toBe(false);
  });

  it("returns false when seen at the same role", () => {
    const seen: TourSeen = { chapter_dues: { seen_at: "2026-01-01", role: "treasurer" } };
    expect(shouldShowTour(chapterDuesTour, "treasurer", seen)).toBe(false);
  });

  it("returns true when user has been promoted past seen role", () => {
    const seen: TourSeen = { my_dues: { seen_at: "2026-01-01", role: "member" } };
    expect(shouldShowTour(chapterDuesTour, "treasurer", seen)).toBe(true);
  });

  it("returns false after demotion (seen role was higher)", () => {
    const seen: TourSeen = { chapter_dues: { seen_at: "2026-01-01", role: "president" } };
    expect(shouldShowTour(chapterDuesTour, "treasurer", seen)).toBe(false);
  });

  it("does not re-fire my_dues after promotion from member to treasurer", () => {
    const seen: TourSeen = { my_dues: { seen_at: "2026-01-01", role: "member" } };
    expect(shouldShowTour(myDuesTour, "treasurer", seen)).toBe(false);
  });

  it("admin re-fires officer tour when never seen", () => {
    expect(shouldShowTour(chapterDuesTour, "admin", {})).toBe(true);
  });

  it("admin does NOT re-fire officer tours seen at lower rank", () => {
    const seen: TourSeen = { chapter_dues: { seen_at: "2026-01-01", role: "treasurer" } };
    expect(shouldShowTour(chapterDuesTour, "admin", seen)).toBe(false);
  });

  it("ROLE_RANK has all six roles", () => {
    expect(Object.keys(ROLE_RANK).sort()).toEqual(
      ["admin", "member", "president", "secretary", "treasurer", "vice_president"].sort()
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd chapter-ops/frontend && npx vitest run src/tours/shouldShowTour.test.ts`
Expected: all fail (import error)

- [ ] **Step 3: Implement the function**

File: `chapter-ops/frontend/src/tours/shouldShowTour.ts`

```ts
import type { Role, TourDefinition, TourSeen } from "@/types/tour";

export const ROLE_RANK: Record<Role, number> = {
  admin: 5,
  president: 4,
  vice_president: 3,
  treasurer: 2,
  secretary: 1,
  member: 0,
};

export function shouldShowTour(
  tour: TourDefinition,
  currentRole: Role,
  seen: TourSeen,
): boolean {
  if (!tour.roles.includes(currentRole)) return false;
  const prior = seen[tour.id];
  if (!prior) return true;
  if (ROLE_RANK[currentRole] > ROLE_RANK[prior.role]) return true;
  return false;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd chapter-ops/frontend && npx vitest run src/tours/shouldShowTour.test.ts`
Expected: 9 passed

- [ ] **Step 5: Commit**

```bash
git add chapter-ops/frontend/src/tours/shouldShowTour.ts \
        chapter-ops/frontend/src/tours/shouldShowTour.test.ts
git commit -m "feat(frontend): shouldShowTour + ROLE_RANK"
```

---

### Task 9: `tourService` API client

**Files:**
- Create: `chapter-ops/frontend/src/services/tourService.ts`

- [ ] **Step 1: Create the service**

File: `chapter-ops/frontend/src/services/tourService.ts`

```ts
import api from "@/lib/api";
import type { Role, TourSeen } from "@/types/tour";

export async function fetchTourState(): Promise<TourSeen> {
  const res = await api.get<{ seen: TourSeen }>("/tours/state");
  return res.data.seen;
}

export async function markTourSeen(tourId: string, role: Role): Promise<TourSeen> {
  const res = await api.patch<{ seen: TourSeen }>("/tours/state", {
    tour_id: tourId,
    role,
  });
  return res.data.seen;
}

export async function resetTourState(): Promise<TourSeen> {
  const res = await api.post<{ seen: TourSeen }>("/tours/reset");
  return res.data.seen;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd chapter-ops/frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add chapter-ops/frontend/src/services/tourService.ts
git commit -m "feat(frontend): tourService API client"
```

---

### Task 10: `tourStore` Zustand store

**Files:**
- Create: `chapter-ops/frontend/src/stores/tourStore.ts`

- [ ] **Step 1: Create the store**

File: `chapter-ops/frontend/src/stores/tourStore.ts`

```ts
import { create } from "zustand";
import type { Role, TourSeen } from "@/types/tour";
import {
  fetchTourState,
  markTourSeen as apiMarkSeen,
  resetTourState as apiReset,
} from "@/services/tourService";

interface TourState {
  seen: TourSeen;
  loaded: boolean;
  loadSeen: () => Promise<void>;
  markSeen: (tourId: string, role: Role) => Promise<void>;
  reset: () => Promise<void>;
}

export const useTourStore = create<TourState>((set, get) => ({
  seen: {},
  loaded: false,

  loadSeen: async () => {
    try {
      const seen = await fetchTourState();
      set({ seen, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  markSeen: async (tourId, role) => {
    const prev = get().seen;
    set({
      seen: {
        ...prev,
        [tourId]: { seen_at: new Date().toISOString(), role },
      },
    });
    try {
      const seen = await apiMarkSeen(tourId, role);
      set({ seen });
    } catch {
      set({ seen: prev });
    }
  },

  reset: async () => {
    const prev = get().seen;
    set({ seen: {} });
    try {
      const seen = await apiReset();
      set({ seen });
    } catch {
      set({ seen: prev });
    }
  },
}));
```

- [ ] **Step 2: Typecheck**

Run: `cd chapter-ops/frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add chapter-ops/frontend/src/stores/tourStore.ts
git commit -m "feat(frontend): tourStore with optimistic updates"
```

---

### Task 11: Tour definitions (with draft copy)

**Files:**
- Create: `chapter-ops/frontend/src/tours/tourDefinitions.ts`
- Create: `chapter-ops/frontend/src/tours/tourDefinitions.test.ts`

- [ ] **Step 1: Write the failing validation test**

File: `chapter-ops/frontend/src/tours/tourDefinitions.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { TOUR_DEFINITIONS } from "./tourDefinitions";
import { TOUR_TARGETS } from "./tourTargets";

const VALID_TARGETS = new Set(Object.values(TOUR_TARGETS));

describe("TOUR_DEFINITIONS", () => {
  it("every step target references a valid TOUR_TARGETS constant", () => {
    for (const tour of TOUR_DEFINITIONS) {
      for (const step of tour.steps) {
        expect(VALID_TARGETS.has(step.target as (typeof TOUR_TARGETS)[keyof typeof TOUR_TARGETS]))
          .toBe(true);
      }
    }
  });

  it("every tour has at most 4 steps", () => {
    for (const tour of TOUR_DEFINITIONS) {
      expect(tour.steps.length).toBeLessThanOrEqual(4);
    }
  });

  it("tour ids are unique", () => {
    const ids = TOUR_DEFINITIONS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd chapter-ops/frontend && npx vitest run src/tours/tourDefinitions.test.ts`
Expected: import error (TOUR_DEFINITIONS not defined)

- [ ] **Step 3: Create tour definitions with draft copy**

File: `chapter-ops/frontend/src/tours/tourDefinitions.ts`

```ts
import type { TourDefinition } from "@/types/tour";
import { TOUR_TARGETS } from "./tourTargets";

export const TOUR_DEFINITIONS: TourDefinition[] = [
  {
    id: "dashboard_member",
    route: "^/$",
    roles: ["member"],
    steps: [
      {
        target: TOUR_TARGETS.DASHBOARD_INBOX,
        label: "STEP 01 / 02",
        heading: "Your action queue",
        body: "Anything that needs your attention — unpaid dues, upcoming events, pending RSVPs — shows up here first.",
        placement: "bottom",
      },
      {
        target: TOUR_TARGETS.DASHBOARD_QUICK_ACTIONS,
        label: "STEP 02 / 02",
        heading: "Jump to what you need",
        body: "Tap any quick action to pay dues, see events, or check your profile without hunting through the menu.",
        placement: "bottom",
      },
    ],
  },
  {
    id: "dashboard_officer",
    route: "^/$",
    roles: ["secretary", "treasurer", "vice_president", "president", "admin"],
    steps: [
      {
        target: TOUR_TARGETS.DASHBOARD_INBOX,
        label: "STEP 01 / 03 · OFFICER",
        heading: "Chapter-wide attention items",
        body: "Expense approvals, members behind on dues, pending transfers — everything your role can act on is surfaced here.",
        placement: "bottom",
      },
      {
        target: TOUR_TARGETS.DASHBOARD_QUICK_ACTIONS,
        label: "STEP 02 / 03 · OFFICER",
        heading: "Officer shortcuts",
        body: "Direct links to the pages you'll visit most: dues, members, events, and communications.",
        placement: "bottom",
      },
      {
        target: TOUR_TARGETS.DASHBOARD_ANALYTICS_LINK,
        label: "STEP 03 / 03 · OFFICER",
        heading: "Analytics at a glance",
        body: "Tap here whenever you want the full chapter report — collection rates, member status, trends.",
        placement: "bottom",
      },
    ],
  },
  {
    id: "my_dues",
    route: "^/dues$",
    roles: ["member", "secretary", "treasurer", "vice_president", "president", "admin"],
    steps: [
      {
        target: TOUR_TARGETS.MY_DUES_STATUS_BANNER,
        label: "STEP 01 / 03",
        heading: "Your financial standing",
        body: "Green means you're financial — good standing for voting, events, and line activities. Red means something's owed.",
        placement: "bottom",
      },
      {
        target: TOUR_TARGETS.MY_DUES_BREAKDOWN,
        label: "STEP 02 / 03",
        heading: "What you owe, line by line",
        body: "Chapter dues, national, regional — each fee shows what's owed and what's paid for this period.",
        placement: "bottom",
      },
      {
        target: TOUR_TARGETS.MY_DUES_PAY_CTA,
        label: "STEP 03 / 03",
        heading: "Pay when you're ready",
        body: "Tap here to settle any remaining balance through secure Stripe checkout. Partial payments are fine.",
        placement: "top",
      },
    ],
  },
  {
    id: "chapter_dues",
    route: "^/chapter-dues$",
    roles: ["treasurer", "vice_president", "president", "admin"],
    steps: [
      {
        target: TOUR_TARGETS.CHAPTER_DUES_COLLECTION_STATS,
        label: "STEP 01 / 04 · TREASURER",
        heading: "Your collection overview",
        body: "Total dues collected, what's still outstanding, and how many members are behind — all for the active period.",
        placement: "bottom",
      },
      {
        target: TOUR_TARGETS.CHAPTER_DUES_PERIOD_PICKER,
        label: "STEP 02 / 04 · TREASURER",
        heading: "Switch between periods",
        body: "Compare current dues against last semester or jump to a custom period — handy for transition meetings.",
        placement: "bottom",
      },
      {
        target: TOUR_TARGETS.CHAPTER_DUES_MATRIX,
        label: "STEP 03 / 04 · TREASURER",
        heading: "Every member, every fee",
        body: "Each row is a member; each column is a fee type. A filled cell means paid; an empty one means outstanding.",
        placement: "top",
      },
      {
        target: TOUR_TARGETS.CHAPTER_DUES_INLINE_EDIT,
        label: "STEP 04 / 04 · TREASURER",
        heading: "Adjust without leaving the page",
        body: "Click any cell to edit amount owed, mark a member exempt, or add a note. Changes recompute financial status immediately.",
        placement: "top",
      },
    ],
  },
  {
    id: "committees",
    route: "^/settings$",
    roles: ["treasurer", "vice_president", "president", "admin"],
    matcher: () => {
      const hash = window.location.hash.replace("#", "");
      const search = new URLSearchParams(window.location.search).get("tab");
      return hash === "committees" || search === "committees";
    },
    steps: [
      {
        target: TOUR_TARGETS.COMMITTEES_CREATE,
        label: "STEP 01 / 03 · PRESIDENT",
        heading: "Spin up a committee",
        body: "Committees organize chapter initiatives — fundraising, programming, service. Create one, then assign a chair.",
        placement: "bottom",
      },
      {
        target: TOUR_TARGETS.COMMITTEES_ASSIGN_CHAIR,
        label: "STEP 02 / 03 · PRESIDENT",
        heading: "Name a chair",
        body: "The chair oversees the committee's budget and activities. No new role tier — they stay in their existing membership.",
        placement: "bottom",
      },
      {
        target: TOUR_TARGETS.COMMITTEES_BUDGET,
        label: "STEP 03 / 03 · PRESIDENT",
        heading: "Budget tracking",
        body: "Set a budget, tag expenses to the committee, and watch spent / pending / remaining update in real time.",
        placement: "top",
      },
    ],
  },
  {
    id: "analytics",
    route: "^/analytics$",
    roles: ["secretary", "treasurer", "vice_president", "president", "admin"],
    steps: [
      {
        target: TOUR_TARGETS.ANALYTICS_PERIOD_COMPARISON,
        label: "STEP 01 / 03",
        heading: "Period-over-period",
        body: "Current period vs. the last — dues collected, members financial, events held — so you can see the trend at a glance.",
        placement: "bottom",
      },
      {
        target: TOUR_TARGETS.ANALYTICS_MEMBER_STATUS,
        label: "STEP 02 / 03",
        heading: "Who's where",
        body: "Active, not financial, neophyte, exempt — the distribution across your active roster for this period.",
        placement: "bottom",
      },
      {
        target: TOUR_TARGETS.ANALYTICS_MONTHLY_TREND,
        label: "STEP 03 / 03",
        heading: "12 months of payments",
        body: "When dues tend to come in, when they dry up — useful for planning reminder campaigns and cash-flow.",
        placement: "top",
      },
    ],
  },
];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd chapter-ops/frontend && npx vitest run src/tours/tourDefinitions.test.ts`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add chapter-ops/frontend/src/tours/tourDefinitions.ts \
        chapter-ops/frontend/src/tours/tourDefinitions.test.ts
git commit -m "feat(frontend): tour definitions with draft copy"
```

---

## Phase 3: Frontend — UI Components

### Task 12: `Tooltip` component (spotlight + cream card)

**Files:**
- Create: `chapter-ops/frontend/src/tours/Tooltip.tsx`
- Create: `chapter-ops/frontend/src/tours/Tooltip.test.tsx`
- Modify: `chapter-ops/frontend/src/index.css` — add `[data-tour-active]` outline rule

- [ ] **Step 1: Write the failing smoke test**

File: `chapter-ops/frontend/src/tours/Tooltip.test.tsx`

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TourTooltip } from "./Tooltip";

describe("TourTooltip", () => {
  it("renders label, heading, body, and Next/Skip buttons", () => {
    render(
      <div>
        <div data-tour-target="smoke-target">Target</div>
        <TourTooltip
          targetId="smoke-target"
          label="STEP 01 / 02"
          heading="Test heading"
          body="Test body copy."
          placement="bottom"
          onNext={vi.fn()}
          onSkip={vi.fn()}
          isLastStep={false}
          open={true}
        />
      </div>,
    );

    expect(screen.getByText("STEP 01 / 02")).toBeInTheDocument();
    expect(screen.getByText("Test heading")).toBeInTheDocument();
    expect(screen.getByText("Test body copy.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /skip/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next/i })).toBeInTheDocument();
  });

  it("calls onNext when Next is clicked", async () => {
    const onNext = vi.fn();
    render(
      <div>
        <div data-tour-target="smoke-target">Target</div>
        <TourTooltip
          targetId="smoke-target"
          label="STEP 01 / 02"
          heading="Test heading"
          body="Test body copy."
          placement="bottom"
          onNext={onNext}
          onSkip={vi.fn()}
          isLastStep={false}
          open={true}
        />
      </div>,
    );
    await userEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it("shows Done instead of Next on the last step", () => {
    render(
      <div>
        <div data-tour-target="smoke-target">Target</div>
        <TourTooltip
          targetId="smoke-target"
          label="STEP 02 / 02"
          heading="Last"
          body="Final step."
          placement="bottom"
          onNext={vi.fn()}
          onSkip={vi.fn()}
          isLastStep={true}
          open={true}
        />
      </div>,
    );
    expect(screen.getByRole("button", { name: /done/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd chapter-ops/frontend && npx vitest run src/tours/Tooltip.test.tsx`
Expected: import error

- [ ] **Step 3: Implement the component**

File: `chapter-ops/frontend/src/tours/Tooltip.tsx`

```tsx
import { useEffect, useState } from "react";
import * as Popover from "@radix-ui/react-popover";

interface TourTooltipProps {
  targetId: string;
  label: string;
  heading: string;
  body: string;
  placement: "top" | "bottom" | "left" | "right";
  onNext: () => void;
  onSkip: () => void;
  isLastStep: boolean;
  open: boolean;
}

export function TourTooltip({
  targetId,
  label,
  heading,
  body,
  placement,
  onNext,
  onSkip,
  isLastStep,
  open,
}: TourTooltipProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const el = document.querySelector<HTMLElement>(`[data-tour-target="${targetId}"]`);
    if (el) {
      el.setAttribute("data-tour-active", "true");
      setAnchor(el);
    }
    return () => {
      if (el) el.removeAttribute("data-tour-active");
    };
  }, [targetId, open]);

  if (!open || !anchor) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/35 z-[90]" aria-hidden />
      <Popover.Root open>
        <Popover.Anchor virtualRef={{ current: anchor }} />
        <Popover.Portal>
          <Popover.Content
            side={placement}
            sideOffset={12}
            collisionPadding={16}
            className="z-[100] w-[300px] bg-[var(--color-bg-deep)] border border-[var(--color-border)] border-t-[3px] border-t-[var(--color-text-heading)] p-[18px] shadow-lg outline-none"
          >
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-content-muted">
              {label}
            </div>
            <h4 className="font-heading font-black tracking-tight text-[20px] text-content-heading mt-1.5 mb-2">
              {heading}
            </h4>
            <p className="text-[13px] leading-relaxed text-content-secondary mb-4">{body}</p>
            <div className="flex justify-between items-center gap-2">
              <button
                type="button"
                onClick={onSkip}
                className="text-[11px] font-semibold uppercase tracking-[0.1em] text-content-muted hover:text-content-primary px-2 py-1"
              >
                Skip tour
              </button>
              <button
                type="button"
                onClick={onNext}
                className="text-[11px] font-semibold uppercase tracking-[0.1em] bg-[var(--color-text-heading)] text-[var(--color-bg-deep)] hover:opacity-90 px-4 py-2"
              >
                {isLastStep ? "Done" : "Next →"}
              </button>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </>
  );
}
```

Append to `chapter-ops/frontend/src/index.css`:

```css
/* Tour spotlight target */
[data-tour-active] {
  outline: 3px solid var(--color-text-heading);
  outline-offset: 2px;
  position: relative;
  z-index: 95;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd chapter-ops/frontend && npx vitest run src/tours/Tooltip.test.tsx`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add chapter-ops/frontend/src/tours/Tooltip.tsx \
        chapter-ops/frontend/src/tours/Tooltip.test.tsx \
        chapter-ops/frontend/src/index.css
git commit -m "feat(frontend): TourTooltip component"
```

---

### Task 13: `WelcomeModal` component

**Files:**
- Create: `chapter-ops/frontend/src/tours/WelcomeModal.tsx`

- [ ] **Step 1: Create the component**

File: `chapter-ops/frontend/src/tours/WelcomeModal.tsx`

```tsx
import type { Role } from "@/types/tour";

interface WelcomeModalProps {
  role: Role;
  chapterName: string;
  onDismiss: () => void;
}

const ROLE_PITCH: Record<Role, string> = {
  member: "Here's where you'll pay dues, RSVP to events, and stay connected with your chapter.",
  secretary: "You'll manage records, track attendance, and help keep the chapter running smoothly.",
  treasurer: "You're the financial lead — track dues, approve expenses, and keep the books clean.",
  vice_president:
    "You'll keep officer transitions smooth and support the president across all operations.",
  president:
    "You lead the chapter. This platform brings dues, members, events, and comms into one place so you can focus on leading.",
  admin: "Full platform access. Use the side menu to navigate any org, chapter, or setting.",
};

export function WelcomeModal({ role, chapterName, onDismiss }: WelcomeModalProps) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50">
      <div
        role="dialog"
        aria-labelledby="welcome-heading"
        className="bg-[var(--color-bg-deep)] border border-[var(--color-border)] border-t-[3px] border-t-[var(--color-text-heading)] max-w-md w-full mx-4 p-8 shadow-xl"
      >
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-content-muted">
          Welcome to {chapterName}
        </div>
        <h2
          id="welcome-heading"
          className="font-heading font-black tracking-tight text-[32px] text-content-heading leading-tight mt-2 mb-4"
        >
          Let's get you oriented.
        </h2>
        <p className="text-[14px] leading-relaxed text-content-secondary mb-6">{ROLE_PITCH[role]}</p>
        <p className="text-[13px] leading-relaxed text-content-muted mb-6">
          As you visit pages for the first time, short tooltips will point out the important things.
          You can skip them anytime.
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="w-full text-[11px] font-semibold uppercase tracking-[0.1em] bg-[var(--color-text-heading)] text-[var(--color-bg-deep)] hover:opacity-90 px-4 py-3"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd chapter-ops/frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add chapter-ops/frontend/src/tours/WelcomeModal.tsx
git commit -m "feat(frontend): WelcomeModal component"
```

---

### Task 14: `TourProvider` orchestrator

**Files:**
- Create: `chapter-ops/frontend/src/tours/TourProvider.tsx`
- Create: `chapter-ops/frontend/src/tours/useTour.ts`

- [ ] **Step 1: Create the context + hook**

File: `chapter-ops/frontend/src/tours/useTour.ts`

```ts
import { createContext, useContext } from "react";
import type { TourDefinition } from "@/types/tour";

export interface TourContextValue {
  activeTour: TourDefinition | null;
  activeStepIndex: number;
  next: () => void;
  skip: () => void;
  replay: () => Promise<void>;
}

export const TourContext = createContext<TourContextValue | null>(null);

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within TourProvider");
  return ctx;
}
```

- [ ] **Step 2: Create the provider**

File: `chapter-ops/frontend/src/tours/TourProvider.tsx`

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { useAuthStore } from "@/stores/authStore";
import { useTourStore } from "@/stores/tourStore";
import type { Role, TourDefinition } from "@/types/tour";
import { shouldShowTour } from "./shouldShowTour";
import { TOUR_DEFINITIONS } from "./tourDefinitions";
import { TourTooltip } from "./Tooltip";
import { WelcomeModal } from "./WelcomeModal";
import { TourContext, type TourContextValue } from "./useTour";

const ROUTE_DELAY_MS = 500;
const TARGET_ABORT_MS = 2000;

function useCurrentRole(): Role | null {
  const memberships = useAuthStore((s) => s.memberships);
  const user = useAuthStore((s) => s.user);
  const active = memberships.find((m) => m.chapter_id === user?.active_chapter_id && m.active);
  return (active?.role as Role | undefined) ?? null;
}

function useActiveChapterName(): string {
  const memberships = useAuthStore((s) => s.memberships);
  const user = useAuthStore((s) => s.user);
  const active = memberships.find((m) => m.chapter_id === user?.active_chapter_id);
  return active?.chapter_name ?? "ChapterOps";
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isAuthed = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const role = useCurrentRole();
  const chapterName = useActiveChapterName();

  const seen = useTourStore((s) => s.seen);
  const loaded = useTourStore((s) => s.loaded);
  const loadSeen = useTourStore((s) => s.loadSeen);
  const markSeen = useTourStore((s) => s.markSeen);
  const reset = useTourStore((s) => s.reset);

  const [activeTour, setActiveTour] = useState<TourDefinition | null>(null);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [showWelcome, setShowWelcome] = useState(false);

  const lastEvaluatedRoute = useRef<string | null>(null);

  useEffect(() => {
    if (isAuthed && !loaded) void loadSeen();
  }, [isAuthed, loaded, loadSeen]);

  // Welcome modal — fires once when auth'd and not seen.
  useEffect(() => {
    if (!isAuthed || !loaded || !role || !user?.active_chapter_id) return;
    if (!seen["welcome"]) setShowWelcome(true);
  }, [isAuthed, loaded, role, seen, user?.active_chapter_id]);

  const dismissWelcome = useCallback(() => {
    if (!role) return;
    setShowWelcome(false);
    void markSeen("welcome", role);
  }, [markSeen, role]);

  // Page tour evaluator — runs on route change + once welcome is handled.
  useEffect(() => {
    if (!isAuthed || !loaded || !role) return;
    if (showWelcome) return;
    if (lastEvaluatedRoute.current === location.pathname) return;
    lastEvaluatedRoute.current = location.pathname;

    const tour = TOUR_DEFINITIONS.find((t) => {
      if (!new RegExp(t.route).test(location.pathname)) return false;
      if (t.matcher && !t.matcher()) return false;
      return shouldShowTour(t, role, seen);
    });

    if (!tour) {
      setActiveTour(null);
      return;
    }

    const timer = setTimeout(() => {
      const firstTargetEl = document.querySelector(`[data-tour-target="${tour.steps[0].target}"]`);
      if (!firstTargetEl) {
        void markSeen(tour.id, role);
        return;
      }
      setActiveTour(tour);
      setActiveStepIndex(0);
    }, ROUTE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [isAuthed, loaded, role, location.pathname, seen, showWelcome, markSeen]);

  // Abort if target for current step never mounts.
  useEffect(() => {
    if (!activeTour) return;
    const target = activeTour.steps[activeStepIndex]?.target;
    if (!target) return;

    const exists = () => !!document.querySelector(`[data-tour-target="${target}"]`);
    if (exists()) return;

    const abort = setTimeout(() => {
      if (!exists() && role) {
        void markSeen(activeTour.id, role);
        setActiveTour(null);
      }
    }, TARGET_ABORT_MS);

    return () => clearTimeout(abort);
  }, [activeTour, activeStepIndex, markSeen, role]);

  const next = useCallback(() => {
    if (!activeTour || !role) return;
    if (activeStepIndex >= activeTour.steps.length - 1) {
      void markSeen(activeTour.id, role);
      setActiveTour(null);
      setActiveStepIndex(0);
    } else {
      setActiveStepIndex((i) => i + 1);
    }
  }, [activeTour, activeStepIndex, markSeen, role]);

  const skip = useCallback(() => {
    if (!activeTour || !role) return;
    void markSeen(activeTour.id, role);
    setActiveTour(null);
    setActiveStepIndex(0);
  }, [activeTour, markSeen, role]);

  const replay = useCallback(async () => {
    await reset();
    lastEvaluatedRoute.current = null;
    setShowWelcome(true);
  }, [reset]);

  const value: TourContextValue = useMemo(
    () => ({ activeTour, activeStepIndex, next, skip, replay }),
    [activeTour, activeStepIndex, next, skip, replay],
  );

  const currentStep = activeTour?.steps[activeStepIndex];
  const isLastStep = activeTour ? activeStepIndex === activeTour.steps.length - 1 : false;

  return (
    <TourContext.Provider value={value}>
      {children}
      {showWelcome && role && (
        <WelcomeModal role={role} chapterName={chapterName} onDismiss={dismissWelcome} />
      )}
      {activeTour && currentStep && (
        <TourTooltip
          key={`${activeTour.id}-${activeStepIndex}`}
          targetId={currentStep.target}
          label={currentStep.label}
          heading={currentStep.heading}
          body={currentStep.body}
          placement={currentStep.placement ?? "bottom"}
          onNext={next}
          onSkip={skip}
          isLastStep={isLastStep}
          open
        />
      )}
    </TourContext.Provider>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd chapter-ops/frontend && npx tsc --noEmit`
Expected: no errors. If `ChapterMembership` type lacks `chapter_name`, check `src/types/auth.ts` — the app already reads this in the chapter switcher, so the field exists. If it's named differently (e.g., `chapter_short_name`), update the helper to match.

- [ ] **Step 4: Commit**

```bash
git add chapter-ops/frontend/src/tours/TourProvider.tsx \
        chapter-ops/frontend/src/tours/useTour.ts
git commit -m "feat(frontend): TourProvider orchestrator"
```

---

### Task 15: Mount `TourProvider` in `App.tsx`

**Files:**
- Modify: `chapter-ops/frontend/src/App.tsx`

- [ ] **Step 1: Read current App.tsx**

Open `chapter-ops/frontend/src/App.tsx` to see current structure.

- [ ] **Step 2: Wrap router content with TourProvider**

Add import at the top:

```tsx
import { TourProvider } from "@/tours/TourProvider";
```

Wrap the `<Routes>...</Routes>` (or equivalent) inside a `<TourProvider>`. `TourProvider` must live inside `<BrowserRouter>` because it uses `useLocation`, so the wrapping looks like:

```tsx
<BrowserRouter>
  <TourProvider>
    <Routes>
      {/* existing routes */}
    </Routes>
  </TourProvider>
</BrowserRouter>
```

- [ ] **Step 3: Typecheck + run dev server**

Run: `cd chapter-ops/frontend && npx tsc --noEmit`
Expected: no errors.

Run: `cd chapter-ops/frontend && npm run dev`
Open http://localhost:5173, log in as any user — welcome modal should appear. Dismiss it and the page should render normally.

- [ ] **Step 4: Commit**

```bash
git add chapter-ops/frontend/src/App.tsx
git commit -m "feat(frontend): mount TourProvider above routes"
```

---

## Phase 4: Frontend — Wire Targets into Pages

### Task 16: Add `data-tour-target` to Dashboard

**Files:**
- Modify: `chapter-ops/frontend/src/pages/Dashboard.tsx`

- [ ] **Step 1: Locate the three targets**

Open `Dashboard.tsx` and find (search if needed):
- The inbox/action queue container → add `data-tour-target={TOUR_TARGETS.DASHBOARD_INBOX}`
- The quick actions strip → `data-tour-target={TOUR_TARGETS.DASHBOARD_QUICK_ACTIONS}`
- The Analytics link/card (officer-only) → `data-tour-target={TOUR_TARGETS.DASHBOARD_ANALYTICS_LINK}`

Add import:
```tsx
import { TOUR_TARGETS } from "@/tours/tourTargets";
```

- [ ] **Step 2: Typecheck**

Run: `cd chapter-ops/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manually verify in dev**

Reload `/` as an officer — the officer tour should fire, stepping through all three targets.

- [ ] **Step 4: Commit**

```bash
git add chapter-ops/frontend/src/pages/Dashboard.tsx
git commit -m "feat(frontend): tag Dashboard tour targets"
```

---

### Task 17: Add `data-tour-target` to MyDues

**Files:**
- Modify: `chapter-ops/frontend/src/pages/MyDues.tsx`

- [ ] **Step 1: Locate the three targets**

In `MyDues.tsx`:
- Financial status banner → `MY_DUES_STATUS_BANNER`
- Fee-type breakdown list/table → `MY_DUES_BREAKDOWN`
- Pay CTA button → `MY_DUES_PAY_CTA`

Add import: `import { TOUR_TARGETS } from "@/tours/tourTargets";`

- [ ] **Step 2: Typecheck**

Run: `cd chapter-ops/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manually verify**

Log in as a member with dues rows, visit `/dues`, confirm `my_dues` tour fires.

- [ ] **Step 4: Commit**

```bash
git add chapter-ops/frontend/src/pages/MyDues.tsx
git commit -m "feat(frontend): tag MyDues tour targets"
```

---

### Task 18: Add `data-tour-target` to TreasurerDues

**Files:**
- Modify: `chapter-ops/frontend/src/pages/TreasurerDues.tsx`

- [ ] **Step 1: Locate the four targets**

In `TreasurerDues.tsx`:
- Collection stats header → `CHAPTER_DUES_COLLECTION_STATS`
- Period picker select/dropdown → `CHAPTER_DUES_PERIOD_PICKER`
- Matrix table → `CHAPTER_DUES_MATRIX`
- One of the inline-edit cells or the edit modal trigger → `CHAPTER_DUES_INLINE_EDIT`

Add import: `import { TOUR_TARGETS } from "@/tours/tourTargets";`

- [ ] **Step 2: Typecheck**

Run: `cd chapter-ops/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manually verify**

Log in as a treasurer, visit `/chapter-dues`, confirm `chapter_dues` tour steps through all 4 targets without being cut off.

- [ ] **Step 4: Commit**

```bash
git add chapter-ops/frontend/src/pages/TreasurerDues.tsx
git commit -m "feat(frontend): tag TreasurerDues tour targets"
```

---

### Task 19: Add `data-tour-target` to Analytics

**Files:**
- Modify: `chapter-ops/frontend/src/pages/Analytics.tsx`

- [ ] **Step 1: Locate the three targets**

In `Analytics.tsx`:
- Period comparison section → `ANALYTICS_PERIOD_COMPARISON`
- Member status distribution bar → `ANALYTICS_MEMBER_STATUS`
- 12-month payment bar chart → `ANALYTICS_MONTHLY_TREND`

Add import: `import { TOUR_TARGETS } from "@/tours/tourTargets";`

- [ ] **Step 2: Typecheck**

Run: `cd chapter-ops/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manually verify**

Log in as a secretary+, visit `/analytics`, confirm `analytics` tour fires.

- [ ] **Step 4: Commit**

```bash
git add chapter-ops/frontend/src/pages/Analytics.tsx
git commit -m "feat(frontend): tag Analytics tour targets"
```

---

### Task 20: Add `data-tour-target` to Settings → Committees + Replay button

**Files:**
- Modify: `chapter-ops/frontend/src/pages/Settings.tsx`

- [ ] **Step 1: Locate the three committee targets**

In the Committees section of `Settings.tsx`:
- "Create committee" button → `COMMITTEES_CREATE`
- Chair assignment field (inside the create/edit modal, or the list row showing the chair) → `COMMITTEES_ASSIGN_CHAIR`
- Budget amount field or budget stat card → `COMMITTEES_BUDGET`

Add import: `import { TOUR_TARGETS } from "@/tours/tourTargets";`

- [ ] **Step 2: Add "Replay tours" action to the Profile tab**

In the Profile tab section of `Settings.tsx`, add a small action button:

```tsx
import { useTour } from "@/tours/useTour";
// ...
const { replay } = useTour();
// ...
<button
  type="button"
  onClick={replay}
  className="text-[11px] font-semibold uppercase tracking-[0.1em] text-content-muted hover:text-content-primary underline"
>
  Replay onboarding tours
</button>
```

- [ ] **Step 3: Typecheck + manual verify**

Run: `cd chapter-ops/frontend && npx tsc --noEmit`
Expected: no errors.

In the browser: log in as president, go to Settings → Committees tab, confirm `committees` tour fires. Go to Settings → Profile, click "Replay onboarding tours", then navigate to `/` — welcome modal should re-appear.

- [ ] **Step 4: Commit**

```bash
git add chapter-ops/frontend/src/pages/Settings.tsx
git commit -m "feat(frontend): tag Committees tour targets + replay button"
```

---

## Phase 5: Final Verification

### Task 21: Full test-suite run + end-to-end manual check

**Files:** (no changes in this task — verification only)

- [ ] **Step 1: Run full backend tests**

Run: `cd chapter-ops/backend && python -m pytest tests/ -v`
Expected: all tests pass, including 10 new tours tests and 2 new model tests.

- [ ] **Step 2: Run full frontend tests**

Run: `cd chapter-ops/frontend && npx vitest run`
Expected: all tests pass, including `shouldShowTour` (9), `tourDefinitions` (3), `Tooltip` (3).

- [ ] **Step 3: TypeScript compile check**

Run: `cd chapter-ops/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification checklist**

With dev servers running (`docker compose up -d`, backend `flask run`, frontend `npm run dev`):

1. Register a new test member account → log in → welcome modal fires with the member pitch.
2. Dismiss welcome → navigate to `/` → `dashboard_member` tour fires, 2 steps.
3. Navigate to `/dues` → `my_dues` tour fires, 3 steps.
4. Skip the tour on step 2 → refresh → it does NOT fire again.
5. In the DB, elevate the test user's membership role to `treasurer` (or use the admin UI) → visit `/chapter-dues` → `chapter_dues` tour fires, 4 steps.
6. Visit `/dues` again — `my_dues` does NOT re-fire (seen at member, which is ≤ treasurer).
7. Go to Settings → Profile → click "Replay onboarding tours" → welcome modal re-appears on next navigation.
8. Resize browser so a tooltip would hit the right edge → confirm Radix repositions it on the opposite side (collisionPadding kicks in).
9. Temporarily rename one of the `TOUR_TARGETS` values without updating the JSX — confirm TypeScript fails to compile.

- [ ] **Step 5: Commit any stray fixes from manual verification**

If manual verification surfaced a small issue, fix it and commit with `fix(tours): ...`. Otherwise, proceed to wrap-up.

- [ ] **Step 6: Final wrap-up commit (if any content/copy refinements)**

If you tweaked any draft copy during manual verification:

```bash
git add chapter-ops/frontend/src/tours/tourDefinitions.ts
git commit -m "copy(tours): refine draft tour content"
```

---

## Implementation Notes

- **No feature flag.** The spec explicitly says the feature is on by default once shipped. No `TOURS_ENABLED` env var.
- **Silent failure throughout.** The store rolls back on API failure; the TourProvider aborts a tour if its target doesn't mount. A broken tour must never block the user from using the app.
- **Commit cadence.** Every task ends with a commit. Don't batch commits across tasks — small commits make review and rollback easy.
- **Tour copy is draft-first.** The copy written in Task 11 is a starting point; expect to edit it after manual verification once you see it on the real pages. The final polish pass happens in Step 6 of Task 21.
- **Follow existing patterns.** The project uses SQLAlchemy 2.x `Mapped` annotations, Zustand for state, axios via `@/lib/api`. Don't introduce new patterns.
