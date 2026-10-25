import type { ColorValue } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

const line = { fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const D = {
  coach: 'M5 5.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7.5L7 21v-3.5H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zM8 11.5h.01M12 11.5h.01M16 11.5h.01',
  mic: 'M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0zM19 10v1a7 7 0 0 1-14 0v-1M12 18v3',
  send: 'M4.5 12h11M11 6.5 16.5 12 11 17.5',
  up: 'M12 19V5M6 11l6-6 6 6',
  speaker: 'M4 9.5v5h3.5L12 18.5v-13L7.5 9.5zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11',
  speakerOff: 'M4 9.5v5h3.5L12 18.5v-13L7.5 9.5zM16 9.5l5 5M21 9.5l-5 5',
  gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8',
  flame: 'M12 21c3.9 0 6.5-2.7 6.5-6.3 0-3.1-2-5.4-3.5-7.2-.4 1.6-1.3 2.7-2.4 3.1.3-2.9-.8-5.6-3.4-7.6.1 3-1.4 4.8-2.9 6.6C5 11.2 5.5 12.8 5.5 14.7 5.5 18.3 8.1 21 12 21z',
  bolt: 'M13 3 5 13.5h6L10 21l9-11h-6.2z',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4',
  dice: 'M5 5h14v14H5zM9 9h.01M15 9h.01M12 12h.01M9 15h.01M15 15h.01',
  target: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM12 11.5v1',
  memory: 'M9 4.5a3 3 0 0 0-3 3 3 3 0 0 0-1.5 5.3A3 3 0 0 0 8 17.5V19.5M15 4.5a3 3 0 0 1 3 3 3 3 0 0 1 1.5 5.3 3 3 0 0 1-3.5 4.7v2M9 4.5a3 3 0 0 1 3 1.2 3 3 0 0 1 3-1.2M12 5.7v13.8',
  close: 'M6 6l12 12M18 6 6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  sync: 'M19.5 12a7.5 7.5 0 0 1-13.3 4.8M4.5 12a7.5 7.5 0 0 1 13.3-4.8M18 3.5v3.8h-3.8M6 20.5v-3.8h3.8',
  chevron: 'M9.5 6l6 6-6 6',
  stop: 'M7 7h10v10H7z',
} as const;

export type IconName = keyof typeof D;

export function Icon({ name, size = 22, color, width = 1.8, fill }: { name: IconName; size?: number; color: ColorValue; width?: number; fill?: ColorValue }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={D[name]} stroke={color} strokeWidth={width} {...line} fill={fill ?? 'none'} />
    </Svg>
  );
}

/** A closed or burst-open loot crate. */
export function CrateArt({ size = 120, color, lid, open }: { size?: number; color: string; lid: string; open?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      {open ? (
        <>
          {[0, 1, 2, 3, 4, 5, 6, 7].map(i => {
            const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
            return <Path key={i} d={`M${60 + Math.cos(a) * 30} ${54 + Math.sin(a) * 30}L${60 + Math.cos(a) * 54} ${54 + Math.sin(a) * 54}`} stroke={color} strokeWidth={4} strokeLinecap="round" opacity={0.85} />;
          })}
          <Circle cx={60} cy={54} r={22} fill={color} opacity={0.18} />
        </>
      ) : null}
      <Rect x={22} y={56} width={76} height={46} rx={7} fill={color} />
      <Rect x={22} y={56} width={76} height={46} rx={7} fill="#000" opacity={0.12} />
      <Rect x={54} y={56} width={12} height={46} fill={lid} opacity={0.9} />
      {open ? (
        <Rect x={18} y={28} width={84} height={18} rx={6} fill={color} transform="rotate(-18 30 46)" />
      ) : (
        <>
          <Rect x={18} y={42} width={84} height={18} rx={6} fill={color} />
          <Rect x={54} y={42} width={12} height={18} fill={lid} />
          <Rect x={52} y={62} width={16} height={12} rx={3} fill={lid} />
        </>
      )}
    </Svg>
  );
}

/** Rank badge: a shield with the level number inside. */
export function ShieldArt({ size = 48, color, fill }: { size?: number; color: string; fill: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path d="M24 3.5 40 9v13.2c0 10-6.8 17.6-16 22.3C14.8 39.8 8 32.2 8 22.2V9z" fill={fill} stroke={color} strokeWidth={2.4} strokeLinejoin="round" />
      <Path d="M24 8.5 35.5 12.6v9.7c0 7.4-4.8 13.2-11.5 16.9-6.7-3.7-11.5-9.5-11.5-16.9v-9.7z" fill="none" stroke={color} strokeWidth={1} strokeDasharray="2 2" opacity={0.6} />
    </Svg>
  );
}
