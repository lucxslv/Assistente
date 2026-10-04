import { StyleSheet, Text, View } from 'react-native';
import { ChatMessage } from '@/src/types/api';
export function MessageBubble({ message }: { message: ChatMessage }) {
  const mine = message.role === 'user'; return <View style={[styles.wrap, mine ? styles.mineWrap : styles.theirWrap]}><View style={[styles.bubble, mine ? styles.mine : styles.theirs]}><Text style={styles.text}>{message.content || '…'}</Text>{message.status === 'streaming' && <Text style={styles.streaming}>Digitando…</Text>}</View></View>;
}
const styles = StyleSheet.create({ wrap: { paddingHorizontal: 16, marginVertical: 5 }, mineWrap: { alignItems: 'flex-end' }, theirWrap: { alignItems: 'flex-start' }, bubble: { maxWidth: '86%', padding: 13, borderRadius: 18 }, mine: { backgroundColor: '#4F46E5', borderBottomRightRadius: 4 }, theirs: { backgroundColor: '#182238', borderBottomLeftRadius: 4 }, text: { color: '#F8FAFC', fontSize: 16, lineHeight: 23 }, streaming: { color: '#A5B4FC', marginTop: 7, fontSize: 12 } });
