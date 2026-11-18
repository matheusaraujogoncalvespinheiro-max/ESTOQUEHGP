# Menu Cadastro: consulta e cadastro separados

Cada opção do menu **Cadastro** abre uma **tela de consulta** (pesquisa, filtros, ordenação, paginação, situação, ver/editar/inativar).
**Clicar em qualquer parte da linha da grid abre o cadastro para edição** (só para visualização, se o perfil não puder editar); a única ação na linha é Inativar/Reativar. Os seletores (combobox) usam uma lista própria no mesmo visual dos campos, com busca quando há muitas opções. A partir dela abrem as telas de **cadastro** (novo/editar) e de **visualização** (somente leitura).

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

## Layout das telas do grupo Principal (Paciente, Fornecedor, Funcionário, Municípios)

Seguem o modelo de ERP: botão de voltar no canto, **bloco de identificação** no topo (código, pessoa, CPF/CNPJ, nome, ativo) e abas
**Principal / Adicionais / Observações** em grade de 12 colunas. Na aba Principal há as seções **Endereço** e **Contato**, que recolhem
pelo ícone de olho. Em Observações há um campo livre e listas (**Anotações**, **Acompanhamentos** no Fornecedor) que só acrescentam itens,
com data e autor, para preservar o histórico. Cancelar e Salvar ficam numa barra fixa no rodapé. No Fornecedor, o campo CPF/CNPJ define o tipo de pessoa pelo tamanho (11 dígitos = física, 14 = jurídica; o campo "Pessoa" só aparece na edição, somente leitura).
O cadastro abre como pessoa física (rótulos **CPF, Nome, Apelido, RG**); ao digitar 12 a 14 dígitos passam a **CNPJ, Razão social, Fantasia, IE**. O código aparece como **0** até o registro ser salvo.
O seletor de **Município** traz os 5.571 municípios do IBGE (`assets/js/data/municipios-ibge.js`), filtrados pelo estado escolhido, e guarda o código IBGE.
Quando o documento é CNPJ aparece um botão de busca que preenche razão social, fantasia, contato e endereço (BrasilAPI); ao lado do CEP há um botão que preenche endereço, bairro, UF e município (ViaCEP). Cada consulta envia somente o CNPJ ou o CEP digitado, e o município é escolhido automaticamente pelo código IBGE.

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
