# Recepção, Emergência e Gestão das Triagens

Módulos de atendimento do HGP, localizados no menu **Portaria**. Fazem parte do mesmo sistema (mesma autenticação, menu, tema e banco de dados).

## Telas

| Menu | Módulo | Tela | Quem acessa |
|---|---|---|---|
| Portaria › Recepção | `RECEPCAO` | Imersiva (sem menu e cabeçalho globais), azul | Administrador, Funcionário Recepção |
| Portaria › Emergência | `EMERGENCIA` | Imersiva, vermelha | Administrador, Funcionário Emergência |
| Portaria › Gestão das Triagens | `TRIAGEM` | Painel das 4 equipes por mês (cartões/tabela) | Administrador, Coordenador de Triagem |
| (botão Gerenciar equipes) | `TRIAGEM_GESTAO` | Funcionários, composição mensal e histórico | Somente Administrador |

As telas imersivas usam toda a janela do navegador, sem o modo tela cheia. O botão **HOME** volta ao Dashboard e pede
confirmação se houver campos digitados e ainda não salvos.

## Perfis e permissões

Novos perfis (criados em Administração › Usuários): `FUNC_RECEPCAO`, `FUNC_EMERGENCIA`, `COORD_TRIAGEM`.
Os perfis existentes não ganharam acesso a estes módulos. Permissões (`core/permissions.js`):

| Permissão | Quem |
|---|---|
| `recepcao_acessar`, `recepcao_editar` | Administrador, Funcionário Recepção |
| `pacientes_consultar` | Administrador, Funcionário Recepção, Funcionário Emergência |
| `emergencia_acessar`, `emergencia_registrar` | Administrador, Funcionário Emergência |
| `emergencia_editar_proprio` | Funcionário Emergência (só as próprias ocorrências, em até 24 h) |
| `triagem_ver` | Administrador, Coordenador de Triagem |
| `triagem_gerenciar` | Administrador |

As regras são conferidas na entrada da tela (`canOpenModule`) e dentro dos serviços (`requirePermission`).

## Coleções do Firestore

Modelo relacional por referência de id. Campos em `snake_case`; datas em ISO.

| Coleção | Conteúdo | Chave |
|---|---|---|
| `pacientes` | Identificação (nome, prontuário, CPF só com dígitos, nascimento, telefone) | id gerado (`pac_...`) |
| `registros_recepcao` | Cada atendimento na recepção (`paciente_id`, data/hora, observações, operador) | id gerado |
| `ocorrencias_emergencia` | Ocorrências (protocolo `EMG-AAAAMMDD-HHMMSS-XXXX`, classificação, versão, status) | id gerado |
| `funcionarios` | Matrícula, nome, cargo, categoria, situação | `fn_<MATRICULA>` (matrícula única por construção) |
| `equipes_triagem` | As 4 equipes fixas | `triagem_01` … `triagem_04` |
| `composicoes_mensais` | Uma por competência (`AAAA-MM`): status ABERTA/ENCERRADA, origem da cópia | `AAAA-MM` |
| `integrantes_equipes` | Quem está em qual equipe em cada mês (com "foto" de nome/cargo/categoria daquele mês) | `AAAA-MM__equipe__funcionario` |
| `historico_alteracoes` | Auditoria: quem, quando, o quê, antes/depois, motivo | id gerado |

Não existe exclusão física. Funcionários são inativados; integrantes removidos ficam com `ativo: false`; pacientes e
ocorrências nunca são apagados. Toda alteração gera item em `historico_alteracoes`.

Não é preciso criar índices compostos: as consultas usam um único campo (igualdade, prefixo ou `array-contains`) ou
`orderBy` + `limit` em um campo.

## Regras da Gestão das Triagens

- Quatro equipes fixas; a composição é por mês e cada mês tem sua própria lista (criar um mês não altera os outros).
- Ao criar um mês é possível copiar o anterior (inativos não são copiados) e ajustar antes de encerrar.
- Mês encerrado, ou anterior ao mês atual, é somente consulta; não é possível criar mês que já passou.
- Um funcionário não fica em duas equipes no mesmo mês, salvo autorização explícita do administrador (registrada).
- Só um responsável (coordenador) por equipe.
- Consulta de qualquer mês: aba Histórico dos meses › Ver composição (equipes + alterações).

## Proteção de dados (LGPD)

- Dados pessoais só são carregados na memória quando um usuário autorizado abre o módulo; no logout as escutas param e
  os dados são descartados.
- CPF aparece mascarado nas listas (`529.***.***-25`); o número completo só aparece no formulário de edição.
- A Emergência é registro administrativo inicial e não substitui prontuário médico nem protocolos clínicos.
- O banco não aplica retenção automática de dados: definir a política de retenção com a instituição.

## Limitações conhecidas

- O sistema não tem **regras de segurança do Firestore** nem login real (Firebase Authentication): quem acessar o banco
  diretamente contorna as permissões da tela. Para atender plenamente à LGPD isso precisa ser feito.
- CPF e demais dados ficam em texto no Firestore (sem criptografia em nível de campo).
