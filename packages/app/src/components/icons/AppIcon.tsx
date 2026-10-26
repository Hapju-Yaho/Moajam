import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';

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
  | 'studio'
  | 'microphone'
  | 'headphones'
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

export function AppIcon({
  name,
  size = 20,
  color = 'currentColor',
  strokeWidth = 1.8,
}: AppIconProps) {
  const common = {
    fill: 'none',
    stroke: color,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth,
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      {name === 'studio' && (
        <>
          <Rect {...common} x="3" y="4" width="18" height="16" rx="2" />
          <Path {...common} d="M8 8v8M16 8v8M5 11h6M13 14h6" />
        </>
      )}
      {name === 'microphone' && (
        <>
          <Rect {...common} x="9" y="2" width="6" height="12" rx="3" />
          <Path {...common} d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />
        </>
      )}
      {name === 'headphones' && (
        <>
          <Path {...common} d="M3 14v-3a9 9 0 0 1 18 0v3" />
          <Rect {...common} x="3" y="12" width="4" height="8" rx="2" />
          <Rect {...common} x="17" y="12" width="4" height="8" rx="2" />
        </>
      )}
      {name === 'send' && <Path {...common} d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13" />}
      {name === 'share' && (
        <Path
          {...common}
          d="M14 3h7v7M21 3l-9 9M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"
        />
      )}
      {name === 'logo' && (
        <>
          <Path {...common} d="M9 18V6.8L19 4v10.2" />
          <Circle {...common} cx="6.5" cy="18" r="2.5" />
          <Circle {...common} cx="16.5" cy="14.2" r="2.5" />
        </>
      )}
      {name === 'home' && (
        <>
          <Path {...common} d="m3 10 9-7 9 7" />
          <Path {...common} d="M5 9v11h14V9M9 20v-6h6v6" />
        </>
      )}
      {name === 'sparkles' && (
        <>
          <Path
            {...common}
            d="m12 3 1.25 3.75L17 8l-3.75 1.25L12 13l-1.25-3.75L7 8l3.75-1.25L12 3Z"
          />
          <Path {...common} d="m5 14 .8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14Z" />
          <Path
            {...common}
            d="m19 13 .65 1.85 1.85.65-1.85.65L19 18l-.65-1.85-1.85-.65 1.85-.65L19 13Z"
          />
        </>
      )}
      {name === 'songs' && (
        <>
          <Rect {...common} x="4" y="5" width="16" height="15" rx="2" />
          <Path {...common} d="M8 5V3h8v2M8 10h8M8 14h5" />
        </>
      )}
      {name === 'rehearsal' && (
        <>
          <Path {...common} d="M9 18V6.8L19 4v10.2" />
          <Circle {...common} cx="6.5" cy="18" r="2.5" />
          <Circle {...common} cx="16.5" cy="14.2" r="2.5" />
        </>
      )}
      {name === 'users' && (
        <>
          <Circle {...common} cx="9" cy="8" r="3" />
          <Path {...common} d="M3.5 19v-1.2A4.8 4.8 0 0 1 8.3 13h1.4a4.8 4.8 0 0 1 4.8 4.8V19" />
          <Path {...common} d="M16 5.3a3 3 0 0 1 0 5.4M17 13.3a4.8 4.8 0 0 1 3.5 4.6V19" />
        </>
      )}
      {name === 'settings' && (
        <>
          <Circle {...common} cx="12" cy="12" r="3" />
          <Path
            {...common}
            d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.55v-.09A1.7 1.7 0 0 0 8.45 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 4.05 15a1.7 1.7 0 0 0-.6-1A1.7 1.7 0 0 0 2.35 13H2.3V9h.1A1.7 1.7 0 0 0 4 7.9a1.7 1.7 0 0 0-.34-1.88l-.06-.06L6.46 3.1l.06.06A1.7 1.7 0 0 0 8.4 3.5a1.7 1.7 0 0 0 1-.6A1.7 1.7 0 0 0 9.8 1.8V1.7h4.05v.1A1.7 1.7 0 0 0 15 3.4a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19.4 7.8a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1.1.4h.1v4.05h-.1A1.7 1.7 0 0 0 19.4 15Z"
          />
        </>
      )}
      {name === 'help' && (
        <>
          <Circle {...common} cx="12" cy="12" r="9" />
          <Path {...common} d="M9.7 9a2.5 2.5 0 1 1 3.6 2.25c-.8.4-1.3.9-1.3 1.75" />
          <Line {...common} x1="12" y1="17" x2="12.01" y2="17" />
        </>
      )}
      {name === 'guitar' && (
        <>
          <Path {...common} d="m14.4 5.6 4-4 4 4-4 4" />
          <Path {...common} d="m17 7-6.2 6.2" />
          <Path
            {...common}
            d="M12.6 12.3c2 2.5.8 6.8-2.7 8.6-3.2 1.7-7 .8-7.8-1.8-.5-1.8.7-2.6 2.1-3.2 1.7-.7 1.2-2.5 2.4-3.6 1.7-1.6 4.4-1.5 6 .1Z"
          />
          <Circle {...common} cx="8.7" cy="15.4" r="1.3" />
        </>
      )}
      {name === 'chevron-down' && <Polyline {...common} points="6 9 12 15 18 9" />}
      {name === 'chevron-right' && <Polyline {...common} points="9 6 15 12 9 18" />}
      {name === 'user-plus' && (
        <>
          <Circle {...common} cx="9" cy="8" r="3" />
          <Path
            {...common}
            d="M3 20v-1.4A5.6 5.6 0 0 1 8.6 13h.8a5.5 5.5 0 0 1 4.3 2.1M18 8v6M15 11h6"
          />
        </>
      )}
      {name === 'bell' && (
        <>
          <Path {...common} d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <Path {...common} d="M10 21h4" />
        </>
      )}
      {name === 'more' && (
        <>
          <Circle cx="5" cy="12" r="1.5" fill={color} />
          <Circle cx="12" cy="12" r="1.5" fill={color} />
          <Circle cx="19" cy="12" r="1.5" fill={color} />
        </>
      )}
      {name === 'calendar' && (
        <>
          <Rect {...common} x="3" y="5" width="18" height="16" rx="3" />
          <Path {...common} d="M8 3v4M16 3v4M3 10h18" />
          <Path {...common} d="m8.5 15 2 2 4.5-4.5" />
        </>
      )}
      {name === 'heart' && (
        <Path
          {...common}
          d="M20.8 5.7a5.4 5.4 0 0 0-7.7 0L12 6.8l-1.1-1.1a5.4 5.4 0 0 0-7.7 7.7L12 22l8.8-8.6a5.4 5.4 0 0 0 0-7.7Z"
        />
      )}
      {name === 'message' && (
        <Path {...common} d="M21 14a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v7Z" />
      )}
    </Svg>
  );
}
