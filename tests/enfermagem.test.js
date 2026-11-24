// Testes da Etapa 6: aprazamento, checagem de medicação e cuidados, sinais vitais do internado, passagem de plantão,
// escala e prescrição de cuidados. Executa com: npm test. Só dados fictícios; o banco é um Firestore simulado em memória (nunca o real).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function criarBanco() {
    const store = {};
    const clone = (o) => JSON.parse(JSON.stringify(o));
    const semUndefined = (o, onde) => { JSON.stringify(o, (k, v) => { if (v === undefined) throw new Error(`Unsupported field value: undefined em ${onde}.${k}`); return v; }); };
    const ref = (col, id) => ({
        col, id: String(id),
        get: async () => { const d = (store[col] || {})[String(id)]; return { id: String(id), exists: d !== undefined, data: () => (d === undefined ? undefined : clone(d)) }; },
        set: async (d) => { semUndefined(d, `${col}/${id}`); (store[col] = store[col] || {})[String(id)] = clone(d); }
    });
    return {
        store,
        collection: (col) => ({
            doc: (id) => ref(col, id),
            where: (campo, op, valor) => ({ get: async () => ({ docs: Object.entries(store[col] || {}).filter(([, d]) => d[campo] === valor).map(([id, d]) => ({ id, data: () => clone(d) })) }) })
        }),
        runTransaction: async (fn) => {
            const escritas = [];
            await fn({ get: (r) => r.get(), set: (r, d) => { semUndefined(d, `${r.col}/${r.id}`); escritas.push([r, d]); } });   // nada é gravado se fn lançar erro
            escritas.forEach(([r, d]) => { (store[r.col] = store[r.col] || {})[r.id] = clone(d); });
        }
    };
}

const banco = criarBanco();
const auditoria = [];
const ctx = vm.createContext({
    console, state: { currentUser: null }, nowISO: () => new Date().toISOString(),
    MOCK_DATA: { PRONTUARIOS: [], ATENDIMENTOS: [], SOLICITACOES_EXAME: [], INTERNACOES: [], LEITOS_ESTADO: {}, REGISTROS_CLINICOS: { paciente_id: null, items: [] }, CONFIG_HOSPITAL: { nome: 'Hospital de Teste', cnes: '1234567' } },
    requireDb: () => banco, auditar: async (e) => { auditoria.push(e); }, registrarAcesso: () => {},
    cadRowsOf: () => [],
    docToObj: (d) => ({ id: d.id, ...d.data() }),
    WATCHER_FACTORIES: {}, watchers: {}, watchersWanted: new Set(), onSnapshotData: () => () => {}, db_stopAtendimentoWatchers: () => {}, db_watch: () => {}
});
['assets/js/core/validators.js', 'assets/js/core/regras.js', 'assets/js/core/permissions.js', 'assets/js/services/portaria.js', 'assets/js/services/estrutura-hospitalar.js',
    'assets/js/services/db-hospital.js', 'assets/js/services/hospital.js', 'assets/js/services/alergias.js', 'assets/js/services/triagem-clinica.js', 'assets/js/services/db-enfermagem.js', 'assets/js/services/enfermagem.js'].forEach(f =>
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f }));
const call = (code) => vm.runInContext(code, ctx);
const j = (code) => JSON.parse(call(`JSON.stringify(${code})`));
const dados = (nome, valor) => call(`globalThis.${nome} = ${JSON.stringify(valor)}`);
const entrar = (role, username = role.toLowerCase(), name = `Usuário ${role}`) => dados('__u', { username, name, role }) && call('state.currentUser = __u');
const erroDe = async (codigo) => { try { await call(codigo); return null; } catch (e) { return e.message; } };
const doc = (col, id) => (banco.store[col] || {})[id];
const guardar = (col, obj) => { (banco.store[col] = banco.store[col] || {})[obj.id] = JSON.parse(JSON.stringify(obj)); return obj; };

// "Agora" fixo para as regras puras; os horários são escritos no formato do campo datetime-local (horário local).
const AGORA = new Date(2026, 5, 10, 12, 0, 0);
dados('__agora', AGORA.toISOString());
const agoraD = () => call('new Date(__agora)');
const local = (dia, hora, min = 0) => `2026-06-${String(dia).padStart(2, '0')}T${String(hora).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
const iso = (dia, hora, min = 0) => new Date(2026, 5, dia, hora, min).toISOString();

// ============ Horários: validação e geração ============

test('horários: ordena, exige ao menos um, recusa formato inválido, repetidos e datas fora do limite de digitação', () => {
    const ok = j(`validarHorarios(['${local(10, 20)}', '${local(10, 14)}'], new Date(__agora))`);
    assert.deepEqual(ok, [iso(10, 14), iso(10, 20)]);
    assert.throws(() => call('validarHorarios([], new Date(__agora))'), /ao menos um horário/);
    assert.throws(() => call("validarHorarios(['ontem às 8'], new Date(__agora))"), /Horário 1 inválido/);
    assert.throws(() => call("validarHorarios(['2026-02-30T10:00'], new Date(__agora))"), /Horário 1 inválido/);   // o dia precisa existir
    assert.throws(() => call("validarHorarios(['2026-06-11T25:00'], new Date(__agora))"), /Horário 1 inválido/);
    assert.equal(call("validarHorarios(['2026-06-11T10:00:00.000Z'], new Date(__agora)).length"), 1);   // o ISO gerado também vale
    assert.throws(() => call(`validarHorarios(['${local(10, 14)}', '${local(10, 14)}'], new Date(__agora))`), /repetidos/);
    assert.throws(() => call(`validarHorarios(['${local(8, 8)}'], new Date(__agora))`), /anterior a 24 h/);
    assert.throws(() => call(`validarHorarios(['${local(30, 8)}'], new Date(__agora))`), /além de 14 dias/);
    assert.equal(call(`validarHorarios(['${local(9, 13)}'], new Date(__agora)).length`), 1);   // 23 h atrás ainda vale
    const muitos = Array.from({ length: 61 }, (_, n) => `'2026-06-11T${String(Math.floor(n / 6)).padStart(2, '0')}:${String((n % 6) * 10).padStart(2, '0')}'`).join(',');
    assert.throws(() => call(`validarHorarios([${muitos}], new Date(__agora))`), /No máximo 60/);
});

test('gerar horários: só aritmética "a cada X horas, N vezes" e limites de digitação', () => {
    assert.deepEqual(j(`gerarHorarios({ inicio: '${local(10, 14)}', intervalo_horas: '6', quantidade: '4' })`), [iso(10, 14), iso(10, 20), iso(11, 2), iso(11, 8)]);
    assert.deepEqual(j(`gerarHorarios({ inicio: '${local(10, 14)}', intervalo_horas: '1,5', quantidade: 2 })`), [iso(10, 14), iso(10, 15, 30)]);
    assert.throws(() => call("gerarHorarios({ inicio: '', intervalo_horas: 6, quantidade: 2 })"), /primeiro horário/);
    assert.throws(() => call(`gerarHorarios({ inicio: '${local(10, 14)}', intervalo_horas: 0, quantidade: 2 })`), /de 1 a 48 horas/);
    assert.throws(() => call(`gerarHorarios({ inicio: '${local(10, 14)}', intervalo_horas: 49, quantidade: 2 })`), /de 1 a 48 horas/);
    assert.throws(() => call(`gerarHorarios({ inicio: '${local(10, 14)}', intervalo_horas: 6, quantidade: 0 })`), /de 1 a 60/);
    assert.throws(() => call(`gerarHorarios({ inicio: '${local(10, 14)}', intervalo_horas: 6, quantidade: 2.5 })`), /de 1 a 60/);
    assert.equal(call(`isoParaCampoLocal('${iso(10, 14, 5)}')`), local(10, 14, 5));
});

// ============ Cuidados, checagens e decisão ============

test('prescrição de cuidados: cuidado e frequência obrigatórios, limites e texto', () => {
    const itens = j("validarItensCuidados([{ cuidado: ' Mudança de decúbito ', frequencia: 'a cada 2 h', observacao: '' }, { cuidado: '', frequencia: '' }])");
    assert.deepEqual(itens, [{ cuidado: 'Mudança de decúbito', frequencia: 'a cada 2 h', observacao: '' }]);
    assert.equal(call("textoDoItemCuidado({ cuidado: 'Curativo', frequencia: 'diário', observacao: 'sem pomada' })"), 'Curativo · diário · (sem pomada)');
    assert.throws(() => call('validarItensCuidados([])'), /ao menos um cuidado/);
    assert.throws(() => call("validarItensCuidados([{ cuidado: 'ab', frequencia: 'x' }])"), /mínimo 3 letras/);
    assert.throws(() => call("validarItensCuidados([{ cuidado: 'Curativo', frequencia: '' }])"), /informe a frequência/);
    assert.throws(() => call(`validarItensCuidados([{ cuidado: '${'x'.repeat(161)}', frequencia: 'x' }])`), /no máximo 160/);
});

test('checagens do aprazamento: uma por horário, id determinístico e dados do paciente copiados', () => {
    dados('__reg', { id: 'clin_1', tipo: 'PRESCRICAO', paciente_id: 'p1', internacao_id: 'int1', itens: [{ medicamento: 'Dipirona 500 mg', dose: '1 comprimido', via: 'VO', frequencia: '6/6 h' }] });
    dados('__int', { id: 'int1', paciente_id: 'p1', paciente_nome: 'Maria de Teste', leito_id: '201A', ala: 'Ala A/B' });
    dados('__hs', [iso(10, 14), iso(10, 20)]);
    const cs = j("montarChecagens(__reg, 0, __hs, __int, { username: 'enf1', name: 'Enf. Teste' }, '2026-06-10T12:00:00.000Z')");
    assert.equal(cs.length, 2);
    assert.match(cs[0].id, /^chk_clin_1_0_\d{12}$/);
    assert.notEqual(cs[0].id, cs[1].id);
    assert.deepEqual([cs[0].tipo, cs[0].status, cs[0].medicamento, cs[0].dose, cs[0].via, cs[0].paciente_nome, cs[0].leito_id, cs[0].internacao_id], ['MEDICAMENTO', 'PENDENTE', 'Dipirona 500 mg', '1 comprimido', 'VO', 'Maria de Teste', '201A', 'int1']);
    assert.equal(cs[0].dia, call(`diaLocalDe('${iso(10, 14)}')`));
    assert.equal(call("montarChecagens(__reg, 0, __hs, __int, { username: 'a', name: 'b' }, 'x')[0].id"), cs[0].id);   // mesmo item e horário = mesmo id
    assert.throws(() => call("montarChecagens(__reg, 3, __hs, __int, { username: 'a', name: 'b' }, 'x')"), /Item da prescrição não encontrado/);
    dados('__regc', { id: 'clin_2', tipo: 'CUIDADO', paciente_id: 'p1', internacao_id: 'int1', itens: [{ cuidado: 'Mudança de decúbito', frequencia: 'a cada 2 h', observacao: '' }] });
    const cc = j("montarChecagens(__regc, 0, __hs, __int, { username: 'enf1', name: 'Enf. Teste' }, 'x')");
    assert.deepEqual([cc[0].tipo, cc[0].medicamento, cc[0].item_texto], ['CUIDADO', '', 'Mudança de decúbito · a cada 2 h']);
});

test('decisão da checagem: feito é simples; não feito exige tipo e descrição do motivo', () => {
    assert.deepEqual(j("validarDecisaoChecagem({ resultado: 'FEITO', observacao: ' ok ', registro_conselho: ' COREN-TO 123 ' })"),
        { resultado: 'FEITO', observacao: 'ok', registro_conselho: 'COREN-TO 123', motivo_tipo: '', motivo_texto: '' });
    assert.deepEqual(j("validarDecisaoChecagem({ resultado: 'NAO_FEITO', motivo_tipo: 'RECUSA', motivo_texto: 'Paciente recusou a dose' })").motivo_tipo, 'RECUSA');
    assert.throws(() => call("validarDecisaoChecagem({ resultado: 'TALVEZ' })"), /Escolha o resultado/);
    assert.throws(() => call("validarDecisaoChecagem({ resultado: 'NAO_FEITO', motivo_texto: 'Paciente recusou' })"), /Escolha o motivo/);
    assert.throws(() => call("validarDecisaoChecagem({ resultado: 'NAO_FEITO', motivo_tipo: 'INVENTADO', motivo_texto: 'Paciente recusou' })"), /Escolha o motivo/);
    assert.throws(() => call("validarDecisaoChecagem({ resultado: 'NAO_FEITO', motivo_tipo: 'RECUSA', motivo_texto: 'não' })"), /mínimo 5 letras/);
    assert.throws(() => call(`validarDecisaoChecagem({ resultado: 'FEITO', observacao: '${'x'.repeat(301)}' })`), /no máximo 300/);
});

test('situação e resumo: pendente que passou do horário está em atraso; próximas dentro da janela', () => {
    dados('__cs', [
        { id: 'a', status: 'PENDENTE', previsto_em: iso(10, 9) }, { id: 'b', status: 'PENDENTE', previsto_em: iso(10, 13) }, { id: 'c', status: 'PENDENTE', previsto_em: iso(10, 18) },
        { id: 'd', status: 'FEITO', previsto_em: iso(10, 8) }, { id: 'e', status: 'NAO_FEITO', previsto_em: iso(10, 8) }, { id: 'f', status: 'SUSPENSO', previsto_em: iso(10, 8) }
    ]);
    assert.equal(call("situacaoDaChecagem(__cs[0], new Date(__agora))"), 'ATRASADA');
    assert.equal(call("situacaoDaChecagem(__cs[1], new Date(__agora))"), 'PREVISTA');
    assert.equal(call("situacaoDaChecagem(__cs[3], new Date(__agora))"), 'FEITO');
    assert.deepEqual(j('resumoChecagens(__cs, new Date(__agora))'), { atrasadas: 1, proximas: 1, pendentes: 3, feitas: 1, nao_feitas: 1 });
    assert.deepEqual([call("rotuloChecagem({ status: 'FEITO', tipo: 'MEDICAMENTO' })"), call("rotuloChecagem({ status: 'FEITO', tipo: 'CUIDADO' })"), call("rotuloChecagem({ status: 'NAO_FEITO', tipo: 'MEDICAMENTO' })"), call("rotuloChecagem({ status: 'NAO_FEITO', tipo: 'CUIDADO' })")],
        ['Administrado', 'Realizado', 'Não administrado', 'Não realizado']);
});

// ============ Sinais vitais do internado ============

test('sinais vitais do internado: faixas de digitação, hora da medição e motivo de não aferir', () => {
    dados('__int', { id: 'int1', paciente_id: 'p1', leito_id: '201A' });
    dados('__usr', { username: 'enf1', name: 'Enf. Teste', role: 'FUNC_ENFERMAGEM' });
    const s = j("montarSinaisInternado(__int, { pa_sistolica: '120', pa_diastolica: '80', fc: '72', temperatura: '36,5' }, __usr, new Date(__agora))");
    assert.deepEqual(s.valores, { pa_sistolica: 120, pa_diastolica: 80, fc: 72, temperatura: 36.5 });
    assert.deepEqual([s.aferido, s.internacao_id, s.paciente_id, s.por], [true, 'int1', 'p1', 'enf1']);
    assert.equal(s.medido_em, iso(10, 12));
    const antes = j(`montarSinaisInternado(__int, { fc: '72', medido_em: '${local(10, 10, 30)}' }, __usr, new Date(__agora))`);
    assert.equal(antes.medido_em, iso(10, 10, 30));
    assert.equal(antes.dia, '2026-06-10');
    assert.throws(() => call(`montarSinaisInternado(__int, { fc: '72', medido_em: '${local(10, 18)}' }, __usr, new Date(__agora))`), /não pode ser futura/);
    assert.throws(() => call(`montarSinaisInternado(__int, { fc: '72', medido_em: '${local(8, 12)}' }, __usr, new Date(__agora))`), /mais de 24 h atrás/);
    assert.throws(() => call("montarSinaisInternado(__int, { fc: '9999' }, __usr, new Date(__agora))"), /fora do limite de digitação/);
    assert.throws(() => call("montarSinaisInternado(__int, { pa_sistolica: '80', pa_diastolica: '120' }, __usr, new Date(__agora))"), /sistólica deve ser maior/);
    assert.throws(() => call("montarSinaisInternado(__int, {}, __usr, new Date(__agora))"), /ao menos um sinal vital/);
    const nao = j("montarSinaisInternado(__int, { nao_aferido: true, motivo_nao_aferido: 'Paciente em procedimento' }, __usr, new Date(__agora))");
    assert.deepEqual([nao.aferido, nao.motivo_nao_aferido], [false, 'Paciente em procedimento']);
});

// ============ Escala de enfermagem ============

test('escala: ninguém repetido na equipe nem em duas unidades no mesmo dia e turno', () => {
    dados('__esc', [{ id: 'e1', ativo: true, data: '2026-06-10', turno: 'Manhã', unidade: 'Ala A/B', responsavel: 'f1', integrantes: [{ funcionario: 'f2' }] }]);
    const base = { data: '2026-06-10', turno: 'Manhã', unidade: 'Ala C/D', responsavel: 'f3', integrantes: [{ funcionario: 'f4' }] };
    dados('__f', base);
    assert.deepEqual(j('validarEscalaEnfermagem(__f, "", __esc)'), []);
    dados('__f', { ...base, integrantes: [{ funcionario: 'f4' }, { funcionario: 'f4' }] });
    assert.match(j('validarEscalaEnfermagem(__f, "", __esc)')[0].mensagem, /repetido/);
    dados('__f', { ...base, integrantes: [{ funcionario: 'f3' }] });   // o responsável também como integrante
    assert.match(j('validarEscalaEnfermagem(__f, "", __esc)')[0].mensagem, /responsável do plantão não precisa/);
    dados('__f', { ...base, integrantes: [{ funcionario: 'f2' }] });
    assert.match(j("validarEscalaEnfermagem(__f, '', __esc, (x) => 'Fulana ' + x)")[0].mensagem, /Fulana f2 já está escalado\(a\) em Ala A\/B/);
    dados('__f', { ...base, responsavel: 'f1' });
    assert.equal(j('validarEscalaEnfermagem(__f, "", __esc)').length, 1);
    dados('__f', { ...base, turno: 'Tarde', responsavel: 'f1' });   // outro turno: pode
    assert.deepEqual(j('validarEscalaEnfermagem(__f, "", __esc)'), []);
    dados('__f', { ...base, unidade: 'Ala A/B', responsavel: 'f1', integrantes: [{ funcionario: 'f2' }] });   // a própria unidade (edição da mesma escala)
    assert.deepEqual(j('validarEscalaEnfermagem(__f, "e1", __esc)'), []);
    assert.deepEqual(j("escalasDoDia(__esc, '2026-06-10', 'Ala A/B').map(e => e.id)"), ['e1']);
    assert.deepEqual(j("escalasDoDia(__esc, '2026-06-11')"), []);
});

// ============ Passagem de plantão ============

test('passagem de plantão: unidade, turno e COREN obrigatórios; fotografia só dos internados da unidade', () => {
    dados('__ints', [
        { id: 'i1', status: 'ATIVA', ala: 'Ala A/B', paciente_id: 'p1', paciente_nome: 'Maria de Teste', leito_id: '201A' },
        { id: 'i2', status: 'ATIVA', ala: 'Ala C/D', paciente_id: 'p2', paciente_nome: 'José de Teste', leito_id: '301A' },
        { id: 'i3', status: 'ALTA', ala: 'Ala A/B', paciente_id: 'p3', paciente_nome: 'Ana de Teste', leito_id: '201B' }
    ]);
    dados('__chk', [{ id: 'c1', internacao_id: 'i1', status: 'PENDENTE', previsto_em: iso(10, 9) }, { id: 'c2', internacao_id: 'i1', status: 'PENDENTE', previsto_em: iso(10, 18) }, { id: 'c3', internacao_id: 'i1', status: 'NAO_FEITO', previsto_em: iso(10, 8) }]);
    dados('__sin', [{ paciente_id: 'p1', medido_em: iso(10, 11), aferido: true, valores: { fc: 80 } }]);
    dados('__usr', { username: 'enf1', name: 'Enf. Teste' });
    const dep = "{ internacoes: __ints, checagens: __chk, sinais: __sin, agora: new Date(__agora) }";
    const p = j(`montarPassagem({ unidade: 'Ala A/B', turno: 'Manhã', registro_conselho: 'COREN-TO 123', geral: ' Sem intercorrências ', recados: { i1: ' Jejum às 22 h ' } }, ${dep}, __usr)`);
    assert.equal(p.pacientes.length, 1);
    assert.deepEqual([p.pacientes[0].paciente_nome, p.pacientes[0].recado, p.pacientes[0].atrasadas, p.pacientes[0].pendentes, p.pacientes[0].nao_feitas], ['Maria de Teste', 'Jejum às 22 h', 1, 2, 1]);
    assert.match(p.pacientes[0].ultimo_sinal.texto, /FC 80/);
    assert.deepEqual([p.geral, p.passado_por, p.recebido_por, p.dia], ['Sem intercorrências', 'enf1', '', '2026-06-10']);
    assert.throws(() => call(`montarPassagem({ unidade: '', turno: 'Manhã', registro_conselho: 'COREN 1' }, ${dep}, __usr)`), /Escolha a unidade/);
    assert.throws(() => call(`montarPassagem({ unidade: 'Ala A/B', turno: 'Madrugada', registro_conselho: 'COREN 1' }, ${dep}, __usr)`), /Escolha o turno/);
    assert.throws(() => call(`montarPassagem({ unidade: 'Ala A/B', turno: 'Manhã', registro_conselho: 'ab' }, ${dep}, __usr)`), /registro no conselho/);
    assert.throws(() => call(`montarPassagem({ unidade: 'Ala A/B', turno: 'Manhã', registro_conselho: 'COREN 1', recados: { i1: '${'x'.repeat(501)}' } }, ${dep}, __usr)`), /no máximo 500/);
    assert.throws(() => call(`montarPassagem({ unidade: 'Ala E/F', turno: 'Manhã', registro_conselho: 'COREN 1' }, ${dep}, __usr)`), /Não há pacientes internados nesta unidade/);
    assert.equal(call(`montarPassagem({ unidade: 'Ala E/F', turno: 'Manhã', registro_conselho: 'COREN 1', geral: 'Unidade vazia' }, ${dep}, __usr).pacientes.length`), 0);
});

// ============ Fluxo completo com banco simulado ============

const pacienteFicticio = { id: 'pac_enf1', nome: 'Maria de Teste', prontuario: 'P900', ativo: true };
const registroPrescricao = (extra = {}) => guardar('registros_clinicos', {
    id: 'clin_presc1', tipo: 'PRESCRICAO', paciente_id: 'pac_enf1', internacao_id: '', texto: 'Dipirona 500 mg', complementa_id: '', autor: 'med1', autor_nome: 'Dr. Teste', em: new Date().toISOString(),
    itens: [{ medicamento: 'Dipirona 500 mg', dose: '1 comprimido', via: 'VO', frequencia: '6/6 h', duracao: '', observacao: '' }], ...extra
});

test('fluxo: internar, prescrever (médico), aprazar (enfermagem), checar e conferir quem fez', async () => {
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enf. Teste');
    dados('__pac', pacienteFicticio);
    const i = JSON.parse(JSON.stringify(await call("internarPaciente({ paciente: __pac, leito_id: '201A', setor_origem: 'Pronto Socorro' })")));
    call(`MOCK_DATA.INTERNACOES = [${JSON.stringify(i)}]`);
    guardar('internacoes', i);

    // o médico prescreve pelo prontuário; só ele (e a enfermagem) enxergam, mas só a enfermagem apraza
    entrar('MEDICO', 'med1', 'Dr. Teste');
    dados('__i', i);
    const reg = JSON.parse(JSON.stringify(await call("registrarClinico({ internacao: __i, paciente_id: 'pac_enf1', tipo: 'PRESCRICAO', itens: [{ medicamento: 'Dipirona 500 mg', dose: '1 comprimido', via: 'VO', frequencia: '6/6 h' }], registro_conselho: 'CRM 1' })")));
    const hs = [local(10, 14), local(10, 20)].map(h => new Date(h).toISOString());
    dados('__hs', [new Date(Date.now() + 3600000).toISOString().slice(0, 16), new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 16)]);
    assert.match(await erroDe(`aprazarItem('${reg.id}', 0, __hs)`), /Acesso negado/);

    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enf. Teste');
    call(`MOCK_DATA.PRESCRICOES_MED = [${JSON.stringify(reg)}]`);
    const r1 = JSON.parse(JSON.stringify(await call(`aprazarItem('${reg.id}', 0, __hs)`)));
    assert.deepEqual(r1, { criadas: 2, repetidas: 0 });
    const ids = Object.keys(banco.store.checagens);
    assert.equal(ids.length, 2);
    // aprazar de novo os mesmos horários não duplica
    const r2 = JSON.parse(JSON.stringify(await call(`aprazarItem('${reg.id}', 0, __hs)`)));
    assert.deepEqual(r2, { criadas: 0, repetidas: 2 });
    assert.equal(Object.keys(banco.store.checagens).length, 2);
    assert.equal(auditoria.filter(a => a.acao === 'APRAZAR').length, 2);

    // a checagem de uma prescrição de consulta (sem internação) não é aprazável: o item exige internação ativa
    registroPrescricao({ id: 'clin_alta', internacao_id: '' });
    assert.match(await erroDe("aprazarItem('clin_alta', 0, __hs)"), /internação ativa/);

    // checar: administrado
    const id1 = ids[0];
    const feito = JSON.parse(JSON.stringify(await call(`registrarChecagem('${id1}', { resultado: 'FEITO', registro_conselho: 'COREN-TO 123', observacao: 'Sem queixas' })`)));
    assert.deepEqual([feito.status, feito.feito_por, feito.feito_por_nome, feito.registro_conselho, feito.observacao], ['FEITO', 'enf1', 'Enf. Teste', 'COREN-TO 123', 'Sem queixas']);
    assert.equal(doc('checagens', id1).status, 'FEITO');
    assert.equal(auditoria.at(-1).acao, 'CHECAR_FEITO');
    // não se checa duas vezes (nem por outra pessoa)
    entrar('FUNC_ENFERMAGEM', 'enf2', 'Enf. Dois');
    assert.match(await erroDe(`registrarChecagem('${id1}', { resultado: 'FEITO' })`), /já foi registrada \(Administrado por Enf\. Teste\)/);
    assert.equal(doc('checagens', id1).feito_por, 'enf1');

    // não feito: motivo obrigatório
    const id2 = ids[1];
    assert.match(await erroDe(`registrarChecagem('${id2}', { resultado: 'NAO_FEITO' })`), /Escolha o motivo/);
    assert.equal(doc('checagens', id2).status, 'PENDENTE');
    const nf = JSON.parse(JSON.stringify(await call(`registrarChecagem('${id2}', { resultado: 'NAO_FEITO', motivo_tipo: 'RECUSA', motivo_texto: 'Paciente recusou a dose' })`)));
    assert.deepEqual([nf.status, nf.motivo_tipo, nf.motivo_texto], ['NAO_FEITO', 'RECUSA', 'Paciente recusou a dose']);
    assert.equal(auditoria.at(-1).acao, 'CHECAR_NAO_FEITO');

    // quem não é da enfermagem não checa
    entrar('MEDICO', 'med1', 'Dr. Teste');
    assert.match(await erroDe(`registrarChecagem('${id2}', { resultado: 'FEITO' })`), /Acesso negado/);
    entrar('FUNC_RECEPCAO', 'rec1', 'Recepção Teste');
    assert.match(await erroDe(`registrarChecagem('${id2}', { resultado: 'FEITO' })`), /Acesso negado/);
});

test('suspender horários pendentes: motivo obrigatório, só os pendentes e só quem prescreve ou é da enfermagem', async () => {
    const hs = [1, 2, 3].map(n => new Date(Date.now() + n * 3600000 * 5).toISOString());
    const i = Object.values(banco.store.internacoes)[0];
    const reg = Object.values(banco.store.registros_clinicos).find(r => r.tipo === 'PRESCRICAO' && r.internacao_id === i.id);
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enf. Teste');
    dados('__hs', hs.map(h => new Date(h).toISOString().slice(0, 16)));
    await call(`aprazarItem('${reg.id}', 0, __hs)`);
    call(`MOCK_DATA.CHECAGENS_PEND = ${JSON.stringify(Object.values(banco.store.checagens).filter(c => c.status === 'PENDENTE'))}`);
    assert.match(await erroDe(`suspenderChecagens('${reg.id}', 0, 'abc')`), /mínimo 5 letras/);
    entrar('FUNC_RECEPCAO', 'rec1', 'Recepção Teste');
    assert.match(await erroDe(`suspenderChecagens('${reg.id}', 0, 'Prescrição mudou')`), /Acesso negado/);
    entrar('MEDICO', 'med1', 'Dr. Teste');
    const antes = Object.values(banco.store.checagens).filter(c => c.status === 'PENDENTE').length;
    const n = await call(`suspenderChecagens('${reg.id}', 0, 'Prescrição mudou')`);
    assert.equal(n, antes);
    const suspensas = Object.values(banco.store.checagens).filter(c => c.status === 'SUSPENSO');
    assert.equal(suspensas.length, antes);
    assert.equal(suspensas[0].suspenso_por, 'med1');
    assert.equal(suspensas[0].motivo_suspensao, 'Prescrição mudou');
    assert.equal(Object.values(banco.store.checagens).filter(c => c.status === 'FEITO').length, 1);   // a já feita não muda
});

test('prescrição de cuidados e evolução de enfermagem: permissão, COREN obrigatório e complemento só em texto', async () => {
    const i = Object.values(banco.store.internacoes)[0];
    dados('__i', i);
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enf. Teste');
    const cuidados = "[{ cuidado: 'Mudança de decúbito', frequencia: 'a cada 2 h', observacao: '' }]";
    assert.match(await erroDe(`registrarClinico({ internacao: __i, paciente_id: 'pac_enf1', tipo: 'CUIDADO', itens: ${cuidados} })`), /registro no conselho/);
    assert.match(await erroDe("registrarClinico({ internacao: __i, paciente_id: 'pac_enf1', tipo: 'CUIDADO', itens: [], registro_conselho: 'COREN 1' })"), /ao menos um cuidado/);
    assert.match(await erroDe("registrarClinico({ internacao: __i, paciente_id: 'pac_enf1', tipo: 'CUIDADO', texto: 'texto solto aqui', registro_conselho: 'COREN 1' })"), /ao menos um cuidado/);
    const c = JSON.parse(JSON.stringify(await call(`registrarClinico({ internacao: __i, paciente_id: 'pac_enf1', tipo: 'CUIDADO', itens: ${cuidados}, registro_conselho: 'COREN-TO 123' })`)));
    assert.deepEqual([c.tipo, c.registro_conselho, c.internacao_id, c.itens.length, c.texto], ['CUIDADO', 'COREN-TO 123', i.id, 1, 'Mudança de decúbito · a cada 2 h']);
    // complemento do cuidado é só texto e também exige o registro no conselho
    assert.match(await erroDe(`registrarClinico({ paciente_id: 'pac_enf1', tipo: 'CUIDADO', texto: 'Trocar a cada 3 horas', complementa_id: '${c.id}' })`), /registro no conselho/);
    banco.store.registros_clinicos[c.id] = c;
    const comp = JSON.parse(JSON.stringify(await call(`registrarClinico({ paciente_id: 'pac_enf1', tipo: 'CUIDADO', texto: 'Trocar a cada 3 horas', complementa_id: '${c.id}', registro_conselho: 'COREN-TO 123' })`)));
    assert.equal(comp.complementa_id, c.id);

    const e = JSON.parse(JSON.stringify(await call("registrarClinico({ internacao: __i, paciente_id: 'pac_enf1', tipo: 'EVOLUCAO_ENFERMAGEM', texto: 'Paciente calmo, aceitou a dieta.', registro_conselho: 'COREN-TO 123' })")));
    assert.equal(e.tipo, 'EVOLUCAO_ENFERMAGEM');
    assert.match(await erroDe("registrarClinico({ internacao: __i, paciente_id: 'pac_enf1', tipo: 'INTERCORRENCIA', texto: 'Queda do leito sem lesão.' })"), /registro no conselho/);
    assert.equal(JSON.parse(JSON.stringify(await call("registrarClinico({ internacao: __i, paciente_id: 'pac_enf1', tipo: 'INTERCORRENCIA', texto: 'Queda do leito sem lesão.', registro_conselho: 'COREN-TO 123' })"))).tipo, 'INTERCORRENCIA');

    // o médico prescreve cuidados, mas não escreve evolução de enfermagem nem intercorrência
    entrar('MEDICO', 'med1', 'Dr. Teste');
    assert.equal(JSON.parse(JSON.stringify(await call(`registrarClinico({ internacao: __i, paciente_id: 'pac_enf1', tipo: 'CUIDADO', itens: ${cuidados}, registro_conselho: 'CRM 12345' })`))).tipo, 'CUIDADO');
    assert.match(await erroDe("registrarClinico({ internacao: __i, paciente_id: 'pac_enf1', tipo: 'EVOLUCAO_ENFERMAGEM', texto: 'Texto válido aqui', registro_conselho: 'CRM 1' })"), /Acesso negado/);
    entrar('FUNC_RECEPCAO', 'rec1', 'Recepção Teste');
    assert.match(await erroDe(`registrarClinico({ internacao: __i, paciente_id: 'pac_enf1', tipo: 'CUIDADO', itens: ${cuidados}, registro_conselho: 'X 123' })`), /Acesso negado/);
});

test('sinais vitais do internado: gravam com autor, exigem internação ativa e permissão', async () => {
    const i = Object.values(banco.store.internacoes)[0];
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enf. Teste');
    const s = JSON.parse(JSON.stringify(await call(`registrarSinaisInternado('${i.id}', { pa_sistolica: '130', pa_diastolica: '85', fc: '88', spo2: '97' })`)));
    assert.deepEqual([s.paciente_id, s.internacao_id, s.por, s.aferido, s.valores.fc], ['pac_enf1', i.id, 'enf1', true, 88]);
    assert.equal(doc('sinais_vitais', s.id).dia, call('todayISO()'));
    assert.equal(auditoria.at(-1).acao, 'REGISTRAR');
    assert.match(await erroDe(`registrarSinaisInternado('${i.id}', { fc: '9999' })`), /fora do limite/);
    assert.match(await erroDe("registrarSinaisInternado('nao_existe', { fc: '80' })"), /não tem internação ativa/);
    entrar('MEDICO', 'med1', 'Dr. Teste');
    assert.match(await erroDe(`registrarSinaisInternado('${i.id}', { fc: '80' })`), /Acesso negado/);
    assert.equal(call(`ultimoSinalDoPaciente('pac_enf1', [${JSON.stringify(s)}, { paciente_id: 'pac_enf1', medido_em: '2020-01-01T00:00:00.000Z' }]).id`), s.id);
});

test('passagem de plantão: registra, só outra pessoa dá ciência e só uma vez', async () => {
    const i = Object.values(banco.store.internacoes)[0];
    call(`MOCK_DATA.INTERNACOES = [${JSON.stringify(i)}]`);
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enf. Teste');
    const p = JSON.parse(JSON.stringify(await call(`registrarPassagem({ unidade: '${i.ala}', turno: 'Manhã', geral: 'Unidade tranquila', registro_conselho: 'COREN-TO 123', recados: { '${i.id}': 'Acompanhar a dieta' } })`)));
    assert.equal(p.pacientes.length, 1);
    assert.equal(doc('passagens_plantao', p.id).pacientes[0].recado, 'Acompanhar a dieta');
    assert.equal(auditoria.at(-1).acao, 'PASSAR');
    // quem passou não dá a ciência; outra pessoa dá; ninguém dá de novo
    assert.match(await erroDe(`receberPassagem('${p.id}')`), /não pode dar a ciência/);
    assert.equal(doc('passagens_plantao', p.id).recebido_por, '');
    entrar('FUNC_ENFERMAGEM', 'enf2', 'Enf. Dois');
    const r = JSON.parse(JSON.stringify(await call(`receberPassagem('${p.id}')`)));
    assert.deepEqual([r.recebido_por, r.recebido_por_nome], ['enf2', 'Enf. Dois']);
    entrar('FUNC_ENFERMAGEM', 'enf3', 'Enf. Três');
    assert.match(await erroDe(`receberPassagem('${p.id}')`), /já foi recebida por Enf\. Dois/);
    assert.equal(doc('passagens_plantao', p.id).recebido_por, 'enf2');
    // permissão: o médico vê, mas não registra
    entrar('MEDICO', 'med1', 'Dr. Teste');
    assert.match(await erroDe(`registrarPassagem({ unidade: '${i.ala}', turno: 'Manhã', registro_conselho: 'CRM 1' })`), /Acesso negado/);
});

test('alta: as checagens pendentes da internação são suspensas e as já registradas ficam como estão', async () => {
    const i = Object.values(banco.store.internacoes)[0];
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enf. Teste');
    // a internação da alta não pode estar na lista local: recria pendentes direto no banco
    guardar('checagens', { id: 'chk_pend_1', tipo: 'MEDICAMENTO', status: 'PENDENTE', internacao_id: i.id, paciente_id: i.paciente_id, previsto_em: new Date(Date.now() + 3600000).toISOString(), dia: call('todayISO()') });
    guardar('checagens', { id: 'chk_outra_1', tipo: 'MEDICAMENTO', status: 'PENDENTE', internacao_id: 'outra_internacao', paciente_id: 'outro', previsto_em: new Date(Date.now() + 3600000).toISOString(), dia: call('todayISO()') });
    const feitasAntes = Object.values(banco.store.checagens).filter(c => c.status === 'FEITO').map(c => c.id);
    call(`MOCK_DATA.INTERNACOES = [${JSON.stringify(i)}]`);
    await call(`darAltaInternacao('${i.id}', { tipo_alta: 'MELHORADA' })`);
    assert.equal(doc('internacoes', i.id).status, 'ALTA');
    assert.equal(doc('checagens', 'chk_pend_1').status, 'SUSPENSO');
    assert.equal(doc('checagens', 'chk_pend_1').motivo_suspensao, 'Alta do paciente');
    assert.equal(doc('checagens', 'chk_outra_1').status, 'PENDENTE');   // de outro paciente: intacta
    feitasAntes.forEach(id => assert.equal(doc('checagens', id).status, 'FEITO'));
    // depois da alta já não dá para checar o que sobrou pendente
    guardar('checagens', { id: 'chk_pend_2', tipo: 'MEDICAMENTO', status: 'PENDENTE', internacao_id: i.id, paciente_id: i.paciente_id, previsto_em: new Date().toISOString(), dia: call('todayISO()') });
    assert.match(await erroDe("registrarChecagem('chk_pend_2', { resultado: 'FEITO' })"), /internação deste paciente não está mais ativa/);
    assert.equal(doc('checagens', 'chk_pend_2').status, 'PENDENTE');
});

test('alergias do paciente para o alerta: texto de todas as alergias (e complementos), vazio sem registro', async () => {
    guardar('registros_clinicos', { id: 'al1', tipo: 'ALERGIA', paciente_id: 'pac_al', texto: 'Agente: Dipirona · Reação: urticária · Gravidade: Grave', em: '2026-06-01T10:00:00.000Z' });
    guardar('registros_clinicos', { id: 'al2', tipo: 'ALERGIA', paciente_id: 'pac_al', texto: 'Agente: Látex · Gravidade: Não informada', em: '2026-06-02T10:00:00.000Z' });
    guardar('registros_clinicos', { id: 'ev1', tipo: 'EVOLUCAO', paciente_id: 'pac_al', texto: 'Evolução comum', em: '2026-06-03T10:00:00.000Z' });
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enf. Teste');
    assert.equal(await call("alergiasDoPaciente('pac_al')"), 'Látex · Gravidade: Não informada | Dipirona · Reação: urticária · Gravidade: Grave');
    assert.equal(await call("alergiasDoPaciente('pac_sem_alergia')"), '');
    entrar('FUNC_RECEPCAO', 'rec1', 'Recepção Teste');
    assert.match(await erroDe("alergiasDoPaciente('pac_al')"), /Acesso negado/);
});

test('permissões da enfermagem: a enfermagem registra, o médico só vê e prescreve cuidados, os demais perfis não entram', () => {
    const pode = (role, acao) => { entrar(role); return call(`hasPermission('${acao}')`); };
    assert.deepEqual(['enfermagem_ver', 'enfermagem_registrar', 'prescrever_cuidados'].map(a => pode('FUNC_ENFERMAGEM', a)), [true, true, true]);
    assert.deepEqual(['enfermagem_ver', 'enfermagem_registrar', 'prescrever_cuidados'].map(a => pode('MEDICO', a)), [true, false, true]);
    ['FUNC_RECEPCAO', 'FUNC_EMERGENCIA', 'FUNC_PORTARIA', 'FUNC_IMAGENOLOGIA', 'AUTORIZADOR', 'FUNC_HIGIENIZACAO', 'CHEFE_OPME'].forEach(role =>
        assert.deepEqual(['enfermagem_ver', 'enfermagem_registrar', 'prescrever_cuidados'].map(a => pode(role, a)), [false, false, false], role));
    assert.deepEqual(['enfermagem_ver', 'enfermagem_registrar', 'prescrever_cuidados'].map(a => pode('ADMIN', a)), [true, true, true]);
});
