import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0d1514', paddingTop: 72, paddingHorizontal: 16 },
  title: { color: '#e8efe9', fontSize: 28, fontWeight: '700' },
  status: { color: '#9fb0a8', marginTop: 6, marginBottom: 16, minHeight: 40 },
  list: { gap: 12, paddingBottom: 48 },
  groupLabel: { color: '#6f807a', fontSize: 12, fontWeight: '700', letterSpacing: 1, marginTop: 8 },
  row: { flexDirection: 'row', borderWidth: 2, borderColor: '#24332f', borderRadius: 14, backgroundColor: '#15201e', overflow: 'hidden' },
  main: { flex: 1, padding: 16 },
  label: { fontSize: 20, fontWeight: '700', color: '#e8efe9' },
  hint: { color: '#9fb0a8', marginTop: 4 },
  side: { width: 84, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1d2b28' },
  sideText: { color: '#e8efe9', textAlign: 'center', fontWeight: '600' },
  input: { color: '#e8efe9', backgroundColor: '#15201e', borderWidth: 2, borderColor: '#24332f', borderRadius: 14, padding: 14, fontSize: 15 },
  secondary: { padding: 16, borderRadius: 14, backgroundColor: '#1d2b28', alignItems: 'center' },
  secondaryText: { color: '#e8efe9', fontWeight: '700', fontSize: 16 },
  note: { color: '#6f807a', fontSize: 13, lineHeight: 18 },
  watch: { flex: 1, backgroundColor: '#000', borderWidth: 6, alignItems: 'center', justifyContent: 'center', padding: 24 },
  watchName: { color: '#3a4744', fontSize: 18, fontWeight: '600' },
  watchLevel: { fontSize: 14, fontWeight: '700', letterSpacing: 2, marginTop: 8 },
  watchHint: { color: '#26302e', fontSize: 12, position: 'absolute', bottom: 40 },
});
