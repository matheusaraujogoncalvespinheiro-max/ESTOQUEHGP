# Assistência hospitalar: leitos, internação, prontuário digital, exames, autorizações e transporte (NIR)

Módulos: **Assistência** (Mapa de Ocupação, Internações, Prontuário Eletrônico Digital, Gestão de Transporte NIR) e **Exames** (Imagenologia, Ultrassonografia, Autorizações).
Cadastro: **Cadastro › Assistência › Tipos de Exame** (lista configurável). Regras em `services/hospital.js`, dados e seed em `services/db-hospital.js`, telas em `pages/hospital/` (`mapa.js`, `prontuario.js`, `exames.js`, `transporte.js`).

## Estrutura única de localização

A Portaria já usava Andar → Ala → Quarto → Leito, mas gerada por código (`getLeitoSpecialty`), não cadastrada. Essa mesma regra agora é montada uma vez
em `services/estrutura-hospitalar.js` (344 leitos: 1º andar até o quarto 25; 2º ao 4º até o 49; finais A e B; id `205B`) e é consultada por Portaria,
Internação, Prontuário e Mapa. Não existe segundo cadastro. O que muda (ocupado, livre, higienização, bloqueado) fica em `leitos_estado`.

## Leitos e internações

- Internar exige leito **livre** e paciente **sem internação ativa**; as duas conferências são feitas numa transação no banco, então internações simultâneas não duplicam o leito.
- **Alta** encerra a internação e coloca o leito em **higienização**; só "Concluir higienização" o libera (registra quem e quando). Leito em higienização ou bloqueado não recebe paciente.
- **Bloqueio** exige motivo e guarda o responsável. Todo evento fica no histórico do leito (`historico_alteracoes`).
- Nova internação nunca sobrescreve as anteriores; o prontuário lista todas.
- O mapa atualiza em tempo real (Firestore) e mostra indicadores e taxa de ocupação. Portaria e Higienização veem "Ocupado", sem o nome do paciente.

## Prontuário

Registros de **evolução, prescrição, diagnóstico (CID-10)** e **resultado** são assinados (autor, perfil, data e hora) e **só acrescentam**: não há edição nem exclusão;
correções entram como **complemento** ligado ao original. O CID-10 é validado só no formato (ex.: I10, J18.9); não há lista embutida.
O administrador tem acesso a todas as telas e operações, inclusive aos atos clínicos; cada registro fica assinado com o nome de quem o fez.

## Exames

Fluxo: Solicitado → Aguardando triagem → Em avaliação → Aguardando agendamento → Agendado → Em atendimento → Realizado, mais Cancelado, Reagendamento necessário e Pendente de autorização.
Só as passagens previstas são aceitas (`TRANSICOES_EXAME`). Realizado exige o exame "Em atendimento", confirmação explícita e o profissional responsável.
Prioridade (Urgente/Eletivo) é informada e justificada por quem solicita; só médico/administrador altera, com justificativa e histórico. A fila ordena (urgentes primeiro, depois a mais antiga) sem mudar a prioridade.
Vagas têm capacidade; reservar/devolver é atômico. Imagenologia e Ultrassonografia têm filas, vagas e perfis separados.
O formulário (Imprimir / PDF) segue as seções do modelo de Laudo para Solicitação/Autorização de Procedimento Ambulatorial; os dados do paciente vêm do cadastro e são conferidos antes da emissão.

## Autorizações

A autorização só vale com **número da APAC, data da autorização e validade**; vence automaticamente depois do fim da validade; negada fica registrada com motivo.
Exame que exige autorização fica **Pendente de autorização**, não agenda sem APAC aprovada e vigente, e a data do agendamento não pode passar da validade.
Aprovar libera para a fila do setor, mas **nunca agenda nem aprova sozinho**. Alterações ficam no histórico.

## Perfis novos

Médico(a), Funcionário Imagenologia, Funcionário Ultrassonografia, Autorizador (Regulação) e Funcionário Higienização; Enfermagem e Recepção ganharam acesso a leitos/internação.

## Pontos que dependem de validação institucional

- Quais tipos de exame **exigem autorização** (o padrão: TC, RNM e Biópsia exigem; Ultrassonografia não) e os **códigos de procedimento** (ficam em branco: informar conforme a tabela oficial).
- Campos, limite de 5 procedimentos secundários e perfis de acesso.
- **CNES** do estabelecimento (configurar em Exames › Autorizações).

## Limitações conhecidas

- **Segurança no Firebase:** o sistema autentica pelo próprio cadastro de usuários (não pelo Firebase Auth), então as regras do Firestore não conseguem distinguir quem lê ou escreve. As permissões são aplicadas pelo aplicativo. Para proteger de verdade os dados clínicos é preciso migrar o login para Firebase Auth e publicar regras (leitura por perfil, `registros_clinicos` somente com criação, sem update/delete). O mesmo vale para as senhas, hoje em texto no `app_users`.
- A imutabilidade do prontuário é garantida pelo aplicativo (não existe função de editar/excluir); só as regras do Firestore a tornariam inviolável.
- Já incluídos depois: transferência de leito, prescrição por item, relatórios (Assistência, Estoque, OPME, Auditoria, Eventos/NSP), paciente provisório, senhas com hash, backup completo. Detalhes de segurança: `docs/seguranca-firebase.md`.
- Não implementado: integração com sistemas oficiais de regulação/faturamento (SUS, e-SUS, HL7/FHIR) e migração para Firebase Auth.
