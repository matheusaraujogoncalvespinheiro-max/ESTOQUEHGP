// Enfermagem (Etapa 6): sinais vitais do internado, aprazamento e checagem de medicação e cuidados, passagem de plantão.
//
// O QUE É: a enfermagem recebe a prescrição que o médico (ou o enfermeiro, no caso de cuidados) assinou no prontuário, define os
// horários (aprazamento), checa cada horário (administrado/realizado ou não, com motivo) e passa o plantão com a fotografia das
// pendências. Cada checagem registra QUEM fez e QUANDO; nada é apagado.
//
// O QUE NÃO É: o sistema não calcula dose, não decide horário padrão nem sugere conduta. Os horários vêm de quem apraza (ou de uma
// regra aritmética "a cada X horas, N vezes" escolhida por essa pessoa), e os limites abaixo servem só para barrar erro de digitação.
// Não distingue enfermeiro de técnico (o perfil é um só) nem exige dupla checagem: ambos dependem do hospital (ver docs/pendencias.md).

const CHECAGEM_TIPOS = { MEDICAMENTO: 'Medicação', CUIDADO: 'Cuidado' };
const STATUS_CHECAGEM = { PENDENTE: 'Pendente', FEITO: 'Feito', NAO_FEITO: 'Não feito', SUSPENSO: 'Suspenso' };
const MOTIVOS_NAO_FEITO = {
    RECUSA: 'Paciente recusou',
    AUSENTE: 'Paciente fora do leito (exame ou procedimento)',
    INDISPONIVEL: 'Medicamento ou material indisponível',
    CONDICAO: 'Condição do paciente alterada',
    OUTRO: 'Outro motivo'
};
// Limites de DIGITAÇÃO do aprazamento (não são regra clínica): impedem horário no ano errado ou 500 doses por engano.
const LIMITES_APRAZAMENTO = { passadoHoras: 24, futuroDias: 14, maxHorarios: 60, intervaloMin: 1, intervaloMax: 48 };
const TURNOS_ENFERMAGEM = ['Manhã', 'Tarde', 'Noite', 'Diurno (12 h)', 'Noturno (12 h)'];   // lista de apoio: o hospital deve confirmar os seus turnos
const CATEGORIAS_ENFERMAGEM = ['Enfermeiro(a)', 'Técnico(a) de Enfermagem'];                // categorias do cadastro de funcionários que entram na escala

/**
 * Escala de Enfermagem: ninguém aparece em duas unidades no mesmo dia e turno, nem duas vezes na mesma equipe.
 * `nomeDe(id)` só serve para escrever a mensagem. Devolve a lista de erros no formato do motor de cadastros.
 */
function validarEscalaEnfermagem(form, id, escalas, nomeDe = (x) => x) {
    const erros = [];
    const ids = (form.integrantes || []).map(i => i.funcionario).filter(Boolean);
    if (ids.some((x, n) => ids.indexOf(x) !== n)) erros.push({ campo: 'integrantes', mensagem: 'Há profissional repetido nos integrantes da equipe.' });
    if (form.responsavel && ids.includes(form.responsavel)) erros.push({ campo: 'integrantes', mensagem: 'O responsável do plantão não precisa constar também nos integrantes.' });
    const equipe = new Set([form.responsavel, ...ids].filter(Boolean));
    if (form.data && form.turno) {
        (escalas || []).filter(e => e.id !== id && e.ativo !== false && e.data === form.data && e.turno === form.turno && e.unidade !== form.unidade).forEach(e => {
            [...new Set([e.responsavel, ...(e.integrantes || []).map(i => i.funcionario)].filter(x => x && equipe.has(x)))]
                .forEach(x => erros.push({ campo: 'integrantes', mensagem: `${nomeDe(x)} já está escalado(a) em ${e.unidade} neste dia e turno.` }));
        });
    }
    return erros;
}

/** Escalas ativas de uma data (e unidade, se informada), para o painel mostrar quem está de plantão. */
const escalasDoDia = (escalas, dia, unidade = '') => (escalas || []).filter(e => e.ativo !== false && e.data === dia && (!unidade || e.unidade === unidade))
    .sort((a, b) => TURNOS_ENFERMAGEM.indexOf(a.turno) - TURNOS_ENFERMAGEM.indexOf(b.turno) || String(a.unidade).localeCompare(String(b.unidade), 'pt-BR', { numeric: true }));

/** "Administrado", "Não realizado"... conforme o tipo da checagem. */
function rotuloChecagem(c) {
    if (!c) return '';
    if (c.status === 'FEITO') return c.tipo === 'CUIDADO' ? 'Realizado' : 'Administrado';
    if (c.status === 'NAO_FEITO') return c.tipo === 'CUIDADO' ? 'Não realizado' : 'Não administrado';
    return STATUS_CHECAGEM[c.status] || c.status;
}

/** Situação para a tela: pendente que passou do horário é ATRASADA (sem tolerância: a tolerância do hospital ainda não foi informada). */
const situacaoDaChecagem = (c, agora = new Date()) => (c.status === 'PENDENTE' ? (new Date(c.previsto_em) < agora ? 'ATRASADA' : 'PREVISTA') : c.status);

/** Texto das alergias para o alerta antes de administrar (o sistema não cruza medicamento com alergia: quem administra confere). */
function textoDasAlergias(registros) {
    const lista = separarAlergias(registros).ativas.map(r => String(r.texto || '').replace(/^Agente: /, '')).filter(Boolean);   // só as ativas (#30)
    return lista.length ? lista.join(' | ') : '';
}
async function alergiasDoPaciente(pacienteId) {
    requirePermission('enfermagem_ver');
    return textoDasAlergias(await db_alergiasDoPaciente(pacienteId));
}
/** Alergias ATIVAS do paciente (registros), para o alerta e o cruzamento com o medicamento. */
async function alergiasAtivasDoPaciente(pacienteId) {
    requirePermission('enfermagem_ver');
    return separarAlergias(await db_alergiasDoPaciente(pacienteId)).ativas;
}

/** Valor de um campo datetime-local ("2026-11-23T08:00") a partir de um instante ISO, no horário local. */
function isoParaCampoLocal(iso) {
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ============ Aprazamento (regras puras) ============

/**
 * Lê um horário "AAAA-MM-DDTHH:MM" (campo datetime-local, horário local) ou ISO completo. Só aceita esse formato (o Date do navegador
 * aceita textos soltos como "ontem às 8") e confere que o dia existe (30 de fevereiro não vira 2 de março). Devolve Date ou null.
 */
function lerHorario(texto) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/.exec(String(texto || '').trim());
    if (!m) return null;
    const [, a, mes, dia, h, min] = m.map(Number);
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || h > 23 || min > 59) return null;
    if (new Date(Date.UTC(a, mes - 1, dia)).getUTCDate() !== dia) return null;
    const d = new Date(String(texto).trim());
    return Number.isNaN(d.getTime()) ? null : d;
}

/** Valida a lista de horários digitados (formato do campo de data e hora) e devolve ISO ordenado, sem repetidos. */
function validarHorarios(lista, agora = new Date()) {
    const L = LIMITES_APRAZAMENTO;
    const itens = (lista || []).map(h => String(h || '').trim()).filter(Boolean);
    if (!itens.length) throw new Error('Informe ao menos um horário.');
    if (itens.length > L.maxHorarios) throw new Error(`No máximo ${L.maxHorarios} horários por aprazamento.`);
    const datas = itens.map((h, n) => { const d = lerHorario(h); if (!d) throw new Error(`Horário ${n + 1} inválido.`); return d; });
    const minimo = agora.getTime() - L.passadoHoras * 3600000;
    const maximo = agora.getTime() + L.futuroDias * 86400000;
    datas.forEach((d, n) => {
        if (d.getTime() < minimo) throw new Error(`Horário ${n + 1}: anterior a ${L.passadoHoras} h atrás. Confira a data.`);
        if (d.getTime() > maximo) throw new Error(`Horário ${n + 1}: além de ${L.futuroDias} dias. Aprazamentos mais longos devem ser refeitos depois.`);
    });
    const chaves = datas.map(d => d.toISOString().slice(0, 16));
    if (new Set(chaves).size !== chaves.length) throw new Error('Há horários repetidos.');
    return datas.map(d => d.toISOString()).sort();
}

/** "A cada X horas, N vezes, a partir de ...": só aritmética de horários escolhida por quem apraza. Devolve ISO. */
function gerarHorarios({ inicio, intervalo_horas, quantidade }) {
    const L = LIMITES_APRAZAMENTO;
    const ini = lerHorario(inicio);
    if (!ini) throw new Error('Informe o primeiro horário.');
    const passo = Number(String(intervalo_horas).replace(',', '.'));
    if (!Number.isFinite(passo) || passo < L.intervaloMin || passo > L.intervaloMax) throw new Error(`Intervalo entre os horários: de ${L.intervaloMin} a ${L.intervaloMax} horas.`);
    const n = Number(quantidade);
    if (!Number.isInteger(n) || n < 1 || n > L.maxHorarios) throw new Error(`Quantidade de horários: de 1 a ${L.maxHorarios}.`);
    return Array.from({ length: n }, (_, i) => new Date(ini.getTime() + Math.round(i * passo * 3600000)).toISOString());
}

/** Item da prescrição (medicamento) ou de cuidados, em texto único. */
const textoDoItemCuidado = (i) => [i.cuidado, i.frequencia, i.observacao && `(${i.observacao})`].filter(Boolean).join(' · ');
const textoDoItemAprazavel = (tipo, item) => (tipo === 'CUIDADO' ? textoDoItemCuidado(item) : textoDoItemPrescricao(item));

/** Prescrição de cuidados por item: cuidado, frequência e observação. */
function validarItensCuidados(itens) {
    const lista = (itens || []).filter(i => String(i.cuidado || '').trim());
    if (!lista.length) throw new Error('Inclua ao menos um cuidado.');
    return lista.map((i, n) => {
        const item = { cuidado: String(i.cuidado || '').trim(), frequencia: String(i.frequencia || '').trim(), observacao: String(i.observacao || '').trim() };
        if (item.cuidado.length < 3) throw new Error(`Cuidado ${n + 1}: descreva o cuidado (mínimo 3 letras).`);
        if (item.cuidado.length > 160) throw new Error(`Cuidado ${n + 1}: no máximo 160 caracteres.`);
        if (!item.frequencia) throw new Error(`Cuidado ${n + 1}: informe a frequência.`);
        return item;
    });
}

/** Documentos de checagem de um item: uma linha por horário. O id é determinístico (item + horário), então não duplica. */
function montarChecagens(reg, idx, horariosISO, internacao, user, agora) {
    const item = (reg.itens || [])[idx];
    if (!item) throw new Error('Item da prescrição não encontrado.');
    const tipo = reg.tipo === 'CUIDADO' ? 'CUIDADO' : 'MEDICAMENTO';
    const texto = textoDoItemAprazavel(tipo, item);
    return horariosISO.map(h => ({
        id: `chk_${reg.id}_${idx}_${h.slice(0, 16).replace(/[-:T]/g, '')}`,
        tipo, status: 'PENDENTE', registro_id: reg.id, item_idx: idx, item_texto: texto,
        medicamento: tipo === 'MEDICAMENTO' ? item.medicamento : '', dose: tipo === 'MEDICAMENTO' ? item.dose : '', via: tipo === 'MEDICAMENTO' ? (item.via || '') : '',
        paciente_id: reg.paciente_id, paciente_nome: internacao.paciente_nome || '', internacao_id: internacao.id, leito_id: internacao.leito_id, ala: internacao.ala || '',
        previsto_em: h, dia: diaLocalDe(h), aprazado_em: agora, aprazado_por: user.username, aprazado_por_nome: user.name
    }));
}

/** Valida o resultado de uma checagem. Não feito exige tipo e descrição do motivo. */
function validarDecisaoChecagem(form) {
    const resultado = form.resultado;
    if (!['FEITO', 'NAO_FEITO'].includes(resultado)) throw new Error('Escolha o resultado da checagem.');
    const observacao = String(form.observacao || '').trim();
    if (observacao.length > 300) throw new Error('Observação: no máximo 300 caracteres.');
    const conselho = String(form.registro_conselho || '').trim();
    if (conselho.length > 30) throw new Error('Registro no conselho: no máximo 30 caracteres.');
    // Lote administrado (#48): opcional; quando a farmácia dispensou lotes deste item, o informado precisa ser um deles (se não bater, a enfermagem confere antes de registrar).
    const lote = String(form.lote || '').trim();
    if (lote.length > 40) throw new Error('Lote: no máximo 40 caracteres.');
    if (lote && Array.isArray(form.lotes_dispensados) && form.lotes_dispensados.length && !form.lotes_dispensados.includes(lote)) throw new Error('Este lote não consta entre os dispensados pela farmácia para este item. Confira o lote.');
    const decisao = { resultado, observacao, registro_conselho: conselho, motivo_tipo: '', motivo_texto: '', lote_administrado: resultado === 'FEITO' ? lote : '' };
    if (resultado === 'NAO_FEITO') {
        if (!MOTIVOS_NAO_FEITO[form.motivo_tipo]) throw new Error('Escolha o motivo de não ter sido feito.');
        const texto = String(form.motivo_texto || '').trim();
        if (texto.length < 5) throw new Error('Descreva o motivo (mínimo 5 letras).');
        if (texto.length > 300) throw new Error('Motivo: no máximo 300 caracteres.');
        decisao.motivo_tipo = form.motivo_tipo; decisao.motivo_texto = texto;
    }
    return decisao;
}

/** Pendências para os cartões: atrasadas, próximas (janela escolhida) e quantas foram feitas no dia. */
function resumoChecagens(lista, agora = new Date(), janelaMin = 120) {
    const r = { atrasadas: 0, proximas: 0, pendentes: 0, feitas: 0, nao_feitas: 0 };
    lista.forEach(c => {
        if (c.status === 'PENDENTE') {
            r.pendentes++;
            const t = new Date(c.previsto_em);
            if (t < agora) r.atrasadas++; else if (t.getTime() - agora.getTime() <= janelaMin * 60000) r.proximas++;
        } else if (c.status === 'FEITO') r.feitas++;
        else if (c.status === 'NAO_FEITO') r.nao_feitas++;
    });
    return r;
}

/** Une as pendentes de qualquer dia com as do dia (sem repetir; a versão do dia vence, pois pode já estar decidida). */
function todasChecagens() {
    const m = new Map();
    (MOCK_DATA.CHECAGENS_PEND || []).forEach(c => m.set(c.id, c));
    (MOCK_DATA.CHECAGENS_DIA || []).forEach(c => m.set(c.id, c));
    return [...m.values()];
}

/** Checagens que valem agora: só de internações ativas (alta ou outra saída tira o paciente da lista). */
function checagensDasInternacoesAtivas(lista = todasChecagens()) {
    const ativas = new Set((MOCK_DATA.INTERNACOES || []).filter(i => i.status === 'ATIVA').map(i => i.id));
    return lista.filter(c => ativas.has(c.internacao_id));
}

/** Itens de prescrição (medicamento e cuidados) das internações ativas, com quantas checagens cada um já tem. */
function itensParaAprazar(registros, internacoes, checagens) {
    const ativas = new Map(internacoes.filter(i => i.status === 'ATIVA').map(i => [i.id, i]));
    const linhas = [];
    registros.filter(r => !r.complementa_id && ativas.has(r.internacao_id)).forEach(reg => {
        (reg.itens || []).forEach((item, idx) => {
            const cs = checagens.filter(c => c.registro_id === reg.id && c.item_idx === idx);
            linhas.push({
                registro: reg, idx, item, internacao: ativas.get(reg.internacao_id), tipo: reg.tipo === 'CUIDADO' ? 'CUIDADO' : 'MEDICAMENTO',
                texto: textoDoItemAprazavel(reg.tipo === 'CUIDADO' ? 'CUIDADO' : 'MEDICAMENTO', item),
                pendentes: cs.filter(c => c.status === 'PENDENTE').length, feitas: cs.filter(c => c.status === 'FEITO').length, nao_feitas: cs.filter(c => c.status === 'NAO_FEITO').length, suspensas: cs.filter(c => c.status === 'SUSPENSO').length
            });
        });
    });
    return linhas.sort((a, b) => String(b.registro.em).localeCompare(String(a.registro.em)));
}

// ============ Gravação (Firestore) ============

/** Aprazamento: cria uma checagem por horário para um item de prescrição ou de cuidados da internação ativa. */
async function aprazarItem(registroId, idx, horarios) {
    requirePermission('enfermagem_registrar');
    const reg = ((MOCK_DATA.PRESCRICOES_MED || []).concat(MOCK_DATA.PRESCRICOES_CUIDADO || [])).find(r => r.id === registroId) || await getDocH(COLH.REGISTROS, registroId);
    if (!reg || !['PRESCRICAO', 'CUIDADO'].includes(reg.tipo)) throw new Error('Prescrição não encontrada.');
    if (reg.complementa_id) throw new Error('Apraze o item da prescrição original.');
    const internacao = await getDocH(COLH.INTERNACOES, reg.internacao_id);
    if (!internacao || internacao.status !== 'ATIVA') throw new Error('Só é possível aprazar prescrição de paciente com internação ativa.');
    const iso = validarHorarios(horarios, new Date());
    const user = state.currentUser;
    const agora = nowISO();
    const docs = montarChecagens(reg, Number(idx), iso, internacao, { username: user.username, name: user.name }, agora);
    const criadas = await db_criarChecagens(docs);
    await auditar({ entidade: 'checagem', entidade_id: reg.id, acao: 'APRAZAR', depois: { item: Number(idx), horarios: criadas, internacao: internacao.id, paciente: reg.paciente_id } });
    return { criadas, repetidas: docs.length - criadas };
}

/** Checagem: administrado/realizado ou não, com quem e quando. */
async function registrarChecagem(id, form) {
    requirePermission('enfermagem_registrar');
    const d = validarDecisaoChecagem(form);
    const user = state.currentUser;
    const agora = nowISO();
    const r = await db_decidirChecagem(id, (atual) => ({
        ...atual, status: d.resultado, feito_em: agora, feito_por: user.username, feito_por_nome: user.name, feito_por_perfil: user.role,
        registro_conselho: d.registro_conselho, observacao: d.observacao, motivo_tipo: d.motivo_tipo, motivo_texto: d.motivo_texto, lote_administrado: d.lote_administrado
    }));
    await auditar({ entidade: 'checagem', entidade_id: id, acao: r.status === 'FEITO' ? 'CHECAR_FEITO' : 'CHECAR_NAO_FEITO', depois: { tipo: r.tipo, item: r.item_texto, paciente: r.paciente_id, previsto: r.previsto_em, motivo: r.motivo_tipo }, motivo: d.motivo_texto });
    return r;
}

/** Suspende os horários ainda pendentes de um item (a prescrição mudou ou o tratamento terminou). Enfermagem ou médico. */
async function suspenderChecagens(registroId, idx, motivo) {
    if (!hasPermission('enfermagem_registrar') && !hasPermission('prescrever')) throw new Error('Acesso negado: seu perfil não tem permissão para esta operação.');
    const texto = String(motivo || '').trim();
    if (texto.length < 5) throw new Error('Informe o motivo da suspensão (mínimo 5 letras).');
    if (texto.length > 300) throw new Error('Motivo: no máximo 300 caracteres.');
    const ids = (MOCK_DATA.CHECAGENS_PEND || []).filter(c => c.registro_id === registroId && c.item_idx === Number(idx)).map(c => c.id);
    if (!ids.length) throw new Error('Não há horários pendentes neste item.');
    const user = state.currentUser;
    const n = await db_suspenderChecagens(ids, { status: 'SUSPENSO', suspenso_em: nowISO(), suspenso_por: user.username, suspenso_por_nome: user.name, motivo_suspensao: texto });
    await auditar({ entidade: 'checagem', entidade_id: registroId, acao: 'SUSPENDER', depois: { item: Number(idx), horarios: n }, motivo: texto });
    return n;
}

/**
 * Alta ou saída: o que ainda estava pendente deixa de valer. Consulta o banco (quem dá a alta pode nem ter a enfermagem aberta) e não
 * bloqueia a alta se falhar: a tela já ignora checagem de internação encerrada.
 */
async function encerrarChecagensDaInternacao(internacaoId, motivo = 'Alta do paciente') {
    const snap = await requireDb().collection(COLE.CHECAGENS).where('internacao_id', '==', String(internacaoId)).get();
    const ids = snap.docs.filter(d => d.data().status === 'PENDENTE').map(d => d.id);
    if (!ids.length) return 0;
    const user = state.currentUser;
    return db_suspenderChecagens(ids, { status: 'SUSPENSO', suspenso_em: nowISO(), suspenso_por: user.username, suspenso_por_nome: user.name, motivo_suspensao: motivo });
}

// ============ Sinais vitais do internado ============

/** Sinais vitais de quem está internado: mesmas faixas de digitação da triagem; pode informar a hora da medição (até 24 h atrás). */
function montarSinaisInternado(internacao, form, user, agora = new Date()) {
    const sinais = validarSinaisVitais(form, { exigir: true });
    const bruto = String(form.medido_em || '').trim();
    let medido = agora;
    if (bruto) {
        medido = new Date(bruto);
        if (Number.isNaN(medido.getTime())) throw new Error('Hora da medição inválida.');
        if (medido.getTime() > agora.getTime() + 60000) throw new Error('A hora da medição não pode ser futura.');
        if (medido.getTime() < agora.getTime() - 24 * 3600000) throw new Error('A medição é de mais de 24 h atrás: registre o fato como evolução.');
    }
    const observacao = String(form.observacao || '').trim();
    if (observacao.length > 300) throw new Error('Observação: no máximo 300 caracteres.');
    return {
        id: newId('sv'), paciente_id: internacao.paciente_id, internacao_id: internacao.id, leito_id: internacao.leito_id,
        valores: sinais.valores, aferido: sinais.aferido, motivo_nao_aferido: sinais.motivo_nao_aferido, observacao,
        medido_em: medido.toISOString(), dia: diaLocalDe(medido), em: agora.toISOString(), por: user.username, por_nome: user.name, perfil: user.role
    };
}

async function registrarSinaisInternado(internacaoId, form) {
    requirePermission('enfermagem_registrar');
    const internacao = (MOCK_DATA.INTERNACOES || []).find(i => i.id === internacaoId) || await getDocH(COLH.INTERNACOES, internacaoId);
    if (!internacao || internacao.status !== 'ATIVA') throw new Error('O paciente não tem internação ativa.');
    const doc = montarSinaisInternado(internacao, form, state.currentUser, new Date());
    await setDocH(COLE.SINAIS, doc);
    await auditar({ entidade: 'sinais_vitais', entidade_id: doc.id, acao: 'REGISTRAR', depois: { paciente: doc.paciente_id, internacao: doc.internacao_id, aferido: doc.aferido } });
    return doc;
}

/** Último registro de sinais de um paciente (entre os carregados: hoje e ontem). */
const ultimoSinalDoPaciente = (pacienteId, lista = MOCK_DATA.SINAIS_VITAIS || []) =>
    lista.filter(s => s.paciente_id === pacienteId).sort((a, b) => String(b.medido_em).localeCompare(String(a.medido_em)))[0] || null;

// ============ Passagem de plantão ============

/**
 * Fotografia para a passagem: cada paciente da unidade com leito, último sinal e pendências no momento. Os recados vêm de quem passa
 * o plantão (recados = { [internacao_id]: texto }). Pura: recebe tudo pronto.
 */
function montarPassagem({ unidade, turno, geral = '', registro_conselho = '', recados = {} }, { internacoes, checagens, sinais, agora = new Date() }, user) {
    if (!unidade) throw new Error('Escolha a unidade (ala).');
    if (!TURNOS_ENFERMAGEM.includes(turno)) throw new Error('Escolha o turno.');
    const conselho = String(registro_conselho || '').trim();
    if (conselho.length < 3) throw new Error('Informe o seu registro no conselho (COREN) para assinar a passagem.');
    const texto = String(geral || '').trim();
    if (texto.length > 1000) throw new Error('Observações gerais: no máximo 1000 caracteres.');
    const ativos = internacoes.filter(i => i.status === 'ATIVA' && i.ala === unidade).sort((a, b) => String(a.leito_id).localeCompare(String(b.leito_id), 'pt-BR', { numeric: true }));
    const pacientes = ativos.map(i => {
        const recado = String(recados[i.id] || '').trim();
        if (recado.length > 500) throw new Error(`Recado de ${i.paciente_nome}: no máximo 500 caracteres.`);
        const cs = checagens.filter(c => c.internacao_id === i.id);
        const resumo = resumoChecagens(cs, agora);
        const s = ultimoSinalDoPaciente(i.paciente_id, sinais);
        return {
            internacao_id: i.id, paciente_id: i.paciente_id, paciente_nome: i.paciente_nome, leito_id: i.leito_id, leito: (leitoPorId(i.leito_id) || { rotulo: i.leito_id }).rotulo,
            recado, atrasadas: resumo.atrasadas, pendentes: resumo.pendentes, nao_feitas: resumo.nao_feitas,
            ultimo_sinal: s ? { em: s.medido_em, texto: s.aferido ? resumoSinais(s.valores) : `Não aferido: ${s.motivo_nao_aferido}` } : null
        };
    });
    if (!pacientes.length && !texto) throw new Error('Não há pacientes internados nesta unidade. Escreva a observação geral para registrar a passagem.');
    return {
        id: newId('plt'), dia: todayISO(agora), unidade, turno, geral: texto, pacientes, registro_conselho: conselho,
        criado_em: agora.toISOString(), passado_por: user.username, passado_por_nome: user.name, recebido_por: '', recebido_por_nome: '', recebido_em: ''
    };
}

async function registrarPassagem(form) {
    requirePermission('enfermagem_registrar');
    const doc = montarPassagem(form, { internacoes: MOCK_DATA.INTERNACOES || [], checagens: checagensDasInternacoesAtivas(), sinais: MOCK_DATA.SINAIS_VITAIS || [], agora: new Date() }, state.currentUser);
    await setDocH(COLE.PLANTOES, doc);
    await auditar({ entidade: 'plantao', entidade_id: doc.id, acao: 'PASSAR', depois: { unidade: doc.unidade, turno: doc.turno, pacientes: doc.pacientes.length } });
    return doc;
}

/** Quem recebe é outra pessoa: ninguém dá ciência da própria passagem. */
async function receberPassagem(id) {
    requirePermission('enfermagem_registrar');
    const user = state.currentUser;
    const r = await db_receberPassagem(id, (atual) => {
        if (atual.passado_por === user.username) throw new Error('Quem passou o plantão não pode dar a ciência: ela é de quem recebe.');
        return { ...atual, recebido_por: user.username, recebido_por_nome: user.name, recebido_em: nowISO() };
    });
    await auditar({ entidade: 'plantao', entidade_id: id, acao: 'RECEBER', depois: { unidade: r.unidade, turno: r.turno } });
    return r;
}
