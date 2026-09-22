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
        await _add_column_if_missing_sqlite(conn, "practitioner_profiles", "profession", "profession VARCHAR")
        await _add_column_if_missing_sqlite(conn, "practitioner_profiles", "location_short", "location_short VARCHAR")

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

        try:
            await _run_scheduling_merge_sqlite(conn)
            await _run_email_backfill_sqlite(conn)
            await _run_messaging_preferences_seed_sqlite(conn)
        except Exception as e:
            # Not part of the outer bare `except: pass` on purpose — if this
            # fails, practitioner_availability may be left without the two
            # new columns while models.py still declares them, which 500s
            # every /api/availability call and the public booking path. That
            # failure needs to be visible, not silent.
            import traceback
            print(f"Settings migration (scheduling merge / email backfill) failed: {e}")
            traceback.print_exc()
    except Exception:
        pass


async def _run_scheduling_merge_sqlite(conn):
    """Settings rebuild: PractitionerAvailability becomes the one scheduling
    record booking/Calendar/Settings all read. Moves the booking-window fields
    over from the (global) AppointmentConfiguration singleton, and gives every
    active practitioner missing an availability row one — seeded from that
    singleton, since that's the values the booking engine already reads today
    for practitioners it does have a row for. See settings-phase1-plan.md.
    """
    added_notice = await _add_column_if_missing_sqlite(
        conn, "practitioner_availability", "min_booking_notice_hours",
        "min_booking_notice_hours INTEGER DEFAULT 24",
    )
    added_advance = await _add_column_if_missing_sqlite(
        conn, "practitioner_availability", "max_advance_booking_days",
        "max_advance_booking_days INTEGER DEFAULT 30",
    )
    if added_notice or added_advance:
        appt_config = (await conn.execute(text(
            "SELECT min_booking_notice_hours, max_advance_booking_days FROM appointment_configurations LIMIT 1"
        ))).fetchone()
        if appt_config:
            await conn.execute(text(
                "UPDATE practitioner_availability SET min_booking_notice_hours = :notice, max_advance_booking_days = :advance"
            ), {"notice": appt_config[0], "advance": appt_config[1]})

    # Every practitioner without an availability row falls back to hardcoded
    # defaults today (see booking_service.get_available_slots) rather than
    # reading anything practitioner-specific. Give each one a real row, seeded
    # from the appointment_configurations singleton where present, so the
    # merged record actually has a value to read — public booking cannot
    # create this row lazily (read-only path), so it has to exist by now.
    missing = (await conn.execute(text("""
        SELECT p.id FROM practitioners p
        LEFT JOIN practitioner_availability pa ON pa.practitioner_id = p.id
        WHERE pa.id IS NULL AND p.is_active = 1
    """))).fetchall()
    if missing:
        appt_config = (await conn.execute(text(
            "SELECT default_working_days, default_work_start_time, default_work_end_time, "
            "default_break_start_time, default_break_end_time, default_duration_minutes, "
            "buffer_time_minutes, min_booking_notice_hours, max_advance_booking_days "
            "FROM appointment_configurations LIMIT 1"
        ))).fetchone()
        import json as _json
        for (prac_id,) in missing:
            if appt_config:
                working_days, work_start, work_end, break_start, break_end, duration, buffer_min, notice, advance = appt_config
            else:
                working_days, work_start, work_end, break_start, break_end, duration, buffer_min, notice, advance = (
                    "[0, 1, 2, 3, 4]", "09:00", "18:00", "13:00", "14:00", 50, 10, 24, 30,
                )
            print(f"Settings migration: creating practitioner_availability for {prac_id}, seeded from appointment_configurations")
            await conn.execute(text("""
                INSERT INTO practitioner_availability
                    (id, practitioner_id, working_days, work_start_time, work_end_time,
                     break_start_time, break_end_time, default_session_duration, buffer_minutes,
                     timezone, min_booking_notice_hours, max_advance_booking_days, created_at, updated_at)
                VALUES
                    (:id, :prac_id, :working_days, :work_start, :work_end,
                     :break_start, :break_end, :duration, :buffer_min,
                     'Asia/Kolkata', :notice, :advance, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """), {
                "id": __import__("uuid").uuid4().hex, "prac_id": prac_id,
                "working_days": working_days if isinstance(working_days, str) else _json.dumps(working_days),
                "work_start": work_start, "work_end": work_end,
                "break_start": break_start, "break_end": break_end,
                "duration": duration, "buffer_min": buffer_min,
                "notice": notice, "advance": advance,
            })


async def _run_email_backfill_sqlite(conn):
    """The toggle-does-nothing bug: EmailChannel sends using env SMTP_EMAIL/
    SMTP_PASSWORD regardless of EmailConfiguration.is_enabled. Fix is to make
    is_enabled authoritative going forward — but flipping it on a DB row with
    is_enabled=0 today would silently stop mail on a live practice if done
    carelessly. This only ever flips is_enabled True, once, and only when env
    credentials already exist (so sending behavior is unchanged at the moment
    this runs); it never copies the password into the DB. See
    settings-phase1-plan.md amendment 2.
    """
    import os
    if not (os.getenv("SMTP_EMAIL") and os.getenv("SMTP_PASSWORD")):
        return
    row = (await conn.execute(text(
        "SELECT id, is_enabled FROM email_configurations LIMIT 1"
    ))).fetchone()
    if row and not row[1]:
        await conn.execute(text(
            "UPDATE email_configurations SET is_enabled = 1 WHERE id = :id"
        ), {"id": row[0]})
        print("Settings migration: enabled email_configurations.is_enabled (env SMTP credentials already present)")
    elif not row:
        await conn.execute(text(
            "INSERT INTO email_configurations (id, provider, is_enabled, smtp_use_tls, created_at, updated_at) "
            "VALUES (:id, 'smtp', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
        ), {"id": __import__("uuid").uuid4().hex})
        print("Settings migration: created email_configurations row with is_enabled=1 (env SMTP credentials present)")


async def _run_messaging_preferences_seed_sqlite(conn):
    """Seed the messaging_preferences singleton (if it doesn't exist yet) from
    the *current* email/WhatsApp channel enable flags, per spec ("Seed each
    event from the current channel enable flags"). Deliberately runs here,
    after _run_email_backfill_sqlite in the same migration pass, so
    email_configurations.is_enabled is already resolved before this reads it
    — settings_service.get_messaging_preferences() has an equivalent lazy
    fallback for environments that skip migrations entirely, but the normal
    path is this one, which removes any ordering race between the two.
    """
    existing = (await conn.execute(text("SELECT id FROM messaging_preferences LIMIT 1"))).fetchone()
    if existing:
        return
    email_row = (await conn.execute(text("SELECT is_enabled FROM email_configurations LIMIT 1"))).fetchone()
    email_enabled = 1 if (email_row and email_row[0]) else 0
    whatsapp_row = (await conn.execute(text("SELECT is_enabled FROM whatsapp_configs LIMIT 1"))).fetchone()
    whatsapp_enabled = 1 if (whatsapp_row and whatsapp_row[0]) else 0
    await conn.execute(text("""
        INSERT INTO messaging_preferences (
            id, session_booked_email, session_booked_whatsapp,
            reminder_email, reminder_whatsapp, reminder_offset_minutes,
            session_rescheduled_email, session_rescheduled_whatsapp,
            session_cancelled_email, session_cancelled_whatsapp,
            payment_request_email, payment_request_whatsapp,
            payment_received_email, payment_received_whatsapp,
            created_at, updated_at
        ) VALUES (
            :id, :email, :wa,
            :email, :wa, 1440,
            :email, :wa,
            :email, :wa,
            :email, :wa,
            :email, :wa,
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
    """), {"id": __import__("uuid").uuid4().hex, "email": email_enabled, "wa": whatsapp_enabled})
    print(f"Settings migration: seeded messaging_preferences (email={bool(email_enabled)}, whatsapp={bool(whatsapp_enabled)})")


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
        await _add_column_if_missing_postgres(conn, "practitioner_profiles", "profession", "profession VARCHAR")
        await _add_column_if_missing_postgres(conn, "practitioner_profiles", "location_short", "location_short VARCHAR")

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

        try:
            await _run_scheduling_merge_postgres(conn)
            await _run_email_backfill_postgres(conn)
            await _run_messaging_preferences_seed_postgres(conn)
        except Exception as e:
            # Same rationale as the SQLite branch: if this fails,
            # practitioner_availability may be left without the two new
            # columns while models.py still declares them, which 500s every
            # /api/availability call and the public booking path. Isolated
            # from the rest of this function's migrations (which already
            # succeeded by this point) so the failure is loud and specific
            # rather than folded into the generic "Migration warning" below.
            import traceback
            print(f"Settings migration (scheduling merge / email backfill) failed: {e}")
            traceback.print_exc()
    except Exception as e:
        print(f"Migration warning: {e}")


async def _run_scheduling_merge_postgres(conn):
    """See _run_scheduling_merge_sqlite — same migration, Postgres dialect."""
    added_notice = await _add_column_if_missing_postgres(
        conn, "practitioner_availability", "min_booking_notice_hours",
        "min_booking_notice_hours INTEGER DEFAULT 24",
    )
    added_advance = await _add_column_if_missing_postgres(
        conn, "practitioner_availability", "max_advance_booking_days",
        "max_advance_booking_days INTEGER DEFAULT 30",
    )
    if added_notice or added_advance:
        appt_config = (await conn.execute(text(
            "SELECT min_booking_notice_hours, max_advance_booking_days FROM appointment_configurations LIMIT 1"
        ))).fetchone()
        if appt_config:
            await conn.execute(text(
                "UPDATE practitioner_availability SET min_booking_notice_hours = :notice, max_advance_booking_days = :advance"
            ), {"notice": appt_config[0], "advance": appt_config[1]})

    missing = (await conn.execute(text("""
        SELECT p.id FROM practitioners p
        LEFT JOIN practitioner_availability pa ON pa.practitioner_id = p.id
        WHERE pa.id IS NULL AND p.is_active = TRUE
    """))).fetchall()
    if missing:
        appt_config = (await conn.execute(text(
            "SELECT default_working_days, default_work_start_time, default_work_end_time, "
            "default_break_start_time, default_break_end_time, default_duration_minutes, "
            "buffer_time_minutes, min_booking_notice_hours, max_advance_booking_days "
            "FROM appointment_configurations LIMIT 1"
        ))).fetchone()
        import json as _json
        for (prac_id,) in missing:
            if appt_config:
                working_days, work_start, work_end, break_start, break_end, duration, buffer_min, notice, advance = appt_config
            else:
                working_days, work_start, work_end, break_start, break_end, duration, buffer_min, notice, advance = (
                    [0, 1, 2, 3, 4], "09:00", "18:00", "13:00", "14:00", 50, 10, 24, 30,
                )
            print(f"Settings migration: creating practitioner_availability for {prac_id}, seeded from appointment_configurations")
            await conn.execute(text("""
                INSERT INTO practitioner_availability
                    (id, practitioner_id, working_days, work_start_time, work_end_time,
                     break_start_time, break_end_time, default_session_duration, buffer_minutes,
                     timezone, min_booking_notice_hours, max_advance_booking_days, created_at, updated_at)
                VALUES
                    (:id, :prac_id, CAST(:working_days AS JSON), :work_start, :work_end,
                     :break_start, :break_end, :duration, :buffer_min,
                     'Asia/Kolkata', :notice, :advance, now(), now())
            """), {
                "id": __import__("uuid").uuid4().hex, "prac_id": prac_id,
                "working_days": _json.dumps(working_days) if not isinstance(working_days, str) else working_days,
                "work_start": work_start, "work_end": work_end,
                "break_start": break_start, "break_end": break_end,
                "duration": duration, "buffer_min": buffer_min,
                "notice": notice, "advance": advance,
            })


async def _run_email_backfill_postgres(conn):
    """See _run_email_backfill_sqlite — same migration, Postgres dialect."""
    import os
    if not (os.getenv("SMTP_EMAIL") and os.getenv("SMTP_PASSWORD")):
        return
    row = (await conn.execute(text(
        "SELECT id, is_enabled FROM email_configurations LIMIT 1"
    ))).fetchone()
    if row and not row[1]:
        await conn.execute(text(
            "UPDATE email_configurations SET is_enabled = TRUE WHERE id = :id"
        ), {"id": row[0]})
        print("Settings migration: enabled email_configurations.is_enabled (env SMTP credentials already present)")
    elif not row:
        await conn.execute(text(
            "INSERT INTO email_configurations (id, provider, is_enabled, smtp_use_tls, created_at, updated_at) "
            "VALUES (:id, 'smtp', TRUE, TRUE, now(), now())"
        ), {"id": __import__("uuid").uuid4().hex})
        print("Settings migration: created email_configurations row with is_enabled=TRUE (env SMTP credentials present)")
        pass


async def _run_messaging_preferences_seed_postgres(conn):
    """See _run_messaging_preferences_seed_sqlite — same migration, Postgres dialect."""
    existing = (await conn.execute(text("SELECT id FROM messaging_preferences LIMIT 1"))).fetchone()
    if existing:
        return
    email_row = (await conn.execute(text("SELECT is_enabled FROM email_configurations LIMIT 1"))).fetchone()
    email_enabled = bool(email_row and email_row[0])
    whatsapp_row = (await conn.execute(text("SELECT is_enabled FROM whatsapp_configs LIMIT 1"))).fetchone()
    whatsapp_enabled = bool(whatsapp_row and whatsapp_row[0])
    await conn.execute(text("""
        INSERT INTO messaging_preferences (
            id, session_booked_email, session_booked_whatsapp,
            reminder_email, reminder_whatsapp, reminder_offset_minutes,
            session_rescheduled_email, session_rescheduled_whatsapp,
            session_cancelled_email, session_cancelled_whatsapp,
            payment_request_email, payment_request_whatsapp,
            payment_received_email, payment_received_whatsapp,
            created_at, updated_at
        ) VALUES (
            :id, :email, :wa,
            :email, :wa, 1440,
            :email, :wa,
            :email, :wa,
            :email, :wa,
            :email, :wa,
            now(), now()
        )
    """), {"id": __import__("uuid").uuid4().hex, "email": email_enabled, "wa": whatsapp_enabled})
    print(f"Settings migration: seeded messaging_preferences (email={email_enabled}, whatsapp={whatsapp_enabled})")
