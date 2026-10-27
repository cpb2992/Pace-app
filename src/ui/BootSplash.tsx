import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Logo } from './components';
import { F } from './theme';

const MIN_SHOW_MS = 900;

/**
 * The boot screen: Pace mark, wordmark and a thin progress bar on black, like a phone starting up.
 * It sits on top of the app right after the native splash (same black background, same mark), so the
 * handoff is seamless, then fades out once data has loaded and the bar fills.
 */
export function BootSplash({ ready }: { ready: boolean }) {
  const [progress] = useState(() => new Animated.Value(0.1));
  const [fade] = useState(() => new Animated.Value(1));
  const [gone, setGone] = useState(false);

  useEffect(() => {
    Animated.timing(progress, { toValue: 0.6, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
  }, [progress]);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      Animated.sequence([
        Animated.timing(progress, { toValue: 1, duration: 280, easing: Easing.out(Easing.quad), useNativeDriver: false }),
        Animated.timing(fade, { toValue: 0, duration: 320, delay: 120, useNativeDriver: true }),
      ]).start(() => setGone(true));
    }, MIN_SHOW_MS);
    return () => clearTimeout(timer);
  }, [ready, progress, fade]);

  if (gone) return null;
  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.wrap, { opacity: fade }]} accessibilityLabel="Pace is loading">
      <View style={styles.center}>
        <Logo size={76} color="#F4F4F2" />
        <Text style={styles.word}>Pace</Text>
        <View style={styles.track}><Animated.View style={[styles.fill, { width }]} /></View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  center: { alignItems: 'center', gap: 14 },
  word: { color: '#F4F4F2', fontSize: 34, fontFamily: F.num, letterSpacing: 0.5 },
  track: { marginTop: 26, width: 112, height: 3, borderRadius: 2, backgroundColor: 'rgba(244,244,242,0.18)', overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: '#F4F4F2', borderRadius: 2 },
});
