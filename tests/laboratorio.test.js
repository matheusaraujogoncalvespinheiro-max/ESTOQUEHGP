// #29: laboratório. Só dados fictícios; o banco é um Firestore simulado em memória.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function criar() {
    const store = {};
    const clone = (o) => JSON.parse(JSON.stringify(o));
    const ref = (col, id) => ({ col, id: String(id), get: async () => { const d = (store[col] || {})[String(id)]; return { id: String(id), exists: d !== undefined, data: () => clone(d) }; } });
    const banco = { collection: (c) => ({ doc: (id) => ref(c, id) }),
        runTransaction: async (fn) => { const w = []; await fn({ get: (r) => r.get(), set: (r, d) => w.push([r, d]) }); w.forEach(([r, d]) => { (store[r.col] = store[r.col] || {})[r.id] = clone(d); }); } };
    const auditoria = [];
    const ctx = vm.createContext({ console, state: { currentUser: null }, MOCK_DATA: {}, nowISO: () => new Date().toISOString(), todayISO: () => new Date().toISOString().slice(0, 10),
        newId: (p) => p + '_' + Math.random().toString(36).slice(2, 8), requireDb: () => banco, auditar: async (e) => { auditoria.push(e); },
        hasPermission: (a) => ({ MEDICO: ['laboratorio_solicitar', 'laboratorio_ver'], FUNC_LABORATORIO: ['laboratorio_executar', 'laboratorio_ver'] }[ctx.state.currentUser.role] || []).includes(a),
        requirePermission: (a) => { if (!ctx.hasPermission(a)) throw new Error('Acesso negado: seu perfil não tem permissão para esta operação.'); },
        cadRowsOf: () => [{ id: 'ex1', nome: 'Hemograma', material: 'Sangue', ativo: true }, { id: 'ex2', nome: 'Inativo', ativo: false }],
        db_getPaciente: async (id) => (id === 'p1' ? { id: 'p1', nome: 'Paciente Teste', prontuario: '1001' } : null), WATCHER_FACTORIES: {} });
    vm.runInContext(fs.readFileSync('assets/js/services/apoio-comum.js', 'utf8'), ctx);
    vm.runInContext(fs.readFileSync('assets/js/services/laboratorio.js', 'utf8'), ctx);
    return { ctx, store, auditoria };
}
const entrar = (c, role, u) => { c.state.currentUser = { role, username: u, name: u }; };
const run = (c, code) => vm.runInContext(code, c);

test('laboratório (#29): validação do pedido e do resultado', () => {
    const { ctx } = criar();
    assert.throws(() => run(ctx, "validarPedidoLab({ exame_id: 'ex1' })"), /paciente/);
    assert.throws(() => run(ctx, "validarPedidoLab({ paciente_id: 'p1' })"), /exame/);
    assert.throws(() => run(ctx, "validarResultadoLab([])"), /pelo menos uma linha/);
    assert.throws(() => run(ctx, "validarResultadoLab([{ analito: 'Hb', valor: '' }])"), /valor/);
    const r = JSON.parse(run(ctx, "JSON.stringify(validarResultadoLab([{ analito: ' Hemoglobina ', valor: '13,2', unidade: 'g/dL', referencia: '12 a 16' }, {}], ' ok '))"));
    assert.deepEqual([r.linhas.length, r.linhas[0].analito, r.observacao], [1, 'Hemoglobina', 'ok']);
});

test('laboratório (#29): fluxo pedido → coleta → liberação, com histórico e sem alterar depois de liberado', async () => {
    const { ctx, store, auditoria } = criar();
    entrar(ctx, 'MEDICO', 'med');
    const p = await run(ctx, "solicitarExameLab({ paciente_id: 'p1', exame_id: 'ex1', prioridade: 'URGENTE' })");
    assert.deepEqual([p.protocolo, p.status, p.paciente_nome, p.exame_nome, p.material], ['LB00001', 'SOLICITADO', 'Paciente Teste', 'Hemograma', 'Sangue']);
    await assert.rejects(() => run(ctx, "solicitarExameLab({ paciente_id: 'p1', exame_id: 'ex2' })"), /inativo/);
    await assert.rejects(() => run(ctx, "solicitarExameLab({ paciente_id: 'zzz', exame_id: 'ex1' })"), /Paciente não encontrado/);
    await assert.rejects(() => run(ctx, `registrarColetaLab('${p.id}')`), /Acesso negado/);
    entrar(ctx, 'FUNC_LABORATORIO', 'lab');
    await assert.rejects(() => run(ctx, `liberarResultadoLab('${p.id}', { linhas: [{ analito: 'Hb', valor: '13' }] })`), /Não é possível passar/);
    const c = await run(ctx, `registrarColetaLab('${p.id}', '')`);
    assert.deepEqual([c.status, c.coleta.por, c.coleta.material], ['COLETADO', 'lab', 'Sangue']);
    await assert.rejects(() => run(ctx, `registrarColetaLab('${p.id}')`), /já foi registrado/);
    const l = await run(ctx, `liberarResultadoLab('${p.id}', { linhas: [{ analito: 'Hemoglobina', valor: '13,2', unidade: 'g/dL', referencia: '12 a 16' }] })`);
    assert.equal(l.status, 'LIBERADO');
    assert.equal(l.resultado.liberado_por, 'lab');
    assert.deepEqual(store.lab_pedidos[p.id].historico.map(h => h.status), ['SOLICITADO', 'COLETADO', 'LIBERADO']);
    await assert.rejects(() => run(ctx, `cancelarPedidoLab('${p.id}', 'motivo qualquer')`), /Não é possível passar/);
    assert.deepEqual(auditoria.map(a => a.acao), ['SOLICITAR', 'COLETAR', 'LIBERAR']);
    // retificação: o original não muda, a nova vale e fica com o motivo
    await assert.rejects(() => run(ctx, `retificarResultadoLab('${p.id}', { linhas: [{ analito: 'Hemoglobina', valor: '13,9' }], motivo: '' })`), /Motivo da retificação/);
    const rt = await run(ctx, `retificarResultadoLab('${p.id}', { linhas: [{ analito: 'Hemoglobina', valor: '13,9', unidade: 'g/dL' }], motivo: 'Digitação incorreta do valor' })`);
    assert.deepEqual([rt.pedido_id, rt.por, rt.linhas[0].valor], [p.id, 'lab', '13,9']);
    assert.equal(store.lab_pedidos[p.id].resultado.linhas[0].valor, '13,2');
    assert.equal(store.lab_retificacoes[rt.id].motivo, 'Digitação incorreta do valor');
    entrar(ctx, 'MEDICO', 'med');
    await assert.rejects(() => run(ctx, `retificarResultadoLab('${p.id}', { linhas: [{ analito: 'Hb', valor: '1' }], motivo: 'Motivo qualquer' })`), /Acesso negado/);
});

test('laboratório (#29): cancelar exige motivo; o médico só cancela o próprio pedido ainda não coletado', async () => {
    const { ctx } = criar();
    entrar(ctx, 'MEDICO', 'med');
    const p = await run(ctx, "solicitarExameLab({ paciente_id: 'p1', exame_id: 'ex1' })");
    await assert.rejects(() => run(ctx, `cancelarPedidoLab('${p.id}', '')`), /Motivo do cancelamento/);
    entrar(ctx, 'MEDICO', 'outro');
    await assert.rejects(() => run(ctx, `cancelarPedidoLab('${p.id}', 'pedido duplicado')`), /Só o laboratório cancela/);
    entrar(ctx, 'MEDICO', 'med');
    assert.equal((await run(ctx, `cancelarPedidoLab('${p.id}', 'pedido duplicado')`)).status, 'CANCELADO');
});
