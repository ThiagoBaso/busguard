import { useLocalSearchParams, useRouter } from 'expo-router';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { AppIcon } from '@/components/Brand';
import { useSession } from '@/services/session';

export default function ModalScreen() {
  const { section } = useLocalSearchParams<{ section?: string }>();
  const router = useRouter();
  const { user } = useSession();
  const about = section === 'about';
  return (
    <Screen title={about ? 'Sobre o aplicativo' : 'Como podemos ajudar?'} subtitle="Cuidado e clareza em cada etapa da jornada.">
      <Card><AppIcon name={about ? 'bus' : 'shield'} /><AppText variant="title">{about ? 'Rota Escolar Segura' : 'Sua conta de acesso'}</AppText><AppText>{about ? 'O BusGuard conecta os registros de embarque e desembarque de quem conduz ao acompanhamento de quem cuida.' : 'Seu e-mail e sua senha são fornecidos pela administração do transporte. Se precisar recuperar o acesso ou alterar seus dados, entre em contato com ela.'}</AppText></Card>
      <Card><AppText style={{ fontWeight: '700' }}>Para quem conduz</AppText><AppText>Na Chamada, confira o aluno e toque em Validar embarque. Aguarde a confirmação antes de continuar. Para corrigir um registro, use Registrar desembarque.</AppText></Card>
      <Card><AppText style={{ fontWeight: '700' }}>Para quem acompanha</AppText><AppText>O início mostra a criança vinculada à sua conta e seu último registro na viagem em andamento. O horário de consulta é o momento em que o aplicativo recebeu os dados; ele pode ser diferente do horário do embarque.</AppText></Card>
      <Card><AppText style={{ fontWeight: '700' }}>Conexão e atualização</AppText><AppText>Os dados são consultados enquanto você acompanha a tela. Puxe para atualizar. Se a conexão falhar, o aplicativo identifica a consulta anterior. A posição do veículo, mensagens e avisos por notificação ainda não estão disponíveis.</AppText></Card>
      <Button label="Voltar" variant="secondary" onPress={() => router.canGoBack() ? router.back() : router.replace(user?.role === 'responsible' ? '/(tabs)/responsible' : '/(tabs)/config')} />
    </Screen>
  );
}
