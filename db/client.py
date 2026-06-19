"""
db/client.py
------------
Supabase client and triage session persistence.
"""

import asyncio
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


def _save_triage_session_sync(
    session_id: str,
    symptoms: str,
    vitals: dict | None,
    report_text: str | None,
    visual_notes: str | None,
    urgency_level: str,
    reasoning: str,
    next_steps: str,
    red_flags: list[str],
    latency_ms: int | None,
    messages: list[dict],
) -> None:
    client = get_client()
    client.table("triage_sessions").insert({
        "id": session_id,
        "symptoms": symptoms,
        "vitals": vitals,
        "report_text": report_text,
        "visual_notes": visual_notes,
        "urgency_level": urgency_level,
        "reasoning": reasoning,
        "next_steps": next_steps,
        "red_flags": red_flags,
        "latency_ms": latency_ms,
        "messages": messages,
    }).execute()


async def save_triage_session(
    session_id: str,
    symptoms: str,
    vitals: dict | None,
    report_text: str | None,
    visual_notes: str | None,
    urgency_level: str,
    reasoning: str,
    next_steps: str,
    red_flags: list[str],
    latency_ms: int | None,
    messages: list[dict],
) -> None:
    try:
        await asyncio.to_thread(
            _save_triage_session_sync,
            session_id, symptoms, vitals, report_text, visual_notes,
            urgency_level, reasoning, next_steps, red_flags, latency_ms, messages,
        )
    except Exception as exc:
        logger.error(f"Failed to save triage session: {exc}")


def _get_session_messages_sync(session_id: str) -> list[dict] | None:
    client = get_client()
    result = (
        client.table("triage_sessions")
        .select("messages")
        .eq("id", session_id)
        .single()
        .execute()
    )
    return result.data["messages"] if result.data else None


async def get_session_messages(session_id: str) -> list[dict] | None:
    try:
        return await asyncio.to_thread(_get_session_messages_sync, session_id)
    except Exception as exc:
        logger.error(f"Failed to load session {session_id}: {exc}")
        return None


def _append_messages_sync(session_id: str, current: list[dict], new_messages: list[dict]) -> None:
    """Synchronous helper — performs the Supabase update.

    NOTE: This uses a read-modify-write pattern, which is subject to a race
    condition if two concurrent requests target the same session_id.  A
    production fix would use a Supabase RPC / database-level array-append
    to guarantee atomicity.
    """
    client = get_client()
    client.table("triage_sessions").update(
        {"messages": current + new_messages}
    ).eq("id", session_id).execute()


async def append_messages(session_id: str, new_messages: list[dict]) -> None:
    try:
        current = await get_session_messages(session_id) or []
        await asyncio.to_thread(_append_messages_sync, session_id, current, new_messages)
    except Exception as exc:
        logger.error(f"Failed to append messages to session {session_id}: {exc}")

