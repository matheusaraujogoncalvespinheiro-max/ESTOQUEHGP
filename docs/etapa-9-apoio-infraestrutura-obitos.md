# Etapa 9 — patrimônio, manutenção, transporte, voluntariado, rouparia, resíduos e óbitos (relatório)

Escopo combinado: login e usuários seguem como estão (ver [pendencias.md](pendencias.md)).
Esta etapa cobre os módulos de apoio e infraestrutura da auditoria (3.19, 3.20, 3.21, 3.23, 3.25, 3.26) e a **gestão de óbitos** (3.27, com sigilo), além do **tipo de alta** (pendência 38).

Regras que valem para tudo: registros só acrescentam (nada é apagado; erro vira anulação ou cancelamento com motivo), cada documento guarda quem fez e quando, e nenhuma lista de apoio (peças, grupos de resíduo, áreas, destinos) é protocolo do hospital: são **listas de apoio a confirmar** (pendência 67). Não há prazo de atendimento, periodicidade nem cota definidos pelo hospital: os tempos mostrados são só informativos.

## O que foi implementado

### 1. Manutenção (Apoio › Chamados de Manutenção)
- Qualquer perfil abre um chamado (corretiva de equipamento ou infraestrutura predial); preventiva e calibração são da manutenção.
- Caminho: Aberta → Em atendimento → Aguardando peça → Concluída (ou Cancelada, com motivo). A conclusão exige solução aplicada e data e hora.
- Cartões de resumo, filtros por período, situação, tipo e prioridade, busca; equipamento parado marcado no chamado.

### 2. Patrimônio e engenharia clínica (Apoio › Patrimônio e Equipamentos)
- Lista os equipamentos do cadastro com a **situação derivada das OS abertas** (o cadastro não é alterado).
- **Planos** de manutenção preventiva e calibração por equipamento (periodicidade, próxima data), com situação em dia, a vencer ou vencido; gerar a OS do plano, ajustar, inativar e reativar. Histórico por equipamento.

### 3. Transporte (Apoio › Transporte e Logística)
- Solicitação de transporte de paciente (interno ou para outro serviço) ou de material, com meio, origem, destino e avisos (acompanhamento, isolamento, oxigênio). Transporte de paciente só por perfis assistenciais.
- Caminho: Solicitado → Aceito → Em transporte → Concluído (ou Cancelado). Tempos até aceitar e em transporte registrados.

### 4. Rouparia (Apoio › Lavanderia e Rouparia)
- Livro de coleta de roupa suja, entrega de roupa limpa e baixas (motivo obrigatório), por setor e peça, com peso opcional. Resumo coletado × entregue. Lançamento errado é **anulado** por novo registro com motivo.

### 5. Resíduos (Apoio › Resíduos)
- Pesagens por grupo (A a E, lista de apoio), setor gerador, destino e nº do manifesto. Resumo por grupo e por setor. Anulação com motivo.

### 6. Voluntariado (Apoio › Voluntariado)
- Cadastro de voluntários (área, termo de adesão com a data de assinatura), inativar e reativar, **entrada e saída** (uma presença aberta por vez, travada no banco) e horas por voluntário no período.

### 7. Óbitos (Assistência › Óbitos) — sigiloso
- O **médico** registra o óbito (local, data e hora, registro no conselho, CID-10 opcional, nº da Declaração de Óbito opcional). Com internação, o registro é **uma transação**: encerra a internação (tipo de alta "Óbito"), coloca o leito em higienização e **impede nova internação** do paciente.
- A enfermagem e o médico acompanham: **comunicação à família** e **liberação do corpo** (destino e quem recebeu). O nº da DO pode ser informado depois; **retificar exige motivo** e fica no histórico.
- A lista é lida **sob demanda** (sem ouvinte em tempo real), cada leitura e cada abertura de registro grava o acesso, e o nome do paciente só aparece para quem já pode vê-lo.
- A DO é emitida fora do sistema: aqui só se guarda o número. O sistema não decide quando o caso vai ao IML ou ao SVO.

### 8. Tipo de alta (pendência 38)
- A alta passou a exigir o **tipo** (melhorada, curado, a pedido, transferência para outro serviço, evasão, outro). Transferência pede o serviço de destino; a pedido, evasão e outro pedem observação. Óbito não é alta: só pela tela Óbitos. O tipo aparece no detalhe da internação e no relatório de internações.

### 9. Relatórios (Relatórios › Apoio e infraestrutura)
- Manutenção e equipamentos, Transporte (sem nome de paciente), Rouparia, Resíduos e Voluntariado, com impressão e CSV. O relatório de internações passou a contar as saídas por tipo.

## Perfis novos
`FUNC_MANUTENCAO`, `FUNC_TRANSPORTE`, `FUNC_LAVANDERIA`, `FUNC_VOLUNTARIADO`. Higienização ganhou rouparia e resíduos; a Portaria registra presença de voluntários; Médico e Enfermagem acompanham óbitos. Matriz conferida no navegador.

## Testes e verificação
- `npm test`: **235 aprovados, 0 falhas** (27 testes novos da Etapa 9 em `tests/apoio.test.js` e `tests/apoio-registros.test.js`).
- Navegador (banco simulado, nunca o real): varredura de layout das 13 telas e relatórios em 320, 390, 768, 1024 e 1366 px e de 15 janelas a 390 px, sem erros de console. Dois problemas achados e corrigidos (tabelas largas de rouparia e resíduos estouravam a 1024 px; etiqueta do grupo vazava a 320 px).
- Regras do Firestore: rascunho em `firestore.rules`, **não testado no emulador**.

## Pendências desta etapa
Ver os itens 65 a 71 de [pendencias.md](pendencias.md).
