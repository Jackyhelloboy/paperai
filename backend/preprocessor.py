import cv2
import numpy as np
from typing import Optional


class ImagePreprocessor:
    def process(self, image: np.ndarray, mode: str = "auto") -> np.ndarray:
        if mode == "none":
            return image

        quality = self._analyze(image)

        if mode == "aggressive":
            return self._aggressive_pipeline(image, quality)
        elif mode == "auto":
            return self._auto_pipeline(image, quality)
        else:
            return image

    def _analyze(self, image: np.ndarray) -> dict:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
        return {
            "blur": cv2.Laplacian(gray, cv2.CV_64F).var(),
            "brightness": float(np.mean(gray)),
            "contrast": float(np.std(gray)),
            "noise": float(self._estimate_noise(gray)),
            "skew": self._detect_skew(gray),
        }

    def _estimate_noise(self, gray: np.ndarray) -> float:
        M = np.array([[-1, -1, -1], [-1, 8, -1], [-1, -1, -1]])
        filtered = cv2.filter2D(gray, cv2.CV_64F, M)
        return float(np.std(filtered))

    def _detect_skew(self, gray: np.ndarray) -> float:
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

    def _auto_pipeline(self, image: np.ndarray, quality: dict) -> np.ndarray:
        img = image.copy()

        if abs(quality["skew"]) > 0.5:
            img = self._rotate(img, quality["skew"])

        img = self._remove_shadows(img)

        if quality["brightness"] < 100:
            img = cv2.convertScaleAbs(img, alpha=1.1, beta=15)
        elif quality["brightness"] > 180:
            img = cv2.convertScaleAbs(img, alpha=0.9, beta=-10)

        if quality["contrast"] < 40:
            lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
            l, a, b = cv2.split(lab)
            clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(6, 6))
            l = clahe.apply(l)
            img = cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)

        if quality["noise"] > 30:
            img = cv2.fastNlMeansDenoisingColored(img, None, 10, 10, 7, 21)
        elif quality["noise"] > 20:
            img = cv2.fastNlMeansDenoisingColored(img, None, 5, 5, 7, 21)

        if quality["blur"] < 200:
            gaussian = cv2.GaussianBlur(img, (0, 0), 3)
            img = cv2.addWeighted(img, 1.5, gaussian, -0.5, 0)

        h, w = img.shape[:2]
        if max(h, w) < 1500:
            scale = 1500 / max(h, w)
            img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

        return img

    def _aggressive_pipeline(self, image: np.ndarray, quality: dict) -> np.ndarray:
        img = self._auto_pipeline(image, quality)

        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img

        clahe = cv2.createCLAHE(clipLimit=4.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)

        _, binary = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

        kernel = np.ones((2, 2), np.uint8)
        cleaned = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)

        return cv2.cvtColor(cleaned, cv2.COLOR_GRAY2BGR)

    def _rotate(self, image: np.ndarray, angle: float) -> np.ndarray:
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
            shift = (normalized.astype(np.int16) - gray.astype(np.int16))
            b = np.clip(b.astype(np.int16) + shift, 0, 255).astype(np.uint8)
            g = np.clip(g.astype(np.int16) + shift, 0, 255).astype(np.uint8)
            r = np.clip(r.astype(np.int16) + shift, 0, 255).astype(np.uint8)
            return cv2.merge([b, g, r])

        return normalized
