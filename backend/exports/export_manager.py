import os
from datetime import datetime


class ExportManager:
    def export(self, result: dict, format_type: str, job_id: str, filename: str) -> str:
        export_dir = os.path.join(os.path.dirname(__file__), "exports")
        os.makedirs(export_dir, exist_ok=True)
        
        base_name = os.path.splitext(filename)[0]
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        if format_type == "txt":
            return self._export_txt(result, export_dir, base_name, timestamp)
        elif format_type == "docx":
            return self._export_docx(result, export_dir, base_name, timestamp)
        elif format_type == "pdf":
            return self._export_pdf(result, export_dir, base_name, timestamp)
        else:
            raise ValueError(f"Unsupported format: {format_type}")
    
    def _get_text(self, result: dict) -> str:
        if not result:
            return ""
        pages = result.get("pages", [])
        texts = []
        for page in pages:
            texts.append(page.get("full_text", ""))
        return "\n\n".join(texts)
    
    def _export_txt(self, result: dict, export_dir: str, base_name: str, timestamp: str) -> str:
        text = self._get_text(result)
        filepath = os.path.join(export_dir, f"{base_name}_{timestamp}.txt")
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(text)
        return filepath
    
    def _export_docx(self, result: dict, export_dir: str, base_name: str, timestamp: str) -> str:
        text = self._get_text(result)
        filepath = os.path.join(export_dir, f"{base_name}_{timestamp}.docx")
        try:
            from docx import Document
            doc = Document()
            for paragraph in text.split("\n"):
                doc.add_paragraph(paragraph)
            doc.save(filepath)
        except ImportError:
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(text)
        return filepath
    
    def _export_pdf(self, result: dict, export_dir: str, base_name: str, timestamp: str) -> str:
        text = self._get_text(result)
        filepath = os.path.join(export_dir, f"{base_name}_{timestamp}.pdf")
        try:
            from reportlab.lib.pagesizes import A4
            from reportlab.pdfgen import canvas
            c = canvas.Canvas(filepath, pagesize=A4)
            y = 750
            for line in text.split("\n"):
                if y < 50:
                    c.showPage()
                    y = 750
                c.drawString(50, y, line[:100])
                y -= 15
            c.save()
        except ImportError:
            txt_path = filepath.replace(".pdf", ".txt")
            with open(txt_path, "w", encoding="utf-8") as f:
                f.write(text)
            return txt_path
        return filepath
