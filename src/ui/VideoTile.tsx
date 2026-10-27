import { router } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { ytLink } from '../engine/parse';
import type { Video } from '../engine/types';
import { tap } from './components';
import { F, radius, useTheme } from './theme';

function ClipPlayer({ uri }: { uri: string }) {
  const player = useVideoPlayer({ uri }, p => { p.loop = false; p.play(); });
  return <VideoView player={player} nativeControls contentFit="contain" fullscreenOptions={{ enable: true }} style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: radius.tile, backgroundColor: '#000' }} />;
}

const PlayGlyph = ({ color, size }: { color: string; size: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M8 5v14l11-7z" fill={color} /></Svg>
);
const PlusGlyph = ({ color, size }: { color: string; size: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={2.2} strokeLinecap="round" /></Svg>
);

/**
 * How-to video for an exercise. YouTube opens the YouTube app; your own clips play inline.
 * `compact` is a small pill for the workout screen; the full tile is for the program editor.
 */
export function VideoTile({ name, video, canEdit, compact }: { name: string; video: Video | null; canEdit: boolean; compact?: boolean }) {
  const t = useTheme();
  const [playing, setPlaying] = useState(false);
  const add = () => router.push({ pathname: '/video', params: { name } });
  const play = () => { tap(); if (!video) return; if (video.kind === 'yt') Linking.openURL(ytLink(video)).catch(() => {}); else setPlaying(true); };

  if (video?.kind === 'clip' && playing) return <ClipPlayer uri={video.uri} />;

  if (compact) {
    if (!video && !canEdit) return null;
    const label = video ? (video.kind === 'yt' ? 'Watch how-to' : 'Play your clip') : 'Add how-to';
    return (
      <Pressable onPress={video ? play : () => { tap(); add(); }} accessibilityRole="button" accessibilityLabel={video ? `${label} for ${name}` : `Add a how-to video for ${name}`}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 11, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: t.raised, opacity: pressed ? 0.75 : 1 })}>
        {video ? <PlayGlyph color={t.ink} size={13} /> : <PlusGlyph color={t.ink2} size={13} />}
        <Text style={{ fontFamily: F.semi, fontSize: 13, color: video ? t.ink : t.ink2 }}>{label}</Text>
      </Pressable>
    );
  }

  if (!video) {
    if (!canEdit) return null;
    return (
      <Pressable onPress={() => { tap(); add(); }} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: radius.tile, backgroundColor: t.raised, opacity: pressed ? 0.8 : 1 })}>
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center' }}><PlusGlyph color={t.ink} size={16} /></View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.semi, fontSize: 15, color: t.ink }}>Add a how-to video</Text>
          <Text style={{ fontFamily: F.body, fontSize: 13, color: t.ink2 }}>A YouTube link or your own clip</Text>
        </View>
      </Pressable>
    );
  }
  const label = video.kind === 'yt' ? (video.shorts ? 'YouTube Short' : 'YouTube') : 'Your clip';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={video.kind === 'yt' ? `Watch ${name} on YouTube` : `Play your ${name} clip`}
      onPress={play}
      style={({ pressed }) => ({ width: '100%', aspectRatio: 16 / 9, borderRadius: radius.tile, overflow: 'hidden', backgroundColor: t.tileB, justifyContent: 'flex-end', padding: 14, opacity: pressed ? 0.9 : 1 })}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: t.tileA, opacity: 0.6 }]} />
      <Text style={{ position: 'absolute', top: 12, left: 14, color: 'rgba(255,255,255,0.72)', fontSize: 12, fontFamily: F.med }}>{label}</Text>
      <View style={{ position: 'absolute', top: '50%', left: '50%', marginTop: -27, marginLeft: -27, width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(255,255,255,0.95)', alignItems: 'center', justifyContent: 'center', paddingLeft: 3 }}>
        <PlayGlyph color={t.tileB} size={22} />
      </View>
      <Text numberOfLines={2} style={{ color: '#fff', fontSize: 15, fontFamily: F.semi, maxWidth: '70%' }}>{name}</Text>
    </Pressable>
  );
}
