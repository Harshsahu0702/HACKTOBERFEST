import React from "react";

export function DrishtiEyeLogo({ size = 48, animated = true, className = "" }) {
  return (
    <div
      className={`drishti-cyber-eye-wrap ${animated ? "is-animated" : ""} ${className}`}
      style={{
        width: size,
        height: size,
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg
        viewBox="0 0 120 120"
        width="100%"
        height="100%"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="drishti-eye-svg"
      >
        <defs>
          {/* Gradients */}
          <linearGradient id="eyeAmberGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#F59E0B" />
            <stop offset="50%" stopColor="#D97706" />
            <stop offset="100%" stopColor="#92400E" />
          </linearGradient>

          <linearGradient id="eyeCyanGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38BDF8" />
            <stop offset="100%" stopColor="#0284C7" />
          </linearGradient>

          <radialGradient id="pupilGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FBBF24" stopOpacity="1" />
            <stop offset="40%" stopColor="#D97706" stopOpacity="0.8" />
            <stop offset="80%" stopColor="#B45309" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#78350F" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="irisAura" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0284C7" stopOpacity="0.9" />
            <stop offset="60%" stopColor="#0369A1" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#0F172A" stopOpacity="0" />
          </radialGradient>

          {/* Glow filter */}
          <filter id="eyeGlowFilter" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* 1. Outer Corner HUD Tactical Brackets */}
        <g className="hud-brackets" stroke="#D97706" strokeWidth="1.8" strokeLinecap="round" opacity="0.85">
          {/* Top-Left */}
          <path d="M 12 28 L 12 14 L 28 14" />
          {/* Top-Right */}
          <path d="M 92 14 L 108 14 L 108 28" />
          {/* Bottom-Left */}
          <path d="M 12 92 L 12 106 L 28 106" />
          {/* Bottom-Right */}
          <path d="M 92 106 L 108 106 L 108 92" />
        </g>

        {/* 2. Outer Rotating Compass / Radar Ring */}
        <circle
          cx="60"
          cy="60"
          r="48"
          stroke="#D97706"
          strokeWidth="1.2"
          strokeDasharray="4 8"
          strokeOpacity="0.55"
          className="radar-dial-outer"
        />

        {/* Outer Fine Solid Ring with Axis Ticks */}
        <circle cx="60" cy="60" r="44" stroke="#D97706" strokeWidth="0.8" strokeOpacity="0.3" />
        <line x1="60" y1="12" x2="60" y2="18" stroke="#D97706" strokeWidth="1.5" />
        <line x1="60" y1="102" x2="60" y2="108" stroke="#D97706" strokeWidth="1.5" />
        <line x1="12" y1="60" x2="18" y2="60" stroke="#D97706" strokeWidth="1.5" />
        <line x1="102" y1="60" x2="108" y2="60" stroke="#D97706" strokeWidth="1.5" />

        {/* 3. Counter-rotating Segmented Tracking Arc */}
        <circle
          cx="60"
          cy="60"
          r="38"
          stroke="url(#eyeCyanGrad)"
          strokeWidth="1.5"
          strokeDasharray="24 16 8 16"
          strokeOpacity="0.75"
          className="radar-arc-segmented"
        />

        {/* 4. Stylized Almond Cyber-Eye Contour */}
        {/* Upper Contour */}
        <path
          d="M 18 60 Q 60 22 102 60"
          stroke="url(#eyeAmberGrad)"
          strokeWidth="2.8"
          strokeLinecap="round"
          fill="none"
          filter="url(#eyeGlowFilter)"
          className="eye-lid-upper"
        />
        {/* Lower Contour */}
        <path
          d="M 18 60 Q 60 98 102 60"
          stroke="url(#eyeAmberGrad)"
          strokeWidth="2.8"
          strokeLinecap="round"
          fill="none"
          filter="url(#eyeGlowFilter)"
          className="eye-lid-lower"
        />

        {/* Subtle inner eyelid rim */}
        <path
          d="M 24 60 Q 60 30 96 60 Q 60 90 24 60 Z"
          stroke="#D97706"
          strokeWidth="0.8"
          strokeOpacity="0.4"
          fill="rgba(24, 18, 14, 0.35)"
        />

        {/* 5. Iris Assembly */}
        {/* Iris Outer Aura */}
        <circle cx="60" cy="60" r="21" fill="url(#irisAura)" />
        <circle
          cx="60"
          cy="60"
          r="20"
          stroke="url(#eyeCyanGrad)"
          strokeWidth="1.6"
          strokeDasharray="6 3"
          className="iris-reticle"
        />

        {/* Iris Aperture Blades / Radiating Crosshairs */}
        <g stroke="#38BDF8" strokeWidth="1" strokeOpacity="0.6" className="iris-aperture">
          <line x1="60" y1="41" x2="60" y2="46" />
          <line x1="60" y1="74" x2="60" y2="79" />
          <line x1="41" y1="60" x2="46" y2="60" />
          <line x1="74" y1="60" x2="79" y2="60" />
          <line x1="47" y1="47" x2="51" y2="51" />
          <line x1="69" y1="69" x2="73" y2="73" />
          <line x1="47" y1="73" x2="51" y2="69" />
          <line x1="69" y1="51" x2="73" y2="47" />
        </g>

        {/* 6. Pupil Core */}
        <circle cx="60" cy="60" r="10" fill="#0F172A" />
        <circle cx="60" cy="60" r="9" fill="url(#pupilGlow)" className="pupil-glow-core" />
        <circle cx="60" cy="60" r="4.5" fill="#FEF3C7" className="pupil-singularity" />

        {/* Optical Reflection Glint */}
        <circle cx="57" cy="56" r="1.8" fill="#FFFFFF" opacity="0.9" />

        {/* 7. Animated Laser Scanning Line */}
        <line
          x1="22"
          y1="60"
          x2="98"
          y2="60"
          stroke="#F59E0B"
          strokeWidth="1.5"
          strokeOpacity="0.9"
          filter="url(#eyeGlowFilter)"
          className="cyber-scanline"
        />
      </svg>
    </div>
  );
}
