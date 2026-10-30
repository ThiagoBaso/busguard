import { Tabs } from 'expo-router';
import { AppIcon } from '@/components/Brand';
import { useAppTheme } from '@/constants/theme';
import { useSession } from '@/services/session';

export default function TabLayout() {
  const theme = useAppTheme();
  const { user } = useSession();
  const driver = user?.role === 'driver' || user?.role === 'supervisor';
  return <Tabs screenOptions={{ headerShown: false, tabBarHideOnKeyboard: true, tabBarActiveTintColor: theme.primary, tabBarInactiveTintColor: theme.muted,
    tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border, borderTopWidth: 1, minHeight: 64 },
    tabBarLabelStyle: { fontSize: 11, lineHeight: 14, fontWeight: '700' }, tabBarItemStyle: { paddingTop: 5, paddingBottom: 3 } }}>
    <Tabs.Protected guard={driver}>
      <Tabs.Screen name="index" options={{ title: 'Início', tabBarAccessibilityLabel: 'Início do motorista', tabBarIcon: ({ color }) => <AppIcon name="bus" color={color} /> }} />
      <Tabs.Screen name="students" options={{ title: 'Chamada', tabBarAccessibilityLabel: 'Chamada dos alunos', tabBarIcon: ({ color }) => <AppIcon name="list" color={color} /> }} />
    </Tabs.Protected>
    <Tabs.Protected guard={user?.role === 'responsible'}>
      <Tabs.Screen name="responsible" options={{ title: 'Início', tabBarAccessibilityLabel: 'Início do responsável', tabBarIcon: ({ color }) => <AppIcon name="person" color={color} /> }} />
    </Tabs.Protected>
    <Tabs.Screen name="config" options={{ title: 'Minha conta', tabBarAccessibilityLabel: 'Minha conta', tabBarIcon: ({ color }) => <AppIcon name="settings" color={color} /> }} />
  </Tabs>;
}
