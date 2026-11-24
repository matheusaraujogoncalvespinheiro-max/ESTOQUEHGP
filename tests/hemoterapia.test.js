// Testes da Etapa 8: hemoterapia (solicitação do médico, bolsa da agência transfusional, transfusão à beira do leito). Executa com: npm test
// Só dados fictícios. O banco é um Firestore simulado em memória (nunca o real).
const test = require('node:test');
const assert = require('node:assert/strict');
const { criarAmbiente, semearBasico } = require('./helpers/clinico');

const amb = criarAmbiente();
const { call, j, dados, entrar, erroDe, doc, dia, banco, auditoria } = amb;
semearBasico(amb);

dados('__agora', new Date(2026, 5, 10, 12, 0, 0).toISOString());
const solForm = (extra = {}) => ({ hemocomponente: 'CH', quantidade: '2', urgencia: 'ROTINA', indicacao: 'Anemia sintomática, hemoglobina baixa', registro_conselho: 'CRM-TO 111', ...extra });
const internacaoAtiva = { id: 'int1', status: 'ATIVA' };
const erroSol = (form, internacao = internacaoAtiva) => {
    dados('__f', form); dados('__i', internacao);
    try { call('validarSolicitacaoTransfusao(__f, { internacao: __i, agora: new Date(__agora) })'); return null; } catch (e) { return e.message; }
};
const solAberta = (extra = {}) => ({ status: 'SOLICITADA', quantidade: 2, ativas: 0, ...extra });
const bolsaForm = (extra = {}) => ({ numero: 'bs-0001', grupo: 'O+', validade: '2026-07-01', conferido_por: 'Biomédica Teste', registro_conselho: 'CRBM 55', ...extra });
const erroBolsa = (form, sol = solAberta()) => {
    dados('__f', form); dados('__s', sol);
    try { return j("validarBolsa(__f, { solicitacao: __s, hoje: '2026-06-10' })"); } catch (e) { return e.message; }
};

// ============ Regras puras ============

test('solicitação de transfusão: internação ativa, hemocomponente, quantidade, urgência, indicação e assinatura', () => {
    assert.equal(erroSol(solForm()), null);
    assert.match(erroSol(solForm(), null), /internação ativa/);
    assert.match(erroSol(solForm(), { id: 'x', status: 'ENCERRADA' }), /internação ativa/);
    assert.match(erroSol(solForm({ hemocomponente: 'SANGUE' })), /Escolha o hemocomponente/);
    ['0', '11', '1,5', 'dois', ''].forEach(q => assert.match(erroSol(solForm({ quantidade: q })), /inteiro de unidades de 1 a 10/, `quantidade "${q}"`));
    assert.match(erroSol(solForm({ urgencia: 'JA' })), /Escolha a urgência/);
    assert.match(erroSol(solForm({ indicacao: 'anemia' })), /mínimo 10 letras/);
    assert.match(erroSol(solForm({ indicacao: 'x'.repeat(501) })), /no máximo 500/);
    assert.match(erroSol(solForm({ grupo_paciente: 'Z+' })), /Grupo ABO\/Rh inválido/);
    assert.equal(erroSol(solForm({ grupo_paciente: 'AB-' })), null);
    assert.match(erroSol(solForm({ registro_conselho: '' })), /registro no conselho/);
    assert.match(erroSol(solForm({ previsto_para: 'amanhã cedo' })), /inválidas/);
    assert.match(erroSol(solForm({ previsto_para: new Date(2026, 5, 10, 9, 0).toISOString() })), /no passado/);
    assert.equal(erroSol(solForm({ previsto_para: new Date(2026, 5, 10, 11, 30).toISOString() })), null);   // até 1 h de tolerância
    dados('__f', solForm({ quantidade: 3, indicacao: '  Hemorragia digestiva alta  ' })); dados('__i', internacaoAtiva);
    const v = j('validarSolicitacaoTransfusao(__f, { internacao: __i, agora: new Date(__agora) })');
    assert.deepEqual([v.hemocomponente_rotulo, v.quantidade, v.indicacao, v.previsto_para], ['Concentrado de hemácias', 3, 'Hemorragia digestiva alta', '']);
});

test('bolsa: número normalizado, grupo da lista, validade futura, compatibilidade conferida por alguém e unidades ainda livres', () => {
    const ok = erroBolsa(bolsaForm());
    assert.deepEqual([ok.numero, ok.grupo, ok.validade, ok.conferido_por], ['BS-0001', 'O+', '2026-07-01', 'Biomédica Teste']);
    assert.equal(erroBolsa(bolsaForm({ numero: ' bs 0002 ' })).numero, 'BS0002');   // maiúsculas e sem espaços: o mesmo número não entra duas vezes por digitação diferente
    assert.match(erroBolsa(bolsaForm({ numero: 'a' })), /Número da bolsa/);
    assert.match(erroBolsa(bolsaForm({ numero: 'bolsa #1' })), /Número da bolsa/);
    assert.match(erroBolsa(bolsaForm({ grupo: 'C+' })), /grupo ABO\/Rh/);
    assert.match(erroBolsa(bolsaForm({ validade: '' })), /validade da bolsa/);
    assert.match(erroBolsa(bolsaForm({ validade: '2026-06-09' })), /Bolsa vencida/);
    assert.equal(erroBolsa(bolsaForm({ validade: '2026-06-10' })).validade, '2026-06-10');
    assert.match(erroBolsa(bolsaForm({ conferido_por: '' })), /quem conferiu a compatibilidade/);
    assert.match(erroBolsa(bolsaForm({ registro_conselho: '' })), /registro no conselho/);
    assert.match(erroBolsa(bolsaForm(), solAberta({ ativas: 2 })), /Todas as 2 unidade\(s\)/);
    assert.match(erroBolsa(bolsaForm(), solAberta({ status: 'CONCLUIDA' })), /não está aberta/);
    assert.match(erroBolsa(bolsaForm(), solAberta({ status: 'CANCELADA' })), /não está aberta/);
    assert.match(erroBolsa(bolsaForm(), null), /não está aberta/);
});

test('início da transfusão: sinais antes, segundo profissional diferente de quem transfunde e registro no conselho', () => {
    const val = (f, u = { username: 'enf1', name: 'Enfermeira Teste' }) => { dados('__f', f); dados('__u', u); try { return j('validarInicioTransfusao(__f, __u)'); } catch (e) { return e.message; } };
    const ok = { fc: '80', spo2: '97', conferido_por: 'Téc. Segundo Profissional', registro_conselho: 'COREN-TO 9' };
    assert.equal(val(ok).conferido_por, 'Téc. Segundo Profissional');
    assert.match(val({ ...ok, fc: '', spo2: '' }), /ao menos um sinal vital/);
    assert.equal(val({ nao_aferido: true, motivo_nao_aferido: 'Paciente agitado', conferido_por: 'Téc. Segundo', registro_conselho: 'COREN-TO 9' }).sinais.aferido, false);
    assert.match(val({ ...ok, conferido_por: '' }), /segundo profissional/);
    assert.match(val({ ...ok, conferido_por: 'enfermeira teste' }), /outro profissional/);   // mesmo nome, sem diferenciar caixa
    assert.match(val({ ...ok, conferido_por: 'ENF1' }), /outro profissional/);   // mesmo usuário
    assert.match(val({ ...ok, registro_conselho: '' }), /registro no conselho/);
});

test('conclusão e interrupção: reação respondida (Sim exige descrição); interrupção exige motivo', () => {
    const conc = (f) => { dados('__f', f); try { return j('validarConclusaoTransfusao(__f)'); } catch (e) { return e.message; } };
    assert.match(conc({ fc: '80' }), /houve reação transfusional/);
    assert.match(conc({ fc: '80', reacao: 'TALVEZ' }), /houve reação transfusional/);
    assert.match(conc({ reacao: 'NAO' }), /ao menos um sinal vital/);
    assert.deepEqual([conc({ fc: '80', reacao: 'NAO', descricao_reacao: 'ignorada' }).reacao, conc({ fc: '80', reacao: 'NAO', descricao_reacao: 'ignorada' }).descricao_reacao], ['NAO', '']);
    assert.match(conc({ fc: '80', reacao: 'SIM', descricao_reacao: 'febre' }), /mínimo 10 letras/);
    assert.equal(conc({ fc: '80', reacao: 'SIM', descricao_reacao: 'Febre e calafrios após 15 minutos' }).reacao, 'SIM');
    const int = (f) => { dados('__f', f); try { return j('validarInterrupcaoTransfusao(__f)'); } catch (e) { return e.message; } };
    assert.match(int({}), /motivo de interromper/);
    assert.match(int({ motivo: 'Dor' }), /mínimo 5 letras/);
    assert.equal(int({ motivo: 'Paciente com febre' }).sinais, null);   // sinais são opcionais ao interromper
    assert.equal(int({ motivo: 'Paciente com febre', fc: '110' }).sinais.aferido, true);
    assert.match(int({ motivo: 'Paciente com febre', reacao: 'SIM', descricao_reacao: 'febre' }), /Descreva a reação/);
    assert.equal(int({ motivo: 'Paciente com febre', reacao: 'SIM', descricao_reacao: 'Febre alta e tremores' }).reacao, true);
});

test('resumo, progresso e relatório de hemoterapia', () => {
    assert.equal(call("progressoSolicitacao({ quantidade: 3, ativas: 2, transfundidas: 1 })"), '2 de 3 com bolsa · 1 transfundida(s)');
    dados('__s', [{ status: 'SOLICITADA', urgencia: 'URGENTE' }, { status: 'SOLICITADA', urgencia: 'ROTINA' }, { status: 'EM_ATENDIMENTO', urgencia: 'EXTREMA' }, { status: 'CONCLUIDA', urgencia: 'EXTREMA' }]);
    dados('__b', [
        { numero: 'A1', status: 'ENTREGUE', dia: '2026-06-10', paciente_nome: 'Ana', hemocomponente_rotulo: 'Concentrado de hemácias', reservada_em: '2026-06-10T08:00:00Z' },
        { numero: 'A2', status: 'EM_TRANSFUSAO', dia: '2026-06-10', paciente_nome: 'Bia', hemocomponente_rotulo: 'Plasma fresco congelado', reservada_em: '2026-06-10T09:00:00Z' },
        { numero: 'A3', status: 'TRANSFUNDIDA', fim_em: '2026-06-10T10:00:00Z', reacao: 'SIM', dia: '2026-06-10', paciente_nome: 'Caio', hemocomponente_rotulo: 'Concentrado de hemácias', reservada_em: '2026-06-10T07:00:00Z' },
        { numero: 'A4', status: 'TRANSFUNDIDA', fim_em: '2026-06-09T10:00:00Z', reacao: 'NAO', dia: '2026-06-09', paciente_nome: 'Davi', hemocomponente_rotulo: 'Concentrado de hemácias', reservada_em: '2026-06-09T07:00:00Z' },
        { numero: 'A5', status: 'DEVOLVIDA', dia: '2026-06-10', paciente_nome: 'Eva', hemocomponente_rotulo: 'Concentrado de plaquetas', reservada_em: '2026-06-10T06:00:00Z' },
        { numero: 'A6', status: 'DESCARTADA', dia: '2026-06-10', paciente_nome: 'Fábio', hemocomponente_rotulo: 'Crioprecipitado', reservada_em: '2026-06-10T05:00:00Z' },
        { numero: 'A7', status: 'INTERROMPIDA', reacao: 'SIM', dia: '2026-06-10', paciente_nome: 'Gil', hemocomponente_rotulo: 'Concentrado de hemácias', reservada_em: '2026-06-10T04:00:00Z' }
    ]);
    assert.deepEqual(j("resumoHemoterapia(__s, __b, '2026-06-10')"), { a_atender: 2, urgentes: 2, em_atendimento: 1, bolsas_na_unidade: 1, em_transfusao: 1, transfundidas_hoje: 1, reacoes: 2 });
    const r = j("relatorioHemoterapia(__b, '2026-06-10', '2026-06-10')");
    assert.equal(r.linhas.length, 6);
    assert.deepEqual(r.resumo, { bolsas: 6, transfundidas: 1, interrompidas: 1, devolvidas: 1, descartadas: 1, reacoes: 2 });
    assert.deepEqual(r.linhas.slice(0, 2).map(b => b.numero), ['A2', 'A1']);   // mais recente primeiro
    assert.equal(j("relatorioHemoterapia(__b, '', '', 'plaquetas')").linhas.length, 1);
});

test('permissões da hemoterapia: médico solicita, agência reserva, enfermagem transfunde; ninguém faz o papel do outro', () => {
    const pode = (role, acao) => { entrar(role); return call(`hasPermission('${acao}')`); };
    assert.equal(pode('MEDICO', 'hemoterapia_solicitar'), true);
    assert.equal(pode('MEDICO', 'hemoterapia_agencia'), false);
    assert.equal(pode('MEDICO', 'hemoterapia_transfundir'), false);
    assert.equal(pode('FUNC_HEMOTERAPIA', 'hemoterapia_agencia'), true);
    assert.equal(pode('FUNC_HEMOTERAPIA', 'hemoterapia_solicitar'), false);
    assert.equal(pode('FUNC_HEMOTERAPIA', 'hemoterapia_transfundir'), false);
    assert.equal(pode('FUNC_ENFERMAGEM', 'hemoterapia_transfundir'), true);
    assert.equal(pode('FUNC_ENFERMAGEM', 'hemoterapia_agencia'), false);
    assert.equal(pode('FUNC_ENFERMAGEM', 'hemoterapia_ver'), true);
    assert.equal(pode('FUNC_PORTARIA', 'hemoterapia_ver'), false);
});

// ============ Gravação: solicitação e bolsas ============

let s1; let s2;
const B1 = 'BS-0001'; const B2 = 'BS-0002'; const B3 = 'BS-0003'; const B4 = 'BS-0004';
const reservar = (id, numero, extra = {}) => { dados('__bf', bolsaForm({ numero, validade: dia(30), ...extra })); dados('__sid', id); return call('reservarBolsa(__sid, __bf)'); };
amb.ctx.reservar = reservar;   // para o erroDe("reservar(...)") avaliar dentro do contexto

test('solicitar: só médico, só internação ativa; protocolo sequencial e histórico', async () => {
    dados('__f', solForm());
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enfermeira');
    assert.match(await erroDe("solicitarTransfusao('int1', __f)"), /Acesso negado/);
    entrar('MEDICO', 'med1', 'Dr. Teste');
    assert.match(await erroDe("solicitarTransfusao('int2', __f)"), /não está mais ativa/);
    dados('__ruim', solForm({ indicacao: 'curta' }));
    assert.match(await erroDe("solicitarTransfusao('int1', __ruim)"), /mínimo 10 letras/);
    assert.equal(Object.keys(banco.store.solicitacoes_transfusao || {}).length, 0, 'recusa não grava nada nem consome número de protocolo');
    s1 = await call("solicitarTransfusao('int1', __f)");
    assert.deepEqual([s1.protocolo, s1.status, s1.ativas, s1.transfundidas, s1.paciente_nome, s1.quantidade], ['HT00001', 'SOLICITADA', 0, 0, 'Maria de Teste', 2]);
    dados('__g', solForm({ quantidade: '1', urgencia: 'URGENTE' }));
    s2 = await call("solicitarTransfusao('int1', __g)");
    assert.equal(s2.protocolo, 'HT00002');
    assert.equal(doc('cad_contadores', 'transfusao').ultimo, 2);
    assert.ok(auditoria.some(a => a.entidade === 'transfusao' && a.acao === 'SOLICITAR'));
});

test('reservar bolsa: só a agência; número nunca repetido; vencida e excedente recusados; a solicitação passa a "Em atendimento"', async () => {
    entrar('MEDICO', 'med1', 'Dr. Teste');
    assert.match(await erroDe(`reservar('${s1.id}', '${B1}')`), /Acesso negado/);
    entrar('FUNC_HEMOTERAPIA', 'hem1', 'Biomédica Agência');
    assert.match(await erroDe(`reservar('${s1.id}', '${B1}', { validade: '2020-01-01' })`), /Bolsa vencida/);
    assert.match(await erroDe(`reservar('${s1.id}', '${B1}', { conferido_por: '' })`), /quem conferiu a compatibilidade/);
    assert.match(await erroDe("reservar('nao_existe', 'BS-9999')"), /Solicitação não encontrada/);
    assert.equal(Object.keys(banco.store.bolsas_sangue || {}).length, 0);
    const b1 = await reservar(s1.id, B1);
    assert.deepEqual([b1.id, b1.status, b1.protocolo, b1.paciente_nome, b1.grupo, b1.conferido_por], [`bolsa_${B1}`, 'RESERVADA', 'HT00001', 'Maria de Teste', 'O+', 'Biomédica Teste']);
    assert.deepEqual([doc('solicitacoes_transfusao', s1.id).status, doc('solicitacoes_transfusao', s1.id).ativas], ['EM_ATENDIMENTO', 1]);
    assert.match(await erroDe(`reservar('${s1.id}', '${B1}')`), /já foi registrada no sistema e não pode ser usada outra vez/);
    assert.match(await erroDe(`reservar('${s2.id}', 'bs-0001')`), /já foi registrada/);   // nem em outra solicitação, nem com outra digitação
    await reservar(s1.id, B2);
    assert.equal(doc('solicitacoes_transfusao', s1.id).ativas, 2);
    assert.match(await erroDe(`reservar('${s1.id}', '${B3}')`), /Todas as 2 unidade\(s\)/);
    assert.equal(doc('bolsas_sangue', `bolsa_${B3}`), undefined);
});

test('entregar à unidade: só a agência, só bolsa reservada e com o nome de quem retirou', async () => {
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enfermeira');
    dados('__id', `bolsa_${B1}`);
    assert.match(await erroDe("entregarBolsa(__id, 'Téc. Retirada')"), /Acesso negado/);
    entrar('FUNC_HEMOTERAPIA', 'hem1', 'Biomédica Agência');
    assert.match(await erroDe("entregarBolsa(__id, '')"), /quem retirou a bolsa/);
    await call("entregarBolsa(__id, 'Téc. Retirada')");
    const b = doc('bolsas_sangue', `bolsa_${B1}`);
    assert.deepEqual([b.status, b.retirada_por, b.entregue_por], ['ENTREGUE', 'Téc. Retirada', 'hem1']);
    assert.match(await erroDe("entregarBolsa(__id, 'Téc. Retirada')"), /não pode receber esta ação/);   // duas pessoas clicando não entregam duas vezes
    dados('__id2', `bolsa_${B2}`);
    await call("entregarBolsa(__id2, 'Téc. Retirada')");
});

test('devolver ou descartar: motivo obrigatório, libera a unidade para outra bolsa e só vale antes de usar', async () => {
    entrar('FUNC_HEMOTERAPIA', 'hem1', 'Biomédica Agência');
    const b = await reservar(s2.id, B3);
    dados('__id', b.id);
    assert.match(await erroDe("devolverBolsa(__id, 'x')"), /mínimo 5 letras/);
    assert.equal(doc('solicitacoes_transfusao', s2.id).ativas, 1);
    await call("devolverBolsa(__id, 'Bolsa com aspecto alterado', true)");
    assert.deepEqual([doc('bolsas_sangue', b.id).status, doc('bolsas_sangue', b.id).saida_motivo], ['DESCARTADA', 'Bolsa com aspecto alterado']);
    assert.equal(doc('solicitacoes_transfusao', s2.id).ativas, 0);
    assert.match(await erroDe("devolverBolsa(__id, 'Devolver outra vez')"), /"Descartada".*não pode receber/);
    const reposta = await reservar(s2.id, B4);   // a unidade volta a poder receber outra bolsa
    assert.equal(doc('solicitacoes_transfusao', s2.id).ativas, 1);
    dados('__idd', reposta.id);
    await call("devolverBolsa(__idd, 'Paciente não precisa mais da transfusão')");
    assert.equal(doc('bolsas_sangue', reposta.id).status, 'DEVOLVIDA');
    assert.match(await erroDe(`reservar('${s2.id}', '${B3}')`), /já foi registrada/);   // o número descartado nunca volta, mesmo havendo unidade livre
});

// ============ Gravação: transfusão à beira do leito ============

const inicio = (extra = {}) => ({ pa_sistolica: '120', pa_diastolica: '80', fc: '78', spo2: '97', temperatura: '36,5', conferido_por: 'Téc. Segundo Profissional', registro_conselho: 'COREN-TO 9', ...extra });

test('iniciar: só enfermagem, bolsa entregue, segundo profissional diferente e bolsa dentro da validade', async () => {
    dados('__id', `bolsa_${B1}`); dados('__i', inicio());
    entrar('FUNC_HEMOTERAPIA', 'hem1', 'Biomédica Agência');
    assert.match(await erroDe('iniciarTransfusao(__id, __i)'), /Acesso negado/);
    dados('__vazio', {});
    for (const acao of ['iniciarTransfusao(__id, __vazio)', 'registrarSinaisDuranteTransfusao(__id, __vazio)', 'concluirTransfusao(__id, __vazio)', 'interromperTransfusao(__id, __vazio)']) {
        assert.match(await erroDe(acao), /Acesso negado/, `${acao}: a permissão é conferida antes da validação do formulário`);
    }
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enfermeira Teste');
    dados('__mesmo', inicio({ conferido_por: 'Enfermeira Teste' }));
    assert.match(await erroDe('iniciarTransfusao(__id, __mesmo)'), /outro profissional/);
    dados('__semsinal', inicio({ pa_sistolica: '', pa_diastolica: '', fc: '', spo2: '', temperatura: '' }));
    assert.match(await erroDe('iniciarTransfusao(__id, __semsinal)'), /ao menos um sinal vital/);
    assert.equal(doc('bolsas_sangue', `bolsa_${B1}`).status, 'ENTREGUE', 'recusas não mudam a bolsa');
    // bolsa vencida depois da entrega: não transfunde
    const venc = { ...doc('bolsas_sangue', `bolsa_${B2}`), validade: '2020-01-01' };
    amb.guardar('bolsas_sangue', venc);
    dados('__idv', `bolsa_${B2}`);
    assert.match(await erroDe('iniciarTransfusao(__idv, __i)'), /Bolsa vencida: não pode ser transfundida/);
    amb.guardar('bolsas_sangue', { ...venc, validade: dia(30) });
    // internação encerrada no meio do caminho: não inicia
    amb.guardar('internacoes', { ...doc('internacoes', 'int1'), status: 'ENCERRADA' });
    assert.match(await erroDe('iniciarTransfusao(__id, __i)'), /não está mais ativa/);
    amb.guardar('internacoes', { ...doc('internacoes', 'int1'), status: 'ATIVA' });

    await call('iniciarTransfusao(__id, __i)');
    const b = doc('bolsas_sangue', `bolsa_${B1}`);
    assert.deepEqual([b.status, b.inicio_por, b.conferido_beira_leito_por, b.conferido_por, b.sinais_antes.valores.fc, b.sinais_antes.valores.temperatura], ['EM_TRANSFUSAO', 'enf1', 'Téc. Segundo Profissional', 'Biomédica Teste', 78, 36.5]);   // a conferência da agência não é sobrescrita
    assert.match(await erroDe('iniciarTransfusao(__id, __i)'), /não pode receber esta ação/);
});

test('durante a transfusão os sinais só acrescentam; concluir exige a resposta sobre reação e conta a unidade na solicitação', async () => {
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enfermeira Teste');
    dados('__id', `bolsa_${B1}`);
    assert.match(await erroDe("registrarSinaisDuranteTransfusao(__id, {})"), /ao menos um sinal vital/);
    await call("registrarSinaisDuranteTransfusao(__id, { fc: '82', spo2: '96', observacao: 'Sem queixas' })");
    await call("registrarSinaisDuranteTransfusao(__id, { fc: '80', spo2: '97' })");
    const mon = doc('bolsas_sangue', `bolsa_${B1}`).monitoramento;
    assert.deepEqual(mon.map(m => m.valores.fc), [82, 80]);
    dados('__sem', { fc: '78', spo2: '98' });
    assert.match(await erroDe('concluirTransfusao(__id, __sem)'), /houve reação transfusional/);
    dados('__reacao', { fc: '78', reacao: 'SIM', descricao_reacao: 'Febre' });
    assert.match(await erroDe('concluirTransfusao(__id, __reacao)'), /mínimo 10 letras/);
    dados('__ok', { fc: '78', spo2: '98', reacao: 'NAO' });
    await call('concluirTransfusao(__id, __ok)');
    const b = doc('bolsas_sangue', `bolsa_${B1}`);
    assert.deepEqual([b.status, b.reacao, b.sinais_depois.valores.fc, b.fim_por], ['TRANSFUNDIDA', 'NAO', 78, 'enf1']);
    const s = doc('solicitacoes_transfusao', s1.id);
    assert.deepEqual([s.status, s.transfundidas, s.ativas], ['EM_ATENDIMENTO', 1, 2]);   // falta a segunda unidade
    assert.match(await erroDe('concluirTransfusao(__id, __ok)'), /"Transfundida".*não pode receber/);
    assert.match(await erroDe("devolverBolsa(__id, 'Devolver bolsa já usada')"), /Acesso negado|não pode receber/);
});

test('a segunda unidade conclui a solicitação; reação fica registrada', async () => {
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enfermeira Teste');
    dados('__id', `bolsa_${B2}`); dados('__i', inicio({ conferido_por: 'Enf. Outra' }));
    await call('iniciarTransfusao(__id, __i)');
    dados('__r', { fc: '110', temperatura: '38,2', reacao: 'SIM', descricao_reacao: 'Febre e calafrios após 15 minutos', observacao: 'Médico avisado' });
    await call('concluirTransfusao(__id, __r)');
    const b = doc('bolsas_sangue', `bolsa_${B2}`);
    assert.deepEqual([b.status, b.reacao, b.descricao_reacao], ['TRANSFUNDIDA', 'SIM', 'Febre e calafrios após 15 minutos']);
    const s = doc('solicitacoes_transfusao', s1.id);
    assert.deepEqual([s.status, s.transfundidas], ['CONCLUIDA', 2]);
    assert.deepEqual(s.historico.map(h => h.status).filter((st, n, l) => st !== l[n - 1]), ['SOLICITADA', 'EM_ATENDIMENTO', 'CONCLUIDA']);
    entrar('MEDICO', 'med1', 'Dr. Teste');
    assert.match(await erroDe(`cancelarSolicitacaoTransfusao('${s1.id}', 'Cancelar depois de concluída')`), /"Concluída"/);
    assert.ok(auditoria.some(a => a.entidade === 'bolsa_sangue' && a.acao === 'TRANSFUNDIR_CONCLUIR'));
});

test('interromper: motivo obrigatório, a bolsa sai de circulação e a unidade pode ser reposta', async () => {
    entrar('FUNC_HEMOTERAPIA', 'hem1', 'Biomédica Agência');
    const nb = await reservar(s2.id, 'BS-0005');
    dados('__id', nb.id);
    await call("entregarBolsa(__id, 'Téc. Retirada')");
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enfermeira Teste');
    await call('iniciarTransfusao(__id, ' + JSON.stringify(inicio({ conferido_por: 'Enf. Outra' })) + ')');
    assert.match(await erroDe("interromperTransfusao(__id, { motivo: 'x' })"), /mínimo 5 letras/);
    assert.equal(doc('solicitacoes_transfusao', s2.id).ativas, 1);
    await call("interromperTransfusao(__id, { motivo: 'Paciente com urticária', reacao: 'SIM', descricao_reacao: 'Urticária generalizada em 10 minutos', fc: '100' })");
    const b = doc('bolsas_sangue', nb.id);
    assert.deepEqual([b.status, b.interrupcao_motivo, b.reacao, b.sinais_depois.valores.fc], ['INTERROMPIDA', 'Paciente com urticária', 'SIM', 100]);
    assert.equal(doc('solicitacoes_transfusao', s2.id).ativas, 0);
    assert.equal(doc('solicitacoes_transfusao', s2.id).transfundidas, 0);
    assert.match(await erroDe("interromperTransfusao(__id, { motivo: 'Interromper outra vez' })"), /não pode receber esta ação/);
    entrar('FUNC_HEMOTERAPIA', 'hem1', 'Biomédica Agência');
    const outra = await reservar(s2.id, 'BS-0006');   // reposição
    assert.equal(doc('bolsas_sangue', outra.id).status, 'RESERVADA');
});

test('cancelar a solicitação: só sem bolsa em circulação; motivo obrigatório; médico ou agência cancelam, enfermagem não', async () => {
    entrar('MEDICO', 'med1', 'Dr. Teste');
    assert.match(await erroDe(`cancelarSolicitacaoTransfusao('${s2.id}', 'Não é mais necessário')`), /Devolva as bolsas antes de cancelar/);
    entrar('FUNC_HEMOTERAPIA', 'hem1', 'Biomédica Agência');
    dados('__id', 'bolsa_BS-0006');
    await call("devolverBolsa(__id, 'Solicitação será cancelada')");
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enfermeira Teste');
    assert.match(await erroDe(`cancelarSolicitacaoTransfusao('${s2.id}', 'Não é mais necessário')`), /não pode cancelar/);
    entrar('MEDICO', 'med1', 'Dr. Teste');
    assert.match(await erroDe(`cancelarSolicitacaoTransfusao('${s2.id}', 'não')`), /mínimo 5 letras/);
    await call(`cancelarSolicitacaoTransfusao('${s2.id}', 'Não é mais necessário')`);
    const s = doc('solicitacoes_transfusao', s2.id);
    assert.deepEqual([s.status, s.motivo_cancelamento], ['CANCELADA', 'Não é mais necessário']);
    entrar('FUNC_HEMOTERAPIA', 'hem1', 'Biomédica Agência');
    assert.match(await erroDe(`reservar('${s2.id}', 'BS-0007')`), /não está aberta/);
});

test('nada se apaga: todas as bolsas usadas continuam com o histórico completo, em ordem', () => {
    const b1 = doc('bolsas_sangue', `bolsa_${B1}`);
    assert.deepEqual(b1.historico.map(h => h.status), ['RESERVADA', 'ENTREGUE', 'EM_TRANSFUSAO', 'EM_TRANSFUSAO', 'EM_TRANSFUSAO', 'TRANSFUNDIDA']);
    assert.equal(Object.keys(banco.store.bolsas_sangue).length, 6);
});

test('relatório de hemoterapia no formato de tela: situação, horários e reação legíveis', () => {
    dados('__b', [
        { numero: 'Z1', status: 'TRANSFUNDIDA', dia: '2026-06-10', protocolo: 'HT00001', paciente_nome: 'Ana', prontuario: '1', hemocomponente_rotulo: 'Concentrado de hemácias', grupo: 'O+', reacao: 'NAO',
            inicio_em: '2026-06-10T10:00:00Z', fim_em: '2026-06-10T12:00:00Z', reservada_em: '2026-06-10T08:00:00Z' },
        { numero: 'Z2', status: 'RESERVADA', dia: '2026-06-10', protocolo: 'HT00002', paciente_nome: 'Bia', hemocomponente_rotulo: 'Plasma fresco congelado', grupo: 'A-', reservada_em: '2026-06-10T07:00:00Z' }
    ]);
    const r = j("relatorioHemoterapiaTela(__b, '', '')");
    assert.deepEqual([r.linhas[0].bolsa, r.linhas[0].situacao, r.linhas[0].reacao, r.linhas[1].situacao, r.linhas[1].inicio, r.linhas[1].reacao, r.linhas[1].prontuario], ['Z1', 'Transfundida', 'Não', 'Reservada', '—', '—', '—']);
    assert.ok(r.colunas.every(c => c.k in r.linhas[0]));
    assert.match(r.descricao, /não confere compatibilidade/);
    assert.equal(r.resumo.find(x => x.rot === 'Transfundidas').valor, 1);
});
