import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useTheme } from '../../ui/theme';

type IconProps = { color: ColorValue };
const stroke = { fill: 'none', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const Icon = {
  today: ({ color }: IconProps) => <Svg width={24} height={24} viewBox="0 0 24 24"><Circle cx={12} cy={12} r={8.5} stroke={color} {...stroke} /><Path d="M12 7.5V12l3 2" stroke={color} {...stroke} /></Svg>,
  train: ({ color }: IconProps) => <Svg width={24} height={24} viewBox="0 0 24 24"><Path d="M3 12h18M6 8.5v7M8.8 7v10M15.2 7v10M18 8.5v7" stroke={color} {...stroke} /></Svg>,
  program: ({ color }: IconProps) => <Svg width={24} height={24} viewBox="0 0 24 24"><Rect x={4} y={4} width={16} height={16} rx={3} stroke={color} {...stroke} /><Path d="M8 9h8M8 12.5h8M8 16h5" stroke={color} {...stroke} /></Svg>,
  trends: ({ color }: IconProps) => <Svg width={24} height={24} viewBox="0 0 24 24"><Path d="M4 19V5M4 19h16M8 15l3.5-4 3 2.5L19 8" stroke={color} {...stroke} /></Svg>,
  coach: ({ color }: IconProps) => <Svg width={24} height={24} viewBox="0 0 24 24"><Path d="M5 5.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7.5L7 21v-3.5H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z" stroke={color} {...stroke} /><Path d="M8 11.5h.01M12 11.5h.01M16 11.5h.01" stroke={color} {...stroke} strokeWidth={2.6} /></Svg>,
};

export default function TabLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.ink3,
        tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.line },
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '500' },
        sceneStyle: { backgroundColor: t.bg },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: Icon.today }} />
      <Tabs.Screen name="train" options={{ title: 'Train', tabBarIcon: Icon.train }} />
      <Tabs.Screen name="coach" options={{ title: 'Coach', tabBarIcon: Icon.coach, tabBarHideOnKeyboard: true }} />
      <Tabs.Screen name="trends" options={{ title: 'Trends', tabBarIcon: Icon.trends }} />
      <Tabs.Screen name="program" options={{ title: 'Program', tabBarIcon: Icon.program }} />
    </Tabs>
  );
}
