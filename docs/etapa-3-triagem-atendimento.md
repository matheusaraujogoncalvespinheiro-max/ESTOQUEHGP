# Etapa 3 — triagem e atendimento médico (relatório)

Escopo combinado: login e usuários seguem como estão (ver [pendencias.md](pendencias.md)).
Esta etapa continua o atendimento criado pela Recepção na [Etapa 2](etapa-2-recepcao.md): a mesma senha segue o paciente pela chamada, triagem, fila médica e desfecho.

## O que foi implementado
Três telas novas no menu **Assistência** e um cadastro novo.

### 1. Triagem Clínica (Assistência › Triagem Clínica)
- **Fila da triagem** do dia: preferenciais (previstos em lei) primeiro e depois a chegada mais antiga. Resumo (aguardando, chamados, em triagem, maior espera, aguardando médico).
- **Chamada**: "Chamar próximo" ou "Chamar" em um paciente, para o local escolhido (sala de triagem). Repetir chamada (conta quantas vezes), **Não compareceu** (só depois de chamar), **Devolver à fila** (com motivo), **Reabrir** quem voltou (mesmo dia, com motivo).
- **Janela da triagem**: queixa principal, sintomas, alergias, medicamentos em uso, sinais vitais (PA, FC, FR, SpO₂, temperatura, glicemia, dor, peso, altura) ou o motivo de não ter sido possível aferir.
- **Classificação de risco (Manchester)**: só o enfermeiro classificador escolhe o nível e escreve o fluxograma/discriminador que o justifica; depois decide para onde o paciente segue (padrão: Atendimento médico). Os outros perfis de enfermagem registram a queixa e os sinais vitais e o classificador conclui.
- **Reavaliação**: aba com quem já foi classificado e aguarda o médico, com a espera e o tempo-alvo do nível. Reavaliar = novos sinais (opcionais), novo nível ou confirmação do atual e justificativa; tudo fica no histórico de classificações.

### 2. Atendimento Médico (Assistência › Atendimento Médico)
- **Fila médica** ordenada por nível de risco, depois preferencial, depois quem foi classificado primeiro. Quem não passou pela triagem (consulta/retorno) vem depois dos classificados. Cada linha mostra o risco, a espera e o **tempo-alvo** do nível (alerta de cor quando falta pouco e quando é excedido).
- Chamada igual à da triagem. **Chamar fora da ordem** exige motivo, que fica no histórico e na auditoria.
- **Janela da consulta**: resumo da triagem (queixa, alergias, medicamentos, sinais, quem classificou), anamnese, exame físico, hipóteses diagnósticas com CID-10, conduta, prescrição por item, solicitação de exame (o mesmo formulário do prontuário, ligado ao atendimento) e desfecho.
- **Desfechos**: alta médica, encaminhamento (exames, procedimentos, ambulatório ou internação, com o motivo), indicação de internação (vai para a fila Internação) e saída sem alta (evasão, dispensa CID e conduta).
- **Rascunho**: pode fechar a janela e continuar depois.
- **Concluir** grava numa única transação a consulta final, os **registros assinados no prontuário** (1 evolução, 1 diagnóstico por hipótese, 1 prescrição) com o número do atendimento, e move o atendimento para o desfecho. Quem não assumiu o atendimento não conclui.
- Lista "Meus atendimentos de hoje" (todos, para o administrador) com atalho para o prontuário.

### 3. Painel de Chamadas (Assistência › Painel de Chamadas)
- Tela escura para a TV da sala de espera, em tela cheia da janela: **senha e local em letras grandes** e as últimas chamadas. Nova chamada ou repetição faz o painel piscar.
- **Privacidade**: o painel só recebe senha, local e hora. Nunca o nome do paciente, a queixa ou o risco (garantido por teste).
- Filtro por fila (triagem ou médico), botão de tela cheia e **voz opcional** ("Senha E 1, Consultório 1") com a voz do navegador, desligada por padrão. Chamadas antigas (mais de 30 s) não são anunciadas ao abrir a tela.

### 4. Cadastro novo
**Cadastro › Assistência › Locais de Atendimento**: nome do local, "nome no painel" (texto da TV), fila atendida e unidade. **Sem local cadastrado não há chamada**; o administrador precisa cadastrar as salas e consultórios (ver pendências).

## Situações do atendimento
Aguardando → **Chamado** → **Em atendimento** → Concluído; também **Não compareceu** (libera a senha) e Cancelado. Cada mudança entra no histórico de situação (quem, quando, motivo) e a transição é conferida dentro da transação: duas pessoas clicando ao mesmo tempo não passam as duas.

## Onde ficam os dados (LGPD)
- `atendimentos`: só campos operacionais (situação, fila, risco atual, local, quem atende). A Recepção enxerga esta coleção, por isso **sinais vitais, sintomas, alergias e a justificativa do risco ficam fora dela**.
- `triagens` (1 por atendimento, só acrescenta): queixa, sintomas, alergias, medicamentos, sinais vitais e classificações com autor e hora.
- `consultas` (1 por atendimento): rascunho e consulta final. `registros_clinicos`: registros assinados (mesma coleção do prontuário, agora com `atendimento_id`).
- `chamadas`: registro de cada chamada para o painel (senha, local, hora).
- Abertura de triagem e consulta entra na auditoria de acesso ao paciente.

## Permissões novas
| Ação | Perfis |
|---|---|
| `triagem_clinica` (chamar, sinais vitais) | Funcionário Emergência, Funcionário Enfermagem, Administrador |
| `triagem_classificar` (classificar e reavaliar) | Funcionário Emergência, Administrador (mesma regra de `PERFIS_CLASSIFICADORES`) |
| `atendimento_medico` | Médico, Administrador |
| `painel_chamada` | Recepção, Emergência, Enfermagem, Médico, Administrador |

Todas as regras também são conferidas nos serviços, não só na tela.

## O que o sistema NÃO faz (de propósito)
- Não sugere nem calcula o nível de risco, não gera alertas clínicos nem escores. Os limites dos campos de sinais vitais só barram erro de digitação (ex.: SpO₂ 120).
- Não tem lista de CID-10 embutida (só confere o formato) e não sugere diagnóstico, conduta ou medicamento.
- Não inventa protocolo: os tempos-alvo do Manchester são os que já estavam em `core/regras.js`, a confirmar com o hospital.

## Correções feitas no caminho
- Formulários genéricos (`at-form`) ficavam com os campos encolhidos e empurrados para a direita (regra `justify-content: flex-end` em `cadastros.css`). Afetava os cadastros de Assistência e as janelas clínicas; corrigido.
- O título da tela mostrava "Módulo Desconhecido" para as telas novas; corrigido no mapa de títulos.
- No prontuário, o aviso "Sem internação ativa" agora explica que o atendimento de urgência é registrado em Atendimento Médico.
- `registrarClinico` foi reorganizado (validação do conteúdo separada) para a consulta reutilizar as mesmas regras de CID-10 e prescrição.

## Testes
65 testes passam (18 novos em `tests/triagem.test.js`): sinais vitais, classificação, ordem das filas, painel sem nome, situações, permissões por perfil e o fluxo completo contra um Firestore simulado (chamada, repetição, não comparecimento, triagem, reavaliação, consulta, desfechos, bloqueio de quem não assumiu o atendimento, CID inválido sem gravar nada, não concluir duas vezes, filas sem tela de chamada).
No navegador, com Firestore simulado: cadastro dos locais pela tela, check-ins pela Recepção, triagem pela janela (validações, classificação, técnico sem botão de concluir), reavaliação elevando o risco e reordenando a fila médica, chamada fora da ordem (motivo obrigatório), consulta completa com solicitação de exame e conclusão, prontuário com a evolução assinada, painel (chamada, repetição, filtro, voz ligar/desligar, sem nome do paciente), matriz de acesso por perfil e a fila da Recepção com as situações novas sem exibir risco nem sinais.

## Não verificado
- Transações de chamada e de conclusão no Firestore real (testadas só no banco simulado).
- Painel em TV real e a voz (depende do navegador e do sistema; o painel funciona sem voz).
- Volume alto de chamadas no mesmo dia.
- Regras do Firestore: `firestore.rules` ganhou um rascunho para `atendimentos` (faltava desde a Etapa 2), `chamadas`, `triagens` e `consultas`. Não foi testado no emulador e as regras seguem sem publicar (ver pendências).

Pendências acumuladas das Etapas 1, 2 e 3: [pendencias.md](pendencias.md).
