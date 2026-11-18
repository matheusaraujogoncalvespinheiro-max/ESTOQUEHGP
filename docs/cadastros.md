# Menu Cadastro: consulta e cadastro separados

Cada opção do menu **Cadastro** abre uma **tela de consulta** (pesquisa, filtros, ordenação, paginação, situação, ver/editar/inativar).
A partir dela abrem as telas de **cadastro** (novo/editar) e de **visualização** (somente leitura).

A experiência é padronizada; os dados não. Campos, abas, colunas e filtros de cada entidade estão em
[`assets/js/data/cadastros.js`](../assets/js/data/cadastros.js). O motor (consulta, formulário, validação, gravação) está em
[`assets/js/pages/cadastros/engine.js`](../assets/js/pages/cadastros/engine.js) e o Produto, em `pages/cadastros/produto.js`.

| Grupo | Cadastro | Onde grava | Quem acessa (além do Administrador) |
|---|---|---|---|
| Principal | Paciente | `pacientes` (a mesma da Recepção/Emergência) | ver: Recepção, Emergência; criar/editar: Recepção; inativar: só Administrador |
| Principal | Fornecedor | `cad_fornecedor` | Chefe OPME |
| Principal | Funcionário | `funcionarios` (a mesma das Triagens) | ver: Coordenador de Triagem; demais ações: Administrador |
| Principal | Municípios | `cad_municipio` | ver: Chefe OPME, Recepção; manter: Administrador |
| Estoque | Produto | `products` + `product_batches` (campos novos em `cadastro`) | Chefe OPME; ver também os perfis de estoque |
| Estoque | Classe, Grupo, Sub-Grupo, Fabricante, Unidade, Etiqueta | `cad_<entidade>` | Chefe OPME |
| Financeiro | Centro de Custo, Plano de Contas, Sub-Plano, Contas, Metas | `cad_<entidade>` | Administrador |
| Usuário | Cadastros de Usuários | `app_users` | Chefe OPME |

## Regras

- **Sem exclusão**: registros são inativados e podem ser reativados. Inativar é bloqueado enquanto houver vínculo ativo
  (ex.: classe com grupos, fabricante com produtos, município usado por fornecedor/paciente).
- **Hierarquias**: Grupo exige Classe; Sub-Grupo exige Grupo; Sub-Plano exige Plano. No Produto, Grupo e Sub-Grupo são filtrados pela escolha anterior.
- **Duplicidade**: CNPJ (fornecedor), código IBGE, sigla/descrição de unidade, descrição de classe/grupo/sub-grupo, nome de fabricante etc. não repetem.
- **Código sequencial** (FOR-0001, CLA-0001...) gerado por transação em `cad_contadores`.
- **Envio duplicado** é bloqueado durante o salvamento; os botões ficam desabilitados.
- **Auditoria**: criar, editar, inativar e reativar gravam em `historico_alteracoes` (senhas nunca).
- Abrir/visualizar cadastro de **paciente** grava log de acesso (LGPD).

## Produto (modelo de referência)

- Bloco superior: Código Interno, Código do Fabricante, Nome, Valor de Custo, Situação e **Estoque Atual** (somente leitura).
- Abas no mesmo bloco do conteúdo: **Dados**, **Adicionais**, **Configuração** (opções do produto em caixas de marcação, em três colunas), **Movimentação** (somente leitura, a partir de históricos, transferências e laudos reais; filtros por período, tipo, setor, responsável e lote; saldo por lote) e **OPME** (habilitada quando o produto é marcado como OPME). Em cadastro novo aparecem só Dados, Adicionais e Configuração; Movimentação e OPME surgem depois de salvar.
- O **Código Interno** é o código de barras que já identificava o produto (documento `products/<código>_<setor>`); não muda depois de salvo.
- O cadastro **nunca altera saldo nem lotes**: entrada pelo "Adicionar Estoque", saída pelos laudos/transferências, ajuste pela Correção OPME.
- Produto **inativo** não permite entrada, saída nem uso em laudo, e só pode ser inativado com saldo zero.
- Saldos anterior/posterior da aba Movimentação são calculados a partir do saldo atual e dos registros disponíveis.

## Observações

- "Registrar Internação" (antigo Cadastro › Paciente) e as demais telas de pacientes ficam em Sistema › Telas atuais › Pacientes.
- O cadastro antigo de produto (que criava o produto já com lote) foi substituído no menu; a entrada de estoque é feita em "Adicionar Estoque".
- Usuário inativo não consegue entrar. As senhas continuam sendo gravadas como já eram (texto no `app_users`); a tela de usuários nunca as exibe, mas o ideal é migrar para hash em uma próxima etapa.
