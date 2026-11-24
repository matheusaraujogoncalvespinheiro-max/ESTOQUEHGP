# Etapa 7 — farmácia, produtos, estoque e OPME (relatório)

Escopo combinado: login e usuários seguem como estão (ver [pendencias.md](pendencias.md)).
O estoque do sistema nasceu com OPME, Hemodinâmica e Centro Cirúrgico (lotes, FEFO, bloqueio de lote vencido, saídas, devoluções, perdas, transferências, consignado, cancelamento com estorno; ver [operacoes.md](operacoes.md)). Esta etapa **não refez isso**: acrescentou a **Farmácia** como quarto estoque, ligou a **prescrição médica** à **dispensação** e fechou a **rastreabilidade** do estoque até o paciente.

## O que foi implementado

### 1. Perfis e estoque da Farmácia
- Dois perfis novos: **Chefe Farmácia** (cadastra produtos, dispensa, dá baixa e cancela dispensação) e **Funcionário Farmácia** (dispensa, registra saída, devolução e perda e acompanha as requisições). Ambos movimentam **só o estoque FARMACIA**.
- O estoque da Farmácia **só aparece** para a Farmácia e para o Administrador: listas, saídas, relatórios, filtros e opções de produto dos demais perfis não o mostram (e a Farmácia não vê OPME, Hemodinâmica nem Centro Cirúrgico).
- A Farmácia não tem o histórico geral de estoque nem o consignado (são do OPME).
- Menu **Farmácia**: Prescrições para a Farmácia, Dispensações, Requisições, Estoque da Farmácia e Rastreabilidade. A tela inicial da Farmácia é a das prescrições.
- Na lista do Estoque da Farmácia **não existem** os botões antigos "+ / −" nem "remover lote": a quantidade só muda por operação com rastro (dispensação, saída, devolução, perda); a trava também está nos serviços.

### 2. Cadastro de produto: aba Medicamento
- A aba aparece quando a categoria é *Medicamento* ou o setor é *Farmácia*. Campos: **princípio ativo (obrigatório)**, nome genérico, concentração, forma farmacêutica, via habitual, registro ANVISA, **controle especial** (com lista/classificação), alto risco, conservação e observações.
- O produto de **controle especial** é o que exige o número da receita na dispensação. A lista de produtos mostra o tipo (Medicamento/OPME/Comum) e se é controlado.
- A aba Movimentação do produto mostra **Dispensação** e **Estorno de dispensação** com o saldo.

### 3. Prescrições para a Farmácia (Farmácia › Prescrições para a Farmácia)
- Lista cada **item de medicamento prescrito** a pacientes com **internação ativa** (prescrições de internação encerrada e complementos não entram), com paciente, leito, prontuário, prescritor e a situação **Sem dispensação / Dispensado**.
- Cartões de resumo (itens prescritos, sem dispensação, já dispensados, pacientes com pendência, dispensações de hoje) e filtros por situação, unidade e busca (paciente, prontuário, leito, medicamento).
- **Dispensar** abre o cadastro de dispensação já com o item, o produto (quando só existe um com aquele nome ou princípio ativo na Farmácia) e o **lote que vence primeiro** (FEFO). **Histórico** mostra as dispensações do item (ativas e canceladas).
- "Dispensado" significa **ao menos uma dispensação ativa** do item. O ciclo (por dose, dia ou kit) é do hospital e não foi parametrizado (pendência 43).

### 4. Dispensação (Farmácia › Dispensações) — registro imutável `DSP-0000`
- Campos: item prescrito, produto (só do estoque da Farmácia), lote, quantidade, número da receita (controle especial) e "conferido por" (opcional, segundo profissional).
- Validações: item de prescrição existente, **internação ainda ativa**, produto da Farmácia e ativo, lote escolhido e **não vencido**, quantidade inteira dentro do **saldo do lote**, permissão do perfil e **receita obrigatória** em controle especial.
- Ao salvar: **baixa do lote escolhido**, registro no histórico do produto (ação *Dispensação*, setor, quantidade, lote, quem fez; **sem nome de paciente** nesse histórico), e a dispensação guarda paciente, prontuário, leito, prescritor, item prescrito, produto, lote, controle e quem dispensou.
- **Nunca se edita nem se apaga**: erro é corrigido com **cancelamento** (Movimentações › Cancelamento de Operação, só Administrador e Chefe Farmácia, motivo obrigatório), que **devolve o saldo ao lote**, marca a dispensação como *Cancelada*, registra *Estorno de dispensação* e grava a auditoria. O item volta a ficar "sem dispensação".

### 5. Requisição à Farmácia (Farmácia › Requisições) — `REQ-0000`
- Pedido de medicamentos e materiais por unidade assistencial (ala), com prioridade (Rotina, Urgente), itens (descrição, quantidade inteira, observação) e situação: Solicitada, Em separação, Atendida, Atendida em parte, Cancelada.
- A Enfermagem **cria**; só a Farmácia **muda a situação** (toda requisição nova começa "Solicitada"). A requisição **não mexe no estoque**: a saída ou a dispensação correspondente é registrada à parte (pendência 47).

### 6. Rastreabilidade (Farmácia › Rastreabilidade e Relatórios › Rastreabilidade por paciente e lote)
- Um só relatório junta **dispensações da Farmácia, saídas de estoque para paciente e uso de OPME em laudos**, com data, origem, paciente, prontuário, produto, lote, quantidade, responsável e situação. Pesquise pelo **paciente** ou pelo **lote** para ver o caminho completo.
- Cancelamentos continuam na lista, marcados como *Cancelada*, e **não entram** nos totais (registros, pacientes, lotes e unidades).
- Cada perfil só vê os setores a que tem acesso (a Farmácia vê só as suas dispensações; OPME e Hemodinâmica veem saídas e laudos dos seus setores).

### 7. Integração com a enfermagem
- Na janela de **checagem de medicação** (Etapa 6) aparece a linha **Farmácia**: "Dispensado pela farmácia: N un (última em …)" ou "Sem dispensação registrada no sistema para este item". É **só informativa**: não impede o registro da administração.

### 8. Outras telas
- Curva ABC, Reposição e Validade dos lotes passaram a incluir o Chefe Farmácia (só com os produtos da Farmácia). Início e Transferência não aparecem para os perfis da Farmácia.
- Dashboard e notificações de estoque baixo agora contam **cada produto uma vez** e incluem o Centro Cirúrgico (a lista antiga repetia o OPME e esquecia o Centro Cirúrgico): os números mudam.

## Permissões
| Ação | Perfis |
|---|---|
| `farmacia_ver`, `farmacia_dispensar` | Administrador, Chefe Farmácia, Funcionário Farmácia |
| `farmacia_gerenciar` | Administrador e Chefe Farmácia |
| `farmacia_requisicao` (criar requisição) | Farmácia e Enfermagem |
| Cadastrar produto da Farmácia | Administrador e Chefe Farmácia |
| Cancelar dispensação | Administrador e Chefe Farmácia |
| Atualizar estoque, transferir e dar saída/devolução/perda | Farmácia, só no estoque FARMACIA |

Todas as regras também são conferidas nos serviços (`services/farmacia.js`, `services/operacoes.js`), não só na tela.

## O que o sistema NÃO faz (de propósito)
- Não decide **ciclo de dispensação**, quantidade por dose nem kit: a quantidade é a que o farmacêutico informa.
- Não cruza **alergia × medicamento** nem interações medicamentosas.
- Não define a **lista de medicamentos controlados** nem o controle legal (livro, notificação, conferência): marca por produto e exige o número da receita; o resto depende do responsável técnico da Farmácia.
- Não distingue farmacêutico de auxiliar (o perfil é um só por nível) nem exige dupla conferência (o campo "conferido por" é opcional).
- Não liga a **checagem de enfermagem ao lote** dispensado nem registra devolução de sobra.

## Correções feitas no caminho
- Funcionário Farmácia não via Saídas, Devoluções e Perdas e as listas genéricas mostravam registros de outros setores: criado o grupo de movimentações da Farmácia e o filtro de linhas por setor visível.
- A lista de estoque dava ao funcionário da Farmácia botões de ajuste direto sem histórico: removidos para o setor Farmácia (e bloqueados nos serviços).
- Dashboard e notificações: lista de produtos duplicada e sem Centro Cirúrgico (ver item 8). O texto do lote desabilitado ("Selecione o produto primeiro") era cortado em 320 px e foi encurtado para "Escolha o produto antes".
- O filtro de setor, o cadastro de produtos e o seletor de produto passaram a respeitar os setores que o perfil enxerga.

## Testes
134 testes passam (13 novos em `tests/farmacia.test.js`, mais a coerência das novas definições em `tests/cadastros.test.js`). Cobrem: permissões e visibilidade do estoque por perfil, listas filtradas por setor, aba Medicamento e produto controlado, itens a dispensar (internação ativa, complemento, situação, cancelada não conta), sugestão de produto, validação da dispensação (item, internação, setor, lote vencido, saldo, produto inativo, permissão), receita em controle especial, **baixa do lote escolhido e histórico sem nome de paciente**, **cancelamento com estorno** e permissão, definições (imutável, perfis, cancelamento), requisição (itens, quantidade, situação) e relatório de rastreabilidade (origens, período, busca, setor, cancelada).
No navegador, com Firestore simulado (nunca o real): lista de prescrições e filtros; **Dispensar** a partir da prescrição (produto e lote FEFO preenchidos, baixa de 40 para 37 un, histórico "Dispensação DSP-0001", item como dispensado); receita de controle especial; cancelamento com estorno; requisição criada pela Enfermagem e situação alterada pela Farmácia; produto com aba Medicamento (sem princípio ativo **não grava**; completo grava com controle especial e aparece como Medicamento controlado); relatório de rastreabilidade com a dispensação; linha "Farmácia" na checagem, com e sem dispensação; lista de estoque sem botões de ajuste e com a trava nos serviços; dashboard e notificações sem duplicidade. Varredura automática de layout das **12 telas e janelas** da etapa em 320, 390, 768, 1024 e 1366 px: a primeira rodada apontou o texto do lote cortado em 320 px e um botão de 24 px (ícone de remover lote) na lista antiga de Estoque; os dois foram corrigidos e a varredura repetida deu **12 de 12 sem apontamentos nas cinco larguras**. Não rodada em 1920 px.

## Não verificado
- **Transações no Firestore real**: a baixa do lote na dispensação **não é transação** (segue o padrão das saídas e perdas que já existiam): dois usuários baixando o mesmo lote ao mesmo tempo podem usar um saldo desatualizado. Vale para todos os setores de estoque (pendência 49).
- **Regras do Firestore** de `cad_dispensacao`, `cad_requisicao`, `cad_cancelamento` e da leitura de prescrições e internações pela Farmácia: rascunho no arquivo, **não testado no emulador** e sem publicar. O rascunho também deixa claro que as demais coleções `cad_*` só aceitam gravação do Chefe OPME, o que bloquearia movimentações de outros perfis (pendência 2).
- Uso com dados reais: o estoque da Farmácia começa **vazio** e os medicamentos precisam ser cadastrados e recebidos pelo hospital; a ligação "item prescrito (texto livre) → produto" é por nome ou princípio ativo e só foi testada com nomes fictícios.
- Índices do Firestore das consultas por `tipo == PRESCRICAO` e por internações ativas (o console avisa e gera o link se faltarem).
- A mensagem "snapshot.forEach is not a function" no console vinha do banco simulado de teste (observador de salas), não do aplicativo.

Pendências acumuladas das Etapas 1 a 7: [pendencias.md](pendencias.md).
