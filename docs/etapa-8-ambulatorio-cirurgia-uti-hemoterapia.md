# Etapa 8 — ambulatório, procedimentos, centro cirúrgico, UTI, nutrição e hemoterapia (relatório)

Escopo combinado: login e usuários seguem como estão (ver [pendencias.md](pendencias.md)).
Esta etapa fechou as filas que a Etapa 2 e a Etapa 3 deixaram sem tela (**Ambulatório** e **Procedimentos**) e acrescentou os serviços assistenciais que dependem da internação: **centro cirúrgico** (checklist e RPA), **UTI** (balanço hídrico e dispositivos), **nutrição** (dietas) e **hemoterapia** (transfusão). O **laboratório** ficou de fora de propósito: depende do catálogo de exames do hospital (pendência 29).

Todos os registros novos **só acrescentam**: nada é apagado, o erro é corrigido por anulação, complemento ou nova tentativa, e cada documento guarda histórico de quem fez e quando. Os valores clínicos (listas de dietas, vias, dispositivos, hemocomponentes, itens de checklist) são **listas de apoio** que o hospital deve confirmar; o sistema não decide conduta, protocolo, tempo ou dose.

## O que foi implementado

### 1. Agenda Ambulatorial (Ambulatório › Agenda Ambulatorial)
- Marcar, **confirmar**, **remarcar**, cancelar (motivo obrigatório) e registrar **falta**. Cada consulta tem paciente, especialidade (do cadastro), data, hora, tipo (primeira consulta, retorno), profissional (opcional) e motivo, com histórico de situação que só acrescenta.
- **Remarcar** não apaga: a consulta antiga fica "Remarcada", ligada à nova, e o horário antigo é liberado.
- **Trava de horário**: o mesmo paciente (ou o mesmo profissional informado) não pode ter duas consultas no mesmo dia e hora, nem com duas pessoas marcando ao mesmo tempo (documentos `agenda_slots`, gravados na mesma transação).
- Cartões de resumo (consultas hoje, aguardando chegada, chegaram, realizadas, faltas, próximos 7 dias), filtros por período, especialidade, situação e busca; em tela estreita cada consulta vira um cartão.
- **Check-in da consulta agendada** (pendência 12): o botão da agenda abre o check-in da Recepção já com a consulta; a senha é gerada, o paciente entra na fila do Ambulatório e a consulta passa a "Chegou" **na mesma transação**. Só no dia, só a pessoa certa, só uma vez. Cancelar o atendimento antes da chamada devolve a consulta à situação anterior.

### 2. Atendimento Ambulatorial (Ambulatório › Atendimento Ambulatorial) — fila AMBULATORIO (pendência 9)
- Tela do médico para chamar, atender e concluir, com as mesmas regras de chamada da triagem e do atendimento médico (local de atendimento, chamar fora da ordem com motivo, repetir chamada, não compareceu, devolver, reabrir).
- Ordem da fila: **preferencial primeiro**; depois o **horário marcado** (quem tem agendamento) ou a **hora de chegada** (quem veio sem agendar). A regra é provisória (pendência 53).
- Ao **concluir o atendimento médico**, a consulta da agenda passa a "Realizada" (exceto se o desfecho for evasão, que mantém "Chegou").

### 3. Atendimento de Procedimentos (Procedimentos › Atendimento de Procedimentos) — fila PROCEDIMENTOS (pendência 9)
- Mesma mecânica de chamada, para Enfermagem, Centro Cirúrgico e Hemodinâmica. A conclusão é **assinada com o registro no conselho** e entra no prontuário como registro "Procedimento realizado" (não se altera; correção por complemento). Desfechos: **realizado**, **não realizado** (motivo) e **devolver ao médico** (volta à fila médica mantendo o risco e a hora de chegada).
- A agenda antiga de procedimentos (Procedimentos › Agenda) **continua à parte**.

### 4. Centro Cirúrgico: Cirurgias, Checklist e RPA (Procedimentos › Cirurgias, Checklist e RPA)
- Marcar cirurgia (paciente, procedimento, lateralidade, prioridade, cirurgião, anestesista, equipe, sala, data, hora, duração). A **sala é travada** no dia e horário contra marcação dupla.
- Caminho: Agendada → Paciente na sala → Em cirurgia → RPA → Concluída (ou Cancelada antes de começar, com motivo; a sala é liberada).
- **Checklist de cirurgia segura em três momentos** (entrada, pausa cirúrgica e saída), assinado com o registro no conselho. Cada registro é uma **tentativa nova** (vale a última) e nunca altera as anteriores; correção posterior entra como **complemento**. A cirurgia só **começa** com entrada e pausa completas e só **vai à RPA** com a saída completa. Item sem resposta, ou "Não" em item de confirmação, deixa a fase "incompleta".
- **RPA**: avaliações (sinais vitais ou o motivo de não aferir, observação, pontuação com o nome da escala, ambos digitados) só acrescentam; a **alta** exige ao menos uma avaliação, destino, médico responsável e registro, e conclui a cirurgia.
- Cartões do dia, filtros e a situação do checklist por fase (três quadradinhos: completo, incompleto ou ainda não feito).

### 5. Painel da UTI (Assistência › Painel da UTI)
- Lista os internados em **leito de UTI** (tipo de leito "UTI" ou ala com "UTI" no nome; um filtro permite listar **todos os internados**), com balanço hídrico, dispositivos em uso e último sinal vital.
- **Balanço hídrico**: ganhos e perdas em mL com via (listas de apoio), horário do evento e quem lançou; janela de 6, 12 ou 24 h ou o dia de hoje; saldo = ganhos − perdas, **sem interpretação**. Lançamento errado **não se edita**: é **anulado** por um novo registro com motivo e deixa de entrar na soma.
- **Dispositivos invasivos**: tipo, local, data/hora de inserção e quem inseriu; retirada com motivo no mesmo documento; dias de uso contados pelo calendário. **Não há alerta** de tempo máximo.
- Só a Enfermagem registra; o Médico consulta.

### 6. Mapa de Dietas (Assistência › Mapa de Dietas)
- Prescrição de dieta ligada à **internação ativa** (tipo, via compatível, descrição, restrições e alergias alimentares, observação, data final). **Só uma dieta ativa por internação**: a nova marca a anterior como "Substituída" e a suspensão exige motivo; o ponteiro `dieta_ativa` garante isso com duas pessoas prescrevendo ao mesmo tempo.
- Mapa por unidade e leito para a copa e a cozinha (quem está **sem dieta** aparece), com histórico por paciente e **impressão**. Paciente que recebeu alta sai do mapa.
- Prescrevem o Médico e a Nutrição; a Enfermagem consulta.

### 7. Hemoterapia (Assistência › Hemoterapia)
- **Médico solicita** (hemocomponente, quantidade de unidades, urgência, indicação, grupo do paciente se conhecido, previsão) para um internado, assinando com o registro; protocolo sequencial `HT00001`.
- **Agência transfusional reserva** uma bolsa por unidade (número **único para sempre**: a mesma bolsa nunca entra duas vezes), registra grupo ABO/Rh digitado, validade e **quem conferiu a compatibilidade**, e **entrega** à unidade (com o nome de quem retirou). Bolsa vencida e unidade excedente são recusadas. Devolução ou descarte exige motivo.
- **Enfermagem transfunde**: confere a identificação com um **segundo profissional diferente** de quem transfunde, registra sinais vitais **antes, durante e depois**, e conclui (com a resposta obrigatória sobre **reação**; "Sim" exige a descrição) ou **interrompe** (motivo; a bolsa sai de circulação e a unidade pode ser reposta). A solicitação conclui quando todas as unidades pedidas foram transfundidas.
- Cada passo é uma transação que relê a situação (duas pessoas clicando ao mesmo tempo não passam as duas).

### 8. Relatórios novos (Relatórios › Assistência)
- **Agenda ambulatorial e faltas** (com taxa de faltas), **Cirurgias e RPA** (situação do checklist por fase e destino da alta) e **Hemoterapia e transfusões**. Cada um com período e busca, no formato dos demais relatórios.

### 9. Menu, perfis e telas iniciais
- Dois perfis novos: **Funcionário Nutrição** (abre direto no Mapa de Dietas) e **Funcionário Hemoterapia** (abre direto na Hemoterapia).
- Categoria nova **Ambulatório** no menu; Procedimentos ganhou "Atendimento de Procedimentos" e "Cirurgias, Checklist e RPA"; Assistência ganhou "Painel da UTI", "Mapa de Dietas" e "Hemoterapia". O módulo antigo `CENTRO_CIRURGICO` (estoque de OPME) **não foi tocado**.

## Permissões
| Ação | Perfis |
|---|---|
| `agenda_ambulatorial_ver` | Recepção, Médico, Enfermagem, Administrador |
| `agenda_ambulatorial_gerenciar` (marcar, remarcar, cancelar, falta, check-in) | Recepção, Administrador |
| Atendimento Ambulatorial (`atendimento_medico`) | Médico, Administrador |
| `atendimento_procedimentos` | Enfermagem, Centro Cirúrgico, Hemodinâmica (funcionário e chefe), Administrador |
| `cirurgia_ver` | Centro Cirúrgico, Enfermagem, Médico, Administrador |
| `cirurgia_gerenciar` (marcar, receber na sala, cancelar) | Centro Cirúrgico, Administrador |
| `cirurgia_registrar` (checklist, iniciar, RPA, alta) | Centro Cirúrgico, Enfermagem, Administrador |
| `uti_ver` / `uti_registrar` | Enfermagem e Médico veem; só Enfermagem (e Administrador) registra |
| `dieta_ver` / `dieta_prescrever` / `dieta_gerenciar` | Veem: Médico, Enfermagem, Nutrição. Prescrevem: Médico e Nutrição. Gerenciam (suspender dieta de outro): Nutrição |
| `hemoterapia_solicitar` / `hemoterapia_agencia` / `hemoterapia_transfundir` | Médico solicita; Funcionário Hemoterapia reserva, entrega e devolve; Enfermagem transfunde. Ninguém faz o papel do outro |

Todas as regras também são conferidas nos serviços (`services/ambulatorio.js`, `centro-cirurgico.js`, `uti.js`, `nutricao.js`, `hemoterapia.js`, `atendimento-procedimentos.js`), não só na tela.

## O que o sistema NÃO faz (de propósito)
- **Agenda**: não tem grade de horários por profissional, vagas por turno, encaixe nem lembrete ao paciente; só impede conflito de paciente e de profissional. Antecedência máxima de 365 dias é limite de digitação, não regra do hospital.
- **Centro cirúrgico**: o modelo de itens do checklist parte da Lista de Verificação de Segurança Cirúrgica da OMS e **precisa ser confirmado**; não calcula escore de recuperação, não define critério de alta da RPA, não controla duração nem sobreposição de salas (só o mesmo horário de início), não tem cadastro de salas nem de equipe (texto livre) e não substitui descrição cirúrgica, registro anestésico nem consentimento.
- **UTI**: só soma o que foi lançado; sem meta de balanço, sem perda insensível, sem alerta de tempo de dispositivo, sem escalas de gravidade.
- **Nutrição**: sem cálculo nutricional, sem cruzar dieta com alergia, medicação ou jejum, sem refeição servida nem aceitação.
- **Hemoterapia**: **não valida compatibilidade ABO/Rh nem prova cruzada** (o grupo é digitado e a conferência é de quem reserva), não define indicação, volume, velocidade, intervalo de sinais vitais nem prazo de uso da bolsa, não notifica a hemovigilância e só atende **internados**.
- **Laboratório** e a ligação **dispensação ↔ administração** (pendências 29 e 48) **não foram feitos**.

## Correções feitas no caminho
- **Centro Cirúrgico e Hemodinâmica não conseguiam concluir procedimento**: a conclusão tentava abrir o prontuário, que exige `prontuario_ver` (que esses perfis não têm). Agora só quem tem acesso ao prontuário o abre; o registro assinado entra no prontuário do mesmo jeito. Achado na verificação no navegador; teste de regressão em `tests/procedimentos.test.js`.
- **Regra do Firestore**: o centro cirúrgico e a hemodinâmica leem `pacientes` (busca ao marcar cirurgia e ao concluir procedimento), mas o rascunho só permitia os perfis de atendimento; corrigido no rascunho.
- **Fila do Ambulatório misturava horário local e UTC** ao ordenar agendados e espontâneos (o paciente agendado podia passar na frente ou ficar atrás errado); passou a comparar instantes.
- **Conflito de nome**: o estoque de OPME já usava `CENTRO_CIRURGICO`; a tela nova se chama `CIRURGIAS`.
- Transfusão: a permissão agora é conferida **antes** da validação do formulário nos quatro passos da enfermagem (antes, um perfil sem permissão recebia erro de campo em vez de "Acesso negado"; não gravava nada).
- Combobox padrão: o botão ganhou o texto completo como dica (`title`) quando o nome é longo e aparece com reticências.
- Tabelas em cartão (tela estreita): textos longos (especialidade, procedimento, dieta...) ocupam a linha toda para não quebrar no meio da palavra ("TRAUMATOLO GIA"); campos curtos ficam em pares.
- `transitarAtendimento` passou a ler a triagem só nas filas que a usam, para os perfis de Procedimentos não precisarem de acesso a dado clínico da triagem.

## Testes
206 testes passam (72 novos: `ambulatorio` 18, `centro-cirurgico` 14, `procedimentos` 9, `uti-nutricao` 14, `hemoterapia` 17; mais um caso novo em `triagem`). Cobrem: validações, caminhos de situação permitidos, travas de horário e de sala (marcação dupla recusada, cancelar libera), check-in agendado (só no dia, uma vez, desfazer), fila ordenada, consulta "Realizada", checklist (tentativa incompleta, complemento, bloqueio de início), RPA e alta, balanço (anulação, janela, soma), dispositivos, dieta única por internação, mapa, transfusão ponta a ponta (reserva, entrega, segundo profissional, reação, interrupção, cancelamento), permissões por perfil, nada é apagado e relatórios no formato de tela. Os testes usam um Firestore simulado em memória e **só dados fictícios**.

No navegador, com Firestore simulado (nunca o real): 35 telas e janelas varridas em **320, 390, 768, 1024 e 1366 px** (agenda e janelas de novo/remarcar/detalhe, fila do ambulatório, fila de procedimentos, cirurgias e janelas de nova/RPA/alta/checklist/detalhe, painel da UTI e janelas de balanço e dispositivos, mapa de dietas e janelas de prescrever/histórico, hemoterapia e todas as janelas de solicitar, reservar, sinais, concluir, interromper e detalhes, e os três relatórios), sem erro de JavaScript. A varredura acusou só: reticências no combo de local com nome longo em 320 px e o rodapé fixo das janelas cobrindo o último campo antes de rolar (padrão de todas as janelas). Matriz de acesso conferida para 14 perfis; fluxo completo agenda → check-in → fila → consulta → "Realizada"; conclusão de procedimento pelo centro cirúrgico e pela enfermagem; ações negadas aos perfis errados.

## Não verificado
- **Firestore real**: transações (agendamento com travas, check-in agendado, checklist, RPA, balanço, dieta única, os passos da transfusão), **índices** das consultas novas (`data >=`, `dia in [...]`, `dia >=`, `status == EM_USO/ATIVA`) e **regras novas** do `firestore.rules` (rascunho para `agenda_consultas`, `agenda_slots`, `cirurgias`, `balanco_hidrico`, `dispositivos`, `dietas`, `dieta_ativa`, `solicitacoes_transfusao` e `bolsas_sangue`; **não testadas no emulador** e sem publicar, pendência 2).
- Impressão real do mapa de dietas (A4 e "Salvar como PDF") e varredura em 1920 px.
- Uso com dados e volume reais: as listas de apoio (dietas, vias, dispositivos, hemocomponentes) e o modelo de checklist são provisórios; o hospital ainda não cadastrou leitos de UTI (a estrutura padrão não tem leito marcado como UTI).
- A mensagem "snapshot.forEach is not a function" no console vinha do banco simulado de teste (observador de salas), não do aplicativo.

Pendências acumuladas das Etapas 1 a 8: [pendencias.md](pendencias.md).
