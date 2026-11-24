// Testes da Etapa 9: rouparia, resíduos, voluntariado, tipo de alta e óbitos. Executa com: npm test
// Só dados fictícios. O banco é um Firestore simulado em memória (nunca o real).
const test = require('node:test');
const assert = require('node:assert/strict');
const { criarAmbiente, semearBasico } = require('./helpers/clinico');

const amb = criarAmbiente();
const { call, dados, entrar, erroDe, doc, hoje, banco, auditoria, guardar } = amb;
semearBasico(amb);
dados('__agora', new Date(2026, 5, 10, 12, 0, 0).toISOString());
const em = (h, min = 0, d = 10) => new Date(2026, 5, d, h, min).toISOString();

const aj = async (codigo) => JSON.parse(JSON.stringify(await call(codigo)));
const val = (codigo) => { try { return JSON.parse(JSON.stringify(call(codigo))); } catch (e) { return e.message; } };

// ============ Rouparia ============

test('movimento da rouparia: tipo, peça, setor, quantidade inteira, peso opcional e motivo na baixa', () => {
    const v = (f) => { dados('__f', f); return val('validarMovimentoRouparia(__f, new Date(__agora))'); };
    const base = { tipo: 'COLETA_SUJA', peca: 'LENCOL', setor: ' Ala B ', quantidade: '40', peso_kg: '12,5' };
    const ok = v(base);
    assert.deepEqual([ok.tipo, ok.peca_rotulo, ok.setor, ok.quantidade, ok.peso_kg, ok.motivo], ['COLETA_SUJA', 'Lençol', 'Ala B', 40, 12.5, '']);
    assert.equal(new Date(ok.em).toISOString(), em(12));
    assert.equal(v({ ...base, peso_kg: '' }).peso_kg, null);   // o peso é opcional
    assert.match(v({ ...base, tipo: 'DOACAO' }), /Tipo de movimento: escolha/);
    assert.match(v({ ...base, peca: 'TAPETE' }), /Peça: escolha/);
    assert.match(v({ ...base, setor: 'a' }), /Setor: mínimo de 2/);
    ['', '0', '10000', '2,5', 'x'].forEach(q => assert.match(v({ ...base, quantidade: q }), /inteiro de 1 a 9999/, q));
    assert.match(v({ ...base, peso_kg: '0' }), /Peso \(kg\): número de 0.01/);
    assert.match(v({ ...base, peso_kg: '1,234' }), /no máximo 2 casa/);
    assert.match(v({ ...base, em: em(13) }), /não pode estar no futuro/);
    assert.match(v({ ...base, em: em(11, 0, 7) }), /anterior ao limite/);
    assert.match(v({ ...base, tipo: 'BAIXA' }), /Motivo da baixa: informe/);
    assert.equal(v({ ...base, tipo: 'BAIXA', motivo: 'Rasgado sem conserto' }).motivo, 'Rasgado sem conserto');
});

test('rouparia: registrar e anular; as somas ignoram anulados e mostram coletadas menos entregues sem interpretar', async () => {
    const f = (t, setor, peca, q, kg = '') => `{ tipo: '${t}', setor: '${setor}', peca: '${peca}', quantidade: '${q}', peso_kg: '${kg}', motivo: 'Extraviado na coleta' }`;
    entrar('FUNC_ENFERMAGEM', 'enf1');
    assert.match(await erroDe(`registrarMovimentoRouparia(${f('COLETA_SUJA', 'UTI', 'LENCOL', 10)})`), /Acesso negado/);
    entrar('FUNC_LAVANDERIA', 'lav1', 'Lavanderia Um');
    const m1 = await aj(`registrarMovimentoRouparia(${f('COLETA_SUJA', 'UTI', 'LENCOL', 40, '12,5')})`);
    assert.deepEqual([m1.tipo, m1.dia, m1.por, m1.id.startsWith('rou_')], ['COLETA_SUJA', hoje, 'lav1', true]);
    await call(`registrarMovimentoRouparia(${f('ENTREGA_LIMPA', 'UTI', 'LENCOL', 35, '11')})`);
    const errado = await aj(`registrarMovimentoRouparia(${f('COLETA_SUJA', 'UTI', 'LENCOL', 400)})`);   // digitou 400 em vez de 40
    await call(`registrarMovimentoRouparia(${f('BAIXA', 'UTI', 'LENCOL', 2)})`);
    await call(`registrarMovimentoRouparia(${f('COLETA_SUJA', 'Ala B', 'TOALHA', 20)})`);
    assert.match(await erroDe(`anularMovimentoRouparia('${errado.id}', 'abc')`), /Motivo da anulação: mínimo de 5/);
    entrar('FUNC_HIGIENIZACAO', 'hig1');   // a higienização também registra e anula (rouparia_registrar)
    const anul = await aj(`anularMovimentoRouparia('${errado.id}', 'Digitei 400 em vez de 40')`);
    assert.deepEqual([anul.id, anul.tipo, anul.anula_id], [`anul_${errado.id}`, 'ANULACAO', errado.id]);
    assert.match(await erroDe(`anularMovimentoRouparia('${errado.id}', 'Anulando outra vez')`), /já foi anulado/);
    assert.match(await erroDe(`anularMovimentoRouparia('${anul.id}', 'Anulando a anulação')`), /já é uma anulação/);
    assert.match(await erroDe("anularMovimentoRouparia('nao_existe', 'Registro inexistente')"), /não encontrado/);
    assert.equal(doc('rouparia_mov', errado.id).quantidade, 400);   // o original não é alterado
    dados('__l', Object.values(banco.store.rouparia_mov));
    const r = val("resumoRouparia(__l, '', '')");
    assert.equal(r.linhas.length, 2);
    const uti = r.linhas.find(l => l.setor === 'UTI');
    assert.deepEqual([uti.coletadas, uti.entregues, uti.baixas, uti.diferenca, uti.kg_coletado, uti.kg_entregue], [40, 35, 2, 5, 12.5, 11]);
    assert.deepEqual(r.total, { coletadas: 60, entregues: 35, baixas: 2, kg_coletado: 12.5, kg_entregue: 11, movimentos: 4 });
    assert.equal(val("resumoRouparia(__l, '2099-01-01', '')").linhas.length, 0);   // filtro por período
    assert.ok(auditoria.some(a => a.entidade === 'rouparia' && a.acao === 'ANULAR'));
});

// ============ Resíduos ============

test('registro de resíduo: grupo A a E, setor, peso até 2 casas e horário dos últimos 7 dias', () => {
    const v = (f) => { dados('__f', f); return val('validarRegistroResiduo(__f, new Date(__agora))'); };
    const base = { grupo: 'A', setor: 'Centro Cirúrgico', peso_kg: '12,35', destino: 'Abrigo temporário', manifesto: 'M-123' };
    const ok = v(base);
    assert.deepEqual([ok.tipo, ok.grupo_rotulo, ok.peso_kg, ok.manifesto], ['REGISTRO', 'A · Biológico', 12.35, 'M-123']);
    ['A', 'B', 'C', 'D', 'E'].forEach(g => assert.equal(v({ ...base, grupo: g }).grupo, g));
    assert.match(v({ ...base, grupo: 'F' }), /Grupo do resíduo: escolha/);
    assert.match(v({ ...base, peso_kg: '' }), /Peso \(kg\): informe/);
    assert.match(v({ ...base, peso_kg: '0' }), /número de 0.01/);
    assert.match(v({ ...base, peso_kg: '10000' }), /número de 0.01/);
    assert.match(v({ ...base, setor: '' }), /Setor gerador: informe/);
    assert.match(v({ ...base, manifesto: 'x'.repeat(31) }), /no máximo 30/);
    assert.match(v({ ...base, em: em(14) }), /não pode estar no futuro/);
    assert.match(v({ ...base, em: em(12, 0, 2) }), /anterior ao limite/);
});

test('resíduos: registrar, anular e somar o peso por grupo e por setor sem contar os anulados', async () => {
    const f = (g, setor, kg) => `{ grupo: '${g}', setor: '${setor}', peso_kg: '${kg}', destino: 'Abrigo', manifesto: '' }`;
    entrar('FUNC_LAVANDERIA', 'lav1');
    assert.match(await erroDe(`registrarResiduo(${f('A', 'UTI', '5')})`), /Acesso negado/);   // lavanderia não registra resíduo
    entrar('FUNC_HIGIENIZACAO', 'hig1', 'Higienização Um');
    await call(`registrarResiduo(${f('A', 'UTI', '5,5')})`);
    await call(`registrarResiduo(${f('A', 'Ala B', '3')})`);
    await call(`registrarResiduo(${f('D', 'UTI', '20,25')})`);
    const errado = await aj(`registrarResiduo(${f('E', 'UTI', '99')})`);
    await call(`anularRegistroResiduo('${errado.id}', 'Peso digitado errado')`);
    assert.match(await erroDe(`anularRegistroResiduo('${errado.id}', 'Anulando de novo')`), /já foi anulado/);
    dados('__l', Object.values(banco.store.residuos_registros));
    const r = val("resumoResiduos(__l, '', '')");
    assert.deepEqual([r.registros, r.total_kg, r.por_grupo], [3, 28.75, { A: 8.5, D: 20.25 }]);
    const uti = r.setores.find(s => s.setor === 'UTI');
    assert.deepEqual([uti.registros, uti.total_kg, uti.A, uti.D, uti.E], [2, 25.75, 5.5, 20.25, undefined]);
    assert.ok(auditoria.some(a => a.entidade === 'residuo' && a.acao === 'REGISTRAR' && a.depois.grupo === 'A'));
});

// ============ Voluntariado ============

test('voluntário: nome, área da lista e termo de adesão com data que não é futura', () => {
    const v = (f) => { dados('__f', f); return val('validarVoluntario(__f, new Date(__agora))'); };
    const base = { nome: ' Carla de Teste ', contato: '(63) 90000-0000', area: 'ACOLHIMENTO', termo_em: '2026-05-20' };
    assert.deepEqual([v(base).nome, v(base).area, v(base).termo_em], ['Carla de Teste', 'ACOLHIMENTO', '2026-05-20']);
    assert.match(v({ ...base, nome: 'ab' }), /Nome: mínimo de 3/);
    assert.match(v({ ...base, area: 'X' }), /Área de atuação: escolha/);
    assert.match(v({ ...base, termo_em: '' }), /Termo de adesão assinado em: data inválida/);
    assert.match(v({ ...base, termo_em: '2026-06-11' }), /não pode estar no futuro/);
    assert.match(v({ ...base, contato: 'x'.repeat(41) }), /Contato: no máximo 40/);
});

test('voluntário: só a coordenação cadastra, edita e inativa; a Portaria registra presença; uma presença aberta por vez', async () => {
    const f = "{ nome: 'Carla de Teste', contato: '', area: 'ACOLHIMENTO', termo_em: '2026-05-20', observacao: '' }";
    entrar('FUNC_PORTARIA', 'por1', 'Porteiro Um');
    assert.match(await erroDe(`cadastrarVoluntario(${f})`), /Acesso negado/);
    entrar('FUNC_VOLUNTARIADO', 'vol1', 'Coordenação');
    const vol = await aj(`cadastrarVoluntario(${f})`);
    assert.deepEqual([vol.situacao, vol.historico.length, vol.id.startsWith('vol_')], ['ATIVO', 1, true]);
    assert.match(await erroDe(`editarVoluntario('${vol.id}', ${f})`), /Nenhuma alteração/);
    const ed = await aj(`editarVoluntario('${vol.id}', { nome: 'Carla de Teste', contato: '(63) 91111-1111', area: 'ARTE_MUSICA', termo_em: '2026-05-20', observacao: '' })`);
    assert.deepEqual([ed.contato, ed.area, ed.historico.at(-1).acao, ed.historico.at(-1).detalhe], ['(63) 91111-1111', 'ARTE_MUSICA', 'EDITADO', 'Campos: contato, area']);
    // presença pela Portaria
    entrar('FUNC_PORTARIA', 'por1', 'Porteiro Um');
    assert.match(await erroDe(`editarVoluntario('${vol.id}', ${f})`), /Acesso negado/);
    const p = await aj(`registrarEntradaVoluntario('${vol.id}')`);
    assert.deepEqual([p.status, p.voluntario_nome, p.area, p.entrada_por], ['ABERTA', 'Carla de Teste', 'ARTE_MUSICA', 'por1']);
    assert.deepEqual(doc('voluntario_aberta', vol.id), { id: vol.id, aberta: true, presenca_id: p.id });
    assert.match(await erroDe(`registrarEntradaVoluntario('${vol.id}')`), /já está com a entrada registrada/);
    entrar('FUNC_VOLUNTARIADO', 'vol1');
    assert.match(await erroDe(`inativarVoluntario('${vol.id}', 'Pediu para sair do programa')`), /presença aberta/);
    // saída: não pode ser anterior à entrada nem futura
    entrar('FUNC_PORTARIA', 'por1');
    const antes = new Date(new Date(p.entrada_em).getTime() - 3600000).toISOString();
    assert.match(await erroDe(`registrarSaidaVoluntario('${p.id}', { saida_em: '${antes}' })`), /anterior à entrada/);
    assert.match(await erroDe(`registrarSaidaVoluntario('${p.id}', { saida_em: '${new Date(Date.now() + 3600000).toISOString()}' })`), /não pode estar no futuro/);
    const s = await aj(`registrarSaidaVoluntario('${p.id}', { observacao: 'Saiu pelo portão principal' })`);
    assert.deepEqual([s.status, s.saida_por, s.observacao], ['ENCERRADA', 'por1', 'Saiu pelo portão principal']);
    assert.equal(doc('voluntario_aberta', vol.id).aberta, false);
    assert.match(await erroDe(`registrarSaidaVoluntario('${p.id}')`), /já foi registrada/);
    assert.equal((await aj(`registrarEntradaVoluntario('${vol.id}')`)).status, 'ABERTA');   // nova entrada depois da saída
    // inativar: com presença aberta não; sem ela sim; inativo não entra
    entrar('FUNC_VOLUNTARIADO', 'vol1');
    const aberta = Object.values(banco.store.voluntario_presencas).find(x => x.status === 'ABERTA');
    await call(`registrarSaidaVoluntario('${aberta.id}')`);
    assert.match(await erroDe(`inativarVoluntario('${vol.id}', 'abc')`), /Motivo: mínimo de 5/);
    await call(`inativarVoluntario('${vol.id}', 'Pediu para sair do programa')`);
    assert.equal(doc('voluntarios', vol.id).situacao, 'INATIVO');
    assert.match(await erroDe(`inativarVoluntario('${vol.id}', 'Pediu para sair do programa')`), /já está inativo/);
    entrar('FUNC_PORTARIA', 'por1');
    assert.match(await erroDe(`registrarEntradaVoluntario('${vol.id}')`), /está inativo/);
    entrar('FUNC_VOLUNTARIADO', 'vol1');
    await call(`reativarVoluntario('${vol.id}')`);
    assert.equal(doc('voluntarios', vol.id).situacao, 'ATIVO');
    assert.match(await erroDe("registrarEntradaVoluntario('nao_existe')"), /Voluntário não encontrado/);
});

test('horas de voluntariado: soma só as presenças encerradas do período, por voluntário', () => {
    const t = (h, min = 0, d = 10) => new Date(2026, 5, d, h, min).toISOString();
    dados('__p', [
        { voluntario_id: 'v1', voluntario_nome: 'Carla', area: 'ACOLHIMENTO', dia: '2026-06-10', status: 'ENCERRADA', entrada_em: t(8), saida_em: t(11, 30) },
        { voluntario_id: 'v1', voluntario_nome: 'Carla', area: 'ACOLHIMENTO', dia: '2026-06-11', status: 'ENCERRADA', entrada_em: t(8, 0, 11), saida_em: t(10, 0, 11) },
        { voluntario_id: 'v2', voluntario_nome: 'Bruno', area: 'ARTE_MUSICA', dia: '2026-06-10', status: 'ENCERRADA', entrada_em: t(14), saida_em: t(15) },
        { voluntario_id: 'v2', voluntario_nome: 'Bruno', area: 'ARTE_MUSICA', dia: '2026-06-10', status: 'ABERTA', entrada_em: t(16), saida_em: '' },
        { voluntario_id: 'v1', voluntario_nome: 'Carla', area: 'ACOLHIMENTO', dia: '2026-05-01', status: 'ENCERRADA', entrada_em: t(8, 0, 1), saida_em: t(9, 0, 1) }
    ]);
    const h = val("horasDosVoluntarios(__p, '2026-06-01', '2026-06-30')");
    assert.deepEqual(h.map(x => [x.nome, x.minutos, x.presencas]), [['Carla', 330, 2], ['Bruno', 60, 1]]);
    assert.equal(call('formatarMinutos(330)'), '5 h 30 min');
    assert.equal(call('formatarMinutos(60)'), '1 h 00 min');
});

// ============ Tipo de alta (pendência 38) ============

test('tipo de alta: da lista; transferência pede o destino; pedido, evasão e outro pedem a observação; óbito não é alta', () => {
    const v = (f) => { dados('__f', f); return val('validarAlta(__f)'); };
    assert.deepEqual(v({ tipo_alta: 'MELHORADA' }), { tipo_alta: 'MELHORADA', alta_destino: '', alta_observacao: '' });
    assert.equal(v({ tipo_alta: 'CURADO', observacao: ' bem ' }).alta_observacao, 'bem');
    assert.match(v({}), /Escolha o tipo de alta/);
    assert.match(v({ tipo_alta: 'QUALQUER' }), /Escolha o tipo de alta/);
    assert.match(v(null), /Escolha o tipo de alta/);
    assert.match(v({ tipo_alta: 'OBITO' }), /óbito é registrado pela tela Óbitos/);
    assert.match(v({ tipo_alta: 'TRANSFERENCIA_EXTERNA' }), /serviço de destino/);
    assert.deepEqual(v({ tipo_alta: 'TRANSFERENCIA_EXTERNA', destino: 'Hospital de Referência' }), { tipo_alta: 'TRANSFERENCIA_EXTERNA', alta_destino: 'Hospital de Referência', alta_observacao: '' });
    assert.equal(v({ tipo_alta: 'MELHORADA', destino: 'Não vale aqui' }).alta_destino, '');   // destino só vale na transferência
    ['A_PEDIDO', 'EVASAO', 'OUTRO'].forEach(t => {
        assert.match(v({ tipo_alta: t }), /observação \(mínimo de 5/, t);
        assert.equal(v({ tipo_alta: t, observacao: 'Família solicitou a saída' }).tipo_alta, t);
    });
    assert.match(v({ tipo_alta: 'MELHORADA', observacao: 'x'.repeat(201) }), /no máximo 200/);
});

test('dar alta exige o tipo; grava na internação e libera o leito para higienização', async () => {
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enf. Teste');
    guardar('leitos_estado', { id: 'l1', status: 'OCUPADO', internacao_id: 'int1', paciente_id: 'p1' });
    guardar('internacao_ativa', { id: 'p1', ativa: true, internacao_id: 'int1' });
    assert.match(await erroDe("darAltaInternacao('int1')"), /Escolha o tipo de alta/);
    assert.match(await erroDe("darAltaInternacao('int1', { tipo_alta: 'OBITO' })"), /tela Óbitos/);
    assert.equal(doc('internacoes', 'int1').status, 'ATIVA');   // as recusadas não encerram nada
    entrar('MEDICO', 'med1');
    assert.match(await erroDe("darAltaInternacao('int1', { tipo_alta: 'MELHORADA' })"), /Acesso negado/);
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enf. Teste');
    await call("darAltaInternacao('int1', { tipo_alta: 'TRANSFERENCIA_EXTERNA', destino: 'Hospital de Referência', observacao: 'Vaga confirmada' })");
    const i = doc('internacoes', 'int1');
    assert.deepEqual([i.status, i.tipo_alta, i.alta_destino, i.alta_observacao, i.alta_por], ['ALTA', 'TRANSFERENCIA_EXTERNA', 'Hospital de Referência', 'Vaga confirmada', 'enf1']);
    assert.equal(doc('leitos_estado', 'l1').status, 'HIGIENIZACAO');
    assert.equal(doc('internacao_ativa', 'p1').ativa, false);
    assert.ok(!doc('internacao_ativa', 'p1').obito);   // alta comum não trava nova internação
    assert.ok(auditoria.some(a => a.entidade === 'internacao' && a.acao === 'ALTA' && a.depois.tipo_alta === 'TRANSFERENCIA_EXTERNA'));
});

// ============ Óbitos ============

test('óbito: nº da DO, causa pelo CID, registro no conselho, horário e local; internação ativa só no local Internação', () => {
    const v = (f, i = null) => { dados('__f', f); dados('__i', i); return val('validarObito(__f, { internacao: __i, agora: new Date(__agora) })'); };
    const int = { id: 'i', status: 'ATIVA', data_hora_internacao: em(8, 0, 8) };
    const base = { local: 'INTERNACAO', data_hora_obito: em(11), cid_causa: ' i46.9 ', numero_do: ' 12345678-9 ', registro_conselho: 'CRM-TO 111', observacao: '' };
    const ok = v(base, int);
    assert.deepEqual([ok.local, ok.cid_causa, ok.numero_do, ok.registro_conselho], ['INTERNACAO', 'I46.9', '12345678-9', 'CRM-TO 111']);
    assert.equal(v({ ...base, cid_causa: '', numero_do: '' }, int).numero_do, '');   // a DO pode ser informada depois
    assert.match(v(base, null), /exige um paciente com internação ativa/);
    assert.match(v(base, { ...int, status: 'ALTA' }), /exige um paciente com internação ativa/);
    assert.match(v({ ...base, local: 'EMERGENCIA' }), /Selecione o paciente/);
    assert.equal(v({ ...base, local: 'EMERGENCIA', paciente_id: 'p2' }).local, 'EMERGENCIA');
    assert.match(v({ ...base, local: 'CASA' }, int), /Local do óbito: escolha/);
    assert.match(v({ ...base, data_hora_obito: em(13) }, int), /não pode estar no futuro/);
    assert.match(v({ ...base, data_hora_obito: em(12, 0, 6) }, int), /anterior ao limite/);
    assert.match(v({ ...base, data_hora_obito: em(7, 0, 8) }, int), /anterior à internação/);
    assert.match(v({ ...base, cid_causa: 'XYZ' }, int), /CID-10 em formato inválido/);
    assert.match(v({ ...base, numero_do: 'a b' }, int), /3 a 20 letras, números ou hífen/);
    assert.match(v({ ...base, registro_conselho: '' }, int), /registro no conselho/);
});

test('registrar óbito na internação: só o médico; encerra a internação, libera o leito e trava nova internação, tudo junto', async () => {
    guardar('pacientes', { id: 'pA', nome: 'Paciente de Teste A', prontuario: '2001', ativo: true });
    guardar('internacoes', { id: 'intA', paciente_id: 'pA', paciente_nome: 'Paciente de Teste A', prontuario: '2001', leito_id: 'lA', status: 'ATIVA', data_hora_internacao: new Date(Date.now() - 2 * 86400000).toISOString() });
    guardar('leitos_estado', { id: 'lA', status: 'OCUPADO', internacao_id: 'intA', paciente_id: 'pA' });
    guardar('internacao_ativa', { id: 'pA', ativa: true, internacao_id: 'intA' });
    const form = (extra = '') => `{ local: 'INTERNACAO', internacao_id: 'intA', data_hora_obito: '${new Date(Date.now() - 6 * 3600000).toISOString()}', cid_causa: 'I46.9', numero_do: '', registro_conselho: 'CRM-TO 111', observacao: ''${extra} }`;
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enf. Teste');
    assert.match(await erroDe(`registrarObito(${form()})`), /Acesso negado/);   // a constatação é do médico
    entrar('FUNC_RECEPCAO', 'rec1');
    assert.match(await erroDe(`registrarObito(${form()})`), /Acesso negado/);
    entrar('MEDICO', 'med1', 'Dra. Teste');
    assert.match(await erroDe(`registrarObito(${form().replace("registro_conselho: 'CRM-TO 111'", "registro_conselho: ''")})`), /registro no conselho/);
    assert.match(await erroDe(`registrarObito(${form().replace('intA', 'nao_existe')})`), /não está mais ativa/);
    assert.equal(doc('internacoes', 'intA').status, 'ATIVA');   // as recusadas não encerram nada
    const o = await aj(`registrarObito(${form()})`);
    assert.deepEqual([o.protocolo, o.status, o.paciente_nome, o.leito_id, o.internacao_id, o.registrado_por, o.comunicacao, o.liberacao], ['OB00001', 'REGISTRADO', 'Paciente de Teste A', 'lA', 'intA', 'med1', null, null]);
    const i = doc('internacoes', 'intA');
    assert.deepEqual([i.status, i.tipo_alta, i.obito_id, i.alta_por, i.data_hora_alta], ['ALTA', 'OBITO', o.id, 'med1', o.data_hora_obito]);
    assert.deepEqual([doc('leitos_estado', 'lA').status, doc('leitos_estado', 'lA').motivo], ['HIGIENIZACAO', 'Óbito do paciente']);
    assert.deepEqual(doc('internacao_ativa', 'pA'), { id: 'pA', ativa: false, internacao_id: 'intA', obito: true });
    assert.deepEqual(doc('obito_paciente', 'pA'), { id: 'pA', obito_id: o.id });
    assert.match(await erroDe(`registrarObito(${form()})`), /não está mais ativa/);   // a internação já foi encerrada
    assert.equal(doc('cad_contadores', 'obito').ultimo, 1);
    assert.ok(auditoria.some(a => a.entidade === 'obito' && a.acao === 'REGISTRAR' && a.depois.protocolo === 'OB00001'));
    assert.ok(auditoria.some(a => a.entidade === 'internacao' && a.acao === 'ALTA' && a.depois.tipo_alta === 'OBITO'));
    // o paciente com óbito não pode ser internado de novo (a trava de internação recusa)
    const tentativa = `db_internarAtomico({ internacao: { id: 'intNova', paciente_id: 'pA', leito_id: 'lB' }, leitoNovo: { id: 'lB', status: 'OCUPADO' } })`;
    assert.match(await erroDe(tentativa), /óbito registrado e não pode ser internado/);
    assert.equal(doc('internacoes', 'intNova'), undefined);
    // uma alta comum não "ressuscita" a trava: o lock continua marcado
    assert.equal(doc('internacao_ativa', 'pA').obito, true);
});

test('óbito fora da internação: exige o paciente cadastrado; recusa quem tem internação ativa e quem já tem óbito', async () => {
    const f = (id, extra = '') => `{ local: 'EMERGENCIA', paciente_id: '${id}', data_hora_obito: '${new Date(Date.now() - 6 * 3600000).toISOString()}', cid_causa: '', numero_do: '77-1', registro_conselho: 'CRM-TO 111', observacao: ''${extra} }`;
    entrar('MEDICO', 'med1', 'Dra. Teste');
    assert.match(await erroDe(`registrarObito(${f('nao_existe')})`), /Paciente não encontrado/);
    guardar('internacao_ativa', { id: 'p2', ativa: true, internacao_id: 'int2x' });
    assert.match(await erroDe(`registrarObito(${f('p2')})`), /tem internação ativa: registre o óbito pela internação/);
    guardar('pacientes', { id: 'pE', nome: 'Paciente de Teste E', prontuario: '3001', ativo: true });
    const o = await aj(`registrarObito(${f('pE')})`);
    assert.deepEqual([o.protocolo, o.local, o.internacao_id, o.leito_id, o.numero_do, o.paciente_nome], ['OB00002', 'EMERGENCIA', '', '', '77-1', 'Paciente de Teste E']);
    assert.deepEqual(doc('internacao_ativa', 'pE'), { id: 'pE', ativa: false, internacao_id: '', obito: true });
    assert.match(await erroDe(`registrarObito(${f('pE')})`), /já tem óbito registrado/);
    assert.equal(Object.keys(banco.store.obitos).length, 2);
});

test('rito do óbito: comunicação e liberação do corpo uma vez cada, na ordem que ocorrerem; nº da DO só muda com motivo', async () => {
    const o1 = Object.values(banco.store.obitos).find(o => o.protocolo === 'OB00001');
    const hora = (minutosDepois) => new Date(new Date(o1.data_hora_obito).getTime() + minutosDepois * 60000).toISOString();
    entrar('FUNC_RECEPCAO', 'rec1');
    assert.match(await erroDe(`registrarComunicacaoObito('${o1.id}', { comunicado_a: 'Filho' })`), /Acesso negado/);
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enf. Teste');
    const com = (extra) => `{ em: '${hora(10)}', comunicado_a: 'Fulano de Teste', parentesco: 'Filho'${extra || ''} }`;
    assert.match(await erroDe(`registrarComunicacaoObito('${o1.id}', { ...${com()}, comunicado_a: 'ab' })`), /Comunicado a \(nome\): mínimo de 3/);
    assert.match(await erroDe(`registrarComunicacaoObito('${o1.id}', { ...${com()}, em: '${hora(-30)}' })`), /não pode ser anterior ao óbito/);
    const c = await aj(`registrarComunicacaoObito('${o1.id}', ${com()})`);
    assert.deepEqual([c.status, c.comunicacao.comunicado_a, c.comunicacao.por, c.liberacao], ['FAMILIA_COMUNICADA', 'Fulano de Teste', 'enf1', null]);
    assert.match(await erroDe(`registrarComunicacaoObito('${o1.id}', ${com()})`), /já foi registrado/);
    // liberação do corpo
    const lib = (extra) => `{ em: '${hora(120)}', destino: 'FAMILIA_FUNERARIA', recebedor: 'Beltrano de Teste'${extra || ''} }`;
    assert.match(await erroDe(`liberarCorpoObito('${o1.id}', { ...${lib()}, destino: 'CASA' })`), /Destino do corpo: escolha/);
    assert.match(await erroDe(`liberarCorpoObito('${o1.id}', { ...${lib()}, recebedor: '' })`), /Quem recebeu o corpo/);
    assert.match(await erroDe(`liberarCorpoObito('${o1.id}', { ...${lib()}, em: '${hora(-5)}' })`), /não pode ser anterior ao óbito/);
    const l = await aj(`liberarCorpoObito('${o1.id}', ${lib()})`);
    assert.deepEqual([l.status, l.liberacao.destino, l.liberacao.recebedor, l.comunicacao.comunicado_a], ['CORPO_LIBERADO', 'FAMILIA_FUNERARIA', 'Beltrano de Teste', 'Fulano de Teste']);
    assert.match(await erroDe(`liberarCorpoObito('${o1.id}', ${lib()})`), /já foi registrado/);
    assert.deepEqual(l.historico.map(h => h.status), ['REGISTRADO', 'FAMILIA_COMUNICADA', 'CORPO_LIBERADO']);
    // liberação sem comunicação prévia também vale (ex.: caso encaminhado ao IML); a situação mais avançada vence
    const o2 = Object.values(banco.store.obitos).find(o => o.protocolo === 'OB00002');
    const em2 = new Date(new Date(o2.data_hora_obito).getTime() + 3600000).toISOString();
    // liberar ao IML exige o encaminhamento do médico registrado antes (#68)
    assert.match(await erroDe(`liberarCorpoObito('${o2.id}', { em: '${em2}', destino: 'IML', recebedor: 'Agente do IML' })`), /registrar antes o encaminhamento ao IML/);
    entrar('MEDICO', 'med1', 'Dra. Teste');
    await aj(`registrarEncaminhamentoObito('${o2.id}', { em: '${em2}', destino: 'IML', motivo: 'Morte sem causa esclarecida', registro_conselho: 'CRM 123' })`);
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enf. Teste');
    const l2 = await aj(`liberarCorpoObito('${o2.id}', { em: '${em2}', destino: 'IML', recebedor: 'Agente do IML' })`);
    assert.deepEqual([l2.status, l2.comunicacao], ['CORPO_LIBERADO', null]);
    // nº da DO: o médico informa; trocar um número já informado exige motivo
    entrar('FUNC_ENFERMAGEM', 'enf1');
    assert.match(await erroDe(`registrarNumeroDoObito('${o1.id}', '99999')`), /Acesso negado/);
    entrar('MEDICO', 'med1', 'Dra. Teste');
    assert.match(await erroDe(`registrarNumeroDoObito('${o1.id}', '')`), /Informe o número da Declaração de Óbito/);
    assert.match(await erroDe(`registrarNumeroDoObito('${o1.id}', 'a b')`), /3 a 20 letras/);
    const d1 = await aj(`registrarNumeroDoObito('${o1.id}', ' 55443322-1 ')`);   // primeira vez: sem motivo
    assert.deepEqual([d1.numero_do, d1.retificacoes.length], ['55443322-1', 0]);
    assert.match(await erroDe(`registrarNumeroDoObito('${o1.id}', '55443322-1')`), /já é o número informado/);
    assert.match(await erroDe(`registrarNumeroDoObito('${o1.id}', '55443322-2')`), /Motivo da retificação: informe/);
    const d2 = await aj(`registrarNumeroDoObito('${o1.id}', '55443322-2', 'Erro de digitação do último dígito')`);
    assert.deepEqual([d2.numero_do, d2.retificacoes.length, d2.retificacoes[0].de, d2.retificacoes[0].para], ['55443322-2', 1, '55443322-1', '55443322-2']);
    assert.equal(d2.status, 'CORPO_LIBERADO');   // retificar o número não mexe na situação
    assert.match(await erroDe("registrarNumeroDoObito('nao_existe', '123456')"), /não encontrado/);
    assert.ok(auditoria.some(a => a.entidade === 'obito' && a.acao === 'RETIFICAR_DO' && a.antes.numero_do === '55443322-1'));
});

test('óbito (#68): encaminhamento ao IML/SVO e hemovigilância são do médico, uma vez cada, e geram a guia interna', async () => {
    const o = Object.values(banco.store.obitos).find(x => x.protocolo === 'OB00001');
    const hora = (m) => new Date(new Date(o.data_hora_obito).getTime() + m * 60000).toISOString();
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enf. Teste');
    assert.match(await erroDe(`registrarEncaminhamentoObito('${o.id}', { em: '${hora(30)}', destino: 'SVO', motivo: 'Causa a esclarecer', registro_conselho: 'CRM 1' })`), /Acesso negado/);
    assert.match(await erroDe(`registrarHemovigilanciaObito('${o.id}', { situacao: 'NAO_APLICAVEL', motivo: 'Sem transfusão' })`), /Acesso negado/);
    entrar('MEDICO', 'med1', 'Dra. Teste');
    const enc = (extra) => `{ em: '${hora(30)}', destino: 'SVO', motivo: 'Causa a esclarecer', registro_conselho: 'CRM 1'${extra || ''} }`;
    assert.match(await erroDe(`registrarEncaminhamentoObito('${o.id}', { ...${enc()}, destino: 'CASA' })`), /Encaminhar para: escolha/);
    assert.match(await erroDe(`registrarEncaminhamentoObito('${o.id}', { ...${enc()}, motivo: 'ab' })`), /Motivo do encaminhamento/);
    assert.match(await erroDe(`registrarEncaminhamentoObito('${o.id}', { ...${enc()}, em: '${hora(-10)}' })`), /não pode ser anterior ao óbito/);
    const r = await aj(`registrarEncaminhamentoObito('${o.id}', ${enc()})`);
    assert.deepEqual([r.encaminhamento.destino, r.encaminhamento.por, r.status], ['SVO', 'med1', 'CORPO_LIBERADO']);   // não muda a situação do rito
    assert.match(await erroDe(`registrarEncaminhamentoObito('${o.id}', ${enc()})`), /já foi registrado/);
    // hemovigilância: comunicada (com a quem) ou "não se aplica" (com motivo)
    assert.match(await erroDe(`registrarHemovigilanciaObito('${o.id}', { situacao: 'NAO_APLICAVEL', motivo: 'x' })`), /Motivo/);
    assert.match(await erroDe(`registrarHemovigilanciaObito('${o.id}', { situacao: 'COMUNICADA', em: '${hora(60)}', comunicado_a: '' })`), /Comunicado a/);
    const h = await aj(`registrarHemovigilanciaObito('${o.id}', { situacao: 'COMUNICADA', em: '${hora(60)}', comunicado_a: 'Agência transfusional' })`);
    assert.deepEqual([h.hemovigilancia.situacao, h.hemovigilancia.comunicado_a], ['COMUNICADA', 'Agência transfusional']);
    assert.match(await erroDe(`registrarHemovigilanciaObito('${o.id}', { situacao: 'NAO_APLICAVEL', motivo: 'Sem transfusão' })`), /já foi registrado/);
    // documentos internos: dizem que não substituem a DO e a guia exige o encaminhamento
    dados('__o', h);
    const guia = val(`documentoInternoObito(__o, 'GUIA_ENCAMINHAMENTO', { hospital: 'Hospital X' })`);
    assert.match(guia.aviso, /não substitui a Declaração de Óbito oficial/i);
    assert.ok(guia.linhas.some(([k, v]) => k === 'Encaminhado para' && /SVO/.test(v)));
    const ficha = val(`documentoInternoObito(__o, 'FICHA')`);
    assert.ok(ficha.linhas.some(([k]) => k === 'Hemovigilância'));
    dados('__sem', { ...h, encaminhamento: null });
    assert.throws(() => call(`documentoInternoObito(__sem, 'GUIA_ENCAMINHAMENTO')`), /encaminhamento/);
    // agenda e cirurgia recusam paciente com óbito
    entrar('FUNC_RECEPCAO', 'rec1', 'Recepcionista');
    assert.match(await erroDe(`agendarConsulta({ paciente_id: '${o.paciente_id}', especialidade_id: 'esp1', data: '2099-01-01', hora: '09:00' })`), /óbito registrado/);
});

test('indicadores de óbitos: contagens, pendências do rito e horas até a liberação, sem nomes', () => {
    const t = (h, d = 10) => new Date(2026, 5, d, h).toISOString();
    dados('__o', [
        { dia: '2026-06-10', local: 'INTERNACAO', status: 'CORPO_LIBERADO', numero_do: '1', comunicacao: { em: t(10) }, liberacao: { em: t(14) }, data_hora_obito: t(9) },
        { dia: '2026-06-10', local: 'EMERGENCIA', status: 'REGISTRADO', numero_do: '', comunicacao: null, liberacao: null, data_hora_obito: t(9) },
        { dia: '2026-06-11', local: 'INTERNACAO', status: 'FAMILIA_COMUNICADA', numero_do: '3', comunicacao: { em: t(10, 11) }, liberacao: null, data_hora_obito: t(9, 11) },
        { dia: '2026-05-01', local: 'INTERNACAO', status: 'REGISTRADO', numero_do: '', comunicacao: null, liberacao: null, data_hora_obito: t(9, 1) }
    ]);
    const r = val("indicadoresObitos(__o, '2026-06-10', '2026-06-11')");
    assert.deepEqual([r.total, r.sem_numero_do, r.sem_comunicacao, r.sem_liberacao, r.horas_ate_liberar], [3, 1, 1, 2, 5]);
    assert.deepEqual(r.por_local, { INTERNACAO: 2, EMERGENCIA: 1 });
    assert.equal(val('indicadoresObitos([], "", "")').horas_ate_liberar, null);
    assert.equal(call("situacaoDoObito({ liberacao: {}, comunicacao: null })"), 'CORPO_LIBERADO');
    assert.equal(call("situacaoDoObito({ liberacao: null, comunicacao: {} })"), 'FAMILIA_COMUNICADA');
    assert.equal(call("situacaoDoObito({ liberacao: null, comunicacao: null })"), 'REGISTRADO');
});

// ============ Relatórios de apoio e tipo de alta ============

test('relatórios de apoio: manutenção, transporte, rouparia, resíduos e voluntariado, sem nome de paciente', () => {
    const rel = (c) => JSON.parse(JSON.stringify(call(c)));
    const os = rel(`relatorioManutencaoTela([
        { id: 'a', protocolo: 'OS-1', dia: '2026-06-10', tipo: 'CORRETIVA', prioridade: 'ALTA', equipamento_nome: 'Monitor', patrimonio: 'P1', status: 'CONCLUIDA', criado_em: '2026-06-10T10:00:00.000Z', iniciado_em: '2026-06-10T11:00:00.000Z', concluido_em: '2026-06-10T14:00:00.000Z' },
        { id: 'b', protocolo: 'OS-2', dia: '2026-06-10', tipo: 'INFRAESTRUTURA', prioridade: 'NORMAL', local: 'Sala 3', status: 'ABERTA', criado_em: '2026-06-10T12:00:00.000Z' }], '2026-06-01', '2026-06-30')`);
    assert.equal(os.linhas.length, 2);
    assert.equal(os.linhas.find(l => l.protocolo === 'OS-1').horas, '4');
    assert.equal(os.resumo.find(x => x.rot === 'Em aberto agora').valor, 1);
    const tr = rel(`relatorioTransporteTela([{ id: 't', protocolo: 'TR-1', dia: '2026-06-10', tipo: 'PACIENTE_INTERNO', origem: 'UTI', destino: 'Raio-X', paciente_nome: 'Fulano', status: 'CONCLUIDO', criado_em: '2026-06-10T10:00:00.000Z' }], '', '')`);
    assert.equal(tr.linhas.length, 1);
    assert.ok(!JSON.stringify(tr).includes('Fulano'));
    const rp = rel(`relatorioRoupariaTela([{ id: 'r1', dia: '2026-06-10', tipo: 'COLETA_SUJA', setor: 'UTI', peca: 'LENCOL', peca_rotulo: 'Lençol', quantidade: 10, peso_kg: 5 }, { id: 'r2', dia: '2026-06-10', tipo: 'ENTREGA_LIMPA', setor: 'UTI', peca: 'LENCOL', peca_rotulo: 'Lençol', quantidade: 8, peso_kg: 4 }], '', '')`);
    assert.equal(rp.linhas[0].diferenca, 2);
    const rs = rel(`relatorioResiduosTela([{ id: 'x', dia: '2026-06-10', grupo: 'A', setor: 'UTI', peso_kg: 3.5 }, { id: 'y', dia: '2026-06-10', grupo: 'D', setor: 'UTI', peso_kg: 1 }], '', '')`);
    assert.equal(rs.linhas[0].total, '4,5');
    const vl = rel(`relatorioVoluntariadoTela([{ id: 'p', voluntario_id: 'v', voluntario_nome: 'Voluntário Teste', area: 'ACOLHIMENTO', dia: '2026-06-10', status: 'ENCERRADA', entrada_em: '2026-06-10T10:00:00.000Z', saida_em: '2026-06-10T13:30:00.000Z' }], '', '')`);
    assert.equal(vl.linhas[0].horas, '3 h 30 min');
});

test('relatório de internações conta os tipos de alta', () => {
    const r = JSON.parse(JSON.stringify(call(`relatorioInternacoes([
        { id: 'i1', status: 'ALTA', tipo_alta: 'MELHORADA', data_hora_internacao: '2026-06-08T10:00:00.000Z', data_hora_alta: '2026-06-10T10:00:00.000Z', setor_origem: 'Emergência' },
        { id: 'i2', status: 'ALTA', tipo_alta: 'OBITO', data_hora_internacao: '2026-06-08T10:00:00.000Z', data_hora_alta: '2026-06-10T11:00:00.000Z', setor_origem: 'Emergência' }], '2026-06-01', '2026-06-30')`)));
    assert.equal(r.resumo.find(x => x.rot === 'Saídas: Óbito').valor, 1);
    assert.equal(r.resumo.find(x => x.rot === 'Saídas: Alta melhorada').valor, 1);
});

test('processo de enfermagem e curativos (#46): só a enfermagem, só internação ativa, livro de criação com anulação', async () => {
    guardar('internacoes', { id: 'intE', paciente_id: 'pE', paciente_nome: 'Paciente de Teste E', prontuario: '2005', leito_id: 'lE', status: 'ATIVA' });
    const proc = (extra = '') => `{ etapa: 'AVALIACAO', texto: 'Paciente colaborativo, sem queixas.', registro_conselho: 'COREN 55'${extra} }`;
    entrar('FUNC_RECEPCAO', 'rec1');
    assert.match(await erroDe(`registrarProcessoEnfermagem('intE', ${proc()})`), /Acesso negado/);
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enf. Teste');
    assert.match(await erroDe(`registrarProcessoEnfermagem('nada', ${proc()})`), /não tem internação ativa/);
    assert.match(await erroDe(`registrarProcessoEnfermagem('intE', { ...${proc()}, etapa: 'XX' })`), /Etapa/);
    assert.match(await erroDe(`registrarProcessoEnfermagem('intE', { ...${proc()}, texto: 'curto' })`), /Registro: mínimo de 10/);
    const p = await aj(`registrarProcessoEnfermagem('intE', ${proc()})`);
    assert.deepEqual([p.etapa, p.paciente_id, p.por], ['AVALIACAO', 'pE', 'enf1']);
    const c = await aj(`registrarCurativo('intE', { local: 'Região sacral', material: 'Cobertura de espuma', aspecto: 'LIMPO', registro_conselho: 'COREN 55' })`);
    assert.equal(c.local, 'Região sacral');
    assert.match(await erroDe(`registrarCurativo('intE', { local: 'Braço', material: 'Gaze', aspecto: 'OUTRO', registro_conselho: 'COREN 55' })`), /Descrição do aspecto/);
    await aj(`anularProcessoEnfermagem('${p.id}', 'Registrado no paciente errado')`);
    assert.match(await erroDe(`anularProcessoEnfermagem('${p.id}', 'Registrado no paciente errado')`), /já foi anulado/);
    assert.equal(doc('processo_enfermagem', p.id).etapa, 'AVALIACAO');   // o original não muda
});

test('enfermagem: resumo do período conta só o que está no período e sem anuladas; dimensionamento usa só o que foi informado', () => {
    dados('__r', { sinais: [{ dia: '2026-06-10', por_nome: 'Ana' }, { dia: '2026-07-01', por_nome: 'Ana' }],
        processo: [{ id: 'a', dia: '2026-06-10', etapa: 'COLETA', por_nome: 'Ana' }, { id: 'b', dia: '2026-06-11', etapa: 'COLETA', por_nome: 'Bia' }, { id: 'anul_b', tipo: 'ANULACAO', anula_id: 'b', dia: '2026-06-11' }],
        curativos: [{ id: 'c', dia: '2026-06-12', por_nome: 'Bia' }], checagens: [{ dia: '2026-06-10', status: 'FEITO' }, { dia: '2026-06-10', status: 'NAO_FEITO' }, { dia: '2026-08-01', status: 'FEITO' }] });
    const r = JSON.parse(JSON.stringify(call("resumoEnfermagemPeriodo(__r, '2026-06-01', '2026-06-30')")));
    assert.deepEqual([r.sinais, r.processo, r.curativos, r.checagens.feitas, r.checagens.nao_feitas], [1, 1, 1, 1, 1]);
    assert.deepEqual(r.por_etapa, { COLETA: 1 });
    assert.deepEqual(r.por_autor.Bia, { sinais: 0, processo: 0, curativos: 1 });
    const d = (extra) => JSON.stringify({ categorias: [{ nome: 'Cuidado A', pacientes: '10', horas: '6' }, { nome: 'Cuidado B', pacientes: '2', horas: '10' }], jornada_semanal: '36', indice_tecnico: '15', ...extra });
    const q = JSON.parse(JSON.stringify(call(`dimensionarEnfermagem(${d()})`)));
    assert.deepEqual([q.horas_dia, q.quadro_calculado, q.quadro_arredondado], [80, 17.89, 18]);   // 80 × 7 ÷ 36 × 1,15
    assert.throws(() => call(`dimensionarEnfermagem(${d({ jornada_semanal: '' })})`), /Jornada semanal/);
    assert.throws(() => call(`dimensionarEnfermagem(${d({ categorias: [] })})`), /ao menos uma categoria/);
    assert.throws(() => call(`dimensionarEnfermagem(${d({ indice_tecnico: '120' })})`), /Índice/);
});
