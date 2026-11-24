// Testes da Etapa 8: UTI (balanço hídrico e dispositivos) e Nutrição (dieta e mapa de dietas). Executa com: npm test
// Só dados fictícios. O banco é um Firestore simulado em memória (nunca o real).
const test = require('node:test');
const assert = require('node:assert/strict');
const { criarAmbiente, semearBasico } = require('./helpers/clinico');

const amb = criarAmbiente();
const { ctx, call, j, dados, entrar, erroDe, doc, hoje, banco, auditoria } = amb;
semearBasico(amb);

// "Agora" fixo (10/06/2026, 12:00 locais) para as regras puras.
dados('__agora', new Date(2026, 5, 10, 12, 0, 0).toISOString());
const em = (h, min = 0, d = 10) => new Date(2026, 5, d, h, min).toISOString();

// ============ UTI: regras puras ============

test('leito de UTI: pelo tipo do leito ou pelo nome da ala; outras alas e nomes parecidos não contam', () => {
    const uti = (l) => { dados('__l', l); return call('ehLeitoUti(__l)'); };
    assert.equal(uti({ tipo_leito: 'UTI' }), true);
    assert.equal(uti({ ala: 'UTI Adulto' }), true);
    assert.equal(uti({ ala: 'Unidade de Terapia - UTI-2' }), true);
    assert.equal(uti({ tipo_leito: 'ENFERMARIA', ala: 'Ala A/B' }), false);
    assert.equal(uti({ ala: 'Utilidades' }), false);
    assert.equal(uti(null), false);
});

test('lançamento do balanço: ganho ou perda, via da lista, volume inteiro em mL e horário coerente', () => {
    const val = (f) => { dados('__f', f); try { return j('validarLancamentoBalanco(__f, new Date(__agora))'); } catch (e) { return e.message; } };
    const ok = { tipo: 'GANHO', via: 'EV_SOLUCAO', volume_ml: '500' };
    const v = val({ ...ok, observacao: ' SF 0,9% ' });
    assert.deepEqual([v.tipo, v.via, v.via_rotulo, v.volume_ml, v.observacao], ['GANHO', 'EV_SOLUCAO', 'Soluções endovenosas', 500, 'SF 0,9%']);
    assert.equal(new Date(v.em).toISOString(), em(12));   // sem horário informado vale "agora"
    assert.match(val({ ...ok, tipo: '' }), /ganho ou perda/);
    assert.match(val({ ...ok, via: 'DIURESE' }), /Escolha a via/);   // diurese é perda, não ganho
    assert.equal(val({ tipo: 'PERDA', via: 'DIURESE', volume_ml: 300 }).via_rotulo, 'Diurese');
    assert.match(val({ ...ok, volume_ml: '' }), /inteiro de 1 a 9999/);
    assert.match(val({ ...ok, volume_ml: '0' }), /inteiro de 1 a 9999/);
    assert.match(val({ ...ok, volume_ml: '10000' }), /inteiro de 1 a 9999/);
    assert.match(val({ ...ok, volume_ml: '100,5' }), /inteiro de 1 a 9999/);
    assert.match(val({ ...ok, volume_ml: 'abc' }), /inteiro de 1 a 9999/);
    assert.match(val({ ...ok, em: em(13) }), /não pode estar no futuro/);
    assert.equal(val({ ...ok, em: em(12, 3) }).volume_ml, 500);   // até 5 minutos de tolerância do relógio
    assert.match(val({ ...ok, em: em(11, 0, 8) }), /anterior a 48 h/);
    assert.match(val({ ...ok, em: 'ontem' }), /Horário do lançamento inválido/);
    assert.match(val({ ...ok, observacao: 'x'.repeat(201) }), /no máximo 200/);
});

test('balanço: soma só o que vale (sem anulados) dentro da janela; saldo é ganhos menos perdas, sem interpretação', () => {
    dados('__l', [
        { id: 'g1', tipo: 'GANHO', via: 'ORAL', via_rotulo: 'Via oral', volume_ml: 200, em: em(7) },
        { id: 'g2', tipo: 'GANHO', via: 'EV_SOLUCAO', via_rotulo: 'Soluções endovenosas', volume_ml: 500, em: em(10) },
        { id: 'g3', tipo: 'GANHO', via: 'ORAL', via_rotulo: 'Via oral', volume_ml: 100, em: em(11) },
        { id: 'p1', tipo: 'PERDA', via: 'DIURESE', via_rotulo: 'Diurese', volume_ml: 300, em: em(9) },
        { id: 'p2', tipo: 'PERDA', via: 'DRENO', via_rotulo: 'Dreno', volume_ml: 50, em: em(11, 30) },
        { id: 'a1', tipo: 'ANULACAO', anula_id: 'g3', em: em(11, 40) },
        { id: 'ant', tipo: 'GANHO', via: 'ORAL', via_rotulo: 'Via oral', volume_ml: 999, em: em(14, 0, 9) }   // ontem 22 h antes: dentro de 24 h, fora de 6 h e do dia de hoje
    ]);
    assert.deepEqual(j('lancamentosValidos(__l).map(l => l.id)'), ['g1', 'g2', 'p1', 'p2', 'ant']);
    const b6 = j("calcularBalanco(__l, '6H', new Date(__agora))");   // 6 h às 12 h: de 6 h às 12 h
    assert.deepEqual([b6.ganhos, b6.perdas, b6.saldo, b6.lancamentos], [700, 350, 350, 4]);
    assert.deepEqual(b6.por_via, { 'Via oral': 200, 'Soluções endovenosas': 500, Diurese: 300, Dreno: 50 });
    const b24 = j("calcularBalanco(__l, '24H', new Date(__agora))");
    assert.equal(b24.ganhos, 700 + 999);
    const dd = j("calcularBalanco(__l, 'DIA', new Date(__agora))");   // dia de hoje: não entra o de ontem
    assert.equal(dd.ganhos, 700);
    assert.throws(() => call("calcularBalanco(__l, '3H', new Date(__agora))"), /Janela do balanço desconhecida/);
    assert.deepEqual(j('calcularBalanco([], "6H", new Date(__agora))'), { ganhos: 0, perdas: 0, saldo: 0, lancamentos: 0, por_via: {} });
    dados('__so_perdas', [{ id: 'p', tipo: 'PERDA', via: 'DIURESE', via_rotulo: 'Diurese', volume_ml: 400, em: em(10) }]);
    assert.equal(call("calcularBalanco(__so_perdas, '6H', new Date(__agora)).saldo"), -400);   // saldo negativo é só a conta
});

test('dispositivo: tipo da lista, local, inserção sem futuro e no máximo 1 ano; dias de uso pelo calendário', () => {
    const val = (f) => { dados('__f', f); try { return j('validarDispositivo(__f, new Date(__agora))'); } catch (e) { return e.message; } };
    const ok = { tipo: 'CVC', local: ' Veia jugular direita ' };
    const d = val({ ...ok, inserido_por: 'Dr. Teste' });
    assert.deepEqual([d.tipo, d.tipo_rotulo, d.local, d.inserido_por, new Date(d.inserido_em).toISOString()], ['CVC', 'Acesso venoso central', 'Veia jugular direita', 'Dr. Teste', em(12)]);
    assert.match(val({ ...ok, tipo: 'ABC' }), /tipo de dispositivo/);
    assert.match(val({ ...ok, local: 'a' }), /Informe o local/);
    assert.match(val({ ...ok, local: 'x'.repeat(81) }), /no máximo 80/);
    assert.match(val({ ...ok, inserido_em: em(14) }), /não pode estar no futuro/);
    assert.match(val({ ...ok, inserido_em: new Date(2025, 0, 1).toISOString() }), /anterior a 1 ano/);
    assert.match(val({ ...ok, inserido_em: 'x' }), /inválidas/);
    // o dia da inserção é o 1º dia; dois dias depois é o 3º; retirado conta até a retirada
    dados('__d', { status: 'EM_USO', inserido_em: em(23, 30, 8) });
    assert.equal(call('diasDeUso(__d, new Date(__agora))'), 3);
    dados('__d2', { status: 'RETIRADO', inserido_em: em(8, 0, 8), retirado_em: em(9, 0, 9) });
    assert.equal(call('diasDeUso(__d2, new Date(__agora))'), 2);
    dados('__d3', { status: 'EM_USO', inserido_em: em(11) });
    assert.equal(call('diasDeUso(__d3, new Date(__agora))'), 1);
    const ret = (f, d0 = { inserido_em: em(8) }) => { dados('__f', f); dados('__d', d0); try { return j('validarRetiradaDispositivo(__f, __d, new Date(__agora))'); } catch (e) { return e.message; } };
    assert.match(ret({ motivo: 'fim' }), /mínimo 5 letras/);
    assert.match(ret({ motivo: 'Fim do tratamento', retirado_em: em(7) }), /anterior à inserção/);
    assert.match(ret({ motivo: 'Fim do tratamento', retirado_em: em(14) }), /não pode estar no futuro/);
    assert.equal(ret({ motivo: 'Fim do tratamento' }).motivo, 'Fim do tratamento');
});

// ============ UTI: gravação ============

test('permissões da UTI: enfermagem registra, médico só consulta, outros perfis não veem', () => {
    const pode = (role, acao) => { entrar(role); return call(`hasPermission('${acao}')`); };
    assert.equal(pode('FUNC_ENFERMAGEM', 'uti_registrar'), true);
    assert.equal(pode('MEDICO', 'uti_ver'), true);
    assert.equal(pode('MEDICO', 'uti_registrar'), false);
    assert.equal(pode('FUNC_PORTARIA', 'uti_ver'), false);
    assert.equal(pode('FUNC_NUTRICAO', 'uti_ver'), false);
});

test('lançar no balanço: só enfermagem, só internação ativa; guarda quem lançou e audita', async () => {
    dados('__f', { tipo: 'GANHO', via: 'EV_SOLUCAO', volume_ml: '500', observacao: 'SF 0,9%' });
    entrar('MEDICO', 'med1', 'Dr. Teste');
    assert.match(await erroDe("lancarBalanco('int1', __f)"), /Acesso negado/);
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enfermeira');
    assert.match(await erroDe("lancarBalanco('int2', __f)"), /não está mais ativa/);   // internação encerrada
    assert.match(await erroDe("lancarBalanco('nao_existe', __f)"), /não está mais ativa/);
    dados('__ruim', { tipo: 'GANHO', via: 'EV_SOLUCAO', volume_ml: '0' });
    assert.match(await erroDe("lancarBalanco('int1', __ruim)"), /inteiro de 1 a 9999/);
    assert.equal(Object.keys(banco.store.balanco_hidrico || {}).length, 0, 'recusas não gravam nada');
    const l = await call("lancarBalanco('int1', __f)");
    const salvo = doc('balanco_hidrico', l.id);
    assert.deepEqual([salvo.internacao_id, salvo.paciente_nome, salvo.leito_id, salvo.tipo, salvo.volume_ml, salvo.por, salvo.dia], ['int1', 'Maria de Teste', 'l1', 'GANHO', 500, 'enf1', hoje]);
    assert.ok(auditoria.some(a => a.entidade === 'balanco_hidrico' && a.acao === 'LANCAR'));
    dados('__p', { tipo: 'PERDA', via: 'DIURESE', volume_ml: '300' });
    await call("lancarBalanco('int1', __p)");
    const lista = await call("db_getBalancoInternacao('int1')");
    assert.equal(lista.length, 2);
});

test('anular um lançamento: motivo obrigatório, o original não muda, a anulação é um registro novo e só vale uma vez', async () => {
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enfermeira');
    const orig = Object.values(banco.store.balanco_hidrico).find(l => l.tipo === 'GANHO');
    dados('__id', orig.id);
    const antes = JSON.stringify(doc('balanco_hidrico', orig.id));
    assert.match(await erroDe("anularLancamentoBalanco(__id, 'erro')"), /mínimo 5 letras/);
    entrar('MEDICO', 'med1', 'Dr. Teste');
    assert.match(await erroDe("anularLancamentoBalanco(__id, 'Lançado no paciente errado')"), /Acesso negado/);
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enfermeira');
    await call("anularLancamentoBalanco(__id, 'Lançado no paciente errado')");
    assert.equal(JSON.stringify(doc('balanco_hidrico', orig.id)), antes, 'o lançamento original continua intacto');
    const anul = doc('balanco_hidrico', `anul_${orig.id}`);
    assert.deepEqual([anul.tipo, anul.anula_id, anul.motivo, anul.internacao_id], ['ANULACAO', orig.id, 'Lançado no paciente errado', 'int1']);
    assert.match(await erroDe("anularLancamentoBalanco(__id, 'Tentando anular de novo')"), /já foi anulado/);
    dados('__aid', `anul_${orig.id}`);
    assert.match(await erroDe("anularLancamentoBalanco(__aid, 'Anular a anulação')"), /já é uma anulação/);
    assert.match(await erroDe("anularLancamentoBalanco('nao_existe', 'Não existe esse')"), /não encontrado/);
    const lista = await call("db_getBalancoInternacao('int1')");
    dados('__lista', JSON.parse(JSON.stringify(lista)));
    const b = j("calcularBalanco(__lista, '24H', new Date())");
    assert.equal(b.ganhos, 0);   // o ganho anulado saiu da soma
    assert.equal(b.perdas, 300);
});

test('dispositivo: inserir, retirar com motivo e não retirar duas vezes; o histórico fica', async () => {
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enfermeira');
    dados('__f', { tipo: 'CVC', local: 'Veia jugular direita', inserido_por: 'Dr. Cateter' });
    assert.match(await erroDe("registrarDispositivo('int2', __f)"), /não está mais ativa/);
    const d = await call("registrarDispositivo('int1', __f)");
    assert.deepEqual([doc('dispositivos', d.id).status, doc('dispositivos', d.id).inserido_por, doc('dispositivos', d.id).retirado_em], ['EM_USO', 'Dr. Cateter', '']);
    dados('__d', d.id);
    assert.match(await erroDe("retirarDispositivo(__d, { motivo: 'x' })"), /mínimo 5 letras/);
    entrar('MEDICO', 'med1', 'Dr. Teste');
    assert.match(await erroDe("retirarDispositivo(__d, { motivo: 'Fim do tratamento' })"), /Acesso negado/);
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enfermeira');
    await call("retirarDispositivo(__d, { motivo: 'Fim do tratamento' })");
    const r = doc('dispositivos', d.id);
    assert.deepEqual([r.status, r.retirada_motivo, r.retirado_por, r.tipo, r.local], ['RETIRADO', 'Fim do tratamento', 'enf1', 'CVC', 'Veia jugular direita']);
    assert.match(await erroDe("retirarDispositivo(__d, { motivo: 'Retirar outra vez' })"), /já foi retirado/);
    assert.equal((await call("db_getDispositivosInternacao('int1')")).length, 1);
});

// ============ Nutrição: regras puras ============

test('dieta: tipo, via compatível com o tipo, descrição obrigatória só em "Outra" e data final sem passado', () => {
    const val = (f, h = '2026-06-10') => { dados('__f', f); try { return j(`validarDieta(__f, '${h}')`); } catch (e) { return e.message; } };
    const ok = { tipo: 'BRANDA', via: 'ORAL' };
    assert.deepEqual(val({ ...ok, descricao: ' sem leite ', restricoes: 'Alergia a amendoim' }), { tipo: 'BRANDA', tipo_rotulo: 'Branda', via: 'ORAL', descricao: 'sem leite', restricoes: 'Alergia a amendoim', observacao: '', ate: '' });
    assert.match(val({ via: 'ORAL' }), /Escolha o tipo de dieta/);
    assert.match(val({ tipo: 'ENTERAL', via: 'ORAL' }), /Via inválida para a dieta enteral \(por sonda\): enteral \(sonda\)/);
    assert.equal(val({ tipo: 'ENTERAL', via: 'ENTERAL' }).via, 'ENTERAL');
    assert.equal(val({ tipo: 'BRANDA', via: 'ENTERAL' }).via, 'ENTERAL');   // dieta branda por sonda é possível
    assert.match(val({ tipo: 'PARENTERAL', via: 'ORAL' }), /Via inválida/);
    assert.match(val({ tipo: 'ZERO', via: 'ORAL' }), /Via inválida/);
    assert.equal(val({ tipo: 'ZERO', via: 'NENHUMA' }).tipo, 'ZERO');
    assert.match(val({ tipo: 'OUTRA', via: 'ORAL', descricao: 'ab' }), /Descreva a dieta/);
    assert.equal(val({ tipo: 'OUTRA', via: 'ORAL', descricao: 'Dieta sem glúten' }).tipo, 'OUTRA');
    assert.match(val({ ...ok, ate: '2026-02-30' }), /Data final da dieta inválida/);
    assert.match(val({ ...ok, ate: '2026-06-09' }), /anterior a hoje/);
    assert.equal(val({ ...ok, ate: '2026-06-10' }).ate, '2026-06-10');
    assert.match(val({ ...ok, descricao: 'x'.repeat(201) }), /no máximo 200/);
    assert.match(val({ ...ok, restricoes: 'x'.repeat(201) }), /no máximo 200/);
    assert.match(val({ ...ok, observacao: 'x'.repeat(301) }), /no máximo 300/);
});

test('dieta vigente: ativa e dentro da data final', () => {
    const v = (d, h = '2026-06-10') => { dados('__d', d); return call(`dietaVigente(__d, '${h}')`); };
    assert.equal(v({ status: 'ATIVA' }), true);
    assert.equal(v({ status: 'ATIVA', ate: '2026-06-10' }), true);
    assert.equal(v({ status: 'ATIVA', ate: '2026-06-09' }), false);
    assert.equal(v({ status: 'SUSPENSA' }), false);
    assert.equal(v({ status: 'SUBSTITUIDA' }), false);
    assert.equal(v(null), false);
});

test('mapa de dietas: um internado por linha, quem está sem dieta aparece, ordem por unidade e leito, alta fica de fora', () => {
    ctx.__leito = (id) => ({ l1: { rotulo: '10', ala: 'Ala B' }, l2: { rotulo: '2', ala: 'Ala A' }, l3: { rotulo: '10', ala: 'Ala A' }, l4: { rotulo: '1', ala: 'UTI' } }[id]);
    dados('__i', [
        { id: 'i1', paciente_id: 'p1', paciente_nome: 'Maria', leito_id: 'l1', status: 'ATIVA' },
        { id: 'i2', paciente_id: 'p2', paciente_nome: 'João', leito_id: 'l2', status: 'ATIVA' },
        { id: 'i3', paciente_id: 'p3', paciente_nome: 'Ana', leito_id: 'l3', status: 'ATIVA' },
        { id: 'i4', paciente_id: 'p4', paciente_nome: 'Caio', leito_id: 'l4', status: 'ATIVA' },
        { id: 'i5', paciente_id: 'p5', paciente_nome: 'Davi', leito_id: 'l1', status: 'ALTA' }
    ]);
    dados('__d', [
        { id: 'd1', internacao_id: 'i1', status: 'ATIVA', tipo: 'BRANDA', tipo_rotulo: 'Branda', criado_em: '2026-06-09T10:00:00Z' },
        { id: 'd2', internacao_id: 'i2', status: 'ATIVA', tipo: 'ZERO', tipo_rotulo: 'Dieta zero (jejum)', criado_em: '2026-06-09T10:00:00Z' },
        { id: 'd3', internacao_id: 'i4', status: 'ATIVA', tipo: 'BRANDA', tipo_rotulo: 'Branda', ate: '2026-06-09', criado_em: '2026-06-08T10:00:00Z' },   // venceu
        { id: 'd4', internacao_id: 'i3', status: 'SUSPENSA', tipo: 'LIVRE', criado_em: '2026-06-08T10:00:00Z' },
        { id: 'd5', internacao_id: 'i5', status: 'ATIVA', tipo: 'LIVRE', criado_em: '2026-06-08T10:00:00Z' }
    ]);
    const m = j("montarMapaDietas(__i, __d, __leito, '2026-06-10')");
    assert.deepEqual(m.map(l => [l.unidade, l.leito, l.paciente_nome, l.sem_dieta]), [['Ala A', '2', 'João', false], ['Ala A', '10', 'Ana', true], ['Ala B', '10', 'Maria', false], ['UTI', '1', 'Caio', true]]);
    assert.equal(m[0].dieta.tipo, 'ZERO');
    dados('__m', m);
    assert.deepEqual(j('resumoMapaDietas(__m)'), { internados: 4, sem_dieta: 2, por_tipo: { 'Dieta zero (jejum)': 1, 'Sem dieta prescrita': 2, Branda: 1 } });
    // sem o cadastro do leito, usa a ala e o leito da própria internação
    ctx.__leito2 = () => undefined;
    dados('__i2', [{ id: 'i9', paciente_id: 'p9', paciente_nome: 'Eva', leito_id: 'l9', ala: 'Ala C', status: 'ATIVA' }]);
    assert.deepEqual(j("montarMapaDietas(__i2, [], __leito2, '2026-06-10').map(l => [l.unidade, l.leito])"), [['Ala C', 'l9']]);
});

test('permissões da nutrição: médico e nutrição prescrevem, enfermagem só consulta, só a nutrição gerencia', () => {
    const pode = (role, acao) => { entrar(role); return call(`hasPermission('${acao}')`); };
    assert.equal(pode('MEDICO', 'dieta_prescrever'), true);
    assert.equal(pode('MEDICO', 'dieta_gerenciar'), false);
    assert.equal(pode('FUNC_NUTRICAO', 'dieta_gerenciar'), true);
    assert.equal(pode('FUNC_ENFERMAGEM', 'dieta_ver'), true);
    assert.equal(pode('FUNC_ENFERMAGEM', 'dieta_prescrever'), false);
    assert.equal(pode('FUNC_PORTARIA', 'dieta_ver'), false);
});

// ============ Nutrição: gravação ============

test('prescrever dieta: uma só ativa por internação; a anterior vira "Substituída" e nada é apagado', async () => {
    dados('__f', { tipo: 'BRANDA', via: 'ORAL', descricao: 'sem leite' });
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enfermeira');
    assert.match(await erroDe("prescreverDieta('int1', __f)"), /Acesso negado/);
    entrar('MEDICO', 'med1', 'Dr. Teste');
    assert.match(await erroDe("prescreverDieta('int2', __f)"), /não está mais ativa/);
    dados('__ruim', { tipo: 'ENTERAL', via: 'ORAL' });
    assert.match(await erroDe("prescreverDieta('int1', __ruim)"), /Via inválida/);
    assert.equal(Object.keys(banco.store.dietas || {}).length, 0);
    const d1 = await call("prescreverDieta('int1', __f)");
    assert.deepEqual([doc('dietas', d1.id).status, doc('dietas', d1.id).prescrito_por, doc('dietas', d1.id).substitui_id], ['ATIVA', 'med1', '']);
    assert.equal(doc('dieta_ativa', 'int1').dieta_id, d1.id);
    entrar('FUNC_NUTRICAO', 'nut1', 'Nutricionista');
    dados('__g', { tipo: 'DIABETICA', via: 'ORAL', restricoes: 'Sem açúcar' });
    const d2 = await call("prescreverDieta('int1', __g)");
    assert.equal(doc('dietas', d1.id).status, 'SUBSTITUIDA');
    assert.deepEqual([doc('dietas', d1.id).substituida_por, doc('dietas', d1.id).tipo], [d2.id, 'BRANDA']);
    assert.deepEqual([doc('dietas', d2.id).status, doc('dietas', d2.id).substitui_id], ['ATIVA', d1.id]);
    assert.equal(doc('dieta_ativa', 'int1').dieta_id, d2.id);
    assert.equal(Object.values(banco.store.dietas).filter(d => d.status === 'ATIVA').length, 1);
    assert.equal((await call("db_getDietasInternacao('int1')")).length, 2);
});

test('suspender dieta: motivo obrigatório; só quem prescreveu ou a nutrição suspende; o ponteiro é limpo', async () => {
    const ativa = Object.values(banco.store.dietas).find(d => d.status === 'ATIVA');   // prescrita por nut1
    dados('__id', ativa.id);
    entrar('MEDICO', 'med1', 'Dr. Teste');
    assert.match(await erroDe("suspenderDieta(__id, 'Paciente em jejum para exame')"), /Só quem prescreveu a dieta ou a Nutrição/);
    entrar('FUNC_NUTRICAO', 'nut1', 'Nutricionista');
    assert.match(await erroDe("suspenderDieta(__id, 'x')"), /mínimo 5 letras/);
    await call("suspenderDieta(__id, 'Paciente em jejum para exame')");
    const s = doc('dietas', ativa.id);
    assert.deepEqual([s.status, s.motivo_suspensao, s.suspensa_por], ['SUSPENSA', 'Paciente em jejum para exame', 'nut1']);
    assert.equal(doc('dieta_ativa', 'int1').dieta_id, '');
    assert.match(await erroDe("suspenderDieta(__id, 'Suspender outra vez')"), /"Suspensa"/);
    // depois da suspensão uma nova prescrição não tenta substituir a suspensa
    entrar('MEDICO', 'med1', 'Dr. Teste');
    dados('__f', { tipo: 'LIQUIDA', via: 'ORAL' });
    const nova = await call("prescreverDieta('int1', __f)");
    assert.equal(doc('dietas', nova.id).substitui_id, '');
    assert.equal(doc('dietas', ativa.id).status, 'SUSPENSA');
    // quem prescreveu suspende a própria dieta
    dados('__nid', nova.id);
    await call("suspenderDieta(__nid, 'Prescrição feita por engano')");
    assert.equal(doc('dietas', nova.id).status, 'SUSPENSA');
    assert.ok(auditoria.some(a => a.entidade === 'dieta' && a.acao === 'SUSPENDER'));
});
