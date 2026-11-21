import { useEffect, useRef, useState, type FormEvent } from 'react';
import { apiFetch } from '../api';
import { Button, PageTitle, Panel } from '../components';
import type { ScreenProps } from '../pageTypes';

type Contact = { id: number; name: string; role: string };
type Message = { id: number; sender_id: number; client_id: string; body: string; created_at: string };
type Conversation = { id: number; contact: Contact; last_message: Message | null; unread: number };

export function MessagesPage({ currentUser }: ScreenProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<{ id: string; text: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [showContacts, setShowContacts] = useState(false);
  const [search, setSearch] = useState('');
  const initialized = useRef(false);
  const sendLock = useRef(false);
  const history = useRef<HTMLDivElement>(null);
  const scrollToLatest = useRef(true);
  const selectedId = selected?.id;

  useEffect(() => {
    const controller = new AbortController();
    let active = true, running = false;
    async function refresh() {
      if (running || document.visibilityState === 'hidden') return;
      running = true;
      try {
        const [list, people, latest] = await Promise.all([
          apiFetch<Conversation[]>('/chat/conversations', { signal: controller.signal }),
          apiFetch<Contact[]>('/chat/contacts', { signal: controller.signal }),
          selectedId ? apiFetch<Message[]>(`/chat/conversations/${selectedId}/messages`, { signal: controller.signal }) : Promise.resolve(null),
        ]);
        if (!active) return;
        setConversations(list); setContacts(people); setError('');
        if (latest && selectedId) {
          setMessages(previous => { const all = new Map(previous.map(message => [message.id, message])); latest.forEach(message => all.set(message.id, message)); return [...all.values()].sort((a, b) => a.id - b.id); });
          if (!initialized.current) { setHasOlder(latest.length === 50); initialized.current = true; }
          if (latest.length) void apiFetch(`/chat/conversations/${selectedId}/read`, { method: 'POST', body: JSON.stringify({ through_id: latest[latest.length - 1].id }) }).catch(() => {});
        }
      } catch { if (active && !controller.signal.aborted) setError('Não foi possível atualizar as mensagens. Verifique a conexão.'); }
      finally { running = false; }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    document.addEventListener('visibilitychange', refresh);
    return () => { active = false; controller.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [selectedId]);

  useEffect(() => {
    if (history.current && scrollToLatest.current) history.current.scrollTop = history.current.scrollHeight;
    scrollToLatest.current = true;
  }, [messages]);

  const pendingKey = (id: number) => `busguard.chat.pending.${currentUser.id}.${id}`;
  function select(item: Conversation) {
    let saved: { id: string; text: string } | null = null;
    try { const value = sessionStorage.getItem(pendingKey(item.id)); if (value) saved = JSON.parse(value); }
    catch { setError('Não foi possível recuperar o envio pendente.'); return; }
    setMessages([]); setHasOlder(false); initialized.current = false; scrollToLatest.current = true; setDraft(saved?.text ?? ''); setPending(saved); setError(saved ? 'Há um envio sem confirmação. Tente novamente.' : ''); setSelected(item); setShowContacts(false); setSearch('');
  }
  async function open(contact: Contact) {
    if (pending || sending) return;
    try { select(await apiFetch<Conversation>('/chat/conversations', { method: 'POST', body: JSON.stringify({ user_id: contact.id }) })); }
    catch { setError('Não foi possível iniciar a conversa.'); }
  }
  async function older() {
    if (!selectedId || !messages.length) return;
    try { const data = await apiFetch<Message[]>(`/chat/conversations/${selectedId}/messages?before_id=${messages[0].id}`); scrollToLatest.current = false; setMessages(previous => [...data, ...previous]); setHasOlder(data.length === 50); }
    catch { setError('Não foi possível carregar mensagens anteriores.'); }
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!selectedId || sendLock.current || (!pending && !draft.trim())) return;
    sendLock.current = true;
    const item = pending ?? { id: createMessageId(), text: draft.trim() };
    setPending(item); setSending(true); setError('');
    try {
      sessionStorage.setItem(pendingKey(selectedId), JSON.stringify(item));
      const result = await apiFetch<Message>(`/chat/conversations/${selectedId}/messages`, { method: 'POST', body: JSON.stringify({ client_id: item.id, body: item.text }) });
      sessionStorage.removeItem(pendingKey(selectedId));
      scrollToLatest.current = true; setMessages(previous => previous.some(message => message.id === result.id) ? previous : [...previous, result]); setPending(null); setDraft('');
    } catch { setError('Não foi possível confirmar o envio. Tente novamente para evitar duplicidade.'); }
    finally { sendLock.current = false; setSending(false); }
  }

  return <>
    <PageTitle title="Mensagens" description="Acompanhe suas conversas com motoristas e responsáveis." />
    {error ? <p role="alert" className="chat-error">{error}</p> : null}
    <div className={`chat-layout ${selected ? 'has-selection' : ''}`}>
      <Panel className="chat-sidebar">
        <div className="chat-sidebar-heading"><div><h2>{showContacts ? 'Contatos' : 'Conversas'}</h2><p>{showContacts ? 'Escolha uma pessoa' : 'Suas mensagens'}</p></div><button type="button" className="chat-new" onClick={() => { setShowContacts(value => !value); setSearch(''); }}>{showContacts ? 'Conversas' : '+ Nova'}</button></div>
        <input className="chat-search" aria-label={showContacts ? 'Buscar contato' : 'Buscar conversa'} placeholder={showContacts ? 'Buscar contato' : 'Buscar conversa'} value={search} onChange={event => setSearch(event.target.value)} />
        <div className="chat-list">{showContacts ? contacts.filter(person => person.name.toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR'))).map(person => <button type="button" className="chat-contact" key={person.id} disabled={Boolean(pending) || sending} onClick={() => void open(person)}><span className="chat-avatar">{initials(person.name)}</span><span className="chat-contact-text"><strong>{person.name}</strong><span>{roleName(person.role)}</span></span></button>) : conversations.filter(item => item.contact.name.toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR'))).map(item => <button type="button" className={`chat-contact ${selected?.id === item.id ? 'chat-contact-selected' : ''}`} key={item.id} disabled={Boolean(pending) || sending} onClick={() => select(item)}><span className="chat-avatar">{initials(item.contact.name)}</span><span className="chat-contact-text"><span className="chat-contact-top"><strong>{item.contact.name}</strong><small>{item.last_message ? listTime(item.last_message.created_at) : ''}</small></span><span className="chat-contact-top"><span className="chat-preview">{item.last_message?.body ?? roleName(item.contact.role)}</span>{item.unread ? <b className="chat-unread">{item.unread > 99 ? '99+' : item.unread}</b> : null}</span></span></button>)}</div>
        {!showContacts && !conversations.length ? <p className="chat-empty-list">Nenhuma conversa ainda. Escolha um contato para começar.</p> : null}
        {showContacts && !contacts.length ? <p className="chat-empty-list">Nenhum contato disponível.</p> : null}
        {search.trim() && !(showContacts ? contacts : conversations.map(item => item.contact)).some(person => person.name.toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR'))) ? <p className="chat-empty-list">Nenhum resultado encontrado.</p> : null}
      </Panel>
      <Panel className="chat-thread">
        {selected ? <>
          <div className="chat-thread-header"><button type="button" className="chat-mobile-back" disabled={sending} aria-label="Voltar às conversas" onClick={() => { setSelected(null); setMessages([]); setPending(null); setDraft(''); setError(''); }}>←</button><span className="chat-avatar">{initials(selected.contact.name)}</span><div><strong>{selected.contact.name}</strong><span>{roleName(selected.contact.role)}</span></div></div>
          <div className="chat-messages" aria-live="polite" ref={history}>
            {hasOlder ? <Button type="button" variant="quiet" onClick={() => void older()}>Carregar anteriores</Button> : null}
            {messages.length === 0 ? <p>Nenhuma mensagem nesta conversa.</p> : messages.map(message => <div className={`chat-message ${message.sender_id === currentUser.id ? 'chat-message-own' : ''}`} key={message.id}><span>{message.body}</span><small>{new Date(message.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</small></div>)}
          </div>
          {pending && !sending ? <div className="chat-pending"><span>A mensagem pode já ter sido entregue. Confira antes de descartar.</span><button type="button" onClick={() => { try { sessionStorage.removeItem(pendingKey(selected.id)); setPending(null); setDraft(''); setError(''); } catch { setError('Não foi possível descartar a tentativa.'); } }}>Descartar</button></div> : null}
          <form onSubmit={send} className="chat-compose"><label className="chat-sr-only" htmlFor="chat-message">Mensagem</label><textarea id="chat-message" placeholder="Escreva uma mensagem" value={draft} maxLength={4000} disabled={Boolean(pending) || sending} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><button className="chat-send" type="submit" aria-label={pending ? 'Tentar enviar novamente' : 'Enviar mensagem'} disabled={sending || (!pending && !draft.trim())}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 2 11 13"/><path d="m22 2-7 20-4-9-9-4 20-7Z"/></svg></button></form>
        </> : <div className="chat-empty-thread"><span className="chat-empty-icon">✉</span><strong>Suas conversas</strong><p>Selecione uma conversa ou inicie uma nova.</p></div>}
      </Panel>
    </div>
  </>;
}

function roleName(role: string) { return role === 'driver' ? 'Motorista' : role === 'responsible' ? 'Responsável' : 'Administração'; }
function initials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('pt-BR'); }
function listTime(value: string) { const date = new Date(value); if (Number.isNaN(date.valueOf())) return ''; return date.toDateString() === new Date().toDateString() ? date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }); }

function createMessageId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
