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


async def _add_column_if_missing_sqlite(conn, table: str, column: str, ddl: str):
    result = await conn.execute(text(f"PRAGMA table_info({table})"))
    columns = [row[1] for row in result.fetchall()]
    if column not in columns:
        await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {ddl}"))


async def _add_column_if_missing_postgres(conn, table: str, column: str, ddl: str):
    result = await conn.execute(text("""
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = :table AND column_name = :column
    """), {"table": table, "column": column})
    if not result.fetchone():
        await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {ddl}"))


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
        await _add_column_if_missing_sqlite(conn, "clinic_settings", "instagram_handle", "instagram_handle VARCHAR")
        await _add_column_if_missing_sqlite(conn, "practitioner_profiles", "instagram_handle", "instagram_handle VARCHAR")
        await _add_column_if_missing_sqlite(conn, "intake_submissions", "phone", "phone VARCHAR")
        await _add_column_if_missing_sqlite(conn, "therapy_sessions", "input_type", "input_type VARCHAR DEFAULT 'audio'")
        await _add_column_if_missing_sqlite(conn, "clinical_documents", "extracted_text", "extracted_text TEXT")
        await _add_column_if_missing_sqlite(conn, "sessions", "patient_id", "patient_id VARCHAR")
        await _add_column_if_missing_sqlite(conn, "receipts", "patient_dob", "patient_dob DATE")
        await _add_column_if_missing_sqlite(conn, "practitioner_profiles", "signature_image_path", "signature_image_path VARCHAR")
        await _add_column_if_missing_sqlite(conn, "practitioner_profiles", "stamp_image_path", "stamp_image_path VARCHAR")
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
        await _add_column_if_missing_postgres(conn, "clinic_settings", "instagram_handle", "instagram_handle VARCHAR")
        await _add_column_if_missing_postgres(conn, "practitioner_profiles", "instagram_handle", "instagram_handle VARCHAR")
        await _add_column_if_missing_postgres(conn, "intake_submissions", "phone", "phone VARCHAR")
        await _add_column_if_missing_postgres(conn, "therapy_sessions", "input_type", "input_type VARCHAR DEFAULT 'audio'")
        await _add_column_if_missing_postgres(conn, "clinical_documents", "extracted_text", "extracted_text TEXT")
        await _add_column_if_missing_postgres(conn, "sessions", "patient_id", "patient_id VARCHAR")
        await _add_column_if_missing_postgres(conn, "receipts", "patient_dob", "patient_dob DATE")
        await _add_column_if_missing_postgres(conn, "practitioner_profiles", "signature_image_path", "signature_image_path VARCHAR")
        await _add_column_if_missing_postgres(conn, "practitioner_profiles", "stamp_image_path", "stamp_image_path VARCHAR")
    except Exception as e:
        print(f"Migration warning: {e}")
        pass
