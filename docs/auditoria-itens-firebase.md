# Auditoria dos itens #5 a #71 (rodada da conexão com o Firebase)

Feita lendo o código (serviços, telas e `firestore.rules`) e rodando os testes. **Nenhum item foi testado contra o Firestore real** (as regras só no emulador). "Persistido" = grava no Firestore pelo serviço; o que falta está na última coluna. Nada foi apagado.

| Item | Situação | Banco / permissões | O que falta |
|---|---|---|---|
| #5 Perfis e permissões editáveis | **Pendente** | Perfis e permissões fixos em `core/permissions.js`; as regras repetem a lista de perfis por área | Coleção de perfis, tela de edição, regras lendo as permissões do banco; hoje trocar permissão exige alterar código e regras |
| #11 Relatórios e indicadores da direção | **Concluído (código)** | Lê atendimentos do banco por período (limite de 5.000, avisa se passar) | Não testado com volume real; sem comparativo com período anterior |
| #13 Fila do dia | **Parcial (melhorado)** | A fila agora lê só ontem e hoje (até 1000 atendimentos), em vez dos 300 mais recentes de qualquer data | Paginação de verdade na tela (a escuta em tempo real não pagina); aviso quando o limite for atingido |
| #14 Janela de retorno configurável | **Concluído (código)** | Parâmetro `janela_retorno_dias` em Cadastro › Parâmetros do Sistema; o check-in só marca retorno dentro da janela. Sem valor, vale qualquer atendimento anterior | O hospital precisa definir o número de dias |
| #23 Painel por setor/TV, voz, rodízio | **Parcial** | `pages/atendimento/painel.js` usa dados reais e voz do navegador | Sem configuração por TV/setor nem rodízio persistidos |
| #29 Laboratório | **Pendente** | Não existe módulo (só solicitações de exame de imagem) | Cadastros, solicitação, resultado, histórico |
| #30 Alergias | **Concluído (código)** | Lista ativa x inativada (inativar grava complemento assinado com motivo, nada é apagado); aviso de possível conflito entre alergia ativa e medicamento na prescrição e na checagem de enfermagem | O cruzamento é por nome: não conhece classes de medicamentos; só avisa, quem prescreve/administra decide |
| #31 Anexos no prontuário | **Pendente** | Não há upload; `storage.rules` fechado | Upload ao Storage ligado ao paciente e regras por vínculo, tipo e tamanho |
| #36 Devolver ao médico só no mesmo dia | **Corrigido agora** | Estava só na fila de leito; **exames e procedimentos devolviam em qualquer dia**. Agora os três serviços bloqueiam (+2 testes) | A regra não está nas regras do Firestore (só no serviço); depende do dia operacional ser `at.dia` |
| #39 344 leitos fixos no código | **Parcial** | 344 leitos montados em `estrutura-hospitalar.js`; leitos extras vêm de Cadastro (persistidos) | Os 344 não são editáveis nem inativáveis; migrar para a coleção sem apagar os existentes |
| #46 Enfermagem | **Parcial** | Escalas, checagens, sinais, passagem de plantão persistem com usuário e hora | Processo de enfermagem e curativos completos, relatórios |
| #47/#48 Farmácia: requisição e dispensação | **Parcial** | Requisição e dispensação separadas; baixa só na dispensação | Ligação dispensação ↔ administração (pendência 48) |
| #49 Baixa de lote em transação | **Concluído (código)** | `services/baixa-lote.js`: o saldo no banco é descontado em transação. Teste no emulador: 8 retiradas simultâneas de 2 sobre saldo 10, só 5 passaram, saldo final 0 | A tela ainda atualiza a memória antes do banco (se o banco recusar, avisa e recarrega); dispensação já registrada não é desfeita automaticamente |
| #50 Relatórios da Farmácia | **Concluído (código)** | Relatórios "Dispensações" (por produto) e "Requisições" no menu Farmácia, com período e busca | Custo e consumo por unidade dependem de dados que o sistema não tem |
| #58–#62 Centro cirúrgico, UTI, ambulatório, nutrição, hemoterapia | **Parcial** | Serviços e telas com persistência, permissões e histórico | Ver pendências 58 a 63 |
| #63 / #71 Relatórios por período | **Concluído (código)** | 13 relatórios (internações, exames, agenda, cirurgias, hemoterapia, manutenção, transporte, rouparia, resíduos, voluntariado, ouvidoria, qualidade, ensino) consultam o banco quando "De"/"Até" são informados (até 5000 por coleção, com aviso). Teste no emulador | Sem período continuam mostrando só os dados carregados (a tela avisa); sem paginação |
| #65 Papéis únicos por área | **Parcial** | Um papel de chefia/funcionário por área definido em código | Estrutura em banco e verificação de duplicidade |
| #66 Prazos e metas | **Parcial** | Parâmetros do Sistema agora guardam: janela de retorno, prazo sugerido da ouvidoria, meta de espera e meta de ocupação (exibidas no Painel da Direção). Nada é inventado: sem valor, sem efeito | Valores a definir pela direção; demais prazos/metas ainda não parametrizados |
| #67 Listas de apoio | **Pendente (hospital)** | Fixas no código, marcadas como a confirmar | Cadastro administrável e validação do hospital |
| #68 Óbito | **Parcial** | Registro pelo médico com sigilo, libera corpo; IML/SVO só como campo | Bloqueio de agenda, declaração impressa (documento oficial fica fora do sistema) |
| #69 Patrimônio | **Parcial** | Cadastro de equipamento com nº de patrimônio e manutenção | Baixa, garantia, custo, movimentações, responsável |
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
