// Operações de estoque e compras: regras que acompanham os cadastros transacionais (saídas, perdas, baixas, devoluções,
// recebimentos, devolução ao fornecedor). Cada registro é IMUTÁVEL; o efeito no estoque é aplicado depois de gravar,
// depois de validar tudo (saldo, validade, produto ativo, permissão do setor).

const MOTIVOS_PERDA = ['Vencimento', 'Avaria', 'Extravio', 'Contaminação', 'Recolhimento do fabricante', 'Outro'];
const MOTIVOS_BAIXA = ['Diferença de inventário', 'Erro de lançamento', 'Doação', 'Descarte autorizado', 'Outro'];
const MOTIVOS_DEVOLUCAO = ['Não utilizado', 'Cancelamento do procedimento', 'Troca', 'Outro'];
const MOTIVOS_DEV_FORNECEDOR = ['Não utilizado', 'Fim de contrato', 'Produto com defeito', 'Troca', 'Outro'];

/**
 * Produto + lote escolhidos no formulário, já conferidos. Lança erro se algo estiver fora do previsto.
 * Lote em branco = FEFO (o que vence primeiro, nunca vencido nem inativo). Produto sem controle por lote nem mostra lotes:
 * a saída sai do saldo dele pelo mesmo FEFO, e o lote usado fica gravado para o cancelamento devolver ao lugar certo.
 */
function operacaoItem(form, { exigeLote = true, permitirVencido = false, permissao = 'update_stock' } = {}) {
    const pr = cadProdutoDe(form.produto);
    if (!pr) throw new Error('Selecione o produto.');
    if (!hasPermission(permissao, pr.setor)) throw new Error(`Seu perfil não pode movimentar o estoque ${rotuloSetorOps(pr.setor)}.`);
    if (!produtoAtivo(pr.produto)) throw new Error(`O produto ${pr.produto.material} está inativo.`);
    const qtd = Number(form.quantidade);
    if (!Number.isInteger(qtd) || qtd < 1) throw new Error('Informe a quantidade (número inteiro, mínimo 1).');
    let lote = null;
    if (exigeLote) {
        if (form.lote) {
            lote = (pr.produto.lotes || []).find(l => String(l.id) === String(form.lote));
            if (!lote) throw new Error('Lote não encontrado: escolha outro.');
        } else {
            lote = escolherLoteFEFO(pr.produto.lotes);
            if (!lote) throw new Error(produtoControlaLote(pr.produto) ? 'Nenhum lote disponível: os lotes estão vencidos, inativos ou sem saldo.' : `O produto ${pr.produto.material} não tem saldo disponível.`);
        }
        if (lote.ativo === false) throw new Error(`O lote ${rotuloLote(lote.lote)} está inativo.`);
        if (Number(lote.quantidade) < qtd) throw new Error(loteEhSaldoGeral(lote)
            ? `Saldo disponível sem lote: ${lote.quantidade} un.`
            : `O lote ${rotuloLote(lote.lote)}${form.lote ? '' : ' (o que vence primeiro)'} tem só ${lote.quantidade} un. Lance o restante em outra operação, escolhendo o próximo lote.`);
        if (!permitirVencido && loteVencido(lote)) throw new Error(`O lote ${lote.lote} está vencido: use Perdas para descartá-lo.`);
    }
    return { ...pr, lote, qtd };
}

// O id do lote usado vai junto: com lote em branco (FEFO) é o lote que o sistema escolheu
const dadosDoItem = (it) => ({ setor: it.setor, produto_desc: `${it.produto.barcode} · ${it.produto.material}`, lote: it.lote ? String(it.lote.id) : '', lote_codigo: it.lote ? it.lote.lote : '', validade_lote: it.lote ? (it.lote.validade || '') : '' });

/** Entrada pelas regras de lote; lança erro (nada muda) se o lote não fecha com o controle do produto. */
function entradaOuErro(setor, dados, opcoes) {
    const r = addProductWithBatch(setor, dados, opcoes);
    if (r.type === 'erro') throw new Error(r.message);
    return r;
}

function registrarHistoricoEstoque(acao, it, qtd, loteCodigo, extra = '') {
    if (typeof logEntryHistory === 'function') logEntryHistory(acao, it.setor, it.produto.barcode, it.produto.material, qtd, loteCodigo, extra);
}

// ---- Vínculo com a requisição à Farmácia (#47/#48): a saída atende um item da requisição; a devolução de sobra só devolve o que foi entregue ----
const REQUISICAO_FECHADA = ['Atendida', 'Cancelada'];

/** Pedido, entregue, devolvido e pendente de um item (1, 2, ...) da requisição. Só conta saídas e devoluções não canceladas. */
function saldoDoItemRequisicao(req, item, saidas = CAD_DATA.saida || [], devolucoes = CAD_DATA.devolucao || []) {
    const it = (req.itens || [])[Number(item) - 1];
    if (!it) return null;
    const soma = (lista) => lista.filter(r => r.requisicao === req.id && Number(r.requisicao_item) === Number(item) && r.ativo !== false).reduce((s, r) => s + Number(r.quantidade || 0), 0);
    const pedido = Number(it.quantidade), entregue = soma(saidas), devolvido = soma(devolucoes);
    return { pedido, entregue, devolvido, pendente: Math.max(0, pedido - entregue), devolvivel: Math.max(0, entregue - devolvido) };
}

/** Confere o vínculo informado no formulário. Devolve { requisicao, requisicao_item } para gravar junto, ou {} se não há vínculo. */
function conferirVinculoRequisicao(form, tipo) {
    if (!form.requisicao) return {};
    const req = (CAD_DATA.requisicao || []).find(r => r.id === form.requisicao);
    if (!req) throw new Error('Requisição não encontrada.');
    const item = Number(form.requisicao_item);
    if (!Number.isInteger(item) || item < 1) throw new Error('Informe o número do item da requisição (1, 2, ...).');
    const s = saldoDoItemRequisicao(req, item);
    if (!s) throw new Error(`A requisição ${req.codigo} não tem o item ${item}.`);
    const qtd = Number(form.quantidade);
    if (tipo === 'saida') {
        if (REQUISICAO_FECHADA.includes(req.situacao)) throw new Error(`A requisição ${req.codigo} está ${req.situacao.toLowerCase()}: não recebe nova saída.`);
        if (qtd > s.pendente) throw new Error(`O item ${item} da requisição ${req.codigo} pede ${s.pedido} e já teve ${s.entregue} entregue(s): só faltam ${s.pendente}.`);
    } else if (qtd > s.devolvivel) throw new Error(`Só ${s.devolvivel} un. do item ${item} da requisição ${req.codigo} podem voltar (entregues ${s.entregue}, já devolvidas ${s.devolvido}).`);
    return { requisicao: req.id, requisicao_item: item };
}

/** Situação da requisição pelas saídas já feitas (puro). */
function situacaoPelasSaidas(req, saidas = CAD_DATA.saida || []) {
    const itens = (req.itens || []).map((_, i) => saldoDoItemRequisicao(req, i + 1, saidas, []));
    if (!itens.length || itens.every(s => s.entregue === 0)) return req.situacao;
    return itens.every(s => s.pendente === 0) ? 'Atendida' : 'Atendida em parte';
}

// ---- Saída (para setor, paciente ou procedimento) ----
function validarSaida(form) {
    if (!form.destino_detalhe || String(form.destino_detalhe).trim().length < 3) throw new Error('Informe o destino da saída (setor, paciente ou procedimento).');
    return { ...dadosDoItem(operacaoItem(form)), ...conferirVinculoRequisicao(form, 'saida') };
}
async function aplicarSaida(reg) {
    const pr = cadProdutoDe(reg.produto);
    const r = darBaixaNoEstoque(pr.setor, pr.produto.barcode, reg.quantidade, Number(reg.lote) || reg.lote);
    if (!r.success) throw new Error(r.message);
    registrarHistoricoEstoque('SAIDA', pr, reg.quantidade, reg.lote_codigo);
    if (reg.requisicao) {
        const req = (CAD_DATA.requisicao || []).find(r => r.id === reg.requisicao);
        const nova = req && situacaoPelasSaidas(req, [...(CAD_DATA.saida || []).filter(r => r.id !== reg.id), reg]);
        if (req && nova !== req.situacao) await db_cadSalvar('requisicao', { id: req.id, situacao: nova, atendido_por_nome: state.currentUser.name, atendido_em: nowISO() });
    }
}

// ---- Perda e baixa (aceitam lote vencido; baixa exige autorização/documento) ----
function validarPerda(form) {
    if (form.motivo === 'Outro' && String(form.descricao || '').trim().length < 5) throw new Error('Descreva o motivo da perda (mínimo de 5 caracteres).');
    return dadosDoItem(operacaoItem(form, { permitirVencido: true }));
}
function validarBaixa(form) {
    if (String(form.documento || '').trim().length < 3) throw new Error('Informe o documento ou número da autorização da baixa.');
    if (form.motivo === 'Outro' && String(form.descricao || '').trim().length < 5) throw new Error('Descreva o motivo da baixa (mínimo de 5 caracteres).');
    return dadosDoItem(operacaoItem(form, { permitirVencido: true, permissao: 'register' }));
}
function aplicarRemocao(acao) {
    return (reg) => {
        const pr = cadProdutoDe(reg.produto);
        const lote = pr.produto.lotes.find(l => String(l.id) === String(reg.lote));
        if (!lote || !removeFromBatch(pr.setor, pr.produto.id, lote.id, reg.quantidade)) throw new Error('Não foi possível baixar o estoque. Confira o saldo do lote.');
        registrarHistoricoEstoque(acao, pr, reg.quantidade, reg.lote_codigo);
    };
}

// ---- Devolução ao estoque (item voltando de setor/paciente) ----
function validarDevolucao(form) {
    const pr = cadProdutoDe(form.produto);
    if (!pr) throw new Error('Selecione o produto.');
    if (!hasPermission('update_stock', pr.setor)) throw new Error(`Seu perfil não pode movimentar o estoque ${rotuloSetorOps(pr.setor)}.`);
    const qtd = Number(form.quantidade);
    if (!Number.isInteger(qtd) || qtd < 1) throw new Error('Informe a quantidade (número inteiro, mínimo 1).');
    // Com controle por lote: lote e validade obrigatórios. Sem controle: opcionais (sem lote volta ao saldo geral).
    const controla = produtoControlaLote(pr.produto);
    if (controla && String(form.lote_codigo || '').trim().length < 1) throw new Error('Este produto é controlado por lote: informe o lote do item devolvido.');
    if (controla && !form.validade) throw new Error('Informe a validade do lote.');
    if (form.validade && form.validade < todayISO()) throw new Error('Itens vencidos não voltam ao estoque: use Perdas.');
    const conf = conferirEntradaLote(pr.produto, { lote: form.lote_codigo, validade: form.validade });
    if (!conf.ok) throw new Error(conf.message);
    return { setor: pr.setor, produto_desc: `${pr.produto.barcode} · ${pr.produto.material}`, lote_codigo: conf.codigo, validade: conf.validade === 'N/A' ? '' : conf.validade, ...conferirVinculoRequisicao(form, 'devolucao') };
}
function aplicarDevolucao(reg) {
    const pr = cadProdutoDe(reg.produto);
    const p = pr.produto;
    entradaOuErro(pr.setor, { barcode: p.barcode, lote: String(reg.lote_codigo || '').trim(), remessa: p.remessa || '', validade: reg.validade, quantidade: reg.quantidade, empresa: p.empresa, marca: p.marca, material: p.material, descricao: p.descricao, min: p.min });
    registrarHistoricoEstoque('DEVOLUCAO', pr, reg.quantidade, reg.lote_codigo);
}

// ---- Devolução ao fornecedor (consignado) ----
const ehConsignado = (p) => Boolean(p.cadastro && p.cadastro.opme && p.cadastro.opme.tipo_material === 'Consignado');
function validarDevFornecedor(form) {
    const it = operacaoItem(form, { permitirVencido: true });
    if (!ehConsignado(it.produto)) throw new Error('Este produto não está marcado como consignado (aba OPME do cadastro do produto).');
    return dadosDoItem(it);
}

// ---- Compras ----
const somaItens = (itens, q = 'quantidade', v = 'valor_unit') => Math.round((itens || []).reduce((a, i) => a + (Number(i[q]) || 0) * (Number(i[v]) || 0), 0) * 100) / 100;

function validarPedido(form) {
    const itens = (form.itens || []).filter(i => String(i.descricao || '').trim());
    if (!itens.length) throw new Error('Inclua ao menos um item no pedido.');
    if (itens.some(i => !(Number(i.quantidade) > 0))) throw new Error('Todos os itens precisam de quantidade maior que zero.');
    return { itens, valor_total: somaItens(itens) };
}

function validarRecebimento(form) {
    if (form.data_recebimento > todayISO()) throw new Error('A data de recebimento não pode ser futura.');
    const itens = (form.itens || []).filter(i => i.produto);
    if (!itens.length) throw new Error('Inclua ao menos um item recebido.');
    itens.forEach((i, n) => {
        const pr = cadProdutoDe(i.produto);
        if (!pr) throw new Error(`Item ${n + 1}: produto não encontrado.`);
        if (!hasPermission('update_stock', pr.setor)) throw new Error(`Item ${n + 1}: seu perfil não pode dar entrada no estoque ${rotuloSetorOps(pr.setor)}.`);
        if (!(Number(i.quantidade) > 0) || !Number.isInteger(Number(i.quantidade))) throw new Error(`Item ${n + 1}: quantidade inválida.`);
        // Lote e validade: obrigatórios só para produto controlado por lote (sem controle, sem lote vai para o saldo geral)
        const controla = produtoControlaLote(pr.produto);
        if (controla && !String(i.lote || '').trim()) throw new Error(`Item ${n + 1}: ${pr.produto.material} é controlado por lote: informe o lote.`);
        if (controla && !i.validade) throw new Error(`Item ${n + 1}: informe a validade do lote.`);
        if (i.validade && i.validade < todayISO()) throw new Error(`Item ${n + 1}: validade vencida (produto vencido não entra no estoque).`);
        const conf = conferirEntradaLote(pr.produto, { lote: i.lote, validade: i.validade });
        if (!conf.ok) throw new Error(`Item ${n + 1}: ${conf.message}`);
        const repetido = itens.slice(0, n).find(o => o.produto === i.produto && String(o.lote || '').trim() === String(i.lote || '').trim() && (o.validade || '') !== (i.validade || ''));
        if (repetido) throw new Error(`Item ${n + 1}: o lote ${i.lote} aparece com duas validades diferentes neste recebimento.`);
    });
    return { itens, valor_total: somaItens(itens) };
}

async function aplicarRecebimento(reg) {
    reg.itens.forEach(i => {
        const pr = cadProdutoDe(i.produto);
        const p = pr.produto;
        const r = entradaOuErro(pr.setor, { barcode: p.barcode, lote: String(i.lote || '').trim(), remessa: reg.nota_fiscal, validade: i.validade, quantidade: Number(i.quantidade), empresa: p.empresa, marca: p.marca, material: p.material, descricao: p.descricao, min: p.min, preco: i.valor_unit, fornecedor_id: reg.fornecedor_id });
        void r;
        registrarHistoricoEstoque('RECEBIMENTO', pr, Number(i.quantidade), i.lote, `NF ${reg.nota_fiscal}`);
    });
    // O pedido muda de situação: recebido por completo ou parcialmente
    if (reg.pedido) await db_cadSalvar('pedido', { id: reg.pedido, situacao: reg.recebimento_total ? 'Recebido' : 'Parcial', atualizado_em: nowISO(), atualizado_por: state.currentUser.username });
}

// ---- Conferência de estoque consignado: compara a contagem com o saldo do sistema ----
function validarConferencia(form) {
    const itens = (form.itens || []).filter(i => i.produto);
    if (!itens.length) throw new Error('Inclua ao menos um item conferido.');
    let divergencias = 0;
    const conf = itens.map((i, n) => {
        const pr = cadProdutoDe(i.produto);
        if (!pr) throw new Error(`Item ${n + 1}: produto não encontrado.`);
        if (i.quantidade_contada === '' || i.quantidade_contada === undefined || !(Number(i.quantidade_contada) >= 0)) throw new Error(`Item ${n + 1}: informe a quantidade contada.`);
        const sistema = Number(pr.produto.qtd) || 0;
        const dif = Number(i.quantidade_contada) - sistema;
        if (dif !== 0) divergencias++;
        return { ...i, quantidade_sistema: sistema, diferenca: dif };
    });
    return { itens: conf, divergencias, situacao: divergencias ? 'Concluída com divergência' : 'Concluída sem divergência' };
}


// ---- Cancelamento de operação (estorno) ----
const OPERACOES_CANCELAVEIS = { dispensacao: 'Dispensação', saida: 'Saída', devolucao: 'Devolução ao estoque', perda: 'Perda', baixa: 'Baixa', consigdev: 'Devolução ao fornecedor', recebimento: 'Recebimento', entrega: 'Entrega' };
const ESTORNO_ACAO = { dispensacao: 'ESTORNO_DISPENSACAO', saida: 'ESTORNO_SAIDA', perda: 'ESTORNO_PERDA', baixa: 'ESTORNO_BAIXA', consigdev: 'ESTORNO_DEV_FORNECEDOR', devolucao: 'ESTORNO_DEVOLUCAO', recebimento: 'ESTORNO_RECEBIMENTO' };
const VOLTAM_AO_ESTOQUE = ['dispensacao', 'saida', 'perda', 'baixa', 'consigdev']; // cancelar devolve o item ao estoque

function loteDoEstoque(setor, produto, codigo) { return (produto.lotes || []).find(l => String(l.lote) === String(codigo)); }

/** Confere se dá para desfazer a operação (permissão, situação e saldo) e devolve os dados do estorno. */
function validarCancelamento(form) {
    if (!['ADMIN', 'CHEFE_OPME', 'CHEFE_FARMACIA'].includes(state.currentUser.role)) throw new Error('Somente Administrador, Chefe OPME e Chefe Farmácia cancelam operações.');
    if (state.currentUser.role === 'CHEFE_FARMACIA' && form.tipo_operacao !== 'dispensacao') throw new Error('O Chefe Farmácia cancela apenas dispensações.');
    if (!OPERACOES_CANCELAVEIS[form.tipo_operacao]) throw new Error('Escolha o tipo da operação.');
    const op = (CAD_DATA[form.tipo_operacao] || []).find(r => r.id === form.operacao);
    if (!op) throw new Error('Selecione a operação a cancelar.');
    if (op.ativo === false) throw new Error('Esta operação já foi cancelada.');
    if (String(form.motivo || '').trim().length < 10) throw new Error('Explique o motivo do cancelamento (mínimo de 10 caracteres).');
    if (VOLTAM_AO_ESTOQUE.includes(form.tipo_operacao)) {
        const pr = cadProdutoDe(op.produto);
        if (!pr) throw new Error('O produto desta operação não existe mais no estoque. Faça um Recebimento para recompor.');
        if (!hasPermission('register', pr.setor)) throw new Error('Seu perfil não pode movimentar este estoque.');
    } else if (form.tipo_operacao === 'devolucao') {
        const pr = cadProdutoDe(op.produto);
        const l = pr && loteDoEstoque(pr.setor, pr.produto, op.lote_codigo || LOTE_SEM_CONTROLE);
        if (!l || l.quantidade < op.quantidade) throw new Error('O item devolvido já saiu do estoque: não há saldo suficiente do lote para estornar.');
    } else if (form.tipo_operacao === 'recebimento') {
        op.itens.forEach((i, n) => {
            const pr = cadProdutoDe(i.produto);
            const l = pr && loteDoEstoque(pr.setor, pr.produto, i.lote || LOTE_SEM_CONTROLE);
            if (!l || l.quantidade < Number(i.quantidade)) throw new Error(`Item ${n + 1} do recebimento já foi consumido: não há saldo do lote ${i.lote} para estornar.`);
        });
    }
    return { tipo_rotulo: OPERACOES_CANCELAVEIS[form.tipo_operacao], operacao_codigo: op.codigo, operacao_desc: `${OPERACOES_CANCELAVEIS[form.tipo_operacao]} ${op.codigo}${op.produto_desc ? ' · ' + op.produto_desc : ''}` };
}

async function aplicarCancelamento(reg) {
    const tipo = reg.tipo_operacao;
    const op = (CAD_DATA[tipo] || []).find(r => r.id === reg.operacao);
    if (VOLTAM_AO_ESTOQUE.includes(tipo)) {
        const pr = cadProdutoDe(op.produto);
        const p = pr.produto;
        // Volta ao MESMO lote de onde saiu (mesmo que esteja inativo ou zerado)
        const r = devolverAoLote(pr.setor, p.barcode, { lote: op.lote_codigo, validade: op.validade_lote || 'N/A', remessa: p.remessa || '' }, op.quantidade, p);
        if (r.type === 'erro') throw new Error(r.message);
        registrarHistoricoEstoque(ESTORNO_ACAO[tipo], pr, op.quantidade, op.lote_codigo, `Cancelamento ${reg.codigo}`);
    } else if (tipo === 'devolucao') {
        const pr = cadProdutoDe(op.produto);
        const l = loteDoEstoque(pr.setor, pr.produto, op.lote_codigo || LOTE_SEM_CONTROLE);
        if (!l || !removeFromBatch(pr.setor, pr.produto.id, l.id, op.quantidade)) throw new Error('Não há saldo do lote para estornar a devolução.');
        registrarHistoricoEstoque(ESTORNO_ACAO[tipo], pr, op.quantidade, op.lote_codigo, `Cancelamento ${reg.codigo}`);
    } else if (tipo === 'recebimento') {
        op.itens.forEach(i => {
            const pr = cadProdutoDe(i.produto);
            const l = loteDoEstoque(pr.setor, pr.produto, i.lote || LOTE_SEM_CONTROLE);
            if (!l || !removeFromBatch(pr.setor, pr.produto.id, l.id, Number(i.quantidade))) throw new Error(`Não há saldo do lote ${rotuloLote(i.lote)} para estornar o recebimento.`);
            registrarHistoricoEstoque(ESTORNO_ACAO[tipo], pr, Number(i.quantidade), i.lote, `Cancelamento ${reg.codigo}`);
        });
        if (op.pedido) {
            const outros = (CAD_DATA.recebimento || []).some(r => r.id !== op.id && r.pedido === op.pedido && r.ativo !== false);
            await db_cadSalvar('pedido', { id: op.pedido, situacao: outros ? 'Parcial' : 'Emitido', atualizado_em: nowISO(), atualizado_por: state.currentUser.username });
        }
    }
    // A operação original continua na consulta, marcada como cancelada (nada é apagado)
    await db_cadSalvar(tipo, { id: op.id, ativo: false, cancelado_em: nowISO(), cancelado_por: state.currentUser.name, cancelamento: reg.id, motivo_cancelamento: reg.motivo });
    await auditar({ entidade: 'cad_' + tipo, entidade_id: op.id, acao: 'CANCELAR', depois: { cancelamento: reg.codigo }, motivo: reg.motivo });
}
