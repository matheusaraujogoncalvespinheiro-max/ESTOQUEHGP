const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
global.COL_OS = 'os_manutencao';
const { relatorioBuscarPeriodo } = require('../assets/js/services/relatorio-periodo.js');
const assert = require('assert');
(async () => {
    const env = await initializeTestEnvironment({ projectId: 'erp-teste', firestore: { host: '127.0.0.1', port: 8085, rules: 'rules_version="2"; service cloud.firestore { match /databases/{d}/documents { match /{a=**} { allow read, write: if true; } } }' } });
    await env.withSecurityRulesDisabled(async (ctx) => {
        const d = ctx.firestore();
        for (const [id, dia] of [['o1', '2026-01-10'], ['o2', '2026-02-15'], ['o3', '2026-03-20'], ['o4', '2025-12-31']]) await d.doc('os_manutencao/' + id).set({ dia, status: 'ABERTA' });
        let r = await relatorioBuscarPeriodo(d, 'MANUTENCAO_REL', '2026-01-01', '2026-02-28');
        assert.deepEqual(r.extra.os.map(x => x.id).sort(), ['o1', 'o2']);
        r = await relatorioBuscarPeriodo(d, 'MANUTENCAO_REL', '2026-02-01', '');
        assert.deepEqual(r.extra.os.map(x => x.id).sort(), ['o2', 'o3']);
        r = await relatorioBuscarPeriodo(d, 'MANUTENCAO_REL', '', '2026-01-31');
        assert.deepEqual(r.extra.os.map(x => x.id).sort(), ['o1', 'o4']);
        assert.equal(r.truncado, false);
    });
    console.log('PERIODO OK'); await env.cleanup(); process.exit(0);
})().catch(e => { console.error('FALHOU', e); process.exit(1); });
