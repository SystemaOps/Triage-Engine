"""
triage/triage_chain.py
----------------------
Core triage logic.

Flow:
  1.  Build a textual summary of the patient input (symptoms + vitals + notes).
  2.  Retrieve the top-K relevant clinical guidelines from the FAISS index.
  3.  Inject retrieved context + patient summary into a structured prompt.
  4.  Call the Claude LLM and parse the JSON response.
  5.  Return a validated TriageResult.
"""

import asyncio
import json
import logging
import os
import re
from typing import Optional

from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

# ── OpenRouter client ──────────────────────────────────────────────────────────
_client = AsyncOpenAI(
    api_key=os.environ.get("OPENROUTER_API_KEY"),
    base_url="https://openrouter.ai/api/v1",
)
MODEL = os.environ.get("LLM_MODEL", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free")

# ── Urgency levels ─────────────────────────────────────────────────────────────
URGENCY_LEVELS = ["self_care", "doctor_consultation", "urgent_care", "emergency_referral"]

# ── Chat system prompt ─────────────────────────────────────────────────────────
CHAT_SYSTEM_PROMPT = """You are a medical triage assistant continuing a conversation with a patient.

You have already performed an initial triage assessment earlier in this conversation.
The patient may ask follow-up questions, provide additional symptoms, or request clarification.

RULES:
- Answer clearly and compassionately.
- If the patient reports new or worsening symptoms, reassess urgency and say so explicitly.
- Never provide a diagnosis. Always remind the patient to consult a licensed medical professional.
- If at any point the situation sounds life-threatening, immediately tell them to call 911/999.
- Keep responses concise and easy to understand — avoid medical jargon where possible.
"""

# ── Prompts ────────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are a medical triage assistant embedded in a healthcare support platform.

IMPORTANT DISCLAIMERS YOU MUST ALWAYS FOLLOW:
- You are NOT a doctor and NOT providing a medical diagnosis.
- Your role is to assess urgency level to help patients understand whether they need immediate care.
- Always recommend consulting a licensed medical professional for any health concern.
- In doubt, escalate — patient safety is the priority.

YOUR TASK:
Given a patient's symptoms, vitals, and any additional clinical notes, plus relevant clinical triage
guidelines retrieved from a medical knowledge base, output a structured triage decision.

OUTPUT FORMAT — you MUST respond with ONLY a valid JSON object, no markdown fences, no extra text:
{
  "urgency_level": "<one of: self_care | doctor_consultation | urgent_care | emergency_referral>",
  "reasoning": "<2-3 sentence clinical reasoning explaining why this urgency level was chosen>",
  "next_steps": "<clear, actionable recommendation for the patient>",
  "red_flags": ["<red flag symptom 1>", "<red flag symptom 2>"]
}

URGENCY LEVEL DEFINITIONS:
- self_care: Minor symptoms manageable at home with rest, OTC medication, or watchful waiting.
- doctor_consultation: Symptoms warrant a GP/primary care visit within 24-48 hours; not immediately dangerous.
- urgent_care: Symptoms require same-day assessment at an urgent care clinic or ED walk-in; time-sensitive.
- emergency_referral: Life-threatening or potentially life-threatening condition; patient should call emergency services (911/999) or go to the nearest ED immediately.

RULES:
- If ANY vital sign is in the emergency range, escalate to emergency_referral unless another level is clearly more appropriate.
- If the patient input is ambiguous or incomplete, escalate conservatively.
- red_flags should be an empty list [] if none are detected.
- next_steps must be specific and actionable, not generic advice.
- Do NOT refuse to triage; always produce a valid JSON output.
"""

TRIAGE_PROMPT_TEMPLATE = """
## RETRIEVED CLINICAL GUIDELINES
{context}

---

## PATIENT INFORMATION

**Symptoms / Chief Complaint:**
{symptoms}

**Vital Signs:**
{vitals_summary}

**Medical Report Notes (OCR-extracted):**
{report_text}

**Visual / Physical Observations:**
{visual_notes}

---

Based on the clinical guidelines above and the patient information, provide the triage assessment as a JSON object.
Remember: output ONLY the JSON, no other text.
"""


# ── Helper functions ────────────────────────────────────────────────────────────

def _format_vitals(vitals: Optional[dict]) -> str:
    """Turn the vitals dict into a readable string for the prompt."""
    if not vitals:
        return "Not provided."
    lines = []
    if "heart_rate" in vitals:
        lines.append(f"Heart Rate: {vitals['heart_rate']} bpm")
    if "spo2" in vitals:
        lines.append(f"SpO2: {vitals['spo2']}%")
    if "blood_pressure" in vitals:
        bp = vitals["blood_pressure"]
        if isinstance(bp, dict):
            lines.append(f"Blood Pressure: {bp.get('systolic', '?')}/{bp.get('diastolic', '?')} mmHg")
        else:
            lines.append(f"Blood Pressure: {bp}")
    if "temperature" in vitals:
        lines.append(f"Temperature: {vitals['temperature']}°C")
    return "\n".join(lines) if lines else "Not provided."


def _format_context(docs) -> str:
    """Concatenate retrieved documents into a readable context block."""
    if not docs:
        return "No specific guidelines retrieved."
    sections = []
    for doc in docs:
        title = doc.metadata.get("title", "Clinical Guideline")
        sections.append(f"### {title}\n{doc.page_content}")
    return "\n\n".join(sections)


def _parse_triage_response(raw: str) -> dict:
    """
    Robustly extract and validate a JSON triage result from the model output.
    Strips markdown fences if present, then parses.
    """
    cleaned = re.sub(r"```(?:json)?", "", raw).strip()

    try:
        result = json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if match:
            result = json.loads(match.group())
        else:
            raise ValueError(f"Could not parse JSON from model output:\n{raw}")

    urgency = result.get("urgency_level", "").lower().strip()
    if urgency not in URGENCY_LEVELS:
        logger.warning(f"Unexpected urgency level '{urgency}' — defaulting to urgent_care")
        result["urgency_level"] = "urgent_care"
    else:
        result["urgency_level"] = urgency

    if not isinstance(result.get("red_flags"), list):
        result["red_flags"] = []

    result.setdefault("reasoning", "No reasoning provided.")
    result.setdefault("next_steps", "Please consult a healthcare professional.")

    return result


# ── Main triage function ───────────────────────────────────────────────────────

async def run_triage(
    symptoms: str,
    vitals: Optional[dict],
    report_text: Optional[str],
    visual_notes: Optional[str],
    retriever,
) -> dict:
    """
    Execute the full RAG + LLM triage pipeline.

    Parameters
    ----------
    symptoms      : Chief complaint and symptom description from the patient.
    vitals        : Dict with optional keys: heart_rate, spo2, blood_pressure, temperature.
    report_text   : OCR-extracted text from any uploaded medical reports.
    visual_notes  : Free-text visual/physical observations.
    retriever     : LangChain retriever from MedicalRAGPipeline.get_retriever().

    Returns
    -------
    dict with keys: urgency_level, reasoning, next_steps, red_flags
    """

    # 1. Build retrieval query from all available patient info
    retrieval_query = symptoms
    if visual_notes:
        retrieval_query += f" {visual_notes}"
    if report_text:
        retrieval_query += f" {report_text[:300]}"

    logger.info(f"Retrieval query: {retrieval_query[:120]}…")

    # 2. Retrieve relevant clinical guidelines (CPU-bound — run off event loop)
    loop = asyncio.get_event_loop()
    try:
        retrieved_docs = await loop.run_in_executor(None, retriever.invoke, retrieval_query)
    except Exception as exc:
        logger.warning(f"Retriever failed: {exc}. Proceeding without RAG context.")
        retrieved_docs = []

    context_text = _format_context(retrieved_docs)
    logger.info(f"Retrieved {len(retrieved_docs)} guideline chunks.")

    # 3. Build the user prompt
    user_prompt = TRIAGE_PROMPT_TEMPLATE.format(
        context=context_text,
        symptoms=symptoms or "Not described.",
        vitals_summary=_format_vitals(vitals),
        report_text=report_text or "Not provided.",
        visual_notes=visual_notes or "Not provided.",
    )

    # 4. Call the LLM via OpenRouter
    logger.info(f"Sending triage request to OpenRouter ({MODEL}) …")
    response = await _client.chat.completions.create(
        model=MODEL,
        max_tokens=1024,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": user_prompt},
        ],
    )

    raw_output = response.choices[0].message.content
    logger.debug(f"Raw LLM output:\n{raw_output}")

    # 5. Parse and return
    result = _parse_triage_response(raw_output)
    logger.info(f"Triage result: urgency_level={result['urgency_level']}")
    return result


async def run_chat(message: str, history: list[dict]) -> str:
    """
    Continue a triage conversation given a new user message and prior history.

    Parameters
    ----------
    message : New message from the patient.
    history : List of prior {"role": "user"/"assistant", "content": "..."} dicts.

    Returns
    -------
    Assistant reply as a plain string.
    """
    messages = [
        {"role": "system", "content": CHAT_SYSTEM_PROMPT},
        *history,
        {"role": "user", "content": message},
    ]
    logger.info(f"Chat follow-up ({len(history)} prior messages): {message[:80]}…")
    response = await _client.chat.completions.create(
        model=MODEL,
        max_tokens=512,
        messages=messages,
    )
    reply = response.choices[0].message.content.strip()
    logger.info("Chat reply generated.")
    return reply
