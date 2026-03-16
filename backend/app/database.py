import sqlite3
from pathlib import Path

from .config import DB_PATH, ensure_runtime_dirs


def get_connection(db_path: Path | None = None) -> sqlite3.Connection:
    ensure_runtime_dirs()
    connection = sqlite3.connect(str(db_path or DB_PATH))
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_db(db_path: Path | None = None) -> None:
    connection = get_connection(db_path)
    schema_path = Path(__file__).with_name("schema.sql")
    try:
        connection.executescript(schema_path.read_text(encoding="utf-8"))
        columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(lab_results)").fetchall()
        }
        if "normalization_note" not in columns:
            connection.execute("ALTER TABLE lab_results ADD COLUMN normalization_note TEXT")
        if "original_unit" not in columns:
            connection.execute("ALTER TABLE lab_results ADD COLUMN original_unit TEXT")
        connection.commit()
    finally:
        connection.close()
