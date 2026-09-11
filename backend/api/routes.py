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
    import gc
    import logging
    logger = logging.getLogger(__name__)
    job = processing_jobs[job_id]
    
    try:
        job["progress"] = 5
        job["message"] = "Loading image..."
        gc.collect()
        
        import cv2
        import numpy as np
        
        ext = os.path.splitext(job["file_path"])[1].lower()
        if ext == ".pdf":
            preprocessed = preprocessor.preprocess(job["file_path"])
        else:
            image = cv2.imread(job["file_path"])
            if image is None:
                raise ValueError("Could not read image")
            h, w = image.shape[:2]
            max_dim = 2000
            if max(h, w) > max_dim:
                scale = max_dim / max(h, w)
                image = cv2.resize(image, None, fx=scale, fy=scale)
            preprocessed = image
        
        gc.collect()
        job["progress"] = 20
        job["message"] = "Analyzing quality..."
        
        quality_report = preprocessor.analyze_quality(preprocessed)
        
        job["progress"] = 35
        job["message"] = "Detecting layout..."
        
        regions = preprocessor.detect_layout(preprocessed)
        if not regions:
            regions = [{"bbox": [0, 0, preprocessed.shape[1], preprocessed.shape[0]], "type": "block"}]
        
        gc.collect()
        job["progress"] = 50
        job["message"] = f"Running OCR on {len(regions)} regions..."
        
        ocr_results = []
        for i, region in enumerate(regions):
            bbox = region.get("bbox", [0, 0, preprocessed.shape[1], preprocessed.shape[0]])
            x1, y1, x2, y2 = [int(b) for b in bbox]
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(preprocessed.shape[1], x2), min(preprocessed.shape[0], y2)
            crop = preprocessed[y1:y2, x1:x2]
            
            if crop.size == 0 or crop.shape[0] < 10 or crop.shape[1] < 10:
                continue
            
            try:
                result = ocr_engine.run_ocr_direct(crop, "en")
                if result and result.get("text", "").strip():
                    result["region_index"] = i
                    result["bbox"] = bbox
                    result["detected_language"] = "en"
                    result["region_type"] = region.get("type", "block")
                    ocr_results.append(result)
            except Exception as ex:
                logger.warning(f"OCR failed for region {i}: {ex}")
                continue
            
            job["progress"] = min(85, 50 + int(35 * (i + 1) / len(regions)))
            job["message"] = f"OCR: region {i+1}/{len(regions)}..."
            gc.collect()
        
        job["progress"] = 90
        job["message"] = "Finalizing..."
        
        full_text = "\n\n".join(r.get("text", "") for r in ocr_results if r.get("text", "").strip())
        avg_conf = sum(r.get("confidence", 0) for r in ocr_results) / max(len(ocr_results), 1)
        
        final_result = {
            "pages": [{
                "regions": ocr_results,
                "full_text": full_text,
                "confidence": avg_conf
            }],
            "metadata": {
                "filename": job["filename"],
                "processed_at": datetime.now().isoformat(),
                "quality_report": quality_report,
                "total_regions": len(ocr_results),
                "languages_detected": list(set(r.get("detected_language", "en") for r in ocr_results))
            },
            "confidence_summary": {
                "average_confidence": avg_conf,
                "total_regions": len(ocr_results),
                "total_characters": len(full_text)
            }
        }
        
        job["result"] = final_result
        job["status"] = "completed"
        job["completed_at"] = datetime.now().isoformat()
        job["progress"] = 100
        job["message"] = "Processing complete!"
        
    except Exception as e:
        logger.error(f"Processing failed for {job_id}: {e}")
        job["status"] = "failed"
        job["error"] = str(e)
        job["message"] = f"Processing failed: {str(e)}"
    finally:
        gc.collect()

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
