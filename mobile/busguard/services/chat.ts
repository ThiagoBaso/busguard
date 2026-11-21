import { apiFetch } from '@/services/apiClient';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type ChatContact = { id: number; name: string; role: string; passengers: { id: number; name: string }[] };
export type ChatMessage = { id: number; sender_id: number; client_id: string; body: string; created_at: string };
export type ChatConversation = { id: number; contact: { id: number; name: string; role: string }; last_message: ChatMessage | null; unread: number };

export const chatContacts = (signal?: AbortSignal) => apiFetch<ChatContact[]>('/chat/contacts', { signal });
export const chatConversations = (signal?: AbortSignal) => apiFetch<ChatConversation[]>('/chat/conversations', { signal });
export const openChat = (userId: number, signal?: AbortSignal) => apiFetch<ChatConversation>('/chat/conversations', { method: 'POST', body: JSON.stringify({ user_id: userId }), signal });
export const chatMessages = (id: number, before?: number, signal?: AbortSignal) => apiFetch<ChatMessage[]>(`/chat/conversations/${id}/messages${before ? `?before_id=${before}` : ''}`, { signal });
export const sendChatMessage = (id: number, clientId: string, body: string) => apiFetch<ChatMessage>(`/chat/conversations/${id}/messages`, { method: 'POST', body: JSON.stringify({ client_id: clientId, body }) });
export const markChatRead = (id: number, throughId: number) => apiFetch<void>(`/chat/conversations/${id}/read`, { method: 'POST', body: JSON.stringify({ through_id: throughId }) });

export type PendingChatMessage = { id: string; text: string };
const pendingKey = (userId: number, conversationId: number) => `busguard.chat.pending.${userId}.${conversationId}`;
export async function getPendingChatMessage(userId: number, conversationId: number): Promise<PendingChatMessage | null> {
  const key = pendingKey(userId, conversationId);
  const value = Platform.OS === 'web' ? globalThis.sessionStorage?.getItem(key) : await SecureStore.getItemAsync(key);
  if (!value) return null;
  try { const item = JSON.parse(value); return typeof item.id === 'string' && typeof item.text === 'string' ? item : null; } catch { return null; }
}
export async function setPendingChatMessage(userId: number, conversationId: number, item: PendingChatMessage | null) {
  const key = pendingKey(userId, conversationId);
  if (Platform.OS === 'web') {
    if (item) globalThis.sessionStorage.setItem(key, JSON.stringify(item)); else globalThis.sessionStorage.removeItem(key);
  } else if (item) await SecureStore.setItemAsync(key, JSON.stringify(item));
  else await SecureStore.deleteItemAsync(key);
}
