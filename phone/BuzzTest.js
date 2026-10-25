// Vibration test bench: feel each pattern on its own, optionally from a pocket.
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { PATTERNS, play } from './patterns';
import { styles } from './styles';

const POCKET_DELAY_MS = 5000;
const POCKET_LENGTH_MS = 12000;

export default function BuzzTest({ onBack }) {
  const cancel = useRef(() => {});
  const doneTimer = useRef(null);
  const [active, setActive] = useState(null);
  const [status, setStatus] = useState('Tap a pattern to feel it once.');

  const stop = () => {
    cancel.current();
    clearTimeout(doneTimer.current);
    setActive(null);
  };
  useEffect(() => stop, []);

  const pocketTest = (key) => {
    stop();
    setActive(key);
    setStatus(`Pocket it! ${PATTERNS[key].label} starts in 5 s and repeats for 12 s.`);
    cancel.current = play(PATTERNS[key], { repeat: true, delayMs: POCKET_DELAY_MS, forMs: POCKET_LENGTH_MS });
    doneTimer.current = setTimeout(() => { setActive(null); setStatus('Done. Tap a pattern to feel it once.'); }, POCKET_DELAY_MS + POCKET_LENGTH_MS);
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Buzz test</Text>
      <Text style={styles.status}>{status}</Text>
      <ScrollView contentContainerStyle={styles.list}>
        {Object.entries(PATTERNS).map(([key, pattern]) => (
          <View key={key} style={[styles.row, active === key && { borderColor: pattern.color }]}>
            <Pressable style={styles.main} onPress={() => { stop(); cancel.current = play(pattern); }}>
              <Text style={[styles.label, { color: pattern.color }]}>{pattern.label}</Text>
              <Text style={styles.hint}>{pattern.hint} · repeats every {pattern.repeatMs / 1000}s</Text>
            </Pressable>
            <Pressable style={styles.side} onPress={() => pocketTest(key)}>
              <Text style={styles.sideText}>Pocket{'\n'}test</Text>
            </Pressable>
          </View>
        ))}
        <Pressable style={styles.secondary} onPress={() => { stop(); setStatus('Stopped.'); }}>
          <Text style={styles.secondaryText}>Stop</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => { stop(); onBack(); }}>
          <Text style={styles.secondaryText}>Back</Text>
        </Pressable>
        <Text style={styles.note}>Turn off Low Power Mode: iOS mutes haptics while it is on.</Text>
      </ScrollView>
    </View>
  );
}
