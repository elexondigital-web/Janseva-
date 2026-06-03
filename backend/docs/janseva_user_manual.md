---
title: JanSeva User Manual
subtitle: Constituency Management System — Operator Guide
version: 1.0.0
date: 2026
---

# JanSeva User Manual

> **Audience:** Constituency operators and administrators using the JanSeva
> system in their day-to-day work.

This manual covers every feature in v1.0. For deployment, environment
setup, and troubleshooting at the infrastructure level, see the project
`README.md` instead.

---

## 1. Introduction

JanSeva is a web-based system for managing the operations of a political
constituency office. With it you can:

- Maintain a verified roster of every member (with photo + Aadhaar copy).
- Issue printable PVC ID cards in bulk with QR codes.
- Track attendance at events using QR codes, fingerprint scans, or manual entry.
- Send SMS, WhatsApp, and email broadcasts to filtered audiences.
- View analytics on growth, attendance trends, demographics, and ward
  performance.
- Manage operator accounts with fine-grained scope (super admin → block
  admin → ward admin → booth worker).

There are four roles. What you see depends on which role your account has:

| Role            | Sees & manages                                                   |
|-----------------|------------------------------------------------------------------|
| **Super Admin** | All blocks, all data, can mint other super admins.               |
| **Block Admin** | One block — its wards, booths, members, events, and admins.     |
| **Ward Admin**  | One ward — members, events, attendance within it.                |
| **Booth Worker**| One booth — members, attendance, view-only on most other things. |

Throughout this manual, role-restricted screens are flagged with a small
badge like **(Super Admin only)**.

---

## 2. Login & navigation

### 2.1 Signing in

1. Open the JanSeva URL in any modern browser (Chrome, Firefox, Edge, or
   Safari).
2. Enter your **email** and **password**.
3. Optionally select your role — leave blank if unsure; the system picks the
   correct one automatically.
4. Click **Sign in**.

If your password is temporary (created by a Block Admin), you will be
required to change it on first login. Pick a new password of at least 8
characters and store it in your password manager.

### 2.2 The sidebar

Every page is reachable from the left sidebar:

- **Dashboard** — overview of your scope: KPIs, recent members, upcoming events.
- **Members** — full list of people in your scope, with filters.
- **Search** — fuzzy search across names, phone numbers, Aadhaar / Voter ID, address.
- **ID Cards** — preview, print, and bulk-generate ID cards.
- **Attendance** — events list and live marking screen.
- **Messaging** — compose SMS, WhatsApp, and email broadcasts.
- **Admins** *(Super Admin + Block Admin only)* — operator account management.
- **Reports** — analytics and audit log.
- **Hierarchy** — Block / Ward / Booth tree CRUD *(Super Admin + Block Admin)*.

On a mobile device the sidebar collapses into a hamburger menu in the top-left.

### 2.3 The top bar

The top bar shows your name and a **Sign out** button. Clicking it ends
your session immediately and revokes all refresh tokens.

### 2.4 Session timeout

Sessions last 15 minutes (access token) but auto-refresh in the background
for up to 7 days as long as you keep using the app. If you leave the tab
idle longer than that, you'll be redirected to the sign-in page with a
clear notification.

---

## 3. Managing members

### 3.1 Adding a member

1. Sidebar → **Members** → click **Add Member** (top right).
2. Fill the form:
   - **Full name** (required) — supports Hindi, Punjabi, English.
   - **Father / Spouse name** (optional but encouraged for verification).
   - **Date of birth** (used for age-based filters in messaging).
   - **Gender, category, party role** — pick from dropdowns.
   - **Phone** (10 digits, required).
   - **WhatsApp** (10 digits, optional — defaults to phone if blank).
   - **Email** (optional).
   - **Aadhaar number** (12 digits, optional but unique — duplicates are
     rejected).
   - **Voter ID** (optional).
   - **Address, pincode** (optional).
   - **Block / Ward / Booth** — pick from dropdowns; the system enforces
     hierarchy consistency (you can't put a booth into the wrong ward).
   - **Photo** — JPEG/PNG/WebP, max 10 MB. Recommended 600×800.
   - **Aadhaar copy** — JPEG/PNG/WebP, max 10 MB.
3. Click **Save**.

The system auto-generates a `JS-XXXXXX` member ID. This is the canonical
identifier — use it everywhere instead of phone numbers when possible.

**File upload security:** uploads are validated by the actual file content
(magic bytes), not just the file extension. Renaming `malware.exe` to
`photo.jpg` will be rejected.

### 3.2 Editing a member

1. **Members** → click the member's row → opens their detail page.
2. Click **Edit** (top right).
3. Change any field, save.

Editing is allowed only within your scope — a Ward Admin cannot move a
member to a different ward.

### 3.3 Deleting a member

1. Member detail page → **Delete** (top right, red).
2. Confirm in the modal.

This is a **hard delete** — the row, ID card, and uploaded files are all
removed. Members with attendance records cannot be deleted (delete the
attendance first if necessary).

### 3.4 Searching members

The dedicated **Search** page does full-text fuzzy search across:

- Full name (typo-tolerant via trigram matching)
- Phone, WhatsApp
- Aadhaar number
- Voter ID
- Address (typo-tolerant)
- Member ID (`JS-XXXXXX`)

Type-and-wait search runs after a 300 ms pause. Filter further with the
ward, booth, gender, status, and age-range controls in the sidebar.

The **Members** page is a simpler list view with table-style columns and
bulk-friendly filters.

---

## 4. Hierarchy management

**(Super Admin + Block Admin)**

The Hierarchy page lets you maintain the Block → Ward → Booth tree.

### 4.1 Adding a block

**(Super Admin only)**

1. Sidebar → **Hierarchy** → **+ Block**.
2. Enter name, district, state. Save.

### 4.2 Adding a ward

1. **Hierarchy** → click a block → **+ Ward**.
2. Enter ward name. Save.

### 4.3 Adding a booth

1. **Hierarchy** → click a ward → **+ Booth**.
2. Enter booth name and (optional) physical location/address. Save.

### 4.4 Editing or deleting

Click the pencil or trash icon next to any node. Deletion is blocked if
people, events, or sub-nodes exist underneath.

---

## 5. Attendance system

### 5.1 Creating an event

1. Sidebar → **Attendance** → **New event** (top right).
2. Fill in:
   - **Name** — e.g. "Vikas Rally — Patiala Urban".
   - **Type** — Rally / Meeting / Function / Get-together.
   - **When** — date + time.
   - **Location** (optional).
   - **Scope** — automatically pinned to your block; ward and booth optional
     to narrow expected attendance.
3. Save.

Booth Workers cannot create events. Ward Admins create events scoped to
their ward only.

### 5.2 Live attendance marking

After picking an event, the right pane shows three modes:

#### QR Scan

1. Click **QR Scan** tab.
2. Allow camera permission (HTTPS or localhost only).
3. Point the camera at the QR code on a member's ID card.
4. The system marks attendance, shows the member's name, and refreshes the
   attendees list.

A 2-second deduplication window prevents the same card scanned twice in
quick succession from registering twice.

#### Manual

1. Click **Manual** tab.
2. Search by name, phone, or member ID — results appear after a short pause.
3. Click a result to mark attendance.

#### Fingerprint

1. Click **Fingerprint** tab.
2. The status pill turns green when the **Mantra MFS100 RD Service** is
   running on the workstation. If red, follow the link to install the
   driver from mantratecapp.com.
3. Optionally pre-select a member by name in the right column — useful when
   biometric matching isn't enabled on the server.
4. Click **Capture & Mark** and place the member's finger on the scanner
   within 10 seconds.

All three modes feed the same attendees list. The recent check-ins ribbon
shows the last 10 marks of the current session for at-a-glance verification.

### 5.3 Removing an attendance record

In the attendees list, click the trash icon next to any row. Confirm.

### 5.4 Attendance report

Click **View report →** at the top of the live screen. The report page
shows:

- KPIs: Expected (size of the event's audience), Present, Absent, turnout %.
- By-ward and by-booth bar charts.
- Method split: how many marks came via QR / Fingerprint / Manual.
- A full attendees table with CSV export.

---

## 6. ID card generation and printing

### 6.1 Single card preview & print

1. Sidebar → **ID Cards**.
2. Search for the member in the **Single card** pane.
3. The card preview appears at exact ISO/IEC 7810 ID-1 dimensions
   (85.6 × 54 mm).
4. Click **Print card** to print on PVC card stock, or **Download PDF**
   to save a single-card PDF at the correct physical size.

Cards are issued automatically on first preview if the member doesn't have
one yet. Each card has:

- Member's name, father/spouse name, member ID.
- Booth, Ward, Block, District.
- Card ID (`CARD-JS-XXXXXX`).
- Issue date.
- A QR code containing the member ID for fast attendance scanning.

### 6.2 Bulk A4 sheet

For mass distribution:

1. Sidebar → **ID Cards** → **Bulk A4 sheet** pane (right).
2. Pick block / ward / booth — narrower selections produce smaller PDFs.
3. (Optional) Tick **Issue cards for members who don't have one yet** to
   auto-mint missing cards in this run.
4. Click **Generate & download**.

The PDF lays out 6 cards per A4 page (2 columns × 3 rows) with dashed
cut-guides. Limit is 1500 cards per job; for larger blocks, narrow by ward
or booth.

You can also reach the ID Cards page pre-filled for one member by clicking
**ID tools** on their detail page.

---

## 7. Sending messages

### 7.1 Composing a broadcast

1. Sidebar → **Messaging**.
2. Pick a channel: **SMS**, **WhatsApp**, or **Email**.
3. Pick a target:
   - **All members** — every active person in your block.
   - **Specific ward** — pick from dropdown (Block Admins only).
   - **Specific booth** — pick ward then booth.
4. The recipient count appears live as you change the target.
5. (Email only) Enter a subject.
6. Type the message body. Use template variables to personalize:
   - `{name}` — member's full name
   - `{ward}` — ward name
   - `{booth}` — booth name
   - `{id}` — member ID
   - `{phone}` — phone number
   Click the **+ Name / + Ward / etc.** chips to insert tokens.
7. (Optional) Click **Preview** to see one filled-in sample.
8. Click **Send**, confirm in the modal.

Sends are **fire-and-forget**: the system replies immediately with
"Sending to N recipients" and dispatches in the background. Watch the
**History** panel on the right to see status flip from "Sending" → "Sent"
or "Partial" / "Failed" with the failed-recipient count.

### 7.2 Templates

Four hardcoded templates ship in v1:

- **Rally invitation** (Hindi)
- **Attendance reminder** (English)
- **Birthday greetings** (Punjabi)
- **General announcement** (English, HTML email)

Click any template to fill the body and channel. You can edit before sending.

### 7.3 Channel notes

- **SMS via MSG91:** uses your DLT-approved flow template, batches of 50
  with 500 ms gap between batches.
- **WhatsApp via Meta Cloud API:** plain-text only in v1, paced one per
  second to stay under Meta's rate limits. Recipients must have messaged
  your business number within the last 24 hours, or be on a pre-approved
  template (advanced feature, not in v1).
- **Email via Nodemailer:** SMTP with BCC batches of 50, 2 s gap.

### 7.4 Sending to one specific person

From a member's detail page, click **Message** in the header. The
Messaging page opens pre-filled with their name and a BOOTH-scoped target
narrowed around them.

---

## 8. Reports and analytics

### 8.1 Summary cards

The Reports page shows four KPIs at the top:

- **Total members** (with month-on-month growth %).
- **Avg event attendance** over the last 6 events.
- **Messages sent this month**.
- **Active booth workers**.

### 8.2 Charts

- **Attendance trend** — bar chart of the last 8 events, hover for date and
  turnout %.
- **Demographics donut** — gender split with counts and percentages.
- **Age groups** — horizontal bars for 18–35 / 36–55 / 55+.
- **Category** — horizontal bars for General / OBC / SC / ST.

### 8.3 Ward performance table

Sortable by name, members, average %, last event %, or trend (up/down/flat).
Last-event turnout is color-coded:

- ≥ 80 % → green
- 60–79 % → amber
- < 60 % → red

### 8.4 Top members

Ranked list of the 10 highest-attendance members across all events,
showing attendance rate as a percentage.

### 8.5 Activity log

**(Super Admin + Block Admin)**

The bottom of the Reports page has a collapsible **Activity log** section
showing every state-changing action: logins, member creates/edits,
admin changes, password resets, message sends, attendance marks. Filter by
action type or date range. Paginates 25 rows at a time.

### 8.6 Exporting reports

The **Export PDF** dropdown (top right) generates a PDF for:

- **Overview** — all KPIs and counts.
- **Attendance** — the last 12 events as a table.
- **Demographics** — full breakdown.

PDFs use the JanSeva header bar and are formatted for A4 print.

---

## 9. Admin management

**(Super Admin + Block Admin)**

Sidebar → **Admins**.

### 9.1 Adding an admin

1. Click **Add Admin**.
2. Enter name, email, role.
3. The system auto-generates a 12-character temporary password and shows it
   in a one-time modal (copy it; it won't be shown again).
4. (Optional) Tick **Send welcome email** so the admin gets a self-service
   email with the password.
5. Save.

The new admin will be required to change the temporary password on first
login.

Role rules:

- Super Admin can create any role in any block.
- Block Admin can create Ward Admin and Booth Worker roles inside their
  own block.
- Block Admin **cannot** create other Super or Block Admins.

### 9.2 Editing an admin

Click the pencil icon next to any admin row. Change name, role, scope, or
deactivate. You cannot edit your own role or deactivate yourself —
that's a deliberate guardrail.

### 9.3 Resetting a password

Click the key icon. Confirm. A new temporary password is generated, the
admin's `mustChangePassword` flag is set, and (if SMTP is configured) a
welcome email is sent. The new password also appears in a one-time modal.

### 9.4 Deactivating an admin

Click the power icon (red). Confirm. The admin is soft-deleted: their row
is preserved (audit trail is intact) but they can no longer log in. To
re-enable, edit the admin and toggle "Deactivate account" off.

---

## 10. Troubleshooting

| Symptom                                          | Likely cause / fix                                                                       |
|--------------------------------------------------|-------------------------------------------------------------------------------------------|
| **Login** says "Too many requests"               | 5-attempts-per-minute rate limit hit. Wait one minute.                                   |
| **Camera** in QR mode shows a black square        | Browser blocks camera on plain HTTP. Use HTTPS or `http://localhost`.                    |
| **Fingerprint** tab says "Scanner disconnected"   | Mantra RD Service isn't running. Reinstall the driver, then visit `http://localhost:11100/rd/info`. |
| **Aadhaar upload** rejected as "illegal characters" | Filename contained `..` / `/` / `\\`. Rename the file.                                  |
| **Aadhaar upload** rejected as "MIME mismatch"    | The file's actual content doesn't match its extension. Re-export from the source.        |
| **WhatsApp** delivery failures                    | Recipient hasn't messaged your business number in the last 24 h. Send a pre-approved template, or expect to use SMS instead. |
| **Reports** show old numbers                      | Aggregates are cached for 5 min. Either wait, or ask Ops to lower `REPORTS_CACHE_TTL_MS`. |
| **Bulk PDF** says "Limit is 1500 per job"         | Narrow the selection to a ward or booth.                                                 |
| **ID card text** looks squished on print          | Old browser cache. Hard-refresh the ID Cards page (`Ctrl+Shift+R`).                      |
| **"Cannot deactivate yourself"** error            | Expected. Have another admin do it for you.                                              |
| **Email** not sent on admin creation              | SMTP isn't configured. The temp password is shown once in the create modal — copy it.    |
| **"Out of block scope"** error                    | You're trying to access something in another block. Contact a Super Admin.               |
| **Session expired** modal appears                 | Refresh token expired (you've been idle >7 days). Sign in again.                         |

For deeper infrastructure problems (DB outages, certificate renewal,
backups), escalate to your operations team. Their playbook is in
`/opt/janseva/README.md`.

---

## Appendix A — Keyboard shortcuts

| Shortcut       | Action                                  |
|----------------|------------------------------------------|
| `Esc`          | Close any open modal                    |
| `Ctrl+P`       | Print the current ID card preview       |
| `Tab` / `Shift+Tab` | Navigate form fields                |

## Appendix B — Glossary

- **Block** — Top-level administrative division (e.g. "Patiala Urban").
- **Ward** — Subdivision of a block (e.g. "Ward 12").
- **Booth** — Polling-booth-level division of a ward.
- **Member** — A constituency resident in JanSeva's roster (`JS-XXXXXX`).
- **Card ID** — The unique ID of a printed card (`CARD-JS-XXXXXX`).
- **DLT** — Distributed Ledger Technology, India's regulatory framework for
  bulk SMS templates. Required for MSG91.
- **RD Service** — Mantra's Registered Device Service that runs locally
  on the workstation and exposes the fingerprint scanner over HTTP.

---

*End of manual. Version 1.0.0.*
