# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A clinical psychology practice management platform built around automated MMPI-2 (Minnesota Multiphasic Personality Inventory) assessment scoring, plus patient records, scheduling, payments, and clinical documentation. FastAPI backend + React/Vite frontend.

## Commands

### Backend
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # then edit .env

uvicorn main:app --reload --port 8002    # dev server
python seed.py                            # seeds 567 MMPI-2 questions + owner account (admin@mmpi.local / admin123)
```
There is no pytest suite and no `backend/test_*.py` scratch scripts are kept in the repo (they contained one-off/demo patient data and were removed before the repo went public). Exercise the API by running the dev server and hitting endpoints directly, or write a throwaway script locally.

### Frontend
```bash
cd frontend
npm install
npm run dev       # http://localhost:5173, proxies /api -> http://localhost:8002 (see vite.config.js)
npm run build
```
No frontend test runner is configured.

### Full local dev
Run backend (`uvicorn`, port 8002) and frontend (`vite`, port 5173) in separate terminals; the Vite dev server proxies `/api/*` to the backend.

## Architecture

### Backend is one large FastAPI app, not routers-per-feature
`backend/main.py` (~8500 lines) defines essentially all ~180 API routes directly with `@app.get/post/patch/delete(...)`. There is no `APIRouter` split by domain — when adding or changing an endpoint, search `main.py` for the existing route family (e.g. `/api/patients`, `/api/payments`, `/api/analytics`) rather than expecting a dedicated file. Supporting logic lives in sibling modules that `main.py` imports and calls into:

- `models.py` — SQLAlchemy 2.0 async ORM models (Practitioner, Patient, Session/Question/Answer/Result for MMPI-2, ClinicalHistory/ClinicalDocument/Assessment, Appointment/PractitionerAvailability/Payment/Receipt, notifications, public-profile/booking entities).
- `schemas.py` — Pydantic request/response schemas, imported piecemeal by name into `main.py`.
- `scoring.py` — the MMPI-2 scoring pipeline (see below).
- `auth.py` — JWT issuance/verification, password hashing, `get_current_practitioner`/`require_owner` FastAPI dependencies.
- `database.py` — async engine/session setup; `init_db()` also runs lightweight hand-rolled column-migrations (`_run_sqlite_migrations`/`_run_postgres_migrations`) since there's no Alembic — new columns on existing tables must be added to both branches here.
- `middleware.py` — security headers, in-memory rate limiting (120/min, burst 10, skips `/api/public/*`), request logging, global error handler; wired up in `main.py`'s app construction.
- `exceptions.py`, `validation.py`, `query_utils.py`, `db_indexes.py`, `storage.py`, `logging_config.py` — cross-cutting concerns (exception handlers, input validation, query helpers, index migrations, file storage for uploads, structured logging).
- Feature service modules called from `main.py`: `email_service.py`, `notification_service.py`, `booking_service.py`, `meeting_service.py`, `analytics_service.py`, `settings_service.py`, `clinical_intelligence.py`, `session_intelligence.py`, `reminder_service.py`.

Uploaded files are written under `backend/uploads/` via `storage.py`; keep that directory out of the web root in deployment.

### MMPI-2 scoring pipeline (`backend/scoring.py`)
Raw scoring keys come from `scoring_key.json` (repo root); T-score conversion tables are read at runtime from Excel workbooks in the repo root (`T-score MMPI-2.xlsx`, `Subscale T1 score.xlsx`, `Si Subscale T-conversion.xlsx`, `Supplementary scales T score.xlsx`) via `openpyxl` and cached in module-level globals after first load. `full_scoring_pipeline(answers, gender)` is the entry point, returning raw scores, K-corrected scores, T-scores, and Harris-Lingoes/Si/supplementary subscales. Scoring is gender-specific (separate Male/Female columns/keys throughout — see `5_Mf_male`/`5_Mf_female` and the `SCALE_NORM_MAP`), and VRIN/TRIN use pair-based counting logic distinct from the simple true/false item counting used elsewhere. If you touch scoring logic, be aware the Excel column headers contain real typos that are worked around deliberately (e.g. `"Fb (Men"` missing a closing paren) — don't "fix" them without checking the source workbook.

### Auth & roles
JWT bearer tokens (`auth.py`), two practitioner roles: `owner` (admin, via `require_owner` dependency) and `practitioner`. `JWT_SECRET` must be 32+ chars in production (enforced with a hard `sys.exit` at import time). Patient-facing assessment flow is a separate, mostly unauthenticated path (`/api/patient/*`, keyed by session `ref_code`/`resume_code`) distinct from practitioner-authenticated `/api/dashboard/*` and `/api/patients/*` routes. `/api/public/*` routes (public practitioner profiles, public booking, public payment pages) are unauthenticated and explicitly excluded from rate limiting.

### Frontend structure
- `src/api/client.js` — single axios instance + every backend call as a named export function (grouped by feature with comment headers); add new API calls here rather than calling axios ad hoc from components. It also centralizes 401 handling (redirects to `/login` only for known protected route prefixes) and shapes `err.userMessage`/`err.fieldErrors` for display.
- `src/pages/` — route-level views; `src/components/` — feature components, with `components/ui/`, `components/analytics/`, `components/dashboard/`, `components/settings/` as shared sub-libraries (each with an `index.js` barrel).
- `src/layouts/` — shell chrome (Sidebar, WorkspaceHeader, WorkspaceLayout).
- Styling is Tailwind with an extensive custom design-token theme in `tailwind.config.js` (custom color scales like `primary`/`lavender`, spacing, radii, shadows) — prefer existing tokens over ad hoc arbitrary values.
- Auth token/role/name are stored in `localStorage` (`mmpi_token`, `mmpi_role`, `mmpi_prac_name`); several API helpers (PDF/document/audio download URLs) append the token as a `?token=` query param instead of an auth header since they're used for direct browser navigation/`<a href>`/`<audio>` links.

### Database
SQLite (`backend/mmpi.db`) for development, PostgreSQL (`asyncpg`) for production, selected via `DATABASE_URL`. There is no migration framework (no Alembic) — schema evolution is handled by `Base.metadata.create_all` plus the manual `ALTER TABLE ... ADD COLUMN` checks in `database.py` and `db_indexes.py`, which must stay in sync for both SQLite and Postgres dialects.
