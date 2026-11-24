# Auditoria da plataforma × levantamento hospitalar (HGP)

Auditoria feita por leitura do código (19 mil linhas de JS, menu, definições de cadastro, serviços e coleções do Firestore), contagem de telas pelo menu e execução dos 36 testes automatizados (todos passam). Os fluxos de estoque, internação, prontuário, exames, compras, cancelamento e relatórios já tinham sido exercitados no navegador em etapas anteriores, com um Firestore simulado. **Esta auditoria em si não rodou cada tela de novo**; onde algo não foi verificado, está dito.

## 1. Diagnóstico geral

- Aplicação de página única (JS global, Tailwind, Firebase Firestore), sem servidor próprio e **sem Firebase Authentication**: o login é conferido no navegador (senha com hash PBKDF2, mas com usuários e senha "1234" de desenvolvimento ainda em `core/state.js`).
- O sistema nasceu como **controle de estoque OPME/Hemodinâmica** e cresceu para portaria, atendimento, cadastros (36 entidades), movimentações, compras, assistência (leitos, internação, prontuário, exames) e relatórios.
- **95 telas folha no menu**; nenhuma "em breve" além dos 4 itens do Fiscal, ocultados a pedido. Não há tela só decorativa conhecida; há, porém, módulos inteiros do levantamento que não existem.
- Dados: tudo grava no Firestore (`MOCK_DATA` é apenas o cache em memória preenchido pelos listeners, não dados fictícios). Coleções: products, product_batches, product_entry_history, stock_transfer_history, material_requests, patients, laudos, salas, salas_history, mapa_schedule, procedimentos_agendados, procedimentos_nao_realizados, portaria_visits, portaria_config, notifications, app_users, historico_alteracoes, leitos_estado, internacoes, prontuarios, exames, autorizacoes, nsp, atendimentos e as `cad_<entidade>` (com `cad_contadores`).

## 2. Resumo executivo (32 módulos do levantamento)

| Situação | Qtde | Módulos |
|---|---|---|
| Implementado e funcional por completo | 0 | nenhum atende 100% do levantamento |
| Implementado parcialmente | 31 | 3.1, 3.2, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 3.14, 3.15, 3.16, 3.17, 3.18, 3.19, 3.20, 3.21, 3.22, 3.23, 3.24, 3.25, 3.26, 3.27, 3.28, 3.29, 3.30, 3.31, 3.32 |
| Existe apenas visualmente | 0 | (nenhum identificado) |
| Não implementado | 0 | nenhum (3.3 e 3.4 estão como parcial na matriz) |
| Necessita correção | 1 (transversal) | autenticação e permissões (seção 5) |
| Depende de validação institucional | 9 | 3.3, 3.4, 3.7, 3.8, 3.15, 3.22, 3.27, 3.30, 3.31 |

## 3. Matriz de conformidade

| Mód. | Funcionalidade | Situação atual | O que falta | Prioridade |
|---|---|---|---|---|
| 3.1 | Cadastros centrais | PARCIAL. Existem paciente, funcionário, fornecedor, fabricante, produto/classe/grupo/subgrupo/unidade/etiqueta, setor, centro de custo, plano de contas, tipos de exame, usuário, empresa. | Especialidades, unidades/quartos/leitos cadastráveis (hoje fixos em `estrutura-hospitalar.js`), equipamentos, serviços, convênios, protocolos; profissional por categoria (médico/enfermeiro/técnico) com registro no conselho. | Alta |
| 3.2 | Recepção e entrada | PARCIAL (Etapa 2 feita). Cadastro, busca, duplicidade, check-in com tipo de atendimento, queixa, senha do dia, fila, encaminhar/cancelar, histórico e retorno. | Itens em [pendencias.md](pendencias.md). A triagem e o painel de chamada vieram na Etapa 3; o agendamento e o check-in da consulta agendada, na Etapa 8. | Média |
| 3.3 | Triagem e classificação de risco | PARCIAL (Etapa 3 feita). Triagem Clínica em Assistência: fila, chamada, sinais vitais, queixa, classificação Manchester pelo classificador, reavaliação e não comparecimento. "Gestão das Triagens" (Portaria) continua sendo a escala das equipes. | Confirmar protocolo, tempos-alvo e quem classifica; alertas de sinais vitais por faixa etária ([pendencias.md](pendencias.md)). | Alta |
| 3.4 | Painel de chamadas e filas | PARCIAL (Etapa 3 feita). Painel para TV com senha e local (sem nome do paciente), histórico, filtro por fila e voz opcional; cadastro de locais de atendimento. O painel da Portaria continua sendo de acesso/visitantes. | Painéis por setor/TV; filas de Procedimentos, Ambulatório e Internação ainda sem tela de chamada (a de Exames veio na Etapa 4, em Exames › Atendimento de Exames). | Média |
| 3.5 | Atendimento médico | PARCIAL (Etapas 3 e 4 feitas). Fila médica por risco, consulta (anamnese, exame físico, CID-10, conduta, prescrição, exames), desfechos (alta, encaminhamento, indicação de internação, evasão), registros assinados no prontuário, **receita, atestado, encaminhamento e declaração impressos**, e retorno dos exames sem perder a consulta anterior. | Receituário de controlados e assinatura digital (dependem do hospital). | Alta |
| 3.6 | Prontuário eletrônico | PARCIAL (Etapa 4 feita). Registros assinados e imutáveis, complemento (também fora de internação), prescrição, **alergias e alertas**, abas de atendimentos, exames e documentos, internações, impressão, auditoria, permissão por ação. | Anexos, registros de enfermagem, medicamentos administrados, restrição de acesso por vínculo com o paciente ([pendencias.md](pendencias.md)). | Alta |
| 3.7 | Exames e diagnóstico | PARCIAL (Etapa 4 feita). Solicitação, fluxo de status, agendamento, realização, pendências, autorizações APAC, imagem/ultrassom, **fila de atendimento de exames, resultado/laudo assinado no prontuário, resultado crítico com quem foi comunicado e complemento**. | Laboratório (coleta, amostras, valores de referência, validação), resultado estruturado, ciência do médico solicitante. | Média |
| 3.8 | Leitos e internações | PARCIAL, é o mais completo. Mapa, internação, transferência, alta, higienização, bloqueio, vagas, tempo de permanência, transações atômicas. | Cadastro editável de leitos, manutenção, isolamento, fila de espera por leito, painel de disponibilidade. **Etapa 5 fez:** fila de leito, painel de disponibilidade, bloqueio por tipo e previsão e travas do cadastro (leito ocupado não inativa). **Resta:** estrutura padrão editável, regras por sexo/idade/especialidade, reserva e tipos de alta (ver [pendencias.md](pendencias.md)). | Média |
| 3.9 | Enfermagem | PARCIAL (Etapa 6 feita). Painel de enfermagem, sinais vitais do internado, aprazamento e checagem de medicação e cuidados (com motivo quando não feito), escala por unidade e turno, passagem de plantão com ciência, evolução de enfermagem, intercorrências e prescrição de cuidados. Ver [etapa-6-enfermagem.md](etapa-6-enfermagem.md). | Balanço hídrico, escalas de risco, processo de enfermagem, dupla checagem; turnos e perfis (enfermeiro × técnico) a confirmar; itens em [pendencias.md](pendencias.md). | Média |
| 3.10 | Farmácia e medicamentos | PARCIAL (Etapa 7 feita). Medicamento no cadastro de produto, estoque da Farmácia (só visível a ela e ao Administrador), perfis Chefe e Funcionário, prescrições a dispensar, dispensação com baixa de lote (FEFO sugerido, lote vencido bloqueado), controle especial com nº da receita, cancelamento com estorno, requisição e rastreabilidade por paciente e lote. Ver [etapa-7-farmacia-estoque.md](etapa-7-farmacia-estoque.md). | Ciclo de dispensação e lista de controlados a definir pelo hospital, devolução de sobra, lote administrado na checagem, alergia × medicamento, requisição gerando saída; itens em [pendencias.md](pendencias.md). | Média |
| 3.11 | Produtos, materiais e estoque | PARCIAL. Lotes, FEFO, validade, bloqueios, saídas, devoluções, perdas, baixas, transferências, requisições, cancelamento com estorno, relatórios; **estoque da Farmácia** e rastreabilidade por paciente e lote (Etapa 7). | Almoxarifados múltiplos, código de barras, inventário (pronto, oculto), aprovação de requisições, baixa de lote em transação. | Média |
| 3.12 | OPME | PARCIAL, é a origem do sistema. Lotes, rastreabilidade, consignado, laudo por paciente. | Autorização formal, custo por procedimento, vínculo direto cirurgia–material. | Média |
| 3.13 | Centro cirúrgico e RPA | PARCIAL (Etapa 8 feita). Agenda, mapa cirúrgico, salas, laudos e, na Etapa 8, **cirurgias marcadas com sala travada, checklist de cirurgia segura em três momentos (entrada, pausa e saída) e RPA com avaliações e alta**. Ver [etapa-8-ambulatorio-cirurgia-uti-hemoterapia.md](etapa-8-ambulatorio-cirurgia-uti-hemoterapia.md). | Modelo de checklist a confirmar com o hospital, registro anestésico, descrição cirúrgica, equipes completas (hoje texto livre), duração e sobreposição de salas, cirurgias no prontuário (itens 54 e 58). | Média |
| 3.14 | UTI | PARCIAL (Etapa 8 feita). Painel da UTI com **balanço hídrico** (lançamento, anulação com motivo, saldo por janela) e **dispositivos invasivos** (inserção, retirada com motivo, dias de uso). | Escalas de gravidade, ventilação, drogas vasoativas, metas, alerta de tempo de dispositivo e leitos de UTI na estrutura (itens 55 e 59). | Baixa |
| 3.15 | Hemoterapia | PARCIAL (Etapa 8 feita). Solicitação pelo médico, reserva e entrega da bolsa pela agência (número único), transfusão com segundo conferente, sinais vitais antes, durante e depois, reação e interrupção. | Compatibilidade ABO/Rh e prova cruzada (o sistema não valida), hemovigilância, estoque da agência e doadores; responsável (hemocentro) a confirmar (itens 57 e 62). | Baixa |
| 3.16 | Nutrição e dietas | PARCIAL (Etapa 8 feita). Prescrição de dieta por internação (uma ativa; a anterior vira "Substituída"), suspensão com motivo, mapa por unidade e leito com impressão. | Lista de dietas a confirmar, avaliação e cálculo nutricional, cruzamento com alergia e jejum, refeições e aceitação (itens 56 e 61). | Baixa |
| 3.17 | Ambulatório | PARCIAL (Etapa 8 feita). Agenda de consultas (marcar, confirmar, remarcar, cancelar, falta) com trava de horário, check-in que gera a senha e entra na fila do Ambulatório, atendimento médico que marca a consulta como realizada, fila de Procedimentos e relatório de faltas. | Grade por profissional, vagas e encaixe, lembretes, fila de espera e integração com a agenda antiga de procedimentos (itens 53 e 60). **Laboratório** ficou de fora (item 29). | Média |
| 3.18 | Compras e fornecedores | PARCIAL. Solicitação, cotação, pedido, recebimento com status encadeado, contratos. Fiscal (NF-e/NFS-e, entrada por XML) existe no código e está oculto. | Comparativo de propostas, alçada de aprovação, lançar entrada movimentando estoque. | Média |
| 3.19 | Patrimônio e engenharia clínica | PARCIAL (Etapa 9). Situação do equipamento derivada das OS, planos de preventiva e calibração com vencimento, histórico. | Baixa patrimonial, garantia, contrato, custo, segurança elétrica (pendência 69). | Baixa |
| 3.20 | Manutenção e infraestrutura | PARCIAL (Etapa 9). Ordens de serviço (corretiva, preventiva, calibração, infraestrutura), fluxo, indicadores e relatório. | Prazos e metas definidos pelo hospital (pendência 66). | Baixa |
| 3.21 | Transporte e logística | PARCIAL (Etapa 9). Solicitação, aceite, transporte e conclusão, tempos e relatório. | Frota, regulação e vínculo com o paciente (pendência 70). | Baixa |
| 3.22 | Visitação e acompanhantes | PARCIAL. Controle de acesso, visitantes, acompanhantes, horários, foto, limites. | Vínculo com situação do paciente, restrições e exceções autorizadas, saída/permanência. Regras a validar. | Média |
| 3.23 | Voluntariado | PARCIAL (Etapa 9). Cadastro, termo, entrada e saída, horas por voluntário. | Escala e avaliação (a definir). | Baixa |
| 3.24 | Segurança patrimonial | PARCIAL, via Portaria. | Prestadores, colaboradores, ocorrências de segurança. | Baixa |
| 3.25 | Lavanderia e rouparia | PARCIAL (Etapa 9). Coleta, entrega e baixas por setor e peça, com anulação. | Estoque e enxoval mínimo (pendências 66 e 67). | Baixa |
| 3.26 | Resíduos | PARCIAL (Etapa 9). Pesagem por grupo e setor, manifesto e anulação. | Conferir grupos com o PGRSS e emitir manifesto (pendência 67). | Baixa |
| 3.27 | Óbitos | PARCIAL (Etapa 9). Registro pelo médico com encerramento da internação, comunicação à família, liberação do corpo, nº da DO, sigilo e acesso auditado. | IML/SVO, bloqueio de agenda, relatório (pendência 68). | Média |
| 3.28 | Ensino e pesquisa | PARCIAL (Etapa 10). Estágios, treinamentos, aulas, visitas e projetos de pesquisa com situação, resultado e aviso de parecer do comitê de ética. | Vagas, frequência, convênios, dados da pesquisa (pendência 78). | Baixa |
| 3.29 | Ouvidoria | PARCIAL (Etapa 10). Protocolo, canal, análise, encaminhamento, resposta, conclusão e arquivamento, anonimato e sigilo da identidade, prazo digitado e relatório. | Prazo legal, plataforma federal, envio da resposta, proteção da identidade nas regras (pendências 74 e 76). | Média |
| 3.30 | Contratos terceirizados | PARCIAL. Há contrato de consignado e cadastro de empresa. | Vigência, fiscalização, indicadores. | Baixa |
| 3.31 | Documentos, protocolos e qualidade | PARCIAL (Etapa 10 acrescentou). Auditoria, NSP, eventos, **não conformidades, planos de ação com reprogramação e documentos com versões**. | Análise de causa, indicadores assistenciais, anexo do documento, assinatura (pendência 77). | Baixa |
| 3.32 | Painel da direção | PARCIAL (Etapa 10 acrescentou). Dashboard e relatórios com dados reais, **Painel da Direção com atendimentos, espera, internação, ocupação, manutenção, ouvidoria, qualidade e ensino, cada indicador com o critério de contagem**. | Metas, custos, comparação com período anterior (pendência 75). | Média |

## 4. Integrações

Existem: paciente (cadastro) → internação → leito → prontuário → exames; compras → recebimento → pedido; saída/devolução/perda/baixa → estoque e histórico; auditoria → relatórios; alta → higienização do leito.

Criadas nas Etapas 2 a 7: recepção → fila → triagem → médico → painel; prescrição → dispensação (baixa do lote) e prescrição → aprazamento → checagem da enfermagem (a checagem só informa se houve dispensação); dispensação, saída para paciente e laudo → rastreabilidade por paciente e lote.

Ausentes: checagem → lote administrado; exame validado → resultado no prontuário (existe parcialmente); utilização de material em cirurgia → estoque do setor; visitação → situação do paciente; visitação → situação do paciente. (Criada na Etapa 10: atendimento → indicadores da direção.)

## 5. Erros e inconsistências

1. **Segurança (crítico):** sem Firebase Auth; `firestore.rules` está criado e **não publicado** (publicar hoje bloquearia o sistema). Senha de desenvolvimento "1234" no código.
2. **Menu legado:** "Sistema › Telas atuais" duplica funções (Registrar Internação, Registrados, Status, Dar Alta, OPME, Hemodinâmica, Centro Cirúrgico) que também existem em Assistência/Estoque. Precisa de decisão antes de remover (regra: não apagar tela funcional).
3. **Nomenclatura:** "Triagem" no menu (Portaria) significa escala de equipes; a triagem clínica ficou em Assistência › Triagem Clínica para não colidir.
4. **Leitos fixos em código** (4 andares, quartos e letras A/B).
5. **Perfis:** `permissions.js` mistura papéis e ações escritos à mão; não há permissão por módulo editável.
6. **Entrada de mercadoria "Lançada" não movimenta estoque** (só o Recebimento).
7. **Testes:** 36 testes cobrem regras puras; não há teste automatizado de tela/fluxo.
8. Não verificado nesta auditoria: login com migração de hash, tela NSP, paciente provisório e diálogo real de impressão.

## 6. Mapa de dependências

Identidade e permissões → cadastros centrais (pessoas, setores, especialidades, leitos) → paciente/recepção → fila e painel → triagem → atendimento médico → prontuário → exames/prescrição → farmácia/dispensação e enfermagem → internação/leitos → centro cirúrgico/UTI → indicadores da direção. Estoque e compras alimentam farmácia e OPME. Contratos, patrimônio, manutenção e demais serviços de apoio dependem só dos cadastros centrais.

## 7. Plano em etapas (ajustado)

| Etapa | Conteúdo | Observação |
|---|---|---|
| 1 | Identidade segura (Firebase Auth), perfis e permissões por módulo/ação, cadastros centrais faltantes (especialidades, profissional por categoria, unidades/quartos/leitos, equipamentos, serviços), auditoria | Exige acesso ao console do Firebase; publicar as regras só ao fim |
| 2 | Recepção completa: queixa, tipo de atendimento, check-in, senha, status, fila | Base da jornada |
| 3 | Triagem clínica, sinais vitais, painéis de chamada, fila médica | Protocolo de risco a validar |
| 4 | Atendimento médico estruturado, prontuário completo, exames com laboratório e resultados | |
| 5 | Leitos cadastráveis, fila de leito, painel de disponibilidade | |
| 6 | Enfermagem | Feita |
| 7 | Farmácia, dispensação, estoque por almoxarifado, ativar Fiscal | Feita em parte: Farmácia, dispensação, requisição e rastreabilidade. Estoque por almoxarifado ficou em [pendencias.md](pendencias.md) e o Fiscal segue "em breve" por decisão do responsável |
| 8 | Centro cirúrgico (checklist, RPA), UTI, hemoterapia, nutrição, ambulatório | |
| 9 | Patrimônio, manutenção, transporte, lavanderia, resíduos, voluntariado, óbitos | |
| 10 | Ouvidoria, documentos e qualidade, ensino e pesquisa, painel da direção | |

**Andamento:** Etapas 1 a 10 concluídas. Pendências acumuladas em [pendencias.md](pendencias.md).
