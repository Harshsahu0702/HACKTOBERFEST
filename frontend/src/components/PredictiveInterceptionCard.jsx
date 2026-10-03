import React, { useState } from "react";
import {
  ShieldAlert,
  Radio,
  Navigation,
  Clock,
  Car,
  CheckCircle2,
  AlertTriangle,
  Send,
  Zap,
} from "lucide-react";
import { api } from "../services/api";

export function PredictiveInterceptionCard({ interceptionData, plate, onDispatchSuccess }) {
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchResult, setDispatchResult] = useState(null);

  if (!interceptionData) return null;

  const {
    heading_direction,
    predicted_next_junction,
    predicted_camera,
    eta_formatted,
    nearest_pcr_unit,
    current_speed_kmh,
  } = interceptionData;

  const handleDispatch = async () => {
    try {
      setIsDispatching(true);
      const res = await api.dispatchPcrUnit({
        plate: plate || interceptionData.plate || "TARGET",
        unit_id: nearest_pcr_unit?.unit_id || "PCR-04",
        callsign: nearest_pcr_unit?.callsign || "CHETAK-4",
        junction: predicted_next_junction || "Junction B",
        officer_in_charge: nearest_pcr_unit?.officer_in_charge || "SI A. K. Mondal",
        priority: "CRITICAL_INTERCEPT",
      });
      setDispatchResult(res);
      if (onDispatchSuccess) {
        onDispatchSuccess(res.confirmation_message);
      }
    } catch (e) {
      console.error("Failed to dispatch PCR unit:", e);
    } finally {
      setIsDispatching(false);
    }
  };

  return (
    <div
      style={{
        border: "1.5px solid #F59E0B",
        borderRadius: "8px",
        background: "linear-gradient(180deg, #FFFBEB 0%, #FFFFFF 100%)",
        overflow: "hidden",
        marginTop: "12px",
        boxShadow: "0 2px 8px rgba(245, 158, 11, 0.12)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 14px",
          background: "linear-gradient(135deg, #78350F 0%, #B45309 100%)",
          color: "#FFFFFF",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Radio size={15} style={{ color: "#FDE68A", animation: "pulse 1.5s infinite" }} />
          <span style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.04em" }}>
            PREDICTIVE ROUTE INTERCEPTION & PCR DISPATCH
          </span>
        </div>
        <span
          style={{
            fontSize: "10px",
            fontWeight: 800,
            background: "rgba(255, 255, 255, 0.2)",
            padding: "2px 8px",
            borderRadius: "10px",
          }}
        >
          ETA: {eta_formatted}
        </span>
      </div>

      {/* Body Grid */}
      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: "10px" }}>
        {/* Route Prediction Row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "10px",
            fontSize: "11px",
          }}
        >
          <div
            style={{
              background: "#FFFFFF",
              border: "1px solid #FDE68A",
              borderRadius: "6px",
              padding: "8px 10px",
            }}
          >
            <div style={{ color: "#78350F", fontSize: "10px", fontWeight: 700, display: "flex", alignItems: "center", gap: "4px" }}>
              <Navigation size={12} color="#D97706" />
              EXPECTED NEXT JUNCTION
            </div>
            <div style={{ fontWeight: 800, color: "#0F172A", marginTop: "2px" }}>
              {predicted_next_junction}
            </div>
            <div style={{ fontSize: "10px", color: "#64748B", marginTop: "1px" }}>
              Approach: {predicted_camera}
            </div>
          </div>

          <div
            style={{
              background: "#FFFFFF",
              border: "1px solid #FDE68A",
              borderRadius: "6px",
              padding: "8px 10px",
            }}
          >
            <div style={{ color: "#78350F", fontSize: "10px", fontWeight: 700, display: "flex", alignItems: "center", gap: "4px" }}>
              <ShieldAlert size={12} color="#DC2626" />
              NEAREST PATROL UNIT
            </div>
            <div style={{ fontWeight: 800, color: "#0F172A", marginTop: "2px" }}>
              {nearest_pcr_unit?.unit_id} ({nearest_pcr_unit?.callsign})
            </div>
            <div style={{ fontSize: "10px", color: "#64748B", marginTop: "1px" }}>
              {nearest_pcr_unit?.current_location}
            </div>
          </div>
        </div>

        {/* Dispatch Action Strip */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: "6px",
            borderTop: "1px solid #FEF3C7",
            gap: "10px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontSize: "11px", color: "#92400E" }}>
            <strong>Heading:</strong> {heading_direction} (Speed: {current_speed_kmh} km/h)
          </div>

          {dispatchResult ? (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                background: "#ECFDF5",
                border: "1px solid #A7F3D0",
                color: "#059669",
                padding: "6px 12px",
                borderRadius: "6px",
                fontSize: "11px",
                fontWeight: 800,
              }}
            >
              <CheckCircle2 size={13} />
              <span>DISPATCHED ({dispatchResult.unit_id} EN ROUTE)</span>
            </div>
          ) : (
            <button
              type="button"
              disabled={isDispatching}
              onClick={handleDispatch}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                background: "linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)",
                color: "#FFFFFF",
                border: "none",
                padding: "6px 14px",
                borderRadius: "6px",
                fontSize: "11.5px",
                fontWeight: 800,
                cursor: "pointer",
                boxShadow: "0 2px 6px rgba(220, 38, 38, 0.3)",
                transition: "all 0.15s ease",
              }}
              title="Alert nearest Police Patrol Van to intercept vehicle at predicted junction"
            >
              <Send size={12} />
              <span>{isDispatching ? "Alerting Unit..." : "Dispatch PCR Interception Alert"}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default PredictiveInterceptionCard;
