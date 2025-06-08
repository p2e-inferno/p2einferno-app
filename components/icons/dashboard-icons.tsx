import React from "react";

interface IconProps {
  className?: string;
  size?: number;
}

// Flame/Fire Icon for Infernal theme
export const FlameIcon: React.FC<IconProps> = ({
  className = "",
  size = 24,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className={className}
  >
    <path
      d="M12 2C9.38 3.21 8 5.81 8 8.5C8 12 10.5 15 12 16C13.5 15 16 12 16 8.5C16 5.81 14.62 3.21 12 2Z"
      fill="url(#flame-gradient)"
    />
    <path
      d="M12 16C10.5 17.5 8 19.5 8 21.5C8 22.33 8.67 23 9.5 23H14.5C15.33 23 16 22.33 16 21.5C16 19.5 13.5 17.5 12 16Z"
      fill="url(#flame-base)"
    />
    <defs>
      <linearGradient id="flame-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#ff6b6b" />
        <stop offset="50%" stopColor="#ff8e53" />
        <stop offset="100%" stopColor="#ff6348" />
      </linearGradient>
      <linearGradient id="flame-base" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#ff8e53" />
        <stop offset="100%" stopColor="#ff3838" />
      </linearGradient>
    </defs>
  </svg>
);

// Crystal/Gem Icon for rewards/points
export const CrystalIcon: React.FC<IconProps> = ({
  className = "",
  size = 24,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className={className}
  >
    <path
      d="M6 4L12 2L18 4L20 10L12 22L4 10L6 4Z"
      fill="url(#crystal-gradient)"
      stroke="url(#crystal-stroke)"
      strokeWidth="1.5"
    />
    <path
      d="M6 4L12 8L18 4M12 8L12 22M4 10L12 8L20 10"
      stroke="url(#crystal-lines)"
      strokeWidth="1"
      opacity="0.6"
    />
    <defs>
      <linearGradient id="crystal-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#00f5ff" />
        <stop offset="50%" stopColor="#0099ff" />
        <stop offset="100%" stopColor="#0066ff" />
      </linearGradient>
      <linearGradient id="crystal-stroke" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#00ccff" />
        <stop offset="100%" stopColor="#0066cc" />
      </linearGradient>
      <linearGradient id="crystal-lines" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="100%" stopColor="#cccccc" />
      </linearGradient>
    </defs>
  </svg>
);

// Sword Icon for quests/challenges
export const SwordIcon: React.FC<IconProps> = ({
  className = "",
  size = 24,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className={className}
  >
    <path
      d="M4 20L20 4M20 4L18 2L16 4L20 4ZM4 20L2 18L4 16L4 20Z"
      stroke="url(#sword-gradient)"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <circle cx="9" cy="15" r="1.5" fill="url(#sword-gem)" />
    <defs>
      <linearGradient id="sword-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ff00ff" />
        <stop offset="50%" stopColor="#cc00cc" />
        <stop offset="100%" stopColor="#990099" />
      </linearGradient>
      <radialGradient id="sword-gem">
        <stop offset="0%" stopColor="#ff66ff" />
        <stop offset="100%" stopColor="#cc00cc" />
      </radialGradient>
    </defs>
  </svg>
);

// Shield Icon for protection/security
export const ShieldIcon: React.FC<IconProps> = ({
  className = "",
  size = 24,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className={className}
  >
    <path
      d="M12 2L4 6V11C4 16.55 7.84 21.74 12 22C16.16 21.74 20 16.55 20 11V6L12 2Z"
      fill="url(#shield-gradient)"
      stroke="url(#shield-stroke)"
      strokeWidth="1.5"
    />
    <path
      d="M9 12L11 14L15 10"
      stroke="#ffffff"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <defs>
      <linearGradient id="shield-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#6a0dad" />
        <stop offset="50%" stopColor="#4b0082" />
        <stop offset="100%" stopColor="#2e004f" />
      </linearGradient>
      <linearGradient id="shield-stroke" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#9932cc" />
        <stop offset="100%" stopColor="#4b0082" />
      </linearGradient>
    </defs>
  </svg>
);

// Trophy Icon for achievements
export const TrophyIcon: React.FC<IconProps> = ({
  className = "",
  size = 24,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className={className}
  >
    <path
      d="M7 8H5C3.9 8 3 7.1 3 6V4C3 3.45 3.45 3 4 3H6V8Z"
      fill="url(#trophy-handle)"
    />
    <path
      d="M17 8H19C20.1 8 21 7.1 21 6V4C21 3.45 20.55 3 20 3H18V8Z"
      fill="url(#trophy-handle)"
    />
    <path
      d="M6 8V6C6 4.9 6.9 4 8 4H16C17.1 4 18 4.9 18 6V8C18 11.31 15.31 14 12 14C8.69 14 6 11.31 6 8Z"
      fill="url(#trophy-cup)"
    />
    <rect x="10" y="14" width="4" height="6" fill="url(#trophy-base)" />
    <rect x="8" y="20" width="8" height="2" fill="url(#trophy-bottom)" />
    <defs>
      <linearGradient id="trophy-cup" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#ffd700" />
        <stop offset="50%" stopColor="#ffb347" />
        <stop offset="100%" stopColor="#ff8c00" />
      </linearGradient>
      <linearGradient id="trophy-handle" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#c0c0c0" />
        <stop offset="100%" stopColor="#999999" />
      </linearGradient>
      <linearGradient id="trophy-base" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#8b7355" />
        <stop offset="100%" stopColor="#654321" />
      </linearGradient>
      <linearGradient id="trophy-bottom" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#4a4a4a" />
        <stop offset="100%" stopColor="#333333" />
      </linearGradient>
    </defs>
  </svg>
);

// Scroll Icon for documents/applications
export const ScrollIcon: React.FC<IconProps> = ({
  className = "",
  size = 24,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className={className}
  >
    <path
      d="M4 4C4 2.9 4.9 2 6 2H20C21.1 2 22 2.9 22 4V16C22 17.1 21.1 18 20 18H8L4 22V4Z"
      fill="url(#scroll-gradient)"
      stroke="url(#scroll-stroke)"
      strokeWidth="1.5"
    />
    <circle cx="5" cy="5" r="1" fill="#ff6b6b" />
    <circle cx="5" cy="8" r="1" fill="#ff8e53" />
    <defs>
      <linearGradient id="scroll-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#f4f1eb" />
        <stop offset="100%" stopColor="#e8dcc0" />
      </linearGradient>
      <linearGradient id="scroll-stroke" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#d4af37" />
        <stop offset="100%" stopColor="#b8860b" />
      </linearGradient>
    </defs>
  </svg>
);

// Portal Icon for navigation
export const PortalIcon: React.FC<IconProps> = ({
  className = "",
  size = 24,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className={className}
  >
    <circle
      cx="12"
      cy="12"
      r="9"
      fill="none"
      stroke="url(#portal-outer)"
      strokeWidth="2"
    />
    <circle cx="12" cy="12" r="6" fill="url(#portal-inner)" opacity="0.8" />
    <circle cx="12" cy="12" r="3" fill="url(#portal-core)" />
    <defs>
      <linearGradient id="portal-outer" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#00ffff" />
        <stop offset="50%" stopColor="#ff00ff" />
        <stop offset="100%" stopColor="#00ffff" />
      </linearGradient>
      <radialGradient id="portal-inner">
        <stop offset="0%" stopColor="#9932cc" opacity="0.3" />
        <stop offset="50%" stopColor="#6a0dad" opacity="0.6" />
        <stop offset="100%" stopColor="#4b0082" opacity="0.9" />
      </radialGradient>
      <radialGradient id="portal-core">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="50%" stopColor="#00ffff" />
        <stop offset="100%" stopColor="#ff00ff" />
      </radialGradient>
    </defs>
  </svg>
);

// Lightning Icon for events/energy
export const LightningIcon: React.FC<IconProps> = ({
  className = "",
  size = 24,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className={className}
  >
    <path
      d="M13 2L4 14H11L10 22L20 10H13L13 2Z"
      fill="url(#lightning-gradient)"
      stroke="url(#lightning-stroke)"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    <defs>
      <linearGradient id="lightning-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#fff700" />
        <stop offset="50%" stopColor="#ffaa00" />
        <stop offset="100%" stopColor="#ff6600" />
      </linearGradient>
      <linearGradient id="lightning-stroke" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#ffff00" />
        <stop offset="100%" stopColor="#ff8800" />
      </linearGradient>
    </defs>
  </svg>
);

// Profile Icon for user profile
export const ProfileIcon: React.FC<IconProps> = ({
  className = "",
  size = 24,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className={className}
  >
    <circle cx="12" cy="8" r="4" fill="url(#profile-head)" />
    <path
      d="M20 19V21H4V19C4 15.6863 6.68629 13 10 13H14C17.3137 13 20 15.6863 20 19Z"
      fill="url(#profile-body)"
    />
    <defs>
      <linearGradient id="profile-head" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#b794f4" />
        <stop offset="100%" stopColor="#9f7aea" />
      </linearGradient>
      <linearGradient id="profile-body" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#9f7aea" />
        <stop offset="100%" stopColor="#805ad5" />
      </linearGradient>
    </defs>
  </svg>
);
