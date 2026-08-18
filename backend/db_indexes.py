"""
Database index definitions and optimization utilities.
Run this module to add missing indexes to the database.
"""
from sqlalchemy import text, Index
from sqlalchemy.ext.asyncio import AsyncSession
from logging_config import get_logger

logger = get_logger("db_indexes")

COMPOSITE_INDEXES = [
    ("ix_answers_session_question", "answers", ["session_id", "question_number"]),
    ("ix_appointments_practitioner_date", "appointments", ["practitioner_id", "date"]),
    ("ix_appointments_patient_date", "appointments", ["patient_id", "date"]),
    ("ix_appointments_status_date", "appointments", ["status", "date"]),
    ("ix_payments_practitioner_status", "payments", ["practitioner_id", "status"]),
    ("ix_payments_patient_created", "payments", ["patient_id", "created_at"]),
    ("ix_clinical_documents_patient_category", "clinical_documents", ["patient_id", "category"]),
    ("ix_therapy_sessions_patient_date", "therapy_sessions", ["patient_id", "session_date"]),
    ("ix_booking_requests_practitioner_status", "booking_requests", ["practitioner_id", "status"]),
    ("ix_notification_logs_practitioner_created", "notification_logs", ["practitioner_id", "created_at"]),
    ("ix_audit_logs_practitioner_action", "audit_logs", ["practitioner_id", "action"]),
]

SINGLE_INDEXES = [
    ("ix_patients_status", "patients", "status"),
    ("ix_appointments_start_time", "appointments", "start_time"),
    ("ix_payments_paid_at", "payments", "paid_at"),
    ("ix_payments_payment_link_token", "payments", "payment_link_token"),
    ("ix_scheduled_reminders_scheduled_for", "scheduled_reminders", "scheduled_for"),
    ("ix_scheduled_reminders_status", "scheduled_reminders", "status"),
    ("ix_internal_notifications_is_read", "internal_notifications", "is_read"),
    ("ix_sessions_patient_id", "sessions", "patient_id"),
]


async def check_index_exists(conn, index_name: str, db_type: str) -> bool:
    """Check if an index exists in the database."""
    try:
        if db_type == "sqlite":
            result = await conn.execute(text(
                f"SELECT name FROM sqlite_master WHERE type='index' AND name='{index_name}'"
            ))
        else:
            result = await conn.execute(text(
                f"SELECT indexname FROM pg_indexes WHERE indexname = '{index_name}'"
            ))
        return result.fetchone() is not None
    except Exception:
        return False


async def create_index_if_not_exists(
    conn,
    index_name: str,
    table_name: str,
    columns: list,
    db_type: str
) -> bool:
    """Create an index if it doesn't exist."""
    try:
        if await check_index_exists(conn, index_name, db_type):
            return False
        
        cols = ", ".join(columns) if isinstance(columns, list) else columns
        await conn.execute(text(
            f"CREATE INDEX IF NOT EXISTS {index_name} ON {table_name} ({cols})"
        ))
        logger.info(f"Created index: {index_name}")
        return True
    except Exception as e:
        logger.warning(f"Failed to create index {index_name}: {e}")
        return False


async def run_index_migrations(conn, db_url: str):
    """Add all missing indexes to the database."""
    db_type = "sqlite" if "sqlite" in db_url.lower() else "postgres"
    created_count = 0
    
    for index_name, table_name, columns in COMPOSITE_INDEXES:
        if await create_index_if_not_exists(conn, index_name, table_name, columns, db_type):
            created_count += 1
    
    for index_name, table_name, column in SINGLE_INDEXES:
        if await create_index_if_not_exists(conn, index_name, table_name, [column], db_type):
            created_count += 1
    
    if created_count > 0:
        logger.info(f"Created {created_count} new indexes")
    
    return created_count


async def analyze_table_statistics(conn, table_name: str, db_type: str):
    """Update table statistics for query optimizer."""
    try:
        if db_type == "sqlite":
            await conn.execute(text(f"ANALYZE {table_name}"))
        else:
            await conn.execute(text(f"ANALYZE {table_name}"))
        logger.debug(f"Analyzed table: {table_name}")
    except Exception as e:
        logger.warning(f"Failed to analyze table {table_name}: {e}")


async def vacuum_database(conn, db_type: str):
    """Run vacuum to reclaim space and optimize database."""
    try:
        if db_type == "sqlite":
            await conn.execute(text("VACUUM"))
        else:
            await conn.execute(text("VACUUM ANALYZE"))
        logger.info("Database vacuum completed")
    except Exception as e:
        logger.warning(f"Failed to vacuum database: {e}")
