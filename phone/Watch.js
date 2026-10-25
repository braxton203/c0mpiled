// The in-pocket screen: black, a colored edge for the camera, and buzzes driven by the relay.
import { useEffect, useRef } from 'react';
import { Pressable, Text } from 'react-native';
import { PATTERNS, play } from './patterns';
import { styles } from './styles';

const EDGE = { offline: '#26302e', clear: '#1f4d38', warning: PATTERNS.warning.color, danger: PATTERNS.danger.color, zone: PATTERNS.zone.color };
const LABEL = { offline: 'NOT CONNECTED', clear: 'CLEAR', warning: 'WARNING', danger: 'DANGER', zone: 'RESTRICTED ZONE' };

export default function Watch({ asset, relay, onBack }) {
  const cancel = useRef(() => {});
  const previous = useRef('clear');
  const taps = useRef([]);
  const { level, reason } = relay.signal;
  const signal = relay.status !== 'open' || !relay.dashboardOnline ? 'offline' : level === 'danger' && reason === 'zone' ? 'zone' : level;

  useEffect(() => {
    cancel.current();
    cancel.current = () => {};
    if (signal === 'warning') cancel.current = play(PATTERNS.warning);
    else if (signal === 'danger') cancel.current = play(PATTERNS.danger, { repeat: true });
    else if (signal === 'zone') cancel.current = play(PATTERNS.zone, { repeat: true });
    else if (signal === 'clear' && previous.current !== 'clear' && previous.current !== 'offline') cancel.current = play(PATTERNS.clear);
    previous.current = signal;
  }, [signal]);
  useEffect(() => () => cancel.current(), []);

  // Triple tap anywhere goes back to the role picker.
  const onPress = () => {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 700), now];
    if (taps.current.length >= 3) onBack();
  };

  return (
    <Pressable style={[styles.watch, { borderColor: EDGE[signal] }]} onPress={onPress}>
      <Text style={styles.watchName}>{asset.name}</Text>
      <Text style={[styles.watchLevel, { color: EDGE[signal] }]}>{LABEL[signal]}</Text>
      <Text style={styles.watchHint}>Triple-tap to change role</Text>
    </Pressable>
  );
}
