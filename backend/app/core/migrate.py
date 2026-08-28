"""Startup migration runner.

The repository ships raw SQL migrations. Render only ran uvicorn and never
applied them, so a database could lag behind the models — which made
POST /api/v1/donors/me/screenings fail with a 500 ("column does not exist").
This runner applies any pending migrations in order at startup and records
each applied file in `schema_migrations`.

Design notes:
- Runs against a raw asyncpg connection; no ORM session is involved.
- SQL files are split into individual statements because asyncpg cannot
  execute multi-statement strings. Dollar-quoted blocks (plpgsql function
  bodies) and ``--`` line comments are respected while splitting.
- File-level BEGIN;/COMMIT; lines are removed; each file executes inside one
  explicit transaction managed here (works through Neon's pooled endpoint).
- 001_initial.sql is pure CREATE TABLE DDL. If the `screenings` table already
  exists the migration is presumed applied and recorded without re-running,
  so a pre-existing database is never told to re-create its tables.
- Migrations are idempotent (IF NOT EXISTS / DROP CONSTRAINT IF EXISTS), so a
  partially migrated database heals safely and re-runs are no-ops.
- A failing migration is logged and skipped (best effort); the API still
  starts, and the later idempotent migrations (004/005/006) heal the schema.
"""

import re
from pathlib import Path

import structlog
from sqlalchemy.ext.asyncio import AsyncConnection

logger = structlog.get_logger()

# backend/app/core/migrate.py -> backend/app/migrations (copied into the image
# by `COPY app ./app`; the Docker build context is ./backend).
MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"

_DQ_RE = re.compile(r"\$[A-Za-z_0-9]*\$")


def split_statements(sql: str) -> list[str]:
    """Split a SQL file into executable statements.

    Handles ``--`` line comments, dollar-quoted bodies (``$$``/``$tag$``), and
    preserves semicolons inside dollar-quoted plpgsql blocks.
    """
    out: list[str] = []
    current: list[str] = []
    i, n = 0, len(sql)
    in_dq = False
    dq_tag: str | None = None
    while i < n:
        c = sql[i]
        if not in_dq and c == "-" and i + 1 < n and sql[i + 1] == "-":
            while i < n and sql[i] != "\n":
                i += 1
            continue
        if c == "$" and not in_dq:
            m = _DQ_RE.match(sql, i)
            if m:
                tag = m.group(0)
                if not in_dq:
                    in_dq, dq_tag = True, tag
                elif dq_tag is not None and tag == dq_tag:
                    in_dq, dq_tag = False, None
                current.append(tag)
                i += len(tag)
                continue
        if c == "$" and in_dq:
            m = _DQ_RE.match(sql, i)
            if m and dq_tag is not None and m.group(0) == dq_tag:
                current.append(m.group(0))
                i += len(m.group(0))
                in_dq, dq_tag = False, None
                continue
        if c == ";" and not in_dq:
            stmt = "".join(current).strip()
            if stmt:
                out.append(stmt)
            current = []
            i += 1
            continue
        current.append(c)
        i += 1
    tail = "".join(current).strip()
    if tail:
        out.append(tail)
    return out


async def apply_migrations(conn: AsyncConnection) -> None:
    """Apply pending SQL migrations (best-effort; failures are logged, not fatal)."""
    raw = (await conn.get_raw_connection()).driver_connection

    try:
        await raw.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations ("
            "filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"
        )
    except Exception as exc:  # pragma: no cover - depends on live DB state
        logger.warning("migrations_init_failed", detail=str(exc))
        return

    try:
        screenings_exists = await raw.fetchval(
            "SELECT to_regclass('public.screenings') IS NOT NULL"
        )
    except Exception as exc:  # pragma: no cover - depends on live DB state
        logger.warning("migrations_probe_failed", detail=str(exc))
        screenings_exists = False

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
        except Exception as exc:  # pragma: no cover - depends on live DB state
            logger.warning("migrations_lookup_failed", migration=name, detail=str(exc))
            continue
        if applied:
            continue

        if name == "001_initial.sql" and screenings_exists:
            # Pre-existing database: 001 (pure CREATE TABLEs) was clearly
            # applied; record it instead of replaying DDL that would fail.
            try:
                await raw.execute(
                    "INSERT INTO schema_migrations (filename) VALUES ($1)", name
                )
                logger.info("migration_presumed_applied", migration=name)
                continue
            except Exception as exc:  # pragma: no cover
                logger.warning("migrations_record_failed", migration=name, detail=str(exc))
                continue

        sql = path.read_text(encoding="utf-8")
        statements = [
            s for s in split_statements(sql) if s.upper() not in {"BEGIN", "COMMIT"}
        ]
        try:
            await raw.execute("BEGIN")
            for stmt in statements:
                await raw.execute(stmt)
            await raw.execute(
                "INSERT INTO schema_migrations (filename) VALUES ($1)", name
            )
            await raw.execute("COMMIT")
            logger.info("migration_applied", migration=name)
        except Exception as exc:  # pragma: no cover - depends on live DB state
            try:
                await raw.execute("ROLLBACK")
            except Exception:  # pragma: no cover
                pass
            logger.error("migration_failed", migration=name, detail=str(exc))
