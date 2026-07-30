import React from 'react';

interface LogoProps {
  className?: string;
  size?: number | string;
  withBackground?: boolean;
  spin?: boolean;
}

export const TripBalancingLogo: React.FC<LogoProps> = ({
  className = "w-8 h-8",
  size,
  withBackground = false,
  spin = false
}) => {
  return (
    <svg
      viewBox="0 0 200 200"
      className={`${className} ${spin ? 'animate-spin-slow' : ''}`}
      style={size ? { width: size, height: size } : undefined}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {withBackground && (
        <rect width="200" height="200" rx="36" fill="#080c14" />
      )}

      {/* 3 Concentric Sonar Target Rings */}
      <circle cx="100" cy="100" r="90" stroke="#00E5FF" strokeWidth="2" strokeOpacity="0.85" fill="none" />
      <circle cx="100" cy="100" r="72" stroke="#00E5FF" strokeWidth="1.5" strokeOpacity="0.75" fill="none" />
      <circle cx="100" cy="100" r="52" stroke="#00E5FF" strokeWidth="1.2" strokeOpacity="0.65" fill="none" />

      {/* 4-Pointed Faceted Compass Star */}
      
      {/* NORTH POINT */}
      <polygon points="100,10 84,75 100,100" fill="#00B8D4" />
      <polygon points="100,10 116,75 100,100" fill="#00E5FF" />

      {/* SOUTH POINT */}
      <polygon points="100,190 84,125 100,100" fill="#00E5FF" />
      <polygon points="100,190 116,125 100,100" fill="#00B8D4" />

      {/* EAST POINT */}
      <polygon points="190,100 125,84 100,100" fill="#00E5FF" />
      <polygon points="190,100 125,116 100,100" fill="#00B8D4" />

      {/* WEST POINT */}
      <polygon points="10,100 75,84 100,100" fill="#00B8D4" />
      <polygon points="10,100 75,116 100,100" fill="#00E5FF" />

      {/* CENTRAL RING & HUB */}
      <circle cx="100" cy="100" r="16" fill="#080c14" stroke="#00E5FF" strokeWidth="3" />
      <circle cx="100" cy="100" r="6" fill="#00E5FF" />
    </svg>
  );
};

export default TripBalancingLogo;
