// Centro Cirúrgico (Etapa 8): cirurgias marcadas, checklist de cirurgia segura em três momentos e recuperação pós-anestésica (RPA).
//
// O QUE É: cada cirurgia é um documento de `cirurgias` com o caminho Agendada → Paciente na sala → Em cirurgia → RPA → Concluída
// (ou Cancelada antes de começar). O checklist é registrado em três momentos (entrada, pausa cirúrgica e saída); cada registro é
// assinado e NUNCA é alterado: uma conferência refeita entra como nova tentativa e vale a última. A cirurgia só começa com a
// entrada e a pausa completas e só vai à RPA com a saída completa. Na RPA a equipe acrescenta avaliações (sinais vitais, observação)
// e dá a alta com destino e médico responsável. A sala é travada por dia e horário (`agenda_slots`) contra marcação dupla.
//
// O QUE NÃO É: o modelo de itens (CHECKLIST_MODELO) parte da Lista de Verificação de Segurança Cirúrgica da OMS e precisa ser
// confirmado pelo hospital; o sistema não calcula escore de recuperação (a pontuação e o nome da escala são digitados), não define
// critério de alta da RPA, não controla duração nem sobreposição de salas (só o mesmo horário de início) e não substitui a
// descrição cirúrgica nem o registro anestésico (pendências em docs/pendencias.md).

const COL_CIRURGIAS = 'cirurgias';

const STATUS_CIRURGIA = {
    AGENDADA: 'Agendada', NA_SALA: 'Paciente na sala', EM_CIRURGIA: 'Em cirurgia', RPA: 'Em recuperação (RPA)', CONCLUIDA: 'Concluída', CANCELADA: 'Cancelada'
};
const CIRURGIA_EM_ABERTO = ['AGENDADA', 'NA_SALA', 'EM_CIRURGIA', 'RPA'];
const PRIORIDADES_CIRURGIA = { ELETIVA: 'Eletiva', URGENCIA: 'Urgência', EMERGENCIA: 'Emergência' };
const LATERALIDADES = { DIREITA: 'Direita', ESQUERDA: 'Esquerda', BILATERAL: 'Bilateral', NAO_SE_APLICA: 'Não se aplica' };
const FASES_CHECKLIST = { ENTRADA: 'Entrada (antes da anestesia)', PAUSA: 'Pausa cirúrgica (antes da incisão)', SAIDA: 'Saída (antes de deixar a sala)' };
const DESTINOS_RPA = { LEITO: 'Internação (leito)', UTI: 'UTI', ALTA: 'Alta hospitalar', OUTRO: 'Outro destino' };

// Modelo-base do checklist. `CONFIRMA`: só vale "Sim" (ou "Não se aplica" quando `na`); "Não" deixa a fase incompleta e bloqueia o passo seguinte.
// `INFORMA`: pergunta cuja resposta "Sim" ou "Não" é registrada sem bloquear; `nota` pede o detalhe quando a resposta é "Sim".
const CHECKLIST_MODELO = {
    ENTRADA: [
        { id: 'en1', tipo: 'CONFIRMA', rotulo: 'Paciente (ou responsável) confirmou identidade, local da cirurgia, procedimento e consentimento' },
        { id: 'en2', tipo: 'CONFIRMA', na: true, rotulo: 'Local da cirurgia demarcado' },
        { id: 'en3', tipo: 'CONFIRMA', rotulo: 'Verificação de segurança anestésica concluída (equipamentos e medicação)' },
        { id: 'en4', tipo: 'CONFIRMA', rotulo: 'Oxímetro de pulso instalado e funcionando' },
        { id: 'en5', tipo: 'INFORMA', nota: true, rotulo: 'O paciente tem alergia conhecida?' },
        { id: 'en6', tipo: 'INFORMA', nota: true, rotulo: 'Via aérea difícil ou risco de aspiração? (se sim, equipamento e auxílio disponíveis)' },
        { id: 'en7', tipo: 'INFORMA', nota: true, rotulo: 'Risco de perda sanguínea maior que 500 mL (7 mL/kg em crianças)? (se sim, acesso e reserva providenciados)' }
    ],
    PAUSA: [
        { id: 'pa1', tipo: 'CONFIRMA', rotulo: 'Todos os membros da equipe se apresentaram pelo nome e função' },
        { id: 'pa2', tipo: 'CONFIRMA', rotulo: 'Cirurgião, anestesista e enfermagem confirmaram em voz alta paciente, local e procedimento' },
        { id: 'pa3', tipo: 'CONFIRMA', na: true, rotulo: 'Antibiótico profilático administrado nos últimos 60 minutos' },
        { id: 'pa4', tipo: 'INFORMA', nota: true, rotulo: 'Eventos críticos previstos pelo cirurgião (passos críticos, duração, perda de sangue)?' },
        { id: 'pa5', tipo: 'INFORMA', nota: true, rotulo: 'Eventos críticos previstos pela anestesia?' },
        { id: 'pa6', tipo: 'INFORMA', nota: true, rotulo: 'Eventos críticos previstos pela enfermagem (esterilidade, equipamento, outros)?' },
        { id: 'pa7', tipo: 'CONFIRMA', na: true, rotulo: 'Exames de imagem essenciais disponíveis' }
    ],
    SAIDA: [
        { id: 'sa1', tipo: 'CONFIRMA', rotulo: 'Enfermagem confirmou o nome do procedimento realizado' },
        { id: 'sa2', tipo: 'CONFIRMA', rotulo: 'Contagem de instrumentais, compressas e agulhas conferida' },
        { id: 'sa3', tipo: 'CONFIRMA', na: true, rotulo: 'Peças cirúrgicas identificadas' },
        { id: 'sa4', tipo: 'INFORMA', nota: true, rotulo: 'Houve problema com equipamento a ser resolvido?' },
        { id: 'sa5', tipo: 'CONFIRMA', rotulo: 'Cirurgião, anestesista e enfermagem revisaram as preocupações para a recuperação e o cuidado pós-operatório' }
    ]
};

// ============ Regras puras (testáveis) ============

/** Valida a marcação. `paciente` já vem lido do cadastro. */
function validarCirurgia(form, { paciente, agora = new Date() } = {}) {
    if (!paciente) throw new Error('Escolha o paciente.');
    if (paciente.ativo === false) throw new Error('Este paciente está inativo. Reative o cadastro antes de marcar a cirurgia.');
    const texto = (v, max, rotulo, min = 0) => { const t = String(v ?? '').trim(); if (t.length < min) throw new Error(`${rotulo}: mínimo ${min} letras.`); if (t.length > max) throw new Error(`${rotulo}: no máximo ${max} caracteres.`); return t; };
    const procedimento = texto(form.procedimento, 200, 'Procedimento', 3);
    if (!LATERALIDADES[form.lateralidade]) throw new Error('Informe a lateralidade (ou "Não se aplica").');
    if (!PRIORIDADES_CIRURGIA[form.prioridade]) throw new Error('Escolha a prioridade da cirurgia.');
    const cirurgiao = texto(form.cirurgiao, 80, 'Cirurgião', 3);
    const sala = texto(form.sala, 30, 'Sala cirúrgica', 1);
    const data = String(form.data || '').trim();
    if (!dataAgendaValida(data)) throw new Error('Informe a data da cirurgia.');
    if (data < todayISO(agora)) throw new Error('A data da cirurgia não pode ser anterior a hoje.');
    const hora = String(form.hora || '').trim();
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) throw new Error('Informe o horário previsto (formato HH:MM).');
    const bruto = String(form.duracao_min ?? '').trim();
    let duracao_min = '';
    if (bruto !== '') {
        const n = Number(bruto.replace(',', '.'));
        if (!Number.isInteger(n) || n < 10 || n > 1440) throw new Error('Duração prevista: número inteiro de 10 a 1440 minutos.');
        duracao_min = n;
    }
    return { procedimento, lateralidade: form.lateralidade, prioridade: form.prioridade, cirurgiao, anestesista: texto(form.anestesista, 80, 'Anestesista'), equipe: texto(form.equipe, 200, 'Equipe'),
        sala, data, hora, duracao_min, observacao: texto(form.observacao, 300, 'Observação') };
}

/**
 * Confere as respostas de UMA fase do checklist. `respostas`: { [itemId]: { resposta: 'SIM'|'NAO'|'NA', observacao } }.
 * Devolve { itens, completa, pendencias }: `completa` só quando nenhum item "confirma" ficou em "Não". Item sem resposta lança erro.
 */
function avaliarChecklist(fase, respostas, modelo = CHECKLIST_MODELO) {
    const base = modelo[fase];
    if (!base) throw new Error('Fase do checklist desconhecida.');
    const itens = []; const pendencias = [];
    base.forEach((it, n) => {
        const r = (respostas || {})[it.id] || {};
        const resposta = r.resposta;
        const permitidas = it.tipo === 'INFORMA' ? ['SIM', 'NAO'] : (it.na ? ['SIM', 'NAO', 'NA'] : ['SIM', 'NAO']);
        if (!permitidas.includes(resposta)) throw new Error(`Item ${n + 1}: escolha a resposta.`);
        const observacao = String(r.observacao || '').trim();
        if (observacao.length > 200) throw new Error(`Item ${n + 1}: observação com no máximo 200 caracteres.`);
        if (it.tipo === 'CONFIRMA' && resposta === 'NAO') {
            if (observacao.length < 5) throw new Error(`Item ${n + 1}: explique por que não foi confirmado (mínimo 5 letras).`);
            pendencias.push(it.id);
        }
        itens.push({ id: it.id, rotulo: it.rotulo, tipo: it.tipo, resposta, observacao });
    });
    return { itens, completa: pendencias.length === 0, pendencias };
}

/** A última tentativa da fase (a que vale) ou null. */
const ultimaDoChecklist = (c, fase) => { const l = ((c.checklist || {})[fase]) || []; return l.length ? l[l.length - 1] : null; };
const faseConcluida = (c, fase) => { const u = ultimaDoChecklist(c, fase); return Boolean(u && u.completa); };

/** Motivo de a cirurgia ainda não poder começar ('' quando pode). */
function motivoDeNaoIniciar(c) {
    if (!faseConcluida(c, 'ENTRADA')) return 'O checklist de entrada precisa estar completo antes de iniciar a cirurgia.';
    if (!faseConcluida(c, 'PAUSA')) return 'A pausa cirúrgica precisa estar completa antes de iniciar a cirurgia.';
    return '';
}

/** Sinais, observação e (opcional) pontuação de uma avaliação da RPA. */
function validarAvaliacaoRpa(form) {
    const sinais = validarSinaisVitais(form, { exigir: true });
    const observacao = String(form.observacao || '').trim();
    if (observacao.length > 500) throw new Error('Observação: no máximo 500 caracteres.');
    const escala = String(form.escala || '').trim();
    const bruto = String(form.pontuacao ?? '').trim();
    let pontuacao = '';
    if (bruto !== '') {
        const n = Number(bruto.replace(',', '.'));
        if (!Number.isInteger(n) || n < 0 || n > 100) throw new Error('Pontuação: número inteiro de 0 a 100 (a escala é a que o hospital adota).');
        if (escala.length < 2) throw new Error('Informe o nome da escala usada para a pontuação.');
        pontuacao = n;
    }
    if (escala.length > 40) throw new Error('Nome da escala: no máximo 40 caracteres.');
    return { sinais, observacao, escala, pontuacao };
}

/** Alta da RPA: destino, médico responsável e registro no conselho. Exige ao menos uma avaliação registrada. */
function validarAltaRpa(form, c) {
    if (!DESTINOS_RPA[form.destino]) throw new Error('Escolha o destino do paciente.');
    const medico = String(form.medico || '').trim();
    if (medico.length < 3) throw new Error('Informe o médico responsável pela alta da RPA.');
    const registro = String(form.registro_conselho || '').trim();
    if (registro.length < 3) throw new Error('Informe o registro no conselho profissional (ex.: CRM) de quem dá a alta.');
    const obs = String(form.observacao || '').trim();
    if (obs.length > 500) throw new Error('Observação: no máximo 500 caracteres.');
    if (!((c.rpa || {}).avaliacoes || []).length) throw new Error('Registre ao menos uma avaliação na RPA antes de dar a alta.');
    return { destino: form.destino, medico, registro_conselho: registro, observacao: obs };
}

/** Números dos cartões do dia. */
function resumoCentroCirurgico(lista, hoje) {
    const doDia = lista.filter(c => c.data === hoje && c.status !== 'CANCELADA');
    const n = (st) => doDia.filter(c => c.status === st).length;
    return { hoje: doDia.length, agendadas: n('AGENDADA'), na_sala: n('NA_SALA'), em_cirurgia: n('EM_CIRURGIA'), rpa: lista.filter(c => c.status === 'RPA').length, concluidas: n('CONCLUIDA'),
        canceladas: lista.filter(c => c.data === hoje && c.status === 'CANCELADA').length };
}

const ordenarCirurgias = (lista) => [...lista].sort((a, b) => `${a.data} ${a.hora}`.localeCompare(`${b.data} ${b.hora}`) || String(a.sala).localeCompare(String(b.sala), 'pt-BR'));

/** Linhas do relatório de cirurgias (Relatórios › Cirurgias e RPA). */
function relatorioCirurgias(lista, de, ate, termo = '') {
    const t = searchKey(termo);
    const linhas = ordenarCirurgias(lista.filter(c => (!de || c.data >= de) && (!ate || c.data <= ate)
        && (!t || searchKey(`${c.paciente_nome} ${c.prontuario} ${c.procedimento} ${c.cirurgiao} ${c.sala}`).includes(t))));
    const por = (st) => linhas.filter(c => c.status === st).length;
    const incompletos = linhas.filter(c => ['EM_CIRURGIA', 'RPA', 'CONCLUIDA'].includes(c.status) && !['ENTRADA', 'PAUSA', 'SAIDA'].every(f => faseConcluida(c, f) || (f === 'SAIDA' && c.status === 'EM_CIRURGIA'))).length;
    return { linhas, resumo: { total: linhas.length, concluidas: por('CONCLUIDA'), em_andamento: linhas.filter(c => ['NA_SALA', 'EM_CIRURGIA', 'RPA'].includes(c.status)).length,
        agendadas: por('AGENDADA'), canceladas: por('CANCELADA'), checklist_incompleto: incompletos } };
}

/** Relatório no formato comum das telas de relatório (título, colunas, linhas e resumo). */
function relatorioCirurgiasTela(lista, de, ate, termo = '') {
    const r = relatorioCirurgias(lista, de, ate, termo);
    const fase = (c, f) => { const u = ultimaDoChecklist(c, f); return u ? (u.completa ? 'Completo' : 'Incompleto') : '—'; };
    return {
        titulo: 'Cirurgias e RPA',
        descricao: 'Cirurgias do período (a tela carrega os últimos 30 dias e os dias futuros) com a situação do checklist em cada momento e o destino da alta da RPA. "Checklist incompleto" conta cirurgias iniciadas sem uma das fases completas.',
        colunas: [{ k: 'data', label: 'Data' }, { k: 'hora', label: 'Hora' }, { k: 'sala', label: 'Sala' }, { k: 'paciente', label: 'Paciente' }, { k: 'prontuario', label: 'Prontuário' }, { k: 'procedimento', label: 'Procedimento' },
            { k: 'cirurgiao', label: 'Cirurgião' }, { k: 'situacao', label: 'Situação' }, { k: 'entrada', label: 'Entrada' }, { k: 'pausa', label: 'Pausa' }, { k: 'saida', label: 'Saída' }, { k: 'rpa', label: 'Alta da RPA' }],
        linhas: r.linhas.map(c => ({ data: formatDateBR(c.data), hora: c.hora, sala: c.sala, paciente: c.paciente_nome, prontuario: c.prontuario || '—', procedimento: c.procedimento, cirurgiao: c.cirurgiao,
            situacao: STATUS_CIRURGIA[c.status] || c.status, entrada: fase(c, 'ENTRADA'), pausa: fase(c, 'PAUSA'), saida: fase(c, 'SAIDA'), rpa: c.rpa && c.rpa.alta ? DESTINOS_RPA[c.rpa.alta.destino] : '—' })),
        resumo: [{ rot: 'Cirurgias', valor: r.resumo.total }, { rot: 'Concluídas', valor: r.resumo.concluidas }, { rot: 'Em andamento', valor: r.resumo.em_andamento }, { rot: 'Agendadas', valor: r.resumo.agendadas },
            { rot: 'Canceladas', valor: r.resumo.canceladas }, { rot: 'Checklist incompleto', valor: r.resumo.checklist_incompleto }]
    };
}

// ============ Gravação (Firestore) ============

const slotsDaSala = (c) => [{ chave: chaveSlot('sala', searchKey(c.sala), c.data, c.hora), msg: `A sala ${c.sala} já tem cirurgia marcada nesse dia e horário.` }];

/** Marca a cirurgia (e trava a sala no dia e horário). */
async function agendarCirurgia(form) {
    requirePermission('cirurgia_gerenciar');
    const database = requireDb();
    const paciente = await db_getPaciente(form.paciente_id);
    const v = validarCirurgia(form, { paciente });
    const user = state.currentUser;
    const agora = nowISO();
    const cirurgia = {
        id: newId('cir'), ...v, paciente_id: paciente.id, paciente_nome: paciente.nome, prontuario: paciente.prontuario || '',
        status: 'AGENDADA', checklist: { ENTRADA: [], PAUSA: [], SAIDA: [] }, complementos: [],
        criado_em: agora, criado_por: user.username, criado_por_nome: user.name,
        historico: [{ evento: 'AGENDADA', status: 'AGENDADA', em: agora, por: user.username, por_nome: user.name, motivo: 'Cirurgia marcada' }]
    };
    await database.runTransaction(async (tx) => {
        const gravar = await reservarHorarios(tx, database, cirurgia, '', slotsDaSala(cirurgia));
        gravar();
        tx.set(database.collection(COL_CIRURGIAS).doc(cirurgia.id), cirurgia);
    });
    await auditar({ entidade: 'cirurgia', entidade_id: cirurgia.id, acao: 'AGENDAR', depois: { paciente: paciente.id, procedimento: v.procedimento, sala: v.sala, data: v.data, hora: v.hora } });
    return cirurgia;
}

/**
 * Muda a cirurgia numa transação: relê o documento, confere a situação esperada (duas pessoas clicando ao mesmo tempo não passam as duas),
 * grava e acrescenta ao histórico. `mudar(c, {agora, user})` devolve { novo, motivo?, evento?, liberarSala?, depois? }.
 */
async function transitarCirurgia(id, { permissao, de, mudar, acao }) {
    requirePermission(permissao);
    const database = requireDb();
    const user = state.currentUser;
    const agora = nowISO();
    const ref = database.collection(COL_CIRURGIAS).doc(String(id));
    let resultado;
    await database.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error('Cirurgia não encontrada.');
        const c = { id: snap.id, ...snap.data() };
        if (!de.includes(c.status)) throw new Error(`Esta cirurgia está "${STATUS_CIRURGIA[c.status] || c.status}" e não pode receber esta ação agora. Atualize a tela.`);
        const r = mudar(c, { agora, user });
        const status = r.novo.status || c.status;
        const liberar = r.liberarSala ? await lerHorariosParaLiberar(tx, database, c, slotsDaSala(c)) : null;
        const historico = [...(c.historico || []), { evento: r.evento || acao, status, em: agora, por: user.username, por_nome: user.name, motivo: r.motivo || '' }];
        const gravado = { ...c, ...r.novo, historico };
        if (liberar) liberar();
        tx.set(ref, gravado);
        resultado = { antes: { status: c.status }, depois: r.depois || { status }, cirurgia: gravado, motivo: r.motivo || '' };
    });
    await auditar({ entidade: 'cirurgia', entidade_id: id, acao, antes: resultado.antes, depois: resultado.depois, motivo: resultado.motivo });
    return resultado.cirurgia;
}

const receberNaSala = (id) => transitarCirurgia(id, {
    permissao: 'cirurgia_gerenciar', de: ['AGENDADA'], acao: 'NA_SALA',
    mudar: (c, { agora, user }) => ({ novo: { status: 'NA_SALA', na_sala_em: agora, na_sala_por: user.username }, motivo: `Paciente recebido na sala ${c.sala}` })
});

function cancelarCirurgia(id, motivo) {
    const texto = String(motivo || '').trim();
    if (texto.length < 5) return Promise.reject(new Error('Informe o motivo do cancelamento (mínimo 5 letras).'));
    return transitarCirurgia(id, {
        permissao: 'cirurgia_gerenciar', de: ['AGENDADA', 'NA_SALA'], acao: 'CANCELAR',
        mudar: (c, { agora, user }) => ({ novo: { status: 'CANCELADA', cancelada_em: agora, cancelada_por: user.username, motivo_cancelamento: texto }, motivo: texto, liberarSala: true })
    });
}

/**
 * Assina uma fase do checklist (entrada, pausa ou saída). Cada registro é uma tentativa nova que nunca altera as anteriores; vale a última.
 * Entrada e pausa: paciente já na sala; saída: cirurgia em andamento.
 */
function registrarChecklist(id, fase, respostas, registroConselho) {
    if (!FASES_CHECKLIST[fase]) return Promise.reject(new Error('Fase do checklist desconhecida.'));
    const registro = String(registroConselho || '').trim();
    if (registro.length < 3) return Promise.reject(new Error('Informe o seu registro no conselho profissional para assinar o checklist.'));
    let ava;
    try { ava = avaliarChecklist(fase, respostas); } catch (err) { return Promise.reject(err); }
    return transitarCirurgia(id, {
        permissao: 'cirurgia_registrar', de: fase === 'SAIDA' ? ['EM_CIRURGIA'] : ['NA_SALA'], acao: `CHECKLIST_${fase}`,
        mudar: (c, { agora, user }) => {
            const tentativa = { ...ava, por: user.username, por_nome: user.name, perfil: user.role, registro_conselho: registro, em: agora };
            const lista = [...((c.checklist || {})[fase] || []), tentativa];
            return { novo: { checklist: { ...(c.checklist || {}), [fase]: lista } }, evento: `CHECKLIST_${fase}`,
                motivo: `${FASES_CHECKLIST[fase]}: ${ava.completa ? 'completo' : 'incompleto (' + ava.pendencias.length + ' pendência(s))'}`, depois: { fase, completa: ava.completa, tentativa: lista.length } };
        }
    });
}

/** Correção ou esclarecimento sobre um checklist já assinado: entra como complemento, sem alterar o registro original. */
function complementarChecklist(id, fase, texto, registroConselho) {
    const t = String(texto || '').trim();
    if (t.length < 5) return Promise.reject(new Error('Escreva o complemento (mínimo 5 letras).'));
    if (t.length > 500) return Promise.reject(new Error('Complemento: no máximo 500 caracteres.'));
    if (String(registroConselho || '').trim().length < 3) return Promise.reject(new Error('Informe o seu registro no conselho profissional.'));
    return transitarCirurgia(id, {
        permissao: 'cirurgia_registrar', de: ['NA_SALA', 'EM_CIRURGIA', 'RPA', 'CONCLUIDA'], acao: 'CHECKLIST_COMPLEMENTO',
        mudar: (c, { agora, user }) => ({ novo: { complementos: [...(c.complementos || []), { fase, texto: t, por: user.username, por_nome: user.name, registro_conselho: String(registroConselho).trim(), em: agora }] },
            evento: 'CHECKLIST_COMPLEMENTO', motivo: `Complemento ao checklist (${FASES_CHECKLIST[fase] || fase})` })
    });
}

const iniciarCirurgia = (id) => transitarCirurgia(id, {
    permissao: 'cirurgia_registrar', de: ['NA_SALA'], acao: 'INICIAR',
    mudar: (c, { agora, user }) => {
        const bloqueio = motivoDeNaoIniciar(c);
        if (bloqueio) throw new Error(bloqueio);
        return { novo: { status: 'EM_CIRURGIA', inicio_em: agora, inicio_por: user.username }, motivo: 'Cirurgia iniciada' };
    }
});

/** Fim da cirurgia: exige a saída completa e abre a RPA. */
const encaminharParaRpa = (id) => transitarCirurgia(id, {
    permissao: 'cirurgia_registrar', de: ['EM_CIRURGIA'], acao: 'ENCAMINHAR_RPA',
    mudar: (c, { agora, user }) => {
        if (!faseConcluida(c, 'SAIDA')) throw new Error('O checklist de saída precisa estar completo antes de encaminhar o paciente para a RPA.');
        return { novo: { status: 'RPA', fim_em: agora, fim_por: user.username, rpa: { entrada_em: agora, avaliacoes: [] } }, motivo: 'Cirurgia encerrada; paciente encaminhado à RPA' };
    }
});

/** Acrescenta uma avaliação à RPA (nunca altera as anteriores). */
function registrarAvaliacaoRpa(id, form) {
    let v;
    try { v = validarAvaliacaoRpa(form); } catch (err) { return Promise.reject(err); }
    return transitarCirurgia(id, {
        permissao: 'cirurgia_registrar', de: ['RPA'], acao: 'RPA_AVALIACAO',
        mudar: (c, { agora, user }) => {
            const rpa = c.rpa || { entrada_em: agora, avaliacoes: [] };
            const av = { em: agora, por: user.username, por_nome: user.name, perfil: user.role, valores: v.sinais.valores, aferido: v.sinais.aferido, motivo_nao_aferido: v.sinais.motivo_nao_aferido,
                observacao: v.observacao, escala: v.escala, pontuacao: v.pontuacao };
            return { novo: { rpa: { ...rpa, avaliacoes: [...rpa.avaliacoes, av] } }, evento: 'RPA_AVALIACAO', motivo: 'Avaliação na RPA registrada', depois: { avaliacoes: rpa.avaliacoes.length + 1 } };
        }
    });
}

function darAltaDaRpa(id, form) {
    return transitarCirurgia(id, {
        permissao: 'cirurgia_registrar', de: ['RPA'], acao: 'RPA_ALTA',
        mudar: (c, { agora, user }) => {
            const v = validarAltaRpa(form, c);
            return { novo: { status: 'CONCLUIDA', concluida_em: agora, rpa: { ...c.rpa, alta: { ...v, em: agora, por: user.username, por_nome: user.name } } },
                motivo: `Alta da RPA: ${DESTINOS_RPA[v.destino]}`, depois: { status: 'CONCLUIDA', destino: v.destino } };
        }
    });
}
