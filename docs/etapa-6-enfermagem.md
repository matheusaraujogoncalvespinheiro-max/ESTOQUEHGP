# Etapa 6 — enfermagem e assistência ao internado (relatório)

Escopo combinado: login e usuários seguem como estão (ver [pendencias.md](pendencias.md)).
Esta etapa dá à enfermagem as ferramentas do dia a dia do paciente **internado**: sinais vitais, aprazamento e checagem de medicação e cuidados, escala e passagem de plantão. Parte da prescrição que o médico assina no prontuário ([Etapa 4](etapa-4-prontuario-exames.md)) e do leito/internação da [Etapa 5](etapa-5-leitos-fila.md). A integração com a Farmácia (medicação prescrita → dispensação) está na [Etapa 7](etapa-7-farmacia-estoque.md).

**O que o sistema NÃO é**: não calcula dose, não define horário padrão de medicação, não calcula escore de gravidade e não sugere conduta. Os horários vêm de quem apraza (digitados ou por uma regra aritmética "a cada X horas, N vezes" escolhida pela pessoa) e os limites dos campos servem só para barrar erro de digitação.

## O que foi implementado

### 1. Painel de Enfermagem (Assistência › Painel de Enfermagem)
- Quem está internado em cada unidade (ala), com leito, último sinal vital, medicações e cuidados **em atraso** e a escala do dia (responsável e equipe da unidade).
- Mostra só o que foi registrado; não classifica gravidade.

### 2. Checagem de Medicação e Cuidados (Assistência › Checagem de Medicação)
- **Aprazar**: cada item da prescrição (medicamento ou cuidado) ganha horários. Cada horário vira uma **checagem** com id fixo (item + horário): aprazar duas vezes o mesmo horário nunca duplica. Limites de digitação: no máximo 24 h no passado, 14 dias no futuro, 60 horários por vez e intervalo de 1 a 48 h.
- **Checar** cada horário: *feito* (administrado ou realizado) ou *não feito* com **tipo do motivo** (recusa, paciente fora do leito, medicamento ou material indisponível, condição alterada, outro) e **descrição obrigatória**. O registro guarda quem fez, quando e o perfil, e **só vale uma vez**: se outro usuário decidiu antes, a tela avisa por quem.
- **Suspender** os horários pendentes de um item, com motivo; só os pendentes são suspensos e quem prescreve ou é da enfermagem pode fazê-lo.
- A **alta** da internação suspende as checagens pendentes; as já registradas ficam como estão.
- A janela da medicação mostra a linha **Farmácia** (se o item já foi dispensado), só informativa: não impede o registro (Etapa 7).
- Situação por horário: pendente, em atraso, próxima (janela de 120 min), feito, não feito, suspenso. Filtros por unidade, situação e busca.

### 3. Sinais vitais do internado
- Registro da medição com **hora da medição** (pode ser anterior à digitação), autor e perfil; faixas só de digitação (valor impossível não grava). Quando não foi possível aferir, registra-se o **motivo**.
- Medição errada **não se edita**: faz-se outra com observação. Exige internação ativa.
- Aba **Sinais vitais** no prontuário (histórico do paciente) e último valor no painel e na passagem de plantão.

### 4. Escala de Enfermagem (Cadastro › Assistência › Escalas de Enfermagem)
- Responsável e integrantes por **unidade, dia e turno** (um registro por data+turno+unidade).
- Travas: ninguém repetido na equipe, o responsável não precisa constar nos integrantes e **ninguém fica em duas unidades no mesmo dia e turno**.
- Os turnos são uma **lista de apoio** (Manhã, Tarde, Noite, Diurno 12 h, Noturno 12 h): o hospital precisa confirmar os seus (pendência 41).

### 5. Passagem de Plantão (Assistência › Passagem de Plantão)
- Quem sai escolhe **unidade e turno**, informa o registro no conselho (COREN) e o sistema monta a **fotografia** dos internados da unidade (último sinal vital e pendências), com um recado por paciente e um recado geral.
- O registro fica **assinado e não é alterado** e pode ser **impresso**. Quem entra dá a **ciência**: só uma vez, só se ainda não foi recebida e **nunca por quem passou o plantão**.

### 6. Prontuário (registros da enfermagem)
- Abas **Cuidados**, **Evolução de enfermagem**, **Intercorrências**, **Sinais vitais** e **Checagens**. Os registros assinados usam as mesmas regras dos demais registros clínicos: não se altera nem se apaga; correção por complemento (só texto) e COREN obrigatório.
- **Prescrição de cuidados** (enfermagem e médico): cuidado e frequência obrigatórios, com os itens depois aprazados.
- **Alerta de alergia** do paciente (todas as alergias e complementos) na tela de checagem da medicação.

## Permissões
| Ação | Perfis |
|---|---|
| `enfermagem_ver` (painel, checagens, plantão, abas do prontuário) | Administrador, Enfermagem, Médico |
| `enfermagem_registrar` (aprazar, checar, sinais vitais, passagem) | Administrador e Enfermagem |
| `prescrever_cuidados` | Enfermagem e Médico |
| Escala de Enfermagem | criar e editar: Administrador; consultar: Enfermagem e Médico |

As regras também são conferidas nos serviços (`services/enfermagem.js`), não só na tela. Enfermeiro e técnico **não são distinguidos** (um só perfil): pendência 41.

## Correções feitas no caminho
- **Notificações de estoque baixo** não eram gravadas no Firestore (`is_read: undefined`): corrigido (resolvida a pendência 32).
- Layout: tabelas de checagem e plantão passaram ao padrão `rf-tabela` (sem barra de rolagem lateral em 1024 px), etiquetas de situação com quebra de linha dentro da célula, botão "+" do cadastro alinhado e coluna "Recebido por" completa na lista.
- Escala: o responsável também listado como integrante é recusado.

## Testes
121 testes passam (17 novos em `tests/enfermagem.test.js`). Cobrem: horários (ordem, repetidos, formato, limites de digitação e geração aritmética), prescrição de cuidados, id e dados das checagens, decisão (feito simples; não feito exige tipo e descrição), situação e resumo (atraso e janela), faixas dos sinais vitais, escala (repetidos e conflito entre unidades), passagem de plantão (campos e fotografia), fluxo completo internar → prescrever → aprazar → checar, suspensão, evolução e complemento, ciência da passagem (só outra pessoa e uma vez), alta suspendendo pendentes, alergias e permissões.
No navegador, com Firestore simulado (nunca o real): 17 telas em 320, 390, 768, 1024 e 1366 px, sem estouro lateral, campo cortado ou botões de tamanhos diferentes; interações de aprazar, checar, suspender, sinais vitais e plantão; perfis Enfermagem, Médico e demais (acesso negado).

## Não verificado
- **Transações** de aprazamento, decisão da checagem e ciência da passagem no **Firestore real** e uso simultâneo por vários usuários (testadas só no banco simulado).
- **Regras do Firestore** de `sinais_vitais`, `checagens` e `passagens_plantao`: rascunho no arquivo, **não testado no emulador** e sem publicar.
- Índices do Firestore das consultas `dia in [...]` e `status == PENDENTE` (o console avisa e gera o link se faltarem).
- Impressão real da passagem de plantão (papel e "Salvar como PDF") e uso com dados e volume reais do hospital.

Pendências acumuladas das Etapas 1 a 7: [pendencias.md](pendencias.md).
