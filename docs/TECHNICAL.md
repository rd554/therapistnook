# MMPI-2 Assessment Platform - Technical Documentation

## Overview

The MMPI-2 Assessment Platform is a comprehensive clinical psychology practice management system built with modern web technologies. It provides tools for patient management, psychological assessments, scheduling, payments, and clinical documentation.

## Architecture

### Technology Stack

**Backend:**
- **Framework:** FastAPI (Python 3.10+)
- **Database:** SQLite (development) / PostgreSQL (production)
- **ORM:** SQLAlchemy 2.0 with async support
- **Authentication:** JWT tokens with bcrypt password hashing
- **API Documentation:** OpenAPI/Swagger (development only)

**Frontend:**
- **Framework:** React 18 with Vite
- **Routing:** React Router v6
- **Styling:** Tailwind CSS
- **State Management:** React hooks (useState, useEffect)
- **HTTP Client:** Axios
- **Charts:** Recharts
- **Icons:** Lucide React

### Project Structure

```
MMPI/
├── backend/
│   ├── main.py              # FastAPI application and routes
│   ├── models.py            # SQLAlchemy database models
│   ├── schemas.py           # Pydantic request/response schemas
│   ├── database.py          # Database configuration and session
│   ├── auth.py              # Authentication utilities
│   ├── middleware.py        # Security and logging middleware
│   ├── exceptions.py        # Custom exception handling
│   ├── validation.py        # Input validation utilities
│   ├── logging_config.py    # Centralized logging
│   ├── query_utils.py       # Database query optimization
│   ├── db_indexes.py        # Database index management
│   ├── storage.py           # File storage utilities
│   ├── scoring.py           # MMPI-2 scoring algorithms
│   ├── email_service.py     # Email notification service
│   ├── notification_service.py
│   ├── booking_service.py
│   ├── meeting_service.py
│   ├── analytics_service.py
│   ├── settings_service.py
│   ├── clinical_intelligence.py
│   ├── session_intelligence.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Main application component
│   │   ├── main.jsx         # Entry point
│   │   ├── api/
│   │   │   └── client.js    # API client with error handling
│   │   ├── components/
│   │   │   ├── ui/          # Reusable UI components
│   │   │   ├── ErrorBoundary.jsx
│   │   │   └── ...
│   │   ├── pages/           # Page components
│   │   └── layouts/         # Layout components
│   ├── package.json
│   ├── vite.config.js
│   └── tailwind.config.js
├── docs/
│   ├── TECHNICAL.md
│   ├── DEPLOYMENT.md
│   └── API.md
└── scoring_key.json         # MMPI-2 scoring keys
```

## Database Schema

### Core Entities

1. **Practitioner** - System users (owners and practitioners)
2. **Patient** - Clinical patients
3. **Session** - MMPI-2 assessment sessions
4. **Question** - MMPI-2 questions
5. **Answer** - Patient responses
6. **Result** - Calculated assessment results

### Clinical Management

1. **ClinicalHistory** - Patient intake and history
2. **ClinicalDocument** - Uploaded clinical documents
3. **Assessment** - Various psychological assessments
4. **TherapySession** - Session recordings and transcripts
5. **ClinicalIntelligence** - AI-generated patient insights

### Scheduling & Payments

1. **Appointment** - Scheduled appointments
2. **PractitionerAvailability** - Working hours
3. **UnavailableDate** - Blocked dates
4. **Payment** - Payment records
5. **Receipt** - Generated receipts
6. **BookingRequest** - Public booking requests

### Notifications

1. **InternalNotification** - In-app notifications
2. **NotificationLog** - Sent notification history
3. **NotificationTemplate** - Reusable templates
4. **ScheduledReminder** - Automated reminders

### Configuration

1. **ClinicSettings** - Clinic-wide settings
2. **PractitionerProfile** - Public profiles
3. **MeetingProviderConfig** - Video meeting setup
4. **WhatsAppConfig** - WhatsApp integration

## API Overview

### Authentication

- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user
- `POST /api/auth/change-password` - Change password

### Patients

- `GET /api/patients` - List patients
- `POST /api/patients` - Create patient
- `GET /api/patients/{id}` - Get patient
- `PATCH /api/patients/{id}` - Update patient
- `POST /api/patients/{id}/archive` - Archive patient

### Appointments

- `GET /api/appointments` - List appointments
- `POST /api/appointments` - Create appointment
- `GET /api/appointments/calendar` - Calendar view
- `POST /api/appointments/{id}/reschedule` - Reschedule
- `POST /api/appointments/{id}/cancel` - Cancel

### Payments

- `GET /api/payments` - List payments
- `GET /api/payments/dashboard` - Payment dashboard
- `POST /api/payments/{id}/mark-paid` - Mark as paid
- `POST /api/payments/{id}/refund/initiate` - Initiate refund

### Public Routes (No Auth)

- `GET /api/public/profile/{slug}` - Public profile
- `GET /api/public/profile/{slug}/booking/slots` - Available slots
- `POST /api/public/profile/{slug}/booking` - Create booking
- `GET /api/public/pay/{token}` - Payment page

## Security

### Authentication

- JWT tokens with configurable expiration
- Password hashing with bcrypt
- Secure session management

### Authorization

- Role-based access control (owner, practitioner)
- Resource-level permissions
- Owner-only administrative functions

### Security Headers

- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- X-XSS-Protection: 1; mode=block
- Strict-Transport-Security (production)
- Referrer-Policy: strict-origin-when-cross-origin

### Rate Limiting

- 120 requests per minute per IP
- 20 request burst limit
- Configurable thresholds

### Input Validation

- Email format validation
- Phone number validation
- File type and size validation
- SQL injection prevention via ORM
- XSS prevention via output encoding

## Performance Optimizations

### Backend

- Async database operations
- Connection pooling
- Composite database indexes
- Query optimization utilities
- Pagination support

### Frontend

- Code splitting with lazy loading
- Vendor chunk separation
- Image optimization
- Efficient re-rendering with React hooks

## Error Handling

### Backend

- Global exception handler
- Consistent error response format
- Structured logging
- Audit logging for sensitive operations

### Frontend

- React Error Boundary
- API error interceptor
- User-friendly error messages
- Field-level validation feedback

## Monitoring & Logging

### Log Levels

- DEBUG: Detailed debugging information
- INFO: General operational events
- WARNING: Potential issues
- ERROR: Error events

### Log Format

Development: Colored terminal output
Production: JSON structured logs

### Audit Events

- Authentication events
- Data modifications
- Payment operations
- Integration changes

## Environment Variables

See `docs/DEPLOYMENT.md` for complete environment configuration.

### Required Variables

- `DATABASE_URL` - Database connection string
- `JWT_SECRET` - JWT signing secret (32+ chars in production)
- `ENVIRONMENT` - development/production

### Optional Variables

- `OPENAI_API_KEY` - For AI features
- `SMTP_*` - Email configuration
- `GOOGLE_*` - Google Calendar integration

## Testing

### Running Tests

```bash
# Backend tests
cd backend
pytest

# Frontend tests
cd frontend
npm test
```

### Test Categories

- Unit tests for utilities and services
- Integration tests for API endpoints
- End-to-end tests for critical flows

## Deployment

See `docs/DEPLOYMENT.md` for detailed deployment instructions.
