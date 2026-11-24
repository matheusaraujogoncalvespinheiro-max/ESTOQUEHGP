// Testes da Etapa 7: perfis e estoque da Farmácia, itens prescritos a dispensar, dispensação (baixa de lote, controle especial,
// cancelamento com estorno), requisição à Farmácia e rastreabilidade por paciente e lote. Executa com: npm test.
// Só dados fictícios; nada acessa o Firestore real (as gravações são funções de memória).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const stub = new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : stub), apply: () => stub });   // o motor de cadastros mexe no document ao carregar
const auditoria = [];
const ctx = vm.createContext({
    document: stub, window: {}, localStorage: { getItem: () => null, setItem() {} }, console, state: { currentUser: null },
    MOCK_DATA: { FARMACIA: [], OPME: [], HEMODINAMICA: [], CENTRO_CIRURGICO: [], PRESCRICOES_MED: [], INTERNACOES: [], PRODUCT_HISTORY: [] }, CAD_DATA: {},
    saveToLocalStorage() {}, nowISO: () => new Date().toISOString(), todayISO: () => new Date().toISOString().slice(0, 10), auditar: async (e) => { auditoria.push(e); },
    db_cadSalvar: async (tipo, reg) => { const lista = (ctx.CAD_DATA[tipo] = ctx.CAD_DATA[tipo] || []); const i = lista.findIndex(x => x.id === reg.id); if (i >= 0) Object.assign(lista[i], reg); else lista.push(reg); }
});
['core/utils.js', 'core/validators.js', 'core/regras.js', 'core/permissions.js', 'data/cadastros.js', 'services/estrutura-hospitalar.js', 'services/estoque.js', 'pages/cadastros/engine.js',
    'pages/cadastros/produto.js', 'services/operacoes.js', 'services/farmacia.js', 'services/fiscal.js', 'services/relatorios.js', 'data/cadastros-operacoes.js', 'data/cadastros-farmacia.js', 'data/cadastros-fiscal.js'].forEach(f =>
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'assets/js', f), 'utf8'), ctx, { filename: f }));
const call = (code) => vm.runInContext(code, ctx);
const j = (code) => JSON.parse(call(`JSON.stringify(${code})`));
const dados = (nome, valor) => call(`globalThis.${nome} = ${JSON.stringify(valor)}`);
const entrar = (role, username = role.toLowerCase(), name = `Usuário ${role}`) => dados('__u', { username, name, role }) && call('state.currentUser = __u');
const erroDe = (codigo) => { try { call(codigo); return null; } catch (e) { return e.message; } };
const erroAsync = async (codigo) => { try { await call(codigo); return null; } catch (e) { return e.message; } };

const dia = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const produto = (id, barcode, material, lotes, med = {}, extra = {}) => ({
    id, barcode, material, descricao: material, empresa: 'LAB TESTE', marca: 'X', min: 5, remessa: '', qtd: lotes.reduce((a, l) => a + l.quantidade, 0), lotes, lote: lotes[0].lote, validade: lotes[0].validade,
    cadastro: { ativo: true, categoria: 'Medicamento', medicamento: { principio_ativo: material.split(' ')[0], controlado: false, ...med }, ...extra }
});

/** Cenário limpo: dois pacientes internados, prescrições e estoque da Farmácia com FEFO, controlado, vencido e inativo. */
function semente() {
    dados('__farm', [
        produto('F1', 'MED001', 'DIPIRONA 500 MG', [{ id: 1, lote: 'L-A', validade: dia(200), quantidade: 50, data_entrada: dia(-5) }, { id: 2, lote: 'L-B', validade: dia(20), quantidade: 10, data_entrada: dia(-30) }]),
        produto('F2', 'MED002', 'MORFINA 10 MG/ML', [{ id: 3, lote: 'L-M', validade: dia(90), quantidade: 5, data_entrada: dia(-3) }], { controlado: true }),
        produto('F3', 'MED003', 'PARACETAMOL GOTAS', [{ id: 4, lote: 'L-V', validade: dia(-10), quantidade: 8, data_entrada: dia(-300) }]),
        produto('F4', 'MED004', 'OMEPRAZOL 20 MG', [{ id: 5, lote: 'L-O', validade: dia(100), quantidade: 20, data_entrada: dia(-4) }], {}, { ativo: false })
    ]);
    call('MOCK_DATA.FARMACIA = __farm');
    dados('__opme', [{ id: 'O1', barcode: 'OP001', material: 'PARAFUSO', descricao: 'PARAFUSO', empresa: 'X', marca: 'X', min: 1, qtd: 3, lotes: [{ id: 9, lote: 'L-OP', validade: dia(300), quantidade: 3 }], cadastro: { ativo: true } }]);
    call('MOCK_DATA.OPME = __opme');
    dados('__ints', [
        { id: 'i1', paciente_id: 'p1', paciente_nome: 'MARIA DE TESTE', prontuario: '1001', leito_id: '201A', ala: 'Ala E/F', status: 'ATIVA' },
        { id: 'i2', paciente_id: 'p2', paciente_nome: 'JOAO DE TESTE', prontuario: '1002', leito_id: '201B', ala: 'Ala E/F', status: 'ATIVA' },
        { id: 'i3', paciente_id: 'p3', paciente_nome: 'ANA DE TESTE', prontuario: '1003', leito_id: '301A', ala: 'Ala I/J', status: 'ENCERRADA' }
    ]);
    call('MOCK_DATA.INTERNACOES = __ints');
    dados('__presc', [
        { id: 'r1', tipo: 'PRESCRICAO', internacao_id: 'i1', paciente_id: 'p1', autor_nome: 'Dr. Teste', em: '2026-06-10T10:00:00.000Z', itens: [{ medicamento: 'Dipirona 500 mg', dose: '1 comprimido', via: 'VO', frequencia: '6/6 h' }, { medicamento: 'Morfina 10 mg/mL', dose: '1 ampola', via: 'EV', frequencia: 'se dor' }] },
        { id: 'r2', tipo: 'PRESCRICAO', internacao_id: 'i2', paciente_id: 'p2', autor_nome: 'Dr. Teste', em: '2026-06-10T11:00:00.000Z', itens: [{ medicamento: 'Paracetamol gotas', dose: '10 gotas', via: 'VO', frequencia: '6/6 h' }] },
        { id: 'r3', tipo: 'PRESCRICAO', internacao_id: 'i3', paciente_id: 'p3', autor_nome: 'Dr. Teste', em: '2026-06-09T11:00:00.000Z', itens: [{ medicamento: 'Soro', dose: '500 mL', via: 'EV', frequencia: '12/12 h' }] },
        { id: 'r4', tipo: 'PRESCRICAO', internacao_id: 'i1', paciente_id: 'p1', autor_nome: 'Dr. Teste', complementa_id: 'r1', em: '2026-06-10T12:00:00.000Z', itens: [{ medicamento: 'Complemento' }] }
    ]);
    call('MOCK_DATA.PRESCRICOES_MED = __presc');
    call('MOCK_DATA.PRODUCT_HISTORY = []');
    call('CAD_DATA.dispensacao = []; CAD_DATA.saida = []; CAD_DATA.requisicao = []');
    auditoria.length = 0;
}
const formDisp = (extra = {}) => ({ prescricao_item: 'r1|0', produto: 'FARMACIA|MED001', lote: '1', quantidade: 2, ...extra });
const lote = (id) => j(`MOCK_DATA.FARMACIA.flatMap(p => p.lotes).find(l => l.id === ${id})`);

// ============ Perfis, permissões e visibilidade do estoque ============

test('perfis da Farmácia: só movimentam o estoque FARMACIA; chefe cadastra, funcionário não; sem histórico geral', () => {
    entrar('CHEFE_FARMACIA');
    assert.equal(call("hasPermission('register', 'FARMACIA')"), true);
    assert.equal(call("hasPermission('register', 'OPME')"), false);
    assert.equal(call("hasPermission('update_stock', 'FARMACIA')"), true);
    assert.equal(call("hasPermission('update_stock', 'OPME')"), false);
    assert.equal(call("hasPermission('update_stock')"), false);
    assert.equal(call("hasPermission('view_history')"), false);   // o histórico geral mostra todos os setores
    assert.equal(call("hasPermission('farmacia_dispensar')"), true);
    entrar('FUNC_FARMACIA');
    assert.equal(call("hasPermission('update_stock', 'FARMACIA')"), true);
    assert.equal(call("hasPermission('register', 'FARMACIA')"), false);
    assert.equal(call("hasPermission('farmacia_dispensar')"), true);
    assert.equal(call("hasPermission('prontuario_ver')"), false);   // a farmácia vê a prescrição, não o prontuário
    entrar('MEDICO');
    assert.equal(call("hasPermission('farmacia_dispensar')"), false);
    assert.equal(call("hasPermission('farmacia_requisicao')"), false);
    entrar('FUNC_ENFERMAGEM');
    assert.equal(call("hasPermission('farmacia_requisicao')"), true);
    assert.equal(call("hasPermission('farmacia_dispensar')"), false);
    assert.equal(call("getRoleLabel('CHEFE_FARMACIA')"), 'Chefe Farmácia');
    assert.equal(call("ASSIGNABLE_ROLES.includes('FUNC_FARMACIA') && ASSIGNABLE_ROLES.includes('CHEFE_FARMACIA')"), true);
});

test('estoque visível: a Farmácia só vê o próprio setor, o Administrador vê tudo e os demais perfis não veem a Farmácia', () => {
    entrar('FUNC_FARMACIA');
    assert.deepEqual(j('setoresEstoqueVisiveis()'), ['FARMACIA']);
    entrar('CHEFE_FARMACIA');
    assert.deepEqual(j('setoresEstoqueVisiveis()'), ['FARMACIA']);
    entrar('ADMIN');
    assert.deepEqual(j('setoresEstoqueVisiveis()'), ['OPME', 'HEMODINAMICA', 'CENTRO_CIRURGICO', 'FARMACIA']);
    entrar('FUNC_OPME');
    assert.deepEqual(j('setoresEstoqueVisiveis()'), ['OPME', 'HEMODINAMICA', 'CENTRO_CIRURGICO']);
    semente();
    entrar('FUNC_FARMACIA');
    assert.deepEqual(j('cadProdutosOpcoes().map(o => o.id.split("|")[0])').filter((s, n, a) => a.indexOf(s) === n), ['FARMACIA']);
    assert.equal(j("cadProdutosOpcoes(['OPME']).length"), 0);
    entrar('FUNC_OPME');
    assert.equal(j("cadProdutosOpcoes().filter(o => o.id.startsWith('FARMACIA')).length"), 0);
});

test('listas das movimentações: registros de um setor só aparecem para quem enxerga o setor', () => {
    semente();
    dados('__disp', [{ id: 'd1', codigo: 'DSP-0001', setor: 'FARMACIA', ativo: true }, { id: 's1', codigo: 'SAI-0001', setor: 'OPME', ativo: true }]);
    call('CAD_DATA.saida = __disp');
    entrar('FUNC_OPME');
    assert.deepEqual(j("CAD_STORES.generic.rows(CAD_DEFS.saida).map(r => r.id)"), ['s1']);
    entrar('FUNC_FARMACIA');
    assert.deepEqual(j("CAD_STORES.generic.rows(CAD_DEFS.saida).map(r => r.id)"), ['d1']);
    entrar('ADMIN');
    assert.deepEqual(j("CAD_STORES.generic.rows(CAD_DEFS.saida).map(r => r.id)"), ['d1', 's1']);
});

// ============ Medicamento no cadastro de produto ============

test('produto: a aba Medicamento aparece para medicamento ou setor Farmácia; controle especial vem do cadastro', () => {
    const hide = (f) => call(`CAD_DEFS.produto.tabs.find(t => t.id === 'medicamento').hide(${JSON.stringify(f)})`);
    assert.equal(hide({ categoria: 'Medicamento', setor: 'OPME' }), false);
    assert.equal(hide({ setor: 'FARMACIA' }), false);
    assert.equal(hide({ categoria: 'OPME', setor: 'OPME' }), true);
    semente();
    assert.equal(call("produtoControlado(MOCK_DATA.FARMACIA[1])"), true);
    assert.equal(call("produtoControlado(MOCK_DATA.FARMACIA[0])"), false);
    assert.equal(call("produtoEhMedicamento(MOCK_DATA.OPME[0], 'OPME')"), false);
    assert.equal(call("produtoEhMedicamento(MOCK_DATA.OPME[0], 'FARMACIA')"), true);
    assert.equal(call("produtoRow(MOCK_DATA.FARMACIA[1], 'FARMACIA').tipo"), 'Medicamento');
    assert.equal(call("produtoRow(MOCK_DATA.FARMACIA[1], 'FARMACIA').controlado"), true);
    assert.equal(call("produtoRow(MOCK_DATA.OPME[0], 'OPME').tipo"), 'OPME');
    const campos = j("CAD_DEFS.produto.tabs.find(t => t.id === 'medicamento').fields.map(f => f.k)");
    ['med_principio_ativo', 'med_concentracao', 'med_forma', 'med_controlado', 'med_registro_anvisa'].forEach(k => assert.ok(campos.includes(k), k));
});

// ============ Itens prescritos para a Farmácia ============

test('itens a dispensar: só internações ativas, sem complementos, com situação pelo que já foi dispensado (cancelada não conta)', () => {
    semente();
    const linhas = j("itensParaDispensar(MOCK_DATA.PRESCRICOES_MED, MOCK_DATA.INTERNACOES, []).map(l => [l.chave, l.situacao])");
    assert.deepEqual(linhas.map(l => l[0]).sort(), ['r1|0', 'r1|1', 'r2|0']);   // r3 é de internação encerrada; r4 é complemento
    assert.ok(linhas.every(l => l[1] === 'PENDENTE'));
    dados('__d', [
        { id: 'a', registro_clinico_id: 'r1', item_idx: 0, quantidade: 2, criado_em: '2026-06-10T13:00:00.000Z', ativo: true },
        { id: 'b', registro_clinico_id: 'r1', item_idx: 0, quantidade: 3, criado_em: '2026-06-10T15:00:00.000Z', ativo: true },
        { id: 'c', registro_clinico_id: 'r2', item_idx: 0, quantidade: 1, criado_em: '2026-06-10T13:00:00.000Z', ativo: false }
    ]);
    const l2 = j("itensParaDispensar(MOCK_DATA.PRESCRICOES_MED, MOCK_DATA.INTERNACOES, __d)");
    const r10 = l2.find(l => l.chave === 'r1|0');
    assert.equal(r10.situacao, 'DISPENSADO'); assert.equal(r10.total, 5); assert.equal(r10.ultima_em, '2026-06-10T15:00:00.000Z');
    assert.equal(l2.find(l => l.chave === 'r2|0').situacao, 'PENDENTE');   // a única dispensação foi cancelada
    assert.equal(l2[0].situacao, 'PENDENTE');   // pendentes primeiro
    assert.deepEqual(j("resumoDispensacaoDoItem(__d, 'r1', 0)"), { dispensado: true, total: 5, ultima_em: '2026-06-10T15:00:00.000Z' });
    assert.deepEqual(j("resumoDispensacaoDoItem(__d, 'r2', 0)"), { dispensado: false, total: 0, ultima_em: '' });
    // #48: lotes dispensados do item (sem repetir, sem cancelados)
    dados('__l', [{ registro_clinico_id: 'r1', item_idx: 0, lote_codigo: 'L1', ativo: true }, { registro_clinico_id: 'r1', item_idx: 0, lote_codigo: 'L1', ativo: true }, { registro_clinico_id: 'r1', item_idx: 0, lote_codigo: 'L2', ativo: true }, { registro_clinico_id: 'r1', item_idx: 0, lote_codigo: 'L3', ativo: false }]);
    assert.deepEqual(j("lotesDispensadosDoItem(__l, 'r1', 0)"), ['L1', 'L2']);
});

test('sugestão de produto: pelo nome ou princípio ativo, só ativos e com saldo', () => {
    semente();
    assert.deepEqual(j("produtosSugeridosParaItem({ medicamento: 'Dipirona 500 mg' }).map(o => o.id)"), ['FARMACIA|MED001']);
    assert.deepEqual(j("produtosSugeridosParaItem({ medicamento: 'Morfina 10 mg/mL' }).map(o => o.id)"), ['FARMACIA|MED002']);
    assert.deepEqual(j("produtosSugeridosParaItem({ medicamento: 'Omeprazol 20 mg' })"), []);   // produto inativo
    assert.deepEqual(j("produtosSugeridosParaItem({ medicamento: '' })"), []);
    assert.deepEqual(j("produtosSugeridosParaItem({ medicamento: 'Amoxicilina' })"), []);
});

// ============ Dispensação ============

test('dispensação: valida item prescrito, internação ativa, setor, lote, saldo, produto inativo e permissão', () => {
    semente();
    entrar('FUNC_FARMACIA', 'farm1', 'Farm. Teste');
    dados('__f', formDisp());
    const extras = j('validarDispensacao(__f)');
    assert.equal(extras.paciente_nome, 'MARIA DE TESTE'); assert.equal(extras.internacao_id, 'i1'); assert.equal(extras.registro_clinico_id, 'r1'); assert.equal(extras.item_idx, 0);
    assert.equal(extras.medicamento_prescrito, 'Dipirona 500 mg · 1 comprimido · VO · 6/6 h'); assert.equal(extras.prescritor, 'Dr. Teste');
    assert.equal(extras.setor, 'FARMACIA'); assert.equal(extras.lote_codigo, 'L-A'); assert.equal(extras.controle, 'Comum'); assert.equal(extras.dispensado_por_nome, 'Farm. Teste');
    const erro = (extra) => { dados('__f', formDisp(extra)); return erroDe('validarDispensacao(__f)'); };
    assert.match(erro({ prescricao_item: '' }), /Selecione o item prescrito/);
    assert.match(erro({ prescricao_item: 'r1|9' }), /Selecione o item prescrito/);
    assert.match(erro({ prescricao_item: 'zzz|0' }), /Selecione o item prescrito/);
    assert.match(erro({ prescricao_item: 'r3|0' }), /internação deste paciente não está ativa/);
    assert.match(erro({ produto: '' }), /Selecione o produto/);
    assert.match(erro({ quantidade: 0 }), /quantidade/);
    assert.match(erro({ quantidade: 1.5 }), /quantidade/);
    assert.match(erro({ lote: '' }), /Selecione o lote/);
    assert.match(erro({ lote: '2', quantidade: 11 }), /tem só 10 un/);
    assert.match(erro({ produto: 'FARMACIA|MED003', lote: '4', prescricao_item: 'r2|0' }), /vencido/);
    assert.match(erro({ produto: 'FARMACIA|MED004', lote: '5' }), /inativo/);
    assert.match(erro({ produto: 'OPME|OP001', lote: '9' }), /não pode movimentar o estoque OPME/);   // FUNC_FARMACIA não movimenta OPME
    entrar('ADMIN');
    assert.match(erro({ produto: 'OPME|OP001', lote: '9' }), /dispensação sai do estoque da Farmácia/);   // nem o administrador dispensa de outro setor
    entrar('MEDICO');
    assert.match(erro({}), /Acesso negado/);
});

test('dispensação de controle especial: exige o número da receita; o comum não', () => {
    semente();
    entrar('FUNC_FARMACIA');
    dados('__f', formDisp({ prescricao_item: 'r1|1', produto: 'FARMACIA|MED002', lote: '3', quantidade: 1 }));
    assert.match(erroDe('validarDispensacao(__f)'), /controle especial: informe o número da receita/);
    dados('__f', formDisp({ prescricao_item: 'r1|1', produto: 'FARMACIA|MED002', lote: '3', quantidade: 1, receita_numero: 'ab' }));
    assert.match(erroDe('validarDispensacao(__f)'), /controle especial/);
    dados('__f', formDisp({ prescricao_item: 'r1|1', produto: 'FARMACIA|MED002', lote: '3', quantidade: 1, receita_numero: 'REC-001' }));
    const x = j('validarDispensacao(__f)');
    assert.equal(x.controlado, true); assert.equal(x.controle, 'Controle especial');
});

test('dispensação aplicada: baixa o lote escolhido, registra o histórico sem nome de paciente e o item passa a dispensado', () => {
    semente();
    entrar('FUNC_FARMACIA', 'farm1', 'Farm. Teste');
    dados('__f', formDisp({ lote: '2', quantidade: 4 }));
    const extras = j('validarDispensacao(__f)');
    dados('__reg', { ...formDisp({ lote: '2', quantidade: 4 }), ...extras, id: 'd1', codigo: 'DSP-0001', ativo: true, criado_em: new Date().toISOString() });
    call('aplicarDispensacao(__reg)');
    assert.equal(lote(2).quantidade, 6);   // o lote escolhido (não o FEFO automático)
    assert.equal(lote(1).quantidade, 50);
    assert.equal(call('MOCK_DATA.FARMACIA[0].qtd'), 56);
    const h = j('MOCK_DATA.PRODUCT_HISTORY[0]');
    assert.equal(h.action, 'DISPENSACAO'); assert.equal(h.sector, 'FARMACIA'); assert.equal(h.quantity, 4); assert.equal(h.batch, 'L-B'); assert.equal(h.obs, 'Dispensação DSP-0001');
    assert.ok(!JSON.stringify(h).includes('MARIA'));
    // saldo insuficiente na hora de aplicar não baixa nada
    dados('__reg2', { ...j('__reg'), quantidade: 99 });
    assert.match(erroDe('aplicarDispensacao(__reg2)'), /Quantidade insuficiente/);
    assert.equal(lote(2).quantidade, 6);
    // depois de gravada, o item aparece como dispensado
    dados('__d', [{ ...j('__reg') }]);
    assert.equal(j("itensParaDispensar(MOCK_DATA.PRESCRICOES_MED, MOCK_DATA.INTERNACOES, __d).find(l => l.chave === 'r1|0').situacao"), 'DISPENSADO');
});

test('cancelamento de dispensação: só Administrador e Chefe Farmácia; devolve o saldo ao lote e a dispensação fica cancelada', async () => {
    semente();
    entrar('FUNC_FARMACIA', 'farm1', 'Farm. Teste');
    dados('__f', formDisp({ lote: '1', quantidade: 5 }));
    const extras = j('validarDispensacao(__f)');
    dados('__reg', { ...formDisp({ lote: '1', quantidade: 5 }), ...extras, id: 'd1', codigo: 'DSP-0001', ativo: true, criado_em: new Date().toISOString() });
    call('aplicarDispensacao(__reg)');
    call('CAD_DATA.dispensacao = [__reg]');
    assert.equal(lote(1).quantidade, 45);
    const pedido = { tipo_operacao: 'dispensacao', operacao: 'd1', motivo: 'Dispensado ao paciente errado, conferência' };
    dados('__p', pedido);
    assert.match(erroDe('validarCancelamento(__p)'), /Somente Administrador, Chefe OPME e Chefe Farmácia/);
    entrar('CHEFE_FARMACIA', 'chefe1', 'Chefe Farm.');
    dados('__p2', { ...pedido, tipo_operacao: 'saida' });
    assert.match(erroDe('validarCancelamento(__p2)'), /cancela apenas dispensações/);
    dados('__p3', { ...pedido, motivo: 'curto' });
    assert.match(erroDe('validarCancelamento(__p3)'), /motivo/);
    const info = j('validarCancelamento(__p)');
    assert.match(info.operacao_desc, /Dispensação DSP-0001/);
    dados('__c', { ...pedido, id: 'c1', codigo: 'CAN-0001' });
    await call('aplicarCancelamento(__c)');
    assert.equal(lote(1).quantidade, 50);   // estorno
    assert.equal(j("CAD_DATA.dispensacao[0].ativo"), false);
    assert.equal(j('MOCK_DATA.PRODUCT_HISTORY[0].action'), 'ESTORNO_DISPENSACAO');
    assert.equal(auditoria.at(-1).acao, 'CANCELAR');
    assert.match(erroDe('validarCancelamento(__p)'), /já foi cancelada/);
    // depois de cancelada, o item volta a ficar sem dispensação
    assert.equal(j("itensParaDispensar(MOCK_DATA.PRESCRICOES_MED, MOCK_DATA.INTERNACOES, CAD_DATA.dispensacao).find(l => l.chave === 'r1|0').situacao"), 'PENDENTE');
});

test('definições da Farmácia: dispensação é imutável e restrita; requisição aceita a enfermagem; ambas entram no cancelamento/consulta', () => {
    assert.equal(call('CAD_DEFS.dispensacao.imutavel'), true);
    assert.deepEqual(j('CAD_DEFS.dispensacao.roles.editar'), []);
    assert.deepEqual(j('CAD_DEFS.dispensacao.roles.criar'), ['ADMIN', 'CHEFE_FARMACIA', 'FUNC_FARMACIA']);
    entrar('FUNC_ENFERMAGEM');
    assert.equal(call("cadCan(CAD_DEFS.requisicao, 'criar')"), true);
    assert.equal(call("cadCan(CAD_DEFS.requisicao, 'editar')"), false);
    assert.equal(call("cadCan(CAD_DEFS.dispensacao, 'ver')"), false);
    entrar('FUNC_FARMACIA');
    assert.equal(call("cadCan(CAD_DEFS.requisicao, 'editar')"), true);
    assert.equal(call("cadCan(CAD_DEFS.saida, 'criar')"), true);   // saída, devolução e perda de produtos da Farmácia
    assert.equal(call("cadCan(CAD_DEFS.baixa, 'criar')"), false);
    assert.equal(call("cadCan(CAD_DEFS.contrato, 'ver')"), false);   // consignado é do OPME
    entrar('CHEFE_FARMACIA');
    assert.equal(call("cadCan(CAD_DEFS.baixa, 'criar')"), true);
    assert.equal(call("cadCan(CAD_DEFS.cancelamento, 'criar')"), true);
    assert.equal(call("Object.keys(OPERACOES_CANCELAVEIS).includes('dispensacao') && VOLTAM_AO_ESTOQUE.includes('dispensacao')"), true);
    assert.equal(call("CAD_DEFS.dispensacao.rotuloInativo"), 'Cancelada');
});

// ============ Requisição ============

test('requisição: itens por descrição com quantidade inteira; nova começa solicitada; só a Farmácia muda a situação', () => {
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enf. Teste');
    dados('__r', { unidade: 'Ala E/F', prioridade: 'Rotina', situacao: 'Solicitada', itens: [{ descricao: 'Dipirona 500 mg comprimido', quantidade: 20 }, { descricao: '', quantidade: 0 }] });
    const x = j('validarRequisicao(__r, "")');
    assert.equal(x.itens.length, 1); assert.equal(x.situacao, 'Solicitada'); assert.equal(x.solicitante_nome, 'Enf. Teste');
    dados('__r', { itens: [] });
    assert.match(erroDe('validarRequisicao(__r, "")'), /ao menos um item/);
    dados('__r', { itens: [{ descricao: 'Gaze', quantidade: 1.5 }] });
    assert.match(erroDe('validarRequisicao(__r, "")'), /quantidade/);
    dados('__r', { situacao: 'Atendida', itens: [{ descricao: 'Gaze', quantidade: 2 }] });
    assert.match(erroDe('validarRequisicao(__r, "")'), /começa como "Solicitada"/);
    entrar('FUNC_FARMACIA', 'farm1', 'Farm. Teste');
    dados('__r', { situacao: 'Atendida em parte', itens: [{ descricao: 'Gaze', quantidade: 2 }] });
    const y = j('validarRequisicao(__r, "req1")');
    assert.equal(y.atendido_por_nome, 'Farm. Teste'); assert.ok(y.atendido_em);
    dados('__r', { situacao: 'Inventada', itens: [{ descricao: 'Gaze', quantidade: 2 }] });
    assert.match(erroDe('validarRequisicao(__r, "req1")'), /Escolha a situação/);
    entrar('MEDICO');
    dados('__r', { itens: [{ descricao: 'Gaze', quantidade: 2 }] });
    assert.match(erroDe('validarRequisicao(__r, "")'), /Acesso negado/);
});

// ============ Rastreabilidade ============

test('rastreabilidade: junta dispensações, saídas para paciente e laudos; respeita setor, período e busca; cancelada fica marcada', () => {
    dados('__ent', {
        dispensacoes: [
            { setor: 'FARMACIA', criado_em: '2026-06-10T13:00:00.000Z', paciente_nome: 'MARIA DE TESTE', prontuario: '1001', produto_desc: 'MED001 · DIPIRONA', lote_codigo: 'L-A', quantidade: 2, dispensado_por_nome: 'Farm. Teste', ativo: true },
            { setor: 'FARMACIA', criado_em: '2026-06-11T13:00:00.000Z', paciente_nome: 'JOAO DE TESTE', prontuario: '1002', produto_desc: 'MED002 · MORFINA', lote_codigo: 'L-M', quantidade: 1, dispensado_por_nome: 'Farm. Teste', ativo: false }
        ],
        saidas: [
            { setor: 'OPME', destino: 'Paciente', destino_detalhe: 'CARLOS DE TESTE', criado_em: '2026-06-10T09:00:00.000Z', produto_desc: 'OP001 · PARAFUSO', lote_codigo: 'L-OP', quantidade: 3, criado_por: 'opme1', ativo: true },
            { setor: 'OPME', destino: 'Setor', destino_detalhe: 'Centro Cirúrgico', criado_em: '2026-06-10T09:30:00.000Z', produto_desc: 'OP001 · PARAFUSO', lote_codigo: 'L-OP', quantidade: 1, criado_por: 'opme1', ativo: true }
        ],
        laudos: [{ setor: 'HEMODINAMICA', data: '2026-06-10', hora: '08:00', paciente: 'MARIA DE TESTE', itens_opme: [{ descricao: 'STENT', lote: 'L-ST', quantidade: 1 }], usuario: 'hemo1' }]
    });
    const todos = j('relatorioRastreabilidade(__ent, "", "", "")');
    assert.equal(todos.linhas.length, 4);   // a saída para setor não entra
    assert.deepEqual(todos.linhas.map(l => l.tipo), ['Dispensação (Farmácia)', 'Dispensação (Farmácia)', 'Saída para paciente', 'Uso em laudo']);
    assert.equal(todos.linhas[0].situacao, 'Cancelada');   // a mais recente (11/06) é a cancelada
    assert.deepEqual(todos.resumo.map(r => r.valor), [4, 2, 3, 6]);   // só as ativas contam: 2 pacientes (Maria aparece 2 vezes), 3 lotes, 2+3+1 un
    const farm = j('relatorioRastreabilidade(Object.assign({}, __ent, { setores: ["FARMACIA"] }), "", "", "")');
    assert.deepEqual(farm.linhas.map(l => l.paciente), ['JOAO DE TESTE', 'MARIA DE TESTE']);   // a Farmácia não vê OPME nem laudos
    const periodo = j('relatorioRastreabilidade(__ent, "2026-06-10", "2026-06-10", "")');
    assert.equal(periodo.linhas.length, 3);
    const lotePesq = j('relatorioRastreabilidade(__ent, "", "", "l-st")');
    assert.deepEqual(lotePesq.linhas.map(l => l.produto), ['STENT']);
    const pacPesq = j('relatorioRastreabilidade(__ent, "", "", "maria")');
    assert.equal(pacPesq.linhas.length, 2);   // dispensação + laudo da mesma paciente
    assert.ok(todos.colunas.some(c => c.k === 'lote') && todos.colunas.some(c => c.k === 'paciente'));
});
