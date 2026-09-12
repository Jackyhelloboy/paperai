import os
import json
import time
from typing import Dict, List
from difflib import SequenceMatcher


class OCREvaluator:
    def __init__(self):
        self.data_dir = os.path.join(os.path.dirname(__file__), "training_data")
        self.corrections_dir = os.path.join(self.data_dir, "corrections")
        os.makedirs(self.corrections_dir, exist_ok=True)
        self.stats_path = os.path.join(self.data_dir, "stats.json")
        self._stats = self._load_stats()

    def _load_stats(self) -> dict:
        if os.path.exists(self.stats_path):
            try:
                with open(self.stats_path, "r") as f:
                    return json.load(f)
            except:
                pass
        return {
            "total_corrections": 0,
            "total_evaluations": 0,
            "avg_accuracy": 0,
            "accuracy_history": [],
            "common_errors": [],
            "language_stats": {}
        }

    def _save_stats(self):
        with open(self.stats_path, "w") as f:
            json.dump(self._stats, f, indent=2, ensure_ascii=False)

    def save_correction(self, job_id: str, filename: str, extracted: str, corrections: dict):
        data = {
            "job_id": job_id,
            "filename": filename,
            "extracted": extracted,
            "corrections": corrections,
            "timestamp": time.time()
        }

        path = os.path.join(self.corrections_dir, f"{job_id}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        self._stats["total_corrections"] += 1
        self._analyze_correction(extracted, corrections)
        self._save_stats()

    def _analyze_correction(self, extracted: str, corrections: dict):
        if "corrected_text" in corrections:
            accuracy = self.calculate_metrics(extracted, corrections["corrected_text"])
            self._stats["accuracy_history"].append({
                "accuracy": accuracy["overall"],
                "timestamp": time.time()
            })
            if len(self._stats["accuracy_history"]) > 1000:
                self._stats["accuracy_history"] = self._stats["accuracy_history"][-1000:]

    def calculate_metrics(self, text: str, expected: str) -> dict:
        self._stats["total_evaluations"] += 1

        text_norm = text.lower().strip()
        expected_norm = expected.lower().strip()

        matcher = SequenceMatcher(None, expected_norm, text_norm)
        char_accuracy = sum(b.size for b in matcher.get_matching_blocks()) / max(len(expected_norm), 1)

        expected_words = set(expected_norm.split())
        text_words = set(text_norm.split())
        word_accuracy = len(expected_words & text_words) / max(len(expected_words), 1)

        seq_similarity = SequenceMatcher(None, expected_norm, text_norm).ratio()

        overall = char_accuracy * 0.3 + word_accuracy * 0.3 + seq_similarity * 0.4

        metrics = {
            "char_accuracy": round(char_accuracy * 100, 2),
            "word_accuracy": round(word_accuracy * 100, 2),
            "sequence_similarity": round(seq_similarity * 100, 2),
            "overall": round(overall * 100, 2)
        }

        prev_avg = self._stats.get("avg_accuracy", 0)
        total = self._stats.get("total_evaluations", 1)
        self._stats["avg_accuracy"] = round(
            (prev_avg * (total - 1) + overall * 100) / total, 2
        )
        self._save_stats()

        return metrics

    def get_stats(self) -> dict:
        corrections = self._load_all_corrections()
        lang_stats = {}
        for c in corrections:
            lang = c.get("language", "unknown")
            if lang not in lang_stats:
                lang_stats[lang] = 0
            lang_stats[lang] += 1

        recent_accuracy = []
        for h in self._stats.get("accuracy_history", [])[-20:]:
            recent_accuracy.append(h["accuracy"])

        return {
            "total_corrections": self._stats.get("total_corrections", 0),
            "total_evaluations": self._stats.get("total_evaluations", 0),
            "avg_accuracy": self._stats.get("avg_accuracy", 0),
            "recent_accuracy": round(sum(recent_accuracy) / max(len(recent_accuracy), 1), 2),
            "language_stats": lang_stats,
            "improvement_trend": self._calculate_trend()
        }

    def _calculate_trend(self) -> str:
        history = self._stats.get("accuracy_history", [])
        if len(history) < 10:
            return "insufficient_data"

        recent = [h["accuracy"] for h in history[-10:]]
        older = [h["accuracy"] for h in history[-20:-10]] if len(history) >= 20 else recent

        recent_avg = sum(recent) / len(recent)
        older_avg = sum(older) / len(older)

        if recent_avg > older_avg + 2:
            return "improving"
        elif recent_avg < older_avg - 2:
            return "declining"
        return "stable"

    def _load_all_corrections(self) -> List[dict]:
        corrections = []
        if not os.path.exists(self.corrections_dir):
            return corrections
        for fname in os.listdir(self.corrections_dir):
            if fname.endswith(".json"):
                try:
                    with open(os.path.join(self.corrections_dir, fname), "r") as f:
                        corrections.append(json.load(f))
                except:
                    pass
        return corrections
