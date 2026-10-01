import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router';
import { Text } from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();

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
    </Tabs>
  );
}
