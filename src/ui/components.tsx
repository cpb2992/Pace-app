import * as Haptics from 'expo-haptics';
import { Children, useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, useWindowDimensions, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { F, numStyle, radius, useTheme, zoneColor } from './theme';

export const tap = () => { if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {}); };
export const success = () => { if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); };

type TxtVariant = 'display' | 'title' | 'h2' | 'h3' | 'body' | 'sub' | 'fine' | 'label' | 'big';
export function Txt({ v = 'body', color, style, children, numberOfLines }: { v?: TxtVariant; color?: string; style?: StyleProp<TextStyle>; children: ReactNode; numberOfLines?: number }) {
  const t = useTheme();
  const base: Record<TxtVariant, TextStyle> = {
    display: { fontFamily: F.num, fontSize: 44, lineHeight: 46, color: t.ink },
    title: { fontFamily: F.num, fontSize: 40, lineHeight: 42, color: t.ink },
    h2: { fontFamily: F.semi, fontSize: 18, lineHeight: 23, letterSpacing: -0.2, color: t.ink },
    h3: { fontFamily: F.semi, fontSize: 15.5, lineHeight: 20, color: t.ink },
    body: { fontFamily: F.body, fontSize: 15, lineHeight: 21, color: t.ink },
    sub: { fontFamily: F.body, fontSize: 14, lineHeight: 19, color: t.ink2 },
    fine: { fontFamily: F.body, fontSize: 13, lineHeight: 18, color: t.ink2 },
    label: { fontFamily: F.med, fontSize: 12.5, lineHeight: 16, color: t.ink3 },
    big: numStyle(34, t.ink),
  };
  return <Text numberOfLines={numberOfLines} style={[base[v], color ? { color } : null, style]}>{children}</Text>;
}

/** A big stamped number with a small unit beside it: "200 lb", "81%". */
export function Num({ value, unit, size = 40, color, unitColor }: { value: string; unit?: string; size?: number; color?: string; unitColor?: string }) {
  const t = useTheme();
  return (
    <Text style={numStyle(size, color ?? t.ink)}>
      {value}
      {unit ? <Text style={{ fontFamily: F.semi, fontSize: Math.max(12, size * 0.36), color: unitColor ?? t.ink2 }}>{` ${unit}`}</Text> : null}
    </Text>
  );
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
    <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-start' }}>
      <View style={{ flex: 1, gap: 14, minWidth: 0 }}>{left}</View>
      <View style={{ flex: 1, gap: 14, minWidth: 0 }}>{right}</View>
    </View>
  );
}

/** Cards side by side, two per row, on wide screens; a normal stack on phones. */
export function Grid({ children }: { children: ReactNode }) {
  const wide = useWide();
  if (!wide) return <>{children}</>;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start' }}>
      {Children.toArray(children).map((c, i) => <View key={i} style={{ flexBasis: '48%', flexGrow: 1, minWidth: 0 }}>{c}</View>)}
    </View>
  );
}

/** Scrolling page with a stamped title. `footer` stays pinned above the tab bar. */
export function Screen({ title, eyebrow, sub, right, footer, children }: { title: string; eyebrow?: ReactNode; sub?: string; right?: ReactNode; footer?: ReactNode; children: ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const wide = useWide();
  const maxWidth = wide ? 1040 : 620;
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: footer ? 110 : 36, paddingLeft: Math.max(18, insets.left), paddingRight: Math.max(18, insets.right) }} keyboardShouldPersistTaps="handled">
        <View style={{ width: '100%', maxWidth, alignSelf: 'center', gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingTop: 6, paddingBottom: 6 }}>
            <View style={{ flex: 1, gap: 4 }}>
              {typeof eyebrow === 'string' ? <Txt v="sub">{eyebrow}</Txt> : eyebrow}
              <Txt v="title">{title}</Txt>
              {sub ? <Txt v="sub">{sub}</Txt> : null}
            </View>
            {right}
          </View>
          {children}
        </View>
      </ScrollView>
      {footer ? (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 12, backgroundColor: t.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line }}>
          <View style={{ width: '100%', maxWidth, alignSelf: 'center' }}>{footer}</View>
        </View>
      ) : null}
    </View>
  );
}

export function Card({ children, style, onPress, accessibilityLabel }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; accessibilityLabel?: string }) {
  const t = useTheme();
  const s: ViewStyle = { backgroundColor: t.surface, borderColor: t.line, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.card, padding: 16, gap: 12 };
  if (onPress) return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={() => { tap(); onPress(); }} style={({ pressed }) => [s, pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] }, style]}>{children}</Pressable>;
  return <View style={[s, style]}>{children}</View>;
}

/** A section heading in the page flow, with optional detail on the right. */
export function Section({ children, right }: { children: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 12, marginBottom: -2, paddingHorizontal: 2 }}>
      <Txt v="h2" style={{ fontSize: 19 }}>{children}</Txt>
      {typeof right === 'string' ? <Txt v="label">{right}</Txt> : right}
    </View>
  );
}

export function Row({ children, style, gap = 12 }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap }, style]}>{children}</View>;
}

type BtnKind = 'primary' | 'secondary' | 'tint' | 'danger' | 'link' | 'dangerLink';
export function Button({ title, onPress, kind = 'secondary', small, wide, disabled, icon }: { title: string; onPress?: () => void; kind?: BtnKind; small?: boolean; wide?: boolean; disabled?: boolean; icon?: ReactNode }) {
  const t = useTheme();
  const isLink = kind === 'link' || kind === 'dangerLink';
  const bg = kind === 'primary' ? t.accent : isLink ? 'transparent' : t.raised;
  const fg = kind === 'primary' ? t.accentInk : kind === 'danger' || kind === 'dangerLink' ? t.stop : kind === 'link' ? t.ink : t.ink;
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={() => { tap(); onPress?.(); }} hitSlop={isLink ? 6 : 0}
      style={({ pressed }) => [{
        flexDirection: 'row', alignItems: 'center', justifyContent: isLink ? 'flex-start' : 'center', gap: 7,
        backgroundColor: bg, borderRadius: radius.pill,
        minHeight: isLink ? 32 : wide ? 54 : small ? 36 : 44, paddingHorizontal: isLink ? 0 : small ? 14 : 20,
        alignSelf: wide ? 'stretch' : 'flex-start', opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
        transform: pressed && !isLink ? [{ scale: 0.98 }] : undefined,
      }]}>
      {icon}
      <Text style={{ color: fg, fontFamily: isLink ? F.semi : F.semi, fontSize: wide ? 16.5 : small ? 13.5 : 15, textDecorationLine: kind === 'link' ? 'underline' : 'none', textDecorationColor: t.lineStrong }}>{title}</Text>
    </Pressable>
  );
}

export function Chip({ text, zone, tone }: { text: string; zone?: string | null; tone?: 'ok' | 'warn' | 'bad' | 'neutral' | 'accent' }) {
  const t = useTheme();
  const z = tone === 'ok' ? 'green' : tone === 'warn' ? 'yellow' : tone === 'bad' ? 'red' : zone;
  const c = tone === 'accent' ? { fg: t.ink, bg: t.raised } : zoneColor(t, z);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: c.bg }}>
      {z ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.fg }} /> : null}
      <Text style={{ color: c.fg, fontSize: 12.5, fontFamily: F.semi }}>{text}</Text>
    </View>
  );
}

/** Today's change for a lift: green to add, chalk for reps, yellow to hold, red to back off. */
export function Tag({ text, kind }: { text: string; kind: 'up' | 'reps' | 'hold' | 'down' | 'new' }) {
  const t = useTheme();
  const c = kind === 'up' ? { fg: t.go, bg: t.goSoft } : kind === 'reps' ? { fg: t.ink, bg: t.raised } : kind === 'hold' ? { fg: t.hold, bg: t.holdSoft } : kind === 'down' ? { fg: t.stop, bg: t.stopSoft } : { fg: t.ink2, bg: t.raised };
  return <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7, backgroundColor: c.bg }}><Text style={{ color: c.fg, fontSize: 12.5, fontFamily: F.semi, fontVariant: ['tabular-nums'] }}>{text}</Text></View>;
}

export function Badge({ letter, large }: { letter: string; large?: boolean }) {
  const t = useTheme();
  const s = large ? 34 : 28;
  return <View style={{ width: s, height: s, borderRadius: large ? 10 : 8, backgroundColor: t.raised, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: t.ink2, fontFamily: F.numBold, fontSize: large ? 18 : 16 }}>{letter}</Text></View>;
}

export function Segmented<T extends string | number>({ options, value, onChange }: { options: { label: string; value: T }[]; value: T; onChange: (v: T) => void }) {
  const t = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }} style={{ backgroundColor: t.raised, borderRadius: radius.pill, padding: 3, flexGrow: 0 }}>
      <View style={{ flexDirection: 'row', flexGrow: 1, gap: 2 }}>
        {options.map(o => {
          const on = o.value === value;
          return (
            <Pressable key={String(o.value)} onPress={() => { tap(); onChange(o.value); }} accessibilityRole="button" accessibilityState={{ selected: on }}
              style={{ flexGrow: 1, alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: on ? t.accent : 'transparent' }}>
              <Text style={{ color: on ? t.accentInk : t.ink2, fontFamily: on ? F.semi : F.med, fontSize: 13.5 }}>{o.label}</Text>
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
    <View style={[{ flex: 1, gap: 6, minWidth: 0 }, style]}>
      <Txt v="label" color={t.ink2}>{label}</Txt>
      <TextInput placeholderTextColor={t.ink3} onFocus={() => setFocus(true)} onBlur={e => { setFocus(false); rest.onBlur?.(e); }} {...rest}
        style={{ fontSize: 16, fontFamily: F.body, color: t.ink, backgroundColor: t.raised, borderColor: focus ? t.ink2 : 'transparent', borderWidth: 1, borderRadius: radius.control, paddingHorizontal: 12, paddingVertical: 11 }} />
    </View>
  );
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.line }} />;
}

export function Confirm({ text, confirm, onConfirm, onCancel }: { text: string; confirm: string; onConfirm: () => void; onCancel: () => void }) {
  const t = useTheme();
  return (
    <View style={{ gap: 10, padding: 14, borderRadius: radius.tile, backgroundColor: t.stopSoft }}>
      <Txt v="body">{text}</Txt>
      <Row gap={8} style={{ justifyContent: 'flex-start' }}><Button kind="danger" small title={confirm} onPress={onConfirm} /><Button small title="Cancel" onPress={onCancel} /></Row>
    </View>
  );
}

/**
 * Recovery, drawn like a bumper plate: a colored rim that fills with the score, a thin collar ring,
 * and the number stamped in the middle.
 */
export function Ring({ value, zone, size = 128, caption = 'Recovery' }: { value: number; zone: string; size?: number; caption?: string }) {
  const t = useTheme();
  const r = 52, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, value)), off = c * (1 - v / 100);
  const col = zoneColor(t, zone).fg;
  return (
    <View style={{ width: size, height: size }} accessibilityLabel={`${caption} ${v} percent`}>
      <Svg width={size} height={size} viewBox="0 0 128 128">
        <Circle cx={64} cy={64} r={60} fill={t.surface} />
        <Circle cx={64} cy={64} r={r} stroke={t.raised} strokeWidth={13} fill="none" />
        <Circle cx={64} cy={64} r={r} stroke={col} strokeWidth={13} fill="none" strokeLinecap="butt" strokeDasharray={`${c} ${c}`} strokeDashoffset={off} transform="rotate(-90 64 64)" />
        <Circle cx={64} cy={64} r={39} stroke={t.line} strokeWidth={1} fill="none" />
      </Svg>
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={numStyle(size * 0.34, t.ink)}>{v}<Text style={{ fontFamily: F.numBold, fontSize: size * 0.17, color: t.ink2 }}>%</Text></Text>
        <Text style={{ fontFamily: F.med, fontSize: Math.max(10, size * 0.085), color: t.ink3, marginTop: 1 }}>{caption}</Text>
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

/** A group of list rows inside one rounded container, separated by hairlines. */
export function List({ children }: { children: ReactNode }) {
  const t = useTheme();
  const items = Children.toArray(children).filter(Boolean);
  return (
    <View style={{ backgroundColor: t.surface, borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, borderColor: t.line, overflow: 'hidden' }}>
      {items.map((c, i) => <View key={i} style={{ borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderTopColor: t.line }}>{c}</View>)}
    </View>
  );
}

/** On/off switch in Pace colors: chalk track when on. */
export function Toggle({ value, onValueChange, disabled, label }: { value: boolean; onValueChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  const t = useTheme();
  return <Switch value={value} onValueChange={v => { tap(); onValueChange(v); }} disabled={disabled} accessibilityLabel={label} trackColor={{ true: t.accent, false: t.lineStrong }} thumbColor={value ? t.accentInk : t.ink2} ios_backgroundColor={t.lineStrong} />;
}
