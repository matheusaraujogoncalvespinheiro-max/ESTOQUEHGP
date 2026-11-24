# Etapa 5 — leitos, fila de leito e painel de disponibilidade (relatório)

Escopo combinado: login e usuários seguem como estão (ver [pendencias.md](pendencias.md)).
Esta etapa fecha o caminho do paciente que a [Etapa 3](etapa-3-triagem-atendimento.md) deixou na fila **Internação**: o médico indica internar, o paciente espera um leito, a enfermagem ou a recepção aloca o leito (nasce a internação, ligada ao atendimento) e a coordenação enxerga a disponibilidade em tempo real.

Já existiam (Etapa 1 e anteriores): mapa de ocupação, internar, transferir, alta, higienização, bloqueio e histórico, com transações atômicas. A etapa **não refez isso**: acrescentou a fila, o painel, o tipo de bloqueio e as travas do cadastro.

## O que foi implementado

### 1. Fila de Leito (Assistência › Fila de Leito)
- Lista **quem está aguardando leito agora**, sem corte por dia (quem espera de um dia para o outro continua na fila). Entram o desfecho médico "Indicação de internação" e a internação eletiva aberta na Recepção.
- **Ordem**: risco já classificado na triagem (do mais grave ao menos grave; sem classificação por último) → atendimento preferencial → hora da indicação. A regra é uma proposta e **precisa ser confirmada pelo hospital** (pendência 34).
- Cartões de resumo: aguardando leito, maior espera, leitos livres, em higienização e bloqueados, todos com o mesmo tamanho.
- **Pedido do leito** (opcional, refeito enquanto o paciente espera, fica no histórico): ala desejada e se precisa de isolamento, mais observação de até 200 caracteres. "Isolamento" é o que o profissional pede e o que o **cadastro do leito** informa (tipo de leito Isolamento); o sistema não cria protocolo de isolamento.
- **Alocar leito**: janela com a lista de leitos livres (os que atendem ao pedido vêm primeiro), setor de origem obrigatório e motivo.
  - O **motivo é obrigatório** (mínimo 5 letras) só quando o leito escolhido **não atende ao pedido** ou quando **outro paciente da fila, que o leito atende, está na frente**. Sem isso a alocação segue sem pergunta.
  - Numa **única transação** nascem a internação (com `atendimento_id`, senha e origem "Fila de leito"), o leito vira Ocupado, a trava `internacao_ativa` é gravada e o atendimento fica Concluído com o leito no histórico. Se dois usuários escolherem o mesmo leito ou o mesmo paciente, só um passa; o outro recebe a mensagem ("leito não está livre", "não está mais aguardando").
- **Devolver ao médico** (motivo obrigatório): o paciente volta à fila médica com a marca "Volta da fila de leito". Só no mesmo dia do atendimento, porque as filas de atendimento são do dia (pendência 36).
- **Encerrar sem internar** (motivo obrigatório + tipo: recusa, outro serviço, indicação revista, outro): o atendimento fica Concluído passando por Em atendimento; **nada sai da fila sem registro**.
- Quadro "Internados por esta fila hoje" e busca por senha, nome ou prontuário.
- **Internação direta bloqueada** para quem está na fila de leito: a mensagem manda alocar pela Fila de Leito, para o atendimento não ficar aguardando com o paciente já internado (decisão de projeto, pendência 37).

### 2. Painel de Disponibilidade de Leitos (Assistência › Painel de Disponibilidade)
- Tela imersiva (mesma base do painel de chamadas; botão HOME, tela cheia, relógio) para a coordenação ou TV.
- **Só números, nunca o nome do paciente**: leitos livres, ocupados, em higienização, bloqueados, taxa de ocupação e, para quem tem acesso à fila, quantos aguardam leito e a maior espera. Por **andar** e por **ala**, com barra de proporção e filtro de andar.
- Nota com o total, os bloqueios por tipo e os leitos de isolamento cadastrados (e quantos estão livres).
- Atualiza em tempo real (`leitos_estado`, cadastro de leitos e, só para quem tem acesso, a fila). Perfis sem acesso à fila (Portaria, Higienização, Médico) veem 5 indicadores e o painel **não ouve** a fila.

### 3. Mapa de Ocupação
- Bloqueio agora tem **tipo** (Manutenção, Isolamento, Outro motivo), **motivo** e **previsão de liberação** opcional; o leito mostra tipo, motivo, responsável e previsão (com aviso quando a data já passou).
- Filtro por **tipo de bloqueio** e indicador **Aguardando leito** (para quem tem acesso à fila).
- Na internação, aparecem o atendimento de origem e o motivo da alocação.

### 4. Cadastro › Quartos e Leitos (travas)
- **Leito ocupado não pode ser inativado** (resolvido o item 6): a situação é lida do banco na hora, não da tela.
- Só dá para **mudar o quarto ou a letra com o leito livre**; manter o mesmo código (trocar unidade, tipo ou observação) continua permitido com o leito ocupado.

### 5. Outras telas
- Prontuário › Atendimentos e Cadastro › Paciente › Atendimentos mostram o **leito** e a situação na fila de leito; a Recepção encontra o paciente também na fila de leito.
- Painel de chamadas: a fila Exames também aparece no filtro.

## Permissões
| Ação | Perfis |
|---|---|
| `fila_leito` (ver, definir pedido, alocar, devolver, encerrar) | Administrador, Enfermagem, Recepção (alocar exige também `internacao_gerenciar`) |
| `mapa_ver` (mapa e painel de disponibilidade) | os mesmos de antes: Administrador, Enfermagem, Recepção, Médico, Higienização, Portaria e Chefe de Portaria |
| Bloquear e desbloquear leito | `leito_gerenciar` (sem mudança) |

Todas as regras também são conferidas nos serviços, não só na tela.

## O que o sistema NÃO faz (de propósito)
- Não decide prioridade clínica: usa o risco que a triagem já classificou e o preferencial previsto em lei; a ordem é uma proposta.
- Não **reserva** leito: alocar já é internar.
- Não filtra por **sexo, idade ou especialidade** do paciente no leito (o hospital precisa dizer as regras; pendência 35).
- Não cria protocolo de isolamento nem define quais motivos de bloqueio existem: as categorias são as três acima.
- O painel não mostra dado de paciente.

## Correções feitas no caminho
- Cadastro de leito: a validação passou a ser **assíncrona** (lê o estado real do leito); o motor de cadastros ganhou `dependenciasAsync`.
- A fila de leito tem **observador próprio** (`fila_leito`): o observador geral de atendimentos carrega só os últimos 300 e deixaria pacientes antigos fora da fila.
- Layout do painel: rótulo "Em higienização" quebrava no meio da palavra, indicadores ficavam 4+2 e os cartões de andar tinham alturas diferentes. Agora 6 ou 5 indicadores em colunas iguais (uma linha no monitor, 3 ou 2 por linha em telas menores), números por ala em 2x2 ou 4 em linha conforme a largura do quadro e cartões com a mesma altura.
- Mapa de Ocupação no celular: o título era cortado ("Mapa de Ocupaçã...") e o sétimo indicador ficava sozinho. Agora o título da tela **quebra em duas linhas em telas até 560 px** (vale para todas as telas, não só o mapa) e o indicador que sobra ocupa a linha inteira.
- Rótulo do tipo de bloqueio encurtado para "Isolamento" (era "Isolamento (controle de infecção)", cortado no filtro e com parênteses repetidos no título do leito).
- Botões do topo da Fila de Leito com a mesma altura no celular ("Painel de leitos").

## Testes
104 testes passam (21 novos: 20 em `tests/leitos.test.js` e 1 de trava do cadastro). Cobrem: ordem da fila (risco, preferencial, hora), requisitos e compatibilidade do leito, leitos livres ordenados, motivo obrigatório (fora da ordem e leito incompatível), validações da alocação, montagem da internação ligada ao atendimento, resumo de disponibilidade e isolamento, classificação do bloqueio, devolver (inclusive só no mesmo dia), encerrar com motivo, permissões e a trava de internação direta. Um teste de mutação (quebrar a regra de propósito) confirmou que os testes falham quando a regra falha.
No navegador, com Firestore simulado (nunca o real): fila com 3 pacientes vindos da consulta e 2 de internação eletiva; pedido do leito; alocação com e sem aviso; devolver ao médico; encerrar com motivo; indicadores e filtros do mapa; bloqueio por tipo com previsão (gravou categoria, previsão e motivo); inativar leito ocupado (barrou) e livre (chegou à confirmação); painel como Administrador, Recepção, Portaria, Higienização e Médico (5 ou 6 indicadores conforme o acesso); acesso negado à Fila de Leito para Portaria e Médico. Varredura automática de layout em 320, 390, 768 e 1024 px (Fila de Leito e suas janelas, Mapa, Painel): sem estouro lateral e sem botões de alturas diferentes (as "alturas diferentes" apontadas são do menu lateral, que tem dois tipos de item de propósito). A varredura apontou dois cortes, ambos corrigidos: o título do Mapa no celular e o rótulo longo do filtro de tipo de bloqueio (ver "Correções"). Painel conferido também em 800, 1366 e 1920 px por imagem.

## Não verificado
- **Transação de alocação no Firestore real** (testada só no banco simulado) e o uso simultâneo por vários usuários.
- **Regras do Firestore**: o rascunho já cobre os 4 documentos da alocação para Enfermagem e Recepção; **não testado no emulador** e segue sem publicar.
- Painel em TV real, em tela cheia, por tempo longo (sem rodízio de telas).
- Índices do Firestore da consulta `fila == INTERNACAO` e `status == AGUARDANDO` (o console avisa e gera o link se faltar).
- Layout: a varredura automática não repetiu o mapa e o painel em 1366 e 1920 px (só imagem), e **não foi refeita depois** de encurtar o rótulo "Isolamento" e de quebrar o título no celular nas demais telas do sistema (a quebra do título vale para todas as telas até 560 px; só o Mapa e a Fila de Leito foram vistos assim).
- Uso com dados e volume reais do hospital.

Pendências acumuladas das Etapas 1, 2, 3, 4 e 5: [pendencias.md](pendencias.md).
