import io
import logging
import os
import re
import shutil
import sys

import pytesseract
from PIL import Image
import fitz
from docx import Document as DocxDocument

logger = logging.getLogger("eziterms")


def _looks_like_windows_tesseract_path(raw: str) -> bool:
    """True if path is clearly a Windows install (copied .env must never win on Linux)."""
    s = raw.strip().strip("'\"")
    if not s:
        return False
    sl = s.lower()
    if sl.endswith(".exe"):
        return True
    # C:\... or C:/... or D:\...
    if re.match(r"^[a-zA-Z]:[/\\]", s):
        return True
    if "tesseract-ocr" in sl and ("\\" in s or "program files" in sl or "appdata" in sl):
        return True
    if "\\users\\" in sl or "/users/" in sl:
        return True
    return False


def _resolve_tesseract_cmd() -> str:
    """Resolve the tesseract binary path.

    On Linux/macOS we **prefer** PATH and standard locations before TESSERACT_EXE_PATH so a
    developer's Windows path in .env (load_dotenv override=True) cannot break production.
    """
    is_windows = os.name == "nt" or sys.platform.startswith("win")

    def tesseract_candidates() -> list[str]:
        out: list[str] = []
        w = shutil.which("tesseract")
        if w:
            out.append(w)
        for candidate in ("/usr/bin/tesseract", "/usr/local/bin/tesseract", "/opt/homebrew/bin/tesseract"):
            if os.path.isfile(candidate) and candidate not in out:
                out.append(candidate)
        return out

    if not is_windows:
        for cmd in tesseract_candidates():
            logger.info("Using system Tesseract (POSIX, ignores bad TESSERACT_EXE_PATH in .env): %s", cmd)
            return cmd

    env_path = os.getenv("TESSERACT_EXE_PATH", "").strip()
    if env_path:
        raw = env_path.strip("'\"")
        if not is_windows and _looks_like_windows_tesseract_path(raw):
            logger.warning(
                "Ignoring TESSERACT_EXE_PATH (Windows-style on POSIX): %s — use system tesseract or a Linux path",
                raw,
            )
        elif os.path.isfile(raw):
            logger.info("Using TESSERACT_EXE_PATH: %s", raw)
            return raw
        else:
            logger.warning("TESSERACT_EXE_PATH=%s is not a file — falling back", raw)

    if is_windows:
        for cmd in tesseract_candidates():
            logger.info("Using Tesseract: %s", cmd)
            return cmd

    return "tesseract"


pytesseract.pytesseract.tesseract_cmd = _resolve_tesseract_cmd()
logger.info("Tesseract binary resolved to: %s", pytesseract.pytesseract.tesseract_cmd)


def _pdf_to_text(file_bytes: bytes) -> str:
    text = ""
    with fitz.open(stream=file_bytes, filetype="pdf") as doc:
        for page in doc:
            text += page.get_text() or ""
    if text.strip():
        return text
    # PDF has no selectable text — fall back to OCR
    try:
        text = ""
        with fitz.open(stream=file_bytes, filetype="pdf") as doc:
            for page in doc:
                pix = page.get_pixmap(dpi=300)
                img = Image.open(io.BytesIO(pix.tobytes("png")))
                text += pytesseract.image_to_string(img, lang="eng")
        return text
    except pytesseract.TesseractNotFoundError:
        raise RuntimeError(
            "This PDF is image-based and requires OCR, but Tesseract is not installed on the server. "
            "Please install tesseract-ocr (apt install tesseract-ocr tesseract-ocr-eng) or upload a text-based PDF."
        )


def _txt_to_text(file_bytes: bytes) -> str:
    try:
        return file_bytes.decode("utf-8")
    except UnicodeDecodeError:
        return file_bytes.decode("latin-1")


def _docx_to_text(file_bytes: bytes) -> str:
    with io.BytesIO(file_bytes) as buf:
        doc = DocxDocument(buf)
        return "\n".join(p.text for p in doc.paragraphs)


MIME_PARSER = {
    "application/pdf": _pdf_to_text,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": _docx_to_text,
    "application/msword": _docx_to_text,
    "text/plain": _txt_to_text,
    "text/markdown": _txt_to_text,
}

EXT_PARSER = {
    ".pdf": _pdf_to_text,
    ".docx": _docx_to_text,
    ".txt": _txt_to_text,
    ".md": _txt_to_text,
}


def _mime_from_buffer(chunk: bytes) -> str | None:
    """
    Best-effort MIME from file bytes. Requires python-magic (file-magic), not the unrelated
    PyPI package named 'magic'. If import fails or API mismatches, returns None and callers
    fall back to extension-based parsing.
    """
    try:
        import magic
    except ImportError:
        return None
    try:
        if hasattr(magic, "from_buffer"):
            return magic.from_buffer(chunk, mime=True)
        # python-magic: Magic instance API
        m = magic.Magic(mime=True)
        return m.from_buffer(chunk)
    except (AttributeError, TypeError, UnicodeDecodeError, ValueError):
        return None
    except Exception:
        return None


def extract_text_from_upload(uploaded_file) -> str:
    """Extract text from an file-like object (read, seek, .name)."""
    chunk = uploaded_file.read(2048)
    uploaded_file.seek(0)
    mime_type = _mime_from_buffer(chunk)
    if mime_type is None or mime_type not in MIME_PARSER:
        name = getattr(uploaded_file, "name", None) or getattr(uploaded_file, "filename", "") or ""
        _, ext = os.path.splitext(name.lower())
        parser = EXT_PARSER.get(ext)
        if not parser:
            raise ValueError(f"Unsupported file type / extension: {ext}")
    else:
        parser = MIME_PARSER[mime_type]
    file_bytes = uploaded_file.read()
    return parser(file_bytes)


def extract_text_from_bytes(filename: str, file_bytes: bytes) -> str:
    """Extract text from raw bytes (same OCR/PDF path as upload)."""
    class _FileLike:
        def __init__(self, data: bytes, name: str):
            self._io = io.BytesIO(data)
            self.name = name

        def read(self, size=-1):
            return self._io.read(size)

        def seek(self, pos, whence=io.SEEK_SET):
            return self._io.seek(pos, whence)

    return extract_text_from_upload(_FileLike(file_bytes, filename))
