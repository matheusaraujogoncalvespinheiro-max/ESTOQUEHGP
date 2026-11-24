// Hemoterapia (Etapa 8): solicitação de transfusão, bolsas da agência transfusional e transfusão à beira do leito.
//
// O QUE É: o MÉDICO solicita o hemocomponente (quantidade de unidades, urgência e indicação) para um internado. A AGÊNCIA TRANSFUSIONAL
// reserva uma bolsa por unidade (número único: a mesma bolsa nunca entra duas vezes), registra o grupo ABO/Rh digitado, a validade e quem
// conferiu a compatibilidade, e entrega à unidade. A ENFERMAGEM transfunde: confere a identificação com um SEGUNDO profissional, registra
// sinais vitais antes, durante e depois e conclui ou interrompe, anotando qualquer reação. Cada passo é uma transação que relê a situação
// (duas pessoas clicando ao mesmo tempo não passam as duas) e o histórico só acrescenta. A solicitação conclui quando todas as unidades
// pedidas foram transfundidas.
//
// O QUE NÃO É: o sistema NÃO decide compatibilidade ABO/Rh nem valida prova cruzada: o grupo é digitado e a conferência é
// responsabilidade da agência (o campo "conferido por" é obrigatório). Não define indicação, volume, velocidade, intervalo de sinais
// vitais nem prazo de uso da bolsa e não notifica a hemovigilância (docs/pendencias.md). As listas de hemocomponentes e de urgência são de
// apoio e precisam ser confirmadas pelo hospital.

const COL_TRANSFUSAO = 'solicitacoes_transfusao';
const COL_BOLSAS = 'bolsas_sangue';

const HEMOCOMPONENTES = { CH: 'Concentrado de hemácias', CP: 'Concentrado de plaquetas', PFC: 'Plasma fresco congelado', CRIO: 'Crioprecipitado' };
const URGENCIAS_TRANSFUSAO = { ROTINA: 'Rotina', URGENTE: 'Urgente', EXTREMA: 'Extrema urgência' };
const GRUPOS_ABO_RH = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const STATUS_SOLICITACAO_TRANSFUSAO = { SOLICITADA: 'Solicitada', EM_ATENDIMENTO: 'Em atendimento', CONCLUIDA: 'Concluída', CANCELADA: 'Cancelada' };
const STATUS_BOLSA = { RESERVADA: 'Reservada', ENTREGUE: 'Entregue à unidade', EM_TRANSFUSAO: 'Em transfusão', TRANSFUNDIDA: 'Transfundida', INTERROMPIDA: 'Interrompida', DEVOLVIDA: 'Devolvida', DESCARTADA: 'Descartada' };
const BOLSA_CONTA_NA_SOLICITACAO = ['RESERVADA', 'ENTREGUE', 'EM_TRANSFUSAO', 'TRANSFUNDIDA'];   // as demais saem de circulação e podem ser repostas
const QUANTIDADE_MAX_TRANSFUSAO = 10;   // limite de digitação

// ============ Regras puras (testáveis) ============

const textoHem = (v, max, rotulo) => { const x = String(v ?? '').trim(); if (x.length > max) throw new Error(`${rotulo}: no máximo ${max} caracteres.`); return x; };

/** Valida a solicitação do médico. `internacao` é a internação ativa do paciente. */
function validarSolicitacaoTransfusao(form, { internacao, agora = new Date() } = {}) {
    if (!internacao || internacao.status !== 'ATIVA') throw new Error('A solicitação exige um paciente com internação ativa.');
    if (!HEMOCOMPONENTES[form.hemocomponente]) throw new Error('Escolha o hemocomponente.');
    const q = Number(String(form.quantidade ?? '').trim());
    if (!Number.isInteger(q) || q < 1 || q > QUANTIDADE_MAX_TRANSFUSAO) throw new Error(`Quantidade: número inteiro de unidades de 1 a ${QUANTIDADE_MAX_TRANSFUSAO}.`);
    if (!URGENCIAS_TRANSFUSAO[form.urgencia]) throw new Error('Escolha a urgência da transfusão.');
    const indicacao = textoHem(form.indicacao, 500, 'Indicação clínica');
    if (indicacao.length < 10) throw new Error('Descreva a indicação clínica da transfusão (mínimo 10 letras).');
    const grupo = String(form.grupo_paciente || '').trim();
    if (grupo && !GRUPOS_ABO_RH.includes(grupo)) throw new Error('Grupo ABO/Rh inválido.');
    const registro = textoHem(form.registro_conselho, 30, 'Registro no conselho');
    if (registro.length < 3) throw new Error('Informe o seu registro no conselho profissional (CRM) para assinar a solicitação.');
    let previsto = '';
    if (String(form.previsto_para || '').trim()) {
        const d = new Date(form.previsto_para);
        if (Number.isNaN(d.getTime())) throw new Error('Data e hora previstas inválidas.');
        if (d.getTime() < agora.getTime() - 3600000) throw new Error('O horário previsto está no passado.');
        previsto = d.toISOString();
    }
    return { hemocomponente: form.hemocomponente, hemocomponente_rotulo: HEMOCOMPONENTES[form.hemocomponente], quantidade: q, urgencia: form.urgencia, indicacao, grupo_paciente: grupo, previsto_para: previsto, registro_conselho: registro };
}

/**
 * Valida a bolsa reservada para uma unidade da solicitação. A bolsa herda o hemocomponente da solicitação (não se escolhe de novo).
 * O grupo ABO/Rh é o digitado pela agência; o sistema não compara com o do paciente.
 */
function validarBolsa(form, { solicitacao, hoje = todayISO() } = {}) {
    if (!solicitacao || !['SOLICITADA', 'EM_ATENDIMENTO'].includes(solicitacao.status)) throw new Error('A solicitação não está aberta para receber bolsas.');
    if ((solicitacao.ativas || 0) >= solicitacao.quantidade) throw new Error(`Todas as ${solicitacao.quantidade} unidade(s) desta solicitação já têm bolsa.`);
    const numero = String(form.numero || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!/^[A-Z0-9\-_.]{3,30}$/.test(numero)) throw new Error('Número da bolsa: de 3 a 30 letras, números, ponto ou hífen.');
    if (!GRUPOS_ABO_RH.includes(form.grupo)) throw new Error('Informe o grupo ABO/Rh da bolsa.');
    const validade = String(form.validade || '').trim();
    if (!dataAgendaValida(validade)) throw new Error('Informe a validade da bolsa.');
    if (validade < hoje) throw new Error('Bolsa vencida: não pode ser reservada.');
    const conferido = textoHem(form.conferido_por, 80, 'Compatibilidade conferida por');
    if (conferido.length < 3) throw new Error('Informe quem conferiu a compatibilidade (nome do responsável da agência).');
    const registro = textoHem(form.registro_conselho, 30, 'Registro no conselho');
    if (registro.length < 3) throw new Error('Informe o registro no conselho profissional de quem conferiu a compatibilidade.');
    return { numero, grupo: form.grupo, validade, conferido_por: conferido, registro_conselho: registro };
}

/** Início da transfusão: sinais vitais antes e conferência da identificação por UM SEGUNDO profissional (diferente de quem transfunde). */
function validarInicioTransfusao(form, user) {
    const sinais = validarSinaisVitais(form, { exigir: true });
    const conferido = textoHem(form.conferido_por, 80, 'Conferido por');
    if (conferido.length < 3) throw new Error('Informe o segundo profissional que conferiu a identificação do paciente e da bolsa.');
    if (searchKey(conferido) === searchKey(user.name) || searchKey(conferido) === searchKey(user.username)) throw new Error('A conferência da identificação precisa ser feita por outro profissional, diferente de quem transfunde.');
    const registro = textoHem(form.registro_conselho, 30, 'Registro no conselho');
    if (registro.length < 3) throw new Error('Informe o seu registro no conselho profissional (COREN/CRM).');
    return { sinais, conferido_por: conferido, registro_conselho: registro };
}

/** Conclusão: sinais depois e pergunta obrigatória sobre reação (Sim exige a descrição). */
function validarConclusaoTransfusao(form) {
    const sinais = validarSinaisVitais(form, { exigir: true });
    if (!['SIM', 'NAO'].includes(form.reacao)) throw new Error('Informe se houve reação transfusional (Sim ou Não).');
    const descricao = textoHem(form.descricao_reacao, 500, 'Descrição da reação');
    if (form.reacao === 'SIM' && descricao.length < 10) throw new Error('Descreva a reação transfusional (mínimo 10 letras).');
    return { sinais, reacao: form.reacao, descricao_reacao: form.reacao === 'SIM' ? descricao : '', observacao: textoHem(form.observacao, 300, 'Observação') };
}

/** Interrupção: motivo obrigatório; reação opcional com descrição. */
function validarInterrupcaoTransfusao(form) {
    const motivo = textoHem(form.motivo, 300, 'Motivo');
    if (motivo.length < 5) throw new Error('Informe o motivo de interromper a transfusão (mínimo 5 letras).');
    const reacao = form.reacao === 'SIM';
    const descricao = textoHem(form.descricao_reacao, 500, 'Descrição da reação');
    if (reacao && descricao.length < 10) throw new Error('Descreva a reação transfusional (mínimo 10 letras).');
    const temSinal = SINAIS_VITAIS.some(s => String(form[s.k] || '').trim() !== '');
    const sinais = temSinal ? validarSinaisVitais(form, { exigir: false }) : null;
    return { motivo, reacao, descricao_reacao: reacao ? descricao : '', sinais };
}

/** "2 de 3 unidades com bolsa · 1 transfundida": só contagem. */
const progressoSolicitacao = (s) => `${s.ativas || 0} de ${s.quantidade} com bolsa · ${s.transfundidas || 0} transfundida(s)`;

/** Números dos cartões. */
function resumoHemoterapia(solicitacoes, bolsas, hoje) {
    const abertas = solicitacoes.filter(s => ['SOLICITADA', 'EM_ATENDIMENTO'].includes(s.status));
    return {
        a_atender: solicitacoes.filter(s => s.status === 'SOLICITADA').length,
        urgentes: abertas.filter(s => s.urgencia !== 'ROTINA').length,
        em_atendimento: solicitacoes.filter(s => s.status === 'EM_ATENDIMENTO').length,
        bolsas_na_unidade: bolsas.filter(b => b.status === 'ENTREGUE').length,
        em_transfusao: bolsas.filter(b => b.status === 'EM_TRANSFUSAO').length,
        transfundidas_hoje: bolsas.filter(b => b.status === 'TRANSFUNDIDA' && String(b.fim_em || '').slice(0, 10) === hoje).length,
        reacoes: bolsas.filter(b => b.reacao === 'SIM').length
    };
}

/** Linhas do relatório de hemoterapia (Relatórios › Hemoterapia e transfusões). */
function relatorioHemoterapia(bolsas, de, ate, termo = '') {
    const t = searchKey(termo);
    const linhas = bolsas.filter(b => (!de || b.dia >= de) && (!ate || b.dia <= ate) && (!t || searchKey(`${b.paciente_nome} ${b.prontuario} ${b.numero} ${b.hemocomponente_rotulo}`).includes(t)))
        .sort((a, b) => String(b.reservada_em).localeCompare(String(a.reservada_em)));
    const por = (st) => linhas.filter(b => b.status === st).length;
    return { linhas, resumo: { bolsas: linhas.length, transfundidas: por('TRANSFUNDIDA'), interrompidas: por('INTERROMPIDA'), devolvidas: por('DEVOLVIDA'), descartadas: por('DESCARTADA'), reacoes: linhas.filter(b => b.reacao === 'SIM').length } };
}

/** Relatório no formato comum das telas de relatório (título, colunas, linhas e resumo). */
function relatorioHemoterapiaTela(bolsas, de, ate, termo = '') {
    const r = relatorioHemoterapia(bolsas, de, ate, termo);
    const hora = (iso) => (iso ? formatDateTimeBR(iso) : '—');
    return {
        titulo: 'Hemoterapia e transfusões',
        descricao: 'Bolsas reservadas nos últimos 7 dias (a tela carrega só esse período). O grupo ABO/Rh é o digitado pela agência: o sistema não confere compatibilidade nem notifica a hemovigilância.',
        colunas: [{ k: 'dia', label: 'Dia' }, { k: 'protocolo', label: 'Protocolo' }, { k: 'paciente', label: 'Paciente' }, { k: 'prontuario', label: 'Prontuário' }, { k: 'hemocomponente', label: 'Hemocomponente' },
            { k: 'bolsa', label: 'Bolsa' }, { k: 'grupo', label: 'Grupo da bolsa' }, { k: 'situacao', label: 'Situação' }, { k: 'inicio', label: 'Início' }, { k: 'fim', label: 'Fim' }, { k: 'reacao', label: 'Reação' }],
        linhas: r.linhas.map(b => ({ dia: formatDateBR(b.dia), protocolo: b.protocolo, paciente: b.paciente_nome, prontuario: b.prontuario || '—', hemocomponente: b.hemocomponente_rotulo, bolsa: b.numero, grupo: b.grupo,
            situacao: STATUS_BOLSA[b.status] || b.status, inicio: hora(b.inicio_em), fim: hora(b.fim_em), reacao: b.reacao === 'SIM' ? 'Sim' : (b.reacao === 'NAO' ? 'Não' : '—') })),
        resumo: [{ rot: 'Bolsas', valor: r.resumo.bolsas }, { rot: 'Transfundidas', valor: r.resumo.transfundidas }, { rot: 'Interrompidas', valor: r.resumo.interrompidas }, { rot: 'Devolvidas', valor: r.resumo.devolvidas },
            { rot: 'Descartadas', valor: r.resumo.descartadas }, { rot: 'Reações', valor: r.resumo.reacoes }]
    };
}

// ============ Gravação (Firestore) ============

const linhaBolsa = (status, user, agora, motivo = '') => ({ status, em: agora, por: user.username, por_nome: user.name, motivo });

async function solicitarTransfusao(internacaoId, form) {
    requirePermission('hemoterapia_solicitar');
    const database = requireDb();
    const user = state.currentUser;
    const agora = nowISO();
    let solic;
    await database.runTransaction(async (tx) => {
        const i = await lerInternacaoAtiva(tx, database, internacaoId);
        const v = validarSolicitacaoTransfusao(form, { internacao: i });
        const contRef = database.collection('cad_contadores').doc('transfusao');
        const cont = await tx.get(contRef);
        const n = ((cont.exists && cont.data().ultimo) || 0) + 1;
        solic = { id: newId('trf'), protocolo: `HT${String(n).padStart(5, '0')}`, ...baseDaInternacao(i), ...v, dia: todayISO(), status: 'SOLICITADA', ativas: 0, transfundidas: 0,
            criado_em: agora, solicitante: user.username, solicitante_nome: user.name,
            historico: [{ status: 'SOLICITADA', em: agora, por: user.username, por_nome: user.name, motivo: 'Solicitação registrada' }] };
        tx.set(contRef, { ultimo: n });
        tx.set(database.collection(COL_TRANSFUSAO).doc(solic.id), solic);
    });
    await auditar({ entidade: 'transfusao', entidade_id: solic.id, acao: 'SOLICITAR', depois: { protocolo: solic.protocolo, hemocomponente: solic.hemocomponente, quantidade: solic.quantidade, urgencia: solic.urgencia } });
    return solic;
}

async function cancelarSolicitacaoTransfusao(id, motivo) {
    if (!(hasPermission('hemoterapia_solicitar') || hasPermission('hemoterapia_agencia'))) throw new Error('Seu perfil não pode cancelar solicitação de transfusão.');
    const texto = String(motivo || '').trim();
    if (texto.length < 5) throw new Error('Informe o motivo do cancelamento (mínimo 5 letras).');
    const database = requireDb();
    const user = state.currentUser;
    const agora = nowISO();
    await database.runTransaction(async (tx) => {
        const ref = database.collection(COL_TRANSFUSAO).doc(String(id));
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error('Solicitação não encontrada.');
        const s = { id: snap.id, ...snap.data() };
        if (!['SOLICITADA', 'EM_ATENDIMENTO'].includes(s.status)) throw new Error(`Esta solicitação está "${STATUS_SOLICITACAO_TRANSFUSAO[s.status] || s.status}". Atualize a tela.`);
        if ((s.ativas || 0) > 0) throw new Error('Há bolsa reservada ou usada nesta solicitação. Devolva as bolsas antes de cancelar.');
        tx.set(ref, { ...s, status: 'CANCELADA', cancelada_em: agora, cancelada_por: user.username, motivo_cancelamento: texto, historico: [...(s.historico || []), { status: 'CANCELADA', em: agora, por: user.username, por_nome: user.name, motivo: texto }] });
    });
    await auditar({ entidade: 'transfusao', entidade_id: id, acao: 'CANCELAR', motivo: texto });
}

/** Reserva uma bolsa para a solicitação (agência). O id do documento é o número da bolsa: o mesmo número não entra duas vezes. */
async function reservarBolsa(solicitacaoId, form) {
    requirePermission('hemoterapia_agencia');
    const database = requireDb();
    const user = state.currentUser;
    const agora = nowISO();
    let bolsa;
    await database.runTransaction(async (tx) => {
        const sRef = database.collection(COL_TRANSFUSAO).doc(String(solicitacaoId));
        const sSnap = await tx.get(sRef);
        if (!sSnap.exists) throw new Error('Solicitação não encontrada.');
        const s = { id: sSnap.id, ...sSnap.data() };
        const v = validarBolsa(form, { solicitacao: s });
        const bRef = database.collection(COL_BOLSAS).doc(`bolsa_${v.numero}`);
        if ((await tx.get(bRef)).exists) throw new Error(`A bolsa ${v.numero} já foi registrada no sistema e não pode ser usada outra vez.`);
        bolsa = { id: `bolsa_${v.numero}`, ...v, solicitacao_id: s.id, protocolo: s.protocolo, hemocomponente: s.hemocomponente, hemocomponente_rotulo: s.hemocomponente_rotulo,
            internacao_id: s.internacao_id, paciente_id: s.paciente_id, paciente_nome: s.paciente_nome, prontuario: s.prontuario, leito_id: s.leito_id, grupo_paciente: s.grupo_paciente || '',
            dia: todayISO(), status: 'RESERVADA', reservada_em: agora, historico: [linhaBolsa('RESERVADA', user, agora, `Reservada; compatibilidade conferida por ${v.conferido_por}`)] };
        tx.set(bRef, bolsa);
        tx.set(sRef, { ...s, status: 'EM_ATENDIMENTO', ativas: (s.ativas || 0) + 1, historico: [...(s.historico || []), { status: 'EM_ATENDIMENTO', em: agora, por: user.username, por_nome: user.name, motivo: `Bolsa ${v.numero} reservada` }] });
    });
    await auditar({ entidade: 'bolsa_sangue', entidade_id: bolsa.id, acao: 'RESERVAR', depois: { solicitacao: solicitacaoId, numero: bolsa.numero, grupo: bolsa.grupo, validade: bolsa.validade } });
    return bolsa;
}

/**
 * Muda uma bolsa (e, quando preciso, a contagem da solicitação) numa transação.
 * `mudar(b, s, ctx)` devolve { novo, motivo, solicitacao?: campos novos da solicitação, depois? }.
 */
async function transitarBolsa(id, { permissao, de, mudar, acao, exigirInternacao = false }) {
    requirePermission(permissao);
    const database = requireDb();
    const user = state.currentUser;
    const agora = nowISO();
    let resultado;
    await database.runTransaction(async (tx) => {
        const bRef = database.collection(COL_BOLSAS).doc(String(id));
        const bSnap = await tx.get(bRef);
        if (!bSnap.exists) throw new Error('Bolsa não encontrada.');
        const b = { id: bSnap.id, ...bSnap.data() };
        if (!de.includes(b.status)) throw new Error(`Esta bolsa está "${STATUS_BOLSA[b.status] || b.status}" e não pode receber esta ação agora. Atualize a tela.`);
        const sRef = database.collection(COL_TRANSFUSAO).doc(String(b.solicitacao_id));
        const sSnap = await tx.get(sRef);
        const s = sSnap.exists ? { id: sSnap.id, ...sSnap.data() } : null;
        if (exigirInternacao) await lerInternacaoAtiva(tx, database, b.internacao_id);
        const r = mudar(b, s, { agora, user });
        const status = r.novo.status || b.status;
        const gravado = { ...b, ...r.novo, historico: [...(b.historico || []), linhaBolsa(status, user, agora, r.motivo || '')] };
        tx.set(bRef, gravado);
        if (s && r.solicitacao) {
            const ns = { ...s, ...r.solicitacao };
            if (r.solicitacao.status && r.solicitacao.status !== s.status) ns.historico = [...(s.historico || []), { status: r.solicitacao.status, em: agora, por: user.username, por_nome: user.name, motivo: r.motivo || '' }];
            tx.set(sRef, ns);
        }
        resultado = { antes: { status: b.status }, depois: r.depois || { status }, bolsa: gravado, motivo: r.motivo || '' };
    });
    await auditar({ entidade: 'bolsa_sangue', entidade_id: id, acao, antes: resultado.antes, depois: resultado.depois, motivo: resultado.motivo });
    return resultado.bolsa;
}

/** Entrega a bolsa à unidade (agência): registra quem retirou. */
function entregarBolsa(id, retiradoPor) {
    const nome = String(retiradoPor || '').trim();
    if (nome.length < 3) return Promise.reject(new Error('Informe quem retirou a bolsa na agência (nome do profissional da unidade).'));
    return transitarBolsa(id, { permissao: 'hemoterapia_agencia', de: ['RESERVADA'], acao: 'ENTREGAR',
        mudar: (b, s, { agora, user }) => ({ novo: { status: 'ENTREGUE', entregue_em: agora, entregue_por: user.username, retirada_por: nome }, motivo: `Entregue à unidade; retirada por ${nome}` }) });
}

/** Devolve ou descarta uma bolsa que ainda não foi usada (reservada ou entregue). A unidade volta a poder receber outra. */
function devolverBolsa(id, motivo, descartada = false) {
    const texto = String(motivo || '').trim();
    if (texto.length < 5) return Promise.reject(new Error('Informe o motivo (mínimo 5 letras).'));
    if (texto.length > 300) return Promise.reject(new Error('Motivo: no máximo 300 caracteres.'));
    return transitarBolsa(id, { permissao: 'hemoterapia_agencia', de: ['RESERVADA', 'ENTREGUE'], acao: descartada ? 'DESCARTAR' : 'DEVOLVER',
        mudar: (b, s) => ({ novo: { status: descartada ? 'DESCARTADA' : 'DEVOLVIDA', saida_motivo: texto }, motivo: texto, solicitacao: s ? { ativas: Math.max(0, (s.ativas || 0) - 1) } : null }) });
}

/** Começa a transfusão à beira do leito: sinais antes e segunda conferência da identificação. */
function iniciarTransfusao(id, form) {
    const user = state.currentUser;
    let v;
    try { requirePermission('hemoterapia_transfundir'); v = validarInicioTransfusao(form, user); } catch (err) { return Promise.reject(err); }
    return transitarBolsa(id, { permissao: 'hemoterapia_transfundir', de: ['ENTREGUE'], acao: 'TRANSFUNDIR_INICIAR', exigirInternacao: true,
        mudar: (b, s, { agora, user: u }) => {
            if (b.validade < todayISO()) throw new Error('Bolsa vencida: não pode ser transfundida. Devolva à agência.');
            return { novo: { status: 'EM_TRANSFUSAO', inicio_em: agora, inicio_por: u.username, inicio_por_nome: u.name, inicio_registro_conselho: v.registro_conselho, conferido_beira_leito_por: v.conferido_por,
                sinais_antes: { valores: v.sinais.valores, aferido: v.sinais.aferido, motivo_nao_aferido: v.sinais.motivo_nao_aferido, em: agora }, monitoramento: [] },
                motivo: `Transfusão iniciada; identificação conferida por ${v.conferido_por}` };
        } });
}

/** Sinais vitais durante a transfusão (só acrescenta). */
function registrarSinaisDuranteTransfusao(id, form) {
    let sinais;
    try { requirePermission('hemoterapia_transfundir'); sinais = validarSinaisVitais(form, { exigir: true }); } catch (err) { return Promise.reject(err); }
    const obs = String(form.observacao || '').trim();
    if (obs.length > 300) return Promise.reject(new Error('Observação: no máximo 300 caracteres.'));
    return transitarBolsa(id, { permissao: 'hemoterapia_transfundir', de: ['EM_TRANSFUSAO'], acao: 'TRANSFUNDIR_SINAIS',
        mudar: (b, s, { agora, user }) => ({ novo: { monitoramento: [...(b.monitoramento || []), { em: agora, por: user.username, por_nome: user.name, valores: sinais.valores, aferido: sinais.aferido, motivo_nao_aferido: sinais.motivo_nao_aferido, observacao: obs }] },
            motivo: 'Sinais vitais durante a transfusão', depois: { monitoramento: (b.monitoramento || []).length + 1 } }) });
}

/** Conclui a transfusão: sinais depois, reação (sim/não) e, se todas as unidades foram transfundidas, a solicitação conclui. */
function concluirTransfusao(id, form) {
    let v;
    try { requirePermission('hemoterapia_transfundir'); v = validarConclusaoTransfusao(form); } catch (err) { return Promise.reject(err); }
    return transitarBolsa(id, { permissao: 'hemoterapia_transfundir', de: ['EM_TRANSFUSAO'], acao: 'TRANSFUNDIR_CONCLUIR',
        mudar: (b, s, { agora, user }) => {
            const transf = ((s && s.transfundidas) || 0) + 1;
            const completa = s && transf >= s.quantidade;
            return { novo: { status: 'TRANSFUNDIDA', fim_em: agora, fim_por: user.username, fim_por_nome: user.name, reacao: v.reacao, descricao_reacao: v.descricao_reacao, observacao_fim: v.observacao,
                    sinais_depois: { valores: v.sinais.valores, aferido: v.sinais.aferido, motivo_nao_aferido: v.sinais.motivo_nao_aferido, em: agora } },
                motivo: `Transfusão concluída${v.reacao === 'SIM' ? ' com reação transfusional registrada' : ''}`,
                solicitacao: s ? { transfundidas: transf, ...(completa ? { status: 'CONCLUIDA', concluida_em: agora } : {}) } : null, depois: { status: 'TRANSFUNDIDA', reacao: v.reacao } };
        } });
}

/** Interrompe a transfusão (motivo obrigatório): a bolsa sai de circulação e a unidade pode ser reposta com outra bolsa. */
function interromperTransfusao(id, form) {
    let v;
    try { requirePermission('hemoterapia_transfundir'); v = validarInterrupcaoTransfusao(form); } catch (err) { return Promise.reject(err); }
    return transitarBolsa(id, { permissao: 'hemoterapia_transfundir', de: ['EM_TRANSFUSAO'], acao: 'TRANSFUNDIR_INTERROMPER',
        mudar: (b, s, { agora, user }) => ({ novo: { status: 'INTERROMPIDA', fim_em: agora, fim_por: user.username, fim_por_nome: user.name, interrupcao_motivo: v.motivo, reacao: v.reacao ? 'SIM' : 'NAO', descricao_reacao: v.descricao_reacao,
                ...(v.sinais ? { sinais_depois: { valores: v.sinais.valores, aferido: v.sinais.aferido, motivo_nao_aferido: v.sinais.motivo_nao_aferido, em: agora } } : {}) },
            motivo: `Transfusão interrompida: ${v.motivo}`, solicitacao: s ? { ativas: Math.max(0, (s.ativas || 0) - 1) } : null, depois: { status: 'INTERROMPIDA', reacao: v.reacao ? 'SIM' : 'NAO' } }) });
}
