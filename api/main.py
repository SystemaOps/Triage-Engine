"""
api/main.py
-----------
FastAPI application for the AI-assisted medical triage platform.

Endpoints:
  POST /triage                — Main triage endpoint
  GET  /health                — Health check
  POST /admin/rebuild-index   — Force-rebuild the FAISS index (requires X-Admin-Key header)
"""

import logging
import os
import sys
import time
import uuid
from contextlib import asynccontextmanager
from typing import Optional

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Header, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, validator

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db.client import append_messages, get_session_messages, save_triage_session
from rag.rag_pipeline import MedicalRAGPipeline
from triage.triage_chain import run_chat, run_triage

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger("medical_triage.api")

# ── Global RAG pipeline (initialised at startup) ───────────────────────────────
rag_pipeline = MedicalRAGPipeline()


# ── Lifespan (startup / shutdown) ─────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Medical Triage API — building/loading RAG pipeline …")
    rag_pipeline.build_or_load()
    logger.info("RAG pipeline ready.")
    yield
    logger.info("Medical Triage API shutting down.")


# ── FastAPI app ────────────────────────────────────────────────────────────────
app = FastAPI(
    title="AI Medical Triage API",
    description=(
        "An AI-assisted triage platform that classifies patient urgency based on "
        "symptoms, vitals, and medical report text using a RAG + LLM pipeline. "
        "⚠️ This system is NOT a diagnostic tool and does NOT replace a licensed medical professional."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # Restrict in production
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response schemas ─────────────────────────────────────────────────

class BloodPressure(BaseModel):
    systolic:  int = Field(..., ge=40,  le=300, description="Systolic BP in mmHg")
    diastolic: int = Field(..., ge=20,  le=200, description="Diastolic BP in mmHg")


class Vitals(BaseModel):
    heart_rate:     Optional[int]           = Field(None, ge=20,  le=300, description="Heart rate in bpm")
    spo2:           Optional[float]         = Field(None, ge=50,  le=100, description="Oxygen saturation %")
    blood_pressure: Optional[BloodPressure] = Field(None, description="Blood pressure in mmHg")
    temperature:    Optional[float]         = Field(None, ge=30,  le=45,  description="Body temperature in °C")


class TriageRequest(BaseModel):
    symptoms:     str              = Field(..., min_length=3, max_length=4000,
                                          description="Patient's symptom description")
    vitals:       Optional[Vitals] = Field(None, description="Measured vital signs")
    report_text:  Optional[str]    = Field(None, max_length=8000,
                                           description="OCR-extracted text from any uploaded medical report")
    visual_notes: Optional[str]    = Field(None, max_length=2000,
                                           description="Visual / physical observation notes")

    @validator("symptoms")
    def symptoms_not_blank(cls, v):
        if not v.strip():
            raise ValueError("symptoms must not be blank")
        return v.strip()

    class Config:
        json_schema_extra = {
            "example": {
                "symptoms": "Severe chest pain radiating to my left arm, started 20 minutes ago. I am sweating and feel nauseated.",
                "vitals": {
                    "heart_rate": 118,
                    "spo2": 94,
                    "blood_pressure": {"systolic": 88, "diastolic": 60},
                    "temperature": 37.2,
                },
                "report_text": None,
                "visual_notes": "Patient appears pale and diaphoretic",
            }
        }


class TriageResponse(BaseModel):
    session_id:    str           = Field(..., description="Session ID — pass this to POST /chat for follow-up questions")
    urgency_level: str           = Field(..., description="One of: self_care | doctor_consultation | urgent_care | emergency_referral")
    reasoning:     str           = Field(..., description="2-3 sentence clinical reasoning")
    next_steps:    str           = Field(..., description="Recommended next steps for the patient")
    red_flags:     list[str]     = Field(..., description="List of detected red-flag symptoms")
    disclaimer:    str           = Field(..., description="Mandatory disclaimer")
    latency_ms:    Optional[int] = Field(None, description="Pipeline latency in milliseconds")


class ChatRequest(BaseModel):
    session_id: str  = Field(..., description="session_id returned by POST /triage")
    message:    str  = Field(..., min_length=1, max_length=2000, description="Follow-up message from the patient")


class ChatResponse(BaseModel):
    session_id: str = Field(..., description="Same session ID")
    reply:      str = Field(..., description="Assistant response")


class HealthResponse(BaseModel):
    status:     str
    rag_ready:  bool
    model:      str
    version:    str


# ── Admin auth dependency ──────────────────────────────────────────────────────

async def require_admin_key(x_admin_key: Optional[str] = Header(None)):
    """Validates the X-Admin-Key header against the ADMIN_API_KEY env var."""
    expected = os.environ.get("ADMIN_API_KEY")
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Admin key not configured on this server.",
        )
    if x_admin_key != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-Admin-Key header.",
        )


# ── Endpoints ──────────────────────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse, tags=["System"])
async def health_check():
    """Returns API health status and RAG readiness."""
    return HealthResponse(
        status="ok",
        rag_ready=rag_pipeline._retriever is not None,
        model=os.environ.get("LLM_MODEL", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"),
        version="1.0.0",
    )


@app.post("/triage", response_model=TriageResponse, tags=["Triage"],
          status_code=status.HTTP_200_OK)
async def triage_patient(request: TriageRequest):
    """
    **Main triage endpoint.**

    Accepts patient input (symptoms, vitals, report text, visual observations)
    and returns an urgency classification with reasoning and next steps.

    ⚠️ This endpoint is NOT a substitute for professional medical advice.
    Always recommend the patient consult a licensed healthcare provider.
    """
    t_start = time.perf_counter()

    try:
        retriever = rag_pipeline.get_retriever()
    except RuntimeError as exc:
        logger.error(f"RAG pipeline not ready: {exc}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="RAG pipeline is not initialised. Please retry in a moment.",
        )

    vitals_dict = None
    if request.vitals:
        vitals_dict = request.vitals.model_dump(exclude_none=True)

    try:
        result = await run_triage(
            symptoms=request.symptoms,
            vitals=vitals_dict,
            report_text=request.report_text,
            visual_notes=request.visual_notes,
            retriever=retriever,
        )
    except Exception as exc:
        logger.exception(f"Triage pipeline error: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Triage pipeline error: {str(exc)}",
        )

    latency_ms = int((time.perf_counter() - t_start) * 1000)
    session_id = str(uuid.uuid4())

    user_summary = f"Symptoms: {request.symptoms}"
    if vitals_dict:
        user_summary += f"\nVitals: {vitals_dict}"
    if request.report_text:
        user_summary += f"\nReport: {request.report_text[:300]}"
    if request.visual_notes:
        user_summary += f"\nObservations: {request.visual_notes}"

    red_flags = result.get("red_flags", [])
    assistant_summary = (
        f"Urgency level: {result['urgency_level']}\n"
        f"Reasoning: {result['reasoning']}\n"
        f"Next steps: {result['next_steps']}\n"
        f"Red flags: {', '.join(red_flags) if red_flags else 'None detected'}"
    )

    initial_messages = [
        {"role": "user",      "content": user_summary},
        {"role": "assistant", "content": assistant_summary},
    ]

    await save_triage_session(
        session_id=session_id,
        symptoms=request.symptoms,
        vitals=vitals_dict,
        report_text=request.report_text,
        visual_notes=request.visual_notes,
        urgency_level=result["urgency_level"],
        reasoning=result["reasoning"],
        next_steps=result["next_steps"],
        red_flags=red_flags,
        latency_ms=latency_ms,
        messages=initial_messages,
    )

    return TriageResponse(
        session_id=session_id,
        urgency_level=result["urgency_level"],
        reasoning=result["reasoning"],
        next_steps=result["next_steps"],
        red_flags=result.get("red_flags", []),
        disclaimer=(
            "⚠️ This assessment is generated by an AI triage assistant and is NOT a medical diagnosis. "
            "It is intended to assist in prioritising care, not replace a licensed medical professional. "
            "If you are in doubt, always seek immediate medical attention."
        ),
        latency_ms=latency_ms,
    )


@app.post("/chat", response_model=ChatResponse, tags=["Triage"],
          status_code=status.HTTP_200_OK)
async def chat(request: ChatRequest):
    """
    **Follow-up chat within an existing triage session.**

    Use the `session_id` returned by `POST /triage` to continue the conversation.
    The AI remembers the full prior context and can reassess urgency if new
    symptoms are reported.
    """
    history = await get_session_messages(request.session_id)
    if history is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found. Start a new triage with POST /triage.",
        )

    try:
        reply = await run_chat(message=request.message, history=history)
    except Exception as exc:
        logger.exception(f"Chat error for session {request.session_id}: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Chat pipeline error. Please try again.",
        )

    await append_messages(
        request.session_id,
        [
            {"role": "user",      "content": request.message},
            {"role": "assistant", "content": reply},
        ],
    )

    return ChatResponse(session_id=request.session_id, reply=reply)


@app.post("/admin/rebuild-index", tags=["Admin"], status_code=status.HTTP_200_OK)
async def rebuild_index(x_admin_key: Optional[str] = Header(None)):
    """
    Force-rebuilds the FAISS index from the knowledge base.
    Requires a valid `X-Admin-Key` header matching the `ADMIN_API_KEY` env var.
    """
    await require_admin_key(x_admin_key)
    try:
        rag_pipeline.build_or_load(force_rebuild=True)
    except Exception as exc:
        logger.exception(f"Index rebuild failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Index rebuild failed: {str(exc)}",
        )
    return {"status": "ok", "message": "FAISS index rebuilt successfully."}


# ── Global exception handler ───────────────────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Unhandled exception on {request.url}: {exc}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An unexpected error occurred. Please try again."},
    )


# ── Entrypoint ─────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
