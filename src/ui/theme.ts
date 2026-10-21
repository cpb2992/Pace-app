import { createContext, useContext } from 'react';
import { Platform, useColorScheme } from 'react-native';
import type { Appearance } from '../engine/types';

const light = {
  bg: '#F3F4F6', surface: '#FFFFFF', fill: '#EEF0F3', line: '#E2E5EA',
  ink: '#0E1013', ink2: '#545D6A', ink3: '#8A929D',
  accent: '#2557F5', accentInk: '#FFFFFF', accentSoft: '#E8EEFF',
  go: '#138A55', goSoft: '#E2F4EA', hold: '#B56F00', holdSoft: '#FCF0DA', stop: '#D2372C', stopSoft: '#FDE7E4',
  tileA: '#262A31', tileB: '#121418', easy: '#CFD4DB', steady: '#9DB2F6',
  scheme: 'light' as 'light' | 'dark',
};
const dark: typeof light = {
  bg: '#0B0C0E', surface: '#16181C', fill: '#1F2227', line: '#292D34',
  ink: '#F2F3F5', ink2: '#A3AAB4', ink3: '#6F7782',
  accent: '#4C71FF', accentInk: '#FFFFFF', accentSoft: '#1B2549',
  go: '#36C87D', goSoft: '#11291C', hold: '#F0B43C', holdSoft: '#2E2410', stop: '#FF6458', stopSoft: '#351715',
  tileA: '#262A31', tileB: '#0E1013', easy: '#3A3F47', steady: '#3651B3',
  scheme: 'dark',
};
export type Theme = typeof light;

/** The user's Light / Dark / Auto choice; Auto follows the phone. */
export const AppearanceContext = createContext<Appearance>('system');

export function useTheme(): Theme {
  const pref = useContext(AppearanceContext);
  const system = useColorScheme();
  const scheme = pref === 'system' ? system : pref;
  return scheme === 'dark' ? dark : light;
}

export const zoneColor = (t: Theme, z: string | null | undefined) =>
  z === 'green' ? { fg: t.go, bg: t.goSoft } : z === 'yellow' ? { fg: t.hold, bg: t.holdSoft } : z === 'red' ? { fg: t.stop, bg: t.stopSoft } : { fg: t.ink2, bg: t.fill };

export const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, Menlo, monospace' });
export const radius = { card: 16, control: 11, tile: 12 };
