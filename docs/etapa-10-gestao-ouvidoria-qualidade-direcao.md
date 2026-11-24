# Etapa 10 — painel da direção, ouvidoria, qualidade e ensino e pesquisa (relatório)

Escopo combinado: login e usuários seguem como estão (ver [pendencias.md](pendencias.md)).
Esta etapa fecha o plano da auditoria com a camada de **gestão**: ouvidoria (3.29), documentos e qualidade (3.31), ensino e pesquisa (3.28) e painel da direção (3.32), e fecha a pendência 11 (relatório de atendimentos e indicadores da direção).

Regras que valem para tudo: registros só acrescentam (nada é apagado; erro vira cancelamento, arquivamento, reprogramação ou nova versão **com motivo**), cada documento guarda quem fez e quando, e **nenhum prazo, meta ou periodicidade é inventado**: o que depende do hospital é campo digitado pela equipe e aparece só como informação. As listas (origem da não conformidade, tipo de documento, canal da ouvidoria, tipo de atividade de ensino) são **listas de apoio a confirmar** (pendência 73).

## O que foi implementado

### 1. Painel da Direção (Gestão › Painel da Direção)
- Indicadores do período escolhido (padrão: últimos 30 dias) em cartões do mesmo tamanho: número grande e, **abaixo, o critério de contagem** de cada um (fonte, o que entra e o que não entra).
- Atendimentos (total, concluídos, não compareceram, cancelados, retornos, **espera média até a chamada** e **tempo médio até a conclusão**, lidos do histórico de situação), internação e leitos (admissões, saídas, saídas por óbito, permanência média, internados e ocupação agora), manutenção, ouvidoria, qualidade, ensino e pesquisa.
- Detalhe de atendimentos por fila, tipo, situação e classificação de risco.
- Atendimentos são lidos do banco **sob demanda** (até 5.000 no período, com aviso se passar disso); o restante reaproveita o que o sistema já mantém em memória.
- Sem nome de paciente, sem meta, sem semáforo, sem custo. Saída por óbito conta só as internações encerradas com tipo "Óbito"; o óbito fora da internação fica na tela Óbitos (sigilosa).

### 2. Ouvidoria (Gestão › Ouvidoria)
- A equipe registra a manifestação (reclamação, sugestão, elogio, denúncia, solicitação, pedido de informação) por qualquer canal, com protocolo `OV00001`.
- Caminho: Recebida → Em análise → Respondida → Concluída (ou Arquivada, com motivo, antes da resposta; ou Reaberta, com motivo, depois de respondida). **Encaminhamentos** ao setor e **respostas** só acrescentam.
- Manifestação **anônima** não guarda nome nem contato; a identificada pode pedir **sigilo**. A **identidade só aparece para a ouvidoria**: a Direção vê a lista e os números sem o nome, e cada abertura de manifestação grava o acesso.
- Prazo de resposta é **opcional e digitado**; "Vencido" aparece quando passou e ainda não houve resposta. Não é prazo legal.

### 3. Qualidade (Gestão › Qualidade)
- **Não conformidades** (`NC00001`): origem, setor, descrição, causa, data da detecção. Aberta → Em tratamento → Concluída (exige a **verificação do resultado** e nenhuma ação aberta ligada) ou Cancelada (motivo).
- **Planos de ação** (`AC00001`): o que, quem, até quando (prazo digitado, não anterior a hoje), com ou sem não conformidade. Pendente → Em andamento → Concluída (resultado) ou Cancelada. **Reprogramar** guarda o prazo antigo com motivo. "Atrasada" é derivada do prazo.
- **Documentos versionados** (POP, protocolo, política, norma, formulário): o **código é único**; cada versão traz o que mudou, quem aprovou, a data e onde está o arquivo. A versão nova **não apaga a anterior**; o documento obsoleto (com motivo) continua consultável; revisão vencida é sinalizada.

### 4. Ensino e Pesquisa (Gestão › Ensino e Pesquisa)
- Estágios, treinamentos, aulas, visitas técnicas e projetos de pesquisa (`EP00001`), com responsável, setor, período e **número** de participantes. Planejado → Em andamento → Concluído (resultado) ou Cancelado (motivo).
- Projeto de pesquisa guarda o nº do parecer do comitê de ética (digitado). Sem ele, a tela **só avisa**: não impede nem valida.
- **Não** lista nomes de participantes nem guarda dados de pesquisa.

### 5. Relatórios (Relatórios › Gestão)
- Ouvidoria (sem identidade), Qualidade e Ensino e pesquisa, com impressão e CSV.

## Perfis novos
`FUNC_OUVIDORIA`, `FUNC_QUALIDADE`, `FUNC_ENSINO` e `DIRETORIA` (só consulta: painel, qualidade, ensino e lista da ouvidoria sem identidade). Matriz conferida no navegador.

## Testes e verificação
- `npm test`: **244 aprovados, 0 falhas** (9 testes novos em `tests/gestao.test.js`: validações, fluxos, passos fora de ordem, conclusão bloqueada por ação aberta, código único, versões, indicadores e ausência de nome nos relatórios).
- Navegador (banco simulado, nunca o real): varredura de layout das telas e relatórios novos em 320, 390, 768, 1024 e 1366 px e de 16 janelas a 320 px, sem erros de console; permissões, identidade escondida da Direção, bloqueio de código repetido e registro pela tela conferidos. Ajuste feito: cartões do painel em 4, 2 ou 1 coluna (nunca 3, para não sobrar cartão sozinho).
- Regras do Firestore: rascunho em `firestore.rules`, **não testado no emulador**.
- Correção de processo: o script de versão do cache (`?v=`) só atualiza os arquivos que recebe; nesta etapa os arquivos alterados das Etapas 9 e 10 foram atualizados, para o navegador não usar versão antiga.

## Pendências desta etapa
Ver os itens 73 a 79 e 80 de [pendencias.md](pendencias.md).
