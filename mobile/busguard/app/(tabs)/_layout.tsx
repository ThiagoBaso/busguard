import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router';
import { Text } from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useSession } from '@/services/session';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { user } = useSession();
  const role = user?.role;
  const showResponsibleTab = role === 'responsible';
  const showDriverTab = role === 'driver' || role === 'supervisor';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme].tint,
        tabBarStyle: { backgroundColor: '#ffffff' },
        // Disable the static render of the header on web
        // to prevent a hydration error in React Navigation v6.
        headerShown: false,
      }}>
      <Tabs.Protected guard={showDriverTab}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Início',
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
      </Tabs.Protected>
      <Tabs.Protected guard={showResponsibleTab}>
        <Tabs.Screen
          name="responsible"
          options={{
            title: 'Responsável',
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
      </Tabs.Protected>
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
