# Bulk Client Data Import — Design

> **Status: a scoped-down v1 of this shipped** (`GET /api/patients/bulk-template`,
> `POST /api/patients/bulk-import` in `backend/main.py`; UI in
> `PractitionerPatients.jsx` — download-template button, upload modal with
> per-row pass/fail results). This doc originally described a richer version
> that was never built that way; the parts below marked **(not built)** are
> still open if/when the richer version is wanted.

## Why

Therapists onboarding onto the platform already have an existing client roster
(paper, spreadsheet, or another EHR export) with clinical history. Right now the
only way to get a client into this system is one at a time via the manual
Patient form or the online intake flow. A bulk-import path removes the biggest
piece of adoption friction for practitioners migrating their whole practice over.

**Scope decision (confirmed with user):** downloadable Excel template only.
No ZIP-of-documents upload, no bulk session-recording upload — that would add
unnecessary AI/processing cost and is explicitly out of scope for now.

## What's actually implemented (v1, shipped)

- `.xlsx` template (`download_patient_bulk_template`) with a "Patients" sheet
  (real data) and a separate "Example" sheet (filled sample row) so re-uploading
  without deleting the example can't create a fake patient. `DataValidation`
  dropdowns constrain Gender (Male/Female/Other) and Status (Active/Archived).
- Upload endpoint (`bulk_import_patients`) parses the "Patients" sheet,
  validates every row (required fields, DOB parsing — handles both Excel date
  cells and typed strings, gender normalization, email/phone shape, duplicate
  email/phone both within the sheet and against the practitioner's existing
  patients), and **commits valid rows directly** — no staging/review step.
  Rows with errors are reported back per-row but don't block the rest of the
  sheet.
- Columns: `full_name`, `date_of_birth`, `gender`, `phone`, `email`,
  `emergency_contact`, `referral_source`, `chief_complaint`,
  `therapist_notes`, `status`.
- A row with `chief_complaint` and/or `therapist_notes` seeds a
  `ClinicalHistory` row (`status="in_progress"`) pre-filled with
  `basic_info` + `presenting_complaint.chief_complaint` — the wizard has no
  step-ordering gate, so leaving later sections unset is safe and the
  practitioner can finish the rest in-app.
- Duplicate handling: rows whose email or phone match an existing patient
  (or another row already in the same sheet) are rejected with a per-row
  error and not created — this is the "skip + warn" behavior, keyed by
  email/phone since there's no `external_id` field in this version.

## Not built — only relevant if the richer version gets picked back up

1. **`external_id` as an explicit dedup key** — v1 dedupes on email/phone
   instead. An explicit `external_id` (therapist's own client reference) would
   be needed if a practice wants a stable re-upload/re-sync key independent
   of contact info, or a future link target for bulk document import.
2. **Staged import with a review screen before commit** — v1 commits valid
   rows immediately and reports errors inline in the same response; there's
   no `ImportBatch`/pending-rows model, no separate "review then accept"
   step. Fine for a template this narrow; would matter more if the column set
   grows to the full clinical-history template below.
3. **Full clinical-history template columns** — v1 only carries
   `chief_complaint`/`therapist_notes` into `ClinicalHistory`. The full column
   list originally scoped (presenting complaint detail, history of present
   illness, medical/personal/relationship history, substance use, trauma) is
   below, grounded in `ClinicalHistory`'s JSON-blob fields and what
   `ClinicalHistoryWizard.jsx` actually reads. **Verified against the live
   wizard code** (some keys differ from the original draft — corrected here):
   `presenting_complaint.duration_value` + `presenting_complaint.duration_unit`
   (not a single `duration` field), and `trauma_history.other` (not
   `other_trauma`).
4. **Partial completeness → `current_step` tracking** — v1 always sets
   `current_step=2 if chief_complaint else 1`; a fuller import would need to
   compute the first genuinely unfilled step across all sections.
5. **`assigned_practitioner_email`** for a clinic owner importing on behalf of
   a team — v1 always imports under the uploading practitioner.
6. **Risk assessment / family psychiatric history detail** — deliberately
   excluded even from the richer design (see below).

## Hard constraints (apply to any future extension)

1. **`Patient` requires 4 NOT NULL fields**: `full_name`, `date_of_birth`,
   `age`, `gender` (`models.py`). v1 derives `age` from `date_of_birth` via
   `_compute_age`.
2. **Excel DOB cells return a `datetime` if date-formatted, a `str` if typed
   as text** — v1's `parse_dob` already handles both plus several string
   formats.
3. **MMPI scoring is gender-specific** (`SCALE_NORM_MAP`, `5_Mf_male`/`female`,
   exact keys `"Male"`/`"Female"`). v1's `gender_map` normalizes free text to
   `Male`/`Female`/`Other` at import time.
4. **These are existing clients, not new leads** — v1's `status` column
   defaults to `active` only if left blank; there's no `first_seen_date`
   column yet in v1 (open item if that distinction matters later).
5. **Every template column must map to a key `ClinicalHistoryWizard.jsx`
   actually reads** — otherwise data imports successfully and is invisible in
   the UI forever. Double-check against the wizard source directly before
   adding columns, not against this doc (see the corrected keys in item 3
   above — the original draft had two wrong).

## Full richer-version column list (not built, for reference)

**Identity & contact** (beyond v1's set)
- `external_id`, `address`

**Existing-client metadata**
- `first_seen_date`, `assigned_practitioner_email`

**Chief complaint & presenting history** (beyond v1's plain-text
`chief_complaint`)
- `duration_value`, `duration_unit`, `severity`, `onset_pattern`, `trigger`,
  `functional_impact`
- `onset_date`, `previous_episodes` (dropdown: none/one/few/multiple/chronic),
  `course`, `previous_diagnoses`, `previous_treatment`, `hospitalisations`

**Medical**
- `medical_conditions`, `neurological_conditions`, `current_medications`,
  `previous_medications`, `allergies`

**Personal & relationship history**
- `childhood`, `education`, `occupation`,
  `employment_status` (dropdown: employed_full/employed_part/self_employed/
  unemployed/student/retired/homemaker/disabled),
  `financial_situation` (dropdown: stable/comfortable/struggling/
  severe_stress/dependent), `living_arrangement`
- `marital_status` (dropdown: single/married/partnered/separated/divorced/
  widowed), `romantic_relationships`, `family_relationships`, `social_support`

**Substance use** — dropdown columns only (never/past/current), one per
substance (`alcohol`, `smoking`, `tobacco`, `drugs`), since the wizard nests
`{use, frequency, duration, treatment}` per substance:
- `alcohol_use`, `smoking_use`, `tobacco_use`, `drugs_use`
  (frequency/duration/treatment sub-fields would need either extra columns per
  substance or free text — not resolved)

**Trauma** — the two free-text keys the wizard actually has:
- `major_life_events`, `other` (wizard field name — not `other_trauma`)

**Catch-all**
- `therapist_notes` (already in v1)

**Deliberately excluded even from the richer version**
- **Risk assessment** (suicide/self-harm/violence flags) — point-in-time
  clinical judgment; a stale imported flag is more dangerous than an empty one
  that prompts a live in-app assessment.
- **Family psychiatric history detail** (per-relation condition + quality
  grid) — too deeply nested to flatten without 10+ extra columns or lossy
  free text. `family_relationships` covers the qualitative version; full
  detail stays an in-app wizard task.

## If picked back up

Start from v1's existing endpoints rather than rewriting: extend
`field_aliases`/`col_index` parsing in `bulk_import_patients`, add the new
`ClinicalHistory` JSON-blob fields to the seeded record, and add the new
columns + dropdown `DataValidation`s to `download_patient_bulk_template`.
Decide items 1–2 under "Not built" above before writing code, since they
change the endpoint's transaction shape (direct-commit vs. staged review).
