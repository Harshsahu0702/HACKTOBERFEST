# backend/database package
from backend.database.connection import get_db, is_db_connected, engine, SessionLocal
from backend.database.models import (
    Base,
    Junction,
    Camera,
    VehicleTrack,
    PlateDetection,
    VehicleObservation,
    BlacklistedVehicle,
    BlacklistEvent,
    Alert,
    ProcessingRun,
    SystemSetting,
)
