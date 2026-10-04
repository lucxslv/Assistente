import { StyleSheet, Text, View } from 'react-native';
export function ConnectionBadge({ state }: { state: 'connecting' | 'connected' | 'offline' }) {
  const online = state === 'connected'; return <View style={[styles.badge, { backgroundColor: online ? '#123C33' : '#3B2630' }]}><View style={[styles.dot, { backgroundColor: online ? '#4ADE80' : '#FB7185' }]} /><Text style={styles.text}>{online ? 'Conectado' : state === 'connecting' ? 'Conectando' : 'Offline'}</Text></View>;
}
const styles = StyleSheet.create({ badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 99 }, dot: { width: 7, height: 7, borderRadius: 4 }, text: { color: '#E5E7EB', fontSize: 12, fontWeight: '600' } });
