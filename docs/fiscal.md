# Fiscal e cancelamento de operação

Menu **Fiscal** (abaixo de Movimentações): Entrada de Mercadoria, Inventário de Estoque, NF-e e NFS-e. O menu **Consignado** passou para dentro de **Movimentações** (grupo Consignado),
e **Movimentações › Cancelamento de Operação** fica logo abaixo de Histórico.

## O que o sistema faz e o que não faz

O sistema **registra e confere** notas fiscais; **não emite**. A emissão de NF-e exige certificado digital e comunicação com a SEFAZ, e a de NFS-e depende da prefeitura de cada município.

- **NF-e:** importa o XML (chave, número, emitente, valores, itens, protocolo) ou aceita digitação. A chave de 44 dígitos tem o dígito verificador conferido, e uma nota não entra duas vezes.
- **NFS-e:** registro digitado (o layout varia por município), com cálculo do ISS; alíquota limitada a 5% (LC 116/2003); número + prestador não repetem.
- **Entrada de Mercadoria:** liga uma NF-e **autorizada** à entrada (CFOP de 4 dígitos começando em 1, 2 ou 3, data não anterior à emissão). Cada nota entra uma vez. O estoque continua sendo movimentado pelos Recebimentos (Compras).
- **Inventário:** carrega os produtos do setor, registra a contagem e, ao concluir, calcula faltas e sobras. Opcionalmente baixa as **faltas** do estoque, nos lotes que vencem primeiro; as **sobras** só ficam registradas (precisam de lote e validade: use Devolução ou Recebimento). Inventário concluído não muda.

## Cancelamento de operação

Somente Administrador e Chefe OPME. Cancela Saída, Perda, Baixa, Devolução ao estoque, Devolução ao fornecedor, Recebimento ou Entrega, com motivo (mínimo de 10 caracteres), e **desfaz o efeito no estoque**:
Saída, Perda, Baixa e Devolução ao fornecedor devolvem o item ao lote; Devolução ao estoque e Recebimento retiram o item (só se o saldo do lote ainda existir). Cancelar um recebimento volta o pedido para Emitido ou Parcial.
A operação original continua na consulta como **Cancelada**, e o estorno aparece no histórico do produto. Nada é apagado, e uma operação não cancela duas vezes.

## Telas no estilo das referências (Entrada de Estoque, NF-e, Inventário)

- **Entrada de Mercadoria:** lista com status (padrão **Pendente**), total pendente, botões **Importar XML** e **NF destinadas**. Importar XML registra a NF-e (se ainda não existe) e cria a entrada **Pendente**; depois conferem-se valor e itens, informam-se CFOP e data e muda-se para **Lançada**. Colunas: numeração, fornecedor, data de emissão, data de lançamento, nº interno, CFOP, valor e status.
- **NF destinadas:** lista as NF-e autorizadas ainda sem entrada, com o botão "Gerar entrada (pendente)". **Não há consulta automática à SEFAZ** (distribuição DF-e): as notas entram pelo XML.
- **NF-e:** botão **Importar XML**, total das notas autorizadas e colunas com operação e valor. É registro de notas recebidas: **não emite** NF-e, e não há tela de emissão, inutilização de numeração, DANFE nem ambiente SEFAZ.
- **Inventário:** lista com código, data, setor, observação e totais de divergência; contagem por setor com conclusão e ajuste das faltas.

## Layout das telas fiscais (estilo ERP)

As quatro telas usam a consulta em estilo ERP (`pages/cadastros/lista-erp.js`, `assets/css/fiscal.css`): barra de ícones (voltar, limpar filtros, imprimir) e botões coloridos, filtros em linha com **Pesquisar**, cartão de total,
linhas em pílula (verde = lançada/concluída, vermelha = cancelada) e rodapé "Mostrando de X a Y do total: N". Os formulários têm bloco de identificação e abas.

- **Entrada de Estoque:** *Importar XML* abre a tela **Importar XML Nota Fiscal Eletrônica (NF-e)**: cabeçalho da nota, natureza da operação, abas **Itens** (com CST, UN, desconto e **vínculo de cada item ao produto do estoque**, linha verde quando vinculado) e **Faturas**, e o botão **Gerar NF-e Entrada (Pendente)**. O vínculo é feito automaticamente quando o código do item é igual ao código do produto.
- **NF-e:** formulário com abas Itens, Fatura, Emitente/Destinatário, Transporte, Adicionais, Referência e Impostos e valores. É registro: não emite.
- **Inventário do Estoque:** filtros Código e Observação, abas Itens e Observações.
- **NFS-e:** mesma consulta, com total do ISS.
