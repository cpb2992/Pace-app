import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { F, useTheme } from '../../ui/theme';

type IconProps = { color: ColorValue; focused: boolean };
const line = (focused: boolean) => ({ fill: 'none', strokeWidth: focused ? 2.2 : 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const });

const Icon = {
  // Today is the Pace mark itself.
  today: ({ color, focused }: IconProps) => (
    <Svg width={26} height={26} viewBox="0 0 24 24">
      <Path d="M17.6 6.6A8 8 0 1 0 20 12" stroke={color} {...line(focused)} />
      <Circle cx={12} cy={12} r={focused ? 3 : 2.4} fill={color} />
    </Svg>
  ),
  train: ({ color, focused }: IconProps) => (
    <Svg width={26} height={26} viewBox="0 0 24 24">
      <Path d="M2.5 12h19" stroke={color} {...line(focused)} />
      <Rect x={5} y={7.5} width={2.6} height={9} rx={1} fill={focused ? color : 'none'} stroke={color} strokeWidth={focused ? 2.2 : 1.8} />
      <Rect x={16.4} y={7.5} width={2.6} height={9} rx={1} fill={focused ? color : 'none'} stroke={color} strokeWidth={focused ? 2.2 : 1.8} />
      <Path d="M9.5 9v6M14.5 9v6" stroke={color} {...line(focused)} />
    </Svg>
  ),
  coach: ({ color, focused }: IconProps) => (
    <Svg width={26} height={26} viewBox="0 0 24 24">
      <Path d="M5 5h14a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-7L7 21v-3.5H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" stroke={color} {...line(focused)} fill={focused ? color : 'none'} />
    </Svg>
  ),
  trends: ({ color, focused }: IconProps) => (
    <Svg width={26} height={26} viewBox="0 0 24 24">
      <Rect x={4} y={13} width={3.6} height={7} rx={1.2} stroke={color} strokeWidth={focused ? 2.2 : 1.8} fill={focused ? color : 'none'} />
      <Rect x={10.2} y={8.5} width={3.6} height={11.5} rx={1.2} stroke={color} strokeWidth={focused ? 2.2 : 1.8} fill={focused ? color : 'none'} />
      <Rect x={16.4} y={4} width={3.6} height={16} rx={1.2} stroke={color} strokeWidth={focused ? 2.2 : 1.8} fill={focused ? color : 'none'} />
    </Svg>
  ),
  program: ({ color, focused }: IconProps) => (
    <Svg width={26} height={26} viewBox="0 0 24 24">
      <Rect x={4.5} y={3.5} width={15} height={17} rx={3} stroke={color} {...line(focused)} />
      <Path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4" stroke={color} {...line(focused)} />
    </Svg>
  ),
};

export default function TabLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.ink,
        tabBarInactiveTintColor: t.ink3,
        tabBarStyle: { backgroundColor: t.bg, borderTopColor: t.line, borderTopWidth: 0.5 },
        tabBarLabelStyle: { fontSize: 11, fontFamily: F.med, marginTop: 1 },
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
