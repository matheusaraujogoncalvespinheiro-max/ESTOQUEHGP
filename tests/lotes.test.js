// Testes do controle de estoque por lote (por produto): entrada, saída FEFO, lote vencido/inativo, saldo = soma dos lotes,
// cancelamento/devolução ao mesmo lote e produto sem controle por lote (saldo geral). Executa com: npm test.
// Só dados fictícios em memória; nada acessa o Firestore (sem `db`, as gravações não são chamadas).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({
    console, window: {}, CAD_DATA: {}, state: { currentUser: { name: 'Teste', username: 'teste', role: 'ADMIN' } },
    MOCK_DATA: { OPME: [], HEMODINAMICA: [], CENTRO_CIRURGICO: [], FARMACIA: [], PRODUCT_HISTORY: [] },
    saveToLocalStorage() {}, showMsg() {},
    produtoAtivo: (p) => !p || !p.cadastro || p.cadastro.ativo !== false
});
['core/utils.js', 'core/validators.js', 'core/regras.js', 'services/estoque.js', 'pages/cadastros/produto-lotes.js'].forEach(f =>
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'assets/js', f), 'utf8'), ctx, { filename: f }));
const call = (code) => vm.runInContext(code, ctx);
const j = (code) => JSON.parse(call(`JSON.stringify(${code})`));
const dados = (nome, valor) => call(`globalThis.${nome} = ${JSON.stringify(valor)}`);
const dia = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

/** Estoque OPME com um produto COM controle por lote (3 lotes, um vencido) e um SEM controle. */
function semente() {
    dados('__opme', [
        { id: 'P1_OPME', barcode: 'P1', material: 'STENT TESTE', descricao: 'STENT', min: 2, qtd: 0, cadastro: { ativo: true, config: { usa_lote: true } },
            lotes: [
                { id: 'a', lote: 'L001', validade: dia(15), quantidade: 50 },
                { id: 'b', lote: 'L002', validade: dia(120), quantidade: 100 },
                { id: 'c', lote: 'L003', validade: dia(300), quantidade: 30 },
                { id: 'v', lote: 'LVENC', validade: dia(-3), quantidade: 7 }
            ] },
        { id: 'P2_OPME', barcode: 'P2', material: 'GAZE TESTE', descricao: 'GAZE', min: 2, qtd: 0, cadastro: { ativo: true, config: { usa_lote: false } }, lotes: [] }
    ]);
    call('MOCK_DATA.OPME = __opme; MOCK_DATA.OPME.forEach(recalcularProdutoEstoque); MOCK_DATA.PRODUCT_HISTORY = []');
}
const prod = (b) => `MOCK_DATA.OPME.find(p => p.barcode === '${b}')`;
const lote = (b, c) => `${prod(b)}.lotes.find(l => l.lote === '${c}')`;

test('saldo do produto com lote = soma dos lotes (inclusive o vencido, que existe mas não sai)', () => {
    semente();
    assert.equal(call(`${prod('P1')}.qtd`), 187);
    assert.equal(call(`${prod('P1')}.lote`), 'LVENC');            // ordem FEFO na lista
    assert.equal(call(`escolherLoteFEFO(${prod('P1')}.lotes).lote`), 'L001');   // mas a saída nunca usa o vencido
});

test('conferirEntradaLote: produto com lote exige lote e validade; não duplica; respeita inativo', () => {
    semente();
    const conf = (b, d, o = {}) => j(`conferirEntradaLote(${prod(b)}, ${JSON.stringify(d)}, ${JSON.stringify(o)})`);
    assert.match(conf('P1', { lote: '', validade: dia(10) }).message, /informe o número do lote/);
    assert.match(conf('P1', { lote: 'NOVO', validade: '' }).message, /informe a validade/);
    assert.match(conf('P1', { lote: 'L002', validade: dia(5) }).message, /já está cadastrado com validade/);
    const mesmo = conf('P1', { lote: 'L002', validade: dia(120) });
    assert.equal(mesmo.ok, true); assert.equal(mesmo.existente.id, 'b');
    assert.equal(conf('P1', { lote: 'NOVO', validade: dia(200) }).existente, null);
    call(`${lote('P1', 'L003')}.ativo = false`);
    assert.match(conf('P1', { lote: 'L003', validade: dia(300) }).message, /está inativo/);
    assert.equal(conf('P1', { lote: 'L003', validade: dia(300) }, { retorno: true }).ok, true);   // devolução/estorno volta ao mesmo lote
    // Produto sem controle: lote e validade opcionais; sem lote vai para o saldo geral
    const geral = conf('P2', { lote: '', validade: '' });
    assert.equal(geral.ok, true); assert.equal(geral.codigo, 'SEM-LOTE'); assert.equal(geral.validade, 'N/A');
});

test('Teste 1 — produto sem lote: entrada e saída pelo saldo geral, sem pedir lote', () => {
    semente();
    const r = j(`addProductWithBatch('OPME', { barcode: 'P2', quantidade: 40, remessa: 'PROC-1' })`);
    assert.equal(r.type, 'updated');
    assert.equal(call(`${prod('P2')}.qtd`), 40);
    assert.equal(call(`${prod('P2')}.lotes.length`), 1);
    assert.equal(call(`rotuloLote(${prod('P2')}.lotes[0].lote)`), 'Sem lote');
    call(`addProductWithBatch('OPME', { barcode: 'P2', quantidade: 10 })`);
    assert.equal(call(`${prod('P2')}.lotes.length`), 1);                    // soma no mesmo saldo, sem criar outro
    const s = j(`darBaixaNoEstoque('OPME', 'P2', 15)`);
    assert.equal(s.success, true);
    assert.equal(call(`${prod('P2')}.qtd`), 35);
    assert.equal(j(`darBaixaNoEstoque('OPME', 'P2', 36)`).success, false);   // nunca negativo
    assert.equal(call(`${prod('P2')}.qtd`), 35);
});

test('Teste 2/3 — produto com lote: entrada em lote existente soma sem duplicar; lote novo é criado', () => {
    semente();
    const r = j(`addProductWithBatch('OPME', { barcode: 'P1', lote: 'L002', validade: '${dia(120)}', quantidade: 20 })`);
    assert.equal(r.type, 'updated');
    assert.equal(call(`${lote('P1', 'L002')}.quantidade`), 120);
    assert.equal(call(`${prod('P1')}.lotes.filter(l => l.lote === 'L002').length`), 1);
    assert.equal(call(`${prod('P1')}.qtd`), 207);
    const erro = j(`addProductWithBatch('OPME', { barcode: 'P1', lote: '', validade: '${dia(9)}', quantidade: 5 })`);
    assert.equal(erro.type, 'erro');
    assert.equal(call(`${prod('P1')}.qtd`), 207);                            // erro não muda nada
    call(`addProductWithBatch('OPME', { barcode: 'P1', lote: 'L004', validade: '${dia(400)}', fabricacao: '${dia(-30)}', prateleira: 'B2', preco: 12.5, quantidade: 8 })`);
    const novo = j(lote('P1', 'L004'));
    assert.equal(novo.quantidade, 8); assert.equal(novo.prateleira, 'B2'); assert.equal(novo.preco, 12.5); assert.equal(novo.qtd_inicial, 8);
    assert.equal(call(`${prod('P1')}.qtd`), 215);
});

test('Teste 4/5 — saída: FEFO, vencido bloqueado, saldo do lote respeitado, lote zerado continua registrado', () => {
    semente();
    const s = j(`darBaixaNoEstoque('OPME', 'P1', 10)`);
    assert.equal(s.success, true); assert.equal(s.lote.lote, 'L001');          // o que vence primeiro, nunca o vencido
    assert.equal(call(`${lote('P1', 'L001')}.quantidade`), 40);
    assert.match(j(`darBaixaNoEstoque('OPME', 'P1', 1, 'v')`).message, /vencido/);
    assert.match(j(`darBaixaNoEstoque('OPME', 'P1', 41, 'a')`).message, /Quantidade insuficiente no lote L001/);
    assert.equal(j(`darBaixaNoEstoque('OPME', 'P1', 40, 'a')`).success, true);
    assert.equal(call(`${lote('P1', 'L001')}.quantidade`), 0);                // zerado, mas continua na lista do produto
    assert.equal(call(`${prod('P1')}.qtd`), 137);
    call(`${lote('P1', 'L002')}.ativo = false`);
    assert.equal(j(`darBaixaNoEstoque('OPME', 'P1', 1)`).lote.lote, 'L003');  // inativo fica de fora do FEFO
});

test('planejarSaidaFEFO / retirarEstoqueFEFO: reparte entre lotes e não sai nada se faltar', () => {
    semente();
    const plano = j(`planejarSaidaFEFO(${prod('P1')}, 160).partes.map(p => [p.lote.lote, p.quantidade])`);
    assert.deepEqual(plano, [['L001', 50], ['L002', 100], ['L003', 10]]);
    const falta = j(`planejarSaidaFEFO(${prod('P1')}, 181)`);
    assert.equal(falta.ok, false); assert.match(falta.message, /180 un/); assert.match(falta.message, /7 un estão em lote vencido/);
    assert.equal(call(`${prod('P1')}.qtd`), 187);
    const r = j(`retirarEstoqueFEFO('OPME', ${prod('P1')}, 60)`);
    assert.equal(r.ok, true);
    assert.deepEqual(r.partes.map(p => [p.lote, p.quantidade]), [['L001', 50], ['L002', 10]]);
    assert.equal(call(`${prod('P1')}.qtd`), 127);
});

test('Teste 6 — cancelamento/devolução volta ao MESMO lote, mesmo zerado ou inativo, sem duplicar', () => {
    semente();
    const r = j(`retirarEstoqueFEFO('OPME', ${prod('P1')}, 60)`);
    call(`${lote('P1', 'L001')}.ativo = false`);                               // zerado e inativado depois da saída
    r.partes.forEach(p => call(`devolverAoLote('OPME', 'P1', ${JSON.stringify({ lote: p.lote, validade: p.validade })}, ${p.quantidade})`));
    assert.equal(call(`${lote('P1', 'L001')}.quantidade`), 50);
    assert.equal(call(`${lote('P1', 'L001')}.ativo`), true);
    assert.equal(call(`${lote('P1', 'L002')}.quantidade`), 100);
    assert.equal(call(`${prod('P1')}.lotes.length`), 4);
    assert.equal(call(`${prod('P1')}.qtd`), 187);
});

test('removeFromBatch: produto nunca é apagado; com lote o lote zerado fica, sem lote o saldo zerado sai da lista', () => {
    semente();
    assert.equal(call(`removeFromBatch('OPME', 'P1_OPME', 'c', 30)`), true);
    assert.equal(call(`${lote('P1', 'L003')}.quantidade`), 0);
    assert.equal(call(`removeFromBatch('OPME', 'P1_OPME', 'c', 1)`), false);   // sem saldo negativo
    call(`addProductWithBatch('OPME', { barcode: 'P2', quantidade: 3 })`);
    const id = call(`${prod('P2')}.lotes[0].id`);
    assert.equal(call(`removeFromBatch('OPME', 'P2_OPME', ${JSON.stringify(id)}, 3)`), true);
    assert.equal(call(`${prod('P2')}.lotes.length`), 0);
    assert.equal(call(`MOCK_DATA.OPME.length`), 2);                          // o cadastro do produto continua
});

test('transferência: saldo sem lote não entra em produto controlado por lote no destino', () => {
    semente();
    call(`addProductWithBatch('OPME', { barcode: 'P2', quantidade: 5 })`);
    call(`MOCK_DATA.HEMODINAMICA = [{ id: 'P2_HEMODINAMICA', barcode: 'P2', material: 'GAZE TESTE', min: 1, cadastro: { ativo: true, config: { usa_lote: true } }, lotes: [] }]`);
    assert.match(call(`conferirTransferenciaLote(${prod('P2')}, 'HEMODINAMICA')`), /controlado por lote/);
    assert.equal(call(`conferirTransferenciaLote(${prod('P1')}, 'HEMODINAMICA')`), '');
    // destino sem o produto: é criado com o mesmo cadastro (controle por lote) e o mesmo lote
    call(`devolverAoLote('CENTRO_CIRURGICO', 'P1', { lote: 'L002', validade: '${dia(120)}' }, 4, ${prod('P1')})`);
    const destino = j(`MOCK_DATA.CENTRO_CIRURGICO[0]`);
    assert.equal(destino.qtd, 4); assert.equal(destino.lotes[0].lote, 'L002'); assert.equal(destino.cadastro.config.usa_lote, true);
});

test('situacaoLote e validarDadosLote (aba Lotes)', () => {
    assert.equal(call(`situacaoLote({ validade: '${dia(-1)}', quantidade: 3 })`), 'VENCIDO');
    assert.equal(call(`situacaoLote({ validade: '${dia(10)}', quantidade: 3 })`), 'A_VENCER');
    assert.equal(call(`situacaoLote({ validade: '${dia(100)}', quantidade: 0 })`), 'SEM_SALDO');
    assert.equal(call(`situacaoLote({ validade: '${dia(100)}', quantidade: 5, ativo: false })`), 'INATIVO');
    assert.equal(call(`situacaoLote({ validade: '${dia(100)}', quantidade: 5 })`), 'OK');
    const v = (f, novo = true) => j(`validarDadosLote(${JSON.stringify(f)}, { novo: ${novo} })`);
    assert.deepEqual(v({ lote: 'X1', validade: dia(100), quantidade: '' }), []);
    assert.match(v({ lote: '', validade: dia(100) }).join(' '), /número do lote/);
    assert.match(v({ lote: 'SEM-LOTE', validade: dia(100) }).join(' '), /reservado/);
    assert.match(v({ lote: 'X1', validade: '' }).join(' '), /vencimento/);
    assert.match(v({ lote: 'X1', validade: dia(100), fabricacao: dia(5) }).join(' '), /fabricação não pode ser futura/);
    assert.match(v({ lote: 'X1', validade: dia(100), quantidade: -1 }).join(' '), /quantidade inicial/);
});

test('relatório Estoque por lote: uma linha por lote (com lote) e o saldo geral (sem lote), com busca', () => {
    semente();
    call(`addProductWithBatch('OPME', { barcode: 'P2', quantidade: 9 })`);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'assets/js/services/relatorios.js'), 'utf8'), ctx, { filename: 'relatorios.js' });
    const r = j(`relatorioEstoqueLotes(MOCK_DATA.OPME.map(p => ({ ...p, setor: 'OPME' })))`);
    assert.equal(r.linhas.length, 5);                                         // 4 lotes do P1 + saldo geral do P2
    assert.equal(r.linhas.find(l => l.codigo === 'P2').quantidade, 9);
    assert.equal(r.linhas.find(l => l.lote === 'LVENC').situacao, 'Vencido');
    assert.equal(r.resumo.find(x => x.rot === 'Vencidos').valor, 1);
    assert.equal(j(`relatorioEstoqueLotes(MOCK_DATA.OPME.map(p => ({ ...p, setor: 'OPME' })), 'L002')`).linhas.length, 1);
});

// ---- Entrada por NF-e e sobra de inventário (services/fiscal.js) pelas mesmas regras de lote ----
call(`globalThis.cadProdutoDe = (v) => { const [setor, barcode] = String(v || '').split('|'); const produto = (MOCK_DATA[setor] || []).find(p => p.barcode === barcode); return produto ? { setor, produto } : null; };
    globalThis.registrarHistoricoEstoque = (acao, it, qtd, lote, extra) => logEntryHistory(acao, it.setor, it.produto.barcode, it.produto.material, qtd, lote, extra);
    globalThis.hasPermission = () => true;`);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'assets/js/services/fiscal.js'), 'utf8'), ctx, { filename: 'services/fiscal.js' });

test('entrada de NF-e: produto com lote exige lote/validade; sem controle vai ao saldo geral; lança uma vez só', () => {
    semente();
    assert.throws(() => call(`conferirItensEntradaEstoque([{ descricao: 'X', produto: 'OPME|P1', quantidade: 5 }])`), /controlado por lote: informe o lote/);
    assert.throws(() => call(`conferirItensEntradaEstoque([{ descricao: 'X', produto: '', quantidade: 5 }])`), /vincule o produto/);
    assert.throws(() => call(`conferirItensEntradaEstoque([{ descricao: 'X', produto: 'OPME|P1', quantidade: 2.5, lote: 'N1', validade: '${dia(200)}' }])`), /inteira/);
    assert.throws(() => call(`conferirItensEntradaEstoque([{ descricao: 'X', produto: 'OPME|P1', quantidade: 5, lote: 'L001', validade: '${dia(400)}' }])`), /validade/i);
    const reg = { codigo: 'EMF1', numero_nfe: '123', estoque_lancado: true, itens: [
        { descricao: 'STENT', produto: 'OPME|P1', quantidade: 10, lote: 'NF-L1', validade: dia(200), fabricacao: dia(-30), valor_unit: 15 },
        { descricao: 'GAZE', produto: 'OPME|P2', quantidade: 4, lote: '', validade: '' }] };
    dados('__reg', reg);
    call('aplicarEntradaEstoqueNF(__reg)');
    assert.equal(call(`${lote('P1', 'NF-L1')}.quantidade`), 10);
    assert.equal(call(`${prod('P1')}.qtd`), 197);
    assert.equal(call(`${prod('P2')}.qtd`), 4);
    assert.equal(call(`${prod('P2')}.lotes[0].lote`), 'SEM-LOTE');
    call('aplicarEntradaEstoqueNF(__reg, { estoque_lancado: true })');   // edição de entrada já lançada: não lança de novo
    assert.equal(call(`${prod('P1')}.qtd`), 197);
});

test('inventário: sobra entra no estoque (com lote exige lote e validade), falta baixa pelo FEFO', () => {
    semente();
    const form = (itens) => ({ setor: 'OPME', situacao: 'Concluído', aplicar_ajuste: true, itens });
    dados('__f1', form([{ produto: 'OPME|P1', quantidade_contada: 190 }]));
    assert.throws(() => call('validarInventario(__f1)'), /informe o lote da sobra/);
    dados('__f2', form([{ produto: 'OPME|P1', quantidade_contada: 190, lote: 'INV1', validade: dia(90) }, { produto: 'OPME|P2', quantidade_contada: 6 }]));
    const v = j('validarInventario(__f2)');
    assert.equal(v.sobras, 9); assert.equal(v.ajuste_aplicado, true);
    dados('__inv', { codigo: 'INV9', ...v });
    call('aplicarAjusteInventario(__inv)');
    assert.equal(call(`${lote('P1', 'INV1')}.quantidade`), 3);
    assert.equal(call(`${prod('P1')}.qtd`), 190);
    assert.equal(call(`${prod('P2')}.qtd`), 6);
    dados('__f3', form([{ produto: 'OPME|P1', quantidade_contada: 185 }]));
    const v3 = j('validarInventario(__f3)');
    dados('__inv3', { codigo: 'INV10', ...v3 });
    call('aplicarAjusteInventario(__inv3)');
    assert.equal(call(`${prod('P1')}.qtd`), 185);
});
