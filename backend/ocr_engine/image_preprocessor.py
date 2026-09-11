import cv2
import numpy as np
from typing import Dict, List, Tuple, Optional
from scipy import ndimage
from skimage.filters import threshold_sauvola
import os

class ImagePreprocessor:
    def __init__(self):
        self.quality_metrics = {}
        self.adaptive_params = {}
    
    def preprocess(self, image_path: str) -> np.ndarray:
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Image not found: {image_path}")
        
        ext = os.path.splitext(image_path)[1].lower()
        
        if ext == ".pdf":
            image = self._pdf_to_image(image_path)
        else:
            image = cv2.imread(image_path)
            if image is None:
                raise ValueError(f"Could not read image: {image_path}")
        
        quality = self.analyze_quality(image)
        self.adaptive_params = self._compute_adaptive_params(quality)
        
        image = self._fix_rotation(image)
        image = self._remove_shadows(image)
        image = self._correct_perspective(image)
        image = self._normalize_lighting(image)
        image = self._adaptive_denoise(image, quality)
        image = self._multi_stage_sharpen(image, quality)
        image = self._adaptive_binarize(image, quality)
        
        return image
    
    def _pdf_to_image(self, pdf_path: str) -> np.ndarray:
        try:
            import fitz
            doc = fitz.open(pdf_path)
            images = []
            for page_num in range(min(len(doc), 1)):
                page = doc[page_num]
                mat = fitz.Matrix(3, 3)
                pix = page.get_pixmap(matrix=mat)
                img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, pix.n)
                if pix.n == 4:
                    img = cv2.cvtColor(img, cv2.COLOR_RGBA2BGR)
                elif pix.n == 1:
                    img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
                images.append(img)
            doc.close()
            return images[0] if images else None
        except ImportError:
            raise ImportError("PyMuPDF required for PDF support. Install with: pip install PyMuPDF")
    
    def _compute_adaptive_params(self, quality: Dict) -> Dict:
        params = {}
        
        blur = quality.get("blur_score", 500)
        noise = quality.get("noise_score", 25)
        brightness = quality.get("brightness", 127)
        contrast = quality.get("contrast", 64)
        skew = quality.get("skew_angle", 0)
        
        if blur < 200:
            params["denoise_strength"] = 15
            params["sharpen_strength"] = 1.5
        elif blur < 400:
            params["denoise_strength"] = 10
            params["sharpen_strength"] = 1.2
        else:
            params["denoise_strength"] = 5
            params["sharpen_strength"] = 1.0
        
        if noise > 30:
            params["denoise_strength"] = min(20, params["denoise_strength"] + 5)
        
        if brightness < 100:
            params["brightness_boost"] = True
            params["clahe_clip"] = 3.0
        elif brightness > 180:
            params["brightness_reduce"] = True
            params["clahe_clip"] = 2.0
        else:
            params["brightness_boost"] = False
            params["clahe_clip"] = 2.0
        
        if contrast < 40:
            params["contrast_enhance"] = True
            params["clahe_grid"] = 6
        else:
            params["contrast_enhance"] = False
            params["clahe_grid"] = 8
        
        params["needs_rotation"] = abs(skew) > 0.5
        params["skew_angle"] = skew
        
        return params
    
    def _fix_rotation(self, image: np.ndarray) -> np.ndarray:
        if not self.adaptive_params.get("needs_rotation", True):
            return image
        
        skew = self.adaptive_params.get("skew_angle", 0)
        
        if abs(skew) > 0.3:
            h, w = image.shape[:2]
            center = (w // 2, h // 2)
            M = cv2.getRotationMatrix2D(center, skew, 1.0)
            cos = np.abs(M[0, 0])
            sin = np.abs(M[0, 1])
            new_w = int(h * sin + w * cos)
            new_h = int(h * cos + w * sin)
            M[0, 2] += (new_w - w) / 2
            M[1, 2] += (new_h - h) / 2
            image = cv2.warpAffine(image, M, (new_w, new_h), 
                                    flags=cv2.INTER_CUBIC, 
                                    borderMode=cv2.BORDER_REPLICATE)
        
        return image
    
    def _remove_shadows(self, image: np.ndarray) -> np.ndarray:
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
            b = cv2.add(b, (normalized - gray))
            g = cv2.add(g, (normalized - gray))
            r = cv2.add(r, (normalized - gray))
            return cv2.merge([b, g, r])
        
        return normalized
    
    def _correct_perspective(self, image: np.ndarray) -> np.ndarray:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
        
        edges = cv2.Canny(gray, 50, 200)
        edges = cv2.dilate(edges, None, iterations=1)
        edges = cv2.erode(edges, None, iterations=1)
        
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        if not contours:
            return image
        
        largest = max(contours, key=cv2.contourArea)
        area = cv2.contourArea(largest)
        img_area = image.shape[0] * image.shape[1]
        
        if area < img_area * 0.1:
            return image
        
        epsilon = 0.02 * cv2.arcLength(largest, True)
        approx = cv2.approxPolyDP(largest, epsilon, True)
        
        if len(approx) == 4:
            pts = approx.reshape(4, 2).astype(np.float32)
            pts = self._order_points(pts)
            
            widthA = np.linalg.norm(pts[2] - pts[3])
            widthB = np.linalg.norm(pts[1] - pts[0])
            maxWidth = max(int(widthA), int(widthB))
            
            heightA = np.linalg.norm(pts[1] - pts[2])
            heightB = np.linalg.norm(pts[0] - pts[3])
            maxHeight = max(int(heightA), int(heightB))
            
            if maxWidth > 100 and maxHeight > 100:
                dst = np.array([
                    [0, 0],
                    [maxWidth - 1, 0],
                    [maxWidth - 1, maxHeight - 1],
                    [0, maxHeight - 1]
                ], dtype=np.float32)
                
                M = cv2.getPerspectiveTransform(pts, dst)
                warped = cv2.warpPerspective(image, M, (maxWidth, maxHeight))
                return warped
        
        return image
    
    def _order_points(self, pts: np.ndarray) -> np.ndarray:
        rect = np.zeros((4, 2), dtype=np.float32)
        
        s = pts.sum(axis=1)
        rect[0] = pts[np.argmin(s)]
        rect[2] = pts[np.argmax(s)]
        
        diff = np.diff(pts, axis=1)
        rect[1] = pts[np.argmin(diff)]
        rect[3] = pts[np.argmax(diff)]
        
        return rect
    
    def _normalize_lighting(self, image: np.ndarray) -> np.ndarray:
        lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        
        clahe_clip = self.adaptive_params.get("clahe_clip", 2.0)
        clahe_grid = self.adaptive_params.get("clahe_grid", 8)
        
        clahe = cv2.createCLAHE(clipLimit=clahe_clip, tileGridSize=(clahe_grid, clahe_grid))
        l = clahe.apply(l)
        
        if self.adaptive_params.get("brightness_boost", False):
            l = cv2.convertScaleAbs(l, alpha=1.1, beta=10)
        
        if self.adaptive_params.get("contrast_enhance", False):
            l = cv2.convertScaleAbs(l, alpha=1.2, beta=0)
        
        lab = cv2.merge([l, a, b])
        return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
    
    def _adaptive_denoise(self, image: np.ndarray, quality: Dict) -> np.ndarray:
        strength = self.adaptive_params.get("denoise_strength", 10)
        
        if quality.get("noise_score", 0) > 35:
            image = cv2.fastNlMeansDenoisingColored(image, None, strength, strength, 7, 21)
        elif quality.get("noise_score", 0) > 20:
            image = cv2.fastNlMeansDenoisingColored(image, None, strength // 2, strength // 2, 7, 21)
        
        return image
    
    def _multi_stage_sharpen(self, image: np.ndarray, quality: Dict) -> np.ndarray:
        strength = self.adaptive_params.get("sharpen_strength", 1.0)
        
        if strength <= 1.0:
            return image
        
        gaussian = cv2.GaussianBlur(image, (0, 0), 3)
        unsharp = cv2.addWeighted(image, 1.5 * strength, gaussian, -0.5 * strength, 0)
        
        kernel = np.array([
            [0, -0.5, 0],
            [-0.5, 3, -0.5],
            [0, -0.5, 0]
        ])
        sharpened = cv2.filter2D(unsharp, -1, kernel * strength)
        
        return cv2.addWeighted(unsharp, 0.6, sharpened, 0.4, 0)
    
    def _adaptive_binarize(self, image: np.ndarray, quality: Dict) -> np.ndarray:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
        
        sauvola_thresh = threshold_sauvola(gray, window_size=25, k=0.2)
        binary_sauvola = (gray > sauvola_thresh).astype(np.uint8) * 255
        
        binary_adaptive = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY, 31, 10
        )
        
        if quality.get("contrast", 64) < 40:
            _, binary_otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            combined = cv2.bitwise_and(binary_sauvola, binary_adaptive)
            combined = cv2.bitwise_and(combined, binary_otsu)
        else:
            combined = cv2.bitwise_and(binary_sauvola, binary_adaptive)
        
        kernel = np.ones((2, 2), np.uint8)
        combined = cv2.morphologyEx(combined, cv2.MORPH_CLOSE, kernel)
        
        return cv2.cvtColor(combined, cv2.COLOR_GRAY2BGR)
    
    def analyze_quality(self, image: np.ndarray) -> Dict:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
        
        blur_score = cv2.Laplacian(gray, cv2.CV_64F).var()
        
        noise_score = self._estimate_noise(gray)
        
        h, w = gray.shape
        aspect_ratio = w / h
        
        brightness = np.mean(gray)
        contrast = np.std(gray)
        
        rotation_score = self._detect_skew_angle(gray)
        
        texture_score = self._compute_texture_score(gray)
        
        shadow_score = self._detect_shadows(gray)
        
        resolution_score = self._estimate_resolution_quality(gray)
        
        quality_score = self._calculate_quality_score(
            blur_score, noise_score, brightness, contrast, rotation_score,
            texture_score, shadow_score, resolution_score
        )
        
        return {
            "blur_score": float(blur_score),
            "noise_score": float(noise_score),
            "brightness": float(brightness),
            "contrast": float(contrast),
            "aspect_ratio": float(aspect_ratio),
            "skew_angle": float(rotation_score),
            "texture_score": float(texture_score),
            "shadow_score": float(shadow_score),
            "resolution_score": float(resolution_score),
            "overall_quality": quality_score,
            "needs_preprocessing": quality_score < 0.7,
            "recommended_sharpening": blur_score < 300,
            "recommended_denoising": noise_score > 25,
            "recommended_brightening": brightness < 100,
            "recommended_perspective_correction": abs(rotation_score) > 1.0
        }
    
    def _estimate_noise(self, gray: np.ndarray) -> float:
        h, w = gray.shape
        M = np.array([[-1, -1, -1],
                       [-1,  8, -1],
                       [-1, -1, -1]])
        
        filtered = cv2.filter2D(gray, cv2.CV_64F, M)
        noise = np.std(filtered)
        
        return float(noise)
    
    def _compute_texture_score(self, gray: np.ndarray) -> float:
        sobelx = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
        sobely = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
        
        magnitude = np.sqrt(sobelx ** 2 + sobely ** 2)
        
        return float(np.mean(magnitude) / 255.0)
    
    def _detect_shadows(self, gray: np.ndarray) -> float:
        h, w = gray.shape
        left_half = gray[:, :w // 2]
        right_half = gray[:, w // 2:]
        
        left_mean = np.mean(left_half)
        right_mean = np.mean(right_half)
        
        shadow_diff = abs(left_mean - right_mean) / 255.0
        
        top_half = gray[:h // 2, :]
        bottom_half = gray[h // 2:, :]
        
        top_mean = np.mean(top_half)
        bottom_mean = np.mean(bottom_half)
        
        vertical_diff = abs(top_mean - bottom_mean) / 255.0
        
        return float(max(shadow_diff, vertical_diff))
    
    def _estimate_resolution_quality(self, gray: np.ndarray) -> float:
        h, w = gray.shape
        
        if h < 500 or w < 500:
            return 0.5
        
        scale = 500 / min(h, w)
        resized = cv2.resize(gray, None, fx=scale, fy=scale)
        
        edges = cv2.Canny(resized, 50, 150)
        edge_density = np.sum(edges > 0) / edges.size
        
        return float(min(1.0, edge_density * 10))
    
    def _detect_skew_angle(self, gray: np.ndarray) -> float:
        edges = cv2.Canny(gray, 50, 150, apertureSize=3)
        
        lines = cv2.HoughLinesP(edges, 1, np.pi / 180, 
                                 threshold=100, 
                                 minLineLength=100, 
                                 maxLineGap=10)
        
        if lines is None:
            return 0.0
        
        angles = []
        for line in lines:
            line_coords = line[0] if len(line.shape) > 1 else line
            x1, y1, x2, y2 = line_coords[:4]
            if x2 - x1 != 0:
                angle = np.degrees(np.arctan2(y2 - y1, x2 - x1))
                if abs(angle) < 30:
                    angles.append(angle)
        
        if not angles:
            return 0.0
        
        angles_array = np.array(angles)
        median_angle = np.median(angles_array)
        
        filtered_angles = angles_array[np.abs(angles_array - median_angle) < 5]
        
        return float(np.median(filtered_angles)) if len(filtered_angles) > 3 else float(median_angle)
    
    def _calculate_quality_score(self, blur: float, noise: float, 
                                  brightness: float, contrast: float, 
                                  skew: float, texture: float,
                                  shadow: float, resolution: float) -> float:
        blur_score = min(blur / 500, 1.0)
        noise_score = max(0, 1 - noise / 50)
        brightness_score = 1 - abs(brightness - 127) / 127
        contrast_score = min(contrast / 64, 1.0)
        skew_score = max(0, 1 - abs(skew) / 10)
        texture_score = min(texture * 2, 1.0)
        shadow_score = max(0, 1 - shadow * 2)
        resolution_score = min(resolution, 1.0)
        
        weights = [0.20, 0.15, 0.15, 0.12, 0.12, 0.10, 0.08, 0.08]
        scores = [blur_score, noise_score, brightness_score, contrast_score, 
                  skew_score, texture_score, shadow_score, resolution_score]
        
        return sum(w * s for w, s in zip(weights, scores))
    
    def detect_layout(self, image: np.ndarray) -> List[Dict]:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
        
        binary = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV, 15, 4
        )
        
        horizontal_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (40, 3))
        horizontal_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, horizontal_kernel)
        
        vertical_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 40))
        vertical_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, vertical_kernel)
        
        table_mask = cv2.add(horizontal_lines, vertical_lines)
        
        text_binary = cv2.subtract(binary, table_mask)
        
        dilate_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (25, 5))
        dilated_text = cv2.dilate(text_binary, dilate_kernel, iterations=1)
        
        text_contours, _ = cv2.findContours(dilated_text, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        table_contours, _ = cv2.findContours(table_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        regions = []
        h, w = image.shape[:2]
        
        for contour in text_contours:
            x, y, bw, bh = cv2.boundingRect(contour)
            
            if bw > 40 and bh > 12:
                region_type = self._classify_region_type(bw, bh, w, h, text_binary[y:y+bh, x:x+bw])
                
                padding = 5
                x1 = max(0, x - padding)
                y1 = max(0, y - padding)
                x2 = min(w, x + bw + padding)
                y2 = min(h, y + bh + padding)
                
                regions.append({
                    "bbox": [x1, y1, x2, y2],
                    "width": x2 - x1,
                    "height": y2 - y1,
                    "type": region_type,
                    "area_ratio": ((x2 - x1) * (y2 - y1)) / (w * h),
                    "is_table": False
                })
        
        for contour in table_contours:
            x, y, bw, bh = cv2.boundingRect(contour)
            
            if bw > 100 and bh > 50:
                regions.append({
                    "bbox": [x, y, x + bw, y + bh],
                    "width": bw,
                    "height": bh,
                    "type": "table",
                    "area_ratio": (bw * bh) / (w * h),
                    "is_table": True
                })
        
        regions = self._merge_close_regions(regions)
        regions = self._remove_duplicate_regions(regions, iou_threshold=0.4)
        regions = self._sort_reading_order(regions)
        
        return regions
    
    def _classify_region_type(self, bw: int, bh: int, img_w: int, img_h: int, 
                               region_gray: np.ndarray = None) -> str:
        width_ratio = bw / img_w
        height_ratio = bh / img_h
        
        if width_ratio > 0.7 and height_ratio < 0.04:
            return "heading"
        elif width_ratio > 0.6 and height_ratio < 0.08:
            return "section"
        elif height_ratio > 0.2 and width_ratio > 0.4:
            return "table"
        elif bh < 25:
            return "line"
        elif bh > img_h * 0.3:
            return "page_header"
        else:
            if region_gray is not None:
                dark_pixels = np.sum(region_gray < 128)
                total_pixels = region_gray.size
                if total_pixels > 0 and dark_pixels / total_pixels > 0.3:
                    return "text_block"
            return "block"
    
    def _merge_close_regions(self, regions: List[Dict], 
                              merge_threshold: int = 8) -> List[Dict]:
        if not regions:
            return regions
        
        merged = []
        used = set()
        
        sorted_regions = sorted(regions, key=lambda r: (r["bbox"][1], r["bbox"][0]))
        
        for i, r1 in enumerate(sorted_regions):
            if i in used:
                continue
            
            current = r1.copy()
            
            for j, r2 in enumerate(sorted_regions):
                if j <= i or j in used:
                    continue
                
                if self._regions_should_merge(current, r2, merge_threshold):
                    current = self._merge_two_regions(current, r2)
                    used.add(j)
            
            merged.append(current)
        
        return merged
    
    def _regions_should_merge(self, r1: Dict, r2: Dict, threshold: int) -> bool:
        x1, y1, x2, y2 = r1["bbox"]
        x3, y3, x4, y4 = r2["bbox"]
        
        overlaps_x = x1 - threshold <= x4 and x2 + threshold >= x3
        overlaps_y = y1 - threshold <= y4 and y2 + threshold >= y3
        
        if not (overlaps_x and overlaps_y):
            return False
        
        vertical_gap = max(0, max(y1, y3) - min(y2, y4))
        if vertical_gap > threshold * 3:
            return False
        
        r1_width = x2 - x1
        r2_width = x4 - x3
        width_diff = abs(r1_width - r2_width)
        if width_diff > max(r1_width, r2_width) * 0.5:
            return False
        
        return True
    
    def _merge_two_regions(self, r1: Dict, r2: Dict) -> Dict:
        x1, y1, x2, y2 = r1["bbox"]
        x3, y3, x4, y4 = r2["bbox"]
        
        return {
            "bbox": [min(x1, x3), min(y1, y3), max(x2, x4), max(y2, y4)],
            "width": max(x2, x4) - min(x1, x3),
            "height": max(y2, y4) - min(y1, y3),
            "type": "merged",
            "area_ratio": r1.get("area_ratio", 0) + r2.get("area_ratio", 0),
            "is_table": r1.get("is_table", False) or r2.get("is_table", False)
        }
    
    def _sort_reading_order(self, regions: List[Dict]) -> List[Dict]:
        return sorted(regions, key=lambda r: (r["bbox"][1], r["bbox"][0]))
    
    def create_enhanced_crops(self, image: np.ndarray, bbox: List[int], 
                               language: str) -> List[Tuple[str, np.ndarray]]:
        x1, y1, x2, y2 = [int(b) for b in bbox]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(image.shape[1], x2), min(image.shape[0], y2)
        
        crop = image[y1:y2, x1:x2]
        
        if crop.size == 0:
            return []
        
        crops = []
        
        crops.append(("original", crop))
        
        upscaled_15 = cv2.resize(crop, None, fx=1.5, fy=1.5, interpolation=cv2.INTER_CUBIC)
        crops.append(("1.5x", upscaled_15))
        
        upscaled_2 = cv2.resize(crop, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
        crops.append(("2x", upscaled_2))
        
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if len(crop.shape) == 3 else crop
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        enhanced_bgr = cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)
        crops.append(("contrast", enhanced_bgr))
        
        sharpened = self._multi_stage_sharpen(crop, {"sharpen_strength": 1.3})
        crops.append(("sharpened", sharpened))
        
        if language in ["hi", "te"]:
            bilateral = cv2.bilateralFilter(crop, 9, 75, 75)
            crops.append(("bilateral", bilateral))
        
        return crops
    
    def _remove_duplicate_regions(self, regions: List[Dict], 
                                   iou_threshold: float = 0.5) -> List[Dict]:
        """
        Remove duplicate/overlapping regions to prevent text duplication.
        Uses IoU (Intersection over Union) to detect significant overlaps.
        
        Args:
            regions: List of region dictionaries with 'bbox' key
            iou_threshold: IoU threshold to consider regions as duplicates (0.0-1.0)
            
        Returns:
            Deduplicated list of regions
        """
        if not regions or len(regions) <= 1:
            return regions
        
        # Sort by area (largest first) to keep larger regions
        sorted_regions = sorted(regions, key=lambda r: 
            (r["bbox"][2] - r["bbox"][0]) * (r["bbox"][3] - r["bbox"][1]), 
            reverse=True)
        
        keep = []
        removed = set()
        
        for i, r1 in enumerate(sorted_regions):
            if i in removed:
                continue
            
            keep.append(r1)
            
            x1, y1, x2, y2 = r1["bbox"]
            area1 = (x2 - x1) * (y2 - y1)
            
            for j, r2 in enumerate(sorted_regions):
                if j <= i or j in removed:
                    continue
                
                x3, y3, x4, y4 = r2["bbox"]
                
                # Calculate IoU
                inter_x1 = max(x1, x3)
                inter_y1 = max(y1, y3)
                inter_x2 = min(x2, x4)
                inter_y2 = min(y2, y4)
                
                if inter_x1 < inter_x2 and inter_y1 < inter_y2:
                    inter_area = (inter_x2 - inter_x1) * (inter_y2 - inter_y1)
                    area2 = (x4 - x3) * (y4 - y3)
                    union_area = area1 + area2 - inter_area
                    
                    if union_area > 0:
                        iou = inter_area / union_area
                        if iou > iou_threshold:
                            removed.add(j)
                        # Also check if one region is mostly inside another
                        elif inter_area / min(area1, area2) > 0.8:
                            removed.add(j)
        
        return keep
    
    def _sort_reading_order(self, regions: List[Dict]) -> List[Dict]:
        """
        Improved reading order for multi-column layouts.
        Groups regions into columns first, then sorts by Y within each column.
        
        Args:
            regions: List of region dictionaries with 'bbox' key
            
        Returns:
            Regions sorted in logical reading order
        """
        if not regions:
            return regions
        
        if len(regions) <= 2:
            return sorted(regions, key=lambda r: (r["bbox"][1], r["bbox"][0]))
        
        # Find page width from image dimensions (if available) or from max bbox
        max_x = max(r["bbox"][2] for r in regions)
        min_x = min(r["bbox"][0] for r in regions)
        page_width = max_x - min_x
        
        # Detect if single column or multi-column
        # Check for vertical gaps that indicate columns
        sorted_by_x = sorted(regions, key=lambda r: r["bbox"][0])
        
        # Find gaps between regions
        gaps = []
        for i in range(len(sorted_by_x) - 1):
            x2_current = sorted_by_x[i]["bbox"][2]
            x1_next = sorted_by_x[i + 1]["bbox"][0]
            gap = x1_next - x2_current
            if gap > 20:  # Significant gap
                gaps.append((gap, i))
        
        # If there's a large gap, it's likely multi-column
        if gaps and max(g for g, _ in gaps) > page_width * 0.15:
            # Sort by X first to identify columns
            return self._sort_multi_column_reading_order(regions)
        else:
            # Single column: sort by Y then X
            return sorted(regions, key=lambda r: (r["bbox"][1], r["bbox"][0]))
    
    def _sort_multi_column_reading_order(self, regions: List[Dict]) -> List[Dict]:
        """
        Sort regions in multi-column reading order.
        Groups into columns, then reads left-to-right, top-to-bottom within columns.
        """
        if not regions:
            return regions
        
        # Find column boundaries using clustering
        x_centers = [(r["bbox"][0] + r["bbox"][2]) / 2 for r in regions]
        
        # Simple column detection: group by x-center proximity
        sorted_by_x = sorted(range(len(regions)), key=lambda i: x_centers[i])
        
        columns = []
        current_col = [sorted_by_x[0]]
        
        for i in range(1, len(sorted_by_x)):
            idx = sorted_by_x[i]
            prev_idx = sorted_by_x[i - 1]
            
            # Check if this region belongs to same column
            x_diff = abs(x_centers[idx] - x_centers[prev_idx])
            bbox_width = regions[idx]["bbox"][2] - regions[idx]["bbox"][0]
            
            if x_diff < bbox_width * 0.5:
                current_col.append(idx)
            else:
                columns.append(current_col)
                current_col = [idx]
        
        columns.append(current_col)
        
        # Sort each column by Y position
        result = []
        for col_indices in columns:
            col_sorted = sorted(col_indices, key=lambda i: regions[i]["bbox"][1])
            for idx in col_sorted:
                result.append(regions[idx])
        
        return result
    
    def detect_table_structure(self, image: np.ndarray, 
                                bbox: List[int]) -> Dict:
        """
        Detect table structure within a region.
        Returns rows, columns, and cell information.
        
        Args:
            image: Input image
            bbox: Bounding box of table region
            
        Returns:
            Dictionary with table structure information
        """
        x1, y1, x2, y2 = [int(b) for b in bbox]
        crop = image[y1:y2, x1:x2]
        
        if crop.size == 0:
            return {"is_table": False, "rows": [], "cells": []}
        
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if len(crop.shape) == 3 else crop
        binary = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV, 15, 4
        )
        
        # Detect horizontal lines
        h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (40, 1))
        h_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, h_kernel)
        
        # Detect vertical lines
        v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 20))
        v_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, v_kernel)
        
        # Find horizontal line positions
        h_proj = np.sum(h_lines, axis=1)
        h_positions = np.where(h_proj > crop.shape[1] * 0.3 * 255)[0]
        
        # Find vertical line positions
        v_proj = np.sum(v_lines, axis=0)
        v_positions = np.where(v_proj > crop.shape[0] * 0.3 * 255)[0]
        
        # Extract rows based on horizontal lines
        rows = []
        if len(h_positions) > 1:
            for i in range(len(h_positions) - 1):
                row_y1 = h_positions[i]
                row_y2 = h_positions[i + 1]
                rows.append({
                    "y_range": [int(row_y1), int(row_y2)],
                    "height": int(row_y2 - row_y1)
                })
        
        # Extract cells based on row and column lines
        cells = []
        if rows and len(v_positions) > 1:
            for row in rows:
                for i in range(len(v_positions) - 1):
                    cell_x1 = v_positions[i]
                    cell_x2 = v_positions[i + 1]
                    cells.append({
                        "bbox": [
                            x1 + int(cell_x1), 
                            y1 + row["y_range"][0],
                            x1 + int(cell_x2), 
                            y1 + row["y_range"][1]
                        ],
                        "row_height": row["height"],
                        "col_width": int(cell_x2 - cell_x1)
                    })
        
        return {
            "is_table": len(h_positions) > 1 and len(v_positions) > 1,
            "rows": rows,
            "columns": len(v_positions) - 1,
            "cells": cells,
            "h_lines_count": len(h_positions),
            "v_lines_count": len(v_positions)
        }
