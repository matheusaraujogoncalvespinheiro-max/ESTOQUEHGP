// Voluntariado (Etapa 9): cadastro de voluntários e registro de presença (entrada e saída), com a Portaria registrando a presença.
//
// O QUE É: a coordenação cadastra o voluntário (nome, contato, área, data do termo de adesão) e pode inativar com motivo. A Portaria ou
// a coordenação registram a ENTRADA e a SAÍDA; só pode haver uma presença aberta por voluntário (travada por documento fixo
// `voluntario_aberta/<id>`, dentro da transação). As horas são a soma das presenças encerradas. Nada é apagado.
//
// O QUE NÃO É: não guarda documento de identificação, foto nem o termo digitalizado (LGPD: só o necessário), não escala voluntário em
// turno, não emite certificado e não define quem pode ser voluntário (triagem, vacinas, treinamento ficam com a coordenação). A lista de
// áreas é de apoio e precisa ser confirmada pelo hospital. Ver docs/pendencias.md.

const COL_VOLUNTARIOS = 'voluntarios';
const COL_PRESENCAS = 'voluntario_presencas';
const COL_PRESENCA_ABERTA = 'voluntario_aberta';

const AREAS_VOLUNTARIADO = {
    ACOLHIMENTO: 'Acolhimento e orientação', BRINQUEDOTECA: 'Brinquedoteca e recreação', APOIO_ESPIRITUAL: 'Apoio espiritual',
    ARTE_MUSICA: 'Arte e música', ADMINISTRATIVO: 'Apoio administrativo', OUTRA: 'Outra área'
};

// ============ Regras puras (testáveis) ============

/** Valida o cadastro. O termo de adesão é a data em que foi assinado (o documento em si fica com a coordenação). */
function validarVoluntario(form, agora = new Date()) {
    return {
        nome: apoioTexto(form.nome, 'Nome', { min: 3, max: 100 }),
        contato: apoioTexto(form.contato, 'Contato', { max: 40 }),
        area: apoioEscolha(form.area, AREAS_VOLUNTARIADO, 'Área de atuação'),
        termo_em: apoioData(form.termo_em, 'Termo de adesão assinado em', { futuro: false, agora }),
        observacao: apoioTexto(form.observacao, 'Observação', { max: 200 })
    };
}

/** Minutos de uma presença: encerrada = saída − entrada; aberta = até `agora`. */
function minutosDePresenca(p, agora = new Date()) {
    const fim = p.saida_em ? new Date(p.saida_em) : agora;
    return Math.max(0, Math.round((fim.getTime() - new Date(p.entrada_em).getTime()) / 60000));
}

/** Horas por voluntário no período (só presenças encerradas). */
function horasDosVoluntarios(presencas, de = '', ate = '') {
    const mapa = new Map();
    (presencas || []).filter(p => p.status === 'ENCERRADA' && (!de || p.dia >= de) && (!ate || p.dia <= ate)).forEach(p => {
        if (!mapa.has(p.voluntario_id)) mapa.set(p.voluntario_id, { voluntario_id: p.voluntario_id, nome: p.voluntario_nome, area: p.area, minutos: 0, presencas: 0 });
        const g = mapa.get(p.voluntario_id);
        g.minutos += minutosDePresenca(p); g.presencas += 1;
    });
    return [...mapa.values()].sort((a, b) => b.minutos - a.minutos || a.nome.localeCompare(b.nome, 'pt-BR'));
}

const formatarMinutos = (min) => `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;

// ============ Gravação (Firestore) ============

const linhaVoluntario = (acao, user, agora, detalhe = '', motivo = '') => ({ em: agora, por: user.username, por_nome: user.name, acao, detalhe, motivo });

async function cadastrarVoluntario(form) {
    requirePermission('voluntariado_gerenciar');
    const v = validarVoluntario(form);
    const database = requireDb(); const user = state.currentUser; const agora = nowISO();
    const vol = { id: newId('vol'), ...v, situacao: 'ATIVO', criado_em: agora, criado_por: user.username, criado_por_nome: user.name, historico: [linhaVoluntario('CADASTRADO', user, agora, `Área: ${AREAS_VOLUNTARIADO[v.area]}`)] };
    await database.runTransaction(async (tx) => { tx.set(database.collection(COL_VOLUNTARIOS).doc(vol.id), vol); });
    await auditar({ entidade: 'voluntario', entidade_id: vol.id, acao: 'CADASTRAR', depois: { area: vol.area, termo_em: vol.termo_em } });
    return vol;
}

async function editarVoluntario(id, form) {
    requirePermission('voluntariado_gerenciar');
    const v = validarVoluntario(form);
    const database = requireDb(); const user = state.currentUser; const agora = nowISO();
    let nova; let alterados = [];
    await database.runTransaction(async (tx) => {
        const ref = database.collection(COL_VOLUNTARIOS).doc(String(id));
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error('Voluntário não encontrado.');
        const atual = { id: snap.id, ...snap.data() };
        alterados = Object.keys(v).filter(k => String(atual[k] ?? '') !== String(v[k] ?? ''));
        if (!alterados.length) throw new Error('Nenhuma alteração para salvar.');
        nova = { ...atual, ...v, historico: [...(atual.historico || []), linhaVoluntario('EDITADO', user, agora, `Campos: ${alterados.join(', ')}`)] };
        tx.set(ref, nova);
    });
    await auditar({ entidade: 'voluntario', entidade_id: id, acao: 'EDITAR', depois: { campos: alterados } });
    return nova;
}

async function alternarVoluntario(id, ativar, motivo) {
    requirePermission('voluntariado_gerenciar');
    const texto = apoioTexto(motivo, 'Motivo', { min: ativar ? 0 : 5, max: 200 });
    const database = requireDb(); const user = state.currentUser; const agora = nowISO();
    await database.runTransaction(async (tx) => {
        const ref = database.collection(COL_VOLUNTARIOS).doc(String(id));
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error('Voluntário não encontrado.');
        const v = { id: snap.id, ...snap.data() };
        if ((v.situacao === 'ATIVO') === ativar) throw new Error(ativar ? 'O voluntário já está ativo.' : 'O voluntário já está inativo.');
        const trava = await tx.get(database.collection(COL_PRESENCA_ABERTA).doc(v.id));
        if (!ativar && trava.exists && trava.data().aberta) throw new Error('Este voluntário está com a presença aberta. Registre a saída antes de inativar.');
        tx.set(ref, { ...v, situacao: ativar ? 'ATIVO' : 'INATIVO', historico: [...(v.historico || []), linhaVoluntario(ativar ? 'REATIVADO' : 'INATIVADO', user, agora, '', texto)] });
    });
    await auditar({ entidade: 'voluntario', entidade_id: id, acao: ativar ? 'REATIVAR' : 'INATIVAR', motivo: texto });
}

const inativarVoluntario = (id, motivo) => alternarVoluntario(id, false, motivo);
const reativarVoluntario = (id) => alternarVoluntario(id, true, '');

async function registrarEntradaVoluntario(voluntarioId) {
    requirePermission('voluntariado_presenca');
    const database = requireDb(); const user = state.currentUser; const agora = nowISO();
    let p;
    await database.runTransaction(async (tx) => {
        const vSnap = await tx.get(database.collection(COL_VOLUNTARIOS).doc(String(voluntarioId)));
        if (!vSnap.exists) throw new Error('Voluntário não encontrado.');
        const v = { id: vSnap.id, ...vSnap.data() };
        if (v.situacao !== 'ATIVO') throw new Error('Este voluntário está inativo.');
        const refTrava = database.collection(COL_PRESENCA_ABERTA).doc(v.id);
        const trava = await tx.get(refTrava);
        if (trava.exists && trava.data().aberta) throw new Error('Este voluntário já está com a entrada registrada. Registre a saída antes.');
        p = { id: newId('vpr'), voluntario_id: v.id, voluntario_nome: v.nome, area: v.area, dia: todayISO(), status: 'ABERTA', entrada_em: agora, entrada_por: user.username, entrada_por_nome: user.name, saida_em: '', saida_por: '', saida_por_nome: '', observacao: '' };
        tx.set(database.collection(COL_PRESENCAS).doc(p.id), p);
        tx.set(refTrava, { id: v.id, aberta: true, presenca_id: p.id });
    });
    await auditar({ entidade: 'voluntario_presenca', entidade_id: p.id, acao: 'ENTRADA', depois: { voluntario: voluntarioId } });
    return p;
}

/** Registra a saída (horário vazio = agora; não pode ser anterior à entrada nem futuro). */
async function registrarSaidaVoluntario(presencaId, form = {}) {
    requirePermission('voluntariado_presenca');
    const database = requireDb(); const user = state.currentUser; const agora = nowISO();
    let nova;
    await database.runTransaction(async (tx) => {
        const ref = database.collection(COL_PRESENCAS).doc(String(presencaId));
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error('Presença não encontrada.');
        const p = { id: snap.id, ...snap.data() };
        if (p.status !== 'ABERTA') throw new Error('A saída desta presença já foi registrada. Atualize a tela.');
        const saida = apoioDataHora(form.saida_em, 'Horário da saída', { agora: new Date(agora), maxAntesHoras: 24 * 7 });
        if (new Date(saida).getTime() < new Date(p.entrada_em).getTime()) throw new Error('A saída não pode ser anterior à entrada.');
        nova = { ...p, status: 'ENCERRADA', saida_em: saida, saida_por: user.username, saida_por_nome: user.name, observacao: apoioTexto(form.observacao, 'Observação', { max: 200 }) };
        tx.set(ref, nova);
        tx.set(database.collection(COL_PRESENCA_ABERTA).doc(p.voluntario_id), { id: p.voluntario_id, aberta: false, presenca_id: p.id });
    });
    await auditar({ entidade: 'voluntario_presenca', entidade_id: presencaId, acao: 'SAIDA', depois: { saida_em: nova.saida_em } });
    return nova;
}
