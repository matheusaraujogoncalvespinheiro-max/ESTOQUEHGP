// Testes de acesso permitido e negado das regras (emulador do Firestore, dados fictícios).
// Rodar na raiz do projeto:  npx firebase-tools emulators:exec --only firestore --project erp-teste "node tests-emulador/regras.test.js"  (precisa de Java e do pacote @firebase/rules-unit-testing)
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const fs = require('fs');
const assert = require('assert');

const RULES = require('path').join(__dirname, '..', 'firestore.rules');
const usuarios = {
    admin: { role: 'ADMIN', name: 'Admin Teste', ativo: true, auth_email: 'admin@admin.com' },
    recep: { role: 'FUNC_RECEPCAO', name: 'Recepcao Teste', ativo: true, auth_email: 'recep@hgp.app' },
    medico: { role: 'MEDICO', name: 'Medico Teste', ativo: true, auth_email: 'medico@hgp.app' },
    inativo: { role: 'FUNC_RECEPCAO', name: 'Inativo', ativo: false, auth_email: 'inativo@hgp.app' },
    farm: { role: 'FUNC_FARMACIA', name: 'Farmacia', ativo: true, auth_email: 'farm@hgp.app' }
};
let ok = 0, falhas = [];
async function t(nome, fn) { try { await fn(); ok++; console.log('  ok  ', nome); } catch (e) { falhas.push(nome + ' -> ' + (e.message || e).toString().split('\n')[0]); console.log('  FALHA', nome); } }

(async () => {
    const env = await initializeTestEnvironment({ projectId: 'erp-teste', firestore: { rules: fs.readFileSync(RULES, 'utf8'), host: '127.0.0.1', port: 8085 } });
    await env.withSecurityRulesDisabled(async (ctx) => {
        const d = ctx.firestore();
        for (const [u, v] of Object.entries(usuarios)) await d.doc(`app_users/${u}`).set({ username: u, ...v });
        await d.doc('pacientes/p1').set({ nome: 'Paciente Teste' });
        await d.doc('atendimentos/a1').set({ paciente_nome: 'Paciente Teste', status: 'AGUARDANDO' });
    });
    const como = (email) => env.authenticatedContext('uid-' + email, { email }).firestore();
    const anon = env.unauthenticatedContext().firestore();

    await t('administrador raiz (admin@admin.com) lê e grava sem documento em app_users', async () => {
        const raiz = como('admin@admin.com');
        await assertSucceeds(raiz.doc('pacientes/p1').get());
        await assertSucceeds(raiz.doc('app_users/admin').set({ username: 'admin', role: 'ADMIN', name: 'Raiz', ativo: true, auth_email: 'admin@admin.com' }));
    });
    await t('anônimo não lê app_users', () => assertFails(anon.doc('app_users/admin').get()));
    await t('anônimo não lê pacientes', () => assertFails(anon.doc('pacientes/p1').get()));
    await t('anônimo não escreve', () => assertFails(anon.doc('pacientes/p2').set({ nome: 'x' })));
    await t('admin lê lista de usuários', () => assertSucceeds(como('admin@admin.com').collection('app_users').get()));
    await t('admin cria usuário', () => assertSucceeds(como('admin@admin.com').doc('app_users/novo').set({ username: 'novo', role: 'MEDICO', name: 'N', ativo: true, auth_email: 'novo@hgp.app' })));
    await t('recepção lê o próprio cadastro', () => assertSucceeds(como('recep@hgp.app').doc('app_users/recep').get()));
    await t('recepção NÃO lê cadastro de outro', () => assertFails(como('recep@hgp.app').doc('app_users/admin').get()));
    await t('recepção NÃO lista usuários', () => assertFails(como('recep@hgp.app').collection('app_users').get()));
    await t('recepção NÃO se promove a ADMIN', () => assertFails(como('recep@hgp.app').doc('app_users/recep').update({ role: 'ADMIN' })));
    await t('recepção NÃO cria usuário', () => assertFails(como('recep@hgp.app').doc('app_users/x').set({ role: 'ADMIN', auth_email: 'recep@hgp.app' })));
    await t('recepção altera o próprio nome', () => assertSucceeds(como('recep@hgp.app').doc('app_users/recep').update({ name: 'Novo Nome' })));
    await t('ninguém apaga usuário (nem admin)', () => assertFails(como('admin@admin.com').doc('app_users/recep').delete()));
    await t('conta com mesmo prefixo e outro domínio NÃO ganha acesso', () => assertFails(como('admin@outro.com').doc('app_users/admin').get()));
    await t('conta sem cadastro não lê nada', () => assertFails(como('fantasma@hgp.app').doc('pacientes/p1').get()));
    await t('usuário inativo é barrado', () => assertFails(como('inativo@hgp.app').doc('pacientes/p1').get()));
    await t('recepção lê paciente', () => assertSucceeds(como('recep@hgp.app').doc('pacientes/p1').get()));
    await t('recepção cria atendimento', () => assertSucceeds(como('recep@hgp.app').doc('atendimentos/a2').set({ status: 'AGUARDANDO', paciente_nome: 'Outro' })));
    await t('farmácia NÃO lê atendimentos', () => assertFails(como('farm@hgp.app').doc('atendimentos/a1').get()));
    await t('farmácia NÃO cria atendimento', () => assertFails(como('farm@hgp.app').doc('atendimentos/a3').set({ status: 'AGUARDANDO' })));
    await t('ninguém apaga atendimento', () => assertFails(como('admin@admin.com').doc('atendimentos/a1').delete()));

    await env.cleanup();
    console.log(`\n${ok} passaram, ${falhas.length} falharam`);
    falhas.forEach(f => console.log(' - ' + f));
    process.exit(falhas.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
