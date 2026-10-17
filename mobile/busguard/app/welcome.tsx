import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon, Brand, BusIllustration } from '@/components/Brand';
import { AppText, Button } from '@/components/ui';
import { useAppTheme } from '@/constants/theme';

type Profile = 'driver' | 'responsible';
const profiles: { value: Profile; title: string; description: string; icon: 'bus' | 'person' }[] = [
  { value: 'driver', title: 'Sou motorista', description: 'Minha viagem e controle de embarque.', icon: 'bus' },
  { value: 'responsible', title: 'Sou responsável', description: 'O embarque e a viagem da criança.', icon: 'person' },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const [profile, setProfile] = useState<Profile>('driver');

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={styles.brand}><Brand large /></View>
          <BusIllustration />
          <View style={styles.introduction}>
            <AppText accessibilityRole="header" style={styles.title}>Mais cuidado em cada jornada.</AppText>
            <AppText muted style={styles.centered}>Embarques organizados para quem conduz. Mais tranquilidade para quem acompanha.</AppText>
          </View>
          <AppText variant="label" muted>COMO VOCÊ VAI USAR O APLICATIVO?</AppText>
          <View style={styles.profiles} accessibilityRole="radiogroup" accessibilityLabel="Escolha seu perfil de acesso">
            {profiles.map((option) => {
              const selected = profile === option.value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityLabel={`${option.title}. ${option.description}`}
                  accessibilityState={{ checked: selected }}
                  onPress={() => setProfile(option.value)}
                  style={({ pressed }) => [styles.profile, { backgroundColor: theme.surface, borderColor: selected ? theme.primary : theme.border, opacity: pressed ? 0.8 : 1 }]}>
                  <View style={[styles.profileIcon, { backgroundColor: option.value === 'driver' ? theme.surfaceAlt : theme.primarySoft }]}>
                    <AppIcon name={option.icon} size={25} color={theme.primary} />
                  </View>
                  <View style={styles.profileText}><AppText style={styles.profileTitle}>{option.title}</AppText><AppText muted style={styles.description}>{option.description}</AppText></View>
                  <View style={[styles.selection, { borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? theme.primarySoft : theme.surface }]}>
                    {selected ? <AppIcon name="check" size={19} color={theme.primary} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Button label="Continuar" onPress={() => router.push({ pathname: '/login', params: { profile } })} />
          <View style={styles.footer}><AppIcon name="shield" size={17} color={theme.muted} /><AppText muted style={styles.footerText}>Acesso com a conta fornecida pelo transporte escolar.</AppText></View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, scroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: 28 },
  content: { width: '100%', maxWidth: 480, paddingHorizontal: 20, alignSelf: 'center', gap: 17 },
  brand: { alignItems: 'center', marginBottom: 6 }, introduction: { gap: 10, paddingVertical: 4 },
  title: { fontSize: 28, lineHeight: 35, fontWeight: '800', letterSpacing: -0.8, textAlign: 'center' },
  centered: { textAlign: 'center' }, profiles: { gap: 10 },
  profile: { minHeight: 90, borderWidth: 1.5, borderRadius: 15, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  profileIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  profileText: { flex: 1, minWidth: 0, gap: 4 }, profileTitle: { fontWeight: '800', fontSize: 15 }, description: { fontSize: 12, lineHeight: 18 },
  selection: { width: 24, height: 24, borderWidth: 1.5, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 8 },
  footerText: { textAlign: 'center', fontSize: 11, lineHeight: 17 },
});
