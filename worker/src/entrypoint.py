import io
import os
import json
import base64
import time
import numpy as np
import cv2
from typing import Optional

from workers import asgi
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

app = FastAPI(title="PaperAI OCR", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class EvalRequest(BaseModel):
    text: str
    expected: str


@app.get("/")
async def root():
    return {"message": "PaperAI OCR Server v2.0", "status": "running", "platform": "cloudflare-workers"}


@app.get("/health")
async def health():
    return {"status": "healthy", "engines": {"opencv": True, "numpy": True}}


@app.post("/api/ocr")
async def process_ocr(
    file: UploadFile = File(...),
    language: str = Form("en"),
    preprocessing: str = Form("auto"),
):
    if not file.filename:
        raise HTTPException(400, "No file provided")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".pdf", ".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif", ".webp"]:
        raise HTTPException(400, f"Unsupported file type: {ext}")

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(400, "File too large (max 10MB for Workers)")

    try:
        images = await _load_images(content, ext)
        if not images:
            raise HTTPException(400, "Could not extract images from file")

        all_results = []
        total_conf = 0

        for idx, img in enumerate(images):
            if preprocessing != "none":
                img = _preprocess(img, preprocessing)

            result = _analyze_image(img, language)
            all_results.append({
                "page": idx + 1,
                "text": result["text"],
                "confidence": result["confidence"],
                "regions": result["regions"],
                "stats": result["stats"],
            })
            total_conf += result["confidence"]

        full_text = "\n\n".join(r["text"] for r in all_results if r["text"].strip())
        avg_conf = total_conf / max(len(all_results), 1)

        return {
            "status": "completed",
            "result": {
                "pages": all_results,
                "full_text": full_text,
                "metadata": {
                    "filename": file.filename,
                    "total_pages": len(all_results),
                    "total_characters": len(full_text),
                    "average_confidence": round(avg_conf, 4),
                    "language": language,
                    "engine": "opencv-analysis",
                },
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Processing failed: {str(e)}")


@app.post("/api/eval")
async def evaluate(req: EvalRequest):
    from difflib import SequenceMatcher
    t = req.text.lower().strip()
    e = req.expected.lower().strip()

    matcher = SequenceMatcher(None, e, t)
    char_acc = sum(b.size for b in matcher.get_matching_blocks()) / max(len(e), 1)
    word_acc = len(set(e.split()) & set(t.split())) / max(len(set(e.split())), 1)
    seq_sim = SequenceMatcher(None, e, t).ratio()
    overall = char_acc * 0.3 + word_acc * 0.3 + seq_sim * 0.4

    return {
        "metrics": {
            "char_accuracy": round(char_acc * 100, 2),
            "word_accuracy": round(word_acc * 100, 2),
            "sequence_similarity": round(seq_sim * 100, 2),
            "overall": round(overall * 100, 2),
        }
    }


async def _load_images(content: bytes, ext: str):
    images = []
    nparr = np.frombuffer(content, np.uint8)

    if ext == ".pdf":
        try:
            import fitz
            doc = fitz.open(stream=content, filetype="pdf")
            for page in doc:
                mat = fitz.Matrix(2, 2)
                pix = page.get_pixmap(matrix=mat)
                img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, pix.n)
                if pix.n == 4:
                    img = cv2.cvtColor(img, cv2.COLOR_RGBA2BGR)
                elif pix.n == 1:
                    img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
                images.append(img)
            doc.close()
        except Exception:
            return []
    else:
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is not None:
            h, w = img.shape[:2]
            if max(h, w) > 3000:
                scale = 3000 / max(h, w)
                img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
            images.append(img)

    return images


def _preprocess(image: np.ndarray, mode: str) -> np.ndarray:
    img = image.copy()
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img

    blur_val = cv2.Laplacian(gray, cv2.CV_64F).var()
    brightness = float(np.mean(gray))
    contrast = float(np.std(gray))

    if abs(_detect_skew(gray)) > 0.5:
        img = _rotate(img, _detect_skew(gray))

    img = _remove_shadows(img)

    if brightness < 100:
        img = cv2.convertScaleAbs(img, alpha=1.1, beta=15)
    elif brightness > 180:
        img = cv2.convertScaleAbs(img, alpha=0.9, beta=-10)

    if contrast < 40:
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(6, 6))
        l = clahe.apply(l)
        img = cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)

    if mode == "aggressive":
        gray2 = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
        clahe2 = cv2.createCLAHE(clipLimit=4.0, tileGridSize=(8, 8))
        enhanced = clahe2.apply(gray2)
        _, binary = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        kernel = np.ones((2, 2), np.uint8)
        cleaned = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)
        img = cv2.cvtColor(cleaned, cv2.COLOR_GRAY2BGR)

    h, w = img.shape[:2]
    if max(h, w) < 1500:
        scale = 1500 / max(h, w)
        img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

    return img


def _detect_skew(gray: np.ndarray) -> float:
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, 100, minLineLength=100, maxLineGap=10)
    if lines is None:
        return 0.0
    angles = []
    for line in lines:
        x1, y1, x2, y2 = line[0]
        if x2 - x1 != 0:
            angle = np.degrees(np.arctan2(y2 - y1, x2 - x1))
            if abs(angle) < 30:
                angles.append(angle)
    return float(np.median(angles)) if angles else 0.0


def _rotate(image: np.ndarray, angle: float) -> np.ndarray:
    h, w = image.shape[:2]
    center = (w // 2, h // 2)
    M = cv2.getRotationMatrix2D(center, angle, 1.0)
    cos = np.abs(M[0, 0])
    sin = np.abs(M[0, 1])
    new_w = int(h * sin + w * cos)
    new_h = int(h * cos + w * sin)
    M[0, 2] += (new_w - w) / 2
    M[1, 2] += (new_h - h) / 2
    return cv2.warpAffine(image, M, (new_w, new_h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)


def _remove_shadows(image: np.ndarray) -> np.ndarray:
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image
    dilated = cv2.dilate(gray, np.ones((7, 7), np.uint8))
    bg = cv2.medianBlur(dilated, 21)
    diff = 255 - cv2.absdiff(gray, bg)
    normalized = cv2.normalize(diff, None, 0, 255, cv2.NORM_MINMAX)
    if len(image.shape) == 3:
        b, g, r = cv2.split(image)
        shift = (normalized - gray).astype(np.int16)
        b = cv2.add(b, shift)
        g = cv2.add(g, shift)
        r = cv2.add(r, shift)
        return cv2.merge([b, g, r])
    return normalized


def _analyze_image(image: np.ndarray, language: str) -> dict:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image

    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    h, w = binary.shape
    total_pixels = h * w
    dark_pixels = int(np.sum(binary < 128))
    dark_ratio = dark_pixels / total_pixels

    h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (40, 3))
    h_lines = cv2.morphologyEx(cv2.bitwise_not(binary), cv2.MORPH_OPEN, h_kernel)

    v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 40))
    v_lines = cv2.morphologyEx(cv2.bitwise_not(binary), cv2.MORPH_OPEN, v_kernel)

    h_proj = np.sum(h_lines, axis=1)
    v_proj = np.sum(v_lines, axis=0)

    text_rows = np.where(h_proj > w * 0.05 * 255)[0]
    text_cols = np.where(v_proj > h * 0.05 * 255)[0]

    regions = []
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (25, 5))
    dilated = cv2.dilate(cv2.bitwise_not(binary), kernel, iterations=1)
    contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    for contour in contours:
        x, y, bw, bh = cv2.boundingRect(contour)
        if bw > 30 and bh > 10:
            regions.append({
                "bbox": [x, y, x + bw, y + bh],
                "width": bw,
                "height": bh,
                "area_ratio": (bw * bh) / total_pixels,
            })

    regions = sorted(regions, key=lambda r: (r["bbox"][1], r["bbox"][0]))

    lines_of_text = []
    if regions:
        current_line_y = regions[0]["bbox"][1]
        current_line = []

        for r in regions:
            if abs(r["bbox"][1] - current_line_y) < 20:
                current_line.append(r)
            else:
                if current_line:
                    lines_of_text.append(current_line)
                current_line = [r]
                current_line_y = r["bbox"][1]
        if current_line:
            lines_of_text.append(current_line)

    extracted_lines = []
    for line_regions in lines_of_text:
        line_text = _extract_line_text(gray, line_regions)
        if line_text.strip():
            extracted_lines.append(line_text)

    full_text = "\n".join(extracted_lines)

    confidence = _estimate_confidence(binary, regions, dark_ratio)

    return {
        "text": full_text,
        "confidence": confidence,
        "regions": len(regions),
        "stats": {
            "total_regions": len(regions),
            "text_lines": len(extracted_lines),
            "dark_ratio": round(dark_ratio, 4),
            "image_size": f"{w}x{h}",
            "text_rows": len(text_rows),
            "text_cols": len(text_cols),
        },
    }


def _extract_line_text(gray: np.ndarray, line_regions: list) -> str:
    if not line_regions:
        return ""

    x1 = min(r["bbox"][0] for r in line_regions)
    y1 = min(r["bbox"][1] for r in line_regions)
    x2 = max(r["bbox"][2] for r in line_regions)
    y2 = max(r["bbox"][3] for r in line_regions)

    crop = gray[y1:y2, x1:x2]
    if crop.size == 0:
        return ""

    _, binary = cv2.threshold(crop, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    h, w = binary.shape
    if h < 5 or w < 5:
        return ""

    v_proj = np.sum(binary < 128, axis=0)
    char_positions = np.where(v_proj > h * 0.1)[0]

    if len(char_positions) < 2:
        return "[text detected]"

    char_widths = np.diff(char_positions)
    avg_width = np.mean(char_widths) if len(char_widths) > 0 else 5

    estimated_chars = len(char_positions) / max(avg_width, 1)

    return f"[{int(estimated_chars)} chars detected in region]"


def _estimate_confidence(binary: np.ndarray, regions: list, dark_ratio: float) -> float:
    score = 0.5

    if 0.01 < dark_ratio < 0.15:
        score += 0.2
    elif dark_ratio < 0.01:
        score -= 0.2

    if len(regions) > 5:
        score += 0.1
    elif len(regions) > 0:
        score += 0.05

    h, w = binary.shape
    mean_val = np.mean(binary)
    std_val = np.std(binary)

    if std_val > 50:
        score += 0.1

    return min(1.0, max(0.1, score))


Default = asgi.entrypoint(app)
