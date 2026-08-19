import io
import re
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

import pytesseract
from PIL import Image, ImageOps
from pypdf import PdfReader

BLOOD_GROUP_PATTERN = re.compile(r"\b(?:A|B|AB|O)\s*[+-]|\bBOMBAY\b", re.IGNORECASE)
DATE_PATTERNS = [
    re.compile(r"\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b"),
    re.compile(r"\b(\d{4})-(\d{1,2})-(\d{1,2})\b"),
]


@dataclass(frozen=True, slots=True)
class OcrResult:
    status: str
    text: str
    fields: dict
    error_code: str | None = None


def _normalize_blood_group(value: str) -> str:
    normalized = re.sub(r"\s+", "", value.upper())
    return "BOMBAY" if normalized == "BOMBAY" else normalized


def _dates(text: str) -> list[date]:
    values: list[date] = []
    for index, pattern in enumerate(DATE_PATTERNS):
        for match in pattern.finditer(text):
            try:
                if index == 0:
                    day, month, year = map(int, match.groups())
                    year += 2000 if year < 100 else 0
                else:
                    year, month, day = map(int, match.groups())
                parsed = date(year, month, day)
                # Render may still be on the prior UTC date while an Indian
                # facility has crossed midnight; accept at most one day ahead.
                if date(2000, 1, 1) <= parsed <= date.today() + timedelta(days=1):
                    values.append(parsed)
            except ValueError:
                continue
    return sorted(set(values), reverse=True)


def _facility_candidates(text: str) -> list[str]:
    candidates = []
    for raw_line in text.splitlines():
        line = " ".join(raw_line.split()).strip(" -:|")
        if 4 <= len(line) <= 160 and re.search(r"\b(hospital|blood bank|medical|clinic|health centre|health center)\b", line, re.I):
            candidates.append(line)
    return candidates[:5]


def extract_fields(text: str) -> dict:
    groups = sorted({_normalize_blood_group(match.group(0)) for match in BLOOD_GROUP_PATTERN.finditer(text)})
    dates = _dates(text)
    return {
        "blood_groups": groups,
        "document_dates": [item.isoformat() for item in dates[:8]],
        "facility_candidates": _facility_candidates(text),
        "character_count": len(text),
    }


def _image_text(content: bytes) -> str:
    with Image.open(io.BytesIO(content)) as image:
        prepared = ImageOps.autocontrast(image.convert("L"))
        if max(prepared.size) > 2400:
            prepared.thumbnail((2400, 2400))
        return pytesseract.image_to_string(prepared, lang="eng", config="--psm 6")


def _pdf_text(content: bytes) -> str:
    reader = PdfReader(io.BytesIO(content))
    return "\n".join((page.extract_text() or "") for page in reader.pages[:5])


def extract_requisition(content: bytes, content_type: str) -> OcrResult:
    try:
        text = _pdf_text(content) if content_type == "application/pdf" else _image_text(content)
    except Exception as exc:  # OCR failure is recorded; it never auto-verifies a request.
        return OcrResult("PROCESSING_FAILED", "", {}, type(exc).__name__[:80])
    normalized = "\n".join(line.strip() for line in text.splitlines() if line.strip())[:50_000]
    if len(normalized) < 12:
        return OcrResult("NO_TEXT_REVIEW_REQUIRED", normalized, extract_fields(normalized), "NO_READABLE_TEXT")
    return OcrResult("EXTRACTED_REVIEW_REQUIRED", normalized, extract_fields(normalized))


def match_requisition(fields: dict, *, blood_type: str, facility_name: str) -> tuple[str, date | None, list[str]]:
    reasons: list[str] = []
    groups = {str(value).upper() for value in fields.get("blood_groups", [])}
    if blood_type.upper() not in groups:
        reasons.append("BLOOD_GROUP_NOT_FOUND_OR_MISMATCH")
    parsed_dates = []
    for value in fields.get("document_dates", []):
        try:
            parsed_dates.append(date.fromisoformat(value))
        except (TypeError, ValueError):
            continue
    document_date = max(parsed_dates, default=None)
    if document_date is None:
        reasons.append("DOCUMENT_DATE_NOT_FOUND")
    elif abs((datetime.now(UTC).date() - document_date).days) > 1:
        reasons.append("DOCUMENT_NOT_WITHIN_24_HOURS")
    facility_tokens = {token for token in re.findall(r"[a-z0-9]+", facility_name.lower()) if len(token) > 3}
    extracted = " ".join(fields.get("facility_candidates", [])).lower()
    if facility_tokens and not any(token in extracted for token in facility_tokens):
        reasons.append("FACILITY_NAME_NOT_CONFIRMED_BY_OCR")
    status = "OCR_MATCHED_REVIEW_REQUIRED" if not reasons else "OCR_MISMATCH_REVIEW_REQUIRED"
    return status, document_date, reasons
