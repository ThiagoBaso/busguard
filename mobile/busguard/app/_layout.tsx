import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { SessionProvider, useSession } from '@/services/session';
import { Screen, StatePanel, Button } from '@/components/ui';
import { useAppTheme } from '@/constants/theme';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: 'welcome',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <SafeAreaProvider><SessionProvider><RootLayoutNav /></SessionProvider></SafeAreaProvider>;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { status, user, retry, logout, errorMessage } = useSession();
  const theme = useAppTheme();

  if (status === 'checking') {
    return <Screen title="Preparando sua jornada"><StatePanel title="Verificando sessão" message="Só um instante para acessar sua conta." loading /></Screen>;
  }

  if (status === 'unavailable') {
    return (
      <Screen title="Vamos tentar de novo"><StatePanel title="Não foi possível verificar a sessão" message={errorMessage ?? 'Não foi possível validar sua sessão. Tente novamente.'} onRetry={() => void retry()} /><Button label="Sair da conta" variant="secondary" onPress={() => { void logout().catch(() => undefined); }} /></Screen>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }}>
        <Stack.Protected guard={status === 'signedOut'}>
          <Stack.Screen name="welcome" />
          <Stack.Screen name="login" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={status === 'signedIn'}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
          <Stack.Protected guard={user?.role === 'driver' || user?.role === 'supervisor'}><Stack.Screen name="route" /></Stack.Protected>
          <Stack.Protected guard={user?.role === 'responsible'}><Stack.Screen name="trip-details" /></Stack.Protected>
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
