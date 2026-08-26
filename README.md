# Therapistnook

A comprehensive clinical psychology practice management platform for administering MMPI-2 assessments, managing patients, scheduling appointments, and handling payments.

## Features

- **Landing Page & Self-Signup** - Public marketing site with practitioner self-registration, email verification, and "Continue with Google" login
- **Patient Management** - Complete patient records with clinical history
- **Bulk Client Import** - Onboard an existing patient roster via an Excel template (download, fill, upload — per-row validation with skip+warn on duplicates)
- **MMPI-2 Assessments** - Full 567-question assessment with automated scoring
- **Clinical Documents** - Upload and organize clinical documents (PDF/.docx text extraction; legacy .doc/.xls/.xlsx are stored with a clear "format not readable" status rather than silently failing)
- **Appointment Scheduling** - Calendar management with availability settings, synced to the practitioner's connected Google Calendar (create/update/cancel/delete kept in sync automatically)
- **Payment Processing** - Payment tracking and receipt generation, with invoice PDF generation and signature/stamp upload
- **Public Booking** - Patient self-service booking portal
- **Practice Analytics** - Comprehensive business analytics
- **Clinical Intelligence** - AI-powered, per-patient running summary assembled from clinical history, therapy session transcripts, uploaded documents, MMPI-2 results, and assessment completions, with an interactive chat panel (optional)
- **Account Management** - Self-service account deletion (deactivation) for practitioners

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+

### Backend Setup

```bash
cd backend

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
# or: venv\Scripts\activate  # Windows

# Install dependencies
pip install -r requirements.txt

# Copy environment file and configure
cp .env.example .env
# Edit .env with your settings

# Start the server
uvicorn main:app --reload --port 8002
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

The application will be available at http://localhost:5173

### Default Admin Account

After first run, use the seed script to create an admin account:

```bash
cd backend
python seed.py
```

By default this creates a local-only development account. Set `OWNER_EMAIL` and `OWNER_PASSWORD` in your `.env` before running the seed script to choose your own credentials instead — **do this before any non-local deployment.**

Alternatively, practitioners can self-register from the landing page's signup flow (email/password or "Continue with Google"). Self-signup requires SMTP configuration to deliver verification emails; Google login additionally requires `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` to be set.

## Project Structure

```
MMPI/
├── backend/          # FastAPI backend
├── frontend/         # React frontend
└── scoring_key.json # MMPI-2 scoring keys
```

## Environment Variables

See `backend/.env.example` for all configuration options.

### Required for Production

| Variable | Description |
|----------|-------------|
| `ENVIRONMENT` | Set to `production` |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secure random string (32+ chars) |

## Security

- JWT-based authentication
- Role-based access control (Admin/Practitioner)
- Rate limiting
- Security headers
- Input validation

## License

Proprietary - All rights reserved
