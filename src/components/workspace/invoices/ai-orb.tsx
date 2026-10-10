'use client';

export function AIOrb({ size = 38 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', filter: 'drop-shadow(0 4px 10px rgba(168, 85, 247, 0.35))' }}
      aria-label="Raqam AI"
    >
      <defs>
        <radialGradient id="sphereGrad" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#fdf4ff" />
          <stop offset="25%" stopColor="#f472b6" />
          <stop offset="55%" stopColor="#a855f7" />
          <stop offset="80%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#06b6d4" />
        </radialGradient>
        <linearGradient id="swirlGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.9" />
          <stop offset="50%" stopColor="#ec4899" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.8" />
        </linearGradient>
        <linearGradient id="swirlGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.9" />
          <stop offset="60%" stopColor="#a855f7" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#ec4899" stopOpacity="0.8" />
        </linearGradient>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Base 3D Sphere */}
      <circle cx="50" cy="50" r="46" fill="url(#sphereGrad)" />

      {/* Iridescent Ribbon Swirls */}
      <path
        d="M20 52 C 25 25, 65 18, 76 34 C 88 50, 68 78, 48 80 C 26 82, 14 65, 26 44 C 36 28, 70 26, 80 48"
        stroke="url(#swirlGrad1)"
        strokeWidth="9"
        strokeLinecap="round"
        fill="none"
        filter="url(#glow)"
      />
      <path
        d="M32 72 C 16 54, 30 28, 52 24 C 74 20, 84 45, 74 65 C 64 85, 38 82, 34 60 C 30 42, 54 32, 68 40"
        stroke="url(#swirlGrad2)"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="36" cy="34" r="7" fill="#ffffff" fillOpacity="0.65" filter="blur(2px)" />
      <circle cx="38" cy="32" r="3.5" fill="#ffffff" fillOpacity="0.9" />
    </svg>
  );
}
