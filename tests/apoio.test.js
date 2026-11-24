// Testes da Etapa 9: regras comuns do apoio, manutenção (OS e planos de preventiva e calibração) e transporte. Executa com: npm test
// Só dados fictícios. O banco é um Firestore simulado em memória (nunca o real).
const test = require('node:test');
const assert = require('node:assert/strict');
const { criarAmbiente, semearBasico } = require('./helpers/clinico');

const amb = criarAmbiente();
const { call, dados, entrar, erroDe, doc, hoje, dia, banco, auditoria, guardar } = amb;
semearBasico(amb);
amb.cad.equipamento = [
    { id: 'eq1', codigo: 'EQP000001', nome: 'MONITOR MULTIPARAMÉTRICO', patrimonio: 'P-100', ativo: true, situacao_op: 'Operacional' },
    { id: 'eq2', codigo: 'EQP000002', nome: 'BOMBA DE INFUSÃO ANTIGA', patrimonio: 'P-200', ativo: false, situacao_op: 'Fora de uso' },
    { id: 'eq3', codigo: 'EQP000003', nome: 'AUTOCLAVE', patrimonio: 'P-300', ativo: true, situacao_op: 'Em manutenção' }
];
dados('__eq', amb.cad.equipamento);
dados('__agora', new Date(2026, 5, 10, 12, 0, 0).toISOString());

const aj = async (codigo) => JSON.parse(JSON.stringify(await call(codigo)));   // resultado do contexto isolado vira objeto comum
const val = (codigo) => { try { return JSON.parse(JSON.stringify(call(codigo))); } catch (e) { return e.message; } };

// ============ Regras comuns ============

test('texto, inteiro, decimal e datas: limites e mensagens com o nome do campo', () => {
    assert.equal(call("apoioTexto('  ola  ', 'Campo')"), 'ola');
    assert.equal(val("apoioTexto('', 'Setor', { min: 2 })"), 'Setor: informe.');
    assert.match(val("apoioTexto('a', 'Setor', { min: 2 })"), /Setor: mínimo de 2/);
    assert.match(val("apoioTexto('x'.repeat(11), 'Setor', { max: 10 })"), /no máximo 10/);
    assert.equal(call("apoioInteiro('12', 'Qtd', 1, 20)"), 12);
    ['', '0', '21', '1,5', 'abc', '2.5'].forEach(v => assert.match(val(`apoioInteiro('${v}', 'Qtd', 1, 20)`), /Qtd: número inteiro de 1 a 20/, v));
    assert.equal(call("apoioDecimal('1,5', 'Peso', 0.01, 100)"), 1.5);
    assert.equal(call("apoioDecimal('', 'Peso', 0.01, 100, { opcional: true })"), null);
    assert.match(val("apoioDecimal('', 'Peso', 0.01, 100)"), /Peso: informe/);
    assert.match(val("apoioDecimal('1,555', 'Peso', 0.01, 100)"), /no máximo 2 casa/);
    assert.match(val("apoioDecimal('0', 'Peso', 0.01, 100)"), /número de 0.01 a 100/);
    assert.match(val("apoioDecimal('-3', 'Peso', 0.01, 100)"), /número de 0.01 a 100/);
    assert.match(val("apoioDecimal('1e3', 'Peso', 0.01, 5000)"), /número de/);
    // data e hora: vazio = agora; futuro e muito antigo são recusados; 5 min de tolerância
    const hora = (h, min = 0, d = 10) => new Date(2026, 5, d, h, min).toISOString();
    assert.equal(call("apoioDataHora('', 'Hora', { agora: new Date(__agora) })"), hora(12));
    assert.match(val(`apoioDataHora('${hora(13)}', 'Hora', { agora: new Date(__agora) })`), /Hora: não pode estar no futuro/);
    assert.equal(call(`apoioDataHora('${hora(12, 4)}', 'Hora', { agora: new Date(__agora) })`), hora(12, 4));
    assert.match(val(`apoioDataHora('${hora(11, 0, 7)}', 'Hora', { agora: new Date(__agora), maxAntesHoras: 48 })`), /anterior ao limite/);
    assert.match(val("apoioDataHora('ontem', 'Hora')"), /data e hora inválidas/);
    assert.equal(call("apoioData('2026-06-10', 'Data')"), '2026-06-10');
    assert.match(val("apoioData('10/06/2026', 'Data')"), /Data: data inválida/);
    assert.match(val("apoioData('2026-02-30x', 'Data')"), /data inválida/);
    assert.match(val("apoioData('2027-01-01', 'Data', { futuro: false, agora: new Date(__agora) })"), /não pode estar no futuro/);
    assert.equal(call("apoioSomarDias('2026-06-10', 90)"), '2026-09-08');
    assert.equal(call("apoioSomarDias('2026-12-20', 15)"), '2027-01-04');
    assert.equal(call("apoioDiasEntre('2026-06-10', '2026-06-20')"), 10);
    assert.equal(call("apoioDiasEntre('2026-06-10', '2026-06-01')"), -9);
    assert.match(val("apoioEscolha('X', { A: 'a' }, 'Tipo')"), /Tipo: escolha uma opção/);
    assert.equal(call("apoioEscolha('A', { A: 'a' }, 'Tipo')"), 'A');
    assert.equal(call("apoioProtocolo('OS', 7)"), 'OS00007');
    assert.match(val("apoioPodeIr({ A: ['B'] }, 'A', 'A', { A: 'Aberta' })"), /já foi registrado \(situação atual: Aberta\)/);
    assert.match(val("apoioPodeIr({ A: ['B'] }, 'B', 'A', { A: 'Aberta', B: 'Fechada' })"), /de "Fechada" para "Aberta"/);
});

// ============ Manutenção: validação ============

test('chamado: tipo, prioridade, descrição, equipamento ativo do cadastro; infraestrutura pede o local', () => {
    const v = (f, extra = {}) => { dados('__f', f); dados('__x', extra); return val('validarChamadoOs(__f, Object.assign({ equipamentos: __eq }, __x))'); };
    const base = { tipo: 'CORRETIVA', prioridade: 'ALTA', equipamento_id: 'eq1', descricao: 'Monitor desliga sozinho', local: ' UTI 2 ', parado: true };
    const ok = v(base);
    assert.deepEqual([ok.objeto, ok.equipamento_id, ok.equipamento_codigo, ok.patrimonio, ok.local, ok.parado, ok.prioridade], ['EQUIPAMENTO', 'eq1', 'EQP000001', 'P-100', 'UTI 2', true, 'ALTA']);
    assert.equal(v({ ...base, prioridade: '' }).prioridade, 'NORMAL');   // sem prioridade vale Normal
    assert.match(v({ ...base, tipo: 'OUTRO' }), /Tipo: escolha uma opção/);
    assert.match(v({ ...base, prioridade: 'JA' }), /Prioridade: escolha/);
    assert.match(v({ ...base, descricao: 'curto' }), /Descrição: mínimo de 10/);
    assert.match(v({ ...base, equipamento_id: '' }), /Escolha o equipamento/);
    assert.match(v({ ...base, equipamento_id: 'inexistente' }), /Escolha o equipamento/);
    assert.match(v({ ...base, equipamento_id: 'eq2' }), /equipamento está inativo/);
    assert.match(v({ ...base, tipo: 'PREVENTIVA' }), /abertas pela manutenção/);
    assert.match(v({ ...base, tipo: 'CALIBRACAO' }), /abertas pela manutenção/);
    assert.equal(v({ ...base, tipo: 'PREVENTIVA' }, { podeAgendada: true }).tipo, 'PREVENTIVA');
    assert.equal(v({ ...base, tipo: 'PREVENTIVA', parado: true }, { podeAgendada: true }).parado, false);   // "parado" só vale para corretiva
    const infra = v({ tipo: 'INFRAESTRUTURA', descricao: 'Torneira vazando no banheiro', local: 'Ala B, banheiro 2', equipamento_id: 'eq1' });
    assert.deepEqual([infra.objeto, infra.equipamento_id, infra.local, infra.parado], ['LOCAL', '', 'Ala B, banheiro 2', false]);   // equipamento é ignorado
    assert.match(v({ tipo: 'INFRAESTRUTURA', descricao: 'Torneira vazando no banheiro', local: 'ab' }), /Local: mínimo de 3/);
    assert.match(v({ ...base, local: 'x'.repeat(81) }), /Local: no máximo 80/);
});

test('plano: periodicidade em dias, próxima data e equipamento ativo; situação por data', () => {
    const v = (f) => { dados('__f', f); return val('validarPlanoManut(__f, { equipamentos: __eq })'); };
    const base = { tipo: 'PREVENTIVA', equipamento_id: 'eq1', periodicidade_dias: '90', proxima_em: '2026-07-01', descricao: 'Conforme manual do fabricante' };
    const ok = v(base);
    assert.deepEqual([ok.tipo, ok.equipamento_codigo, ok.periodicidade_dias, ok.proxima_em], ['PREVENTIVA', 'EQP000001', 90, '2026-07-01']);
    assert.match(v({ ...base, tipo: 'CORRETIVA' }), /Tipo do plano: escolha/);
    assert.match(v({ ...base, periodicidade_dias: '0' }), /de 1 a 3650/);
    assert.match(v({ ...base, periodicidade_dias: '3651' }), /de 1 a 3650/);
    assert.match(v({ ...base, periodicidade_dias: '30,5' }), /de 1 a 3650/);
    assert.match(v({ ...base, proxima_em: '' }), /data inválida/);
    assert.match(v({ ...base, equipamento_id: 'eq2' }), /inativo/);
    const sit = (p, janela = '') => val(`situacaoDoPlano(${JSON.stringify(p)}, '2026-06-10'${janela ? ', ' + janela : ''})`);
    assert.deepEqual(sit({ proxima_em: '2026-06-09' }), { codigo: 'VENCIDO', dias: -1 });
    assert.deepEqual(sit({ proxima_em: '2026-06-10' }), { codigo: 'A_VENCER', dias: 0 });
    assert.deepEqual(sit({ proxima_em: '2026-07-10' }), { codigo: 'A_VENCER', dias: 30 });
    assert.deepEqual(sit({ proxima_em: '2026-07-11' }), { codigo: 'EM_DIA', dias: 31 });
    assert.deepEqual(sit({ proxima_em: '2026-07-11' }, 60), { codigo: 'A_VENCER', dias: 31 });
    assert.deepEqual(sit({ proxima_em: '2026-06-09', ativo: false }), { codigo: 'INATIVO', dias: null });
});

test('situação do equipamento deriva das OS abertas e não mexe no cadastro', () => {
    const s = (eq, os) => { dados('__e', eq); dados('__os', os); return val('situacaoDoEquipamento(__e, __os)'); };
    const eq = { id: 'eq1', situacao_op: 'Operacional' };
    assert.equal(s(eq, []).codigo, 'OPERACIONAL');
    assert.equal(s({ id: 'eq1', situacao_op: 'Fora de uso' }, []).codigo, 'FORA_DE_USO');
    assert.equal(s({ id: 'eq1', situacao_op: 'Em manutenção' }, []).codigo, 'EM_MANUTENCAO_CAD');
    assert.equal(s(eq, [{ equipamento_id: 'eq1', status: 'ABERTA', parado: false, protocolo: 'OS00001' }]).codigo, 'COM_OS');
    const parado = s(eq, [{ equipamento_id: 'eq1', status: 'AGUARDANDO_PECA', parado: true, protocolo: 'OS00002' }, { equipamento_id: 'eq1', status: 'ABERTA', parado: false, protocolo: 'OS00003' }]);
    assert.deepEqual([parado.codigo, parado.rotulo, parado.abertas.length], ['PARADO', 'Parado · OS00002', 2]);
    assert.equal(s(eq, [{ equipamento_id: 'eq1', status: 'CONCLUIDA', parado: true, protocolo: 'OS00004' }, { equipamento_id: 'eq9', status: 'ABERTA', parado: true, protocolo: 'OS00005' }]).codigo, 'OPERACIONAL');   // concluída e de outro equipamento não contam
});

test('indicadores da manutenção: só contagens e tempos médios do que foi registrado', () => {
    const t = (h, d = 10) => new Date(2026, 5, d, h).toISOString();
    dados('__os', [
        { id: 'a', dia: '2026-06-10', tipo: 'CORRETIVA', prioridade: 'ALTA', status: 'CONCLUIDA', criado_em: t(8), iniciado_em: t(9), concluido_em: t(12) },
        { id: 'b', dia: '2026-06-10', tipo: 'CORRETIVA', prioridade: 'NORMAL', status: 'CONCLUIDA', criado_em: t(8), iniciado_em: t(11), concluido_em: t(18) },
        { id: 'c', dia: '2026-06-10', tipo: 'INFRAESTRUTURA', prioridade: 'NORMAL', status: 'ABERTA', criado_em: t(8), iniciado_em: '', concluido_em: '' },
        { id: 'd', dia: '2026-06-11', tipo: 'PREVENTIVA', prioridade: 'NORMAL', status: 'CANCELADA', criado_em: t(8, 11), iniciado_em: '', concluido_em: '' },
        { id: 'e', dia: '2026-05-01', tipo: 'CORRETIVA', prioridade: 'URGENTE', status: 'EM_ATENDIMENTO', criado_em: t(8, 1), iniciado_em: t(9, 1), concluido_em: '' }
    ]);
    const r = val("indicadoresManutencao(__os, '2026-06-10', '2026-06-11')");
    assert.deepEqual([r.abertas_no_periodo, r.em_aberto, r.concluidas, r.canceladas, r.horas_ate_assumir, r.horas_ate_concluir], [4, 2, 2, 1, 2, 7]);
    assert.deepEqual(r.por_tipo, { CORRETIVA: 2, INFRAESTRUTURA: 1, PREVENTIVA: 1 });
    const vazio = val('indicadoresManutencao([], "", "")');
    assert.deepEqual([vazio.abertas_no_periodo, vazio.horas_ate_assumir, vazio.horas_ate_concluir], [0, null, null]);
});

// ============ Manutenção: gravação ============

test('chamado: qualquer perfil abre; protocolo em sequência; preventiva só pela manutenção; sem login não grava', async () => {
    dados('__u', null); call('state.currentUser = null');
    assert.match(await erroDe("abrirChamadoOs({ tipo: 'CORRETIVA' })"), /Acesso negado/);
    entrar('MEDICO', 'med1', 'Dr. Teste');
    const os = await aj("abrirChamadoOs({ tipo: 'CORRETIVA', prioridade: 'ALTA', equipamento_id: 'eq1', descricao: 'Monitor desliga sozinho', local: 'UTI 2', parado: true })");
    assert.deepEqual([os.protocolo, os.status, os.solicitante, os.parado, os.dia, os.historico.length], ['OS00001', 'ABERTA', 'med1', true, hoje, 1]);
    assert.equal(doc('os_manutencao', os.id).equipamento_nome, 'MONITOR MULTIPARAMÉTRICO');
    assert.equal(doc('cad_contadores', 'os_manutencao').ultimo, 1);
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enf. Teste');
    const infra = await aj("abrirChamadoOs({ tipo: 'INFRAESTRUTURA', prioridade: 'NORMAL', descricao: 'Torneira vazando no banheiro', local: 'Ala B, banheiro 2' })");
    assert.equal(infra.protocolo, 'OS00002');
    assert.match(await erroDe("abrirChamadoOs({ tipo: 'PREVENTIVA', equipamento_id: 'eq1', descricao: 'Revisão programada do monitor' })"), /abertas pela manutenção/);
    assert.match(await erroDe("abrirChamadoOs({ tipo: 'CORRETIVA', equipamento_id: 'eq1', descricao: 'curto' })"), /mínimo de 10/);
    assert.equal(Object.keys(banco.store.os_manutencao).length, 2);   // as recusadas não gravaram nada
    assert.equal(doc('cad_contadores', 'os_manutencao').ultimo, 2);
    assert.ok(auditoria.some(a => a.entidade === 'os_manutencao' && a.acao === 'ABRIR' && a.depois.protocolo === 'OS00001'));
});

test('atendimento da OS: assumir, aguardar peça, retomar e concluir; só a manutenção; cada passo vale uma vez', async () => {
    const os1 = Object.values(banco.store.os_manutencao).find(o => o.protocolo === 'OS00001');
    entrar('FUNC_ENFERMAGEM', 'enf1');
    assert.match(await erroDe(`assumirOs('${os1.id}')`), /Acesso negado/);
    assert.match(await erroDe(`concluirOs('${os1.id}', { solucao: 'Trocada a fonte do monitor' })`), /Acesso negado/);
    entrar('FUNC_MANUTENCAO', 'man1', 'Téc. Manutenção');
    assert.match(await erroDe(`concluirOs('${os1.id}', { solucao: 'Trocada a fonte do monitor' })`), /de "Aberta" para "Concluída"/);   // não pula o atendimento
    const a = await aj(`assumirOs('${os1.id}')`);
    assert.deepEqual([a.status, a.atendente, a.atendente_nome], ['EM_ATENDIMENTO', 'man1', 'Téc. Manutenção']);
    assert.ok(a.iniciado_em);
    assert.match(await erroDe(`assumirOs('${os1.id}')`), /já foi registrado/);   // duas pessoas assumindo: só uma
    assert.match(await erroDe(`aguardarPecaOs('${os1.id}', '')`), /O que está sendo aguardado: informe/);
    assert.equal((await aj(`aguardarPecaOs('${os1.id}', 'Fonte de alimentação pedida ao fornecedor')`)).status, 'AGUARDANDO_PECA');
    assert.equal((await aj(`assumirOs('${os1.id}')`)).status, 'EM_ATENDIMENTO');   // retomada
    assert.equal(doc('os_manutencao', os1.id).iniciado_em, a.iniciado_em);   // a hora do primeiro atendimento não muda
    assert.match(await erroDe(`concluirOs('${os1.id}', { solucao: 'curta' })`), /Solução aplicada: mínimo de 10/);
    const antes = new Date(new Date(os1.criado_em).getTime() - 3600000).toISOString();
    assert.match(await erroDe(`concluirOs('${os1.id}', { solucao: 'Trocada a fonte do monitor', concluido_em: '${antes}' })`), /anterior à abertura/);
    const depois = new Date(Date.now() + 3600000).toISOString();
    assert.match(await erroDe(`concluirOs('${os1.id}', { solucao: 'Trocada a fonte do monitor', concluido_em: '${depois}' })`), /não pode estar no futuro/);
    const c = await aj(`concluirOs('${os1.id}', { solucao: 'Trocada a fonte do monitor', pecas: 'Fonte 12 V' })`);
    assert.deepEqual([c.status, c.solucao, c.pecas, c.historico.map(h => h.status)], ['CONCLUIDA', 'Trocada a fonte do monitor', 'Fonte 12 V', ['ABERTA', 'EM_ATENDIMENTO', 'AGUARDANDO_PECA', 'EM_ATENDIMENTO', 'CONCLUIDA']]);
    assert.match(await erroDe(`concluirOs('${os1.id}', { solucao: 'Trocada a fonte do monitor' })`), /já foi registrado/);
    assert.match(await erroDe(`cancelarOs('${os1.id}', 'Não é mais necessário')`), /de "Concluída" para "Cancelada"/);   // concluída não se cancela
    assert.match(await erroDe("assumirOs('nao_existe')"), /OS não encontrada/);
});

test('cancelar OS: quem abriu cancela só a própria e só enquanto aberta; a manutenção cancela qualquer aberta; motivo obrigatório', async () => {
    const infra = Object.values(banco.store.os_manutencao).find(o => o.protocolo === 'OS00002');
    entrar('MEDICO', 'med1');
    assert.match(await erroDe(`cancelarOs('${infra.id}', 'Não fui eu que abri')`), /só quem abriu cancela a própria OS/);
    entrar('FUNC_ENFERMAGEM', 'enf1');
    assert.match(await erroDe(`cancelarOs('${infra.id}', 'abc')`), /Motivo do cancelamento: mínimo de 5/);
    const nova = await aj("abrirChamadoOs({ tipo: 'CORRETIVA', equipamento_id: 'eq3', descricao: 'Autoclave não aquece o suficiente' })");
    entrar('FUNC_MANUTENCAO', 'man1');
    await call(`assumirOs('${nova.id}')`);
    entrar('FUNC_ENFERMAGEM', 'enf1');
    assert.match(await erroDe(`cancelarOs('${nova.id}', 'Já resolvi sozinho')`), /Só a manutenção cancela uma OS que já foi assumida/);
    const c = await aj(`cancelarOs('${infra.id}', 'Era engano, o problema já foi resolvido')`);
    assert.deepEqual([c.status, c.cancelada_motivo, c.cancelada_por], ['CANCELADA', 'Era engano, o problema já foi resolvido', 'enf1']);
    entrar('FUNC_MANUTENCAO', 'man1');
    assert.equal((await aj(`cancelarOs('${nova.id}', 'Equipamento será substituído')`)).status, 'CANCELADA');
});

test('plano de preventiva: só a manutenção cria; um por equipamento e tipo; gerar OS uma vez; concluir reagenda; cancelar solta o plano', async () => {
    entrar('MEDICO', 'med1');
    const f = (extra = '') => `{ tipo: 'PREVENTIVA', equipamento_id: 'eq1', periodicidade_dias: '90', proxima_em: '${hoje}', descricao: 'Conforme manual do fabricante'${extra} }`;
    assert.match(await erroDe(`criarPlanoManut(${f()})`), /Acesso negado/);
    entrar('FUNC_MANUTENCAO', 'man1', 'Téc. Manutenção');
    assert.match(await erroDe("criarPlanoManut({ tipo: 'PREVENTIVA', equipamento_id: 'eq1', periodicidade_dias: '0', proxima_em: '2026-07-01' })"), /de 1 a 3650/);
    assert.match(await erroDe("criarPlanoManut({ tipo: 'PREVENTIVA', equipamento_id: 'eq2', periodicidade_dias: '90', proxima_em: '2026-07-01' })"), /inativo/);
    const p = await aj(`criarPlanoManut(${f()})`);
    assert.deepEqual([p.id, p.ativo, p.ultima_em, p.os_aberta_id, p.periodicidade_dias], ['plano_eq1_PREVENTIVA', true, '', '', 90]);
    assert.match(await erroDe(`criarPlanoManut(${f()})`), /Já existe um plano deste tipo/);
    const cal = await aj("criarPlanoManut({ tipo: 'CALIBRACAO', equipamento_id: 'eq1', periodicidade_dias: '365', proxima_em: '2027-01-15' })");   // outro tipo no mesmo equipamento é outro plano
    assert.equal(cal.id, 'plano_eq1_CALIBRACAO');
    // gerar a OS do plano
    const os = await aj(`gerarOsDoPlano('${p.id}')`);
    assert.deepEqual([os.tipo, os.plano_id, os.equipamento_id, os.status, os.parado], ['PREVENTIVA', p.id, 'eq1', 'ABERTA', false]);
    assert.equal(doc('manut_planos', p.id).os_aberta_id, os.id);
    assert.match(await erroDe(`gerarOsDoPlano('${p.id}')`), /Já existe uma OS aberta para este plano/);
    assert.match(await erroDe(`inativarPlanoManut('${p.id}', 'Equipamento sem uso agora')`), /Há uma OS aberta deste plano/);
    // concluir a OS reagenda o plano a partir da data em que foi feita
    await call(`assumirOs('${os.id}')`);
    await call(`concluirOs('${os.id}', { solucao: 'Revisão feita conforme o manual' })`);
    const depois = doc('manut_planos', p.id);
    assert.deepEqual([depois.ultima_em, depois.proxima_em, depois.os_aberta_id, depois.historico.at(-1).acao], [hoje, amb.call('apoioSomarDias(todayISO(), 90)'), '', 'EXECUTADO']);
    // cancelar a OS do plano da calibração solta o plano para gerar outra
    const osCal = await aj(`gerarOsDoPlano('${cal.id}')`);
    await call(`cancelarOs('${osCal.id}', 'Equipamento em viagem')`);
    assert.equal(doc('manut_planos', cal.id).os_aberta_id, '');
    assert.equal((await aj(`gerarOsDoPlano('${cal.id}')`)).plano_id, cal.id);
    // ajuste exige motivo e guarda o histórico; inativar e reativar
    assert.match(await erroDe(`ajustarPlanoManut('${p.id}', { periodicidade_dias: '60', proxima_em: '2026-12-01' }, '')`), /Motivo do ajuste: informe/);
    const aj2 = await aj(`ajustarPlanoManut('${p.id}', { periodicidade_dias: '60', proxima_em: '2026-12-01', descricao: 'Nova rotina' }, 'Fabricante recomendou 60 dias')`);
    assert.deepEqual([aj2.periodicidade_dias, aj2.proxima_em, aj2.historico.at(-1).acao, aj2.historico.at(-1).motivo], [60, '2026-12-01', 'AJUSTADO', 'Fabricante recomendou 60 dias']);
    await call(`inativarPlanoManut('${p.id}', 'Equipamento sem uso agora')`);
    assert.equal(doc('manut_planos', p.id).ativo, false);
    assert.match(await erroDe(`gerarOsDoPlano('${p.id}')`), /plano está inativo/);
    assert.match(await erroDe(`criarPlanoManut(${f()})`), /plano inativo deste tipo/);
    assert.match(await erroDe(`inativarPlanoManut('${p.id}', 'Equipamento sem uso agora')`), /já está inativo/);
    await call(`reativarPlanoManut('${p.id}')`);
    assert.equal(doc('manut_planos', p.id).ativo, true);
});

// ============ Transporte ============

test('solicitação de transporte: paciente exige nome e meio da lista; material exige a descrição; origem diferente do destino', () => {
    const v = (f) => { dados('__f', f); return val('validarSolicitacaoTransporte(__f)'); };
    const pac = { tipo: 'PACIENTE_INTERNO', prioridade: 'URGENTE', meio: 'MACA', origem: 'UTI 2', destino: 'Tomografia', paciente_nome: 'Maria de Teste', prontuario: '1001', oxigenio: true, isolamento: false, justificativa_sem_vinculo: 'Paciente de passagem sem cadastro' };
    const ok = v(pac);
    assert.deepEqual([ok.tipo, ok.meio_rotulo, ok.paciente_nome, ok.oxigenio, ok.requer_acompanhamento, ok.descricao_material], ['PACIENTE_INTERNO', 'Maca', 'Maria de Teste', true, false, '']);
    assert.match(v({ ...pac, tipo: 'OUTRO' }), /Tipo de transporte: escolha/);
    assert.match(v({ ...pac, meio: 'AMBULANCIA' }), /Meio de transporte: escolha/);   // ambulância não é meio interno
    assert.equal(v({ ...pac, tipo: 'PACIENTE_EXTERNO', meio: 'AMBULANCIA', destino: 'Hospital de Referência' }).meio_rotulo, 'Ambulância');
    assert.match(v({ ...pac, paciente_nome: 'ab' }), /Paciente: mínimo de 3/);
    assert.match(v({ ...pac, destino: 'uti 2' }), /Origem e destino são iguais/);
    // #70: sem vínculo com o cadastro/internação só com justificativa escrita
    assert.match(v({ ...pac, justificativa_sem_vinculo: '' }), /Justificativa para paciente sem cadastro: informe/);
    const lig = v({ ...pac, justificativa_sem_vinculo: '', paciente_id: 'pac1' });
    assert.deepEqual([lig.paciente_id, lig.justificativa_sem_vinculo], ['pac1', '']);
    assert.equal(v({ ...pac, justificativa_sem_vinculo: '', internacao_id: 'int1' }).internacao_id, 'int1');
    assert.match(v({ ...pac, origem: '' }), /Origem: informe/);
    const mat = v({ tipo: 'MATERIAL', meio: 'CARRINHO', origem: 'Farmácia', destino: 'Ala B', descricao_material: 'Caixa de soro', oxigenio: true, paciente_nome: 'não deve valer' });
    assert.deepEqual([mat.descricao_material, mat.paciente_nome, mat.oxigenio, mat.prioridade], ['Caixa de soro', '', false, 'NORMAL']);   // avisos de paciente não valem para material
    assert.match(v({ tipo: 'MATERIAL', meio: 'CARRINHO', origem: 'Farmácia', destino: 'Ala B' }), /O que será transportado: informe/);
});

test('transporte: quem pode pedir, aceitar uma vez, iniciar e concluir só pelo executor; cancelar com motivo', async () => {
    const pac = "{ tipo: 'PACIENTE_INTERNO', prioridade: 'URGENTE', meio: 'MACA', origem: 'UTI 2', destino: 'Tomografia', paciente_nome: 'Maria de Teste', prontuario: '1001', oxigenio: true, justificativa_sem_vinculo: 'Paciente de passagem sem cadastro' }";
    const mat = "{ tipo: 'MATERIAL', meio: 'CARRINHO', origem: 'Farmácia', destino: 'Ala B', descricao_material: 'Caixa de soro' }";
    entrar('FUNC_TRANSPORTE', 'trp1', 'Maqueiro Um');
    assert.match(await erroDe(`solicitarTransporte(${mat})`), /Acesso negado/);   // o transporte executa, não solicita
    entrar('FUNC_MANUTENCAO', 'man1');
    assert.match(await erroDe(`solicitarTransporte(${mat})`), /Acesso negado/);
    entrar('FUNC_NUTRICAO', 'nut1');
    assert.match(await erroDe(`solicitarTransporte(${pac})`), /Acesso negado/);   // material sim, paciente não
    assert.equal((await aj(`solicitarTransporte(${mat})`)).protocolo, 'TR00001');
    entrar('MEDICO', 'med1');
    const t = await aj(`solicitarTransporte(${pac})`);
    assert.deepEqual([t.protocolo, t.status, t.solicitante, t.oxigenio, t.historico.length], ['TR00002', 'SOLICITADO', 'med1', true, 1]);
    // execução
    assert.match(await erroDe(`aceitarTransporte('${t.id}')`), /Acesso negado/);
    entrar('FUNC_TRANSPORTE', 'trp1', 'Maqueiro Um');
    assert.match(await erroDe(`iniciarTransporte('${t.id}')`), /de "Solicitado" para "Em transporte"/);   // não pula o aceite
    const a = await aj(`aceitarTransporte('${t.id}')`);
    assert.deepEqual([a.status, a.executor, a.executor_nome], ['ACEITO', 'trp1', 'Maqueiro Um']);
    entrar('FUNC_TRANSPORTE', 'trp2', 'Maqueiro Dois');
    assert.match(await erroDe(`aceitarTransporte('${t.id}')`), /já foi registrado/);   // segunda pessoa aceitando a mesma corrida
    assert.match(await erroDe(`iniciarTransporte('${t.id}')`), /foi aceito por Maqueiro Um/);
    entrar('FUNC_TRANSPORTE', 'trp1', 'Maqueiro Um');
    assert.equal((await aj(`iniciarTransporte('${t.id}')`)).status, 'EM_TRANSPORTE');
    entrar('FUNC_TRANSPORTE', 'trp2', 'Maqueiro Dois');
    assert.match(await erroDe(`concluirTransporte('${t.id}')`), /foi aceito por Maqueiro Um/);
    entrar('FUNC_TRANSPORTE', 'trp1', 'Maqueiro Um');
    const c = await aj(`concluirTransporte('${t.id}')`);
    assert.deepEqual([c.status, c.historico.map(h => h.status)], ['CONCLUIDO', ['SOLICITADO', 'ACEITO', 'EM_TRANSPORTE', 'CONCLUIDO']]);
    assert.ok(c.aceito_em && c.iniciado_em && c.concluido_em);
    assert.match(await erroDe(`cancelarTransporte('${t.id}', 'Não precisa mais')`), /de "Concluído" para "Cancelado"/);
});

test('cancelar transporte: quem pediu cancela só a própria solicitação ainda não aceita; o transporte cancela as abertas; motivo obrigatório', async () => {
    const mat = "{ tipo: 'MATERIAL', meio: 'EM_MAOS', origem: 'Laboratório', destino: 'Ala C', descricao_material: 'Amostras de exame' }";
    entrar('FUNC_FARMACIA', 'far1');
    const t1 = await aj(`solicitarTransporte(${mat})`);
    const t2 = await aj(`solicitarTransporte(${mat})`);
    entrar('MEDICO', 'med1');
    assert.match(await erroDe(`cancelarTransporte('${t1.id}', 'Não fui eu que pedi')`), /só quem solicitou cancela a própria solicitação/);
    entrar('FUNC_FARMACIA', 'far1');
    assert.match(await erroDe(`cancelarTransporte('${t1.id}', 'abc')`), /Motivo do cancelamento: mínimo de 5/);
    assert.equal((await aj(`cancelarTransporte('${t1.id}', 'Amostras foram levadas por outra pessoa')`)).status, 'CANCELADO');
    entrar('FUNC_TRANSPORTE', 'trp1');
    await call(`aceitarTransporte('${t2.id}')`);
    entrar('FUNC_FARMACIA', 'far1');
    assert.match(await erroDe(`cancelarTransporte('${t2.id}', 'Mudei de ideia sobre o pedido')`), /Só o transporte cancela depois de aceito/);
    entrar('FUNC_TRANSPORTE', 'trp1');
    const c = await aj(`cancelarTransporte('${t2.id}', 'Origem informou que a amostra não está pronta')`);
    assert.deepEqual([c.status, c.cancelado_motivo], ['CANCELADO', 'Origem informou que a amostra não está pronta']);
});

test('tempos e indicadores do transporte: minutos entre os passos registrados', () => {
    const t = (min) => new Date(2026, 5, 10, 8, min).toISOString();
    dados('__t', { criado_em: t(0), aceito_em: t(5), iniciado_em: t(8), concluido_em: t(20) });
    assert.deepEqual(val('temposDoTransporte(__t)'), { ate_aceitar: 5, em_transporte: 12, total: 20 });
    dados('__t', { criado_em: t(0), aceito_em: '', iniciado_em: '', concluido_em: '' });
    assert.deepEqual(val('temposDoTransporte(__t)'), { ate_aceitar: null, em_transporte: null, total: null });
    dados('__l', [
        { dia: '2026-06-10', tipo: 'MATERIAL', status: 'CONCLUIDO', criado_em: t(0), aceito_em: t(4), iniciado_em: t(5), concluido_em: t(15) },
        { dia: '2026-06-10', tipo: 'PACIENTE_INTERNO', status: 'CONCLUIDO', criado_em: t(0), aceito_em: t(10), iniciado_em: t(12), concluido_em: t(42) },
        { dia: '2026-06-10', tipo: 'PACIENTE_INTERNO', status: 'SOLICITADO', criado_em: t(0), aceito_em: '', iniciado_em: '', concluido_em: '' },
        { dia: '2026-06-11', tipo: 'MATERIAL', status: 'CANCELADO', criado_em: t(0), aceito_em: '', iniciado_em: '', concluido_em: '' },
        { dia: '2026-05-01', tipo: 'MATERIAL', status: 'CONCLUIDO', criado_em: t(0), aceito_em: t(1), iniciado_em: t(1), concluido_em: t(2) }
    ]);
    const r = val("indicadoresTransporte(__l, '2026-06-10', '2026-06-11')");
    assert.deepEqual([r.total, r.em_aberto, r.concluidos, r.cancelados, r.min_ate_aceitar, r.min_em_transporte], [4, 1, 2, 1, 7, 20]);
    assert.deepEqual(r.por_tipo, { MATERIAL: 2, PACIENTE_INTERNO: 2 });
});

test('transporte (#70): paciente ligado à internação usa o nome e o prontuário do registro, não o digitado', async () => {
    val("MOCK_DATA.INTERNACOES = [{ id: 'int1', status: 'ATIVA', paciente_id: 'pac1', paciente_nome: 'Joana Real', prontuario: '777' }]");
    entrar('MEDICO', 'med1');
    const base = "tipo: 'PACIENTE_INTERNO', meio: 'MACA', origem: 'UTI 2', destino: 'Tomografia', paciente_nome: 'Nome Errado'";
    const t = await aj(`solicitarTransporte({ ${base}, internacao_id: 'int1' })`);
    assert.deepEqual([t.paciente_nome, t.prontuario, t.paciente_id, t.internacao_id, t.justificativa_sem_vinculo], ['Joana Real', '777', 'pac1', 'int1', '']);
    assert.match(await erroDe(`solicitarTransporte({ ${base}, internacao_id: 'nao-existe' })`), /não está mais ativa/);
    assert.match(await erroDe(`solicitarTransporte({ ${base} })`), /Justificativa para paciente sem cadastro/);
});
