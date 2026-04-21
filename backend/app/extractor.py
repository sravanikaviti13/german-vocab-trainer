"""PDF text extraction (native + OCR fallback)."""
import os
import re
import shutil
from pathlib import Path

import pdfplumber
import pytesseract
from pdf2image import convert_from_path

_TESSERACT_CANDIDATES = [
    r"C:\Program Files\Tesseract-OCR\tesseract.exe",
    os.path.expandvars(r"%LOCALAPPDATA%\Programs\Tesseract-OCR\tesseract.exe"),
    shutil.which("tesseract"),
]
_TESSERACT_PATH = next((p for p in _TESSERACT_CANDIDATES if p and os.path.exists(p)), None)
if _TESSERACT_PATH:
    pytesseract.pytesseract.tesseract_cmd = _TESSERACT_PATH

_POPPLER_CANDIDATES = [
    r"C:\poppler\Library\bin",
    r"C:\Program Files\poppler\Library\bin",
    os.path.expandvars(r"%LOCALAPPDATA%\Programs\poppler\Library\bin"),
]
POPPLER_PATH = next((p for p in _POPPLER_CANDIDATES if os.path.exists(p)), None)


def _extract_native(pdf_path: Path, max_pages: int) -> str:
    parts = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages[:max_pages]:
            text = page.extract_text()
            if text:
                parts.append(text)
    return "\n".join(parts)


def _extract_ocr(pdf_path: Path, max_pages: int) -> str:
    print("  No text found — running OCR...")
    images = convert_from_path(
        pdf_path, first_page=1, last_page=max_pages,
        poppler_path=POPPLER_PATH, dpi=300,
    )
    parts = []
    for i, image in enumerate(images, start=1):
        print(f"  OCR page {i}/{len(images)}...")
        parts.append(pytesseract.image_to_string(image, lang="deu"))
    return "\n".join(parts)


def _clean(text: str) -> str:
    text = re.sub(r"-\s*\n\s*", "", text)
    text = re.sub(r"\s+", " ", text)
    return text


def extract_text_from_pdf(pdf_path: Path, max_pages: int = 10) -> str:
    print(f"Reading up to {max_pages} pages from {pdf_path.name}")
    text = _extract_native(pdf_path, max_pages)
    if len(text.strip()) < 50:
        text = _extract_ocr(pdf_path, max_pages)
    text = _clean(text)
    print(f"  Extracted {len(text)} characters")
    return text