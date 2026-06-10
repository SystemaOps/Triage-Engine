import os
import shutil
import tempfile
from fastapi import FastAPI, UploadFile, File, HTTPException
from ocr_engine import MedicalOCREngine
from xray_engine import MedicalXrayEngine

app = FastAPI(
    title="SystemaOps AI Triage ML Microservice",
    description="API for processing medical report OCR and Chest X-ray classification",
    version="1.0.0"
)

# Initialize engines on startup
print("Starting ML Engines...")
ocr_engine = MedicalOCREngine()
xray_engine = MedicalXrayEngine()

from fastapi.responses import HTMLResponse

@app.get("/", response_class=HTMLResponse)
def read_root():
    template_path = os.path.join(os.path.dirname(__file__), "templates", "index.html")
    if os.path.exists(template_path):
        with open(template_path, "r", encoding="utf-8") as f:
            html_content = f.read()
        return HTMLResponse(content=html_content, status_code=200)
    return HTMLResponse(content="<h1>Template index.html not found</h1>", status_code=404)

@app.post("/ocr/process")
async def process_ocr(file: UploadFile = File(...)):
    """Upload a blood report image (PNG/JPG) to extract blood glucose, WBC, and hemoglobin values."""
    if not file.filename.lower().endswith(('.png', '.jpg', '.jpeg')):
        raise HTTPException(status_code=400, detail="Only PNG and JPG images are supported for OCR scanning.")
        
    # Save file to a temporary location
    try:
        suffix = os.path.splitext(file.filename)[1]
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = tmp.name
            
        # Run OCR extraction and parsing
        raw_text = ocr_engine.extract_text(tmp_path)
        metrics = ocr_engine.parse_metrics(raw_text)
        
        return {
            "filename": file.filename,
            "extracted_text": raw_text,
            "metrics": metrics
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Ensure temporary file cleanup
        if 'tmp_path' in locals() and os.path.exists(tmp_path):
            os.remove(tmp_path)

@app.post("/xray/classify")
async def classify_xray(file: UploadFile = File(...)):
    """Upload a chest X-ray image (PNG/JPG/JPEG) to predict pneumonia or other lung anomalies."""
    if not file.filename.lower().endswith(('.png', '.jpg', '.jpeg')):
        raise HTTPException(status_code=400, detail="Only PNG, JPG, and JPEG images are supported for X-ray analysis.")
        
    # Save file to a temporary location
    try:
        suffix = os.path.splitext(file.filename)[1]
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = tmp.name
            
        # Run vision classification
        results = xray_engine.classify_xray(tmp_path)
        
        return {
            "filename": file.filename,
            "analysis": results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Ensure temporary file cleanup
        if 'tmp_path' in locals() and os.path.exists(tmp_path):
            os.remove(tmp_path)

if __name__ == '__main__':
    import uvicorn
    # Run server locally on port 8000
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
