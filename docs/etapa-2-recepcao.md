# Etapa 2 — pacientes e recepção (relatório)

Escopo combinado: login e usuários seguem como estão (ver [pendencias.md](pendencias.md)).

## O que foi implementado
Tela **Portaria › Recepção** agora tem duas abas:

1. **Cadastro e check-in** (a tela que já existia): cadastro rápido, busca, duplicidade e edição, agora com os botões **Fazer check-in** e **Histórico** em cada paciente encontrado. Ao cadastrar um paciente novo, a confirmação oferece "Fazer check-in".
2. **Fila de atendimento** (nova): resumo (aguardando, espera média, maior espera, atendimentos do dia, quantos em cada fila), filtros (busca por senha/nome/prontuário, fila, situação, período) e a lista com senha, paciente, tipo, queixa, chegada, espera, fila, situação e ações (Detalhes, Senha, Encaminhar, Cancelar).

### Check-in
- Escolha do **tipo de atendimento**, **fila de destino** (sugerida pelo tipo), **queixa/motivo** (obrigatória quando o tipo exige), **convênio/fonte pagadora** (pré-preenchido com o do paciente) e **atendimento preferencial** com o motivo.
- Gera a **senha do dia** (prefixo do tipo + número: E001, E002...). A senha e o atendimento são gravados na **mesma transação**, então duas pessoas fazendo check-in ao mesmo tempo nunca recebem o mesmo número.
- Bloqueia paciente inativo, tipo inativo e **segunda senha em aberto do mesmo tipo** para o mesmo paciente.
- Marca **retorno** quando o paciente já teve atendimento antes.
- **Imprime a senha** (80 mm, sem o nome completo do paciente: só senha, tipo, fila e hora).
- Auditoria de cada check-in, encaminhamento e cancelamento.

### Fila e situação
- Situações: Aguardando, Em atendimento, Concluído, Cancelado. A Recepção só usa **Aguardando → Cancelado** (com motivo obrigatório) e **Encaminhar** para outra fila. Em atendimento e Concluído serão movidos pelas próximas etapas.
- Cada mudança entra no **histórico de situação** (quem, quando, motivo); nada é apagado.
- Ordem da fila: preferenciais primeiro (previstos em lei), depois a chegada mais antiga. **Sem classificação de risco.**

### Histórico do paciente
Botão **Histórico**: todos os atendimentos com senha mais os registros antigos da recepção, do mais recente ao mais antigo (a consulta é registrada na auditoria).

### Cadastros
- Novo cadastro **Tipos de Atendimento** (Cadastro › Assistência): nome, prefixo da senha (1 a 3 letras, único), fila inicial e se exige queixa. Na primeira abertura pelo administrador são criados 6 tipos padrão (urgência/emergência, consulta ambulatorial, retorno, exame, procedimento, internação eletiva), editáveis.
- **Paciente**: novos campos de convênio/fonte pagadora e nº da carteirinha (aba Adicionais).

## Correções feitas no caminho
- Dois nomes de função da Etapa 2 colidiam com funções de outros módulos (`transicaoPermitida`, `ordenarFila`) e impediam o carregamento do script; renomeados.
- Novo teste (`tests/globais.test.js`) confere todos os scripts do `index.html` juntos e falha se algum nome global for declarado duas vezes (o que os testes por arquivo não pegavam).

## Testes
47 testes passam (10 novos: regras do check-in, senha, fila, resumo, situação, histórico, tipo de atendimento, nomes globais).
No navegador, com Firestore simulado: seed dos tipos, check-in pela tela (combo, fila sugerida, senha E002), senhas E001–E004 sem repetir (inclusive duas ao mesmo tempo), bloqueio de senha repetida e de queixa vazia, encaminhar, cancelar (com e sem motivo, e de novo), perfil Recepção (check-in e cancelar permitidos) e Enfermagem (negado), pré-visualização da senha sem o nome do paciente, histórico, detalhes, tipos e campos de convênio no cadastro do paciente.

## Não verificado
- Transação de senha no Firestore real (testada só no banco simulado).
- Impressão da senha em impressora/papel de 80 mm reais.
- Tela com muito volume (a fila carrega os 300 atendimentos mais recentes).

Pendências acumuladas das Etapas 1 e 2: [pendencias.md](pendencias.md).
