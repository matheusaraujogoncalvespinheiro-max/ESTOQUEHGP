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

if (typeof module !== 'undefined' && module.exports) module.exports = { baixarLoteTransacional };
