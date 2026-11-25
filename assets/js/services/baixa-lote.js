// Baixa de lote no banco, em TRANSAÇÃO (pendência #49).
//
// O QUE É: diminui o saldo de um lote em product_batches lendo o saldo atual e gravando o novo na mesma transação. Se duas pessoas
// retirarem do mesmo lote ao mesmo tempo, o Firestore repete a transação da segunda com o saldo já descontado: o saldo nunca fica
// negativo e nenhuma saída se perde. Antes, cada tela gravava o saldo ABSOLUTO que tinha na memória, e a última gravação vencia.
// O QUE NÃO É: não escolhe lote (FEFO e validade continuam em services/estoque.js), não registra histórico e não mexe no produto.

/** Doc id do lote: `<idDoProduto>_<códigoDoLote>` (mesma regra de db_saveBatch). Devolve { ok, saldo } ou { ok: false, semDocumento: true }. */
async function baixarLoteTransacional(database, productId, loteCodigo, quantidade) {
    const q = Number(quantidade);
    if (!Number.isInteger(q) || q <= 0) throw new Error('Quantidade de baixa inválida.');
    const ref = database.collection('product_batches').doc(`${productId}_${loteCodigo}`);
    return database.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return { ok: false, semDocumento: true };   // lote ainda só na memória: o chamador grava o lote inteiro
        const atual = Number(snap.data().quantity) || 0;
        if (atual < q) {
            const err = new Error(`Saldo insuficiente no lote ${loteCodigo}: disponível ${atual}, pedido ${q}.`);
            err.saldoInsuficiente = true;
            throw err;
        }
        tx.update(ref, { quantity: atual - q, atualizado_em: new Date().toISOString() });
        return { ok: true, saldo: atual - q };
    });
}

/**
 * ENTRADA em lote, também em transação: soma a quantidade ao saldo que está no banco (nunca grava um saldo absoluto da memória).
 * Se o lote ainda não existe, cria o documento com os dados informados (validade, fabricação, preço, prateleira...).
 * Entrada em lote que já existe só muda o saldo (e reativa o lote, se for um retorno); os demais dados do lote não são tocados.
 */
async function entrarLoteTransacional(database, productId, loteCodigo, quantidade, dadosNovo = {}) {
    const q = Number(quantidade);
    if (!(q > 0)) throw new Error('Quantidade de entrada inválida.');
    const docId = `${productId}_${loteCodigo}`;
    const ref = database.collection('product_batches').doc(docId);
    const agora = new Date().toISOString();
    return database.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists) {
            const atual = Number(snap.data().quantity) || 0;
            tx.update(ref, { quantity: atual + q, ativo: true, atualizado_em: agora });
            return { ok: true, saldo: atual + q, novo: false };
        }
        const limpo = {};
        Object.entries(dadosNovo || {}).forEach(([k, v]) => { if (v !== undefined) limpo[k] = v; });
        tx.set(ref, {
            ...limpo,
            id: docId, product_id: productId, lote_code: loteCodigo,
            validade: limpo.validade || 'N/A',
            quantity: q, qtd_inicial: q, ativo: true,
            data_entrada: limpo.data_entrada || agora.slice(0, 10),
            criado_em: agora, atualizado_em: agora
        });
        return { ok: true, saldo: q, novo: true };
    });
}

/** Cadastra um lote SEM saldo (aba Lotes, quantidade inicial 0). Recusa se o número já existe no produto: nunca duplica nem sobrescreve. */
async function criarLoteSemSaldoTransacional(database, productId, loteCodigo, dados = {}) {
    const docId = `${productId}_${loteCodigo}`;
    const ref = database.collection('product_batches').doc(docId);
    const agora = new Date().toISOString();
    return database.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists) throw new Error(`O lote ${loteCodigo} já está cadastrado neste produto.`);
        const limpo = {};
        Object.entries(dados || {}).forEach(([k, v]) => { if (v !== undefined) limpo[k] = v; });
        tx.set(ref, { ...limpo, id: docId, product_id: productId, lote_code: loteCodigo, validade: limpo.validade || 'N/A', quantity: 0, qtd_inicial: 0, ativo: true,
            data_entrada: limpo.data_entrada || agora.slice(0, 10), criado_em: agora, atualizado_em: agora });
        return { ok: true, id: docId };
    });
}

if (typeof module !== 'undefined' && module.exports) module.exports = { baixarLoteTransacional, entrarLoteTransacional, criarLoteSemSaldoTransacional };
