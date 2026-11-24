# Etapa 4 — prontuário completo e exames com resultado (relatório)

Escopo combinado: login e usuários seguem como estão (ver [pendencias.md](pendencias.md)).
Esta etapa fecha o caminho do paciente que sai da consulta da [Etapa 3](etapa-3-triagem-atendimento.md): ele é encaminhado para exames, o exame é realizado, o resultado volta assinado ao prontuário, o médico reavalia e entrega os documentos ao paciente.

Fora desta etapa, de propósito: **laboratório** (coleta, amostras, valores de referência) e **assinatura digital ICP-Brasil**. Nenhum dos dois tem base no que o hospital já informou (ver pendências).

## O que foi implementado

### 1. Atendimento de Exames (Exames › Atendimento de Exames)
A fila **Exames** recebia pacientes do desfecho médico, mas não tinha tela (pendência 9 das etapas anteriores).
- Fila do dia com resumo (aguardando, chamados, em atendimento, maior espera) e **local de atendimento** (cadastrado em Cadastro › Assistência › Locais de Atendimento, fila Exames).
- Mesma mecânica da triagem e da fila médica: chamar próximo, chamar, repetir, **não compareceu**, **devolver** à fila com motivo, reabrir, iniciar atendimento. Chamar fora da ordem exige motivo. O painel de chamadas passa a anunciar a fila Exames.
- **Janela do atendimento**: dados do paciente, lista dos exames dele com o botão "Abrir exame" (central do exame) e o encerramento:
  - *Atendimento de exames concluído* (exige observação se ainda houver exame em aberto);
  - *Devolver ao médico (reavaliação)*: o atendimento volta para a fila médica **mantendo o nível de risco**, com a marca "Volta dos exames" e o motivo obrigatório.
- Só quem assumiu o atendimento (ou o administrador) encerra.

### 2. Resultado e laudo do exame (central do exame)
- O exame só vira **Realizado** com confirmação e o profissional que atendeu (o campo de resultado saiu daí).
- **Registrar resultado / laudo**: texto, registro no conselho de quem assina e, se for o caso, a marcação de **resultado crítico** com **quem foi comunicado**. O sistema **não interpreta o resultado nem decide o que é crítico**: a marcação é de quem assina.
- O laudo vai para o **prontuário do paciente** como registro assinado do tipo Resultado (com ou sem internação), ligado à solicitação, ao atendimento e ao nome do exame. Grava na mesma transação que marca a solicitação; dois laudos ao mesmo tempo não passam, e só existe **um laudo por exame**.
- Correção = **complemento** assinado, ligado ao original. O original nunca muda.
- A central mostra os indicadores **Realizados sem laudo** e **Resultados críticos** e um selo em cada exame.

### 3. Prontuário
- **Faixa de alertas** no topo: alergias registradas, aviso quando nenhuma foi registrada (sem afirmar que o paciente não tem alergia) e resultados críticos.
- Abas novas: **Atendimentos** (cada chegada com triagem, consulta, desfecho, exames e documentos), **Alergias** (agente, reação, gravidade) e **Documentos**.
- **Complementar** qualquer registro assinado, também fora de internação (resolvido o item 22). O complemento herda paciente, internação e atendimento do original.
- Tabelas do prontuário passaram para o padrão responsivo (rolagem lateral nunca; cartões no celular).
- **Imprimir prontuário** agora inclui alergias, atendimentos e documentos emitidos.

### 4. Documentos para o paciente
Receita, atestado, encaminhamento e **declaração de comparecimento**, emitidos pela janela da consulta, pelo prontuário (aba Documentos) e pela Recepção (só a declaração).
- Cada documento é **numerado** (`DOC-AAAAMMDD-XXXX`), guardado com o texto final exatamente como foi impresso e **nunca alterado nem apagado**; emitir entra na auditoria.
- **O conteúdo é de quem emite**: o sistema não sugere diagnóstico, medicamento, dose nem dias de afastamento. Na consulta a receita já vem preenchida com a prescrição que o médico digitou, para conferir e editar.
- Atestado: dias de 1 a 365, data de início válida e **CID só com autorização do paciente** (caixa marcada). Declaração: data não futura, horas no formato HH:MM, quem comparece (paciente ou acompanhante) e finalidade; **não leva dado clínico**.
- Receita, atestado e encaminhamento exigem o CRM de quem assina (lembrado por usuário no navegador); a declaração não.
- Impressão A4 com cabeçalho do estabelecimento, dados do paciente, texto, linha de assinatura e rodapé com o número. **Não substitui receituário de medicamentos controlados.**

### 5. Cadastro › Paciente
Nova aba **Atendimentos** (só aparece depois que o paciente está salvo): histórico das chegadas com senha, tipo, fila e situação, mais os registros antigos da Recepção (resolvido o item 10).

### 6. Consulta que volta dos exames
Quando o paciente volta para a fila médica, a nova consulta **não apaga a anterior**: a anterior fica em `historico_consultas` e os registros assinados das duas consultas continuam no prontuário.

## Permissões novas
| Ação | Perfis |
|---|---|
| `atendimento_exames` (chamar, atender e encerrar na fila Exames) | Funcionário Imagenologia, Funcionário Ultrassom, Administrador |
| `documento_emitir` (receita, atestado, encaminhamento) | Médico, Administrador |
| `documento_comparecimento` | Médico, Recepção, Administrador |
| `painel_chamada` | passa a incluir Imagenologia e Ultrassom |
| `exame_resultado` (registrar e complementar laudo) | já existia: Imagenologia, Ultrassom, Administrador |

O local de atendimento (cadastro) passa a ser visível para Imagenologia e Ultrassom. Todas as regras também são conferidas nos serviços, não só na tela.

## O que o sistema NÃO faz (de propósito)
- Não interpreta resultado, não define o que é crítico, não sugere conduta, medicamento, dose ou dias de afastamento.
- Não tem laboratório: sem coleta, amostra, valores de referência nem validação de resultado (depende do catálogo do hospital).
- Não assina digitalmente: o documento é numerado, guardado e impresso para **assinatura e carimbo do profissional**.
- Não notifica sozinho o médico solicitante de um resultado crítico: registra **quem foi comunicado** e destaca o alerta no prontuário.

## Correções feitas no caminho
- `registrarRealizacao` aceitava um campo `resultado` e o ignorava em silêncio; removido (o resultado tem fluxo próprio).
- A janela do exame, reaberta logo depois de assinar o laudo, mostrava o estado anterior (o dado só chegava depois do listener). Agora a cópia local da solicitação é atualizada ao gravar, com teste de regressão.
- Cartões de resumo (`rf-kpis`): o último esticava sozinho na linha e ficava com altura diferente; agora todos têm o mesmo tamanho e altura em qualquer largura.
- Topo do prontuário no celular: os botões estouravam a tela (320 e 390 px); agora ocupam a mesma largura, um por linha.
- Pré-visualização do documento: o texto encostava na borda (a margem só valia na impressão); ganhou respiro na tela.
- Botões com `flex:none` inline, que impediam a quebra de linha no celular, foram retirados dos pontos tocados no prontuário.

## Testes
83 testes passam (18 novos em `tests/prontuario.test.js`): alergia, contexto do registro (internação, complemento herda do original, complemento de complemento recusado), complemento fora de internação, laudo (validações, crítico exige quem foi comunicado, uma vez só, só o setor do exame, só depois de realizado, complemento ligado ao original, nada gravado quando recusado), contagem de sem laudo e críticos, cópia local da solicitação, documentos (validações, texto impresso só com o que foi digitado, CID só autorizado, numeração, recepção só a declaração, sem CRM não assina), fila de exames (permissões, concluir, devolver mantendo o risco, só quem atende encerra) e a consulta que volta dos exames.
No navegador, com Firestore simulado: cadastro do local pela tela, médico solicitando exame e encaminhando, exame até Realizado, fila de Exames (chamar, iniciar, janela, validação do motivo, devolver), laudo crítico (barra sem "quem foi comunicado"; depois assina e a janela mostra o laudo e o botão Complementar), complemento, prontuário (alertas, abas Atendimentos, Exames, Documentos, Alergias e Evoluções), emissão e pré-visualização de atestado, declaração pela Recepção, aba Atendimentos do cadastro (só com paciente salvo) e fila médica com "Volta dos exames". Varredura automática de layout em 320, 390, 768, 1024 e 1366 px nas telas e janelas novas (19 telas/janelas, sem estouro, corte ou botões de tamanhos diferentes; as 2 marcações de "alturas diferentes" em 320 px, nos formulários de receita e de declaração, são coincidência de coordenada entre campo e botão de linhas diferentes; a da declaração foi conferida no desenho, a da receita é do mesmo tipo e não foi conferida visualmente).

## Não verificado
- Impressão real (impressora, papel A4, "Salvar como PDF") dos documentos.
- Transações do laudo e do encerramento no Firestore real (testadas só no banco simulado).
- Regras do Firestore: `firestore.rules` ganhou rascunho para o laudo pelo setor de imagem, `documentos_clinicos`, e leitura/alteração de `atendimentos` e `chamadas` pela imagem (só fila Exames). **Não testado no emulador** e segue sem publicar.
- Uso com dados e volume reais do hospital.

## Descoberto, fora desta etapa
Ao verificar no navegador apareceu um erro antigo: ao gerar notificação de estoque baixo, `db_saveNotification` envia `is_read: undefined` (o objeto usa `read`), então o Firestore recusa e a notificação não é gravada. Não foi alterado (é do módulo de estoque, Etapa 7); está em [pendencias.md](pendencias.md).

Pendências acumuladas das Etapas 1, 2, 3 e 4: [pendencias.md](pendencias.md).
