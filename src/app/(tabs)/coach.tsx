import * as Speech from 'expo-speech';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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
import { F, radius, useTheme } from '../../ui/theme';

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

/** Your messages sit in bubbles; the coach writes on the page, like a note from a coach. */
function Bubble({ m, lead }: { m: CoachMsg; lead: boolean }) {
  const t = useTheme();
  if (m.role === 'me') {
    return (
      <View style={{ alignSelf: 'flex-end', maxWidth: '84%', backgroundColor: t.raised, borderRadius: 20, borderBottomRightRadius: 6, paddingHorizontal: 15, paddingVertical: 11 }}>
        <Text selectable style={{ color: t.ink, fontFamily: F.body, fontSize: 16, lineHeight: 22 }}>{m.text}</Text>
      </View>
    );
  }
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingRight: 12 }}>
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: lead ? t.raised : 'transparent', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
        {lead ? <Logo size={15} color={t.ink} /> : null}
      </View>
      <View style={{ flex: 1, gap: 10 }}>
        <Text selectable style={{ color: t.ink, fontFamily: F.body, fontSize: 16, lineHeight: 23 }}>{m.text}</Text>
        {m.changes?.length ? (
          <View style={{ gap: 6 }}>
            {m.changes.map(c => {
              const memo = c.startsWith('Remembered') || c.startsWith('Forgot');
              return (
                <View key={c} style={{ flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: memo ? t.raised : t.goSoft }}>
                  <Icon name={memo ? 'memory' : 'check'} size={14} color={memo ? t.ink2 : t.go} width={2} />
                  <Text style={{ color: memo ? t.ink2 : t.go, fontSize: 13, fontFamily: F.semi }}>{c}</Text>
                </View>
              );
            })}
          </View>
        ) : null}
      </View>
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
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 18, paddingTop: insets.top + 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.line, backgroundColor: t.bg }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt v="title">Coach</Txt>
        <Txt v="sub" numberOfLines={1}>{key ? `Reads your WHOOP, your sets and ${data.settings.coach}’s plan` : 'Talk training with Pace'}</Txt>
      </View>
      {key ? (
        <>
          <Pressable onPress={() => { tap(); if (data.settings.speak) Speech.stop().catch(() => {}); mutate(d => { d.settings.speak = !d.settings.speak; }); }} hitSlop={8} accessibilityRole="switch" accessibilityState={{ checked: data.settings.speak }} accessibilityLabel="Read replies out loud"
            style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: data.settings.speak ? t.accent : t.raised }}>
            <Icon name={data.settings.speak ? 'speaker' : 'speakerOff'} size={20} color={data.settings.speak ? t.accentInk : t.ink2} />
          </Pressable>
          <Pressable onPress={() => { tap(); setShowMemory(s => !s); }} hitSlop={8} accessibilityRole="button" accessibilityLabel="What Pace remembers"
            style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: showMemory ? t.accent : t.raised }}>
            <Icon name="memory" size={20} color={showMemory ? t.accentInk : t.ink2} />
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
        <ScrollView contentContainerStyle={{ padding: 18, gap: 14 }} keyboardShouldPersistTaps="handled">
          <Card style={{ borderRadius: radius.panel, padding: 18, gap: 14 }}>
            <Txt v="display" style={{ fontSize: 32, lineHeight: 34 }}>Turn on your coach</Txt>
            <Txt v="sub">{`Ask anything, give feedback after a set, or say what hurts. It reads your recovery, every set you’ve logged and ${data.settings.coach}’s plan, remembers what matters, and moves next time’s targets when a lift felt off.`}</Txt>
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
        contentContainerStyle={{ paddingHorizontal: 18, paddingVertical: 18, gap: 18, flexGrow: 1, justifyContent: msgs.length ? 'flex-start' : 'flex-end' }}>
        {showMemory ? <Memory onClose={() => setShowMemory(false)} /> : null}
        {msgs.length ? null : (
          <View style={{ gap: 8, paddingBottom: 4 }}>
            <Txt v="display" style={{ fontSize: 34, lineHeight: 36 }}>What’s on your mind?</Txt>
            <Txt v="sub">Ask for today’s plan, say how a lift felt, or tell it what hurts. Feedback changes your next targets.</Txt>
          </View>
        )}
        {msgs.map((m, i) => <Bubble key={m.id} m={m} lead={i === 0 || msgs[i - 1].role !== m.role} />)}
        {busy ? <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}><View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: t.raised, alignItems: 'center', justifyContent: 'center' }}><Logo size={15} color={t.ink} /></View><Thinking /></View> : null}
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
          {STARTERS.map(([label, q]) => <Button key={label} small title={label} onPress={() => send(q)} disabled={demo} />)}
        </ScrollView>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 12, backgroundColor: t.bg }}>
        {canSpeak ? (
          <Pressable onPress={listen} accessibilityRole="button" accessibilityLabel={listening ? 'Stop listening' : 'Talk to the coach'}
            style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: listening ? t.stop : t.raised }}>
            <Icon name={listening ? 'stop' : 'mic'} size={21} color={listening ? '#fff' : t.ink} width={2} />
          </Pressable>
        ) : null}
        <TextInput ref={input} value={shown} onChangeText={v => { setText(v); setInterim(''); }} placeholder={listening ? 'Listening…' : 'Message your coach'} placeholderTextColor={t.ink3} multiline
          accessibilityLabel="Message your coach" editable={!demo}
          style={{ flex: 1, minHeight: 46, maxHeight: 130, fontSize: 16, fontFamily: F.body, color: t.ink, backgroundColor: t.raised, borderRadius: 23, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 }} />
        <Pressable onPress={() => { tap(); send(shown); }} disabled={!shown.trim() || busy || demo} accessibilityRole="button" accessibilityLabel="Send"
          style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: shown.trim() && !busy ? t.accent : t.raised }}>
          <Icon name="up" size={21} color={shown.trim() && !busy ? t.accentInk : t.ink3} width={2.2} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
