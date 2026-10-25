// Vibration test bench: feel each candidate pattern before building the real receiver.
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, Vibration, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';

// Each step is [delayMs, action]. On iOS, Vibration.vibrate() is a fixed ~400 ms system buzz.
const buzz = () => Vibration.vibrate();
const heavy = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
const light = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
const error = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

const PATTERNS = [
  { key: 'warning', label: 'Warning', hint: 'one long buzz', color: '#f3b34f', repeatMs: 3000, steps: [[0, buzz]] },
  { key: 'dangerTaps', label: 'Danger A', hint: 'triple heavy tap', color: '#e76d65', repeatMs: 1000, steps: [[0, heavy], [120, heavy], [240, heavy]] },
  { key: 'dangerBuzz', label: 'Danger B', hint: 'triple long buzz', color: '#e76d65', repeatMs: 1500, steps: [[0, buzz], [450, buzz], [900, buzz]] },
  { key: 'zone', label: 'Zone entry', hint: 'error taps + buzz', color: '#c062e0', repeatMs: 2000, steps: [[0, error], [350, buzz]] },
  { key: 'clear', label: 'Clear', hint: 'one light tap', color: '#64d9a0', repeatMs: 3000, steps: [[0, light]] },
];

const POCKET_DELAY_MS = 5000;
const POCKET_LENGTH_MS = 12000;

export default function App() {
  useKeepAwake();
  const timers = useRef([]);
  const [active, setActive] = useState(null);
  const [status, setStatus] = useState('Tap a pattern to feel it once.');

  const stop = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    Vibration.cancel();
    setActive(null);
  };
  useEffect(() => stop, []);

  const later = (ms, fn) => timers.current.push(setTimeout(fn, ms));
  const playOnce = (pattern, offset = 0) => pattern.steps.forEach(([delay, action]) => later(offset + delay, action));

  const pocketTest = (pattern) => {
    stop();
    setActive(pattern.key);
    setStatus(`Pocket it! ${pattern.label} starts in 5 s and repeats for 12 s.`);
    for (let t = 0; t < POCKET_LENGTH_MS; t += pattern.repeatMs) playOnce(pattern, POCKET_DELAY_MS + t);
    later(POCKET_DELAY_MS + POCKET_LENGTH_MS, () => { setActive(null); setStatus('Done. Tap a pattern to feel it once.'); });
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <Text style={styles.title}>Buzz test</Text>
      <Text style={styles.status}>{status}</Text>
      <ScrollView contentContainerStyle={styles.list}>
        {PATTERNS.map((pattern) => (
          <View key={pattern.key} style={[styles.row, active === pattern.key && { borderColor: pattern.color }]}>
            <Pressable style={styles.main} onPress={() => { stop(); playOnce(pattern); }}>
              <Text style={[styles.label, { color: pattern.color }]}>{pattern.label}</Text>
              <Text style={styles.hint}>{pattern.hint} · repeats every {pattern.repeatMs / 1000}s</Text>
            </Pressable>
            <Pressable style={styles.pocket} onPress={() => pocketTest(pattern)}>
              <Text style={styles.pocketText}>Pocket{'\n'}test</Text>
            </Pressable>
          </View>
        ))}
        <Pressable style={styles.stop} onPress={() => { stop(); setStatus('Stopped.'); }}>
          <Text style={styles.stopText}>Stop</Text>
        </Pressable>
        <Text style={styles.note}>Turn off Low Power Mode: iOS mutes haptics while it is on. Try once with the ring switch on silent too.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0d1514', paddingTop: 72, paddingHorizontal: 16 },
  title: { color: '#e8efe9', fontSize: 28, fontWeight: '700' },
  status: { color: '#9fb0a8', marginTop: 6, marginBottom: 16, minHeight: 40 },
  list: { gap: 12, paddingBottom: 48 },
  row: { flexDirection: 'row', borderWidth: 2, borderColor: '#24332f', borderRadius: 14, backgroundColor: '#15201e', overflow: 'hidden' },
  main: { flex: 1, padding: 16 },
  label: { fontSize: 20, fontWeight: '700' },
  hint: { color: '#9fb0a8', marginTop: 4 },
  pocket: { width: 84, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1d2b28' },
  pocketText: { color: '#e8efe9', textAlign: 'center', fontWeight: '600' },
  stop: { padding: 16, borderRadius: 14, backgroundColor: '#2a1a19', alignItems: 'center' },
  stopText: { color: '#efaaa2', fontWeight: '700', fontSize: 16 },
  note: { color: '#6f807a', fontSize: 13, lineHeight: 18 },
});
