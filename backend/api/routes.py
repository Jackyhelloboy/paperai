from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse
from typing import List, Optional
import os
import uuid
import json
from datetime import datetime
from utils.config import settings
from ocr_engine.image_preprocessor import ImagePreprocessor
from ocr_engine.script_classifier import ScriptClassifier
from ocr_engine.ocr_engine import OCREngine
from ocr_engine.question_paper_validator import QuestionPaperValidator
from ocr_engine.consensus_scorer import ConsensusScorer
from ocr_engine.math_protector import MathProtector
from ocr_engine.source_comparator import SourceComparator
from exports.export_manager import ExportManager

router = APIRouter()

preprocessor = ImagePreprocessor()
script_classifier = ScriptClassifier()
ocr_engine = OCREngine()
validator = QuestionPaperValidator()
scorer = ConsensusScorer()
math_protector = MathProtector()
source_comparator = SourceComparator()
export_manager = ExportManager()

processing_jobs = {}

@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type {file_ext} not supported. Allowed: {', '.join(settings.ALLOWED_EXTENSIONS)}"
        )
    
    job_id = str(uuid.uuid4())
    file_path = os.path.join(settings.UPLOAD_DIR, f"{job_id}{file_ext}")
    
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    
    content = await file.read()
    if len(content) > settings.MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large. Max size: 50MB")
    
    with open(file_path, "wb") as f:
        f.write(content)
    
    processing_jobs[job_id] = {
        "id": job_id,
        "filename": file.filename,
        "file_path": file_path,
        "status": "uploaded",
        "created_at": datetime.now().isoformat(),
        "result": None
    }
    
    return {
        "job_id": job_id,
        "filename": file.filename,
        "status": "uploaded",
        "message": "File uploaded successfully. Call /api/process/{job_id} to start OCR."
    }

@router.post("/process/{job_id}")
async def process_file(job_id: str, background_tasks: BackgroundTasks):
    if job_id not in processing_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = processing_jobs[job_id]
    job["status"] = "processing"
    
    background_tasks.add_task(_process_file_task, job_id)
    
    return {
        "job_id": job_id,
        "status": "processing",
        "message": "Processing started. Check /api/status/{job_id} for progress."
    }

@router.get("/status/{job_id}")
async def get_status(job_id: str):
    if job_id not in processing_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = processing_jobs[job_id]
    return {
        "job_id": job_id,
        "status": job["status"],
        "progress": job.get("progress", 0),
        "message": job.get("message", ""),
        "error": job.get("error", None)
    }

@router.get("/result/{job_id}")
async def get_result(job_id: str):
    if job_id not in processing_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = processing_jobs[job_id]
    
    if job["status"] != "completed":
        raise HTTPException(status_code=400, detail=f"Job status: {job['status']}")
    
    return {
        "job_id": job_id,
        "filename": job["filename"],
        "result": job["result"],
        "created_at": job["created_at"],
        "completed_at": job.get("completed_at")
    }

@router.post("/correct/{job_id}")
async def submit_correction(job_id: str, corrections: dict):
    if job_id not in processing_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = processing_jobs[job_id]
    
    correction_data = {
        "job_id": job_id,
        "filename": job["filename"],
        "corrections": corrections,
        "timestamp": datetime.now().isoformat()
    }
    
    training_dir = os.path.join(settings.TRAINING_DATA_DIR, "corrections")
    os.makedirs(training_dir, exist_ok=True)
    
    correction_file = os.path.join(training_dir, f"{job_id}.json")
    with open(correction_file, "w", encoding="utf-8") as f:
        json.dump(correction_data, f, ensure_ascii=False, indent=2)
    
    return {
        "status": "saved",
        "message": "Correction saved for future model fine-tuning."
    }

@router.get("/export/{job_id}/{format_type}")
async def export_result(job_id: str, format_type: str):
    if job_id not in processing_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = processing_jobs[job_id]
    
    if job["status"] != "completed":
        raise HTTPException(status_code=400, detail="Job not completed yet")
    
    if format_type not in ["txt", "docx", "pdf"]:
        raise HTTPException(status_code=400, detail="Format must be txt, docx, or pdf")
    
    try:
        export_path = export_manager.export(
            result=job["result"],
            format_type=format_type,
            job_id=job_id,
            filename=job["filename"]
        )
        
        return FileResponse(
            path=export_path,
            filename=f"{os.path.splitext(job['filename'])[0]}.{format_type}",
            media_type="application/octet-stream"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")

@router.delete("/job/{job_id}")
async def delete_job(job_id: str):
    if job_id not in processing_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = processing_jobs[job_id]
    
    if os.path.exists(job["file_path"]):
        os.remove(job["file_path"])
    
    del processing_jobs[job_id]
    
    return {"status": "deleted", "message": "Job and file deleted."}

async def _process_file_task(job_id: str):
    job = processing_jobs[job_id]
    
    try:
        job["progress"] = 5
        job["message"] = "Loading and preprocessing image..."
        
        preprocessed = preprocessor.preprocess(job["file_path"])
        
        job["progress"] = 15
        job["message"] = "Analyzing image quality..."
        
        quality_report = preprocessor.analyze_quality(preprocessed)
        
        job["progress"] = 25
        job["message"] = "Detecting layout and regions..."
        
        regions = preprocessor.detect_layout(preprocessed)
        
        job["progress"] = 35
        job["message"] = f"Detected {len(regions)} regions. Classifying scripts..."
        
        classified_regions = script_classifier.classify_regions(regions)
        
        job["progress"] = 45
        job["message"] = "Running OCR with multi-resolution voting..."
        
        ocr_results = ocr_engine.process_regions(
            image=preprocessed,
            regions=classified_regions,
            quality_report=quality_report
        )
        
        job["progress"] = 65
        job["message"] = "Protecting mathematical expressions..."
        
        protected_results = math_protector.protect(ocr_results)
        
        job["progress"] = 75
        job["message"] = "Validating question paper structure..."
        
        validated = validator.validate(protected_results, preprocessed)
        
        job["progress"] = 85
        job["message"] = "Comparing with source image..."
        
        source_comparison = source_comparator.compare_source_output(
            preprocessed, 
            [r for page in validated for r in page.get("regions", [])]
        )
        
        job["progress"] = 90
        job["message"] = "Computing consensus scores..."
        
        scored = scorer.score(validated)
        
        job["progress"] = 95
        job["message"] = "Finalizing output..."
        
        final_result = {
            "pages": scored,
            "metadata": {
                "filename": job["filename"],
                "processed_at": datetime.now().isoformat(),
                "quality_report": quality_report,
                "total_regions": len(regions),
                "languages_detected": list(set(
                    region.get("language", "unknown")
                    for page in scored
                    for region in page.get("regions", [])
                )),
                "source_comparison": {
                    "overall_similarity": source_comparison.get("overall_similarity", 0),
                    "missing_elements": len(source_comparison.get("missing_elements", [])),
                    "silent_changes": len(source_comparison.get("silent_changes", [])),
                    "needs_review": source_comparison.get("needs_review", False)
                }
            },
            "confidence_summary": scorer.get_summary(scored)
        }
        
        job["result"] = final_result
        job["status"] = "completed"
        job["completed_at"] = datetime.now().isoformat()
        job["progress"] = 100
        job["message"] = "Processing complete!"
        
    except Exception as e:
        job["status"] = "failed"
        job["error"] = str(e)
        job["message"] = f"Processing failed: {str(e)}"

@router.get("/jobs")
async def list_jobs():
    return {
        "jobs": [
            {
                "id": job["id"],
                "filename": job["filename"],
                "status": job["status"],
                "created_at": job["created_at"]
            }
            for job in processing_jobs.values()
        ]
    }
