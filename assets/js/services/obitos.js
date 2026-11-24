// Óbitos (Etapa 9): registro da constatação do óbito, comunicação à família e liberação do corpo. Dado SIGILOSO.
//
// O QUE É: o MÉDICO registra o óbito (data e hora, local, CID da causa se quiser, nº da Declaração de Óbito, registro no conselho). Quando
// o paciente está internado, o registro ENCERRA a internação NA MESMA TRANSAÇÃO (tipo de alta "Óbito", leito para higienização, trava de
// internação com a marca de óbito: o paciente não pode ser internado de novo). Depois o médico ou a enfermagem registram a comunicação à
// família e a liberação do corpo (cada uma uma vez). Nada é apagado: o nº da DO só muda com motivo (fica nas retificações).
// Cada abertura do registro grava o acesso (registrarAcesso) e as telas não mostram o nome do paciente a quem não tem permissão de ver.
//
// O QUE NÃO É: não substitui a Declaração de Óbito (o documento oficial é emitido fora do sistema), não define quando o caso vai ao IML ou SVO,
// não exige a DO para liberar o corpo e não faz notificação compulsória. Também NÃO bloqueia, nesta etapa, agendamento nem atendimento de
// paciente com óbito (só a internação é bloqueada). O leito vai para higienização no registro; aguardar a retirada do corpo antes disso é rotina
// do hospital (ver docs/pendencias.md).

const COL_OBITOS = 'obitos';
const COL_OBITO_PACIENTE = 'obito_paciente';   // id = paciente: garante um óbito por paciente

const LOCAIS_OBITO = { INTERNACAO: 'Internação (leito)', EMERGENCIA: 'Emergência', AMBULATORIO: 'Ambulatório ou procedimento', OUTRO: 'Outro local do hospital' };
const SITUACOES_OBITO = { REGISTRADO: 'Óbito registrado', FAMILIA_COMUNICADA: 'Família comunicada', CORPO_LIBERADO: 'Corpo liberado' };
const DESTINOS_CORPO = { FAMILIA_FUNERARIA: 'Família ou funerária', IML: 'Instituto Médico Legal (IML)', SVO: 'Serviço de Verificação de Óbito (SVO)', OUTRO: 'Outro destino' };

// ============ Regras puras (testáveis) ============

const textoDoNumeroDo = (v) => String(v ?? '').trim().toUpperCase();

/** Número da Declaração de Óbito: só letras, números e hífen (3 a 20 caracteres). Vazio = ainda não informado. */
function validarNumeroDo(valor, { obrigatorio = false } = {}) {
    const t = textoDoNumeroDo(valor);
    if (!t) { if (obrigatorio) throw new Error('Informe o número da Declaração de Óbito.'); return ''; }
    if (!/^[0-9A-Z-]{3,20}$/.test(t)) throw new Error('Nº da Declaração de Óbito: de 3 a 20 letras, números ou hífen.');
    return t;
}

/** Valida o registro do óbito. `internacao` é a internação ativa (obrigatória no local "Internação"). */
function validarObito(form, { internacao = null, agora = new Date() } = {}) {
    const local = apoioEscolha(form.local, LOCAIS_OBITO, 'Local do óbito');
    if (local === 'INTERNACAO' && (!internacao || internacao.status !== 'ATIVA')) throw new Error('O óbito na internação exige um paciente com internação ativa.');
    if (local !== 'INTERNACAO' && !form.paciente_id) throw new Error('Selecione o paciente.');
    const quando = apoioDataHora(form.data_hora_obito, 'Data e hora do óbito', { agora, maxAntesHoras: 72 });
    if (internacao && new Date(quando).getTime() < new Date(internacao.data_hora_internacao).getTime()) throw new Error('O óbito não pode ser anterior à internação.');
    const cid = String(form.cid_causa || '').trim().toUpperCase();
    if (cid && !validarCid10(cid)) throw new Error('CID-10 em formato inválido (ex.: I46.9 ou J18.9).');
    const registro = apoioTexto(form.registro_conselho, 'Seu registro no conselho (ex.: CRM)', { min: 3, max: 30 });
    return { local, data_hora_obito: quando, cid_causa: cid, numero_do: validarNumeroDo(form.numero_do), registro_conselho: registro, observacao: apoioTexto(form.observacao, 'Observação', { max: 200 }) };
}

/** Valida a comunicação à família (não pode ser anterior ao óbito nem futura). */
function validarComunicacaoObito(form, obito, agora = new Date()) {
    const em = apoioDataHora(form.em, 'Data e hora da comunicação', { agora, maxAntesHoras: 24 * 30 });
    if (new Date(em).getTime() < new Date(obito.data_hora_obito).getTime()) throw new Error('A comunicação não pode ser anterior ao óbito.');
    return { em, comunicado_a: apoioTexto(form.comunicado_a, 'Comunicado a (nome)', { min: 3, max: 100 }), parentesco: apoioTexto(form.parentesco, 'Parentesco ou vínculo', { max: 40 }), observacao: apoioTexto(form.observacao, 'Observação', { max: 200 }) };
}

/** Valida a liberação do corpo (não pode ser anterior ao óbito nem futura). */
function validarLiberacaoCorpo(form, obito, agora = new Date()) {
    const em = apoioDataHora(form.em, 'Data e hora da liberação', { agora, maxAntesHoras: 24 * 30 });
    if (new Date(em).getTime() < new Date(obito.data_hora_obito).getTime()) throw new Error('A liberação não pode ser anterior ao óbito.');
    return { em, destino: apoioEscolha(form.destino, DESTINOS_CORPO, 'Destino do corpo'), recebedor: apoioTexto(form.recebedor, 'Quem recebeu o corpo (nome)', { min: 3, max: 100 }), observacao: apoioTexto(form.observacao, 'Observação', { max: 200 }) };
}

/** Situação derivada: liberação vale mais que comunicação. */
const situacaoDoObito = (o) => (o.liberacao ? 'CORPO_LIBERADO' : (o.comunicacao ? 'FAMILIA_COMUNICADA' : 'REGISTRADO'));

/** Indicadores do período, sem nomes: contagens, pendências do rito e tempo médio do óbito até a liberação (horas). */
function indicadoresObitos(lista, de = '', ate = '') {
    const noPeriodo = (lista || []).filter(o => (!de || o.dia >= de) && (!ate || o.dia <= ate));
    const liberados = noPeriodo.filter(o => o.liberacao);
    const horas = liberados.length ? Math.round(liberados.reduce((s, o) => s + (new Date(o.liberacao.em).getTime() - new Date(o.data_hora_obito).getTime()) / 360000, 0) / liberados.length) / 10 : null;
    const porLocal = {}; const porSituacao = {};
    noPeriodo.forEach(o => { porLocal[o.local] = (porLocal[o.local] || 0) + 1; porSituacao[o.status] = (porSituacao[o.status] || 0) + 1; });
    return { total: noPeriodo.length, sem_numero_do: noPeriodo.filter(o => !o.numero_do).length, sem_comunicacao: noPeriodo.filter(o => !o.comunicacao).length,
        sem_liberacao: noPeriodo.filter(o => !o.liberacao).length, horas_ate_liberar: horas, por_local: porLocal, por_situacao: porSituacao };
}

// ============ Gravação (Firestore) ============

/** Registra o óbito. Com internação: encerra a internação, libera o leito para higienização e trava nova internação, tudo numa transação. */
async function registrarObito(form) {
    requirePermission('obito_registrar');
    const database = requireDb(); const user = state.currentUser; const agora = nowISO();
    const emInternacao = form.local === 'INTERNACAO';
    let obito; let leitoId = ''; let internacaoId = '';
    await database.runTransaction(async (tx) => {
        let i = null; let paciente = null;
        if (emInternacao) {
            i = await lerInternacaoAtiva(tx, database, form.internacao_id);
        } else {
            const snap = await tx.get(database.collection('pacientes').doc(String(form.paciente_id || '_')));
            if (!snap.exists) throw new Error('Paciente não encontrado.');
            paciente = { id: snap.id, ...snap.data() };
        }
        const pacienteId = i ? i.paciente_id : paciente.id;
        const v = validarObito(form, { internacao: i });
        const marca = await tx.get(database.collection(COL_OBITO_PACIENTE).doc(String(pacienteId)));
        if (marca.exists) throw new Error('Este paciente já tem óbito registrado.');
        const lock = await tx.get(database.collection(COLH.LOCK_INTERNACAO).doc(String(pacienteId)));
        if (!emInternacao && lock.exists && lock.data().ativa) throw new Error('Este paciente tem internação ativa: registre o óbito pela internação (local "Internação").');
        const c = await apoioProximoNumero(tx, database, 'obito');
        obito = { id: newId('obt'), protocolo: apoioProtocolo('OB', c.n), ...v,
            paciente_id: pacienteId, paciente_nome: i ? i.paciente_nome : paciente.nome, prontuario: (i ? i.prontuario : paciente.prontuario) || '',
            internacao_id: i ? i.id : '', leito_id: i ? i.leito_id : '', dia: todayISO(new Date(v.data_hora_obito)), status: 'REGISTRADO', comunicacao: null, liberacao: null,
            registrado_em: agora, registrado_por: user.username, registrado_por_nome: user.name, retificacoes: [],
            historico: [apoioLinhaHistorico('REGISTRADO', user, agora, 'Óbito registrado')] };
        tx.set(c.ref, { ultimo: c.n });
        tx.set(database.collection(COL_OBITOS).doc(obito.id), obito);
        tx.set(database.collection(COL_OBITO_PACIENTE).doc(String(pacienteId)), { id: String(pacienteId), obito_id: obito.id });
        tx.set(database.collection(COLH.LOCK_INTERNACAO).doc(String(pacienteId)), { id: String(pacienteId), ativa: false, internacao_id: i ? i.id : '', obito: true });
        if (i) {
            internacaoId = i.id; leitoId = i.leito_id;
            tx.set(database.collection(COLH.INTERNACOES).doc(i.id), { ...i, status: 'ALTA', data_hora_alta: v.data_hora_obito, alta_por: user.username, alta_por_nome: user.name,
                tipo_alta: 'OBITO', alta_destino: '', alta_observacao: '', obito_id: obito.id });
            tx.set(database.collection(COLH.LEITOS).doc(i.leito_id), { id: i.leito_id, status: 'HIGIENIZACAO', internacao_id: '', paciente_id: '', desde: agora, atualizado_por: user.username, atualizado_por_nome: user.name, motivo: 'Óbito do paciente' });
        }
    });
    await auditar({ entidade: 'obito', entidade_id: obito.id, acao: 'REGISTRAR', depois: { protocolo: obito.protocolo, local: obito.local, data_hora_obito: obito.data_hora_obito, internacao: internacaoId } });
    if (internacaoId) {
        if (typeof auditarLeito === 'function') await auditarLeito(leitoId, 'ALTA_HIGIENIZACAO', { status: 'OCUPADO' }, { status: 'HIGIENIZACAO' }, 'Óbito do paciente');
        await auditar({ entidade: 'internacao', entidade_id: internacaoId, acao: 'ALTA', antes: { status: 'ATIVA' }, depois: { status: 'ALTA', tipo_alta: 'OBITO' } });
        if (typeof encerrarChecagensDaInternacao === 'function') { try { await encerrarChecagensDaInternacao(internacaoId, 'Óbito do paciente'); } catch (err) { console.warn('Checagens pendentes não foram encerradas:', err.message); } }
    }
    return obito;
}

/** Passo do rito (comunicação ou liberação): grava uma vez, conferindo na transação que ainda não foi registrado. */
async function registrarPassoObito(id, { campo, validar, form, texto, acao }) {
    requirePermission('obito_acompanhar');
    const database = requireDb(); const user = state.currentUser; const agora = nowISO();
    let nova;
    await database.runTransaction(async (tx) => {
        const ref = database.collection(COL_OBITOS).doc(String(id));
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error('Registro de óbito não encontrado.');
        const o = { id: snap.id, ...snap.data() };
        if (o[campo]) throw new Error('Este passo já foi registrado. Atualize a tela.');
        const v = validar(form, o);
        const dado = { ...v, por: user.username, por_nome: user.name, registrado_em: agora };
        const base = { ...o, [campo]: dado };
        const status = situacaoDoObito(base);
        nova = { ...base, status, historico: [...(o.historico || []), apoioLinhaHistorico(status, user, agora, texto)] };
        tx.set(ref, nova);
    });
    await auditar({ entidade: 'obito', entidade_id: id, acao, depois: { status: nova.status } });
    return nova;
}

const registrarComunicacaoObito = (id, form) => registrarPassoObito(id, { campo: 'comunicacao', validar: validarComunicacaoObito, form, texto: 'Família comunicada', acao: 'COMUNICAR_FAMILIA' });
const liberarCorpoObito = (id, form) => registrarPassoObito(id, { campo: 'liberacao', validar: validarLiberacaoCorpo, form, texto: 'Corpo liberado', acao: 'LIBERAR_CORPO' });

/** Informa ou retifica o nº da Declaração de Óbito (só o médico). Trocar um número já informado exige motivo e fica nas retificações. */
async function registrarNumeroDoObito(id, numero, motivo = '') {
    requirePermission('obito_registrar');
    const novo = validarNumeroDo(numero, { obrigatorio: true });
    const database = requireDb(); const user = state.currentUser; const agora = nowISO();
    let nova; let anterior = '';
    await database.runTransaction(async (tx) => {
        const ref = database.collection(COL_OBITOS).doc(String(id));
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error('Registro de óbito não encontrado.');
        const o = { id: snap.id, ...snap.data() };
        anterior = o.numero_do || '';
        if (anterior === novo) throw new Error('Este já é o número informado.');
        const texto = anterior ? apoioTexto(motivo, 'Motivo da retificação', { min: 5, max: 200 }) : '';
        nova = { ...o, numero_do: novo, retificacoes: anterior ? [...(o.retificacoes || []), { campo: 'numero_do', de: anterior, para: novo, motivo: texto, em: agora, por: user.username, por_nome: user.name }] : (o.retificacoes || []),
            historico: [...(o.historico || []), apoioLinhaHistorico(o.status, user, agora, anterior ? `Nº da DO retificado: ${texto}` : 'Nº da DO informado')] };
        tx.set(ref, nova);
    });
    await auditar({ entidade: 'obito', entidade_id: id, acao: anterior ? 'RETIFICAR_DO' : 'INFORMAR_DO', antes: anterior ? { numero_do: anterior } : null, depois: { numero_do: novo }, motivo: String(motivo || '').trim() });
    return nova;
}

/** Busca os óbitos por período (leitura sob demanda: não há ouvinte em tempo real para dado sigiloso). */
async function db_getObitos(de = '', ate = '') {
    registrarAcesso('obito', 'lista', 'Óbitos: consulta da lista');
    const snap = await requireDb().collection(COL_OBITOS).where('dia', '>=', de || '0000-00-00').get();
    return snap.docs.map(docToObj).filter(o => !ate || o.dia <= ate).sort((a, b) => String(b.data_hora_obito).localeCompare(String(a.data_hora_obito)));
}
