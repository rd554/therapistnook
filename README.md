# Therapistnook

A comprehensive clinical psychology practice management platform for administering MMPI-2 assessments, managing patients, scheduling appointments, and handling payments.

## Features

- **Patient Management** - Complete patient records with clinical history
- **Bulk Client Import** - Onboard an existing patient roster via an Excel template (download, fill, upload — per-row validation with skip+warn on duplicates)
- **MMPI-2 Assessments** - Full 567-question assessment with automated scoring
- **Clinical Documents** - Upload and organize clinical documents (PDF/.docx text extraction; legacy .doc/.xls/.xlsx are stored with a clear "format not readable" status rather than silently failing)
- **Appointment Scheduling** - Calendar management with availability settings, synced to the practitioner's connected Google Calendar (create/update/cancel/delete kept in sync automatically)
- **Payment Processing** - Payment tracking and receipt generation
- **Public Booking** - Patient self-service booking portal
- **Practice Analytics** - Comprehensive business analytics
- **Clinical Intelligence** - AI-powered, per-patient running summary assembled from clinical history, therapy session transcripts, uploaded documents, MMPI-2 results, and assessment completions (optional)

## Recent Updates (2026-08-19)

- **Clinical Intelligence**: assessment records now push into Clinical Intelligence on completion (mirroring the existing MMPI-2 hook); the bulk-reprocess endpoint now covers all four source types (clinical history, therapy sessions, documents, assessments) instead of silently skipping documents/assessments.
- **Google Calendar sync**: every appointment (not just video calls) is pushed to the practitioner's connected Google Calendar, including appointments created through the public booking flow, and stays in sync through edits, reschedules, cancellations, and deletes.
- **Legacy document uploads**: `.doc`/`.xls`/`.xlsx` files now show a clear "format not readable — please re-upload as PDF or .docx" status instead of being stored with no extracted text and no explanation.
- **Branding**: added the Therapistnook logo and favicon across the login page, sidebar, and legacy patient-facing header.
- **UI**: the Payment Details panel is now a centered modal (matching the app's other modals) instead of a full-height side drawer.

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

Default credentials:
- Email: admin@example.com
- Password: admin123

**Change this immediately in production!**

## Documentation

- [Technical Documentation](docs/TECHNICAL.md) - Architecture and API reference
- [Deployment Guide](docs/DEPLOYMENT.md) - Production deployment instructions

## Project Structure

```
MMPI/
├── backend/          # FastAPI backend
├── frontend/         # React frontend
├── docs/            # Documentation
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
