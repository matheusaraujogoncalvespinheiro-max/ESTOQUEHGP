// Regras de configurações do hospital, sistema em uso e conteúdo de anexos (emulador do Firestore, dados fictícios).
// Rodar:  npx firebase-tools emulators:exec --only firestore --project erp-teste "node tests-emulador/config-hospital.test.js"
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const fs = require('fs');

const RULES = require('path').join(__dirname, '..', 'firestore.rules');
const usuarios = {
    admin: { role: 'ADMIN', name: 'Admin', ativo: true, auth_email: 'admin@hgp.app' },
    dir: { role: 'DIRETORIA', name: 'Direção', ativo: true, auth_email: 'dir@hgp.app' },
    med: { role: 'MEDICO', name: 'Médico', ativo: true, auth_email: 'med@hgp.app' },
    enf: { role: 'FUNC_ENFERMAGEM', name: 'Enfermagem', ativo: true, auth_email: 'enf@hgp.app' },
    lab: { role: 'FUNC_LABORATORIO', name: 'Laboratório', ativo: true, auth_email: 'lab@hgp.app' }
};
let ok = 0; const falhas = [];
async function t(nome, fn) { try { await fn(); ok++; console.log('  ok  ', nome); } catch (e) { falhas.push(nome + ' -> ' + (e.message || e).toString().split('\n')[0]); console.log('  FALHA', nome); } }

(async () => {
    const env = await initializeTestEnvironment({ projectId: 'erp-teste', firestore: { rules: fs.readFileSync(RULES, 'utf8'), host: '127.0.0.1', port: 8085 } });
    await env.withSecurityRulesDisabled(async (ctx) => {
        const d = ctx.firestore();
        for (const [u, v] of Object.entries(usuarios)) await d.doc(`app_users/${u}`).set({ username: u, ...v });
        await d.doc('anexos_conteudo/a0').set({ id: 'a0', paciente_id: 'p1', base64: 'QQ==', autor: 'med' });
    });
    const como = (u) => env.authenticatedContext('uid-' + u, { email: usuarios[u].auth_email }).firestore();

    await t('Direção grava parâmetro (meta)', () => assertSucceeds(como('dir').doc('cad_parametro/par_meta_ocupacao_pct').set({ chave: 'meta_ocupacao_pct', valor: 85, ativo: true })));
    await t('Administrador grava parâmetro', () => assertSucceeds(como('admin').doc('cad_parametro/par_x').set({ chave: 'x', valor: 1 })));
    await t('médico NÃO grava parâmetro', () => assertFails(como('med').doc('cad_parametro/par_y').set({ chave: 'y', valor: 1 })));
    await t('médico lê parâmetro', () => assertSucceeds(como('med').doc('cad_parametro/par_meta_ocupacao_pct').get()));
    await t('ninguém apaga parâmetro', () => assertFails(como('admin').doc('cad_parametro/par_meta_ocupacao_pct').delete()));
    await t('Direção grava opção de lista', () => assertSucceeds(como('dir').doc('cad_listaapoio/lst_HEMOCOMPONENTES_X').set({ lista: 'HEMOCOMPONENTES', codigo: 'X', rotulo: 'Teste', ativo: true })));
    await t('enfermagem NÃO grava opção de lista', () => assertFails(como('enf').doc('cad_listaapoio/lst_HEMOCOMPONENTES_Y').set({ lista: 'HEMOCOMPONENTES', codigo: 'Y', rotulo: 'Teste' })));
    await t('Direção grava o sistema em uso', () => assertSucceeds(como('dir').doc('config_sistema/sistemas').set({ id: 'sistemas', sistemas: { checagem: 'BEIRA_LEITO' } })));
    await t('Direção NÃO grava outro documento em config_sistema', () => assertFails(como('dir').doc('config_sistema/outro').set({ id: 'outro' })));
    await t('médico NÃO altera o sistema em uso', () => assertFails(como('med').doc('config_sistema/sistemas').set({ id: 'sistemas', sistemas: {} })));
    await t('médico lê o sistema em uso', () => assertSucceeds(como('med').doc('config_sistema/sistemas').get()));
    await t('médico cria conteúdo de anexo próprio', () => assertSucceeds(como('med').doc('anexos_conteudo/a1').set({ id: 'a1', paciente_id: 'p1', base64: 'QQ==', autor: 'med' })));
    await t('médico NÃO cria conteúdo em nome de outro', () => assertFails(como('med').doc('anexos_conteudo/a2').set({ id: 'a2', paciente_id: 'p1', base64: 'QQ==', autor: 'enf' })));
    await t('conteúdo de anexo acima do limite é recusado', () => assertFails(como('med').doc('anexos_conteudo/a3').set({ id: 'a3', paciente_id: 'p1', base64: 'A'.repeat(1000001), autor: 'med' })));
    await t('conteúdo de anexo não é alterado nem apagado', async () => {
        await assertFails(como('med').doc('anexos_conteudo/a1').update({ base64: 'Qg==' }));
        await assertFails(como('med').doc('anexos_conteudo/a1').delete());
    });
    await t('médico lê o conteúdo; laboratório NÃO', async () => {
        await assertSucceeds(como('med').doc('anexos_conteudo/a0').get());
        await assertFails(como('lab').doc('anexos_conteudo/a0').get());
    });

    await env.cleanup();
    console.log(`\n${ok} passaram, ${falhas.length} falharam`);
    falhas.forEach(f => console.log(' - ' + f));
    process.exit(falhas.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
