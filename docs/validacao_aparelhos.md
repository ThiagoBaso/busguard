# Validação em aparelhos com dados fictícios

Use somente contas, passageiros, endereços e posições fictícios. O roteiro altera a viagem escolhida; crie uma viagem de demonstração dedicada e não use uma operação real. A rotina automatizada descrita no README usa um banco descartável, mas não substitui esta validação nos aparelhos.

1. Com a API e o painel disponíveis, confira os vínculos fictícios entre passageiro, responsável, rota e motorista. Programe e inicie uma viagem dedicada. Conecte o telefone do motorista e, se possível, outro telefone para o responsável. Configure o endereço de rede da API no Expo; `localhost` no telefone é o próprio telefone.
2. Entre com as contas de teste. No app do motorista, abra a chamada e valide o embarque do passageiro. No app do responsável, confira o último registro confirmado; no painel, confira o evento e a viagem. Se a parada possuir coordenadas, confira se o mapa a mostra como concluída e se o próximo destino muda.
3. Para produzir uma pendência de forma controlada, no painel use **Embarques e desembarques → Registrar acesso** e registre novamente o mesmo embarque para o passageiro e o veículo da viagem. Confira se o evento aparece como **Aguardando revisão**, se o painel mostra o alerta e se o responsável vê que a situação precisa de confirmação.
4. Abra **Revisar**, confira os vínculos registrados no início e a linha do tempo, rejeite o registro repetido com um motivo e confira se a decisão e o revisor aparecem no histórico. Verifique se o estado confirmado volta a aparecer nos aplicativos e no mapa.
5. Com a viagem ativa, coloque o app do motorista em segundo plano por mais de cinco minutos. Confira no painel e no app do responsável a data e hora da última comunicação e o aviso de falta de atualização. Volte o app ao primeiro plano e aguarde a nova comunicação. O sinal de comunicação não garante o envio de GPS ou de todos os registros.
6. Encerre a viagem de demonstração. Confira que seus vínculos não podem ser editados por meio da edição da viagem e que alterações posteriores na rota não modificam os vínculos guardados no início.

Registre modelos dos aparelhos, versão do sistema, data, resultado de cada passo e qualquer diferença observada. Não é necessário coletar ou compartilhar dados pessoais nos registros da validação.
