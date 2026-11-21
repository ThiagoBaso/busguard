import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { AppState, BackHandler, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon, Brand } from '@/components/Brand';
import { useAppTheme } from '@/constants/theme';
import { useSession } from '@/services/session';
import { ApiError } from '@/services/apiClient';
import { chatContacts, chatConversations, chatMessages, getPendingChatMessage, markChatRead, openChat, sendChatMessage, setPendingChatMessage, type ChatContact, type ChatConversation, type ChatMessage } from '@/services/chat';

export default function MessagesScreen() {
  const params = useLocalSearchParams<{ driverUserId?: string }>();
  const id = Number(params.driverUserId);
  const driverUserId = Number.isSafeInteger(id) && id > 0 ? id : undefined;
  return <ChatView key={driverUserId ?? 'conversations'} driverUserId={driverUserId} />;
}

function ChatView({ driverUserId }: { driverUserId?: number }) {
  const router = useRouter();
  const { user } = useSession();
  const userId = user?.id;
  const theme = useAppTheme();
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selected, setSelected] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<{ id: string; text: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showContacts, setShowContacts] = useState(false);
  const [search, setSearch] = useState('');
  const [openError, setOpenError] = useState('');
  const [openAttempt, setOpenAttempt] = useState(0);
  const sendLock = useRef(false);
  const historyInitialized = useRef(false);
  const history = useRef<ComponentRef<typeof ScrollView>>(null);
  const scrollToLatest = useRef(true);
  const selectedId = selected?.id;
  const selectedContact = contacts.find(contact => contact.id === selected?.contact.id);
  const term = search.trim().toLocaleLowerCase('pt-BR');
  const visibleConversations = conversations.filter(item => item.contact.name.toLocaleLowerCase('pt-BR').includes(term));
  const visibleContacts = contacts.filter(item => item.name.toLocaleLowerCase('pt-BR').includes(term));

  const backToConversations = useCallback(() => {
    if (sending) return;
    if (driverUserId) {
      router.setParams({ driverUserId: '' });
      return;
    }
    setSelected(null); setMessages([]); setDraft(''); setPending(null); setError('');
  }, [sending, driverUserId, router]);

  useFocusEffect(useCallback(() => {
    if (!selectedId && !driverUserId) return;
    const listener = BackHandler.addEventListener('hardwareBackPress', () => { backToConversations(); return true; });
    return () => listener.remove();
  }, [selectedId, driverUserId, backToConversations]));

  useFocusEffect(useCallback(() => {
    let active = true;
    let running = false;
    const controller = new AbortController();
    async function refresh() {
      if (running || AppState.currentState !== 'active') return;
      running = true;
      try {
        const [list, people, latest] = await Promise.all([
          chatConversations(controller.signal), chatContacts(controller.signal),
          selectedId ? chatMessages(selectedId, undefined, controller.signal) : Promise.resolve(null),
        ]);
        if (!active) return;
        setConversations(list); setContacts(people); setLoading(false); setError('');
        if (latest && selectedId) {
          setMessages(previous => {
            const all = new Map(previous.map(message => [message.id, message]));
            latest.forEach(message => all.set(message.id, message));
            return [...all.values()].sort((a, b) => a.id - b.id);
          });
          if (!historyInitialized.current) { setHasOlder(latest.length === 50); historyInitialized.current = true; }
          if (latest.length) void markChatRead(selectedId, latest[latest.length - 1].id).catch(() => {});
        }
      } catch { if (active && !controller.signal.aborted) { setLoading(false); setError('Não foi possível atualizar as mensagens. Verifique sua conexão.'); } }
      finally { running = false; }
    }
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 5000);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => { active = false; clearInterval(timer); listener.remove(); controller.abort(); };
  }, [selectedId]));

  const selectConversation = useCallback(async (item: ChatConversation, signal?: AbortSignal) => {
    if (!userId) return;
    const saved = await getPendingChatMessage(userId, item.id);
    if (signal?.aborted) return;
    setMessages([]); setHasOlder(false); historyInitialized.current = false; scrollToLatest.current = true; setDraft(saved?.text ?? ''); setPending(saved); setSelected(item); setShowContacts(false); setSearch(''); setError(saved ? 'Há um envio sem confirmação. Tente novamente.' : '');
  }, [userId]);

  useEffect(() => {
    if (!driverUserId || !userId) return;
    const controller = new AbortController();
    setOpenError('');
    openChat(driverUserId, controller.signal)
      .then(item => selectConversation(item, controller.signal))
      .catch(cause => {
        if (!controller.signal.aborted) setOpenError(cause instanceof ApiError && cause.status === 403
          ? 'Este motorista já não está disponível para sua conta.'
          : 'Não foi possível abrir a conversa com o motorista. Tente novamente.');
      });
    return () => controller.abort();
  }, [driverUserId, userId, openAttempt, selectConversation]);

  async function choose(contact: ChatContact) {
    try { const item = await openChat(contact.id); await selectConversation(item); }
    catch { setError('Não foi possível iniciar a conversa. Tente novamente.'); }
  }
  async function older() {
    if (!selectedId || !messages.length) return;
    try { const result = await chatMessages(selectedId, messages[0].id); scrollToLatest.current = false; setMessages(previous => [...result, ...previous]); setHasOlder(result.length === 50); }
    catch { setError('Não foi possível carregar mensagens anteriores.'); }
  }
  async function send() {
    if (!user || !selectedId || sendLock.current || (!pending && !draft.trim())) return;
    sendLock.current = true;
    const item = pending ?? { id: randomUUID(), text: draft.trim() };
    setPending(item); setSending(true); setError('');
    try {
      await setPendingChatMessage(user.id, selectedId, item);
      const result = await sendChatMessage(selectedId, item.id, item.text);
      await setPendingChatMessage(user.id, selectedId, null);
      scrollToLatest.current = true;
      setMessages(previous => previous.some(message => message.id === result.id) ? previous : [...previous, result]);
      setPending(null); setDraft('');
    } catch { setError('Não foi possível confirmar o envio. Tente novamente para evitar mensagens duplicadas.'); }
    finally { sendLock.current = false; setSending(false); }
  }

  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.screen, { backgroundColor: theme.background }]}>
      {selected ? <>
        <View style={[styles.chatHeader, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Voltar às conversas" disabled={sending} hitSlop={8} onPress={backToConversations} style={styles.back}>
            <AppIcon name="back" size={22} color={theme.primary} />
          </Pressable>
          <Avatar name={selected.contact.name} />
          <View style={styles.headingText}>
            <Text numberOfLines={1} style={[styles.contactName, { color: theme.text }]}>{selected.contact.name}</Text>
            <Text numberOfLines={1} style={[styles.subtitle, { color: theme.muted }]}>{selectedContact?.passengers.length ? selectedContact.passengers.map(passenger => passenger.name).join(', ') : roleName(selected.contact.role)}</Text>
          </View>
        </View>
        {error ? <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}
        <ScrollView ref={history} style={styles.history} contentContainerStyle={styles.historyContent} keyboardShouldPersistTaps="handled" onContentSizeChange={() => { if (scrollToLatest.current) history.current?.scrollToEnd({ animated: false }); scrollToLatest.current = true; }}>
          {hasOlder ? <Pressable accessibilityRole="button" onPress={() => { void older(); }} style={[styles.older, { backgroundColor: theme.surface }]}><Text style={[styles.olderText, { color: theme.primary }]}>Carregar mensagens anteriores</Text></Pressable> : null}
          {messages.length === 0 ? <Text style={[styles.emptyChat, { color: theme.muted, backgroundColor: theme.surface }]}>Nenhuma mensagem ainda. Envie uma mensagem para começar.</Text> : messages.map(message => {
            const mine = message.sender_id === user?.id;
            return <View key={message.id} style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther, { backgroundColor: mine ? theme.primarySoft : theme.surface }]}>
              <Text style={[styles.messageText, { color: theme.text }]}>{message.body}</Text><Text style={[styles.time, { color: theme.muted }]}>{messageTime(message.created_at)}</Text>
            </View>;
          })}
        </ScrollView>
        {pending && !sending ? <View style={[styles.pendingBar, { backgroundColor: theme.surface, borderTopColor: theme.border }]}><Text style={[styles.pendingText, { color: theme.muted }]}>Envio não confirmado. A mensagem pode já ter sido entregue.</Text><Pressable accessibilityRole="button" onPress={() => { if (user && selectedId) void setPendingChatMessage(user.id, selectedId, null).then(() => { setPending(null); setDraft(''); setError(''); }).catch(() => setError('Não foi possível descartar a tentativa.')); }}><Text style={[styles.actionText, { color: theme.danger }]}>Descartar</Text></Pressable></View> : null}
        <View style={[styles.composer, { backgroundColor: theme.background }]}>
          <TextInput accessibilityLabel="Mensagem" value={draft} onChangeText={setDraft} editable={!pending && !sending} multiline scrollEnabled maxLength={4000} placeholder="Mensagem" placeholderTextColor={theme.muted} style={[styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]} />
          <Pressable accessibilityRole="button" accessibilityLabel={pending ? 'Tentar enviar novamente' : 'Enviar mensagem'} accessibilityState={{ disabled: sending || (!pending && !draft.trim()) }} disabled={sending || (!pending && !draft.trim())} onPress={() => { void send(); }} style={({ pressed }) => [styles.send, { backgroundColor: theme.primary, opacity: sending || (!pending && !draft.trim()) ? 0.45 : pressed ? 0.8 : 1 }]}>
            <AppIcon name={pending ? 'arrow' : 'send'} size={20} color={theme.dark ? '#10271f' : '#fff'} />
          </Pressable>
        </View>
      </> : driverUserId ? <View style={[styles.chatHeader, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Voltar às conversas" hitSlop={8} onPress={backToConversations} style={styles.back}>
          <AppIcon name="back" size={22} color={theme.primary} />
        </Pressable>
        <Text accessibilityLiveRegion="polite" style={[styles.headingText, { color: openError ? theme.danger : theme.muted }]}>{openError || 'Abrindo conversa…'}</Text>
        {openError ? <Pressable accessibilityRole="button" onPress={() => setOpenAttempt(value => value + 1)} style={[styles.newButton, { backgroundColor: theme.primarySoft }]}>
          <Text style={[styles.actionText, { color: theme.primary }]}>Tentar de novo</Text>
        </Pressable> : null}
      </View> : <>
        <View style={[styles.listHeader, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}><Brand /><View style={styles.listTitleRow}><View><Text style={[styles.listTitle, { color: theme.text }]}>Mensagens</Text><Text style={[styles.listCaption, { color: theme.muted }]}>Suas conversas em um só lugar</Text></View><Pressable accessibilityRole="button" onPress={() => { setShowContacts(value => !value); setSearch(''); }} style={[styles.newButton, { backgroundColor: theme.primarySoft }]}><Text style={[styles.newButtonText, { color: theme.primary }]}>{showContacts ? 'Conversas' : '+ Nova'}</Text></Pressable></View>
          <TextInput value={search} onChangeText={setSearch} placeholder={showContacts ? 'Buscar contato' : 'Buscar conversa'} placeholderTextColor={theme.muted} style={[styles.search, { backgroundColor: theme.surfaceAlt, color: theme.text }]} />
        </View>
        {error ? <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.listContent}>
          <Text style={[styles.sectionLabel, { color: theme.muted }]}>{showContacts ? 'CONTATOS' : 'CONVERSAS'}</Text>
          {loading ? <Text style={[styles.emptyList, { color: theme.muted }]}>Carregando conversas…</Text> : null}
          {!showContacts && visibleConversations.map(item => <Pressable key={item.id} accessibilityRole="button" onPress={() => { void selectConversation(item).catch(() => setError('Não foi possível recuperar o envio pendente.')); }} style={({ pressed }) => [styles.contactRow, { backgroundColor: pressed ? theme.surfaceAlt : theme.surface, borderColor: theme.border }]}>
            <Avatar name={item.contact.name} /><View style={styles.rowText}><View style={styles.rowTop}><Text numberOfLines={1} style={[styles.contactName, { color: theme.text }]}>{item.contact.name}</Text><Text style={[styles.rowTime, { color: item.unread ? theme.primary : theme.muted }]}>{item.last_message ? listTime(item.last_message.created_at) : ''}</Text></View><View style={styles.rowTop}><Text numberOfLines={1} style={[styles.preview, { color: theme.muted }]}>{item.last_message?.body ?? roleName(item.contact.role)}</Text>{item.unread ? <View style={[styles.unread, { backgroundColor: theme.primary }]}><Text style={styles.unreadText}>{item.unread > 99 ? '99+' : item.unread}</Text></View> : null}</View></View>
          </Pressable>)}
          {showContacts && visibleContacts.map(contact => <Pressable key={contact.id} accessibilityRole="button" onPress={() => { void choose(contact); }} style={({ pressed }) => [styles.contactRow, { backgroundColor: pressed ? theme.surfaceAlt : theme.surface, borderColor: theme.border }]}><Avatar name={contact.name} /><View style={styles.rowText}><Text numberOfLines={1} style={[styles.contactName, { color: theme.text }]}>{contact.name}</Text><Text numberOfLines={1} style={[styles.preview, { color: theme.muted }]}>{roleName(contact.role)}{contact.passengers.length ? ` · ${contact.passengers.map(p => p.name).join(', ')}` : ''}</Text></View></Pressable>)}
          {!loading && (showContacts ? visibleContacts.length === 0 : visibleConversations.length === 0) ? <Text style={[styles.emptyList, { color: theme.muted }]}>{term ? 'Nenhum resultado encontrado.' : showContacts ? 'Nenhum contato disponível no momento.' : 'Nenhuma conversa ainda. Toque em “+ Nova” para começar.'}</Text> : null}
        </ScrollView>
      </>}
    </SafeAreaView>
  </KeyboardAvoidingView>;
}

function roleName(role: string) { return role === 'admin' ? 'Administração' : role === 'driver' ? 'Motorista' : 'Responsável'; }
function initials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('pt-BR'); }
function messageTime(value: string) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? '' : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); }
function listTime(value: string) { const date = new Date(value); if (Number.isNaN(date.valueOf())) return ''; return date.toDateString() === new Date().toDateString() ? date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }); }
function Avatar({ name }: { name: string }) { const theme = useAppTheme(); return <View style={[styles.avatar, { backgroundColor: theme.primarySoft }]}><Text style={[styles.avatarText, { color: theme.primary }]}>{initials(name)}</Text></View>; }
const styles = StyleSheet.create({
  screen: { flex: 1 },
  listHeader: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 16, borderBottomWidth: 1, gap: 16 },
  listTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  listTitle: { fontSize: 23, fontWeight: '800', letterSpacing: -0.5 }, listCaption: { fontSize: 12, marginTop: 3 },
  newButton: { borderRadius: 12, paddingHorizontal: 14, minHeight: 38, justifyContent: 'center' }, newButtonText: { fontSize: 13, fontWeight: '800' },
  search: { borderRadius: 12, paddingHorizontal: 14, minHeight: 44, fontSize: 14 },
  listContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 30, gap: 8 }, sectionLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 3, marginLeft: 3 },
  contactRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1, borderRadius: 15 },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' }, avatarText: { fontSize: 14, fontWeight: '800' },
  rowText: { flex: 1, minWidth: 0, gap: 5 }, rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  contactName: { fontSize: 15, fontWeight: '800', flexShrink: 1 }, preview: { fontSize: 13, flex: 1 }, rowTime: { fontSize: 11 },
  unread: { minWidth: 21, height: 21, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }, unreadText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  emptyList: { textAlign: 'center', fontSize: 14, lineHeight: 21, paddingVertical: 30, paddingHorizontal: 16 },
  chatHeader: { minHeight: 72, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, gap: 10, elevation: 2 },
  back: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' }, headingText: { flex: 1, minWidth: 0, gap: 3 }, subtitle: { fontSize: 12 },
  history: { flex: 1 }, historyContent: { flexGrow: 1, paddingHorizontal: 14, paddingVertical: 18, gap: 10, justifyContent: 'flex-end' },
  bubble: { maxWidth: '85%', borderRadius: 15, paddingHorizontal: 12, paddingTop: 9, paddingBottom: 6, gap: 3, elevation: 1 }, bubbleMine: { alignSelf: 'flex-end', borderTopRightRadius: 4 }, bubbleOther: { alignSelf: 'flex-start', borderTopLeftRadius: 4 },
  messageText: { fontSize: 14, lineHeight: 20 }, time: { fontSize: 10, textAlign: 'right' },
  emptyChat: { textAlign: 'center', alignSelf: 'center', overflow: 'hidden', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 12, lineHeight: 18 },
  older: { alignSelf: 'center', borderRadius: 15, paddingHorizontal: 14, paddingVertical: 8 }, olderText: { fontSize: 12, fontWeight: '700' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10, gap: 8 },
  input: { flex: 1, borderWidth: 1, borderRadius: 22, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, minHeight: 46, maxHeight: 120, fontSize: 14, textAlignVertical: 'top' },
  send: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', elevation: 2 },
  pendingBar: { borderTopWidth: 1, paddingHorizontal: 14, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 10 }, pendingText: { flex: 1, fontSize: 12, lineHeight: 17 }, actionText: { fontSize: 12, fontWeight: '700' },
  error: { paddingHorizontal: 16, paddingVertical: 8, fontSize: 12 },
});
