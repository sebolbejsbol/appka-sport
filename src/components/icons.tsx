import Svg, { Circle, Path } from 'react-native-svg';

/**
 * Zestaw ikon linii (redesign 2026-08-21) — zastępuje emoji (📅📍👥) w
 * kartach eventów/UI. Jeden spójny styl: 24px grid, stroke, zaokrąglone
 * końce, brak wypełnienia — pasuje do ikon sportu już używanych na mapie
 * (patrz map-theme.ts / sportBubbleIcons).
 */
type IconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
};

export function CalendarIcon({ size = 16, color = '#46566c', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4.5 6.5A2 2 0 0 1 6.5 4.5h11a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-12Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Path d="M4.5 9.5h15" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M8 3v3M16 3v3" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function PinIcon({ size = 16, color = '#46566c', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx="12" cy="9.5" r="2.4" stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

export function ChatIcon({ size = 16, color = '#46566c', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8A2.5 2.5 0 0 1 17.5 16H10l-4.5 4v-4H6.5A2.5 2.5 0 0 1 4 13.5v-8Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function TrophyIcon({ size = 16, color = '#46566c', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M7 4h10v5a5 5 0 0 1-10 0V4Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Path
        d="M7 5.5H4.5A1.5 1.5 0 0 0 3 7c0 2 1.5 3.5 4 3.5M17 5.5h2.5A1.5 1.5 0 0 1 21 7c0 2-1.5 3.5-4 3.5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <Path d="M12 14v3.5M9 20.5h6M9.5 17.5h5l.5 3H9l.5-3Z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
    </Svg>
  );
}

export function CheckCircleIcon({ size = 16, color = '#46566c', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth={strokeWidth} />
      <Path d="M7.5 12.5l3 3 6-6.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function ShareIcon({ size = 16, color = '#46566c', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="18" cy="5.5" r="2.6" stroke={color} strokeWidth={strokeWidth} />
      <Circle cx="6" cy="12" r="2.6" stroke={color} strokeWidth={strokeWidth} />
      <Circle cx="18" cy="18.5" r="2.6" stroke={color} strokeWidth={strokeWidth} />
      <Path d="M8.3 10.6l7.4-3.7M8.3 13.4l7.4 3.7" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function SlidersIcon({ size = 16, color = '#46566c', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 6h9M18 6h1M4 12h1M8 12h12M5 18h13M20 18h0" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Circle cx="16" cy="6" r="2" fill="#fff" stroke={color} strokeWidth={strokeWidth} />
      <Circle cx="6" cy="12" r="2" fill="#fff" stroke={color} strokeWidth={strokeWidth} />
      <Circle cx="17" cy="18" r="2" fill="#fff" stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

export function SearchIcon({ size = 16, color = '#46566c', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="10.5" cy="10.5" r="6.5" stroke={color} strokeWidth={strokeWidth} />
      <Path d="M20 20l-4.5-4.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function CloseIcon({ size = 16, color = '#46566c', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 6l12 12M18 6L6 18" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function CompassIcon({ size = 16, color = '#46566c', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth={strokeWidth} />
      <Path
        d="M15.3 8.7l-2.1 4.9-4.9 2.1 2.1-4.9 4.9-2.1Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function PersonIcon({ size = 16, color = '#46566c', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="8" r="3.6" stroke={color} strokeWidth={strokeWidth} />
      <Path
        d="M4.5 20c1.4-3.6 4.4-5.5 7.5-5.5s6.1 1.9 7.5 5.5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function PeopleIcon({ size = 16, color = '#46566c', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="9" cy="8" r="3.2" stroke={color} strokeWidth={strokeWidth} />
      <Path
        d="M2.5 19c1.1-3.1 3.6-4.7 6.5-4.7s5.4 1.6 6.5 4.7"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <Circle cx="17" cy="8.5" r="2.4" stroke={color} strokeWidth={strokeWidth} />
      <Path
        d="M15.5 14.4c2.3.2 4 1.7 4.9 4.6"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </Svg>
  );
}
