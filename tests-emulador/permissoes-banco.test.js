// #5 e #39 nas regras: permissões lidas do banco (registros_clinicos, leitos_estado) e estrutura de leitos. Emulador, dados fictícios.
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const fs = require('fs');
const RULES = require('path').join(__dirname, '..', 'firestore.rules');
const usuarios = {
    admin: { role: 'ADMIN', ativo: true, auth_email: 'admin@admin.com' },
    recep: { role: 'FUNC_RECEPCAO', ativo: true, auth_email: 'recep@hgp.app' },
    enf: { role: 'FUNC_ENFERMAGEM', ativo: true, auth_email: 'enf@hgp.app' },
    medico: { role: 'MEDICO', ativo: true, auth_email: 'medico@hgp.app' },
    lab: { role: 'FUNC_LABORATORIO', ativo: true, auth_email: 'lab@hgp.app' },
    novo: { role: 'X_AUDITOR', ativo: true, auth_email: 'novo@hgp.app' },
    manut: { role: 'FUNC_MANUTENCAO', ativo: true, auth_email: 'manut@hgp.app' }
};
const reg = { tipo: 'EVOLUCAO', texto: 'x', autor: 'enf', assinado: true, paciente_id: 'p1' };
let ok = 0, falhas = [];
async function t(nome, fn) { try { await fn(); ok++; console.log('  ok  ', nome); } catch (e) { falhas.push(nome + ' -> ' + (e.message || e).toString().split('\n')[0]); console.log('  FALHOU', nome); } }
(async () => {
    const env = await initializeTestEnvironment({ projectId: 'erp-teste', firestore: { rules: fs.readFileSync(RULES, 'utf8'), host: '127.0.0.1', port: 8085 } });
    await env.withSecurityRulesDisabled(async (ctx) => {
        const d = ctx.firestore();
        for (const [u, v] of Object.entries(usuarios)) await d.doc(`app_users/${u}`).set({ username: u, name: u, ...v });
        await d.doc('registros_clinicos/r1').set(reg);
        await d.doc('leitos_estado/101A').set({ status: 'LIVRE' });
    });
    const como = (email) => env.authenticatedContext('uid-' + email, { email }).firestore();
    const admin = como('admin@admin.com'), recep = como('recep@hgp.app'), enf = como('enf@hgp.app');

    await t('sem documento: recepção não lê prontuário e enfermagem lê', async () => {
        await assertFails(recep.doc('registros_clinicos/r1').get());
        await assertSucceeds(enf.doc('registros_clinicos/r1').get());
    });
    await t('só o Administrador grava config_permissoes; todos logados leem; ninguém apaga', async () => {
        await assertFails(recep.doc('config_permissoes/FUNC_RECEPCAO').set({ role: 'FUNC_RECEPCAO', concede: ['prontuario_ver'], revoga: [] }));
        await assertSucceeds(admin.doc('config_permissoes/FUNC_RECEPCAO').set({ role: 'FUNC_RECEPCAO', concede: ['prontuario_ver'], revoga: [] }));
        await assertSucceeds(recep.doc('config_permissoes/FUNC_RECEPCAO').get());
        await assertFails(admin.doc('config_permissoes/FUNC_RECEPCAO').delete());
    });
    await t('concedido no banco: recepção passa a ler o prontuário (mas não grava)', async () => {
        await assertSucceeds(recep.doc('registros_clinicos/r1').get());
        await assertFails(recep.doc('registros_clinicos/r2').set({ ...reg, autor: 'recep' }));
    });
    await t('retirado no banco: enfermagem perde a leitura e a gravação do prontuário', async () => {
        await assertSucceeds(admin.doc('config_permissoes/FUNC_ENFERMAGEM').set({ role: 'FUNC_ENFERMAGEM', concede: [], revoga: ['prontuario_ver', 'prontuario_evoluir'] }));
        await assertFails(enf.doc('registros_clinicos/r1').get());
        await assertFails(enf.doc('registros_clinicos/r3').set(reg));
    });
    await t('medico (sem documento) continua gravando prontuário assinado como ele mesmo', () => assertSucceeds(como('medico@hgp.app').doc('registros_clinicos/r4').set({ ...reg, autor: 'medico' })));
    await t('retirar leito_gerenciar bloqueia gravação em leitos_estado da enfermagem', async () => {
        await assertSucceeds(enf.doc('leitos_estado/101A').set({ status: 'OCUPADO' }));
        await assertSucceeds(admin.doc('config_permissoes/FUNC_ENFERMAGEM').set({ role: 'FUNC_ENFERMAGEM', concede: [], revoga: ['leito_gerenciar'] }));
        await assertFails(enf.doc('leitos_estado/101A').set({ status: 'LIVRE' }));
    });
    await t('leitos_estrutura: Administrador cria e atualiza, ninguém apaga, recepção lê mas não grava', async () => {
        await assertSucceeds(admin.doc('leitos_estrutura/101A').set({ id: '101A', andar: '1', quarto: '101', letra: 'A', ala: 'Ala', ativo: true }));
        await assertSucceeds(admin.doc('leitos_estrutura/101A').update({ ala: 'Outra' }));
        await assertFails(admin.doc('leitos_estrutura/101A').delete());
        await assertSucceeds(recep.doc('leitos_estrutura/101A').get());
        await assertFails(recep.doc('leitos_estrutura/101B').set({ id: '101B' }));
    });
    await t('laboratório (#29): médico pede, laboratório coleta e libera, resultado liberado não muda, ninguém apaga', async () => {
        const med = como('medico@hgp.app'), lab = como('lab@hgp.app');
        const ped = { status: 'SOLICITADO', solicitante: 'medico', paciente_nome: 'P', exame_nome: 'Hemograma' };
        await assertFails(lab.doc('lab_pedidos/l1').set(ped));
        await assertFails(recep.doc('lab_pedidos/l1').set({ ...ped, solicitante: 'recep' }));
        await assertSucceeds(med.doc('lab_pedidos/l1').set(ped));
        await assertSucceeds(lab.doc('lab_pedidos/l1').get());
        await assertSucceeds(med.doc('lab_pedidos/l1').get());
        await assertFails(recep.doc('lab_pedidos/l1').get());
        await assertSucceeds(lab.doc('lab_pedidos/l1').update({ status: 'COLETADO' }));
        await assertFails(med.doc('lab_pedidos/l1').update({ status: 'LIBERADO' }));
        await assertSucceeds(lab.doc('lab_pedidos/l1').update({ status: 'LIBERADO', resultado: { linhas: [] } }));
        await assertFails(lab.doc('lab_pedidos/l1').update({ resultado: { linhas: ['alterado'] } }));
        await assertFails(admin.doc('lab_pedidos/l1').delete());
        await assertSucceeds(med.doc('lab_pedidos/l2').set(ped));
        await assertSucceeds(med.doc('lab_pedidos/l2').update({ status: 'CANCELADO' }));
    });
    await t('anexos (#31): médico registra o anexo como autor; laboratório não lê; ninguém altera nem apaga', async () => {
        const med = como('medico@hgp.app');
        const a = { paciente_id: 'p1', nome: 'x.pdf', autor: 'medico', caminho: 'anexos/p1/a_x.pdf' };
        await assertFails(med.doc('anexos_clinicos/x1').set({ ...a, autor: 'outro' }));
        await assertSucceeds(med.doc('anexos_clinicos/x1').set(a));
        await assertSucceeds(med.doc('anexos_clinicos/x1').get());
        await assertFails(como('lab@hgp.app').doc('anexos_clinicos/x1').get());
        await assertFails(med.doc('anexos_clinicos/x1').update({ nome: 'y.pdf' }));
        await assertFails(admin.doc('anexos_clinicos/x1').update({ nome: 'y.pdf' }));
        await assertFails(admin.doc('anexos_clinicos/x1').delete());
    });
    await t('óbito (#68): qualquer usuário logado confere a marca de UM paciente, mas só médico e enfermagem listam; a marca não muda', async () => {
        await env.withSecurityRulesDisabled(async (ctx) => { await ctx.firestore().doc('obito_paciente/p9').set({ id: 'p9', obito_id: 'o1' }); });
        await assertSucceeds(recep.doc('obito_paciente/p9').get());
        await assertFails(recep.collection('obito_paciente').get());
        await assertSucceeds(como('medico@hgp.app').collection('obito_paciente').get());
        await assertFails(como('anon@x.com').doc('obito_paciente/p9').get());
        await assertFails(como('medico@hgp.app').doc('obito_paciente/p9').update({ obito_id: 'x' }));
    });
    await t('perfil personalizado (X_): nasce sem acesso; o que for concedido vale nas coleções que leem config_permissoes', async () => {
        await env.withSecurityRulesDisabled(async (ctx) => { await ctx.firestore().doc('obitos/o1').set({ protocolo: 'OB1' }); await ctx.firestore().doc('processo_enfermagem/pe1').set({ paciente_id: 'p1' }); });
        const novo = como('novo@hgp.app');
        await assertFails(novo.doc('obitos/o1').get());
        await assertSucceeds(admin.doc('config_permissoes/X_AUDITOR').set({ role: 'X_AUDITOR', nome: 'Auditor', personalizado: true, concede: ['obito_ver'], revoga: [] }));
        await assertSucceeds(novo.doc('obitos/o1').get());
        await assertFails(novo.doc('obitos/o2').set({ protocolo: 'OB2' }));          // só leitura: não concedeu obito_registrar
        await assertFails(novo.doc('processo_enfermagem/pe1').get());              // outra área continua fechada
    });
    await t('enfermagem e manutenção: processo e curativos só criam; retirar enfermagem_registrar bloqueia; movimentação só da manutenção', async () => {
        await assertSucceeds(admin.doc('config_permissoes/FUNC_ENFERMAGEM').set({ role: 'FUNC_ENFERMAGEM', concede: [], revoga: [] }));
        await assertSucceeds(enf.doc('processo_enfermagem/pe2').set({ paciente_id: 'p1', por: 'enf' }));
        await assertFails(enf.doc('processo_enfermagem/pe2').update({ texto: 'x' }));
        await assertFails(enf.doc('processo_enfermagem/pe3').set({ paciente_id: 'p1', por: 'outro' }));
        await assertSucceeds(enf.doc('curativos_enfermagem/c1').set({ paciente_id: 'p1', por: 'enf' }));
        await assertSucceeds(admin.doc('config_permissoes/FUNC_ENFERMAGEM').set({ role: 'FUNC_ENFERMAGEM', concede: [], revoga: ['enfermagem_registrar'] }));
        await assertFails(enf.doc('curativos_enfermagem/c2').set({ paciente_id: 'p1', por: 'enf' }));
        const man = como('manut@hgp.app');
        await assertSucceeds(man.doc('equipamento_movimentacoes/m1').set({ equipamento_id: 'e1' }));
        await assertFails(man.doc('equipamento_movimentacoes/m1').update({ para: 'x' }));
        await assertFails(recep.doc('equipamento_movimentacoes/m2').set({ equipamento_id: 'e1' }));
        await assertFails(man.doc('equipamento_testes_eletricos/t1').delete());
    });
    await env.cleanup();
    console.log(`\n${ok} ok, ${falhas.length} falhas`); falhas.forEach(f => console.log(' -', f));
    process.exit(falhas.length ? 1 : 0);
})();
