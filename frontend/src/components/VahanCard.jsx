import React, { useState } from "react";
import {
  ShieldCheck,
  Building2,
  FileCheck,
  Fuel,
  Calendar,
  User,
  Car,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";

export function VahanCard({ vahanData, defaultExpanded = false }) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  if (!vahanData) return null;

  return (
    <div
      style={{
        border: "1.5px solid #CBD5E1",
        borderRadius: "8px",
        background: "#F8FAFC",
        overflow: "hidden",
        marginTop: "12px",
        boxShadow: "0 2px 6px rgba(0, 0, 0, 0.04)",
      }}
    >
      {/* VAHAN 4.0 Header Strip */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "10px 14px",
          background: "linear-gradient(135deg, #0F172A 0%, #1E293B 100%)",
          color: "#FFFFFF",
          cursor: "pointer",
          userSelect: "none",
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div
            style={{
              width: "22px",
              height: "22px",
              borderRadius: "4px",
              background: "#0284C7",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#FFFFFF",
              fontWeight: 900,
              fontSize: "11px",
            }}
          >
            V
          </div>
          <div>
            <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.04em" }}>
              VAHAN 4.0 NATIONAL RC DETAILS
            </div>
            <div style={{ fontSize: "10px", color: "#94A3B8" }}>
              Ministry of Road Transport & Highways (MoRTH)
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              fontSize: "10px",
              fontWeight: 700,
              color: "#10B981",
              background: "rgba(16, 185, 129, 0.15)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              padding: "2px 8px",
              borderRadius: "12px",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <CheckCircle2 size={11} />
            VERIFIED ACTIVE
          </span>
          <button
            type="button"
            style={{
              background: "transparent",
              border: "none",
              color: "#94A3B8",
              cursor: "pointer",
              padding: "2px",
            }}
          >
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Expandable Details Container: ALL details are collapsed by default */}
      {isExpanded && (
        <div className="vahan-card-body">
          {/* Primary Highlights Row */}
          <div
            style={{
              padding: "10px 14px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: "10px",
              background: "#FFFFFF",
              borderBottom: "1px solid #E2E8F0",
              fontSize: "11px",
            }}
          >
            <div>
              <div style={{ color: "#64748B", fontSize: "10px", fontWeight: 600 }}>REGISTERED OWNER</div>
              <div style={{ fontWeight: 800, color: "#0F172A", marginTop: "2px", display: "flex", alignItems: "center", gap: "4px" }}>
                <User size={12} color="#0284C7" />
                {vahanData.owner_name}
              </div>
            </div>

            <div>
              <div style={{ color: "#64748B", fontSize: "10px", fontWeight: 600 }}>MAKER & MODEL</div>
              <div style={{ fontWeight: 700, color: "#0F172A", marginTop: "2px", display: "flex", alignItems: "center", gap: "4px" }}>
                <Car size={12} color="#D97706" />
                {vahanData.maker} {vahanData.model}
              </div>
            </div>

            <div>
              <div style={{ color: "#64748B", fontSize: "10px", fontWeight: 600 }}>REGISTERING RTO</div>
              <div style={{ fontWeight: 700, color: "#0F172A", marginTop: "2px", display: "flex", alignItems: "center", gap: "4px" }}>
                <Building2 size={12} color="#64748B" />
                {vahanData.rto_office}
              </div>
            </div>

            <div>
              <div style={{ color: "#64748B", fontSize: "10px", fontWeight: 600 }}>FUEL / EMISSION</div>
              <div style={{ fontWeight: 700, color: "#0F172A", marginTop: "2px", display: "flex", alignItems: "center", gap: "4px" }}>
                <Fuel size={12} color="#10B981" />
                {vahanData.fuel_type} • BS-VI
              </div>
            </div>
          </div>

          {/* Extended Legal Specs */}
          <div
            style={{
              padding: "12px 14px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: "12px",
              background: "#F8FAFC",
              fontSize: "10.5px",
            }}
          >
          <div>
            <div style={{ color: "#64748B", fontWeight: 600 }}>Registration Date</div>
            <div className="font-mono" style={{ fontWeight: 700, color: "#1E293B", marginTop: "2px" }}>
              {vahanData.registration_date}
            </div>
          </div>

          <div>
            <div style={{ color: "#64748B", fontWeight: 600 }}>Vehicle Class</div>
            <div style={{ fontWeight: 700, color: "#1E293B", marginTop: "2px" }}>
              {vahanData.vehicle_class}
            </div>
          </div>

          <div>
            <div style={{ color: "#64748B", fontWeight: 600 }}>Insurance Validity</div>
            <div className="font-mono" style={{ fontWeight: 700, color: "#059669", marginTop: "2px" }}>
              Valid till {vahanData.insurance_valid_upto}
            </div>
            <div style={{ color: "#64748B", fontSize: "9.5px" }}>{vahanData.insurance_company}</div>
          </div>

          <div>
            <div style={{ color: "#64748B", fontWeight: 600 }}>PUCC (Pollution) Status</div>
            <div className="font-mono" style={{ fontWeight: 700, color: "#059669", marginTop: "2px" }}>
              Valid till {vahanData.pucc_valid_upto}
            </div>
            <div style={{ color: "#64748B", fontSize: "9.5px" }}>{vahanData.pucc_number}</div>
          </div>

          <div>
            <div style={{ color: "#64748B", fontWeight: 600 }}>Road Tax Status</div>
            <div style={{ fontWeight: 700, color: "#1E293B", marginTop: "2px" }}>
              {vahanData.tax_status}
            </div>
          </div>

          <div>
            <div style={{ color: "#64748B", fontWeight: 600 }}>Masked Chassis No.</div>
            <div className="font-mono" style={{ fontWeight: 700, color: "#334155", marginTop: "2px" }}>
              {vahanData.chassis_number_masked}
            </div>
          </div>

          <div>
            <div style={{ color: "#64748B", fontWeight: 600 }}>Masked Engine No.</div>
            <div className="font-mono" style={{ fontWeight: 700, color: "#334155", marginTop: "2px" }}>
              {vahanData.engine_number_masked}
            </div>
          </div>

          <div>
            <div style={{ color: "#64748B", fontWeight: 600 }}>Financier Status</div>
            <div style={{ fontWeight: 700, color: "#334155", marginTop: "2px" }}>
              {vahanData.financer}
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

export default VahanCard;
