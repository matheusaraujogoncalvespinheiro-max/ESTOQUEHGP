// Testes dos relatórios (funções puras), da prescrição estruturada e das senhas com hash. Executa com: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({ console, crypto: globalThis.crypto, TextEncoder, state: { currentUser: null }, MOCK_DATA: { AUTORIZACOES: [], LEITOS_ESTADO: {}, INTERNACOES: [] }, USERS_DB: {}, formatMoney: (v) => 'R$ ' + Number(v).toFixed(2), formatDateBR: (d) => String(d).split('-').reverse().join('/'), todayISO: () => '2026-06-01' });
['assets/js/core/utils.js', 'assets/js/core/validators.js', 'assets/js/core/regras.js', 'assets/js/core/senha.js', 'assets/js/services/portaria.js', 'assets/js/services/estrutura-hospitalar.js', 'assets/js/services/hospital.js', 'assets/js/services/relatorios.js']
    .forEach(f => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f }));
const call = (code) => vm.runInContext(code, ctx);
const json = (code) => JSON.parse(JSON.stringify(call(code)));

test('curva ABC: classifica pelo valor em estoque e ignora produto sem custo', () => {
    const r = json(`relatorioCurvaABC([
        { barcode: 'A', material: 'Caro', setor: 'OPME', qtd: 10, cadastro: { custo: 100 } },
        { barcode: 'B', material: 'Médio', setor: 'OPME', qtd: 10, cadastro: { custo: 10 } },
        { barcode: 'C', material: 'Barato', setor: 'OPME', qtd: 10, cadastro: { custo: 1 } },
        { barcode: 'D', material: 'Sem custo', setor: 'OPME', qtd: 5, cadastro: {} }])`);
    assert.deepEqual(r.linhas.map(l => l.classe + ':' + l.codigo), ['A:A', 'B:B', 'C:C']);
    assert.equal(r.resumo.find(x => x.rot === 'Sem custo').valor, 1);
});

test('reposição: produtos no ponto de pedido com sugestão até o máximo', () => {
    const r = json(`relatorioReposicao([
        { barcode: 'A', material: 'Baixo', setor: 'OPME', qtd: 2, min: 5, cadastro: { max: 20 } },
        { barcode: 'B', material: 'Zerado', setor: 'OPME', qtd: 0, min: 3, cadastro: {} },
        { barcode: 'C', material: 'Normal', setor: 'OPME', qtd: 50, min: 5, cadastro: {} }])`);
    assert.equal(r.linhas.length, 2);
    assert.equal(r.linhas[0].codigo, 'B');
    assert.equal(r.linhas.find(l => l.codigo === 'A').sugerido, 18);
    assert.equal(r.linhas.find(l => l.codigo === 'B').sugerido, 6);
});

test('validade: lista só lotes vencidos ou a vencer, com saldo', () => {
    const r = json(`relatorioValidade([{ barcode: 'A', material: 'X', setor: 'OPME', lotes: [
        { lote: 'V', validade: '2026-11-10', quantidade: 3 }, { lote: 'P', validade: '2026-12-01', quantidade: 2 },
        { lote: 'OK', validade: '2027-06-01', quantidade: 9 }, { lote: 'ZERO', validade: '2026-01-01', quantidade: 0 }] }], new Date('2026-11-18T12:00:00'))`);
    assert.deepEqual(r.linhas.map(l => l.lote + ':' + l.situacao), ['V:Vencido', 'P:A vencer']);
});

test('ocupação: soma por andar/ala e a taxa', () => {
    const r = json(`relatorioOcupacao(estruturaHospital().filter(l => l.quarto === '101'), { '101A': { status: 'OCUPADO' } })`);
    assert.equal(r.linhas[0].total, 2);
    assert.equal(r.linhas[0].OCUPADO, 1);
    assert.equal(r.linhas[0].taxa, '50%');
});

test('exames: conta por tipo e calcula a espera média até a realização', () => {
    const r = json(`relatorioExames([
        { data_solicitacao: '2026-11-01', setor_destino: 'IMAGENOLOGIA', tipo_nome: 'TC', prioridade: 'URGENTE', status: 'REALIZADO', criado_em: '2026-11-01T10:00:00Z', realizado: { em: '2026-11-03T10:00:00Z' } },
        { data_solicitacao: '2026-11-02', setor_destino: 'IMAGENOLOGIA', tipo_nome: 'TC', prioridade: 'ELETIVO', status: 'CANCELADO' },
        { data_solicitacao: '2026-11-03', setor_destino: 'IMAGENOLOGIA', tipo_nome: 'TC', prioridade: 'ELETIVO', status: 'AGENDADO' }], '', '')`);
    const l = r.linhas[0];
    assert.deepEqual([l.solicitados, l.urgentes, l.realizados, l.cancelados, l.fila, l.espera], [3, 1, 1, 1, 1, 2]);
});

test('rastreabilidade OPME: item, lote e paciente, com filtros', () => {
    const laudos = `[{ data: '2026-11-10', hora: '09:00', paciente: 'Maria', cartao_sus: '1', procedimento: 'ICP', setor: 'HEMODINAMICA', usuario: 'ana', itens_opme: [{ descricao: 'STENT', barcode: '789', lote: 'L99', validade: '2027-01-01', quantidade: 2 }] }]`;
    assert.equal(json(`relatorioRastreabilidadeOpme(${laudos}, '', '', '')`).linhas[0].lote, 'L99');
    assert.equal(json(`relatorioRastreabilidadeOpme(${laudos}, '', '', 'zzz')`).linhas.length, 0);
    assert.equal(json(`relatorioRastreabilidadeOpme(${laudos}, '2026-12-01', '', '')`).linhas.length, 0);
});

test('CSV: separador ponto e vírgula, aspas escapadas e BOM', () => {
    const csv = call(`relatorioParaCsv({ colunas: [{ k: 'a', label: 'A' }, { k: 'b', label: 'B' }], linhas: [{ a: 'x"y', b: 'z;w' }] })`);
    assert.ok(csv.startsWith('﻿"A";"B"'));
    assert.ok(csv.includes('"x""y";"z;w"'));
});

test('prescrição estruturada: exige medicamento, dose e frequência', () => {
    const v = (itens) => { try { return call(`validarItensPrescricao(${JSON.stringify(itens)})`).length; } catch (e) { return e.message; } };
    assert.equal(v([{ medicamento: 'Dipirona 500mg', dose: '1 comprimido', frequencia: '6/6h' }]), 1);
    assert.match(v([]), /ao menos um item/);
    assert.match(v([{ medicamento: 'Dipirona', dose: '', frequencia: '6/6h' }]), /dose/);
    assert.match(v([{ medicamento: 'Dipirona', dose: '1', frequencia: '' }]), /frequência/);
});

test('senha: hash com sal, confere, rejeita a errada e aceita conta antiga em texto', async () => {
    const u = {};
    await call('definirSenha')(u, 'segredo1');
    assert.equal(u.password, '');
    assert.ok(u.password_hash.length === 64 && u.password_salt.length === 32);
    assert.deepEqual(JSON.parse(JSON.stringify(await call('conferirSenha')(u, 'segredo1'))), { ok: true, legado: false });
    assert.equal((await call('conferirSenha')(u, 'errada')).ok, false);
    const outro = {};
    await call('definirSenha')(outro, 'segredo1');
    assert.notEqual(outro.password_hash, u.password_hash);
    assert.deepEqual(JSON.parse(JSON.stringify(await call('conferirSenha')({ password: '1234' }, '1234'))), { ok: true, legado: true });
    assert.equal((await call('conferirSenha')({ password: '1234' }, '0000')).ok, false);
    assert.equal((await call('conferirSenha')(null, 'x')).ok, false);
});

test('farmácia (#50): dispensações somam por produto, ignoram canceladas e respeitam o período', () => {
    const r = json(`relatorioFarmaciaDispensacoes([
        { id: 1, criado_em: '2026-03-02T10:00:00', produto_desc: 'Dipirona', quantidade: 2, paciente_nome: 'A', lote_codigo: 'L1', controle: 'Comum' },
        { id: 2, criado_em: '2026-03-03T10:00:00', produto_desc: 'Dipirona', quantidade: 3, paciente_nome: 'B', lote_codigo: 'L2', controle: 'Comum' },
        { id: 3, criado_em: '2026-03-03T11:00:00', produto_desc: 'Morfina', quantidade: 1, paciente_nome: 'A', lote_codigo: 'L9', controle: 'Controle especial' },
        { id: 4, criado_em: '2026-03-04T11:00:00', produto_desc: 'Dipirona', quantidade: 9, paciente_nome: 'C', lote_codigo: 'L1', controle: 'Comum', ativo: false },
        { id: 5, criado_em: '2026-04-20T11:00:00', produto_desc: 'Dipirona', quantidade: 7, paciente_nome: 'D', lote_codigo: 'L3', controle: 'Comum' }], '2026-03-01', '2026-03-31')`);
    assert.deepEqual(r.linhas.map(l => [l.produto, l.dispensacoes, l.unidades, l.pacientes, l.lotes]), [['Dipirona', 2, 5, 2, 2], ['Morfina', 1, 1, 1, 1]]);
    assert.deepEqual(r.resumo.map(x => x.valor), [3, 6, 1, 1]);
});

test('farmácia (#50): requisições contam situação e prioridade no período', () => {
    const r = json(`relatorioFarmaciaRequisicoes([
        { id: 1, criado_em: '2026-03-02T10:00:00', codigo: 'REQ1', unidade: 'UTI', prioridade: 'Rotina', situacao: 'Solicitada', itens: [{}, {}] },
        { id: 2, criado_em: '2026-03-03T10:00:00', codigo: 'REQ2', unidade: 'UTI', prioridade: 'Urgente', situacao: 'Atendida', itens: [{}] },
        { id: 3, criado_em: '2026-05-03T10:00:00', codigo: 'REQ3', unidade: 'UTI', prioridade: 'Rotina', situacao: 'Atendida', itens: [] }], '2026-03-01', '2026-03-31')`);
    assert.deepEqual(r.resumo.map(x => x.valor), [2, 1, 1, 1]);
    assert.equal(r.linhas[0].codigo, 'REQ2');
});

test('patrimônio (#69): situação, garantia vencida, custo e baixa', () => {
    const r = json(`relatorioPatrimonio([
        { nome: 'Monitor', codigo: 'EQP1', situacao_op: 'Operacional', garantia_ate: '2026-01-10', valor_aquisicao: 1500, responsavel: 'Setor UTI' },
        { nome: 'Bomba', codigo: 'EQP2', situacao_op: 'Baixado', garantia_ate: '2025-01-01', baixa_data: '2026-02-01', baixa_motivo: 'Sem conserto' },
        { nome: 'Inativo', ativo: false }], '2026-06-01')`);
    assert.deepEqual(r.resumo.map(x => x.valor), [2, 1, 1]);
    assert.match(r.linhas.find(l => l.codigo === 'EQP1').garantia, /Vencida em/);
    assert.match(r.linhas.find(l => l.codigo === 'EQP2').baixa, /Sem conserto/);
});

test('Farmácia: consumo por paciente/unidade desconta sobra; controlados listam receita e devolvido; Estoque por lote filtra validade', () => {
    const disp = `[{ id: 'd1', codigo: 'DSP1', produto_desc: 'STENT', lote_codigo: 'L2', quantidade: 5, paciente_id: 'pa', paciente_nome: 'PACIENTE A', leito_id: '101A', criado_em: '2026-03-01T10:00', controlado: true, controle: 'Controle especial', receita_numero: 'R1', ativo: true },
        { id: 'd2', codigo: 'DSP2', produto_desc: 'GAZE', quantidade: 9, paciente_id: 'pb', paciente_nome: 'PACIENTE B', criado_em: '2026-03-02T10:00', ativo: false }]`;
    const dev = `[{ id: 'v1', dispensacao_id: 'd1', quantidade: 2, ativo: true }]`;
    const pac = json(`relatorioFarmaciaConsumo('PACIENTE', { dispensacoes: ${disp}, devolucoes: ${dev} }, '', '')`);
    assert.equal(pac.linhas.length, 1); assert.equal(pac.linhas[0].unidades, 3);
    const uni = json(`relatorioFarmaciaConsumo('UNIDADE', { dispensacoes: ${disp}, devolucoes: [], saidas: [{ setor: 'FARMACIA', destino_detalhe: 'UTI', quantidade: 4, produto_desc: 'X', criado_em: '2026-03-03', ativo: true }], unidadeDoLeito: () => '1º andar · Ala A' }, '', '')`);
    assert.deepEqual(uni.linhas.map(l => `${l.nome}:${l.unidades}`), ['1º andar · Ala A:5', 'UTI:4']);
    const ctr = json(`relatorioFarmaciaControlados(${disp}, ${dev}, '', '')`);
    assert.equal(ctr.linhas.length, 1); assert.equal(ctr.linhas[0].devolvido, 2); assert.equal(ctr.linhas[0].receita, 'R1');
    const lotes = json(`relatorioEstoqueLotes([{ barcode: 'A', material: 'X', setor: 'OPME', cadastro: { config: { usa_lote: true } }, lotes: [{ lote: 'L1', validade: '2026-05-01', quantidade: 1 }, { lote: 'L2', validade: '2027-05-01', quantidade: 1 }] },
        { barcode: 'B', material: 'Y', setor: 'OPME', qtd: 3, lotes: [] }], '', new Date('2026-01-01'), { de: '2026-04-01', ate: '2026-06-30' })`);
    assert.deepEqual(lotes.linhas.map(l => l.lote), ['L1']);
    const salas = json(`relatorioSalasSemBaixa([{ id: 1, status: 'EM_PROCEDIMENTO', paciente: 'P', materiais: [{ barcode: 'A', material: 'X', lote: 'L1', qtd_puxada: 3, qtd_confirmada: 1 }, { barcode: 'B', material: 'Y', lote: 'L2', qtd_puxada: 2, qtd_confirmada: 0, baixado: true }] }])`);
    assert.equal(salas.linhas.length, 1); assert.equal(salas.linhas[0].pendente, 2);
});
