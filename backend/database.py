import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./mmpi.db")

# Fly's internal Postgres (reached over its private .flycast network) doesn't
# terminate TLS on that path — asyncpg's default SSL negotiation against it
# gets reset mid-handshake. Force plaintext only for that internal address;
# other Postgres providers (which do need TLS) keep asyncpg's normal default.
_connect_args = {}
if "postgresql" in DATABASE_URL and ".flycast" in DATABASE_URL:
    _connect_args["ssl"] = False

engine = create_async_engine(DATABASE_URL, echo=False, connect_args=_connect_args)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session() as session:
        yield session


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
        await _run_migrations(conn)
        
        try:
            from db_indexes import run_index_migrations
            await run_index_migrations(conn, DATABASE_URL)
        except Exception as e:
            print(f"Index migration warning: {e}")


async def _run_migrations(conn):
    """Add missing columns to existing tables."""
    db_url = DATABASE_URL.lower()
    
    if 'sqlite' in db_url:
        await _run_sqlite_migrations(conn)
    else:
        await _run_postgres_migrations(conn)


async def _add_column_if_missing_sqlite(conn, table: str, column: str, ddl: str) -> bool:
    """Returns True if the column was just added (False if it already existed) —
    callers use this to gate one-time backfills that should only run once."""
    result = await conn.execute(text(f"PRAGMA table_info({table})"))
    columns = [row[1] for row in result.fetchall()]
    if column not in columns:
        await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {ddl}"))
        return True
    return False


async def _add_column_if_missing_postgres(conn, table: str, column: str, ddl: str) -> bool:
    result = await conn.execute(text("""
        SELECT column_name FROM information_schema.columns
        WHERE table_name = :table AND column_name = :column
    """), {"table": table, "column": column})
    if not result.fetchone():
        await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {ddl}"))
        return True
    return False


async def _run_sqlite_migrations(conn):
    """SQLite-specific migrations."""
    try:
        result = await conn.execute(text("PRAGMA table_info(practitioners)"))
        columns = [row[1] for row in result.fetchall()]
        
        if 'must_change_password' not in columns:
            await conn.execute(text(
                "ALTER TABLE practitioners ADD COLUMN must_change_password BOOLEAN DEFAULT 1"
            ))
            await conn.execute(text(
                "UPDATE practitioners SET must_change_password = 0 WHERE role = 'owner'"
            ))
        
        if 'created_by' not in columns:
            await conn.execute(text(
                "ALTER TABLE practitioners ADD COLUMN created_by VARCHAR"
            ))
        
        if 'updated_at' not in columns:
            await conn.execute(text(
                "ALTER TABLE practitioners ADD COLUMN updated_at DATETIME"
            ))

        if 'profile_setup_complete' not in columns:
            await conn.execute(text(
                "ALTER TABLE practitioners ADD COLUMN profile_setup_complete BOOLEAN DEFAULT 0"
            ))
            # Existing practitioners predate this feature — don't force them into setup
            await conn.execute(text(
                "UPDATE practitioners SET profile_setup_complete = 1"
            ))

        await _add_column_if_missing_sqlite(conn, "practitioners", "avatar_id", "avatar_id VARCHAR")
        await _add_column_if_missing_sqlite(conn, "practitioners", "avatar_url", "avatar_url VARCHAR")
        await _add_column_if_missing_sqlite(conn, "patients", "avatar_id", "avatar_id VARCHAR")
        await _add_column_if_missing_sqlite(conn, "patients", "avatar_url", "avatar_url VARCHAR")
        await _add_column_if_missing_sqlite(conn, "patients", "address", "address TEXT")
        await _add_column_if_missing_sqlite(conn, "clinic_settings", "instagram_handle", "instagram_handle VARCHAR")
        await _add_column_if_missing_sqlite(conn, "practitioner_profiles", "instagram_handle", "instagram_handle VARCHAR")
        await _add_column_if_missing_sqlite(conn, "intake_submissions", "phone", "phone VARCHAR")
        await _add_column_if_missing_sqlite(conn, "therapy_sessions", "input_type", "input_type VARCHAR DEFAULT 'audio'")
        await _add_column_if_missing_sqlite(conn, "clinical_documents", "extracted_text", "extracted_text TEXT")
        await _add_column_if_missing_sqlite(conn, "sessions", "patient_id", "patient_id VARCHAR")
        await _add_column_if_missing_sqlite(conn, "receipts", "patient_dob", "patient_dob DATE")
        await _add_column_if_missing_sqlite(conn, "receipts", "patient_address", "patient_address TEXT")
        await _add_column_if_missing_sqlite(conn, "practitioner_profiles", "signature_image_path", "signature_image_path VARCHAR")
        await _add_column_if_missing_sqlite(conn, "practitioner_profiles", "stamp_image_path", "stamp_image_path VARCHAR")
        await _add_column_if_missing_sqlite(conn, "appointments", "google_event_id", "google_event_id VARCHAR")
        await _add_column_if_missing_sqlite(conn, "whatsapp_configs", "last_test_at", "last_test_at DATETIME")
        await _add_column_if_missing_sqlite(conn, "whatsapp_configs", "last_test_status", "last_test_status VARCHAR")
        await _add_column_if_missing_sqlite(conn, "whatsapp_configs", "last_test_error", "last_test_error VARCHAR")
        await _add_column_if_missing_sqlite(conn, "clinical_intelligence", "recent_changes", "recent_changes JSON")

        if 'email_verified' not in columns:
            await conn.execute(text(
                "ALTER TABLE practitioners ADD COLUMN email_verified BOOLEAN DEFAULT 0"
            ))
            # Existing accounts (admin-created, or predating this feature) never went
            # through email verification — don't lock them out of login.
            await conn.execute(text(
                "UPDATE practitioners SET email_verified = 1"
            ))

        await _add_column_if_missing_sqlite(conn, "practitioners", "email_verification_token", "email_verification_token VARCHAR")
        await _add_column_if_missing_sqlite(conn, "practitioners", "email_verification_sent_at", "email_verification_sent_at DATETIME")
        await _add_column_if_missing_sqlite(conn, "practitioners", "signup_source", "signup_source VARCHAR")
        added_receipt_id = await _add_column_if_missing_sqlite(conn, "payments", "receipt_id", "receipt_id VARCHAR")
        if added_receipt_id:
            # One-time backfill: every existing Receipt was still strictly
            # 1:1 with its Payment before bulk invoicing existed, so this is
            # exactly the payments.receipt_id each one should have always had —
            # without it, every already-invoiced paid session would look
            # un-invoiced to the new lock check and could get double-invoiced.
            await conn.execute(text("""
                UPDATE payments
                SET receipt_id = (SELECT id FROM receipts WHERE receipts.payment_id = payments.id)
                WHERE receipt_id IS NULL
                AND id IN (SELECT payment_id FROM receipts)
            """))
    except Exception:
        pass


async def _run_postgres_migrations(conn):
    """PostgreSQL-specific migrations."""
    try:
        # Check if must_change_password column exists
        result = await conn.execute(text("""
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'practitioners' AND column_name = 'must_change_password'
        """))
        if not result.fetchone():
            await conn.execute(text(
                "ALTER TABLE practitioners ADD COLUMN must_change_password BOOLEAN DEFAULT TRUE"
            ))
            await conn.execute(text(
                "UPDATE practitioners SET must_change_password = FALSE WHERE role = 'owner'"
            ))
        
        # Check if created_by column exists
        result = await conn.execute(text("""
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'practitioners' AND column_name = 'created_by'
        """))
        if not result.fetchone():
            await conn.execute(text(
                "ALTER TABLE practitioners ADD COLUMN created_by VARCHAR"
            ))
        
        # Check if updated_at column exists
        result = await conn.execute(text("""
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'practitioners' AND column_name = 'updated_at'
        """))
        if not result.fetchone():
            await conn.execute(text(
                "ALTER TABLE practitioners ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE"
            ))

        # Check if profile_setup_complete column exists
        result = await conn.execute(text("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'practitioners' AND column_name = 'profile_setup_complete'
        """))
        if not result.fetchone():
            await conn.execute(text(
                "ALTER TABLE practitioners ADD COLUMN profile_setup_complete BOOLEAN DEFAULT FALSE"
            ))
            # Existing practitioners predate this feature — don't force them into setup
            await conn.execute(text(
                "UPDATE practitioners SET profile_setup_complete = TRUE"
            ))

        await _add_column_if_missing_postgres(conn, "practitioners", "avatar_id", "avatar_id VARCHAR")
        await _add_column_if_missing_postgres(conn, "practitioners", "avatar_url", "avatar_url VARCHAR")
        await _add_column_if_missing_postgres(conn, "patients", "avatar_id", "avatar_id VARCHAR")
        await _add_column_if_missing_postgres(conn, "patients", "avatar_url", "avatar_url VARCHAR")
        await _add_column_if_missing_postgres(conn, "patients", "address", "address TEXT")
        await _add_column_if_missing_postgres(conn, "clinic_settings", "instagram_handle", "instagram_handle VARCHAR")
        await _add_column_if_missing_postgres(conn, "practitioner_profiles", "instagram_handle", "instagram_handle VARCHAR")
        await _add_column_if_missing_postgres(conn, "intake_submissions", "phone", "phone VARCHAR")
        await _add_column_if_missing_postgres(conn, "therapy_sessions", "input_type", "input_type VARCHAR DEFAULT 'audio'")
        await _add_column_if_missing_postgres(conn, "clinical_documents", "extracted_text", "extracted_text TEXT")
        await _add_column_if_missing_postgres(conn, "sessions", "patient_id", "patient_id VARCHAR")
        await _add_column_if_missing_postgres(conn, "receipts", "patient_dob", "patient_dob DATE")
        await _add_column_if_missing_postgres(conn, "receipts", "patient_address", "patient_address TEXT")
        await _add_column_if_missing_postgres(conn, "practitioner_profiles", "signature_image_path", "signature_image_path VARCHAR")
        await _add_column_if_missing_postgres(conn, "practitioner_profiles", "stamp_image_path", "stamp_image_path VARCHAR")
        await _add_column_if_missing_postgres(conn, "appointments", "google_event_id", "google_event_id VARCHAR")
        await _add_column_if_missing_postgres(conn, "whatsapp_configs", "last_test_at", "last_test_at TIMESTAMP WITH TIME ZONE")
        await _add_column_if_missing_postgres(conn, "whatsapp_configs", "last_test_status", "last_test_status VARCHAR")
        await _add_column_if_missing_postgres(conn, "whatsapp_configs", "last_test_error", "last_test_error VARCHAR")
        await _add_column_if_missing_postgres(conn, "clinical_intelligence", "recent_changes", "recent_changes JSON")

        # Check if email_verified column exists
        result = await conn.execute(text("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'practitioners' AND column_name = 'email_verified'
        """))
        if not result.fetchone():
            await conn.execute(text(
                "ALTER TABLE practitioners ADD COLUMN email_verified BOOLEAN DEFAULT FALSE"
            ))
            # Existing accounts (admin-created, or predating this feature) never went
            # through email verification — don't lock them out of login.
            await conn.execute(text(
                "UPDATE practitioners SET email_verified = TRUE"
            ))

        await _add_column_if_missing_postgres(conn, "practitioners", "email_verification_token", "email_verification_token VARCHAR")
        await _add_column_if_missing_postgres(conn, "practitioners", "email_verification_sent_at", "email_verification_sent_at TIMESTAMP WITH TIME ZONE")
        await _add_column_if_missing_postgres(conn, "practitioners", "signup_source", "signup_source VARCHAR")
        added_receipt_id = await _add_column_if_missing_postgres(conn, "payments", "receipt_id", "receipt_id VARCHAR")
        if added_receipt_id:
            # See matching comment in _run_sqlite_migrations.
            await conn.execute(text("""
                UPDATE payments
                SET receipt_id = (SELECT id FROM receipts WHERE receipts.payment_id = payments.id)
                WHERE receipt_id IS NULL
                AND id IN (SELECT payment_id FROM receipts)
            """))
    except Exception as e:
        print(f"Migration warning: {e}")
        pass
