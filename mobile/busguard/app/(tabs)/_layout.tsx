import { Tabs } from 'expo-router';
import { AppIcon } from '@/components/Brand';
import { useAppTheme } from '@/constants/theme';
import { useSession } from '@/services/session';
import { LocationSharingProvider } from '@/services/locationSharing';
import { TripCommunicationReporter } from '@/services/tripCommunication';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { chatConversations } from '@/services/chat';

export const unstable_settings = { initialRouteName: 'responsible' };

export default function TabLayout() {
  const theme = useAppTheme();
  const { user } = useSession();
  const [unread, setUnread] = useState(0);
  const driver = user?.role === 'driver' || user?.role === 'supervisor';
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    async function refresh() {
      if (AppState.currentState !== 'active') return;
      try { const list = await chatConversations(controller.signal); if (live) setUnread(list.reduce((total, item) => total + item.unread, 0)); }
      catch { /* Keep the last known count until the next successful refresh. */ }
    }
    if (user?.role === 'driver' || user?.role === 'responsible') void refresh();
    else setUnread(0);
    const timer = setInterval(() => { if (user?.role === 'driver' || user?.role === 'responsible') void refresh(); }, 5000);
    return () => { live = false; controller.abort(); clearInterval(timer); };
  }, [user?.id, user?.role]);
  return <LocationSharingProvider><TripCommunicationReporter /><Tabs screenOptions={{ headerShown: false, tabBarHideOnKeyboard: true, tabBarActiveTintColor: theme.primary, tabBarInactiveTintColor: theme.muted,
    tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border, borderTopWidth: 1, minHeight: 64 },
    tabBarLabelStyle: { fontSize: 11, lineHeight: 14, fontWeight: '700' }, tabBarItemStyle: { paddingTop: 5, paddingBottom: 3 } }}>
    <Tabs.Protected guard={driver}>
      <Tabs.Screen name="index" options={{ title: 'Início', tabBarAccessibilityLabel: 'Início do motorista', tabBarIcon: ({ color }) => <AppIcon name="bus" color={color} /> }} />
      <Tabs.Screen name="students" options={{ title: 'Chamada', tabBarAccessibilityLabel: 'Chamada dos alunos', tabBarIcon: ({ color }) => <AppIcon name="list" color={color} /> }} />
    </Tabs.Protected>
    <Tabs.Protected guard={user?.role === 'responsible'}>
      <Tabs.Screen name="responsible" options={{ title: 'Início', tabBarAccessibilityLabel: 'Início do responsável', tabBarIcon: ({ color }) => <AppIcon name="person" color={color} /> }} />
    </Tabs.Protected>
    <Tabs.Protected guard={user?.role === 'driver' || user?.role === 'responsible'}>
      <Tabs.Screen name="messages" options={{ title: 'Mensagens', tabBarAccessibilityLabel: 'Mensagens', tabBarBadge: unread > 0 ? unread : undefined, tabBarIcon: ({ color }) => <AppIcon name="message" color={color} /> }} />
    </Tabs.Protected>
    <Tabs.Screen name="config" options={{ title: 'Minha conta', tabBarAccessibilityLabel: 'Minha conta', tabBarIcon: ({ color }) => <AppIcon name="settings" color={color} /> }} />
  </Tabs></LocationSharingProvider>;
}
