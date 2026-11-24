// Regras do Storage (#31): anexos só para Administrador, médico e enfermagem; só PDF/JPEG/PNG; sem substituir nem apagar. Emulador, dados fictícios.
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const fs = require('fs');
const P = process.env.PROJETO_RAIZ || require('path').join(__dirname, '..');
let ok = 0, falhas = [];
async function t(nome, fn) { try { await fn(); ok++; console.log('  ok  ', nome); } catch (e) { falhas.push(nome + ' -> ' + (e.message || e).toString().split('\n')[0]); console.log('  FALHOU', nome); } }
(async () => {
    const env = await initializeTestEnvironment({ projectId: 'erp-teste',
        firestore: { rules: fs.readFileSync(P + '/firestore.rules', 'utf8'), host: '127.0.0.1', port: 8085 },
        storage: { rules: fs.readFileSync(P + '/storage.rules', 'utf8'), host: '127.0.0.1', port: 9199 } });
    await env.withSecurityRulesDisabled(async (ctx) => {
        const d = ctx.firestore();
        await d.doc('app_users/medico').set({ role: 'MEDICO', ativo: true, auth_email: 'medico@hgp.app' });
        await d.doc('app_users/recep').set({ role: 'FUNC_RECEPCAO', ativo: true, auth_email: 'recep@hgp.app' });
        await d.doc('app_users/enf').set({ role: 'FUNC_ENFERMAGEM', ativo: false, auth_email: 'enf@hgp.app' });
    });
    const st = (email) => env.authenticatedContext('u-' + email, { email }).storage();
    const dado = (n) => new Uint8Array(n).fill(65);
    const meta = (t) => ({ contentType: t });
    const med = st('medico@hgp.app'), rec = st('recep@hgp.app'), enf = st('enf@hgp.app'), raiz = st('admin@admin.com'), anon = env.unauthenticatedContext().storage();
    await t('médico envia PDF', () => assertSucceeds(med.ref('anexos/p1/a1_laudo.pdf').put(dado(100), meta('application/pdf'))));
    await t('médico lê o anexo', () => assertSucceeds(med.ref('anexos/p1/a1_laudo.pdf').getDownloadURL()));
    await t('administrador raiz lê e envia PNG', async () => { await assertSucceeds(raiz.ref('anexos/p1/a2_foto.png').put(dado(50), meta('image/png'))); await assertSucceeds(raiz.ref('anexos/p1/a1_laudo.pdf').getDownloadURL()); });
    await t('recepção não lê nem envia', async () => { await assertFails(rec.ref('anexos/p1/a1_laudo.pdf').getDownloadURL()); await assertFails(rec.ref('anexos/p1/a3.pdf').put(dado(10), meta('application/pdf'))); });
    await t('usuário inativo (enfermagem) é barrado', () => assertFails(enf.ref('anexos/p1/a4.pdf').put(dado(10), meta('application/pdf'))));
    await t('anônimo não lê nem envia', async () => { await assertFails(anon.ref('anexos/p1/a1_laudo.pdf').getDownloadURL()); await assertFails(anon.ref('anexos/p1/a5.pdf').put(dado(10), meta('application/pdf'))); });
    await t('tipo não aceito é recusado', () => assertFails(med.ref('anexos/p1/a6.exe').put(dado(10), meta('application/x-msdownload'))));
    await t('arquivo acima de 10 MB é recusado', () => assertFails(med.ref('anexos/p1/a7.pdf').put(dado(10 * 1024 * 1024 + 1), meta('application/pdf'))));
    await t('substituir e apagar são negados (até para o administrador)', async () => { await assertFails(med.ref('anexos/p1/a1_laudo.pdf').put(dado(20), meta('application/pdf'))); await assertFails(raiz.ref('anexos/p1/a1_laudo.pdf').delete()); });
    await t('outros caminhos continuam fechados', () => assertFails(raiz.ref('outros/x.pdf').put(dado(10), meta('application/pdf'))));
    await t('permissões editadas valem no Storage: conceder prontuario_ver abre a leitura; retirar fecha para o médico', async () => {
        await env.withSecurityRulesDisabled(async (ctx) => {
            await ctx.firestore().doc('config_permissoes/FUNC_RECEPCAO').set({ role: 'FUNC_RECEPCAO', concede: ['prontuario_ver', 'prontuario_evoluir'], revoga: [] });
        });
        await assertSucceeds(rec.ref('anexos/p1/a1_laudo.pdf').getDownloadURL());
        await assertSucceeds(rec.ref('anexos/p1/a8.pdf').put(dado(10), meta('application/pdf')));
        await env.withSecurityRulesDisabled(async (ctx) => {
            await ctx.firestore().doc('config_permissoes/MEDICO').set({ role: 'MEDICO', concede: [], revoga: ['prontuario_evoluir'] });
        });
        await assertSucceeds(med.ref('anexos/p1/a1_laudo.pdf').getDownloadURL());
        await assertFails(med.ref('anexos/p1/a9.pdf').put(dado(10), meta('application/pdf')));
    });
    await env.cleanup();
    console.log(`\n${ok} ok, ${falhas.length} falhas`); falhas.forEach(f => console.log(' -', f));
    process.exit(falhas.length ? 1 : 0);
})();
