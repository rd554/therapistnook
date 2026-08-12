# Bulk Client Data Import — Design (NOT YET BUILT)

> **Status: parked.** This is a design doc only — no migration, endpoint, or UI has
> been written yet. Reminder to pick this back up when there's time.

## Why

Therapists onboarding onto the platform already have an existing client roster
(paper, spreadsheet, or another EHR export) with clinical history. Right now the
only way to get a client into this system is one at a time via the manual
Patient form or the online intake flow. A bulk-import path removes the biggest
piece of adoption friction for practitioners migrating their whole practice over.

**Scope decision (confirmed with user):** downloadable Excel template only.
No ZIP-of-documents upload, no bulk session-recording upload — that would add
unnecessary AI/processing cost and is explicitly out of scope for now.

## Why this is more than "add a CSV importer"

Every EHR has a bulk importer for flat fields. The actual differentiator here
would be reusing the platform's existing `ClinicalIntelligence` / `SOURCE_TYPES`
citation-tracked aggregation layer so imported data becomes clinically useful,
not just stored — but that's a later phase. This doc only covers the
structured-template phase.

## Hard constraints found in the codebase

1. **`Patient` requires 4 NOT NULL fields**: `full_name`, `date_of_birth`,
   `age`, `gender` (`models.py`). Legacy data often has only one of DOB/age.
   Accept either column and derive the other — same pattern already used in
   `accept_intake_submission`'s `approx_dob` derivation.
2. **Excel DOB cells return a `datetime` if date-formatted, a `str` if typed as
   text** — parser must handle both.
3. **MMPI scoring is gender-specific** (`SCALE_NORM_MAP`, `5_Mf_male`/`female`).
   Free-text gender values must be normalized/rejected at import time, not
   stored raw, or future scoring breaks silently for that patient.
4. **These are existing clients, not new leads** — don't default `status` to
   active-new or `first_seen_date` to the import date; both need explicit
   columns.
5. **Every template column must map to a key `ClinicalHistoryWizard.jsx`
   actually reads.** Otherwise data imports successfully and is invisible in
   the UI forever. This is the rule that decided the column list below.

## Template columns

Grounded directly in `ClinicalHistory`'s JSON-blob fields (`basic_info`,
`presenting_complaint`, `history_present_illness`, `medical_history`,
`personal_history`, `relationship_history`, `substance_use`, `trauma_history`)
and what `ClinicalHistoryWizard.jsx` renders per section.

**Identity & contact**
- `external_id` — therapist's own client reference; dedup key for re-uploads,
  future link target for documents.
- `full_name`, `date_of_birth`, `age`, `gender` (dropdown)
- `phone`, `email`, `address`, `emergency_contact`, `referral_source`

**Existing-client metadata**
- `status` — active / on-hold / discharged (dropdown)
- `first_seen_date`
- `assigned_practitioner_email` — only relevant if a clinic owner imports for a team

**Chief complaint & presenting history**
- `chief_complaint`, `duration`, `severity`, `onset_pattern`, `trigger`,
  `functional_impact`
- `onset_date`, `previous_episodes`, `course`, `previous_diagnoses`,
  `previous_treatment`, `hospitalisations`

**Medical**
- `medical_conditions`, `neurological_conditions`, `current_medications`,
  `previous_medications`, `allergies`

**Personal & relationship history**
- `childhood`, `education`, `occupation`, `employment_status` (dropdown),
  `financial_situation` (dropdown), `living_arrangement`
- `marital_status` (dropdown), `romantic_relationships`,
  `family_relationships`, `social_support`

**Substance use** — dropdown columns only (Never / Past / Current), since the
wizard has no free-text key at this level:
- `alcohol_use`, `smoking_use`, `tobacco_use`, `drugs_use`

**Trauma** — the two free-text keys the wizard actually has:
- `major_life_events`, `other_trauma`

**Catch-all**
- `therapist_notes` — plain text, for anything without a dedicated column

## Deliberately excluded from v1

- **Risk assessment** (suicide/self-harm/violence flags) — point-in-time
  clinical judgment; a stale imported flag is more dangerous than an empty one
  that prompts a live in-app assessment.
- **Family psychiatric history detail** (per-relation condition + quality
  grid) — too deeply nested to flatten without 10+ extra columns or lossy
  free text. `family_relationships` above covers the qualitative version;
  full detail stays an in-app wizard task.

## Open decisions to make before building

1. **Re-upload behavior** for a repeated `external_id` — proposed default:
   skip existing + warn, with an "update in place" override option.
2. **Partial completeness** — an import that only fills some sections should
   set `ClinicalHistory.status = in_progress` (not `completed`) and
   `current_step` to the first unfilled section, so the in-app wizard picks up
   where the spreadsheet left off.

## Suggested build order (when resumed)

1. Generate the `.xlsx` template via `openpyxl`, with real `DataValidation`
   dropdowns on every enum column (gender, status, employment_status,
   financial_situation, marital_status, substance-use columns) — kills most
   normalization pain at the source.
2. Staged import, not direct writes to `Patient` — reuse the existing
   `IntakeSubmission`-style pattern (pending → practitioner review →
   accept/decline) so a bad file can't corrupt the live caseload. An
   `ImportBatch` + staged-rows model gives per-row error reporting and batch
   rollback.
3. Upload endpoint parses + validates + stages; a review screen shows
   per-row pass/fail before committing.
4. Commit step creates `Patient` + `ClinicalHistory` rows from
   accepted staged rows.

## Reminder

Come back to this — user wants the bulk-import feature finished. Nothing here
has been implemented yet; start at step 1 above (template generation) once
picked back up.
