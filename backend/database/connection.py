"""
backend/database/connection.py

MySQL Database Connection & Session Management for SIH 2026.
Uses SQLAlchemy with PyMySQL driver and environment variable configuration.
Resilient: does not crash if MySQL is starting or temporarily offline.
"""

import os
from pathlib import Path
from typing import Generator, Optional
from urllib.parse import quote_plus

# Safe optional load of dotenv
PROJECT_ROOT = Path(__file__).resolve().parents[2]
try:
    from dotenv import load_dotenv
    load_dotenv(PROJECT_ROOT / ".env", override=True)
except ImportError:
    # Lightweight fallback parser if python-dotenv is absent
    env_file = PROJECT_ROOT / ".env"
    if env_file.exists():
        try:
            with open(env_file, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip().strip("'").strip('"')
                        if k not in os.environ:
                            os.environ[k] = v
        except Exception:
            pass

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base

raw_db_url = os.getenv("DATABASE_URL") or os.getenv("MYSQL_URL")
if raw_db_url:
    # Ensure pymysql dialect driver prefix for SQLAlchemy
    if raw_db_url.startswith("mysql://"):
        DATABASE_URL = raw_db_url.replace("mysql://", "mysql+pymysql://", 1)
    else:
        DATABASE_URL = raw_db_url
else:
    DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
    DB_PORT = os.getenv("DB_PORT", "3306")
    DB_USER = os.getenv("DB_USER", "root")
    DB_PASSWORD = os.getenv("DB_PASSWORD", "")
    DB_NAME = os.getenv("DB_NAME", "sih_traffic_intelligence")
    encoded_password = quote_plus(DB_PASSWORD) if DB_PASSWORD else ""
    DATABASE_URL = f"mysql+pymysql://{DB_USER}:{encoded_password}@{DB_HOST}:{DB_PORT}/{DB_NAME}?charset=utf8mb4"

Base = declarative_base()

try:
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_recycle=3600,
        pool_size=10,
        max_overflow=20,
        connect_args={"connect_timeout": 3},
        echo=False,
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
except Exception as e:
    print(f"[database.connection] Engine creation error: {e}")
    engine = None
    SessionLocal = None


def is_db_connected() -> bool:
    """Test if MySQL database is active, reachable, and responsive."""
    if engine is None:
        return False
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


def get_db() -> Generator:
    """FastAPI Dependency for database session management."""
    if SessionLocal is None:
        yield None
        return

    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
