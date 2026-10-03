"""
backend/services/anomaly_service.py

Deterministic and Explainable Route Anomaly Detection Engine for SIH 2026.
Detects mathematically and physically implausible vehicle transit patterns.
Strictly rules-based, deterministic, explainable — NO fabricated "AI" anomalies.
"""

from typing import Dict, List, Any
from collections import defaultdict
from backend.services.analytics_engine import haversine_distance_meters


class AnomalyDetectionEngine:
    """
    Evaluates multi-camera journeys against physical and temporal constraints:
    1. Implausible transit speed / abnormally short transit time between cameras
    2. Simultaneous sightings across distant cameras (possible cloned plate)
    3. Inverted or anomalous chronological sequence
    """

    def detect_anomalies(
        self,
        detections: List[Dict[str, Any]],
        cameras: Dict[str, Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        anomalies = []

        # Group detections by plate
        by_plate = defaultdict(list)
        for d in detections:
            if d.get("plate"):
                by_plate[d["plate"]].append(d)

        for plate, p_dets in by_plate.items():
            if len(p_dets) < 2:
                continue

            # Sort chronological by start timestamp
            sorted_dets = sorted(p_dets, key=lambda x: float(x.get("timestamp_sec", 0.0)))

            for i in range(1, len(sorted_dets)):
                prev = sorted_dets[i - 1]
                curr = sorted_dets[i]

                c_prev_id = prev.get("camera_id")
                c_curr_id = curr.get("camera_id")

                if c_prev_id == c_curr_id:
                    continue

                cam_prev = cameras.get(c_prev_id)
                cam_curr = cameras.get(c_curr_id)

                if not cam_prev or not cam_curr:
                    continue

                dist_m = haversine_distance_meters(
                    cam_prev["lat"], cam_prev["lng"],
                    cam_curr["lat"], cam_curr["lng"]
                )

                t_prev = float(prev.get("timestamp_sec", 0.0))
                t_curr = float(curr.get("timestamp_sec", 0.0))
                dt = t_curr - t_prev

                # Case 1: Simultaneous distant observations (< 0.5s apart, distance > 50m)
                if abs(dt) < 0.5 and dist_m > 50.0:
                    anomalies.append({
                        "anomaly_id": f"ANOM_SIM_{plate}_{i}",
                        "alert_type": "ROUTE_ANOMALY",
                        "anomaly_type": "SIMULTANEOUS_DISTANT_OBSERVATION",
                        "plate": plate,
                        "severity": "CRITICAL",
                        "priority": "HIGH",
                        "camera_sequence": [c_prev_id, c_curr_id],
                        "cameras_label": f"{cam_prev.get('camera_name', c_prev_id)} & {cam_curr.get('camera_name', c_curr_id)}",
                        "timestamp_sequence": [round(t_prev, 2), round(t_curr, 2)],
                        "timestamp_sec": round(t_curr, 2),
                        "distance_m": round(dist_m, 1),
                        "elapsed_time_sec": round(dt, 2),
                        "calculated_speed_kmh": None,
                        "reason": f"Vehicle observed at two distant cameras ({dist_m:.0f}m apart) within {dt:.2f}s (Possible duplicate/clone plate).",
                    })

                # Case 2: Implausible high-speed transition (speed > 135 km/h for verified distance)
                elif dt > 0 and dist_m > 5.0:
                    speed_kmh = (dist_m / dt) * 3.6
                    if speed_kmh > 135.0:
                        anomalies.append({
                            "anomaly_id": f"ANOM_SPD_{plate}_{i}",
                            "alert_type": "ROUTE_ANOMALY",
                            "anomaly_type": "IMPLAUSIBLE_TRANSIT_SPEED",
                            "plate": plate,
                            "severity": "WARNING",
                            "priority": "MEDIUM",
                            "camera_sequence": [c_prev_id, c_curr_id],
                            "cameras_label": f"{cam_prev.get('camera_name', c_prev_id)} → {cam_curr.get('camera_name', c_curr_id)}",
                            "timestamp_sequence": [round(t_prev, 2), round(t_curr, 2)],
                            "timestamp_sec": round(t_curr, 2),
                            "distance_m": round(dist_m, 1),
                            "elapsed_time_sec": round(dt, 2),
                            "calculated_speed_kmh": round(speed_kmh, 1),
                            "reason": f"Abnormally short transit time ({dt:.2f}s for {dist_m:.1f}m, calculated {speed_kmh:.1f} km/h) indicates possible sensor timing skew or rapid movement.",
                        })

                # Case 3: Reverse timestamp sequence in sorted tracking
                elif dt < -0.1:
                    anomalies.append({
                        "anomaly_id": f"ANOM_TIME_{plate}_{i}",
                        "alert_type": "ROUTE_ANOMALY",
                        "anomaly_type": "INVALID_TIMESTAMP_ORDER",
                        "plate": plate,
                        "severity": "WARNING",
                        "priority": "LOW",
                        "camera_sequence": [c_prev_id, c_curr_id],
                        "cameras_label": f"{cam_prev.get('camera_name', c_prev_id)} → {cam_curr.get('camera_name', c_curr_id)}",
                        "timestamp_sequence": [round(t_prev, 2), round(t_curr, 2)],
                        "timestamp_sec": round(t_curr, 2),
                        "distance_m": round(dist_m, 1),
                        "elapsed_time_sec": round(dt, 2),
                        "calculated_speed_kmh": None,
                        "reason": f"Non-chronological transition timestamp ({t_curr:.2f}s < {t_prev:.2f}s).",
                    })

        return anomalies


anomaly_engine = AnomalyDetectionEngine()
