# Regras de negócio hospitalares

Regras aplicadas no sistema, a partir da análise de normas brasileiras e de sistemas hospitalares de referência
(OpenEMR, OpenMRS, Bahmni, GNU Health). Onde a norma não foi confirmada na versão vigente, isso está indicado.

## Já aplicadas

| Domínio | Regra | Onde |
|---|---|---|
| Paciente | Sem duplicidade: CPF ou prontuário idênticos bloqueiam; nome igual só avisa | `services/atendimento.js` |
| Paciente | Toda criação/edição fica na auditoria (quem, quando, antes/depois) | `services/auditoria.js` |
| LGPD | Log de acesso: abrir cadastro de paciente ou detalhes de ocorrência grava `CONSULTAR` com usuário e hora | `registrarAcesso` |
| Emergência | Classificação de risco Manchester (vermelho 0 min, laranja 10, amarelo 60, verde 120, azul 240), preenchida só por Administrador ou Funcionário Emergência | `core/regras.js` |
| Emergência | Selo de tempo-alvo na lista: "Meta: N min" e "Tempo-alvo excedido (+N min)"; botão **Atendido** encerra a contagem e é auditado | `pages/emergencia/index.js` |
| Estoque | FEFO: a saída usa o lote que vence primeiro, ignorando vencidos e sem saldo | `escolherLoteFEFO` |
| Estoque | Lote vencido não pode sair (baixa) nem entrar em laudo; o descarte continua pelo fluxo de perda/remoção | `services/estoque.js`, `pages/laudos/criar.js` |
| Estoque | Lotes mostram "Vencido há N dia(s)" / "Vence em N dia(s)" (alerta a 30 dias); o painel conta vencidos e a vencer | `pages/estoque/consulta.js`, `pages/dashboard.js` |
| Geral | Sem exclusão física de registros assistenciais; alterações com motivo | módulos de atendimento |

Os tempos do Manchester e o prazo de alerta de validade ficam num só lugar (`assets/js/core/regras.js`) e podem ser ajustados pelo hospital.

## Ainda não aplicadas (próximos passos)

- Admissão/ADT completa (estados: aguardando, em atendimento, internado, transferido, alta, óbito) com histórico.
- Cadastro provisório de paciente não identificado e unificação posterior.
- Notificação de eventos adversos ligada ao Núcleo de Segurança do Paciente (RDC 36/2013); prazos e escopo vigentes a confirmar.
- Curva ABC, ponto de pedido e inventário periódico no estoque.
- Rastreabilidade OPME por paciente/procedimento com etiqueta (RDC 59/2008).
- Faturamento SUS (AIH/SIGTAP/CNES): consultar o manual vigente do Ministério da Saúde.
- Visitantes e acompanhantes (Lei 11.108/2005 para parto; ECA e Estatuto da Pessoa Idosa a conferir).
- Retenção de prontuário por no mínimo 20 anos (Lei 13.787/2018): hoje nada é apagado; falta política formal.
- Integrações HL7/FHIR, e-SUS.

Testes automatizados das regras puras: `tests/regras.test.js` (`npm test`).
