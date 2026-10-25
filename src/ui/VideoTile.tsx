import { router } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { ytLink } from '../engine/parse';
import type { Video } from '../engine/types';
import { Button, Txt } from './components';
import { radius, useTheme } from './theme';

function ClipPlayer({ uri }: { uri: string }) {
  const player = useVideoPlayer({ uri }, p => { p.loop = false; p.play(); });
  return <VideoView player={player} nativeControls contentFit="contain" fullscreenOptions={{ enable: true }} style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: radius.tile, backgroundColor: '#000' }} />;
}

const PlayGlyph = ({ color, size }: { color: string; size: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M8 5v14l11-7z" fill={color} /></Svg>
);

/** How-to video for an exercise. YouTube opens the YouTube app; your own clips play inline. */
export function VideoTile({ name, video, canEdit }: { name: string; video: Video | null; canEdit: boolean }) {
  const t = useTheme();
  const [playing, setPlaying] = useState(false);
  if (!video) {
    if (!canEdit) return null;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: 12, borderRadius: radius.tile, borderWidth: 1, borderStyle: 'dashed', borderColor: t.line, backgroundColor: t.bg }}>
        <Txt v="sub">No how-to video yet</Txt>
        <Button kind="tint" small title="Add video" onPress={() => router.push({ pathname: '/video', params: { name } })} />
      </View>
    );
  }
  if (video.kind === 'clip' && playing) return <ClipPlayer uri={video.uri} />;
  const label = video.kind === 'yt' ? (video.shorts ? 'YouTube Short' : 'YouTube') : 'Your clip';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={video.kind === 'yt' ? `Watch ${name} on YouTube` : `Play your ${name} clip`}
      onPress={() => (video.kind === 'yt' ? Linking.openURL(ytLink(video)) : setPlaying(true))}
      style={({ pressed }) => ({ width: '100%', aspectRatio: 16 / 9, borderRadius: radius.tile, overflow: 'hidden', backgroundColor: t.tileB, justifyContent: 'flex-end', padding: 14, opacity: pressed ? 0.9 : 1 })}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: t.tileA, opacity: 0.6 }]} />
      <Text style={{ position: 'absolute', top: 12, left: 14, color: 'rgba(255,255,255,0.72)', fontSize: 12, fontWeight: '500' }}>{label}</Text>
      <View style={{ position: 'absolute', top: '50%', left: '50%', marginTop: -27, marginLeft: -27, width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(255,255,255,0.95)', alignItems: 'center', justifyContent: 'center', paddingLeft: 3 }}>
        <PlayGlyph color={t.tileB} size={22} />
      </View>
      <Text numberOfLines={2} style={{ color: '#fff', fontSize: 15, fontWeight: '600', maxWidth: '70%' }}>{name}</Text>
    </Pressable>
  );
}
