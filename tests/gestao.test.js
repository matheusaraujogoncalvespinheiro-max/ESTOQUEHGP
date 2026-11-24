// Testes da Etapa 10: ouvidoria, qualidade, ensino e pesquisa e painel da direção. Executa com: npm test
// Só dados fictícios. O banco é um Firestore simulado em memória (nunca o real).
const test = require('node:test');
const assert = require('node:assert/strict');
const { criarAmbiente } = require('./helpers/clinico');

const amb = criarAmbiente();
const { call, dados, entrar, erroDe, doc, hoje, dia } = amb;
dados('__agora', new Date(2026, 5, 10, 12, 0, 0).toISOString());
const val = (codigo) => { try { return JSON.parse(JSON.stringify(call(codigo))); } catch (e) { return e.message; } };
const aj = async (codigo) => JSON.parse(JSON.stringify(await call(codigo)));
const em = (h, min = 0, d = 10) => new Date(2026, 5, d, h, min).toISOString();

// ============ Ouvidoria ============

test('manifestação: tipo, canal, assunto, descrição; anônima não guarda nome; prazo não anterior ao recebimento', () => {
    const v = (f) => { dados('__f', f); return val('validarManifestacao(__f, new Date(__agora))'); };
    const base = { tipo: 'RECLAMACAO', canal: 'TELEFONE', assunto: 'Demora no atendimento', descricao: 'Esperou muito tempo na recepção', manifestante: ' Fulano de Teste ', contato: '(63) 90000-0000', sigilo: true };
    const ok = v(base);
    assert.deepEqual([ok.tipo_rotulo, ok.manifestante, ok.sigilo, ok.anonima], ['Reclamação', 'Fulano de Teste', true, false]);
    const anon = v({ ...base, anonima: true });
    assert.deepEqual([anon.manifestante, anon.contato, anon.sigilo, anon.anonima], ['', '', false, true]);
    assert.match(v({ ...base, tipo: 'OUTRO' }), /Tipo da manifestação: escolha/);
    assert.match(v({ ...base, canal: 'X' }), /Canal de entrada: escolha/);
    assert.match(v({ ...base, assunto: 'abc' }), /Assunto: mínimo de 5/);
    assert.match(v({ ...base, manifestante: '' }), /Nome de quem se manifestou: informe/);
    assert.match(v({ ...base, prazo_resposta: '2026-06-01', recebida_em: em(10) }), /Prazo de resposta: não pode ser anterior ao recebimento/);
    assert.match(v({ ...base, recebida_em: em(14) }), /não pode estar no futuro/);
});

test('ouvidoria: registrar, analisar, encaminhar, responder, concluir; só a ouvidoria faz; passos fora de ordem recusados', async () => {
    entrar('FUNC_RECEPCAO');
    dados('__f', { tipo: 'ELOGIO', canal: 'CAIXA', assunto: 'Atendimento ótimo', descricao: 'Elogio à equipe da emergência', anonima: true });
    assert.match(await erroDe('registrarManifestacao(__f)'), /Acesso negado/);
    entrar('FUNC_OUVIDORIA');
    const m = await aj('registrarManifestacao(__f)');
    assert.equal(m.protocolo, 'OV00001'); assert.equal(m.status, 'RECEBIDA');
    assert.match(await erroDe(`responderManifestacao('${m.id}', { texto: 'Obrigado pelo elogio, vamos repassar.' })`), /Não é possível passar de "Recebida" para "Respondida"/);
    await call(`analisarManifestacao('${m.id}')`);
    assert.match(await erroDe(`analisarManifestacao('${m.id}')`), /já foi registrado/);
    await call(`encaminharManifestacao('${m.id}', { setor: 'Emergência', observacao: 'Repassar à chefia' })`);
    assert.match(await erroDe(`encaminharManifestacao('${m.id}', { setor: 'x' })`), /Setor de destino: mínimo de 2/);
    await call(`responderManifestacao('${m.id}', { texto: 'Obrigado pelo elogio, vamos repassar.', forma: 'telefone' })`);
    assert.match(await erroDe(`encaminharManifestacao('${m.id}', { setor: 'Emergência' })`), /ainda sem resposta/);
    const r = await aj(`concluirManifestacao('${m.id}', '')`);
    assert.equal(r.status, 'CONCLUIDA'); assert.equal(r.respostas.length, 1); assert.equal(r.encaminhamentos.length, 1);
    assert.deepEqual(r.historico.map(h => h.status), ['RECEBIDA', 'EM_ANALISE', 'EM_ANALISE', 'RESPONDIDA', 'CONCLUIDA']);
    assert.match(await erroDe(`arquivarManifestacao('${m.id}', 'não vale mais')`), /Não é possível passar de "Concluída"/);
    const o2 = await aj('registrarManifestacao(__f)');
    assert.equal(o2.protocolo, 'OV00002');
    assert.match(await erroDe(`arquivarManifestacao('${o2.id}', 'abc')`), /Motivo do arquivamento: mínimo de 5/);
    assert.equal((await aj(`arquivarManifestacao('${o2.id}', 'Duplicada de outra manifestação')`)).status, 'ARQUIVADA');
});

test('ouvidoria: reabrir exige motivo; indicadores contam abertas, vencidas e dias até responder', async () => {
    entrar('FUNC_OUVIDORIA');
    dados('__f', { tipo: 'DENUNCIA', canal: 'EMAIL', assunto: 'Denúncia de teste', descricao: 'Descrição de uma denúncia de teste', manifestante: 'Pessoa de Teste', prazo_resposta: dia(0) });
    const m = await aj('registrarManifestacao(__f)');
    await call(`analisarManifestacao('${m.id}')`);
    await call(`responderManifestacao('${m.id}', { texto: 'Estamos apurando o caso relatado.' })`);
    assert.match(await erroDe(`reabrirManifestacao('${m.id}', 'x')`), /Motivo da reabertura: mínimo de 5/);
    assert.equal((await aj(`reabrirManifestacao('${m.id}', 'Resposta não resolveu o problema')`)).status, 'EM_ANALISE');
    const ind = val(`indicadoresOuvidoria([
        { id: 'a', dia: '2026-06-10', status: 'RECEBIDA', tipo: 'RECLAMACAO', prazo_resposta: '2026-06-01', recebida_em: '2026-06-10T10:00:00.000Z', respostas: [] },
        { id: 'b', dia: '2026-06-10', status: 'CONCLUIDA', tipo: 'ELOGIO', recebida_em: '2026-06-10T00:00:00.000Z', respostas: [{ em: '2026-06-12T00:00:00.000Z' }] },
        { id: 'c', dia: '2026-06-10', status: 'EM_ANALISE', tipo: 'RECLAMACAO', prazo_resposta: '2026-06-30', recebida_em: '2026-06-10T10:00:00.000Z', respostas: [] }], '2026-06-01', '2026-06-30', '2026-06-15')`);
    assert.deepEqual([ind.total, ind.em_aberto, ind.vencidas, ind.concluidas, ind.dias_ate_responder], [3, 2, 1, 1, 2]);
    assert.deepEqual(ind.por_tipo, { RECLAMACAO: 2, ELOGIO: 1 });
});

// ============ Qualidade ============

test('qualidade: não conformidade, ação com prazo, conclusão exige verificação e ações fechadas', async () => {
    entrar('FUNC_ENFERMAGEM');
    dados('__f', { origem: 'AUDITORIA', setor: 'UTI', descricao: 'Checklist de higiene das mãos sem registro', detectada_em: hoje });
    assert.match(await erroDe('registrarNaoConformidade(__f)'), /Acesso negado/);
    entrar('FUNC_QUALIDADE');
    assert.match(await erroDe(`registrarNaoConformidade({ origem: 'X', setor: 'UTI', descricao: 'Descrição suficiente' })`), /Origem: escolha/);
    assert.match(await erroDe(`registrarNaoConformidade({ origem: 'AUDITORIA', setor: 'UTI', descricao: 'Descrição suficiente', detectada_em: '${dia(3)}' })`), /não pode estar no futuro/);
    const nc = await aj('registrarNaoConformidade(__f)');
    assert.equal(nc.protocolo, 'NC00001');
    assert.match(await erroDe(`concluirNaoConformidade('${nc.id}', 'Resolvido por completo')`), /Não é possível passar de "Aberta" para "Concluída"/);
    await call(`tratarNaoConformidade('${nc.id}')`);
    assert.match(await erroDe(`criarAcaoQualidade({ nc_id: '${nc.id}', descricao: 'Treinar a equipe', responsavel: 'Enf. Teste', prazo: '${dia(-1)}' })`), /Prazo: não pode ser anterior a hoje/);
    assert.match(await erroDe(`criarAcaoQualidade({ nc_id: 'inexistente', descricao: 'Treinar a equipe', responsavel: 'Enf. Teste', prazo: '${dia(5)}' })`), /Não conformidade não encontrada/);
    const ac = await aj(`criarAcaoQualidade({ nc_id: '${nc.id}', descricao: 'Treinar a equipe', responsavel: 'Enf. Teste', prazo: '${dia(5)}' })`);
    assert.deepEqual([ac.protocolo, ac.nc_protocolo, ac.status], ['AC00001', 'NC00001', 'PENDENTE']);
    assert.match(await erroDe(`concluirNaoConformidade('${nc.id}', 'Resolvido por completo')`), /1 ação\(ões\) aberta\(s\)/);
    assert.match(await erroDe(`concluirAcaoQualidade('${ac.id}', 'ok')`), /Resultado da ação: mínimo de 5/);
    await call(`concluirAcaoQualidade('${ac.id}', 'Equipe treinada em 10 pessoas')`);
    assert.match(await erroDe(`concluirAcaoQualidade('${ac.id}', 'Equipe treinada de novo')`), /já foi registrado/);
    assert.match(await erroDe(`concluirNaoConformidade('${nc.id}', 'curto')`), /Verificação do resultado: mínimo de 10/);
    const fim = await aj(`concluirNaoConformidade('${nc.id}', 'Auditoria seguinte sem falhas')`);
    assert.equal(fim.status, 'CONCLUIDA'); assert.equal(fim.verificacao, 'Auditoria seguinte sem falhas');
    assert.match(await erroDe(`criarAcaoQualidade({ nc_id: '${nc.id}', descricao: 'Nova ação tardia', responsavel: 'Enf. Teste', prazo: '${dia(5)}' })`), /já foi encerrada/);
});

test('qualidade: reprogramar guarda o prazo antigo com motivo; só ação aberta', async () => {
    entrar('FUNC_QUALIDADE');
    const ac = await aj(`criarAcaoQualidade({ descricao: 'Revisar o POP de coleta', responsavel: 'Chefe do setor', prazo: '${dia(2)}' })`);
    assert.equal(ac.nc_id, '');
    assert.match(await erroDe(`reprogramarAcaoQualidade('${ac.id}', '${dia(2)}', 'mesmo prazo aqui')`), /igual ao atual/);
    assert.match(await erroDe(`reprogramarAcaoQualidade('${ac.id}', '${dia(9)}', 'x')`), /Motivo da reprogramação: mínimo de 5/);
    const r = await aj(`reprogramarAcaoQualidade('${ac.id}', '${dia(9)}', 'Aguardando a reunião do comitê')`);
    assert.equal(r.prazo, dia(9)); assert.equal(r.reprogramacoes[0].de, dia(2)); assert.equal(r.reprogramacoes[0].para, dia(9));
    await call(`cancelarAcaoQualidade('${ac.id}', 'Substituída por outra ação')`);
    assert.match(await erroDe(`reprogramarAcaoQualidade('${ac.id}', '${dia(12)}', 'Tentando de novo')`), /Só se reprograma uma ação aberta/);
    assert.equal(val(`acaoAtrasada({ status: 'PENDENTE', prazo: '2026-06-01' }, '2026-06-10')`), true);
    assert.equal(val(`acaoAtrasada({ status: 'CONCLUIDA', prazo: '2026-06-01' }, '2026-06-10')`), false);
});

test('qualidade: documento tem versões que só acrescentam, código único e obsoleto não recebe versão', async () => {
    entrar('FUNC_QUALIDADE');
    const base = { codigo: ' pop enf 001 ', titulo: 'Higiene das mãos', tipo: 'POP', setor: 'Enfermagem', resumo: 'Primeira versão', aprovado_por: 'Coordenação da qualidade', aprovado_em: dia(-10), revisar_em: dia(100), referencia: 'Pasta da qualidade' };
    dados('__d', base);
    assert.match(await erroDe(`cadastrarDocumentoQualidade({ ...__d, tipo: 'X' })`), /Tipo do documento: escolha/);
    assert.match(await erroDe(`cadastrarDocumentoQualidade({ ...__d, aprovado_em: '${dia(2)}' })`), /não pode estar no futuro/);
    assert.match(await erroDe(`cadastrarDocumentoQualidade({ ...__d, revisar_em: '${dia(-20)}' })`), /anterior à aprovação/);
    const d = await aj('cadastrarDocumentoQualidade(__d)');
    assert.equal(d.codigo, 'POP-ENF-001'); assert.equal(d.id, 'doc_POP-ENF-001'); assert.equal(d.versoes.length, 1);
    assert.match(await erroDe('cadastrarDocumentoQualidade(__d)'), /Já existe um documento com o código POP-ENF-001/);
    assert.match(await erroDe(`novaVersaoDocumento('${d.id}', { resumo: 'Ajuste', aprovado_por: 'Coord', aprovado_em: '${dia(-30)}' })`), /anterior à da versão atual/);
    const v2 = await aj(`novaVersaoDocumento('${d.id}', { resumo: 'Incluída a técnica de fricção', aprovado_por: 'Coordenação da qualidade', aprovado_em: '${hoje}', revisar_em: '${dia(200)}' })`);
    assert.deepEqual(v2.versoes.map(v => v.numero), [1, 2]);
    assert.equal(v2.versoes[0].resumo, 'Primeira versão');
    assert.equal(val(`docVersaoAtual(${JSON.stringify(v2)}).numero`), 2);
    const ob = await aj(`tornarDocumentoObsoleto('${d.id}', 'Substituído pelo protocolo institucional')`);
    assert.equal(ob.situacao, 'OBSOLETO'); assert.equal(ob.versoes.length, 2);
    assert.match(await erroDe(`novaVersaoDocumento('${d.id}', { resumo: 'Ajuste', aprovado_por: 'Coord', aprovado_em: '${hoje}' })`), /obsoleto não recebe nova versão/);
    assert.match(await erroDe(`tornarDocumentoObsoleto('${d.id}', 'De novo, por engano')`), /já está obsoleto/);
    assert.equal(val(`docRevisaoVencida({ situacao: 'VIGENTE', versoes: [{ numero: 1, revisar_em: '2026-06-01' }] }, '2026-06-10')`), true);
    assert.equal(val(`docRevisaoVencida({ situacao: 'OBSOLETO', versoes: [{ numero: 1, revisar_em: '2026-06-01' }] }, '2026-06-10')`), false);
});

// ============ Ensino e pesquisa ============

test('ensino e pesquisa: validação, parecer só em pesquisa, fluxo e aviso sem parecer', async () => {
    const v = (f) => { dados('__f', f); return val('validarAtividadeEnsino(__f, new Date(__agora))'); };
    const base = { tipo: 'ESTAGIO', titulo: 'Estágio de enfermagem', instituicao: 'Faculdade de Teste', responsavel: 'Enf. Teste', setor: 'UTI', inicio: '2026-06-01', fim: '2026-08-01', participantes: '12', parecer_cep: 'ignorado' };
    const ok = v(base);
    assert.deepEqual([ok.participantes, ok.parecer_cep, ok.tipo_rotulo], [12, '', 'Estágio']);
    assert.equal(v({ ...base, participantes: '' }).participantes, null);
    assert.equal(v({ ...base, tipo: 'PESQUISA' }).parecer_cep, 'ignorado');
    assert.match(v({ ...base, fim: '2026-05-01' }), /Fim: não pode ser anterior ao início/);
    assert.match(v({ ...base, tipo: 'X' }), /Tipo da atividade: escolha/);
    assert.match(v({ ...base, participantes: '-3' }), /Participantes: número inteiro de 0 a 9999/);
    entrar('FUNC_ENFERMAGEM');
    dados('__f', { ...base, inicio: hoje, fim: '', tipo: 'PESQUISA', parecer_cep: '' });
    assert.match(await erroDe('registrarAtividadeEnsino(__f)'), /Acesso negado/);
    entrar('FUNC_ENSINO');
    const a = await aj('registrarAtividadeEnsino(__f)');
    assert.deepEqual([a.protocolo, a.status], ['EP00001', 'PLANEJADO']);
    assert.equal(val(`ensinoSemParecer(${JSON.stringify(a)})`), false);   // ainda planejada
    const em1 = await aj(`iniciarAtividadeEnsino('${a.id}')`);
    assert.equal(val(`ensinoSemParecer(${JSON.stringify(em1)})`), true);
    assert.match(await erroDe(`iniciarAtividadeEnsino('${a.id}')`), /já foi registrado/);
    assert.match(await erroDe(`concluirAtividadeEnsino('${a.id}', 'ok')`), /Resultado ou balanço: mínimo de 5/);
    assert.equal((await aj(`concluirAtividadeEnsino('${a.id}', 'Projeto encerrado com relatório final')`)).status, 'CONCLUIDO');
    assert.match(await erroDe(`cancelarAtividadeEnsino('${a.id}', 'Motivo qualquer')`), /Não é possível passar de "Concluído"/);
    const ind = val(`indicadoresEnsino([{ tipo: 'ESTAGIO', inicio: '2026-06-02', status: 'CONCLUIDO', participantes: 10 }, { tipo: 'AULA', inicio: '2026-06-05', status: 'CANCELADO', participantes: 40 }, { tipo: 'PESQUISA', inicio: '2026-01-05', status: 'EM_ANDAMENTO', parecer_cep: '' }], '2026-06-01', '2026-06-30')`);
    assert.deepEqual([ind.total, ind.participantes, ind.em_aberto, ind.pesquisas_sem_parecer], [2, 10, 1, 1]);
});

// ============ Painel da direção ============

test('painel da direção: contagens, tempos médios e critério em cada indicador, sem nome de paciente', () => {
    dados('__dados', {
        atendimentos: [
            { id: 'a1', fila: 'EMERGENCIA', tipo_nome: 'Emergência', status: 'CONCLUIDO', risco: 'AMARELO', retorno: true, chegada_em: em(8), nome: 'Paciente Um',
                historico_status: [{ status: 'AGUARDANDO', em: em(8) }, { status: 'CHAMADO', em: em(8, 30) }, { status: 'EM_ATENDIMENTO', em: em(8, 35) }, { status: 'CONCLUIDO', em: em(9, 30) }] },
            { id: 'a2', fila: 'EMERGENCIA', tipo_nome: 'Emergência', status: 'NAO_COMPARECEU', chegada_em: em(9), historico_status: [{ status: 'AGUARDANDO', em: em(9) }, { status: 'CHAMADO', em: em(9, 10) }] },
            { id: 'a3', fila: 'AMBULATORIO', tipo_nome: 'Consulta', status: 'AGUARDANDO', chegada_em: em(10), historico_status: [{ status: 'AGUARDANDO', em: em(10) }] }],
        internacoes: [
            { id: 'i1', status: 'ALTA', tipo_alta: 'MELHORADA', data_hora_internacao: em(8, 0, 6), data_hora_alta: em(8, 0, 8) },
            { id: 'i2', status: 'ALTA', tipo_alta: 'OBITO', data_hora_internacao: em(8, 0, 5), data_hora_alta: em(8, 0, 9) },
            { id: 'i3', status: 'ALTA', data_hora_internacao: em(8, 0, 5), data_hora_alta: em(8, 0, 9) },
            { id: 'i4', status: 'ATIVA', data_hora_internacao: em(8, 0, 9) }],
        leitos: { total: 10, ocupados: 4 }
    });
    const r = val('indicadoresDirecao(__dados, "2026-06-01", "2026-06-30", "2026-06-10")');
    const item = (sec, rotulo) => r.secoes.find(s => s.id === sec).itens.find(i => i.rotulo === rotulo);
    assert.equal(item('atendimentos', 'Atendimentos no período').valor, 3);
    assert.equal(item('atendimentos', 'Concluídos').valor, 1);
    assert.equal(item('atendimentos', 'Não compareceram').valor, 1);
    assert.equal(item('atendimentos', 'Retornos').valor, 1);
    assert.equal(item('atendimentos', 'Espera média até a chamada').valor, '20 min');   // (30 + 10) / 2
    assert.equal(item('atendimentos', 'Tempo médio até a conclusão').valor, '90 min');
    assert.deepEqual(r.atendimentos.porFila, { EMERGENCIA: 2, AMBULATORIO: 1 });
    assert.equal(item('internacao', 'Admissões').valor, 4);
    assert.equal(item('internacao', 'Saídas (altas e óbitos)').valor, 3);
    assert.equal(item('internacao', 'Saídas por óbito').valor, 1);
    assert.equal(item('internacao', 'Saídas sem tipo de alta').valor, 1);
    assert.equal(item('internacao', 'Internados agora').valor, 1);
    assert.equal(item('internacao', 'Ocupação dos leitos agora').valor, '40%');
    r.secoes.forEach(s => s.itens.forEach(i => assert.ok(i.criterio && i.criterio.length > 20, `${s.id}/${i.rotulo} sem critério`)));
    assert.ok(!JSON.stringify(r).includes('Paciente Um'));
    const vazio = val('indicadoresDirecao({}, "2026-06-01", "2026-06-30", "2026-06-10")');
    assert.equal(vazio.secoes.find(s => s.id === 'atendimentos').itens.find(i => i.rotulo === 'Espera média até a chamada').valor, '—');
    assert.equal(vazio.secoes.find(s => s.id === 'internacao').itens.find(i => i.rotulo === 'Ocupação dos leitos agora').valor, '—');
});

test('relatórios de gestão: ouvidoria sem identidade, qualidade e ensino', () => {
    const o = val(`relatorioOuvidoriaTela([{ id: 'a', protocolo: 'OV00001', dia: '2026-06-10', tipo: 'DENUNCIA', canal: 'EMAIL', status: 'RECEBIDA', manifestante: 'Fulana Secreta', contato: 'x@y.z', recebida_em: '2026-06-10T10:00:00.000Z', respostas: [] }], '2026-06-01', '2026-06-30', '2026-06-15')`);
    assert.equal(o.linhas.length, 1);
    assert.ok(!JSON.stringify(o).includes('Fulana Secreta') && !JSON.stringify(o).includes('x@y.z'));
    const q = val(`relatorioQualidadeTela({ ncs: [{ id: 'n1', protocolo: 'NC00001', dia: '2026-06-10', detectada_em: '2026-06-10', origem: 'AUDITORIA', setor: 'UTI', status: 'ABERTA', criado_em: '2026-06-10T10:00:00.000Z' }], acoes: [{ id: 'a1', nc_id: 'n1', status: 'PENDENTE', prazo: '2026-06-01' }], docs: [] }, '2026-06-01', '2026-06-30', '2026-06-15')`);
    assert.equal(q.linhas[0].abertas, 1);
    assert.equal(q.resumo.find(x => x.rot === 'Ações atrasadas').valor, 1);
    const e = val(`relatorioEnsinoTela([{ protocolo: 'EP00001', tipo: 'PESQUISA', titulo: 'Projeto X', setor: 'UTI', inicio: '2026-06-02', status: 'EM_ANDAMENTO', participantes: null, parecer_cep: '' }], '2026-06-01', '2026-06-30')`);
    assert.equal(e.linhas[0].parecer, 'Não informado'); assert.equal(e.linhas[0].participantes, '—');
});
