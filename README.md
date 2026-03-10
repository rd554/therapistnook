# MMPI-2 Automated Assessment & Report Generation

A professional, multi-practitioner web application for administering, scoring, and interpreting the MMPI-2 personality assessment. Designed for clinical psychologists to manage patient assessments with role-based access, automated scoring, AI-powered interpretation, and PDF report export.

## Architecture

| Layer    | Technology                                         |
| -------- | -------------------------------------------------- |
| Frontend | React (Vite), Tailwind CSS, Lucide Icons, Recharts |
| Backend  | FastAPI (Python), SQLAlchemy, uvicorn               |
| Database | Supabase (PostgreSQL)                               |
| Auth     | JWT (PyJWT) + bcrypt password hashing               |
| AI       | OpenAI GPT-4o-mini for clinical interpretation      |
| PDF      | fpdf2 for professional report export                |

## Project Structure

```
MMPI/
├── backend/
│   ├── main.py              # FastAPI app — all API endpoints
│   ├── auth.py              # JWT tokens, password hashing, role guards
│   ├── models.py            # SQLAlchemy models (Practitioner, Session, Answer, Result)
│   ├── schemas.py           # Pydantic request/response schemas
│   ├── scoring.py           # MMPI-2 scoring engine (raw → K-correction → T-scores)
│   ├── email_service.py     # SMTP email notifications for new practitioners
│   ├── database.py          # Async SQLAlchemy engine setup
│   ├── seed.py              # Database seeder (questions + owner account)
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Router with auth + patient session state
│   │   ├── api/client.js    # Axios client with JWT interceptor
│   │   ├── components/
│   │   │   └── Header.jsx   # Context-aware nav (patient vs practitioner)
│   │   └── pages/
│   │       ├── Login.jsx         # Practitioner/owner login
│   │       ├── Dashboard.jsx     # Practitioner — patient list + test link
│   │       ├── Admin.jsx         # Owner — manage practitioner accounts
│   │       ├── Results.jsx       # Practitioner — profile graph, scores, AI report
│   │       ├── PatientEntry.jsx  # Patient — instructions + resume option
│   │       ├── IntakeForm.jsx    # Patient — demographics + resume code
│   │       ├── Test.jsx          # Patient — 567 questions, 20/page, auto-save
│   │       └── ThankYou.jsx      # Patient — post-submission screen
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── package.json
└── scoring_key.json          # Source of truth for all item-to-scale mappings
```

## Quick Start

### 1. Backend

```bash
cd backend
cp .env.example .env          # Edit with your Supabase URL, JWT secret, etc.
pip install -r requirements.txt
python3 seed.py               # Seeds 567 questions + owner account into Supabase
python3 -m uvicorn main:app --reload --port 8000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev                   # Runs on http://localhost:5173
```

## Configuration (.env)

| Variable         | Description                                                    |
| ---------------- | -------------------------------------------------------------- |
| `DATABASE_URL`   | Supabase PostgreSQL connection string (with `+asyncpg`)        |
| `JWT_SECRET`     | Secret key for signing JWT tokens                              |
| `OWNER_NAME`     | Name for the auto-created owner account                        |
| `OWNER_EMAIL`    | Owner login email                                              |
| `OWNER_PASSWORD` | Owner login password                                           |
| `OPENAI_API_KEY` | OpenAI key for AI-powered clinical interpretation (optional)   |
| `SMTP_HOST`      | SMTP server for email notifications (optional)                 |
| `SMTP_PORT`      | SMTP port (default 587)                                        |
| `SMTP_EMAIL`     | Sender email address                                           |
| `SMTP_PASSWORD`  | SMTP password / Gmail app password                             |
| `SITE_URL`       | Public URL of the frontend (used in emails)                    |

## User Roles & Workflow

### Patient (no login required)

1. Receives a test link from their practitioner (e.g. `https://site.com/test?ref=abc123`)
2. Reads MMPI-2 instructions
3. Fills intake form (Name, DOB, Gender, Nationality, Education)
4. Receives a **6-character resume code** to continue later if needed
5. Answers 567 True/False questions (20 per page, auto-saved)
6. Sees a **Thank You** page on completion — never sees results

### Practitioner (login required)

1. Logs in at `/login`
2. Views **Dashboard** with list of their patients and session statuses
3. Copies their unique **patient test link** to share
4. Views completed assessment results: profile graph, score table, AI interpretation
5. Downloads professional **PDF reports**

### Owner / Admin (login required)

1. Logs in at `/login` → redirected to **Admin panel**
2. Creates, enables, and disables practitioner accounts
3. New practitioners receive a **welcome email** with login credentials and test link
4. Has access to all practitioners' sessions and results
5. Also has their own Dashboard for direct patient assessments

## Scoring Engine

All scoring logic is driven by `scoring_key.json`:

- **Raw scores** — counted from `true_items` and `false_items` per scale
- **K-Correction** — applied to scales Hs (×0.5), Pd (×0.4), Pt (×1.0), Sc (×1.0), Ma (×0.2)
- **Gender-specific Scale 5** — uses `5_Mf_male` or `5_Mf_female` items based on patient gender
- **T-Score conversion** — linear formula: `T = 50 + 10 × (Raw - Mean) / SD` using standard adult norms

## Session Resume

Patients can take a break at any point and resume later:

1. After intake, a unique **resume code** (e.g. `XK7M2P`) is displayed
2. All answers are auto-saved after every page navigation
3. To resume: open the same test link → click "Resume Previous" → enter code
4. The test picks up at the first unanswered page

## API Endpoints

### Auth

| Method | Endpoint               | Description              |
| ------ | ---------------------- | ------------------------ |
| POST   | `/api/auth/login`      | Practitioner login       |
| GET    | `/api/auth/me`         | Get current user profile |

### Admin (owner only)

| Method | Endpoint                            | Description               |
| ------ | ----------------------------------- | ------------------------- |
| GET    | `/api/admin/practitioners`          | List all practitioners    |
| POST   | `/api/admin/practitioners`          | Create practitioner       |
| PATCH  | `/api/admin/practitioners/{id}`     | Update / toggle active    |

### Patient-facing (no auth)

| Method | Endpoint                                     | Description             |
| ------ | -------------------------------------------- | ----------------------- |
| GET    | `/api/practitioner/by-ref/{ref_code}`        | Validate test link      |
| POST   | `/api/patient/sessions`                      | Create test session     |
| POST   | `/api/patient/resume`                        | Resume with code        |
| GET    | `/api/questions?page=1&per_page=20`          | Paginated questions     |
| POST   | `/api/patient/sessions/{id}/answers`         | Save answer batch       |
| GET    | `/api/patient/sessions/{id}/answers`         | Retrieve saved answers  |
| POST   | `/api/patient/sessions/{id}/finish`          | Submit & score          |

### Dashboard (auth required)

| Method | Endpoint                                        | Description              |
| ------ | ----------------------------------------------- | ------------------------ |
| GET    | `/api/dashboard/sessions`                       | List practitioner's sessions |
| GET    | `/api/dashboard/sessions/{id}`                  | Get scored results       |
| POST   | `/api/dashboard/sessions/{id}/interpret`        | Generate AI interpretation |
| GET    | `/api/dashboard/sessions/{id}/report/pdf`       | Download PDF report      |
