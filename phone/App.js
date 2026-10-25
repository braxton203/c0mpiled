// Floorwatch phone: pick who you are, then pocket the phone and feel alerts from the dashboard.
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useKeepAwake } from 'expo-keep-awake';
import BuzzTest from './BuzzTest';
import Watch from './Watch';
import { useRelay } from './useRelay';
import { styles } from './styles';

// Set when starting Expo: EXPO_PUBLIC_RELAY_URL=wss://<tunnel>.trycloudflare.com npx expo start --tunnel
const DEFAULT_RELAY_URL = process.env.EXPO_PUBLIC_RELAY_URL || '';

const STATUS_TEXT = { connecting: 'Connecting to relay…', open: 'Connected to relay', closed: 'Relay unreachable, retrying…' };

export default function App() {
  useKeepAwake();
  const [relayUrl, setRelayUrl] = useState(DEFAULT_RELAY_URL);
  const [draftUrl, setDraftUrl] = useState(DEFAULT_RELAY_URL);
  const [screen, setScreen] = useState('pick');
  const [asset, setAsset] = useState(null);
  const relay = useRelay(relayUrl);

  const choose = (item) => {
    setAsset(item);
    relay.watch(item.id);
    setScreen('watch');
  };
  const back = () => {
    relay.watch(null);
    setScreen('pick');
  };

  if (screen === 'test') return <><StatusBar style="light" /><BuzzTest onBack={() => setScreen('pick')} /></>;
  if (screen === 'watch' && asset) return <><StatusBar hidden /><Watch asset={asset} relay={relay} onBack={back} /></>;

  const groups = [
    { kind: 'worker', title: 'WORKERS' },
    { kind: 'equipment', title: 'EQUIPMENT · DRIVER' },
  ];
  const connected = relay.status === 'open';

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <Text style={styles.title}>Who are you?</Text>
      <Text style={styles.status}>
        {relayUrl ? STATUS_TEXT[relay.status] : 'Enter the relay address below.'}
        {connected && !relay.dashboardOnline ? ' · dashboard not open' : ''}
      </Text>
      <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
        {connected && !relay.roster.length && <Text style={styles.note}>No people registered yet. Start the demo or add trackers on the admin dashboard.</Text>}
        {groups.map(({ kind, title }) => {
          const items = relay.roster.filter((item) => item.kind === kind);
          if (!items.length) return null;
          return (
            <View key={kind} style={styles.list}>
              <Text style={styles.groupLabel}>{title}</Text>
              {items.map((item) => (
                <Pressable key={item.id} style={styles.row} onPress={() => choose(item)}>
                  <View style={styles.main}><Text style={styles.label}>{item.name}</Text></View>
                </Pressable>
              ))}
            </View>
          );
        })}
        <Text style={styles.groupLabel}>RELAY ADDRESS</Text>
        <TextInput
          style={styles.input}
          value={draftUrl}
          onChangeText={setDraftUrl}
          onSubmitEditing={() => setRelayUrl(draftUrl.trim())}
          placeholder="wss://….trycloudflare.com"
          placeholderTextColor="#4b5a55"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
        />
        <Pressable style={styles.secondary} onPress={() => setRelayUrl(draftUrl.trim())}>
          <Text style={styles.secondaryText}>Connect</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => setScreen('test')}>
          <Text style={styles.secondaryText}>Buzz test</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
