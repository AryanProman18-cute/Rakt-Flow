from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings

settings = get_settings()
url = settings.database_url
if url.startswith("postgres://"):
    url = url.replace("postgres://", "postgresql+asyncpg://", 1)
elif url.startswith("postgresql://") and "+asyncpg" not in url:
    url = url.replace("postgresql://", "postgresql+asyncpg://", 1)

# Use Neon's *pooled* endpoint. asyncpg is a PostgreSQL/TCP driver; it is not combined
# with Neon's separate HTTP driver. Prepared-statement caching is disabled for transaction
# pooler compatibility, while this application pool stays hard-capped at five connections.
engine = create_async_engine(
    url,
    pool_size=settings.max_db_connections,
    max_overflow=0,
    pool_pre_ping=True,
    pool_recycle=300,
    connect_args={"statement_cache_size": 0, "server_settings": {"application_name": "raktflow-api"}},
)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, autoflush=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
