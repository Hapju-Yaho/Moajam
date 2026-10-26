export type AppIconName =
  | 'send'
  | 'share'
  | 'bell'
  | 'calendar'
  | 'chevron-down'
  | 'chevron-right'
  | 'guitar'
  | 'heart'
  | 'help'
  | 'home'
  | 'logo'
  | 'message'
  | 'more'
  | 'rehearsal'
  | 'settings'
  | 'songs'
  | 'sparkles'
  | 'user-plus'
  | 'users';

interface AppIconProps {
  name: AppIconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

const drawings: Record<AppIconName, string> = {
  send: '<path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13"/>',
  share:
    '<path d="M14 3h7v7M21 3l-9 9M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/>',
  logo: '<path d="M9 18V6.8L19 4v10.2"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="14.2" r="2.5"/>',
  home: '<path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9M9 20v-6h6v6"/>',
  sparkles:
    '<path d="m12 3 1.25 3.75L17 8l-3.75 1.25L12 13l-1.25-3.75L7 8l3.75-1.25L12 3Z"/><path d="m5 14 .8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14Z"/><path d="m19 13 .65 1.85 1.85.65-1.85.65L19 18l-.65-1.85-1.85-.65 1.85-.65L19 13Z"/>',
  songs: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 5V3h8v2M8 10h8M8 14h5"/>',
  rehearsal:
    '<path d="M9 18V6.8L19 4v10.2"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="14.2" r="2.5"/>',
  users:
    '<circle cx="9" cy="8" r="3"/><path d="M3.5 19v-1.2A4.8 4.8 0 0 1 8.3 13h1.4a4.8 4.8 0 0 1 4.8 4.8V19"/><path d="M16 5.3a3 3 0 0 1 0 5.4M17 13.3a4.8 4.8 0 0 1 3.5 4.6V19"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M19 14.5a2 2 0 0 0 .4 2.2l.1.1-2.7 2.7-.1-.1a2 2 0 0 0-2.2-.4 2 2 0 0 0-1.2 1.8V21H9.5v-.2A2 2 0 0 0 8.3 19a2 2 0 0 0-2.2.4l-.1.1-2.7-2.7.1-.1a2 2 0 0 0 .4-2.2A2 2 0 0 0 2 13.3H2V9.5h.2A2 2 0 0 0 4 8.3a2 2 0 0 0-.4-2.2L3.5 6l2.7-2.7.1.1a2 2 0 0 0 2.2.4A2 2 0 0 0 9.7 2H10V2h4v.2a2 2 0 0 0 1.2 1.8 2 2 0 0 0 2.2-.4l.1-.1L20.2 6l-.1.1a2 2 0 0 0-.4 2.2A2 2 0 0 0 21.5 9.5h.2v3.8h-.2a2 2 0 0 0-2.5 1.2Z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.5 2.5 0 1 1 3.6 2.25c-.8.4-1.3.9-1.3 1.75"/><path d="M12 17h.01"/>',
  guitar:
    '<path d="m14.4 5.6 4-4 4 4-4 4"/><path d="m17 7-6.2 6.2"/><path d="M12.6 12.3c2 2.5.8 6.8-2.7 8.6-3.2 1.7-7 .8-7.8-1.8-.5-1.8.7-2.6 2.1-3.2 1.7-.7 1.2-2.5 2.4-3.6 1.7-1.6 4.4-1.5 6 .1Z"/><circle cx="8.7" cy="15.4" r="1.3"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'chevron-right': '<path d="m9 6 6 6-6 6"/>',
  'user-plus':
    '<circle cx="9" cy="8" r="3"/><path d="M3 20v-1.4A5.6 5.6 0 0 1 8.6 13h.8a5.5 5.5 0 0 1 4.3 2.1M18 8v6M15 11h6"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
  more: '<circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/><path d="m8.5 15 2 2 4.5-4.5"/>',
  heart:
    '<path d="M20.8 5.7a5.4 5.4 0 0 0-7.7 0L12 6.8l-1.1-1.1a5.4 5.4 0 0 0-7.7 7.7L12 22l8.8-8.6a5.4 5.4 0 0 0 0-7.7Z"/>',
  message: '<path d="M21 14a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v7Z"/>',
};

export function AppIcon({
  name,
  size = 20,
  color = 'currentColor',
  strokeWidth = 1.8,
}: AppIconProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      color={color}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block', flexShrink: 0 }}
      dangerouslySetInnerHTML={{ __html: drawings[name] }}
    />
  );
}
