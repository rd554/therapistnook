# MMPI-2 Assessment Platform - Deployment Guide

## Prerequisites

- Python 3.10 or higher
- Node.js 18 or higher
- PostgreSQL 14+ (production)
- Reverse proxy (nginx recommended)

## Environment Configuration

### Backend Environment Variables

Create a `.env` file in the `backend/` directory:

```env
# Required
ENVIRONMENT=production
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/mmpi_db
JWT_SECRET=your-secure-random-string-at-least-32-characters-long

# Optional - Email
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=your-email@example.com
SMTP_PASSWORD=your-smtp-password
SMTP_FROM_EMAIL=noreply@example.com
SMTP_FROM_NAME=MMPI Platform

# Optional - AI Features
OPENAI_API_KEY=sk-your-openai-api-key

# Optional - Google Calendar
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=https://your-domain.com/api/oauth/google/callback

# Optional - WhatsApp
WHATSAPP_ACCESS_TOKEN=your-whatsapp-token
WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id

# Optional - CORS (comma-separated)
ALLOWED_ORIGINS=https://your-domain.com,https://www.your-domain.com

# Optional - Logging
LOG_LEVEL=INFO
```

### Environment Variable Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `ENVIRONMENT` | Yes | `development` or `production` |
| `DATABASE_URL` | Yes | Database connection string |
| `JWT_SECRET` | Yes | JWT signing key (32+ chars in production) |
| `JWT_EXPIRE_HOURS` | No | Token expiration (default: 24) |
| `ALLOWED_ORIGINS` | No | Allowed CORS origins |
| `LOG_LEVEL` | No | DEBUG, INFO, WARNING, ERROR |
| `OPENAI_API_KEY` | No | OpenAI API key for AI features |

## Installation

### Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
# or: venv\Scripts\activate  # Windows

# Install dependencies
pip install -r requirements.txt

# Initialize database
python -c "import asyncio; from database import init_db; asyncio.run(init_db())"

# Seed initial data (optional)
python seed.py
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Build for production
npm run build
```

## Running the Application

### Development

```bash
# Backend (from backend/)
uvicorn main:app --reload --port 8002

# Frontend (from frontend/)
npm run dev
```

### Production

```bash
# Backend
uvicorn main:app --host 0.0.0.0 --port 8002 --workers 4

# Or with gunicorn
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8002
```

## Nginx Configuration

```nginx
upstream mmpi_backend {
    server 127.0.0.1:8002;
}

server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;

    # Security headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Frontend static files
    root /var/www/mmpi/frontend/dist;
    index index.html;

    # API proxy
    location /api/ {
        proxy_pass http://mmpi_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        client_max_body_size 50M;
    }

    # Frontend routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Static assets caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

## Systemd Service

Create `/etc/systemd/system/mmpi.service`:

```ini
[Unit]
Description=MMPI Assessment Platform
After=network.target postgresql.service

[Service]
User=www-data
Group=www-data
WorkingDirectory=/var/www/mmpi/backend
Environment="PATH=/var/www/mmpi/backend/venv/bin"
EnvironmentFile=/var/www/mmpi/backend/.env
ExecStart=/var/www/mmpi/backend/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8002 --workers 4
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable mmpi
sudo systemctl start mmpi
sudo systemctl status mmpi
```

## Database Management

### PostgreSQL Setup

```sql
-- Create database and user
CREATE USER mmpi_user WITH PASSWORD 'secure_password';
CREATE DATABASE mmpi_db OWNER mmpi_user;
GRANT ALL PRIVILEGES ON DATABASE mmpi_db TO mmpi_user;
```

### Backup Strategy

```bash
# Daily backup script
#!/bin/bash
DATE=$(date +%Y%m%d)
BACKUP_DIR=/var/backups/mmpi

# Database backup
pg_dump -U mmpi_user mmpi_db | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# File uploads backup
tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz /var/www/mmpi/backend/uploads

# Retain last 30 days
find $BACKUP_DIR -name "*.gz" -mtime +30 -delete
```

### Restore Procedure

```bash
# Database restore
gunzip -c db_backup.sql.gz | psql -U mmpi_user mmpi_db

# Files restore
tar -xzf uploads_backup.tar.gz -C /var/www/mmpi/backend/
```

## Monitoring

### Health Check Endpoint

```bash
curl http://localhost:8002/api/health
```

### Log Monitoring

```bash
# View application logs
journalctl -u mmpi -f

# View nginx access logs
tail -f /var/log/nginx/access.log
```

### Recommended Monitoring Tools

- **Metrics:** Prometheus + Grafana
- **Logs:** ELK Stack or Loki
- **Errors:** Sentry
- **Uptime:** UptimeRobot or Pingdom

## SSL Certificate

Using Let's Encrypt:

```bash
sudo certbot --nginx -d your-domain.com
```

Auto-renewal is configured automatically.

## Security Checklist

- [ ] JWT_SECRET is set to a secure random string (32+ chars)
- [ ] Database password is strong and unique
- [ ] HTTPS is enforced
- [ ] Firewall allows only necessary ports (80, 443)
- [ ] File upload directory is not web-accessible
- [ ] Database backups are encrypted
- [ ] Security headers are configured
- [ ] Rate limiting is enabled
- [ ] API documentation is disabled in production

## Troubleshooting

### Application Won't Start

1. Check environment variables: `printenv | grep MMPI`
2. Verify database connection: `psql -U mmpi_user -h localhost mmpi_db`
3. Check logs: `journalctl -u mmpi -n 100`

### Database Connection Issues

1. Verify PostgreSQL is running: `systemctl status postgresql`
2. Check connection string format
3. Verify user permissions

### File Upload Issues

1. Check upload directory permissions: `ls -la uploads/`
2. Verify nginx client_max_body_size
3. Check disk space: `df -h`

## Updates

### Updating the Application

```bash
# Pull latest changes
cd /var/www/mmpi
git pull origin main

# Update backend dependencies
cd backend
source venv/bin/activate
pip install -r requirements.txt

# Rebuild frontend
cd ../frontend
npm install
npm run build

# Restart service
sudo systemctl restart mmpi
```
