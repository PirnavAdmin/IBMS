import React from 'react';

export const BackgroundLayers = () => (
  <div className="auth-bg-system" aria-hidden="true">
    {/* Technical Precision Grid */}
    <div className="auth-bg-grid" />

    {/* Ambient Glowing Orbs */}
    <div className="auth-bg-orb orb-1" />
    <div className="auth-bg-orb orb-2" />

    {/* Financial Harmonic Wave Contours */}
    <svg
      className="auth-bg-waves"
      viewBox="0 0 1440 900"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none"
    >
      <path
        d="M-100,160 C320,50 760,380 1540,140"
        stroke="rgba(154, 79, 47, 0.18)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M-100,300 C420,150 860,500 1540,260"
        stroke="rgba(223, 162, 75, 0.15)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M-100,440 C360,280 820,640 1540,380"
        stroke="rgba(154, 79, 47, 0.12)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="320" cy="160" r="4" fill="rgba(154, 79, 47, 0.35)" />
      <circle cx="780" cy="400" r="3.5" fill="rgba(223, 162, 75, 0.3)" />
      <circle cx="1180" cy="220" r="4" fill="rgba(154, 79, 47, 0.35)" />
    </svg>
  </div>
);

export default BackgroundLayers;