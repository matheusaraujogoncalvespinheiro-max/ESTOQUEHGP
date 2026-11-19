# Telas operacionais (antes "em breve")

Todas as opções do menu foram implementadas; não há mais itens "Em breve". Usam o motor de consulta/cadastro (`pages/cadastros/engine.js`),
as definições em `data/cadastros-operacoes.js` e as regras de estoque em `services/operacoes.js`. Cada registro tem código sequencial, auditoria e impressão.

## Movimentações (imutáveis: correção = novo lançamento)

| Tela | Regra principal | Efeito no estoque |
|---|---|---|
| Saídas | Destino obrigatório; bloqueia lote vencido, produto inativo e saldo insuficiente | Baixa o lote |
| Devolução | Lote e validade obrigatórios; lote vencido não volta (use Perdas) | Soma ao lote |
| Perdas | Motivo obrigatório; aceita lote vencido | Baixa o lote |
| Baixas | Documento/autorização obrigatório; só Administrador e Chefe OPME | Baixa o lote |
| Entregas | Setor, itens e quem recebeu | Só registro |

Todas gravam no histórico do produto (aba Movimentação) e respeitam a permissão de estoque do setor do usuário.

## Compras

Solicitação de Compra → Cotações → Pedidos → Recebimentos. O recebimento (imutável) exige nota fiscal, lote e validade, **não aceita validade vencida**,
dá entrada no estoque e muda o pedido para Parcial ou Recebido.

## Consignado

Contratos (fornecedor, vigência, prazo de devolução), Estoque Consignado e Utilizações (relatórios a partir dos produtos marcados como "Consignado" na aba OPME e dos laudos),
Devoluções ao fornecedor (só produto consignado; baixa o lote) e Conferências (contagem x saldo do sistema, com as divergências registradas).

## Portaria e procedimentos

Visitantes, Acompanhantes e Histórico (entradas e saídas, documentos mascarados), Mapa Cirúrgico (procedimentos agendados por data).

## Relatórios

Consumo, Compras, Procedimentos, Perdas, Consignado, Portaria, Mapa Cirúrgico e **Permissões por perfil** (quais telas cada perfil acessa), todos com impressão e CSV.

## Sistema

Dados da Empresa (CNPJ, CNES), Setores, Contas a Pagar/Receber (exige data para marcar como pago) e Parâmetros do Sistema (hoje: dias de alerta de validade, padrão 30,
que passa a valer no painel, na consulta de estoque e nos relatórios).

## Limites

- O efeito no estoque é aplicado logo depois de gravar o registro, depois de validar tudo; se o banco falhar entre as duas etapas, o registro existe e o estoque precisa ser conferido.
- Entregas, Contas a Pagar/Receber e Compras não geram lançamentos automáticos entre si (por exemplo, recebimento não cria título a pagar).
- As permissões continuam definidas no código; a tela de Permissões por perfil é de consulta.
