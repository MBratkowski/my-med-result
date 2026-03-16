from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT_DIR / "data"
STORAGE_DIR = ROOT_DIR / "storage"
PREVIEW_DIR = ROOT_DIR / "preview-cache"
DB_PATH = STORAGE_DIR / "med_results.db"
FRONTEND_DIST_DIR = ROOT_DIR / "frontend" / "dist"


def ensure_runtime_dirs() -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)

