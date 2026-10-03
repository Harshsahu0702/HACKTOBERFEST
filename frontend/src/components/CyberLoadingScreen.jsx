import React, { useState, useEffect } from "react";
import { DrishtiEyeLogo } from "./DrishtiEyeLogo";

const LOADING_STAGES = [
  "Initializing system...",
  "Connecting camera network...",
  "Loading vehicle records...",
  "Preparing surveillance dashboard...",
  "Ready",
];

export function CyberLoadingScreen({ isExiting = false, onFinished }) {
  const [progress, setProgress] = useState(15);
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    const startTime = Date.now();
    const duration = 1800; // 1.8s clean smooth loading

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, Math.floor((elapsed / duration) * 100));
      setProgress(pct);

      const step = Math.min(
        LOADING_STAGES.length - 1,
        Math.floor((pct / 100) * LOADING_STAGES.length)
      );
      setStageIndex(step);

      if (pct >= 100) {
        clearInterval(interval);
        if (onFinished) {
          setTimeout(onFinished, 250);
        }
      }
    }, 35);

    return () => clearInterval(interval);
  }, [onFinished]);

  return (
    <div className={`cyber-loading-screen ${isExiting ? "loading-fade-out" : ""}`}>
      {/* Ambient Cyber Grid & Glow */}
      <div className="cyber-loading-backdrop">
        <div className="cyber-loading-glow-orb"></div>
        <div className="cyber-grid-overlay"></div>
        <div className="cyber-scanline-sweep"></div>
      </div>

      <div className="cyber-loading-content">
        {/* DRISHTI EYE LOGO */}
        <div className="cyber-eye-hero-container">
          <div className="cyber-eye-halo-ring"></div>
          <div className="cyber-eye-halo-pulse"></div>
          <DrishtiEyeLogo size={150} animated={true} className="loading-hero-eye" />
        </div>

        {/* BRAND IDENTITY */}
        <div className="cyber-brand-hero">
          <h1 className="cyber-hero-title">
            DRISHTI
          </h1>

          <div className="cyber-hero-subtitle">
            City-Wide Visual Intelligence for Vehicle Tracking & Mobility Analysis
          </div>
        </div>

        {/* PROGRESS INDICATOR */}
        <div className="cyber-progress-assembly">
          <div className="cyber-progress-header">
            <span className="cyber-stage-text font-mono">
              {LOADING_STAGES[stageIndex]}
            </span>
            <span className="cyber-pct-readout font-mono">
              {progress}%
            </span>
          </div>

          <div className="cyber-progress-track">
            <div
              className="cyber-progress-fill"
              style={{ width: `${progress}%` }}
            >
              <div className="cyber-progress-head-glint"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
