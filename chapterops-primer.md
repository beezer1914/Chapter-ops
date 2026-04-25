# ChapterOps — Primer for Writing User Guides

> **What this document is:** Background reading for an AI assistant being asked to write end-user documentation, help articles, walkthroughs, or onboarding guides for ChapterOps. Drop this into a Claude Project as Project Knowledge, then ask Claude to draft guides — it will use this as ground truth for feature names, roles, terminology, and tone.
>
> **Audience for the guides being written:** Non-technical members and officers of Greek letter organizations. Treat readers as smart adults who have never used a SaaS dashboard before. No jargon. No engineering language.

---

## 1. About ChapterOps

ChapterOps is a single platform that helps a Greek letter organization (a fraternity or sorority chapter, region, or international headquarters) run its day-to-day operations.

Before ChapterOps, most chapters juggle five-to-ten disconnected tools: a spreadsheet for dues, Venmo or Cash App for collections, Eventbrite for events, GroupMe for announcements, Google Drive for documents, a Word doc for the chapter roster, and a printed binder for lineage. ChapterOps replaces that patchwork with one website where members log in to see everything in one place.

**What it does, in plain English:**
- Tracks who is in the chapter and what role they hold
- Collects dues by credit card (or records cash/Zelle/Venmo/Cash App payments by hand)
- Handles intake / MIP — managing the pipeline of people seeking membership
- Runs events (with optional paid ticketing) and tracks RSVPs and attendance
- Sends chapter-wide announcements and email blasts
- Stores official documents (constitutions, meeting minutes, financial reports) in a secure vault
- Maintains a knowledge base of "how we do things" articles
- Records the chapter's lineage — the family tree of who initiated whom — and important historical milestones
- Lets regional and international officers see across many chapters at once
- Tracks expenses, committee budgets, and produces analytics reports

**Where it lives:** [https://chapterops.bluecolumnsystems.com](https://chapterops.bluecolumnsystems.com)
**Built by:** Blue Column Systems LLC (Georgia, US)
**Status:** Early access / beta. NPHC ("Divine Nine") organizations are the primary launch audience; the platform will broaden to all Greek letter organizations afterward.

---

## 2. Glossary — Use These Words Consistently

### Greek-letter-organization terms (assume the reader already knows these)
- **Chapter** — a single local body of members (e.g., the Sigma Delta Sigma chapter of Phi Beta Sigma at a particular university or city).
- **Region** — a grouping of chapters, usually by geography. Each region has its own officers (Director, Treasurer, etc.).
- **IHQ / International Headquarters** — the organization-wide governing body that sits above all regions.
- **Greek letter organization (GLO) / BGLO** — Greek letter organization / Black Greek letter organization. ChapterOps uses both terms.
- **NPHC / Divine Nine** — the National Pan-Hellenic Council, the nine historically Black fraternities and sororities. Primary audience for early access.
- **Officer** — any elected or appointed leader of a chapter (President, Vice President, Treasurer, Secretary). In ChapterOps, "officer" is the umbrella term for non-member roles.
- **Initiation / line / lineage** — the family tree of membership, recording who initiated whom. Sacred cultural data.
- **Intake / MIP (Membership Intake Process)** — the multi-stage process by which someone becomes a new member. Highly sensitive — handled separately from regular member management.
- **Financial / not financial** — the cultural and procedural status of a member who is paid up on dues ("financial") versus behind ("not financial"). A member who is not financial typically cannot vote, hold office, or attend certain events.
- **Neophyte** — a newly initiated member. Often exempt from certain dues categories for a defined period.

### Cultural rules ChapterOps strictly enforces — never write a guide that contradicts these:
1. A person can hold an active membership in **only one chapter at a time** within a given organization. Transferring between chapters moves the membership; it does not duplicate it.
2. A person **cannot be a member of two different Greek letter organizations simultaneously.** This is non-negotiable in BGLO culture.
3. The "Chapter Transfer" feature exists specifically to honor rule 1 — it is a one-way move with approval from both chapters' presidents, not a way to be in two chapters at once.

### Product terms (specific to ChapterOps)
- **Dashboard / Inbox** — the home screen after login. It shows "what do I need to do?" — prioritized action items like "Pay your dues," "Approve this expense," "RSVP to this event."
- **My Dues** — the page where a member sees what they personally owe and can pay.
- **Chapter Dues** — the treasurer's grid view showing every member × every fee type for the current billing period.
- **Fee Type** — a category of dues (e.g., "Chapter Dues," "National & Regional," "Parlor Fee"). Each chapter defines its own fee types in Settings.
- **Billing Period / Period** — a stretch of time (a semester, a year, or a custom range) over which dues are tracked. Only one period is "active" at a time.
- **Period Rollover** — when activating a new billing period, the chapter can carry forward unpaid balances from the previous period.
- **Invite Code** — registration is invite-only. An officer creates an invite code, sends it to a prospective member, and the member uses it to register their account.
- **Stripe Connect** — the payment processor. Each chapter sets up its own Stripe account so dues money goes directly to the chapter's bank account, not a central pool.
- **Workflow** — a custom multi-step process the chapter can build (e.g., "New Member Onboarding," "Paraphernalia Order Approval"). Each workflow has steps that get assigned to people.
- **Communications Hub** — the page where officers post chapter announcements (which appear on members' dashboards) and send email blasts.
- **Document Vault** — the file storage area for official chapter documents (PDFs, Word docs, spreadsheets, images up to 25 MB).
- **Knowledge Base** — written how-to articles, written either by the IHQ for the whole organization or by a chapter for its own members.
- **Lineage & History** — the family-tree view of who initiated whom, plus a timeline of chapter milestones.
- **Incidents** — a private log of chapter incidents that need leadership awareness (visible only to presidents, regional directors, and org admins).
- **Region Dashboard** — extra screen that appears for regional officers, showing stats across every chapter in their region.
- **IHQ Dashboard** — extra screen for organization-wide admins, showing stats across every region.
- **Platform Dashboard** — extra screen visible only to Blue Column Systems staff (cross-organization view).

### Words to avoid in user-facing writing
- "Tenant," "multi-tenant," "RLS," "middleware" — engineering concepts.
- "Webhook," "blueprint," "API" — implementation details.
- "Backend," "frontend," "session cookie" — internal architecture.
- "Module" when talking to members. Internally we call them modules; to a user they are just **features** or **sections**.

---

## 3. Roles & What Each Role Can Do

ChapterOps roles are **per chapter** — a person can be a member in one chapter and a treasurer in another (rare, but possible across organizations). Permissions stack: a higher role can do everything a lower role can, plus more.

| Role | Plain-English description | Main things they do |
|---|---|---|
| **Member** | A regular initiated member of the chapter. | View the dashboard, pay their own dues, RSVP to events, read announcements, view documents and the knowledge base, see lineage. |
| **Secretary** | The chapter's record-keeper. | Everything a member can do, plus: create invite codes for new members, view chapter reports, see all members. |
| **Treasurer** | Handles money. | Everything secretary can do, plus: manage members (add, edit, remove), edit fee types, send bills, edit any member's dues, approve or deny expense submissions, view all financials. |
| **Vice President** | Treasurer-equivalent permissions. Often a chapter's "second-in-command." | Same access as treasurer. |
| **President** | Full chapter authority. | Everything VP can do, plus: change branding, change chapter settings, set permissions for which roles can use which features, approve chapter transfers in or out, see incidents. |
| **Regional Officer** (Director, Treasurer, etc.) | Leadership of a region. Scoped to the chapters in their specific region. | See the Region Dashboard, view chapter stats across the region, send invoices to chapters, move chapters between regions, assign other regional officers. |
| **Org Admin / IHQ** | Organization-wide leadership. | See the IHQ Dashboard, manage all regions and all chapters, set organization-level branding, approve new chapters joining the organization. |
| **Platform Admin** | Blue Column Systems staff only. | See the Platform Dashboard with cross-organization data. End users will never have this role. |

**Two important nuances:**
1. **Permissions are configurable per chapter.** A president can change which features a member-level user is allowed to see (via Settings → Permissions). The role hierarchy above is the **default** — actual access can be tightened or loosened.
2. **Regional permissions are scoped, not global.** Being a regional officer in one region does not give you any access to chapters in a different region.

### Who Can Change What — The Exact Rules Behind Member Edits

These rules are enforced by the platform itself; a guide that contradicts them will mislead the reader.

**Changing a member's role** (e.g., promoting someone from Member to Treasurer):
- Only **Presidents** can change roles. Treasurers and Vice Presidents cannot.
- A President **cannot change their own role** — someone else has to.
- A President **cannot assign a role higher than their own.** In practice this means a President can promote anyone up to and including President.
- The five assignable chapter roles are: Member, Secretary, Treasurer, Vice President, President. (There is also an internal "admin" tier reserved for system use — it is never assigned through the normal member-edit screen.)

**Changing a member's financial status** (Financial / Not Financial / Exempt):
- Only **Presidents** can change financial status.
- Cannot be changed for yourself.
- If a member's "member type" is set to **Life member**, their financial status is automatically **Exempt** and cannot be changed manually — life members are permanently exempt from dues.

**Changing a member's "member type"** (Collegiate, Graduate, Life, etc.):
- **Treasurer or higher** can change member type. Org Admins can also change it.
- Cannot be changed for yourself.

**Designating someone as an Intake Officer:**
- Only **Presidents** can do this.
- Cannot be done for yourself.
- An Intake Officer designation grants access to the Intake / MIP pipeline without requiring the Secretary role. Use it when someone needs intake access but shouldn't be a chapter officer.

**Suspending, unsuspending, or deactivating a member:**
- Only **Presidents** can do these actions.
- Cannot be done to yourself.
- Suspension keeps the member on the roster but blocks chapter access. Deactivation removes them from the active roster (soft delete — their history is preserved).

**Org Admin is separate from the chapter "admin" tier.** Org Admin lives at the organization level (it shows up in the IHQ Dashboard, not the chapter sidebar). Org Admins can edit member type across every chapter in their organization without needing to be a chapter Treasurer in each one. They cannot, however, change a chapter's day-to-day roles unless they are also a member of that chapter — chapter role changes are still President-gated within each chapter.

---

## 4. The Product Map — What Users See

After logging in, users see a left sidebar (or, on phones, a bottom nav bar with "Home / My Dues / Events / More"). The sidebar is organized into three sections:

### Overview
- **Dashboard** — the inbox / action queue. Always the first stop. Shows prioritized to-dos.
- **Region Dashboard** *(regional officers only)* — cross-chapter stats for their region.
- **IHQ Dashboard** *(org admins only)* — cross-region stats for the whole organization.
- **Platform Dashboard** *(BCS staff only)* — cross-org stats.

### Chapter (everyone with chapter membership sees these, depending on configured permissions)
- **My Dues** — what *I* personally owe and a button to pay it.
- **Payments** — payment history and payment plans (members can self-create installment plans here).
- **Invoices** — bills sent to the chapter from its region.
- **Donations** — accept and view donations (separate from dues).
- **Expenses** — submit a chapter expense for reimbursement; officers approve or deny.
- **Events** — upcoming and past events. RSVP, check in, buy paid tickets.
- **Communications** — chapter announcements and email blasts.
- **Documents** — the document vault (constitution, minutes, etc.).
- **Knowledge Base** — how-to articles.
- **Lineage & History** — family tree of who initiated whom + chapter milestones.

### Admin (officer-only, role-gated)
- **Incidents** *(presidents, regional directors, org admins)* — private incident log.
- **Analytics** — period comparisons, dues collection stats, member status, monthly payment chart, event stats.
- **Chapter Dues** — treasurer's grid: every member × every fee type. Inline edit (change amount owed, mark exempt, add notes).
- **Members** — full member roster with role and status.
- **Invites** — create, send, and track invite codes for new members.
- **Intake / MIP** — manage the pipeline of people going through membership intake.
- **Regions** — region management (officer-scoped).
- **Workflows** — build and run custom multi-step processes.
- **Settings** — chapter and organization configuration.

### Top bar (always visible)
- "Welcome back, [first name]" greeting and the org · chapter context.
- **Notification bell** — in-app notifications, polled every 30 seconds. Click to mark read or delete.

### Mobile bottom nav (phones only)
- **Home** → Dashboard
- **My Dues** → personal dues page
- **Events** → events list
- **More** → opens the full sidebar drawer

---

## 5. Common Workflows — Walk Through These When Writing Guides

These are the canonical "user stories" most help articles will be about. Each is described from the user's point of view, in the order steps actually happen.

### 5a. A new member joins the chapter
1. The chapter's Secretary or Treasurer goes to **Invites**, generates an invite code, and emails it to the prospective member.
2. The new member visits the ChapterOps login page and clicks **Register**.
3. They enter the invite code along with their name, email, and a strong password (12+ characters with uppercase, lowercase, number, and symbol).
4. Their account is created and they are automatically added to the chapter as a member.
5. ChapterOps automatically creates dues rows for them in the active billing period, so they can immediately see what they owe in **My Dues**.

### 5b. A member pays their dues
1. Member logs in. The Dashboard shows a "Pay your dues" action item if they owe anything.
2. They click through to **My Dues**, which shows a breakdown by fee type (Chapter Dues, National & Regional, etc.) with progress bars.
3. They click **Pay** — this opens a Stripe-hosted checkout page. They pay by card.
4. Stripe sends ChapterOps a confirmation. Their dues row updates, their financial status flips from "Not Financial" to "Financial," and the dues banner on **My Dues** refreshes immediately.
5. Alternative: they can set up a **payment plan** under **Payments** (monthly or quarterly installments). Reminder emails go out 3 days before each installment is due, and weekly if an installment is late.
6. Alternative: if a member pays by Zelle, Venmo, Cash App, or cash, the Treasurer records it manually under **Payments** instead. Same dues update happens.

### 5c. The Treasurer sets up dues for a new semester
1. President or Treasurer goes to **Settings**.
2. Under the Fee Types section, they confirm the fee categories and amounts (e.g., Chapter Dues $200, National & Regional $225).
3. They go to the period management area and create a new **Billing Period** (semester / annual / custom dates).
4. When they activate it, ChapterOps asks: "Carry forward unpaid balances from the previous period?" If yes, leftover balances become part of the new period's totals.
5. ChapterOps automatically creates dues rows for every active member × every fee type.
6. Members see their new amounts on **My Dues** the next time they log in.

### 5d. The Treasurer adjusts one member's dues
1. Treasurer goes to **Chapter Dues**.
2. They find the row for the member and the relevant fee type in the grid.
3. Click to open the edit modal. Options: change the amount owed, mark **Exempt**, add internal notes.
4. Save. Financial status for that member is recomputed automatically.

### 5e. A member transfers to a different chapter
1. Member submits a **Chapter Transfer Request** (on the Settings or Profile area).
2. Both chapter presidents — the one losing the member and the one receiving — must approve.
3. If both approve, the member's active membership moves. They keep their account and history; they just operate in the new chapter going forward.
4. Either president can deny with a reason; the member is notified.
5. **Important cultural rule:** the member is never in both chapters at once. They are in the old chapter until the moment both approvals land, then in the new one.

### 5f. Submitting and approving an expense
1. Any officer-eligible member submits a chapter expense under **Expenses** (description, amount, receipt upload, optional committee tag).
2. Treasurer or higher sees a Dashboard action item to approve or deny.
3. They open Expenses, review, and approve or deny with a reason.
4. Approved expenses count against the assigned committee's budget (if tagged).

### 5g. Running an event
1. Officer goes to **Events** and clicks "New Event."
2. Fills in title, date, location, description, optional ticket price (uses Stripe).
3. Optionally generates a **public link** (`/e/[event-slug]`) — anyone with the link can RSVP without an account.
4. Members RSVP from the Events page or the Dashboard.
5. At the event, an officer uses the **manual check-in** view to mark attendance.

### 5h. Sending a chapter-wide message
1. Officer goes to **Communications**.
2. **Announcement tab**: post a short announcement that appears on every member's Dashboard. Can pin, edit, set an expiry.
3. **Email blast tab**: compose an email, choose an audience filter (all members, financial only, officers only, etc.), send via Resend.

### 5i. A regional officer bills a chapter
1. Regional Treasurer (or higher) goes to the Region Dashboard, picks a chapter.
2. Creates an **Invoice** addressed to that chapter (line items, due date).
3. The chapter sees the invoice under **Invoices** and pays via Stripe.

### 5j. Building a custom workflow
1. President goes to **Workflows** and creates a workflow (e.g., "New Brother Onboarding").
2. Adds steps in order (e.g., "Sign code of conduct," "Pay first month's dues," "Attend orientation").
3. Each step can be assigned to a role or a specific person.
4. When the workflow runs for a member, each step shows up on the assigned person's Dashboard until completed.

### 5k. Setting up a brand-new chapter (first-ever login by a founding president)
1. President registers a new account (no invite code needed for the first user of a new chapter).
2. The Onboarding wizard runs: **Organization → Region → Chapter → Complete**.
3. They either pick an existing organization or request a new one (which goes to the IHQ for approval if it already exists, or to BCS for review if brand-new to the platform).
4. They pick a region (or request one).
5. They name and configure the chapter.
6. The Success step is a **6-step checklist** guiding them through first-week setup: connect Stripe, set fee types, create the first billing period, invite members, post a welcome announcement, customize branding.

### 5l. Customizing the chapter's look (white-label branding)
1. President goes to **Settings → Branding**.
2. Picks colors (or uses a Divine Nine preset for one of the nine NPHC orgs).
3. Uploads a logo and favicon.
4. Optionally toggles between the **Editorial theme** (cream backgrounds, sharp edges, Playfair Display headings — the default) and a darker option.
5. The whole chapter sees the new look on next page load.

---

## 6. Concepts Worth Explaining Carefully When They Come Up

### Financial Status (the most important concept in the product)
A member is either **Financial** (paid up on all dues for the active billing period) or **Not Financial** (owes something). The status updates automatically the moment a payment is recorded. Some members are flagged as **Exempt** (e.g., neophytes during their grace window) — they show as Financial regardless of dues amounts. Status is shown as a colored chip throughout the product (green for financial, red for not financial, gray for exempt).

When writing about it: "Financial status" is the right term. Don't call it "payment status" or "membership status."

### The Three-Layer Dues System
Most users won't need this explained, but if writing for treasurers it's important:
1. **Fee Types** are the categories (set in Settings).
2. **Billing Periods** are the time windows (semester, annual, custom).
3. **Dues Rows** are the actual amounts each member owes for each fee type in each period.

When a member registers, ChapterOps automatically generates their dues rows. When the Treasurer activates a new period, rows are generated for everyone. When fee types change mid-period, existing rows don't change automatically — the Treasurer can use the Chapter Dues grid to adjust.

### Stripe Connect (per-chapter accounts)
Money flows directly from the member's card to the chapter's own bank account — ChapterOps never holds it. Each chapter goes through a one-time Stripe setup (linking a bank account, providing the chapter EIN if available, basic identity info) the first time they want to accept card payments. Until Stripe is connected, dues can still be tracked manually (Zelle, Venmo, Cash App, cash).

### Refunds (important limitation)
**ChapterOps does not yet have an in-app refund flow.** A Treasurer cannot click a "Refund" button anywhere in the platform. To refund a member, the Treasurer must:
1. Log into the chapter's **Stripe dashboard directly** (separate from ChapterOps) and issue the refund there.
2. Come back to ChapterOps, open **Chapter Dues**, find the affected member's row for the relevant fee type, and **manually reduce the "amount paid" value** to match the post-refund total. This will recalculate their financial status correctly.

If step 2 is skipped, the chapter's totals in ChapterOps will be wrong (they'll still show the refunded money as collected) and the member will still appear as **Financial** even though they've been refunded. Always do both steps.

Guides should never describe a one-click refund flow inside ChapterOps — it doesn't exist.

### Invite-Only Registration
There is no "Sign up" button in the public sense. Every new account requires an invite code from an existing officer. This is intentional — it prevents random sign-ups and keeps the chapter roster clean. The only exception is a founding president starting a brand-new chapter.

### Mobile Experience
The product is fully usable on a phone. The bottom nav bar shows the four most-used destinations (Home, My Dues, Events, More). Long lists become single-column cards. RSVP and Pay buttons are full-width and thumb-friendly. There is also a PWA manifest, so users can "Add to Home Screen" and the app behaves like a native app.

### Notifications
ChapterOps sends three kinds of notification:
1. **In-app** — the bell icon in the top right, polled every 30 seconds. Read or delete from the dropdown.
2. **Email** — sent via Resend. Used for invites, password resets, dues reminders, expense approval requests, transfer approvals, and the founder's morning ops digest.
3. **None for SMS yet** — there is no text messaging.

### Privacy & Security
- All member data is isolated per chapter — the platform enforces this at the database level.
- Passwords meet strong requirements (12+ chars, mixed character types) and are hashed with bcrypt.
- Login attempts are rate-limited.
- Members can request their data be exported or their account deleted (GDPR-style flows are built in).
- Payments are processed by Stripe — ChapterOps never sees or stores card numbers.

---

## 7. Tone & Style for User Guides

**Voice:** Calm, direct, respectful. The reader is a busy chapter officer or a new member trying to figure out one specific thing. They are not reading for entertainment.

**Sentence length:** Short. Two-clause sentences max in most cases.

**Reading level:** Aim for a smart 9th-grader. No engineering jargon. No marketing fluff either ("synergize your chapter operations" — never).

**Person:** Address the reader as "you." Refer to ChapterOps as "ChapterOps" or "the platform."

**Structure each guide with:**
1. A **one-sentence headline** of what the guide accomplishes ("How to set up dues for a new semester").
2. A **one-paragraph summary** of when and why someone would do this.
3. A **prerequisites** line if relevant ("You must be a Treasurer or higher to do this.").
4. **Numbered steps** with the exact button or menu name in **bold** (e.g., click **Settings**, then **Fee Types**).
5. **Screenshots or annotated images** wherever a step involves finding something on screen (note: this primer doesn't include screenshots — Claude should write a `[screenshot here: description]` placeholder when one would help).
6. A **What to do if something goes wrong** section at the end, listing common errors and fixes.

**When in doubt:** match the labels users actually see in the product. The sidebar says "Knowledge Base" — write "Knowledge Base," not "knowledge-base section" or "KB" or "wiki."

**Cultural sensitivity:** Always treat lineage, intake, and BGLO membership rules with the seriousness they deserve. Never write a guide that flippantly describes intake as "onboarding" or refers to lineage as "ancestry" or "genealogy." These are sacred concepts in BGLO culture and ChapterOps was built to honor them.

**Inclusive language:** Avoid "his/her" and "guys." Use "they" or "members." Don't assume the reader's gender, role, or chapter.

**Don't promise features that aren't built.** If a guide reader asks about something you can't find in this primer (e.g., "How do I send an SMS to all members?"), say it isn't currently available rather than inventing a flow. ChapterOps does not yet have: SMS, mobile native apps (only PWA), Slack integration, a public API, or an in-app refund flow (refunds must be done in the Stripe dashboard — see Section 6).

---

## 8. Quick Reference — Things Guides Will Need to Reference Often

- **Login URL:** `https://chapterops.bluecolumnsystems.com/login`
- **Public events URL pattern:** `https://chapterops.bluecolumnsystems.com/e/[slug]`
- **Support email:** `support@bluecolumnsystems.com`
- **Built by:** Blue Column Systems LLC, Georgia
- **Marketing site:** `https://bluecolumnsystems.com`
- **Password requirements:** 12+ characters, must include uppercase, lowercase, a number, and a special character.
- **Document upload limit:** 25 MB per file. Allowed types: PDF, Word, Excel, common image formats.
- **Notification poll interval:** 30 seconds.
- **Dues reminders:** 3 days before due date; weekly if overdue.
- **Approval expiry for things like agent-staged actions:** 24 hours.

---

## 9. Topics to Prioritize When Drafting a Guide Library

If asked to produce a complete guide library from scratch, this is roughly the order of usefulness — write the high-impact pieces first.

**Tier 1: Every member needs these (write first)**
1. Creating your account from an invite code
2. Logging in and navigating the dashboard
3. Paying your dues
4. Setting up a payment plan
5. RSVPing to an event
6. Updating your profile and password
7. Reading and acting on dashboard action items
8. Using the mobile experience

**Tier 2: Officer essentials**
9. Inviting new members
10. Managing the member roster
11. Setting up fee types and billing periods
12. Adjusting an individual member's dues
13. Submitting and approving expenses
14. Connecting Stripe to accept card payments
15. Posting an announcement and sending an email blast
16. Creating an event (free and paid)
17. Uploading documents to the vault
18. Writing knowledge base articles
19. Approving a chapter transfer (incoming and outgoing)
20. Customizing chapter branding

**Tier 3: Specialized**
21. Managing the intake / MIP pipeline
22. Recording lineage and milestones
23. Building a custom workflow
24. Reading the Analytics page
25. Managing committees and budgets
26. Filing an incident report
27. Member data export and account deletion (privacy)

**Tier 4: Regional & IHQ**
28. The Region Dashboard tour
29. Sending an invoice to a chapter
30. Moving a chapter between regions
31. Approving a new chapter request (org admin)
32. The IHQ Dashboard tour

**Tier 5: Founding-president onboarding (special path)**
33. Starting a brand-new chapter on ChapterOps
34. The 6-step first-week checklist explained

---

*End of primer. When the user asks you to write a guide, refer back to this document for terminology, role definitions, feature names, and tone. If the user asks for something not described here, ask a clarifying question rather than inventing a feature.*
