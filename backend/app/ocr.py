from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass
from pathlib import Path

from .config import PREVIEW_DIR


@dataclass(slots=True)
class OCRPage:
    page_number: int
    preview_path: Path
    text: str


@dataclass(slots=True)
class OCRDocument:
    page_count: int
    pages: list[OCRPage]


class OCRService:
    def get_page_count(self, pdf_path: Path) -> int:
        completed = subprocess.run(
            ["pdfinfo", str(pdf_path)],
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        match = re.search(r"^Pages:\s+(\d+)$", completed.stdout, re.MULTILINE)
        if not match:
            raise RuntimeError(f"Could not determine page count for {pdf_path}")
        return int(match.group(1))

    def process(self, pdf_path: Path, document_hash: str) -> OCRDocument:
        page_count = self.get_page_count(pdf_path)
        output_dir = PREVIEW_DIR / document_hash
        output_dir.mkdir(parents=True, exist_ok=True)

        subprocess.run(
            ["pdftoppm", "-f", "1", "-l", str(page_count), "-r", "200", str(pdf_path), "page"],
            cwd=output_dir,
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )

        pages: list[OCRPage] = []
        for index in range(1, page_count + 1):
            ppm_name = f"page-{index:06d}.ppm"
            png_name = f"page-{index:06d}.png"
            ppm_path = output_dir / ppm_name
            png_path = output_dir / png_name

            if not png_path.exists():
                subprocess.run(
                    ["sips", "-s", "format", "png", ppm_name, "--out", png_name],
                    cwd=output_dir,
                    check=True,
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                )
            if ppm_path.exists():
                ppm_path.unlink()

            completed = subprocess.run(
                ["tesseract", png_name, "stdout", "-l", "eng", "--psm", "6"],
                cwd=output_dir,
                check=True,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
            )

            pages.append(
                OCRPage(
                    page_number=index,
                    preview_path=png_path,
                    text=completed.stdout,
                )
            )

        return OCRDocument(page_count=page_count, pages=pages)
