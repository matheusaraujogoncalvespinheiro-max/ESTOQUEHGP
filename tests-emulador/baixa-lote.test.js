const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const { baixarLoteTransacional } = require('../assets/js/services/baixa-lote.js');
const assert = require('assert');
(async () => {
    const env = await initializeTestEnvironment({ projectId: 'erp-teste', firestore: { host: '127.0.0.1', port: 8085, rules: 'rules_version="2"; service cloud.firestore { match /databases/{d}/documents { match /{a=**} { allow read, write: if true; } } }' } });
    let saldoFinal;
    await env.withSecurityRulesDisabled(async (ctx) => {
        const d = ctx.firestore();
        await d.doc('product_batches/P1_L1').set({ quantity: 10 });
        // 8 retiradas de 2 ao mesmo tempo, saldo 10: só 5 podem passar
        const res = await Promise.allSettled(Array.from({ length: 8 }, () => baixarLoteTransacional(d, 'P1', 'L1', 2)));
        const ok = res.filter(r => r.status === 'fulfilled' && r.value.ok).length;
        const recusadas = res.filter(r => r.status === 'rejected' && r.reason.saldoInsuficiente).length;
        saldoFinal = (await d.doc('product_batches/P1_L1').get()).data().quantity;
        console.log({ ok, recusadas, saldoFinal });
        assert.equal(ok, 5); assert.equal(recusadas, 3); assert.equal(saldoFinal, 0);
        const semDoc = await baixarLoteTransacional(d, 'P1', 'NAO', 1);
        assert.deepEqual(semDoc, { ok: false, semDocumento: true });
        await assert.rejects(baixarLoteTransacional(d, 'P1', 'L1', 0), /inválida/);
    });
    console.log('BAIXA TRANSACIONAL OK');
    await env.cleanup(); process.exit(0);
})().catch(e => { console.error('FALHOU', e); process.exit(1); });
