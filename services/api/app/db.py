from supabase import create_client, Client
from app.config import get_settings

_client: Client | None = None
_db_ready: bool = False  # True once we verify tables exist


def get_supabase() -> Client | None:
    """Return Supabase client if configured AND tables are accessible, else None."""
    global _client, _db_ready
    settings = get_settings()

    if not (settings.supabase_url and settings.supabase_service_key):
        return None

    if _client is None:
        try:
            _client = create_client(settings.supabase_url, settings.supabase_service_key)
        except Exception:
            return None

    if not _db_ready:
        try:
            # Quick probe: if projects table exists we're good
            _client.table("projects").select("id").limit(1).execute()
            _db_ready = True
        except Exception:
            # Tables not yet created — caller falls back to in-memory mode
            return None

    return _client
