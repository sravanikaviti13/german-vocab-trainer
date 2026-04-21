import sys
from pathlib import Path
import pdfplumber

pdf_path = Path(sys.argv[1])

with pdfplumber.open(pdf_path) as pdf:
    print(f"Total pages: {len(pdf.pages)}\n")
    for i, page in enumerate(pdf.pages[:3], start=1):
        text = page.extract_text() or ""
        images = page.images
        print(f"--- Page {i} ---")
        print(f"Characters extracted: {len(text)}")
        print(f"Images on page: {len(images)}")
        print(f"First 200 chars: {text[:200]!r}")
        print()