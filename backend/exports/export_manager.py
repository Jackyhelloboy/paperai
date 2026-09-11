import os
from typing import Dict, List
from docx import Document
from docx.shared import Pt, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from utils.config import settings

class ExportManager:
    def __init__(self):
        os.makedirs(settings.EXPORT_DIR, exist_ok=True)
    
    def export(self, result: Dict, format_type: str, job_id: str, filename: str) -> str:
        if format_type == "txt":
            return self._export_txt(result, job_id, filename)
        elif format_type == "docx":
            return self._export_docx(result, job_id, filename)
        elif format_type == "pdf":
            return self._export_pdf(result, job_id, filename)
        else:
            raise ValueError(f"Unsupported format: {format_type}")
    
    def _extract_text_content(self, result: Dict) -> str:
        pages = result.get("pages", [])
        all_text = []
        
        for page in pages:
            regions = page.get("regions", [])
            page_text = []
            
            for region in regions:
                text = region.get("text", "")
                if text.strip():
                    page_text.append(text)
            
            if page_text:
                all_text.append("\n".join(page_text))
        
        return "\n\n".join(all_text)
    
    def _export_txt(self, result: Dict, job_id: str, filename: str) -> str:
        output_path = os.path.join(settings.EXPORT_DIR, f"{job_id}.txt")
        
        text_content = self._extract_text_content(result)
        
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(f"PaperAI OCR Export\n")
            f.write(f"Source: {filename}\n")
            f.write(f"{'=' * 50}\n\n")
            f.write(text_content)
        
        return output_path
    
    def _export_docx(self, result: Dict, job_id: str, filename: str) -> str:
        output_path = os.path.join(settings.EXPORT_DIR, f"{job_id}.docx")
        
        doc = Document()
        
        title = doc.add_heading('PaperAI OCR Export', 0)
        title.alignment = WD_ALIGN_PARAGRAPH.CENTER
        
        source_para = doc.add_paragraph()
        source_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        source_run = source_para.add_run(f"Source: {filename}")
        source_run.font.size = Pt(12)
        source_run.font.color.rgb = None
        
        doc.add_paragraph()
        
        pages = result.get("pages", [])
        
        for page in pages:
            page_num = page.get("page_number", 1)
            
            if len(pages) > 1:
                page_heading = doc.add_heading(f'Page {page_num}', level=1)
            
            regions = page.get("regions", [])
            
            for region in regions:
                text = region.get("text", "")
                if not text.strip():
                    continue
                
                confidence_level = region.get("confidence_level", "medium")
                
                if confidence_level == "low":
                    style = doc.add_paragraph()
                    run = style.add_run(text)
                    run.font.color.rgb = None
                    run.font.highlight_color = 7
                elif confidence_level == "medium":
                    style = doc.add_paragraph()
                    run = style.add_run(text)
                    run.font.highlight_color = 6
                else:
                    doc.add_paragraph(text)
            
            if page != pages[-1]:
                doc.add_page_break()
        
        summary = result.get("confidence_summary", {})
        if summary:
            doc.add_paragraph()
            doc.add_heading('Confidence Summary', level=2)
            
            summary_items = [
                f"Total Regions: {summary.get('total_regions', 0)}",
                f"Verified: {summary.get('verified', 0)}",
                f"High Confidence: {summary.get('high_confidence', 0)}",
                f"Medium Confidence: {summary.get('medium_confidence', 0)}",
                f"Low Confidence: {summary.get('low_confidence', 0)}",
                f"Verification Rate: {summary.get('verification_rate', 0):.1%}"
            ]
            
            for item in summary_items:
                doc.add_paragraph(item, style='List Bullet')
        
        doc.save(output_path)
        
        return output_path
    
    def _export_pdf(self, result: Dict, job_id: str, filename: str) -> str:
        output_path = os.path.join(settings.EXPORT_DIR, f"{job_id}.pdf")
        
        doc = SimpleDocTemplate(
            output_path,
            pagesize=A4,
            rightMargin=72,
            leftMargin=72,
            topMargin=72,
            bottomMargin=72
        )
        
        styles = getSampleStyleSheet()
        
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=24,
            spaceAfter=30,
            alignment=1
        )
        
        subtitle_style = ParagraphStyle(
            'Subtitle',
            parent=styles['Normal'],
            fontSize=12,
            spaceAfter=20,
            alignment=1,
            textColor='grey'
        )
        
        content = []
        
        content.append(Paragraph("PaperAI OCR Export", title_style))
        content.append(Paragraph(f"Source: {filename}", subtitle_style))
        content.append(Spacer(1, 20))
        
        pages = result.get("pages", [])
        
        for page in pages:
            page_num = page.get("page_number", 1)
            
            if len(pages) > 1:
                page_heading_style = ParagraphStyle(
                    f'PageHeading{page_num}',
                    parent=styles['Heading2'],
                    fontSize=16,
                    spaceAfter=12
                )
                content.append(Paragraph(f"Page {page_num}", page_heading_style))
            
            regions = page.get("regions", [])
            
            for region in regions:
                text = region.get("text", "")
                if not text.strip():
                    continue
                
                escaped_text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                
                confidence_level = region.get("confidence_level", "medium")
                
                if confidence_level == "low":
                    text_style = ParagraphStyle(
                        'LowConfidence',
                        parent=styles['Normal'],
                        fontSize=11,
                        spaceAfter=8,
                        backColor='yellow'
                    )
                else:
                    text_style = ParagraphStyle(
                        'NormalText',
                        parent=styles['Normal'],
                        fontSize=11,
                        spaceAfter=8
                    )
                
                content.append(Paragraph(escaped_text, text_style))
            
            if page != pages[-1]:
                content.append(Spacer(1, 20))
        
        summary = result.get("confidence_summary", {})
        if summary:
            content.append(Spacer(1, 30))
            content.append(Paragraph("Confidence Summary", styles['Heading2']))
            
            summary_items = [
                f"Total Regions: {summary.get('total_regions', 0)}",
                f"Verified: {summary.get('verified', 0)}",
                f"High Confidence: {summary.get('high_confidence', 0)}",
                f"Medium Confidence: {summary.get('medium_confidence', 0)}",
                f"Low Confidence: {summary.get('low_confidence', 0)}",
                f"Verification Rate: {summary.get('verification_rate', 0):.1%}"
            ]
            
            for item in summary_items:
                content.append(Paragraph(f"• {item}", styles['Normal']))
        
        doc.build(content)
        
        return output_path
