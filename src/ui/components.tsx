import * as Haptics from 'expo-haptics';
import { Children, useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { radius, useTheme, zoneColor } from './theme';

export const tap = () => { if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {}); };
export const success = () => { if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); };

type TxtVariant = 'title' | 'h2' | 'h3' | 'body' | 'sub' | 'fine' | 'label' | 'big';
export function Txt({ v = 'body', color, style, children, numberOfLines }: { v?: TxtVariant; color?: string; style?: StyleProp<TextStyle>; children: ReactNode; numberOfLines?: number }) {
  const t = useTheme();
  const base: Record<TxtVariant, TextStyle> = {
    title: { fontSize: 32, lineHeight: 36, fontWeight: '700', letterSpacing: -0.6, color: t.ink },
    h2: { fontSize: 18, lineHeight: 23, fontWeight: '600', letterSpacing: -0.2, color: t.ink },
    h3: { fontSize: 15.5, lineHeight: 20, fontWeight: '600', color: t.ink },
    body: { fontSize: 15, lineHeight: 21, color: t.ink },
    sub: { fontSize: 14, lineHeight: 19, color: t.ink2 },
    fine: { fontSize: 13, lineHeight: 18, color: t.ink2 },
    label: { fontSize: 12.5, lineHeight: 16, fontWeight: '500', color: t.ink3 },
    big: { fontSize: 24, lineHeight: 28, fontWeight: '700', letterSpacing: -0.4, color: t.ink, fontVariant: ['tabular-nums'] },
  };
  return <Text numberOfLines={numberOfLines} style={[base[v], color ? { color } : null, style]}>{children}</Text>;
}

/** True on wide screens: an unfolded foldable, a tablet, or a phone in landscape. */
export function useWide() {
  const { width } = useWindowDimensions();
  return width >= 720;
}

/** Two independent columns on wide screens; one stacked column (left, then right) on phones. */
export function TwoCol({ left, right }: { left: ReactNode; right: ReactNode }) {
  const wide = useWide();
  if (!wide) return <>{left}{right}</>;
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
      <View style={{ flex: 1, gap: 12, minWidth: 0 }}>{left}</View>
      <View style={{ flex: 1, gap: 12, minWidth: 0 }}>{right}</View>
    </View>
  );
}

/** Cards side by side, two per row, on wide screens; a normal stack on phones. */
export function Grid({ children }: { children: ReactNode }) {
  const wide = useWide();
  if (!wide) return <>{children}</>;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
      {Children.toArray(children).map((c, i) => <View key={i} style={{ flexBasis: '48%', flexGrow: 1, minWidth: 0 }}>{c}</View>)}
    </View>
  );
}

/** Scrolling page with an iOS-style large title. */
export function Screen({ title, eyebrow, sub, right, children }: { title: string; eyebrow?: ReactNode; sub?: string; right?: ReactNode; children: ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const wide = useWide();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 32, paddingLeft: Math.max(16, insets.left), paddingRight: Math.max(16, insets.right) }} keyboardShouldPersistTaps="handled">
      <View style={{ width: '100%', maxWidth: wide ? 1040 : 620, alignSelf: 'center', gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingTop: 8, paddingBottom: 4 }}>
          <View style={{ flex: 1, gap: 2 }}>
            {typeof eyebrow === 'string' ? <Txt v="sub">{eyebrow}</Txt> : eyebrow}
            <Txt v="title">{title}</Txt>
            {sub ? <Txt v="sub">{sub}</Txt> : null}
          </View>
          {right}
        </View>
        {children}
      </View>
    </ScrollView>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const t = useTheme();
  const s: ViewStyle = { backgroundColor: t.surface, borderColor: t.line, borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: radius.card, padding: 16, gap: 12 };
  if (onPress) return <Pressable onPress={onPress} style={({ pressed }) => [s, pressed && { opacity: 0.85 }, style]}>{children}</Pressable>;
  return <View style={[s, style]}>{children}</View>;
}

export function Section({ children }: { children: string }) {
  return <Txt v="label" style={{ marginTop: 10, marginLeft: 4, marginBottom: -4, fontSize: 13, fontWeight: '600' }}>{children}</Txt>;
}

export function Row({ children, style, gap = 12 }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap }, style]}>{children}</View>;
}

type BtnKind = 'primary' | 'secondary' | 'tint' | 'danger' | 'link' | 'dangerLink';
export function Button({ title, onPress, kind = 'secondary', small, wide, disabled, icon }: { title: string; onPress?: () => void; kind?: BtnKind; small?: boolean; wide?: boolean; disabled?: boolean; icon?: ReactNode }) {
  const t = useTheme();
  const isLink = kind === 'link' || kind === 'dangerLink';
  const bg = kind === 'primary' ? t.accent : kind === 'tint' ? t.accentSoft : isLink ? 'transparent' : t.surface;
  const fg = kind === 'primary' ? t.accentInk : kind === 'tint' || kind === 'link' ? t.accent : kind === 'danger' || kind === 'dangerLink' ? t.stop : t.ink;
  const border = kind === 'secondary' || kind === 'danger' ? t.line : 'transparent';
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={() => { tap(); onPress?.(); }}
      style={({ pressed }) => [{
        flexDirection: 'row', alignItems: 'center', justifyContent: isLink ? 'flex-start' : 'center', gap: 6,
        backgroundColor: bg, borderColor: border, borderWidth: isLink ? 0 : 1, borderRadius: radius.control,
        minHeight: isLink ? 32 : wide ? 50 : small ? 36 : 44, paddingHorizontal: isLink ? 0 : small ? 12 : 16,
        alignSelf: wide ? 'stretch' : 'flex-start', opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
      }]}>
      {icon}
      <Text style={{ color: fg, fontSize: wide ? 16 : small ? 13.5 : 14.5, fontWeight: isLink ? '500' : '600' }}>{title}</Text>
    </Pressable>
  );
}

export function Chip({ text, zone, tone }: { text: string; zone?: string | null; tone?: 'ok' | 'warn' | 'bad' | 'neutral' | 'accent' }) {
  const t = useTheme();
  const z = tone === 'ok' ? 'green' : tone === 'warn' ? 'yellow' : tone === 'bad' ? 'red' : zone;
  const c = tone === 'accent' ? { fg: t.accent, bg: t.accentSoft } : zoneColor(t, z);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: c.bg }}>
      {z ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.fg }} /> : null}
      <Text style={{ color: c.fg, fontSize: 12, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

export function Tag({ text, kind }: { text: string; kind: 'up' | 'reps' | 'hold' | 'down' | 'new' }) {
  const t = useTheme();
  const c = kind === 'up' || kind === 'reps' ? { fg: t.accent, bg: t.accentSoft } : kind === 'hold' ? { fg: t.hold, bg: t.holdSoft } : kind === 'down' ? { fg: t.stop, bg: t.stopSoft } : { fg: t.ink2, bg: t.fill };
  return <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: c.bg }}><Text style={{ color: c.fg, fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{text}</Text></View>;
}

export function Badge({ letter, large }: { letter: string; large?: boolean }) {
  const t = useTheme();
  const s = large ? 34 : 28;
  return <View style={{ width: s, height: s, borderRadius: large ? 9 : 8, backgroundColor: t.fill, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: t.ink2, fontWeight: '600', fontSize: large ? 15 : 13 }}>{letter}</Text></View>;
}

export function Segmented<T extends string | number>({ options, value, onChange }: { options: { label: string; value: T }[]; value: T; onChange: (v: T) => void }) {
  const t = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }} style={{ backgroundColor: t.fill, borderRadius: 10, padding: 3, flexGrow: 0 }}>
      <View style={{ flexDirection: 'row', flexGrow: 1, gap: 2 }}>
        {options.map(o => {
          const on = o.value === value;
          return (
            <Pressable key={String(o.value)} onPress={() => { tap(); onChange(o.value); }} accessibilityRole="button" accessibilityState={{ selected: on }}
              style={{ flexGrow: 1, alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: on ? t.surface : 'transparent', shadowColor: '#000', shadowOpacity: on ? 0.12 : 0, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: on ? 1 : 0 }}>
              <Text style={{ color: on ? t.ink : t.ink2, fontWeight: on ? '600' : '500', fontSize: 13.5 }}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

export function Field({ label, style, ...rest }: TextInputProps & { label: string; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <View style={[{ flex: 1, gap: 5, minWidth: 0 }, style]}>
      <Txt v="label" color={t.ink2}>{label}</Txt>
      <TextInput placeholderTextColor={t.ink3} onFocus={() => setFocus(true)} onBlur={e => { setFocus(false); rest.onBlur?.(e); }} {...rest}
        style={{ fontSize: 16, color: t.ink, backgroundColor: t.bg, borderColor: focus ? t.accent : t.line, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 10 }} />
    </View>
  );
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: t.line }} />;
}

export function Confirm({ text, confirm, onConfirm, onCancel }: { text: string; confirm: string; onConfirm: () => void; onCancel: () => void }) {
  const t = useTheme();
  return (
    <View style={{ gap: 10, padding: 12, borderRadius: 12, backgroundColor: t.stopSoft }}>
      <Txt v="body">{text}</Txt>
      <Row gap={8} style={{ justifyContent: 'flex-start' }}><Button kind="danger" small title={confirm} onPress={onConfirm} /><Button small title="Cancel" onPress={onCancel} /></Row>
    </View>
  );
}

export function Ring({ value, zone, size = 116 }: { value: number; zone: string; size?: number }) {
  const t = useTheme();
  const r = 50, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(100, value)) / 100);
  const col = zoneColor(t, zone).fg;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 116 116">
        <Circle cx={58} cy={58} r={r} stroke={t.fill} strokeWidth={10} fill="none" />
        <Circle cx={58} cy={58} r={r} stroke={col} strokeWidth={10} fill="none" strokeLinecap="round" strokeDasharray={`${c} ${c}`} strokeDashoffset={off} transform="rotate(-90 58 58)" />
      </Svg>
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ fontSize: 30, fontWeight: '700', letterSpacing: -0.8, color: t.ink, fontVariant: ['tabular-nums'] }}>{value}%</Text>
        <Text style={{ fontSize: 10.5, fontWeight: '500', letterSpacing: 0.5, color: t.ink3, marginTop: 1 }}>RECOVERY</Text>
      </View>
    </View>
  );
}

/** The Pace mark: a nearly closed ring with a center dot. */
export function Logo({ size = 16, color }: { size?: number; color: string }) {
  const r = 23, c = 2 * Math.PI * r;
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Circle cx={32} cy={32} r={r} stroke={color} strokeWidth={9} fill="none" strokeLinecap="round" strokeDasharray={`${c * 0.816} ${c}`} transform="rotate(-12 32 32)" />
      <Circle cx={32} cy={32} r={6.5} fill={color} />
    </Svg>
  );
}

/** A text field that keeps its own text while typing and saves on blur or return. */
export function CommitField({ label, value, onCommit, ...rest }: Omit<TextInputProps, 'value' | 'onChangeText'> & { label: string; value: string; onCommit: (text: string) => void }) {
  const [text, setText] = useState(value);
  const [prev, setPrev] = useState(value);
  if (prev !== value) { setPrev(value); setText(value); }
  const commit = () => { if (text !== value) onCommit(text); };
  return <Field label={label} value={text} onChangeText={setText} onBlur={commit} onSubmitEditing={commit} {...rest} />;
}
