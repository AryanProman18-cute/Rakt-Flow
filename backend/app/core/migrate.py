"""Startup migration runner.

The repository ships raw SQL migrations (migrations/*.sql) that used to be
applied manually. Render deploys only ran uvicorn, so a database could lag
behind the models — which made POST /api/v1/donors/me/screenings fail with a
500 ("column ... does not exist"). This runner applies pending migrations in
order at startup, recording each applied file in `schema_migrations`.

Migrations are expected to be idempotent (IF NOT EXISTS / DROP CONSTRAINT IF
EXISTS / CREATE TABLE IF NOT EXISTS) so a partially-migrated database is healed
safely and re-runs are no-ops.
"""

import logging
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("raktflow.migrate")

MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "migrations"


async def apply_migrations(session: AsyncSession) -> None:
    """Apply pending SQL migrations (best-effort; failures are logged, not fatal)."""
    conn = await session.connection()
    raw = (await conn.get_raw_connection()).driver_connection

    try:
        await raw.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations ("
            "filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"
        )
    except Exception as exc:  # pragma: no cover - depends on live DB state
        logger.warning("migrations_init_failed", error=str(exc))
        return

    sql_files = sorted(MIGRATIONS_DIR.glob("*.sql")) if MIGRATIONS_DIR.exists() else []
    if not sql_files:
        logger.info("no_migrations_dir", path=str(MIGRATIONS_DIR))
        return

    for path in sql_files:
        name = path.name
        try:
            applied = await raw.fetchval(
                "SELECT 1 FROM schema_migrations WHERE filename = $1", name
            )
        except Exception as exc:  # pragma: no cover
            logger.warning("migrations_lookup_failed", file=name, error=str(exc))
            continue
        if applied:
            continue
        sql = path.read_text(encoding="utf-8")
        try:
            await raw.execute("BEGIN")
            await raw.execute(sql)
            await raw.execute(
                "INSERT INTO schema_migrations (filename) VALUES ($1)", name
            )
            await raw.execute("COMMIT")
            logger.info("migration_applied", file=name)
        except Exception as exc:  # pragma: no cover - depends on live DB state
            try:
                await raw.execute("ROLLBACK")
            except Exception:  # pragma: no cover
                pass
            logger.error("migration_failed", file=name, error=str(exc))
