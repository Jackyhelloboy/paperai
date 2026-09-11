"""
FastAPI Server for Multi-Engine OCR with Self-Improvement
"""
from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
import uvicorn
import os
import uuid
import json
import shutil
from datetime import datetime
from typing import Optional

# Import our OCR system
import sys
sys.path.insert(0, "D:/Paper Ai/backend")
from ocr_engine.multi_engine_ocr import SelfImprovingOCR

app = FastAPI(title="PaperAI OCR - Multi-Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize OCR system
ocr_system = SelfImprovingOCR()

# Storage
UPLOAD_DIR = "D:/Paper Ai/uploads"
EXPORT_DIR = "D:/Paper Ai/exports"
TRAINING_DIR = "D:/Paper Ai/training_data"

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(EXPORT_DIR, exist_ok=True)
os.makedirs(TRAINING_DIR, exist_ok=True)

# Job storage
jobs = {}

@app.get("/")
async def root():
    return {"message": "PaperAI OCR - Multi-Engine System Running"}

@app.get("/health")
async def health():
    return {"status": "healthy", "engines": ["easyocr", "tesseract", "ocr_space"]}

@app.post("/api/extract")
async def extract_text(file: UploadFile = File(...), 
                       original_text: Optional[str] = None):
    """
    Extract text from image/PDF - Pure extraction, no corrections
    """
    # Validate file
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".pdf"]:
        raise HTTPException(status_code=400, detail="Unsupported file type")
    
    # Save file
    job_id = str(uuid.uuid4())[:8]
    file_path = os.path.join(UPLOAD_DIR, f"{job_id}{ext}")
    
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)
    
    # Process with OCR
    try:
        result = ocr_system.process_and_learn(file_path, original_text)
        
        # Store job
        jobs[job_id] = {
            "id": job_id,
            "filename": file.filename,
            "file_path": file_path,
            "result": result,
            "created_at": datetime.now().isoformat()
        }
        
        return {
            "job_id": job_id,
            "text": result["text"],
            "confidence": result["confidence"],
            "engine": result.get("engine_used", "unknown"),
            "processing_time": result.get("processing_time", 0),
            "accuracy": result.get("accuracy", None)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/result/{job_id}")
async def get_result(job_id: str):
    """Get extraction result"""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return jobs[job_id]["result"]

@app.post("/api/correct/{job_id}")
async def submit_correction(job_id: str, corrections: dict):
    """
    Submit corrections for self-improvement
    """
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = jobs[job_id]
    
    # Save correction for training
    sample_path = ocr_system.save_for_training(
        job["file_path"],
        job["result"]["text"],
        corrections.get("corrected_text", "")
    )
    
    # Calculate accuracy if correction provided
    if "corrected_text" in corrections:
        accuracy = ocr_system.calculate_accuracy(
            corrections["corrected_text"],
            job["result"]["text"]
        )
        
        # Log error if accuracy is low
        if accuracy["overall_accuracy"] < 80:
            ocr_system.log_error(
                job["file_path"],
                corrections["corrected_text"],
                job["result"]["text"],
                job["result"].get("engine_used", "unknown"),
                "user_correction"
            )
    
    return {"status": "saved", "message": "Correction saved for training"}

@app.get("/api/export/{job_id}/{format_type}")
async def export_text(job_id: str, format_type: str):
    """Export extracted text as TXT file"""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    result = jobs[job_id]["result"]
    text = result.get("text", "")
    
    # Create export file
    export_path = os.path.join(EXPORT_DIR, f"{job_id}.txt")
    with open(export_path, "w", encoding="utf-8") as f:
        f.write(f"PaperAI OCR Export\n")
        f.write(f"=" * 50 + "\n\n")
        f.write(text)
    
    return FileResponse(
        export_path,
        filename=f"extracted_{jobs[job_id]['filename']}.txt",
        media_type="text/plain"
    )

@app.get("/api/performance")
async def get_performance():
    """Get system performance report"""
    return ocr_system.get_performance_report()

@app.get("/api/suggestions")
async def get_suggestions():
    """Get improvement suggestions"""
    return {"suggestions": ocr_system.get_improvement_suggestions()}

@app.delete("/api/job/{job_id}")
async def delete_job(job_id: str):
    """Delete a job"""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = jobs[job_id]
    if os.path.exists(job["file_path"]):
        os.remove(job["file_path"])
    
    del jobs[job_id]
    return {"status": "deleted"}

@app.get("/api/jobs")
async def list_jobs():
    """List all jobs"""
    return {
        "jobs": [
            {
                "id": job["id"],
                "filename": job["filename"],
                "created_at": job["created_at"]
            }
            for job in jobs.values()
        ]
    }


if __name__ == "__main__":
    print("=" * 60)
    print("Starting PaperAI OCR Server")
    print("Multi-Engine: EasyOCR + Tesseract + OCR.space")
    print("=" * 60)
    uvicorn.run(app, host="0.0.0.0", port=8000)
