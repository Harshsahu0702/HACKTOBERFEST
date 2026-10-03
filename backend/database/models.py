"""
backend/database/models.py

SQLAlchemy ORM models for SIH 2026 Traffic Intelligence Platform.
Defines 10 normalized relational tables with clean foreign keys,
constraints, and performance indexes.
"""

from datetime import datetime
from sqlalchemy import (
    Column,
    Integer,
    BigInteger,
    String,
    Float,
    Double,
    Boolean,
    DateTime,
    Text,
    ForeignKey,
    Index,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from backend.database.connection import Base


class Junction(Base):
    __tablename__ = "junctions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    junction_code = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=False)
    latitude = Column(Double, nullable=False)
    longitude = Column(Double, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    cameras = relationship("Camera", back_populates="junction", cascade="all, delete-orphan")
    observations = relationship("VehicleObservation", back_populates="junction")


class Camera(Base):
    __tablename__ = "cameras"

    id = Column(Integer, primary_key=True, autoincrement=True)
    camera_code = Column(String(100), unique=True, nullable=False, index=True)
    camera_name = Column(String(100), nullable=False)
    junction_id = Column(Integer, ForeignKey("junctions.id", ondelete="CASCADE"), nullable=False, index=True)
    video_path = Column(String(255), nullable=True)
    latitude = Column(Double, nullable=False)
    longitude = Column(Double, nullable=False)
    status = Column(String(20), default="active")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    junction = relationship("Junction", back_populates="cameras")
    vehicle_tracks = relationship("VehicleTrack", back_populates="camera")
    plate_detections = relationship("PlateDetection", back_populates="camera")
    observations = relationship("VehicleObservation", back_populates="camera")
    blacklist_events = relationship("BlacklistEvent", back_populates="camera")
    alerts = relationship("Alert", back_populates="camera")


class VehicleTrack(Base):
    __tablename__ = "vehicle_tracks"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    camera_id = Column(Integer, ForeignKey("cameras.id", ondelete="CASCADE"), nullable=False, index=True)
    track_id = Column(Integer, nullable=False, index=True)
    vehicle_type = Column(String(50), default="car")
    first_frame = Column(Integer, nullable=True)
    last_frame = Column(Integer, nullable=True)
    first_timestamp = Column(Float, nullable=True)
    last_timestamp = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    camera = relationship("Camera", back_populates="vehicle_tracks")
    plate_detections = relationship("PlateDetection", back_populates="vehicle_track")

    __table_args__ = (
        Index("idx_vt_cam_track", "camera_id", "track_id"),
    )


class PlateDetection(Base):
    __tablename__ = "plate_detections"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    vehicle_track_id = Column(BigInteger, ForeignKey("vehicle_tracks.id", ondelete="SET NULL"), nullable=True, index=True)
    camera_id = Column(Integer, ForeignKey("cameras.id", ondelete="CASCADE"), nullable=False, index=True)
    plate_text = Column(String(32), nullable=False)
    normalized_plate = Column(String(32), nullable=False, index=True)
    ocr_confidence = Column(Float, default=0.0)
    plate_detection_confidence = Column(Float, default=0.0)
    timestamp_sec = Column(Float, nullable=False, index=True)
    frame_number = Column(Integer, nullable=True)
    plate_image = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    vehicle_track = relationship("VehicleTrack", back_populates="plate_detections")
    camera = relationship("Camera", back_populates="plate_detections")
    observations = relationship("VehicleObservation", back_populates="plate_detection")
    blacklist_events = relationship("BlacklistEvent", back_populates="plate_detection")
    alerts = relationship("Alert", back_populates="plate_detection")

    __table_args__ = (
        Index("idx_pd_norm_plate_time", "normalized_plate", "timestamp_sec"),
    )


class VehicleObservation(Base):
    __tablename__ = "vehicle_observations"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    plate_detection_id = Column(BigInteger, ForeignKey("plate_detections.id", ondelete="CASCADE"), nullable=False, index=True)
    camera_id = Column(Integer, ForeignKey("cameras.id", ondelete="CASCADE"), nullable=False, index=True)
    junction_id = Column(Integer, ForeignKey("junctions.id", ondelete="CASCADE"), nullable=False, index=True)
    timestamp_sec = Column(Float, nullable=False, index=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    direction = Column(String(50), default="forward")
    created_at = Column(DateTime, default=datetime.utcnow)

    plate_detection = relationship("PlateDetection", back_populates="observations")
    camera = relationship("Camera", back_populates="observations")
    junction = relationship("Junction", back_populates="observations")


class BlacklistedVehicle(Base):
    __tablename__ = "blacklisted_vehicles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    plate_number = Column(String(32), nullable=False)
    normalized_plate = Column(String(32), unique=True, nullable=False, index=True)
    reason = Column(String(255), nullable=False, default="Wanted / suspicious vehicle")
    priority = Column(String(20), nullable=False, default="HIGH")  # HIGH, MEDIUM, LOW
    is_active = Column(Boolean, default=True, index=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    events = relationship("BlacklistEvent", back_populates="blacklist_vehicle", cascade="all, delete-orphan")


class BlacklistEvent(Base):
    __tablename__ = "blacklist_events"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    blacklist_vehicle_id = Column(Integer, ForeignKey("blacklisted_vehicles.id", ondelete="CASCADE"), nullable=False, index=True)
    plate_detection_id = Column(BigInteger, ForeignKey("plate_detections.id", ondelete="SET NULL"), nullable=True, index=True)
    camera_id = Column(Integer, ForeignKey("cameras.id", ondelete="CASCADE"), nullable=False, index=True)
    junction_id = Column(Integer, ForeignKey("junctions.id", ondelete="CASCADE"), nullable=False, index=True)
    detected_at = Column(DateTime, default=datetime.utcnow, index=True)
    timestamp_sec = Column(Float, nullable=False)
    confidence = Column(Float, default=0.0)
    status = Column(String(30), default="NEW")  # NEW, ACKNOWLEDGED, RESOLVED
    created_at = Column(DateTime, default=datetime.utcnow)

    blacklist_vehicle = relationship("BlacklistedVehicle", back_populates="events")
    plate_detection = relationship("PlateDetection", back_populates="blacklist_events")
    camera = relationship("Camera", back_populates="blacklist_events")

    __table_args__ = (
        Index("idx_be_cam_detected", "camera_id", "detected_at"),
    )


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    alert_type = Column(String(50), nullable=False, default="BLACKLIST_MATCH")  # BLACKLIST_MATCH, SPEED_ANOMALY, etc.
    severity = Column(String(20), nullable=False, default="HIGH")  # CRITICAL, HIGH, MEDIUM, LOW
    plate_number = Column(String(32), nullable=False, index=True)
    camera_id = Column(Integer, ForeignKey("cameras.id", ondelete="CASCADE"), nullable=False, index=True)
    junction_id = Column(Integer, ForeignKey("junctions.id", ondelete="CASCADE"), nullable=False, index=True)
    plate_detection_id = Column(BigInteger, ForeignKey("plate_detections.id", ondelete="SET NULL"), nullable=True, index=True)
    message = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    camera = relationship("Camera", back_populates="alerts")
    plate_detection = relationship("PlateDetection", back_populates="alerts")


class ProcessingRun(Base):
    __tablename__ = "processing_runs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    source_video = Column(String(255), nullable=False)
    camera_id = Column(Integer, ForeignKey("cameras.id", ondelete="SET NULL"), nullable=True)
    status = Column(String(50), default="COMPLETED")
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    frames_processed = Column(Integer, default=0)
    detections_count = Column(Integer, default=0)
    plates_detected = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)


class SystemSetting(Base):
    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    setting_key = Column(String(100), unique=True, nullable=False, index=True)
    setting_value = Column(Text, nullable=False)
    description = Column(String(255), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
