"""
db/client.py
------------
Supabase client and triage session persistence.
"""

import logging
import os

from supabase import create_client, Client

logger = logging.getLogger(__name__)

_client: Client | None = None


def get_client() -> Client:
    global _client
    if _client is None:
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SECRET_KEY")
        if not url or not key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SECRET_KEY must be set.")
        _client = create_client(url, key)
    return _client


async def save_triage_session(
    symptoms: str,
    vitals: dict | None,
    report_text: str | None,
    visual_notes: str | None,
    urgency_level: str,
    reasoning: str,
    next_steps: str,
    red_flags: list[str],
    latency_ms: int | None,
) -> None:
    try:
        client = get_client()
        client.table("triage_sessions").insert({
            "symptoms": symptoms,
            "vitals": vitals,
            "report_text": report_text,
            "visual_notes": visual_notes,
            "urgency_level": urgency_level,
            "reasoning": reasoning,
            "next_steps": next_steps,
            "red_flags": red_flags,
            "latency_ms": latency_ms,
        }).execute()
    except Exception as exc:
        logger.error(f"Failed to save triage session to Supabase: {exc}")
