/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

export type MascotPose = 'idle' | 'inspecting' | 'celebrating' | 'thinking' | 'financial' | 'guard';

interface SiGembulMascotProps {
  pose?: MascotPose;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSpeechBubble?: boolean;
  speechText?: string;
}

export const SiGembulMascot: React.FC<SiGembulMascotProps> = ({
  pose = 'idle',
  className = '',
  size = 'md',
  showSpeechBubble = false,
  speechText,
}) => {
  const sizeMap = {
    sm: 'w-12 h-12',
    md: 'w-20 h-20',
    lg: 'w-32 h-32',
    xl: 'w-44 h-44',
  };

  return (
    <div className={`relative inline-flex items-center select-none ${className}`}>
      {/* Speech Bubble */}
      {showSpeechBubble && speechText && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-20 whitespace-nowrap bg-white text-slate-800 text-xs font-semibold px-3 py-1.5 rounded-xl shadow-md border border-slate-200 animate-bounce">
          {speechText}
          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-b border-r border-slate-200 rotate-45" />
        </div>
      )}

      {/* SVG Vector Mascot */}
      <svg
        viewBox="0 0 200 200"
        className={`${sizeMap[size]} transition-transform duration-300 hover:scale-105 drop-shadow-sm`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Soft Shadow */}
        <ellipse cx="100" cy="182" rx="65" ry="12" fill="#E2E8F0" opacity="0.8" />

        {/* Cat Tail */}
        <path
          d="M150 145 C175 145 185 115 175 95 C170 85 158 90 162 100 C168 115 155 130 140 135"
          stroke="#64748B"
          strokeWidth="14"
          strokeLinecap="round"
        />
        {/* White Tail Tip */}
        <path
          d="M175 95 C170 85 158 90 162 100"
          stroke="#F8FAFC"
          strokeWidth="12"
          strokeLinecap="round"
        />

        {/* Chubby Cat Body */}
        <ellipse cx="100" cy="135" rx="62" ry="50" fill="#64748B" />
        {/* White Belly Patch */}
        <ellipse cx="100" cy="142" rx="42" ry="36" fill="#F8FAFC" />

        {/* Left Ear */}
        <polygon points="52,72 40,25 78,48" fill="#64748B" />
        <polygon points="54,66 46,36 72,50" fill="#F472B6" opacity="0.7" />

        {/* Right Ear */}
        <polygon points="148,72 160,25 122,48" fill="#64748B" />
        <polygon points="146,66 154,36 128,50" fill="#F472B6" opacity="0.7" />

        {/* Chubby Round Head */}
        <ellipse cx="100" cy="82" rx="56" ry="46" fill="#64748B" />
        {/* White Face Mask / Patch */}
        <path
          d="M70 70 C70 50 130 50 130 70 C145 78 152 105 138 120 C120 130 80 130 62 120 C48 105 55 78 70 70 Z"
          fill="#F8FAFC"
        />

        {/* Forehead Gray Marking */}
        <path
          d="M90 40 L100 64 L110 40 Z"
          fill="#475569"
        />

        {/* Whiskers Left */}
        <line x1="32" y1="88" x2="62" y2="86" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="30" y1="96" x2="60" y2="96" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="34" y1="104" x2="62" y2="102" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" />

        {/* Whiskers Right */}
        <line x1="168" y1="88" x2="138" y2="86" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="170" y1="96" x2="140" y2="96" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="166" y1="104" x2="138" y2="102" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" />

        {/* Eyes based on Pose */}
        {pose === 'celebrating' ? (
          <>
            {/* Happy Curved Eyes ^_^ */}
            <path d="M74 84 Q82 72 90 84" stroke="#0F172A" strokeWidth="4" strokeLinecap="round" fill="none" />
            <path d="M110 84 Q118 72 126 84" stroke="#0F172A" strokeWidth="4" strokeLinecap="round" fill="none" />
          </>
        ) : pose === 'thinking' ? (
          <>
            {/* Thinking Eyes */}
            <ellipse cx="80" cy="80" rx="7" ry="8" fill="#0F172A" />
            <circle cx="82" cy="77" r="2.5" fill="#FFFFFF" />
            <path d="M110 82 Q120 76 128 84" stroke="#0F172A" strokeWidth="3.5" strokeLinecap="round" fill="none" />
          </>
        ) : (
          <>
            {/* Big Expressive Anime/Kawaii Cat Eyes */}
            <ellipse cx="80" cy="82" rx="7.5" ry="9" fill="#0F172A" />
            <circle cx="82" cy="79" r="3" fill="#FFFFFF" />
            <circle cx="77" cy="86" r="1.5" fill="#FFFFFF" />

            <ellipse cx="120" cy="82" rx="7.5" ry="9" fill="#0F172A" />
            <circle cx="122" cy="79" r="3" fill="#FFFFFF" />
            <circle cx="117" cy="86" r="1.5" fill="#FFFFFF" />
          </>
        )}

        {/* Rosy Cheeks */}
        <ellipse cx="64" cy="95" rx="8" ry="4" fill="#FDA4AF" opacity="0.8" />
        <ellipse cx="136" cy="95" rx="8" ry="4" fill="#FDA4AF" opacity="0.8" />

        {/* Cute Pink Heart-Shaped Nose */}
        <polygon points="96,93 104,93 100,98" fill="#F43F5E" />

        {/* Mouth (Cat :3 mouth) */}
        <path
          d="M93 99 Q100 106 100 99 Q100 106 107 99"
          stroke="#0F172A"
          strokeWidth="2.8"
          strokeLinecap="round"
          fill="none"
        />

        {/* Poses & Hand Props */}
        {pose === 'guard' && (
          <g>
            {/* Reseller Guard Badge / Shield */}
            <path
              d="M100 135 L122 145 C122 165 100 178 100 178 C100 178 78 165 78 145 Z"
              fill="#10B981"
              stroke="#047857"
              strokeWidth="3"
            />
            {/* Shield Checkmark */}
            <path d="M90 152 L97 159 L111 146" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        )}

        {pose === 'inspecting' && (
          <g>
            {/* Magnifying Glass */}
            <circle cx="138" cy="82" r="18" stroke="#F59E0B" strokeWidth="4.5" fill="#FEF3C7" fillOpacity="0.4" />
            <line x1="151" y1="95" x2="168" y2="114" stroke="#92400E" strokeWidth="6" strokeLinecap="round" />
            {/* Right Paw holding handle */}
            <ellipse cx="152" cy="100" rx="9" ry="8" fill="#F8FAFC" stroke="#64748B" strokeWidth="2" />
          </g>
        )}

        {pose === 'celebrating' && (
          <g>
            {/* Paws Up in the Air */}
            <ellipse cx="50" cy="70" rx="9" ry="11" fill="#F8FAFC" stroke="#64748B" strokeWidth="2" />
            <ellipse cx="150" cy="70" rx="9" ry="11" fill="#F8FAFC" stroke="#64748B" strokeWidth="2" />
            {/* Gold Sparkle */}
            <path d="M100 22 L103 30 L111 33 L103 36 L100 44 L97 36 L89 33 L97 30 Z" fill="#FBBF24" />
          </g>
        )}

        {pose === 'financial' && (
          <g>
            {/* Tutup Buku Ledger & Gold Coin */}
            <rect x="76" y="132" width="48" height="36" rx="4" fill="#0284C7" stroke="#0369A1" strokeWidth="2" />
            <rect x="80" y="136" width="40" height="28" rx="2" fill="#F0F9FF" />
            <line x1="84" y1="143" x2="116" y2="143" stroke="#0284C7" strokeWidth="2" />
            <line x1="84" y1="150" x2="108" y2="150" stroke="#0284C7" strokeWidth="2" />
            <circle cx="130" cy="148" r="10" fill="#F59E0B" stroke="#B45309" strokeWidth="2" />
            <text x="127" y="152" fill="#78350F" fontSize="10" fontWeight="bold" fontFamily="sans-serif">Rp</text>
          </g>
        )}

        {/* Regular Cute Paws (if not in special hands pose) */}
        {pose !== 'celebrating' && pose !== 'inspecting' && pose !== 'guard' && (
          <>
            <ellipse cx="78" cy="162" rx="14" ry="10" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="1.5" />
            <ellipse cx="122" cy="162" rx="14" ry="10" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="1.5" />
            {/* Toe pads */}
            <circle cx="74" cy="164" r="2" fill="#FDA4AF" />
            <circle cx="78" cy="165" r="2" fill="#FDA4AF" />
            <circle cx="82" cy="164" r="2" fill="#FDA4AF" />

            <circle cx="118" cy="164" r="2" fill="#FDA4AF" />
            <circle cx="122" cy="165" r="2" fill="#FDA4AF" />
            <circle cx="126" cy="164" r="2" fill="#FDA4AF" />
          </>
        )}
      </svg>
    </div>
  );
};
