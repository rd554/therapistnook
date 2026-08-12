# MMPI-2 Assessment Platform

A comprehensive clinical psychology practice management platform for administering MMPI-2 assessments, managing patients, scheduling appointments, and handling payments.

## Features

- **Patient Management** - Complete patient records with clinical history
- **MMPI-2 Assessments** - Full 567-question assessment with automated scoring
- **Clinical Documents** - Upload and organize clinical documents
- **Appointment Scheduling** - Calendar management with availability settings
- **Payment Processing** - Payment tracking and receipt generation
- **Public Booking** - Patient self-service booking portal
- **Practice Analytics** - Comprehensive business analytics
- **Clinical Intelligence** - AI-powered patient insights (optional)

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
