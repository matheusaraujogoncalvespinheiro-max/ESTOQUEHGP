# Auditoria dos itens #5 a #71 (rodada da conexão com o Firebase)

Feita lendo o código (serviços, telas e `firestore.rules`) e rodando os testes. **Nenhum item foi testado contra o Firestore real** (as regras só no emulador). "Persistido" = grava no Firestore pelo serviço; o que falta está na última coluna. Nada foi apagado.

| Item | Situação | Banco / permissões | O que falta |
|---|---|---|---|
| #5 Perfis e permissões editáveis | **Concluído (código) — alcance parcial nas regras** | Tela Perfis e Permissões (Sistema › Configuração › Cadastro): o Administrador concede/retira ações por perfil, gravado como diferença sobre o padrão em `config_permissoes`. Vale nas telas/menus e nas regras de `registros_clinicos` e `leitos_estado` (testado no emulador) | As demais coleções ainda usam listas fixas de perfis nas regras (liberar uma tela não libera a gravação); não cria perfis novos; o Storage não lê as permissões editadas |
| #11 Relatórios e indicadores da direção | **Concluído (código)** | Lê atendimentos do banco por período (limite de 5.000, avisa se passar) | Não testado com volume real; sem comparativo com período anterior |
| #13 Fila do dia | **Parcial (melhorado)** | A fila agora lê só ontem e hoje (até 1000 atendimentos), em vez dos 300 mais recentes de qualquer data | Paginação de verdade na tela (a escuta em tempo real não pagina); aviso quando o limite for atingido |
| #14 Janela de retorno configurável | **Concluído (código)** | Parâmetro `janela_retorno_dias` em Cadastro › Parâmetros do Sistema; o check-in só marca retorno dentro da janela. Sem valor, vale qualquer atendimento anterior | O hospital precisa definir o número de dias |
| #23 Painel por TV/setor e rodízio | **Concluído (código)** | Cadastro › Painéis de TV: filas por TV e tempo de rodízio; a TV escolhida fica no navegador; rodízio só passa por filas com chamada hoje e uma chamada nova leva a tela para a fila dela | O tempo do rodízio é definido pelo hospital (sem padrão); não testado em TV real |
| #29 Laboratório | **Concluído (código)** | Módulo Laboratório: catálogo (Cadastro › Exames de Laboratório), pedido pelo médico, coleta, liberação de resultado por linhas, cancelamento com motivo, histórico e auditoria; novo perfil Funcionário Laboratório; regras testadas no emulador | Sem integração com analisadores, sem valores de referência automáticos, sem retificação de resultado liberado, resultado ainda não vai para o prontuário |
| #30 Alergias | **Concluído (código)** | Lista ativa x inativada (inativar grava complemento assinado com motivo, nada é apagado); aviso de possível conflito entre alergia ativa e medicamento na prescrição e na checagem de enfermagem | O cruzamento é por nome: não conhece classes de medicamentos; só avisa, quem prescreve/administra decide |
| #31 Anexos | **Concluído (código) — depende do Console** | Aba Anexos no prontuário: PDF/JPEG/PNG até 10 MB para o Storage + registro imutável em `anexos_clinicos`; `storage.rules` testadas no emulador (10 casos, incluindo bloqueio de sobrescrita) | O Storage precisa ser ativado no Console e as regras publicadas; não testado no Storage real |
| #36 Devolver ao médico só no mesmo dia | **Corrigido agora** | Estava só na fila de leito; **exames e procedimentos devolviam em qualquer dia**. Agora os três serviços bloqueiam (+2 testes) | A regra não está nas regras do Firestore (só no serviço); depende do dia operacional ser `at.dia` |
| #39 Leitos (344) no banco | **Concluído (código)** | Coleção `leitos_estrutura`; botão "Gravar leitos no banco" no Mapa (só Administrador) grava só os que faltam, nunca sobrescreve nem apaga; o do banco vale sobre o padrão | A migração precisa ser acionada uma vez pelo Administrador no sistema real |
| #46 Enfermagem | **Parcial** | Escalas, checagens, sinais, passagem de plantão; agora a checagem guarda o lote administrado (#48) | Processo de enfermagem, curativos, dimensionamento e relatórios |
| #47/#48 Farmácia: requisição e dispensação | **Parcial (melhorado)** | A checagem registra o lote administrado, conferido com os lotes dispensados do item | Requisição ainda não gera saída; devolução de sobra, catálogo de medicamentos e interações |
| #49 Baixa de lote em transação | **Concluído (código)** | `services/baixa-lote.js`: o saldo no banco é descontado em transação. Teste no emulador: 8 retiradas simultâneas de 2 sobre saldo 10, só 5 passaram, saldo final 0 | A tela ainda atualiza a memória antes do banco (se o banco recusar, avisa e recarrega); dispensação já registrada não é desfeita automaticamente |
| #50 Relatórios da Farmácia | **Concluído (código)** | Relatórios "Dispensações" (por produto) e "Requisições" no menu Farmácia, com período e busca | Custo e consumo por unidade dependem de dados que o sistema não tem |
| #58–#62 Centro cirúrgico, UTI, ambulatório, nutrição, hemoterapia | **Parcial** | Serviços e telas com persistência, permissões e histórico; dieta × alergia avisa na prescrição (#61) | Demais itens das pendências 58 a 63 |
| #63 / #71 Relatórios por período | **Concluído (código)** | 13 relatórios (internações, exames, agenda, cirurgias, hemoterapia, manutenção, transporte, rouparia, resíduos, voluntariado, ouvidoria, qualidade, ensino) consultam o banco quando "De"/"Até" são informados (até 5000 por coleção, com aviso). Teste no emulador | Sem período continuam mostrando só os dados carregados (a tela avisa); sem paginação |
| #65 Papéis únicos por área | **Parcial** | Um papel de chefia/funcionário por área definido em código | Estrutura em banco e verificação de duplicidade |
| #66 Prazos e metas | **Parcial** | Parâmetros do Sistema agora guardam: janela de retorno, prazo sugerido da ouvidoria, meta de espera e meta de ocupação (exibidas no Painel da Direção). Nada é inventado: sem valor, sem efeito | Valores a definir pela direção; demais prazos/metas ainda não parametrizados |
| #67 Listas de apoio configuráveis | **Concluído (código)** | Cadastro › Listas de Apoio acrescenta ou renomeia opções de peças da rouparia, grupos de resíduo, áreas do voluntariado e destinos do corpo; nada some | As listas padrão continuam sendo sugestão: o hospital precisa confirmar; tipo de alta e meio de transporte têm regra no código e ficaram fora |
| #68 Óbito | **Parcial (melhorado)** | Após o óbito, check-in, exame, internação, transporte e pedido de laboratório do paciente ficam bloqueados (marca `obito_paciente` lida por documento, sem dado clínico; testado no emulador) | IML/SVO só como campo, declaração impressa, hemovigilância, relatório de óbitos |
| #69 Patrimônio | **Parcial (melhorado)** | Equipamento ganha baixa patrimonial (data e motivo obrigatórios, sem apagar), custo de aquisição, garantia, responsável e contrato | Histórico de movimentações próprio (hoje só a auditoria), custo de manutenção, teste elétrico, nº de série por unidade |
| #70 Transporte × paciente | **Concluído (código)** | Busca no cadastro/internação ativa; nome e prontuário vêm do registro; sem vínculo exige justificativa | — |

## Corrigido nesta rodada
- Login pelo Firebase Auth e regras reescritas (ver `docs/firebase-conexao.md`).
- Regra do Firestore que permitia apagar documentos de qualquer coleção (achada no emulador).
- Devolução ao médico só no mesmo dia também em **exames** e **procedimentos** (#36). 246 testes passam.

## Ordem sugerida
1. Ativar Auth, criar `app_users/admin`, publicar regras e testar no projeto real.
2. #49 baixa de lote em transação (risco de estoque).
3. #63/#71 relatórios por período; #13 paginação da fila.
4. #5 perfis em banco; #39 leitos; #70 paciente no transporte.
5. #29 laboratório e #31 anexos (Storage); #66/#67 com a direção.

## Atualização (rodada seguinte)
Itens alterados: #13 (parcial), #14, #49, #50, #63/#71, #66 (parcial), e "Esqueci minha senha" no login. Continuam abertos: #5, #23, #29, #30, #31, #39, #67, #70 e os parciais de enfermagem, farmácia, módulos hospitalares, óbito e patrimônio.

## Atualização (alergias e transporte)
#30 e #70 concluídos no código. Continuam abertos: #5, #23, #29, #31, #39, #67 e os parciais de enfermagem, farmácia, módulos hospitalares, óbito e patrimônio.

## Atualização (itens abertos tratados)
#5, #23, #29, #30, #31, #39, #67 e #70 concluídos no código; parciais melhorados: #46/#47/#48 (lote administrado), #61 (dieta × alergia), #68 (bloqueio após óbito), #69 (baixa, garantia, custo). Ações no Console: publicar `firestore.rules` e `storage.rules`, ativar o Storage e acionar "Gravar leitos no banco".
