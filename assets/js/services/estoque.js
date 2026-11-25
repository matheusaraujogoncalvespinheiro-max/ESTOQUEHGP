// Regras de estoque: produtos, lotes e baixas
//
// Todo saldo mora em product_batches (um documento por lote). O controle por lote é escolhido em cada produto
// (cadastro.config.usa_lote, "Controlar estoque por lote" no cadastro do produto); as regras puras ficam em core/regras.js
// (conferirEntradaLote, planejarSaidaFEFO, escolherLoteFEFO). Aqui elas são aplicadas na memória e gravadas no banco em
// TRANSAÇÃO (services/baixa-lote.js): entrada soma e saída subtrai do saldo que está no banco, nunca de um número da tela.
//
// - Produto COM controle por lote: entrada exige lote e validade; saída usa FEFO ou o lote escolhido; lote vencido ou inativo
//   não sai; lote zerado continua registrado (histórico, aba Lotes).
// - Produto SEM controle por lote: entrada sem lote vai para o saldo geral (Sem lote); o resto funciona como antes.
// Nenhum produto é apagado quando o saldo chega a zero (o cadastro continua).

function findProductByBarcodeAndSetor(barcode, setor) {
    if (!MOCK_DATA[setor]) return null;
    return MOCK_DATA[setor].find(item => item.barcode === barcode);
}

function findProductInAnySetor(barcode) {
    for (const setor in MOCK_DATA) {
        if (setor === 'PACIENTES' || setor === 'LAUDOS') continue;
        const produto = findProductByBarcodeAndSetor(barcode, setor);
        if (produto) return { produto, setor };
    }
    return null;
}

/** Saldo = soma dos lotes; lotes em ordem FEFO; "lote principal" = o primeiro com saldo. */
function recalcularProdutoEstoque(produto) {
    produto.lotes = produto.lotes || [];
    produto.lotes.sort((a, b) => compararFEFO(a, b));
    produto.qtd = produto.lotes.reduce((total, l) => total + (Number(l.quantidade) || 0), 0);
    const principal = produto.lotes.find(l => Number(l.quantidade) > 0) || produto.lotes[0];
    produto.lote = principal ? principal.lote : '';
    produto.validade = principal ? principal.validade : '';
}

const bancoTransacional = () => typeof db !== 'undefined' && db && typeof entrarLoteTransacional === 'function' && typeof baixarLoteTransacional === 'function';

function avisarFalhaEstoque(err, oque) {
    console.error(`Falha ao gravar ${oque} no banco:`, err);
    if (typeof showMsg === 'function') showMsg(err && err.saldoInsuficiente ? `${err.message} A operação NÃO foi gravada: confira o estoque.` : `Não foi possível gravar ${oque} no banco. Confira o saldo do lote.`, 'error');
    if (typeof db_syncProducts === 'function') db_syncProducts().then(() => { if (typeof render === 'function') render(); });
}

/** Grava a entrada: produto (sem saldo) + soma no lote em transação. */
function persistirEntradaLote(produto, setor, lote, quantidade, dadosNovo) {
    if (typeof db_saveProduct !== 'function') return Promise.resolve();
    return db_saveProduct(produto, setor).then(salvo => {
        if (!salvo) return;
        if (!bancoTransacional()) return typeof db_saveBatch === 'function' ? db_saveBatch(salvo.id, lote) : undefined;
        return entrarLoteTransacional(db, salvo.id, lote.lote, quantidade, dadosNovo);
    }).catch(err => avisarFalhaEstoque(err, 'a entrada'));
}

/** Grava a saída: subtrai do lote em transação. apagarSeZerar só para o saldo de produto sem controle por lote (comportamento antigo). */
function persistirBaixaLote(produto, setor, lote, quantidade, { apagarSeZerar = false } = {}) {
    const syncId = `${produto.barcode}_${setor}`;
    if (!(Number(quantidade) > 0)) {
        if (apagarSeZerar && typeof db_deleteBatch === 'function') db_deleteBatch(syncId, lote.lote);
        return Promise.resolve();
    }
    if (!bancoTransacional()) {
        if (apagarSeZerar && lote.quantidade <= 0) return typeof db_deleteBatch === 'function' ? db_deleteBatch(syncId, lote.lote) : Promise.resolve();
        return typeof db_saveBatch === 'function' ? db_saveBatch(syncId, lote) : Promise.resolve();
    }
    return baixarLoteTransacional(db, syncId, lote.lote, quantidade).then(r => {
        if (!r.ok && r.semDocumento) return typeof db_saveBatch === 'function' ? db_saveBatch(syncId, lote) : undefined;   // lote que só existia na memória
        if (r.ok && r.saldo === 0 && apagarSeZerar && typeof db_deleteBatch === 'function') return db_deleteBatch(syncId, lote.lote);
    }).catch(err => avisarFalhaEstoque(err, 'a baixa do estoque'));
}

/** Dados opcionais do lote (aba Lotes e entradas): só os que vierem preenchidos. */
function dadosExtrasLote(d) {
    const out = {};
    ['fabricacao', 'prateleira', 'fornecedor_id', 'obs'].forEach(k => { if (d[k] !== undefined && String(d[k]).trim() !== '') out[k] = String(d[k]).trim(); });
    if (d.preco !== undefined && d.preco !== '' && d.preco !== null && !isNaN(Number(d.preco))) out.preco = Number(d.preco);
    return out;
}

/**
 * ENTRADA de estoque (compra, entrada manual, devolução, transferência recebida, estorno).
 * Devolve { type: 'created' | 'updated', produto, lote } ou { type: 'erro', message } (nada é alterado no erro).
 * opcoes.retorno = true quando o item volta ao lote de onde saiu (devolução, cancelamento, transferência).
 */
function addProductWithBatch(setor, productData, opcoes = {}) {
    const { barcode, remessa, quantidade, empresa, marca, material, descricao, min } = productData;
    const qtd = Number(quantidade);
    if (!(qtd > 0)) return { type: 'erro', message: 'Quantidade de entrada inválida.' };
    if (!MOCK_DATA[setor]) MOCK_DATA[setor] = [];

    const produtoExistente = findProductByBarcodeAndSetor(barcode, setor);
    const conf = conferirEntradaLote(produtoExistente || { cadastro: productData.cadastro, lotes: [] }, productData, opcoes);
    if (!conf.ok) return { type: 'erro', message: conf.message };
    const extras = dadosExtrasLote(productData);
    const hoje = new Date().toISOString().split('T')[0];
    const novoLote = () => ({ id: Date.now() + Math.random(), lote: conf.codigo, remessa: remessa || '', validade: conf.validade, quantidade: qtd, data_entrada: hoje, qtd_inicial: qtd, ativo: true, ...extras });
    const dadosNovoBanco = (l) => ({ validade: l.validade, remessa: l.remessa || '', data_entrada: l.data_entrada, ...extras });

    if (produtoExistente) {
        let lote = conf.existente;
        if (lote) {
            lote.quantidade = (Number(lote.quantidade) || 0) + qtd;
            if (remessa) lote.remessa = remessa;
            lote.ativo = true;
        } else {
            lote = novoLote();
            produtoExistente.lotes = produtoExistente.lotes || [];
            produtoExistente.lotes.push(lote);
        }
        // Atualizar empresa/marca/descrição se fornecidas
        if (empresa) produtoExistente.empresa = empresa;
        if (marca) produtoExistente.marca = marca;
        if (material) produtoExistente.material = material;
        if (descricao) produtoExistente.descricao = descricao;
        if (min) produtoExistente.min = min;
        if (remessa) produtoExistente.remessa = remessa;
        recalcularProdutoEstoque(produtoExistente);
        persistirEntradaLote(produtoExistente, setor, lote, qtd, dadosNovoBanco(lote));
        return { type: 'updated', produto: produtoExistente, lote };
    }

    // Produto ainda não existe neste setor (ex.: primeira transferência para cá): herda o cadastro, se veio junto
    const lote = novoLote();
    const novoProduto = {
        id: Date.now(),
        barcode: barcode,
        material: material || 'PRODUTO NÃO ESPECIFICADO',
        descricao: descricao || 'DESCRIÇÃO NÃO FORNECIDA',
        empresa: empresa || 'FORNECEDOR NÃO ESPECIFICADO',
        marca: marca || empresa || 'NÃO ESPECIFICADA',
        remessa: remessa || '',
        min: min || 5,
        lotes: [lote]
    };
    if (productData.cadastro) novoProduto.cadastro = JSON.parse(JSON.stringify(productData.cadastro));
    recalcularProdutoEstoque(novoProduto);
    MOCK_DATA[setor].push(novoProduto);
    persistirEntradaLote(novoProduto, setor, lote, qtd, dadosNovoBanco(lote));
    return { type: 'created', produto: novoProduto, lote };
}

/** Saída de um lote ESPECÍFICO (ajustes, perdas, baixas, transferências). Devolve false se o lote não existe ou não tem saldo. */
function removeFromBatch(setor, productId, batchId, quantidade) {
    const produto = (MOCK_DATA[setor] || []).find(p => String(p.id) === String(productId));
    if (!produto) return false;
    const lote = (produto.lotes || []).find(l => String(l.id) === String(batchId));
    if (!lote) return false;
    const qtd = Number(quantidade);
    if (!(qtd >= 0) || Number(lote.quantidade) < qtd) return false;

    lote.quantidade = Number(lote.quantidade) - qtd;
    // Produto com controle por lote: o lote zerado continua registrado (histórico e aba Lotes)
    const apagarSeZerar = !produtoControlaLote(produto);
    if (lote.quantidade <= 0 && apagarSeZerar) produto.lotes.splice(produto.lotes.indexOf(lote), 1);
    recalcularProdutoEstoque(produto);
    persistirBaixaLote(produto, setor, lote, qtd, { apagarSeZerar });
    saveToLocalStorage();
    return true;
}

/**
 * Saída pelo FEFO repartindo entre lotes (transferências, salas). Devolve { ok, partes: [{ lote, validade, remessa, quantidade }] }
 * ou { ok: false, message }. Nada sai se o saldo disponível (sem vencidos/inativos) não cobrir tudo.
 */
function retirarEstoqueFEFO(setor, produto, quantidade) {
    if (!produtoAtivo(produto)) return { ok: false, message: `Produto ${produto.material} está inativo: a saída é bloqueada.` };
    const plano = planejarSaidaFEFO(produto, quantidade);
    if (!plano.ok) return plano;
    const partes = plano.partes.map(p => ({ lote: p.lote.lote, validade: p.lote.validade, remessa: p.lote.remessa || '', quantidade: p.quantidade, id: p.lote.id }));
    for (const p of partes) {
        if (!removeFromBatch(setor, produto.id, p.id, p.quantidade)) return { ok: false, message: `Não foi possível baixar o lote ${rotuloLote(p.lote)}.`, partes };
    }
    return { ok: true, partes };
}

/**
 * Devolve ao lote de onde saiu (cancelamento, devolução de sala, transferência recusada ou recebida no destino).
 * produtoBase só é usado quando o produto ainda não existe no setor (cria com o mesmo cadastro e dados).
 */
function devolverAoLote(setor, barcode, { lote, validade, remessa = '' }, quantidade, produtoBase = null) {
    const existe = findProductByBarcodeAndSetor(barcode, setor);
    const base = existe ? {} : (produtoBase || {});
    return addProductWithBatch(setor, { barcode, lote, validade, remessa, quantidade, material: base.material, descricao: base.descricao, empresa: base.empresa, marca: base.marca, min: base.min, cadastro: base.cadastro }, { retorno: true });
}

/** Transferência: saldo "Sem lote" não pode entrar num produto que controla lote no destino. Devolve '' ou a mensagem. */
function conferirTransferenciaLote(produtoOrigem, toSetor) {
    const destino = findProductByBarcodeAndSetor(produtoOrigem.barcode, toSetor);
    const temSaldoSemLote = (produtoOrigem.lotes || []).some(l => loteEhSaldoGeral(l) && Number(l.quantidade) > 0);
    if (destino && produtoControlaLote(destino) && temSaldoSemLote) {
        return `No setor de destino ${produtoOrigem.material} é controlado por lote, mas na origem parte do saldo está sem lote. Ajuste o cadastro da origem (Controlar estoque por lote) e registre os lotes antes de transferir.`;
    }
    return '';
}

/** Produtos de cada setor de estoque que o perfil enxerga, com o setor de origem. A Farmácia só aparece para o próprio perfil e para o Administrador. */
function produtosEstoqueComSetor() {
    const setores = typeof setoresEstoqueVisiveis === 'function' ? setoresEstoqueVisiveis() : ['OPME', 'HEMODINAMICA', 'CENTRO_CIRURGICO'];
    return setores.flatMap(setor => (MOCK_DATA[setor] || []).map(produto => ({ produto, setor })));
}

function todosProdutosEstoque() { return produtosEstoqueComSetor().map(x => x.produto); }

function checkBarcodeUnique(barcode) {
    const allItems = [...MOCK_DATA.OPME, ...MOCK_DATA.HEMODINAMICA, ...MOCK_DATA.OPME];
    return !allItems.some(item => item.barcode === barcode);
}

function logEntryHistory(action, sector, barcode, itemDesc, quantity, batch, extra = '') {
    if (!MOCK_DATA.PRODUCT_HISTORY) MOCK_DATA.PRODUCT_HISTORY = [];

    const now = new Date();
    const historyItem = {
        id: Date.now(),
        date: now.toLocaleDateString('pt-PT'),
        time: now.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
        user: state.currentUser.name,
        action: action, // 'CADASTRO' or 'ENTRADA'
        sector: sector,
        barcode: barcode,
        product: itemDesc,
        quantity: quantity,
        batch: batch,
        obs: extra || ''
    };
    MOCK_DATA.PRODUCT_HISTORY.unshift(historyItem);
    if (typeof db_saveProductHistory === 'function') db_saveProductHistory(historyItem);
}

function buscarProdutoPorBarcodeESetor(barcode, setor) {
    if (!MOCK_DATA[setor]) return null;
    return MOCK_DATA[setor].find(produto => produto.barcode === barcode);
}

/**
 * Saída de UM lote: o escolhido (loteId) ou, sem escolha, o que vence primeiro (FEFO). Bloqueia produto inativo,
 * lote vencido, lote inativo e quantidade maior que o saldo do lote. O saldo no banco é descontado em TRANSAÇÃO.
 */
function darBaixaNoEstoque(setor, barcode, quantidade, loteId = null) {
    const produto = buscarProdutoPorBarcodeESetor(barcode, setor);
    if (!produto) return { success: false, message: "Produto não encontrado no setor" };
    if (!produtoAtivo(produto)) return { success: false, message: `Produto ${produto.material} está inativo: a saída é bloqueada.` };
    const qtd = Number(quantidade);
    if (!(qtd > 0)) return { success: false, message: 'Quantidade de saída inválida.' };

    if (!loteId && produto.lotes && produto.lotes.length > 0) {
        // FEFO: o lote que vence primeiro, nunca um vencido ou inativo
        const escolhido = escolherLoteFEFO(produto.lotes);
        if (!escolhido) return { success: false, message: 'Nenhum lote disponível: os lotes estão vencidos, inativos ou sem saldo.' };
        loteId = escolhido.id;
    }

    const lote = (produto.lotes || []).find(l => String(l.id) === String(loteId));
    if (!lote) return { success: false, message: "Lote não encontrado" };
    if (lote.ativo === false) return { success: false, message: `Lote ${rotuloLote(lote.lote)} está inativo: a saída é bloqueada.` };
    if (loteVencido(lote)) return { success: false, message: `Lote ${lote.lote} vencido: a saída é bloqueada (use o descarte/perda).` };
    if (Number(lote.quantidade) < qtd) {
        return { success: false, message: `Quantidade insuficiente no lote ${rotuloLote(lote.lote)}. Disponível: ${lote.quantidade}` };
    }

    lote.quantidade = Number(lote.quantidade) - qtd;
    // Lote zerado sai da lista só no produto sem controle por lote (como antes); o documento no banco fica com saldo 0
    if (lote.quantidade <= 0 && !produtoControlaLote(produto)) produto.lotes.splice(produto.lotes.indexOf(lote), 1);
    recalcularProdutoEstoque(produto);
    saveToLocalStorage();
    if (typeof db_saveProduct === 'function') {
        db_saveProduct(produto, setor).then(salvo => { if (salvo) return persistirBaixaLote(produto, setor, lote, qtd); })
            .catch(err => avisarFalhaEstoque(err, 'a baixa do estoque'));
    }
    return { success: true, produto: produto, lote: lote, quantidadeRemovida: qtd };
}

/**
 * Zera um lote inteiro (ação de administrador/chefe), pela mesma regra de removeFromBatch. Produto sem controle por lote:
 * o lote sai do banco, como antes. Produto com controle por lote: o lote fica registrado com saldo 0. O produto nunca é apagado.
 */
/**
 * Converte (parte do) saldo geral "Sem lote" num lote real, informando o número, a validade e a fabricação verdadeiros.
 * Serve para poder ligar o controle por lote sem criar lote fictício. A quantidade sai do saldo geral e entra no lote (o total
 * do produto não muda) e as duas pontas ficam no histórico. Devolve { ok: true, lote } ou { ok: false, message }.
 */
function converterSaldoGeralEmLote(setor, produto, { lote, validade, fabricacao = '', quantidade } = {}) {
    const geral = (produto.lotes || []).find(l => loteEhSaldoGeral(l));
    const saldo = geral ? Number(geral.quantidade) || 0 : 0;
    const q = Number(quantidade);
    const codigo = String(lote || '').trim();
    if (!saldo) return { ok: false, message: 'O produto não tem saldo sem lote.' };
    if (!Number.isInteger(q) || q <= 0) return { ok: false, message: 'Informe a quantidade a converter (inteira, maior que zero).' };
    if (q > saldo) return { ok: false, message: `O saldo sem lote é de ${saldo} un.` };
    if (!codigo) return { ok: false, message: 'Informe o número do lote.' };
    if (codigo.toUpperCase() === LOTE_SEM_CONTROLE) return { ok: false, message: `"${LOTE_SEM_CONTROLE}" é reservado pelo sistema.` };
    if (!validade) return { ok: false, message: 'Informe a validade do lote.' };
    if (validade < new Date().toISOString().slice(0, 10)) return { ok: false, message: 'Validade vencida: item vencido não vira lote do estoque. Descarte por Perdas.' };
    if (fabricacao && fabricacao > validade) return { ok: false, message: 'A fabricação não pode ser depois da validade.' };
    // Mesmas regras de entrada de um produto controlado por lote (lote existente com outra validade é recusado)
    const conf = conferirEntradaLote({ cadastro: { config: { usa_lote: true } }, lotes: produto.lotes }, { lote: codigo, validade }, { retorno: true });
    if (!conf.ok) return { ok: false, message: conf.message };
    const r = addProductWithBatch(setor, { barcode: produto.barcode, lote: codigo, validade, fabricacao, quantidade: q, remessa: geral.remessa || produto.remessa || '' }, { retorno: true });
    if (r.type === 'erro') return { ok: false, message: r.message };
    if (!removeFromBatch(setor, produto.id, geral.id, q)) return { ok: false, message: 'Não foi possível baixar o saldo sem lote: confira o estoque.' };
    logEntryHistory('CONVERSAO_SAIDA', setor, produto.barcode, produto.material, q, LOTE_SEM_CONTROLE, `Convertido no lote ${codigo}`);
    logEntryHistory('CONVERSAO_ENTRADA', setor, produto.barcode, produto.material, q, codigo, 'Conversão do saldo sem lote');
    return { ok: true, lote: r.lote };
}

function deleteSpecificBatch(setor, productId, batchId, loteCode = '') {
    if (typeof SETORES_SEM_AJUSTE_DIRETO !== 'undefined' && SETORES_SEM_AJUSTE_DIRETO.includes(setor)) { showMsg(MSG_SEM_AJUSTE_DIRETO, 'error'); return false; }
    const produto = (MOCK_DATA[setor] || []).find(p => String(p.id) === String(productId));
    const lote = produto && produto.lotes.find(l => String(l.id) === String(batchId));
    if (!lote) {
        showMsg('Lote não encontrado.', 'error');
        return false;
    }

    const pergunta = produtoControlaLote(produto) ? `Zerar o saldo do lote "${loteCode || lote.lote}" (${lote.quantidade} un)? O lote continua registrado.` : `Remover o lote "${loteCode || rotuloLote(lote.lote)}" permanentemente? Esta ação não pode ser desfeita.`;
    if (!confirm(pergunta)) return false;

    const removed = removeFromBatch(setor, produto.id, lote.id, Math.max(lote.quantidade, 0));
    if (removed) {
        showMsg('Lote removido do estoque.');
        render();
    }
    return removed;
}
