// 内联 SVG 图标（线性风格，currentColor）
import type { JSX } from 'preact';

type P = { size?: number };

const S = (children: JSX.Element | JSX.Element[], size = 24) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const IconBack = ({ size }: P) => S(<path d="M15 5l-7 7 7 7" />, size);
export const IconClose = ({ size }: P) => S(<path d="M6 6l12 12M18 6L6 18" />, size);
export const IconPause = ({ size }: P) => S([<rect x="6.5" y="5" width="3.5" height="14" rx="1" />, <rect x="14" y="5" width="3.5" height="14" rx="1" />], size);
export const IconPlay = ({ size }: P) => S(<path d="M8 5.5v13l10.5-6.5z" />, size);
export const IconHelp = ({ size }: P) =>
  S([<circle cx="12" cy="12" r="9" />, <path d="M9.5 9.3a2.6 2.6 0 015 .9c0 1.8-2.5 2.2-2.5 3.8" />, <circle cx="12" cy="17.2" r=".6" fill="currentColor" />], size);
export const IconGear = ({ size }: P) =>
  S(
    [
      <circle cx="12" cy="12" r="3" />,
      <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />,
    ],
    size,
  );
export const IconUndo = ({ size }: P) => S([<path d="M9 14L4 9l5-5" />, <path d="M4 9h10.5a5.5 5.5 0 010 11H11" />], size);
export const IconRedo = ({ size }: P) => S([<path d="M15 14l5-5-5-5" />, <path d="M20 9H9.5a5.5 5.5 0 000 11H13" />], size);
export const IconErase = ({ size }: P) =>
  S([<path d="M20 20H9L4.5 15.5a2 2 0 010-2.8l8.8-8.8a2 2 0 012.8 0l3.9 3.9a2 2 0 010 2.8L12 18.6" />, <path d="M8.5 9.5l6 6" />], size);
export const IconPencil = ({ size }: P) => S([<path d="M4 20l4.2-1 10.6-10.6a2 2 0 00-2.8-2.8L5.4 16.2z" />, <path d="M14.5 7l2.5 2.5" />], size);
export const IconBulb = ({ size }: P) =>
  S([<path d="M9 18h6M10 21h4" />, <path d="M12 3a6 6 0 00-3.6 10.8c.6.5 1 1.2 1.1 2V16h5v-.2c.1-.8.5-1.5 1.1-2A6 6 0 0012 3z" />], size);
export const IconMore = ({ size }: P) =>
  S([<circle cx="5.5" cy="12" r="1.3" fill="currentColor" />, <circle cx="12" cy="12" r="1.3" fill="currentColor" />, <circle cx="18.5" cy="12" r="1.3" fill="currentColor" />], size);
export const IconLock = ({ size }: P) => S([<rect x="5" y="11" width="14" height="9" rx="2" />, <path d="M8 11V8a4 4 0 018 0v3" />], size);
export const IconShare = ({ size }: P) => S([<path d="M12 3v12" />, <path d="M8 7l4-4 4 4" />, <path d="M6 11v8a2 2 0 002 2h8a2 2 0 002-2v-8" />], size);
export const IconImport = ({ size }: P) => S([<path d="M12 15V3" />, <path d="M8 11l4 4 4-4" />, <path d="M5 17v2a2 2 0 002 2h10a2 2 0 002-2v-2" />], size);
export const IconBackup = ({ size }: P) =>
  S([<path d="M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z" />, <path d="M4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7" />, <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />], size);
export const IconHistory = ({ size }: P) => S([<path d="M3 12a9 9 0 103-6.7L3 8" />, <path d="M3 3v5h5" />, <path d="M12 7v5l3 2" />], size);
export const IconStats = ({ size }: P) => S([<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />], size);
export const IconList = ({ size }: P) => S([<path d="M9 6h11M9 12h11M9 18h11" />, <circle cx="4.5" cy="6" r="1" />, <circle cx="4.5" cy="12" r="1" />, <circle cx="4.5" cy="18" r="1" />], size);
export const IconPlus = ({ size }: P) => S(<path d="M12 5v14M5 12h14" />, size);
export const IconBook = ({ size }: P) => S([<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z" />, <path d="M4 5v16" />, <path d="M9 7h6" />], size);
export const IconRestart = ({ size }: P) => S([<path d="M20 11a8 8 0 10-2.3 6" />, <path d="M20 4v7h-7" />], size);
export const IconFlag = ({ size }: P) => S([<path d="M5 21V4" />, <path d="M5 4h11l-2 4 2 4H5" />], size);
export const IconGrid = ({ size }: P) => S([<rect x="3" y="3" width="7" height="7" rx="1" />, <rect x="14" y="3" width="7" height="7" rx="1" />, <rect x="3" y="14" width="7" height="7" rx="1" />, <rect x="14" y="14" width="7" height="7" rx="1" />], size);
export const IconMagic = ({ size }: P) => S([<path d="M5 19L17 7" />, <path d="M15 5l4 4" />, <path d="M6 4v3M4.5 5.5h3M19 15v3M17.5 16.5h3" />], size);
export const IconInstall = ({ size }: P) => S([<rect x="6" y="2.5" width="12" height="19" rx="2.5" />, <path d="M12 7v7M9 11l3 3 3-3" />], size);
export const IconCopy = ({ size }: P) => S([<rect x="8" y="8" width="12" height="12" rx="2" />, <path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" />], size);
export const IconCombo = ({ size }: P) => S([<rect x="3.5" y="3.5" width="17" height="17" rx="2" stroke-dasharray="3 2.5" />, <path d="M8 9h3M9.5 7.5v3M13 15h3" />], size);
export const IconCheck = ({ size }: P) => S(<path d="M5 12.5l4.5 4.5L19 7.5" />, size);
export const ShareIcon = () => S([<path d="M12 3v12" />, <path d="M8 7l4-4 4 4" />, <path d="M6 11v8a2 2 0 002 2h8a2 2 0 002-2v-8" />], 22);
export const AddIcon = () => S([<rect x="3.5" y="3.5" width="17" height="17" rx="4" />, <path d="M12 8v8M8 12h8" />], 22);
