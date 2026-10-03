import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  FileText,
  Printer,
  X,
  AlertTriangle,
  QrCode,
  CheckCircle2,
  Building2,
  Shield,
  Clock,
  Car,
} from "lucide-react";
import { api } from "../services/api";

export function EChallanModal({ isOpen, onClose, plate, vehicleData }) {
  const [challanData, setChallanData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen || !plate) return;

    let isMounted = true;
    setLoading(true);

    api.getEChallanData(plate)
      .then((data) => {
        if (isMounted) {
          setChallanData(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Failed to load e-Challan data:", err);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, plate]);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  return createPortal(
    <div className="modal-backdrop-light dossier-modal-overlay" onClick={onClose}>
      <div
        className="modal-dialog-panel"
        style={{
          maxWidth: "680px",
          width: "95vw",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          background: "#FFFFFF",
          borderRadius: "8px",
          overflow: "hidden",
          boxShadow: "0 20px 45px rgba(0, 0, 0, 0.3)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Action Bar (Hidden in Print) */}
        <div
          className="dossier-print-toolbar"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 18px",
            background: "#0F172A",
            color: "#FFFFFF",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <FileText size={16} color="#38BDF8" />
            <span style={{ fontSize: "12.5px", fontWeight: 800, letterSpacing: "0.04em" }}>
              GOVERNMENT E-CHALLAN SYSTEM
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              onClick={handlePrint}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                background: "#0284C7",
                color: "#FFFFFF",
                border: "none",
                padding: "5px 12px",
                borderRadius: "5px",
                fontSize: "11px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              <Printer size={13} />
              <span>Print / Save PDF</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                color: "#94A3B8",
                cursor: "pointer",
                padding: "4px",
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Printable Challan Content */}
        <div
          className="printable-dossier-body"
          style={{
            padding: "24px 28px",
            overflowY: "auto",
            color: "#0F172A",
            fontSize: "11px",
            lineHeight: 1.45,
          }}
        >
          {loading || !challanData ? (
            <div style={{ textAlign: "center", padding: "40px" }}>
              Generating Official e-Challan Notice...
            </div>
          ) : (
            <div>
              {/* Header */}
              <div
                style={{
                  borderBottom: "2px solid #0F172A",
                  paddingBottom: "12px",
                  marginBottom: "16px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <div>
                  <div style={{ fontSize: "10px", fontWeight: 700, color: "#64748B", textTransform: "uppercase" }}>
                    Government of India • Ministry of Road Transport & Highways
                  </div>
                  <h1 style={{ fontSize: "17px", fontWeight: 900, margin: "2px 0", color: "#0F172A" }}>
                    TRAFFIC VIOLATION E-CHALLAN
                  </h1>
                  <div style={{ fontSize: "10.5px", color: "#334155" }}>
                    {challanData.issuing_authority}
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "10px", color: "#64748B" }}>Challan Number:</div>
                  <div className="font-mono" style={{ fontSize: "13px", fontWeight: 800, color: "#DC2626" }}>
                    {challanData.challan_number}
                  </div>
                  <div style={{ fontSize: "10px", color: "#64748B", marginTop: "2px" }}>
                    Date: {challanData.challan_date}
                  </div>
                </div>
              </div>

              {/* Vehicle & Owner Info Grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                  background: "#F8FAFC",
                  border: "1px solid #CBD5E1",
                  borderRadius: "6px",
                  padding: "12px 14px",
                  marginBottom: "16px",
                }}
              >
                <div>
                  <div style={{ color: "#64748B", fontSize: "10px", fontWeight: 600 }}>VEHICLE NUMBER</div>
                  <div
                    className="hsrp-plate-frame"
                    style={{
                      border: "1.5px solid #000000",
                      borderRadius: "4px",
                      display: "inline-flex",
                      overflow: "hidden",
                      background: "#FFFFFF",
                      marginTop: "3px",
                    }}
                  >
                    <div
                      style={{
                        background: "#003399",
                        color: "#FFFFFF",
                        fontSize: "8.5px",
                        fontWeight: 800,
                        padding: "2px 5px",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      IND
                    </div>
                    <div
                      className="font-mono"
                      style={{
                        padding: "2px 8px",
                        fontSize: "12.5px",
                        fontWeight: 900,
                        letterSpacing: "0.08em",
                        color: "#000000",
                      }}
                    >
                      {challanData.vehicle_number}
                    </div>
                  </div>
                  <div style={{ fontSize: "10.5px", fontWeight: 600, color: "#334155", marginTop: "4px" }}>
                    {challanData.maker_model}
                  </div>
                </div>

                <div>
                  <div style={{ color: "#64748B", fontSize: "10px", fontWeight: 600 }}>REGISTERED OWNER</div>
                  <div style={{ fontSize: "13px", fontWeight: 800, color: "#0F172A", marginTop: "3px" }}>
                    {challanData.owner_name}
                  </div>
                  <div style={{ fontSize: "10.5px", color: "#64748B", marginTop: "2px" }}>
                    {challanData.rto_office}
                  </div>
                  <div style={{ fontSize: "10px", color: "#64748B" }}>
                    Class: {challanData.vehicle_class}
                  </div>
                </div>
              </div>

              {/* Violation Details Box */}
              <div
                style={{
                  border: "1.5px solid #DC2626",
                  borderRadius: "6px",
                  background: "#FEF2F2",
                  padding: "12px 14px",
                  marginBottom: "16px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#DC2626", fontWeight: 800 }}>
                  <AlertTriangle size={15} />
                  <span>OFFENCE DETAILS</span>
                </div>

                <div style={{ marginTop: "6px", fontSize: "12px", fontWeight: 700, color: "#0F172A" }}>
                  {challanData.violation_type}
                </div>
                <div style={{ color: "#64748B", fontSize: "10.5px", marginTop: "2px" }}>
                  Law Clause: {challanData.motor_vehicle_act_clause}
                </div>

                {/* Speed Comparison Strip */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: "8px",
                    background: "#FFFFFF",
                    border: "1px solid #FECACA",
                    borderRadius: "5px",
                    padding: "8px 10px",
                    marginTop: "10px",
                    textAlign: "center",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "9.5px", color: "#64748B", fontWeight: 600 }}>RECORDED SPEED</div>
                    <div className="font-mono" style={{ fontSize: "15px", fontWeight: 900, color: "#DC2626" }}>
                      {challanData.detected_speed_kmh} km/h
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: "9.5px", color: "#64748B", fontWeight: 600 }}>PERMISSIBLE LIMIT</div>
                    <div className="font-mono" style={{ fontSize: "15px", fontWeight: 800, color: "#059669" }}>
                      {challanData.permissible_speed_limit_kmh} km/h
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: "9.5px", color: "#64748B", fontWeight: 600 }}>EXCESS SPEED</div>
                    <div className="font-mono" style={{ fontSize: "15px", fontWeight: 900, color: "#B91C1C" }}>
                      +{challanData.excess_speed_kmh} km/h
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: "10px", color: "#64748B", marginTop: "8px" }}>
                  <strong>Location of Offence:</strong> {challanData.violation_location}
                </div>
              </div>

              {/* Fine Amount & Payment QR */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: "16px",
                  background: "#F8FAFC",
                  border: "1px solid #CBD5E1",
                  borderRadius: "6px",
                  padding: "12px 14px",
                  marginBottom: "16px",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ color: "#64748B", fontSize: "10px", fontWeight: 600 }}>TOTAL PENALTY AMOUNT</div>
                  <div className="font-mono" style={{ fontSize: "22px", fontWeight: 900, color: "#0F172A" }}>
                    ₹{challanData.fine_amount_inr}.00
                  </div>
                  <div style={{ fontSize: "10px", color: "#64748B" }}>
                    ({challanData.fine_amount_words})
                  </div>
                  <div style={{ marginTop: "6px", fontSize: "10.5px" }}>
                    Status: <strong style={{ color: "#DC2626" }}>{challanData.payment_status}</strong> • Due by:{" "}
                    <strong>{challanData.payment_due_date}</strong>
                  </div>
                </div>

                {/* Simulated QR Code for Payment */}
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{
                      width: "80px",
                      height: "80px",
                      background: "#FFFFFF",
                      border: "1px solid #CBD5E1",
                      borderRadius: "6px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "4px",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                    }}
                  >
                    <QrCode size={52} color="#0F172A" />
                    <span style={{ fontSize: "8px", fontWeight: 700, color: "#64748B" }}>SCAN TO PAY</span>
                  </div>
                </div>
              </div>

              {/* Statutory Legal Notice */}
              <div
                style={{
                  fontSize: "9.5px",
                  color: "#64748B",
                  borderTop: "1px solid #E2E8F0",
                  paddingTop: "10px",
                  lineHeight: 1.4,
                }}
              >
                <strong>Statutory Notice:</strong> {challanData.statutory_notice}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default EChallanModal;
