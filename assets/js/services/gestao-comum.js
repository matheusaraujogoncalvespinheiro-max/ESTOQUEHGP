// Gestão (Etapa 10): utilitário compartilhado por ouvidoria, qualidade e ensino e pesquisa.
//
// O QUE É: a mudança de situação de um documento dentro de uma transação (relê o documento, confere que o passo ainda vale, grava a nova
// linha do histórico). Duas pessoas não fazem o mesmo passo ao mesmo tempo: a segunda recebe "este passo já foi registrado".
//
// O QUE NÃO É: não define prazos nem metas. Prazos digitados pelo responsável são só dados do registro.

/**
 * Muda a situação de `col/id` conferindo o mapa de transições.
 * `perm`: permissão exigida; `campos(doc, user, agora)`: campos extras a gravar; `autoriza(doc, user)`: regra extra (lança erro).
 */
async function gestaoMudarSituacao({ col, id, para, mapa, rotulos, perm, entidade, acao, texto = '', campos = () => ({}), autoriza = null, naoEncontrado = 'Registro não encontrado.' }) {
    if (perm) requirePermission(perm);
    const database = requireDb(); const user = state.currentUser; const agora = nowISO();
    let nova; let antes;
    await database.runTransaction(async (tx) => {
        const ref = database.collection(col).doc(String(id));
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error(naoEncontrado);
        const atual = { id: snap.id, ...snap.data() };
        apoioPodeIr(mapa, atual.status, para, rotulos);
        if (autoriza) autoriza(atual, user);
        antes = atual.status;
        nova = { ...atual, ...campos(atual, user, agora), status: para, historico: [...(atual.historico || []), apoioLinhaHistorico(para, user, agora, texto)] };
        tx.set(ref, nova);
    });
    await auditar({ entidade, entidade_id: id, acao, antes: { status: antes }, depois: { status: para }, motivo: texto });
    return nova;
}

/** Cria um documento numerado (protocolo por contador). `monta(numero)` devolve o documento sem id nem histórico inicial. */
async function gestaoCriarNumerado({ col, contador, prefixo, prefixoId, monta, entidade, acao = 'REGISTRAR', resumoAuditoria }) {
    const database = requireDb(); const user = state.currentUser; const agora = nowISO();
    let doc;
    await database.runTransaction(async (tx) => {
        const c = await apoioProximoNumero(tx, database, contador);
        doc = { id: newId(prefixoId), protocolo: apoioProtocolo(prefixo, c.n), ...monta(c.n), dia: todayISO(), criado_em: agora, ...apoioQuem(user) };
        tx.set(c.ref, { ultimo: c.n });
        tx.set(database.collection(col).doc(doc.id), doc);
    });
    await auditar({ entidade, entidade_id: doc.id, acao, depois: resumoAuditoria ? resumoAuditoria(doc) : null });
    return doc;
}

/** Média arredondada (1 casa) de uma lista de números; `null` quando vazia. */
const gestaoMedia = (valores) => { const v = (valores || []).filter(x => x !== null && x !== undefined && !Number.isNaN(x)); return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length * 10) / 10 : null; };
/** Dias (com 1 casa) entre dois instantes ISO. */
const gestaoDiasEntre = (aISO, bISO) => Math.max(0, Math.round((new Date(bISO).getTime() - new Date(aISO).getTime()) / 86400000 * 10) / 10);
/** Minutos inteiros entre dois instantes ISO. */
const gestaoMinEntre = (aISO, bISO) => Math.max(0, Math.round((new Date(bISO).getTime() - new Date(aISO).getTime()) / 60000));
