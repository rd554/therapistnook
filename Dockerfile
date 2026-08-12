# Build context is the repo root (not backend/), because scoring.py resolves
# scoring_key.json and code_type_interpretations.json relative to backend/..
FROM python:3.11-slim

WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ backend/
COPY scoring_key.json code_type_interpretations.json ./

# The T-score .xlsx workbooks are deliberately NOT copied into the image —
# they're copyrighted and gitignored. In production they're read from a
# mounted volume via the SCORING_DATA_DIR env var (see scoring.py and
# /api/admin/scoring-data in main.py). In local dev without SCORING_DATA_DIR
# set, scoring.py falls back to looking for them at the repo root directly.

WORKDIR /app/backend
ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
