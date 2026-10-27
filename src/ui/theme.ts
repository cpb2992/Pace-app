import { createContext, useContext } from 'react';
import { Platform, useColorScheme, type TextStyle } from 'react-native';
import type { Appearance } from '../engine/types';

/**
 * Pace's look: black iron and chalk, with color borrowed from competition plates.
 * Chrome stays black and chalk-white; color only ever means something:
 *   green 10 kg = recovered / good effort, yellow 15 kg = moderate / points,
 *   red 25 kg = low recovery / legendary, blue 20 kg = crits / epic, white 5 kg = common.
 */
const dark = {
  bg: '#000000', surface: '#111113', raised: '#1B1B1E', fill: '#1B1B1E', line: '#26262B', lineStrong: '#36363C',
  ink: '#F4F4F2', ink2: '#A2A2A8', ink3: '#6C6C73',
  // Chalk is the action color: primary buttons are chalk with black text.
  accent: '#F4F4F2', accentInk: '#000000', accentSoft: '#1B1B1E',
  go: '#34C26B', goSoft: '#0E2617', hold: '#F2B705', holdSoft: '#2B2208', stop: '#F0484A', stopSoft: '#2E1011',
  plateBlue: '#3D7BFF', plateBlueSoft: '#0F1C3A',
  tileA: '#1B1B1E', tileB: '#0A0A0B', easy: '#36363C', steady: '#7A7A82',
  xp: '#F2B705', xpSoft: '#2B2208', crit: '#3D7BFF', critSoft: '#0F1C3A', rare: '#34C26B', epic: '#3D7BFF', legendary: '#F0484A',
  scheme: 'dark' as 'light' | 'dark',
};
const light: typeof dark = {
  bg: '#EDEEF0', surface: '#FFFFFF', raised: '#F4F4F6', fill: '#EDEEF0', line: '#DDDEE2', lineStrong: '#C9CACF',
  ink: '#0B0B0C', ink2: '#56575D', ink3: '#8C8D93',
  accent: '#0B0B0C', accentInk: '#FFFFFF', accentSoft: '#EDEEF0',
  go: '#178A47', goSoft: '#E1F3E8', hold: '#A87700', holdSoft: '#FBF0D2', stop: '#D12F31', stopSoft: '#FBE4E4',
  plateBlue: '#1F5AE6', plateBlueSoft: '#E4ECFD',
  tileA: '#26262B', tileB: '#111113', easy: '#D3D4D8', steady: '#8C8D93',
  xp: '#A87700', xpSoft: '#FBF0D2', crit: '#1F5AE6', critSoft: '#E4ECFD', rare: '#178A47', epic: '#1F5AE6', legendary: '#D12F31',
  scheme: 'light',
};
export type Theme = typeof dark;

/** The user's Light / Dark / Auto choice; Auto follows the phone. */
export const AppearanceContext = createContext<Appearance>('system');

export function useTheme(): Theme {
  const pref = useContext(AppearanceContext);
  const system = useColorScheme();
  const scheme = pref === 'system' ? system : pref;
  return scheme === 'light' ? light : dark;
}

export const zoneColor = (t: Theme, z: string | null | undefined) =>
  z === 'green' ? { fg: t.go, bg: t.goSoft } : z === 'yellow' ? { fg: t.hold, bg: t.holdSoft } : z === 'red' ? { fg: t.stop, bg: t.stopSoft } : { fg: t.ink2, bg: t.raised };

/**
 * Type: Big Shoulders Display (condensed, stamped-plate numerals) for titles and numbers;
 * Archivo for everything you read. Custom fonts carry their weight in the family name,
 * so never pair these with fontWeight.
 */
export const F = {
  body: 'Archivo-Regular',
  med: 'Archivo-Medium',
  semi: 'Archivo-SemiBold',
  bold: 'Archivo-Bold',
  num: 'Shoulders-ExtraBold',
  numBold: 'Shoulders-Bold',
} as const;

export const FONT_FILES = {
  [F.body]: require('@expo-google-fonts/archivo/400Regular/Archivo_400Regular.ttf'),
  [F.med]: require('@expo-google-fonts/archivo/500Medium/Archivo_500Medium.ttf'),
  [F.semi]: require('@expo-google-fonts/archivo/600SemiBold/Archivo_600SemiBold.ttf'),
  [F.bold]: require('@expo-google-fonts/archivo/700Bold/Archivo_700Bold.ttf'),
  [F.num]: require('@expo-google-fonts/big-shoulders-display/BigShouldersDisplay_800ExtraBold.ttf'),
  [F.numBold]: require('@expo-google-fonts/big-shoulders-display/BigShouldersDisplay_700Bold.ttf'),
};

/** Maps a weight to the matching Archivo face. */
export const w = (weight: '400' | '500' | '600' | '700'): TextStyle => ({ fontFamily: weight === '700' ? F.bold : weight === '600' ? F.semi : weight === '500' ? F.med : F.body });
/** Big Shoulders numerals, tabular so counting digits don't jitter. */
export const numStyle = (size: number, color: string, bold = true): TextStyle => ({ fontFamily: bold ? F.num : F.numBold, fontSize: size, lineHeight: Math.round(size * 1.02), color, fontVariant: ['tabular-nums'], letterSpacing: 0 });

export const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, Menlo, monospace' });
/** Radius by hierarchy: big panels round more than rows; actions are pills. */
export const radius = { panel: 24, card: 18, tile: 14, control: 12, pill: 999 };
