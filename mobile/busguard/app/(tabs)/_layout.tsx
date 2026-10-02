import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useEffect, useState } from 'react';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { CurrentUser, restoreSession } from '@/services/apiClient';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const [role, setRole] = useState<CurrentUser['role'] | null>(null);

  useEffect(() => {
    restoreSession().then((user) => {
      setRole(user?.role ?? null);
    });
  }, []);

  const showResponsibleTab = role === 'responsible';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme].tint,
        tabBarStyle: { backgroundColor: '#ffffff' },
        // Disable the static render of the header on web
        // to prevent a hydration error in React Navigation v6.
        headerShown: false,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          href: showResponsibleTab ? null : undefined,
          title: 'Inicio',
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{
                android: 'directions_bus',
                web: 'directions_bus',
              }}
              tintColor={color}
              size={24}
              fallback={<Text style={{ color }}>Bus</Text>}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="two"
        options={{
          href: showResponsibleTab ? undefined : null,
          title: 'Responsavel',
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{
                android: 'person',
                web: 'person',
              }}
              tintColor={color}
              size={24}
              fallback={<Text style={{ color }}>Resp</Text>}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="config"
        options={{
          title: 'Config',
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{
                android: 'settings',
                web: 'settings',
              }}
              tintColor={color}
              size={24}
              fallback={<Text style={{ color }}>Cfg</Text>}
            />
          ),
        }}
      />
    </Tabs>
  );
}
