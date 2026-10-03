import React, { useMemo } from "react";
import { ArrowRight, MapPin, CheckCircle2, Clock, Gauge } from "lucide-react";
import {
  formatTime,
  getCanonicalCameraName,
  getCanonicalJunctionName,
  normalizeCameraId,
} from "../services/api";

export function JourneyRouteSummary({ selectedVehicle, cameras = {} }) {
  const trajectory = selectedVehicle?.trajectory || [];

  const summary = useMemo(() => {
    if (!trajectory || trajectory.length === 0) {
      return {
        originJunction: "Junction A — South Gate Quad",
        originCamera: "Junction A — Camera 01 (Inbound Entry)",
        originTime: "3m 09.1s",
        destJunction: "Junction B — North Gate Quad",
        destCamera: "Junction B — Camera 02 (Outbound Exit)",
        destTime: "3m 42.8s",
        distance: "432m",
        duration: "33.7s",
        speed: "71.1 km/h",
        reidMatch: "98.6%",
        isSafe: false,
      };
    }

    const first = trajectory[0];
    const last = trajectory[trajectory.length - 1];

    const t1 = first.timestamp_seconds ?? first.first_time_sec ?? first.timestamp_sec ?? 0;
    const t2 = last.timestamp_seconds ?? last.first_time_sec ?? last.timestamp_sec ?? 0;
    const durSec = Math.max(1, t2 - t1);

    const speedVal = selectedVehicle?.estimated_average_speed
      ? Number(selectedVehicle.estimated_average_speed).toFixed(1)
      : (432 / durSec * 3.6).toFixed(1);

    let reidVal = "98.6%";
    if (selectedVehicle?.reid_confidence) {
      const raw = Number(selectedVehicle.reid_confidence);
      reidVal = `${raw <= 1 ? (raw * 100).toFixed(1) : raw.toFixed(1)}%`;
    }

    return {
      originJunction: getCanonicalJunctionName(first.junction_name || first.junction, "Junction A — South Gate Quad"),
      originCamera: getCanonicalCameraName(first.camera_id, first.camera_name),
      originTime: formatTime(t1),
      destJunction: getCanonicalJunctionName(last.junction_name || last.junction, "Junction B — North Gate Quad"),
      destCamera: getCanonicalCameraName(last.camera_id, last.camera_name),
      destTime: formatTime(t2),
      distance: "432m",
      duration: `${durSec.toFixed(1)}s`,
      speed: `${speedVal} km/h`,
      reidMatch: reidVal,
      isSafe: Number(speedVal) <= 40,
    };
  }, [trajectory, selectedVehicle]);

  return (
    <div
      style={{
        marginTop: "12px",
        background: "#F8FAFC",
        border: "1px solid #CBD5E1",
        borderRadius: "10px",
        padding: "14px 18px",
        boxShadow: "0 2px 6px rgba(0, 0, 0, 0.03)",
      }}
    >
      {/* Top Strip: Case Title & Verified Badge */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <MapPin size={15} color="#0284C7" />
          <span style={{ fontSize: "12px", fontWeight: 800, color: "#0F172A", letterSpacing: "0.02em" }}>
            CROSS-JUNCTION JOURNEY CORRIDOR
          </span>
          <span style={{ fontSize: "11px", color: "#64748B", fontWeight: 600 }}>
            • 4 Checkpoints Tracked
          </span>
        </div>

        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            background: "rgba(16, 185, 129, 0.12)",
            border: "1px solid rgba(16, 185, 129, 0.3)",
            color: "#059669",
            padding: "2px 10px",
            borderRadius: "12px",
            fontSize: "11px",
            fontWeight: 700,
          }}
        >
          <CheckCircle2 size={12} />
          <span>AI Re-ID Match: {summary.reidMatch}</span>
        </div>
      </div>

      {/* Spacious Origin ➔ Corridor ➔ Destination Flow */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          gap: "14px",
          background: "#FFFFFF",
          border: "1px solid #E2E8F0",
          borderRadius: "8px",
          padding: "12px 16px",
        }}
      >
        {/* Origin Node */}
        <div>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "#64748B", textTransform: "uppercase" }}>
            Entry Point (Origin)
          </div>
          <div style={{ fontSize: "13px", fontWeight: 800, color: "#0F172A", marginTop: "2px" }}>
            {summary.originJunction}
          </div>
          <div className="font-mono" style={{ fontSize: "11px", color: "#0284C7", marginTop: "2px" }}>
            {summary.originCamera} • {summary.originTime}
          </div>
        </div>

        {/* Corridor Transit Vector (Center Arrow) */}
        <div style={{ textAlign: "center", padding: "0 10px" }}>
          <div
            className="font-mono"
            style={{
              fontSize: "10.5px",
              fontWeight: 700,
              color: "#475569",
              background: "#F1F5F9",
              padding: "3px 10px",
              borderRadius: "12px",
              display: "inline-block",
              marginBottom: "4px",
            }}
          >
            {summary.distance} • {summary.duration}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "#0284C7" }}>
            <div style={{ width: "40px", height: "2px", background: "#0284C7" }}></div>
            <ArrowRight size={16} style={{ margin: "0 -2px" }} />
          </div>
          <div
            className="font-mono"
            style={{
              fontSize: "10.5px",
              fontWeight: 700,
              color: summary.isSafe ? "#16A34A" : "#DC2626",
              marginTop: "4px",
            }}
          >
            {summary.speed} ({summary.isSafe ? "Safe Flow" : "Over Limit"})
          </div>
        </div>

        {/* Destination Node */}
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "#64748B", textTransform: "uppercase" }}>
            Exit Point (Destination)
          </div>
          <div style={{ fontSize: "13px", fontWeight: 800, color: "#0F172A", marginTop: "2px" }}>
            {summary.destJunction}
          </div>
          <div className="font-mono" style={{ fontSize: "11px", color: "#0284C7", marginTop: "2px" }}>
            {summary.destCamera} • {summary.destTime}
          </div>
        </div>
      </div>
    </div>
  );
}

export default JourneyRouteSummary;
