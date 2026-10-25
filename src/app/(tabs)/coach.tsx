import * as Speech from 'expo-speech';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bountiesToday } from '../../engine/game';
import { applyCoachReply, describeNudge } from '../../engine/prompt';
import type { CoachMsg } from '../../engine/types';
import { uid } from '../../engine/util';
import { claudeReason } from '../../services/claude';
import { askCoach } from '../../services/coach';
import { getClaudeKey } from '../../services/secrets';
import { abortListening, speechAvailable, startListening, stopListening, useSpeechRecognitionEvent } from '../../services/speech';
import { useApp, useDayIdx } from '../../store/AppStore';
import { ClaudeKeyForm } from '../../ui/ClaudeKey';
import { Button, Card, Logo, success, tap, Txt } from '../../ui/components';
import { Icon } from '../../ui/icons';
import { radius, useTheme } from '../../ui/theme';

const STARTERS = [
  ['Today’s game plan', 'Give me today’s game plan, set by set.'],
  ['How am I doing?', 'How am I doing lately? Be honest.'],
  ['Last workout felt easy', 'My last workout felt too easy. Push me harder next time.'],
  ['What’s lagging?', 'Which lift is falling behind, and what should I change?'],
];

function Thinking() {
  const t = useTheme();
  const [a] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(a, { toValue: 3, duration: 1200, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [a]);
  return (
    <View style={{ flexDirection: 'row', gap: 5, paddingVertical: 6 }} accessibilityLabel="Pace is thinking">
      {[0, 1, 2].map(i => (
        <Animated.View key={i} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: t.ink3, opacity: a.interpolate({ inputRange: [i, i + 0.5, i + 1, 3], outputRange: [0.3, 1, 0.3, 0.3], extrapolate: 'clamp' }) }} />
      ))}
    </View>
  );
}

function Bubble({ m }: { m: CoachMsg }) {
  const t = useTheme();
  const me = m.role === 'me';
  return (
    <View style={{ alignSelf: me ? 'flex-end' : 'flex-start', maxWidth: '88%', gap: 6 }}>
      <View style={{ backgroundColor: me ? t.accent : t.surface, borderColor: me ? t.accent : t.line, borderWidth: 1, borderRadius: 18, borderBottomRightRadius: me ? 6 : 18, borderBottomLeftRadius: me ? 18 : 6, paddingHorizontal: 14, paddingVertical: 10 }}>
        <Text selectable style={{ color: me ? t.accentInk : t.ink, fontSize: 15.5, lineHeight: 22 }}>{m.text}</Text>
      </View>
      {m.changes?.length ? (
        <View style={{ gap: 4 }}>
          {m.changes.map(c => (
            <View key={c} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: t.accentSoft }}>
              <Icon name={c.startsWith('Remembered') || c.startsWith('Forgot') ? 'memory' : 'check'} size={13} color={t.accent} width={2} />
              <Text style={{ color: t.accent, fontSize: 12.5, fontWeight: '600' }}>{c}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Memory({ onClose }: { onClose: () => void }) {
  const { data, mutate, demo } = useApp();
  const t = useTheme();
  const { notes, nudges } = data.coach;
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Txt v="h2">What Pace remembers</Txt>
        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close"><Icon name="close" color={t.ink2} /></Pressable>
      </View>
      {notes.length ? notes.map(n => (
        <View key={n.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Txt v="body" style={{ flex: 1 }}>{n.text}</Txt>
          {demo ? null : <Button small kind="dangerLink" title="Forget" onPress={() => mutate(d => { d.coach.notes = d.coach.notes.filter(x => x.id !== n.id); })} />}
        </View>
      )) : <Txt v="fine">Nothing yet. Tell the coach about injuries, your gym’s equipment, or how you like to be coached, and it will keep it in mind.</Txt>}
      {nudges.length ? (
        <>
          <Txt v="label" style={{ marginTop: 4 }}>Changes for next time</Txt>
          {nudges.map(n => (
            <View key={n.ex} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1 }}><Txt v="body">{describeNudge(n)}</Txt><Txt v="fine">{n.reason}</Txt></View>
              {demo ? null : <Button small kind="dangerLink" title="Undo" onPress={() => mutate(d => { d.coach.nudges = d.coach.nudges.filter(x => x.ex !== n.ex); })} />}
            </View>
          ))}
        </>
      ) : null}
    </Card>
  );
}

export default function CoachScreen() {
  const { ctx, data, game, mutate, demo, today } = useApp();
  const di = useDayIdx();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ prefill?: string; at?: string }>();
  const [key, setKey] = useState<string | null | undefined>(undefined);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ msg: string; retry: string } | null>(null);
  const [showMemory, setShowMemory] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const usedPrefill = useRef<string | null>(null);
  const canSpeak = useMemo(() => Platform.OS !== 'web' && speechAvailable(), []);
  const msgs = data.coach.msgs;

  useFocusEffect(useCallback(() => { getClaudeKey().then(setKey).catch(() => setKey(null)); return () => { abortListening(); Speech.stop().catch(() => {}); }; }, []));

  useEffect(() => {
    const p = params.prefill;
    if (!p || usedPrefill.current === `${p}|${params.at}`) return;
    usedPrefill.current = `${p}|${params.at}`;
    const id = setTimeout(() => { setText(p); input.current?.focus(); }, 50);
    return () => clearTimeout(id);
  }, [params.prefill, params.at]);

  useSpeechRecognitionEvent('start', () => setListening(true));
  useSpeechRecognitionEvent('end', () => { setListening(false); setInterim(''); });
  useSpeechRecognitionEvent('result', e => {
    const said = e.results[0]?.transcript ?? '';
    if (e.isFinal) { setText(s => (s ? `${s} ${said}` : said).trim()); setInterim(''); } else setInterim(said);
  });
  useSpeechRecognitionEvent('error', () => setListening(false));

  const listen = async () => {
    tap();
    if (listening) { stopListening(); return; }
    Speech.stop().catch(() => {});
    const ok = await startListening().catch(() => false);
    if (!ok) setErr({ msg: 'Pace needs the microphone to listen. Allow it in your phone’s settings, or type instead.', retry: '' });
  };

  const send = async (raw: string) => {
    const message = raw.trim();
    if (!message || busy || !key || demo) return;
    abortListening(); setListening(false); setInterim('');
    setErr(null); setText(''); setBusy(true);
    const history = data.coach.msgs;
    const mine: CoachMsg = { id: uid(), role: 'me', text: message, at: new Date().toISOString() };
    mutate(d => { d.coach.msgs.push(mine); });
    try {
      const day = ctx.days()[di];
      const zone = ctx.readiness(today).zone;
      const reply = await askCoach({ key, ctx, dayIdx: di, game, bounties: day ? bountiesToday(data, today, day.name, zone) : [], history, message });
      mutate(d => {
        const changes = applyCoachReply(d, reply, today, uid);
        d.coach.msgs.push({ id: uid(), role: 'coach', text: reply.reply, at: new Date().toISOString(), ...(changes.length ? { changes } : {}) });
        if (d.coach.msgs.length > 200) d.coach.msgs = d.coach.msgs.slice(-200);
      });
      if (reply.nudges.length || reply.remember.length) success();
      if (data.settings.speak && Platform.OS !== 'web') Speech.speak(reply.reply, { language: 'en-US', rate: 1.02 });
    } catch (e) {
      mutate(d => { d.coach.msgs = d.coach.msgs.filter(m => m.id !== mine.id); });
      setErr({ msg: claudeReason(e), retry: message });
    } finally {
      setBusy(false);
    }
  };

  const shown = `${text}${interim ? `${text ? ' ' : ''}${interim}` : ''}`;
  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: insets.top + 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: t.line, backgroundColor: t.bg }}>
      <Logo size={22} color={t.accent} />
      <View style={{ flex: 1 }}>
        <Txt v="h2">Coach</Txt>
        <Txt v="label">{key ? `Knows your WHOOP, sets and ${data.settings.coach}’s program` : 'Talk to Pace about your training'}</Txt>
      </View>
      {key ? (
        <>
          <Pressable onPress={() => { tap(); if (data.settings.speak) Speech.stop().catch(() => {}); mutate(d => { d.settings.speak = !d.settings.speak; }); }} hitSlop={8} accessibilityRole="switch" accessibilityState={{ checked: data.settings.speak }} accessibilityLabel="Read replies out loud"
            style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: data.settings.speak ? t.accentSoft : t.fill }}>
            <Icon name={data.settings.speak ? 'speaker' : 'speakerOff'} size={20} color={data.settings.speak ? t.accent : t.ink2} />
          </Pressable>
          <Pressable onPress={() => { tap(); setShowMemory(s => !s); }} hitSlop={8} accessibilityRole="button" accessibilityLabel="What Pace remembers"
            style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: showMemory ? t.accentSoft : t.fill }}>
            <Icon name="memory" size={20} color={showMemory ? t.accent : t.ink2} />
          </Pressable>
        </>
      ) : null}
    </View>
  );

  if (key === undefined) return <View style={{ flex: 1, backgroundColor: t.bg }}>{header}</View>;
  if (!key) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        {header}
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
          <Card>
            <Txt v="h2">Turn on your coach</Txt>
            <Txt v="sub">Ask anything, give feedback after a set, or tell it what hurts. It reads your WHOOP recovery, every set you’ve logged and {data.settings.coach}’s program, remembers what matters, and moves your next targets when you say a lift felt off.</Txt>
            <ClaudeKeyForm onChange={setKey} />
          </Card>
        </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: t.bg }}>
      {header}
      <ScrollView ref={scroll} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })} keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1, justifyContent: msgs.length ? 'flex-start' : 'flex-end' }}>
        {showMemory ? <Memory onClose={() => setShowMemory(false)} /> : null}
        {msgs.length ? null : (
          <View style={{ gap: 6, paddingBottom: 8 }}>
            <Txt v="h2">What’s on your mind?</Txt>
            <Txt v="sub">Ask for today’s plan, tell Pace how a lift felt, or say what hurts. Feedback changes your next targets.</Txt>
          </View>
        )}
        {msgs.map(m => <Bubble key={m.id} m={m} />)}
        {busy ? <View style={{ alignSelf: 'flex-start', backgroundColor: t.surface, borderColor: t.line, borderWidth: 1, borderRadius: 18, borderBottomLeftRadius: 6, paddingHorizontal: 14, paddingVertical: 6 }}><Thinking /></View> : null}
        {err ? (
          <View style={{ gap: 8, padding: 12, borderRadius: radius.tile, backgroundColor: t.stopSoft }}>
            <Txt v="body" color={t.stop}>{err.msg}</Txt>
            {err.retry ? <Button small title="Try again" onPress={() => send(err.retry)} /> : null}
          </View>
        ) : null}
        {demo ? <Txt v="fine">The coach is off while you’re viewing demo data.</Txt> : null}
      </ScrollView>
      {!busy && (!msgs.length || msgs[msgs.length - 1]?.role === 'coach') ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 8 }} style={{ flexGrow: 0 }}>
          {STARTERS.map(([label, q]) => <Button key={label} small kind="tint" title={label} onPress={() => send(q)} disabled={demo} />)}
        </ScrollView>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10, borderTopWidth: 1, borderTopColor: t.line, backgroundColor: t.surface }}>
        {canSpeak ? (
          <Pressable onPress={listen} accessibilityRole="button" accessibilityLabel={listening ? 'Stop listening' : 'Talk to the coach'}
            style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: listening ? t.stop : t.fill }}>
            <Icon name={listening ? 'stop' : 'mic'} size={21} color={listening ? '#fff' : t.ink} width={2} />
          </Pressable>
        ) : null}
        <TextInput ref={input} value={shown} onChangeText={v => { setText(v); setInterim(''); }} placeholder={listening ? 'Listening…' : 'Message your coach'} placeholderTextColor={t.ink3} multiline
          accessibilityLabel="Message your coach" editable={!demo}
          style={{ flex: 1, minHeight: 44, maxHeight: 130, fontSize: 16, color: t.ink, backgroundColor: t.bg, borderColor: t.line, borderWidth: 1, borderRadius: 22, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 11 }} />
        <Pressable onPress={() => { tap(); send(shown); }} disabled={!shown.trim() || busy || demo} accessibilityRole="button" accessibilityLabel="Send"
          style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: shown.trim() && !busy ? t.accent : t.fill }}>
          <Icon name="up" size={21} color={shown.trim() && !busy ? t.accentInk : t.ink3} width={2.2} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
