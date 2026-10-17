interface IconProps {
  name: IconName;
  size?: number;
  filled?: boolean;
  className?: string;
}

export type IconName =
  | 'home'
  | 'compass'
  | 'plus'
  | 'inbox'
  | 'user'
  | 'heart'
  | 'comment'
  | 'bookmark'
  | 'share'
  | 'music'
  | 'search'
  | 'close'
  | 'back'
  | 'more'
  | 'live'
  | 'bag'
  | 'settings'
  | 'logout'
  | 'play'
  | 'pause'
  | 'check'
  | 'verified'
  | 'camera'
  | 'upload'
  | 'trash'
  | 'edit'
  | 'send'
  | 'gift'
  | 'eye'
  | 'chart'
  | 'link'
  | 'lock'
  | 'globe'
  | 'flag'
  | 'grid'
  | 'lock-small'
  | 'heart-small'
  | 'chat'
  | 'coins'
  | 'stitch'
  | 'duet'
  | 'volume'
  | 'mute';

const PATHS: Record<IconName, string> = {
  home: 'M3 10.5 12 3l9 7.5M5.5 9.5V21h13V9.5',
  compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM15.6 8.4l-2.2 5.2-5.2 2.2 2.2-5.2 5.2-2.2Z',
  plus: 'M12 5v14M5 12h14',
  inbox: 'M3 12h5l1.5 3h5L16 12h5M3 12l3-7h12l3 7v6H3v-6Z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20a7.5 7.5 0 0 1 15 0',
  heart: 'M12 20s-7.5-4.7-7.5-10A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 7.5 3c0 5.3-7.5 10-7.5 10Z',
  comment: 'M21 12a8 8 0 0 1-8 8H4l2-3.2A8 8 0 1 1 21 12Z',
  bookmark: 'M6 3h12v18l-6-4.5L6 21V3Z',
  share: 'M4 12v7h16v-7M12 3v13M8 7l4-4 4 4',
  music: 'M9 18V5l10-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm10-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35',
  close: 'M6 6l12 12M18 6 6 18',
  back: 'M15 5l-7 7 7 7',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  live: 'M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM7.8 7.8a6 6 0 0 0 0 8.4m8.4 0a6 6 0 0 0 0-8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14',
  bag: 'M6 8h12l-1 12H7L6 8Zm3 0V6a3 3 0 0 1 6 0v2',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8.2-3a8 8 0 0 0-.13-1.4l2-1.55-2-3.46-2.36.95a8 8 0 0 0-2.42-1.4L14.9 2H9.1l-.4 2.14a8 8 0 0 0-2.42 1.4L3.93 5.6l-2 3.46 2 1.55a8 8 0 0 0 0 2.8l-2 1.55 2 3.46 2.36-.95a8 8 0 0 0 2.42 1.4l.4 2.14h5.8l.4-2.14a8 8 0 0 0 2.42-1.4l2.36.95 2-3.46-2-1.55c.09-.46.13-.93.13-1.4Z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  play: 'M7 4.5v15l13-7.5-13-7.5Z',
  pause: 'M8 4.5v15M16 4.5v15',
  check: 'M4 12.5 9.5 18 20 6.5',
  verified: 'm12 2 2.4 2 3.2-.3 1 3 2.8 1.6-1.1 3 1.1 3-2.8 1.6-1 3-3.2-.3L12 22l-2.4-2.4-3.2.3-1-3-2.8-1.6 1.1-3-1.1-3 2.8-1.6 1-3 3.2.3L12 2Zm-2.2 9.8 1.7 1.7 3.4-3.6',
  camera: 'M3 8h4l2-2.5h6L17 8h4v11H3V8Zm9 8.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
  upload: 'M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 16v3h16v-3',
  trash: 'M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13',
  edit: 'M4 20h4l10.5-10.5-4-4L4 16v4Zm10-13 4 4',
  send: 'M4 12 21 4l-7 17-2.5-7.5L4 12Z',
  gift: 'M4 11h16v9H4v-9Zm0 0V8h16v3M12 8v12M12 8S9.5 3.5 7.5 4.5 9 8 12 8Zm0 0s2.5-4.5 4.5-3.5S15 8 12 8Z',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Zm9.5 2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  chart: 'M4 20V10m5 10V4m5 16v-7m5 7V8',
  link: 'M9.5 14.5 14.5 9.5M10 7l2-2a4 4 0 1 1 5.7 5.7L16 12M14 17l-2 2A4 4 0 1 1 6.3 13.3L8 12',
  lock: 'M6 11h12v10H6V11Zm2 0V8a4 4 0 0 1 8 0v3',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-18c2.5 2.4 4 6 4 9s-1.5 6.6-4 9c-2.5-2.4-4-6-4-9s1.5-6.6 4-9ZM3.5 9h17M3.5 15h17',
  flag: 'M5 21V4m0 0 6 1.5L11 4l6 1.5L17 4h3v11h-3l-6 1.5L11 15l-6 1.5',
  grid: 'M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z',
  'lock-small': 'M7 10V7.5a2.5 2.5 0 0 1 5 0V10',
  'heart-small': 'M12 17s-4.5-2.8-4.5-6a2.7 2.7 0 0 1 4.5-2 2.7 2.7 0 0 1 4.5 2c0 3.2-4.5 6-4.5 6Z',
  chat: 'M4 6h16v10H9l-5 4V6Z',
  coins: 'M12 21c4.97 0 9-1.34 9-3s-4.03-3-9-3-9 1.34-9 3 4.03 3 9 3Zm9-3c0 1.66-4.03 3-9 3s-9-1.34-9-3M21 12c0 1.66-4.03 3-9 3s-9-1.34-9-3m18-3c0 1.66-4.03 3-9 3S3 10.66 3 9s4.03-3 9-3 9 1.34 9 3Z',
  stitch: 'M12 3v18M7 8l-4 4 4 4M17 8l4 4-4 4',
  duet: 'M4 4h7v16H4V4Zm9 0h7v16h-7V4Zm0 8h7',
  volume: 'M4 9.5h3.5L12 5v14l-4.5-4.5H4v-5Zm11.5-1.5a5 5 0 0 1 0 8',
  mute: 'M4 9.5h3.5L12 5v14l-4.5-4.5H4v-5Zm12.5 1 4 4m0-4-4 4',
};

const FILLED: Partial<Record<IconName, string>> = {
  heart: 'M12 20s-7.5-4.7-7.5-10A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 7.5 3c0 5.3-7.5 10-7.5 10Z',
  bookmark: 'M6 3h12v18l-6-4.5L6 21V3Z',
  home: 'M3 10.5 12 3l9 7.5V21H3V10.5Z',
  'heart-small': 'M12 17s-4.5-2.8-4.5-6a2.7 2.7 0 0 1 4.5-2 2.7 2.7 0 0 1 4.5 2c0 3.2-4.5 6-4.5 6Z',
  music: 'M9 18V5l10-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm10-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
};

export function Icon({ name, size = 24, filled, className }: IconProps) {
  const fillPath = filled ? FILLED[name] : undefined;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fillPath ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={fillPath ? 0 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={fillPath ?? PATHS[name]} />
    </svg>
  );
}
