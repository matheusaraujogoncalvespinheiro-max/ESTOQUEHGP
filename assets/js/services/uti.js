// UTI (Etapa 8): balanço hídrico e dispositivos invasivos do paciente internado.
//
// O QUE É: dois registros que só acrescentam, ligados à internação ativa. O BALANÇO HÍDRICO guarda cada ganho ou perda em mL
// (via, volume, hora do evento, quem lançou); um lançamento errado não se edita: ele é ANULADO por um novo registro com motivo e deixa de
// entrar na soma. O DISPOSITIVO (cateter, sonda, tubo, dreno...) guarda tipo, local, data e hora da inserção e quem inseriu; a retirada
// é registrada no mesmo documento (com motivo) e o tempo de uso é só contagem de dias.
//
// O QUE NÃO É: o sistema só soma e subtrai o que foi lançado: não decide meta de balanço, não calcula perda insensível, não interpreta o
// saldo e não alerta tempo máximo de uso de dispositivo (esses parâmetros são do hospital, ver docs/pendencias.md). As listas de vias e de
// dispositivos são de apoio e precisam ser confirmadas pelo hospital. A UTI é identificada pelo tipo do leito ou pelo nome da ala.

const COL_BALANCO = 'balanco_hidrico';
const COL_DISPOSITIVOS = 'dispositivos';

const VIAS_BALANCO = {
    GANHO: { ORAL: 'Via oral', ENTERAL: 'Dieta enteral', EV_SOLUCAO: 'Soluções endovenosas', EV_MEDICACAO: 'Medicação endovenosa', HEMOCOMPONENTE: 'Hemocomponentes', PARENTERAL: 'Nutrição parenteral', OUTRO_GANHO: 'Outros ganhos' },
    PERDA: { DIURESE: 'Diurese', DRENO: 'Dreno', VOMITO: 'Vômito', EVACUACAO: 'Evacuação', SONDA_GASTRICA: 'Sonda gástrica', SANGRAMENTO: 'Sangramento', OUTRA_PERDA: 'Outras perdas' }
};
const ROTULO_VIA = Object.fromEntries(Object.values(VIAS_BALANCO).flatMap(g => Object.entries(g)));
const JANELAS_BALANCO = { '6H': 'Últimas 6 horas', '12H': 'Últimas 12 horas', '24H': 'Últimas 24 horas', DIA: 'Dia de hoje (0 h às 24 h)' };
const VOLUME_MAX_ML = 9999;   // limite de digitação (um lançamento de 10 litros é erro de digitação), não limite clínico

const TIPOS_DISPOSITIVO = {
    CVC: 'Acesso venoso central', AVP: 'Acesso venoso periférico', PAI: 'Cateter arterial (pressão invasiva)', SVD: 'Sonda vesical de demora',
    TOT: 'Tubo orotraqueal', TQT: 'Traqueostomia', SNE: 'Sonda nasoenteral ou gástrica', DRENO: 'Dreno', OUTRO: 'Outro dispositivo'
};

// ============ Regras puras (testáveis) ============

/** O leito é de UTI se o cadastro diz "UTI" (tipo do leito) ou o nome da ala traz "UTI". */
const ehLeitoUti = (leito) => Boolean(leito) && (String(leito.tipo_leito || '') === 'UTI' || /\buti\b/i.test(String(leito.ala || '')));

/** Valida um lançamento do balanço. `agora` é injetável para teste; o horário não pode ser futuro nem anterior a 48 h. */
function validarLancamentoBalanco(form, agora = new Date()) {
    const tipo = form.tipo;
    if (!VIAS_BALANCO[tipo]) throw new Error('Escolha se é ganho ou perda.');
    if (!VIAS_BALANCO[tipo][form.via]) throw new Error('Escolha a via do lançamento.');
    const bruto = String(form.volume_ml ?? '').trim().replace(',', '.');
    const volume = Number(bruto);
    if (bruto === '' || !Number.isInteger(volume) || volume < 1 || volume > VOLUME_MAX_ML) throw new Error(`Volume: número inteiro de 1 a ${VOLUME_MAX_ML} mL.`);
    const quando = form.em ? new Date(form.em) : agora;
    if (Number.isNaN(quando.getTime())) throw new Error('Horário do lançamento inválido.');
    if (quando.getTime() > agora.getTime() + 5 * 60000) throw new Error('O horário do lançamento não pode estar no futuro.');
    if (quando.getTime() < agora.getTime() - 48 * 3600000) throw new Error('O horário do lançamento é anterior a 48 h. Confira a data digitada.');
    const observacao = String(form.observacao || '').trim();
    if (observacao.length > 200) throw new Error('Observação: no máximo 200 caracteres.');
    return { tipo, via: form.via, via_rotulo: VIAS_BALANCO[tipo][form.via], volume_ml: volume, em: quando.toISOString(), observacao };
}

/** Lançamentos que valem: tira as anulações e os lançamentos anulados. */
function lancamentosValidos(lista) {
    const anulados = new Set((lista || []).filter(l => l.tipo === 'ANULACAO').map(l => l.anula_id));
    return (lista || []).filter(l => l.tipo !== 'ANULACAO' && !anulados.has(l.id));
}

/** Início da janela do balanço (a data local de hoje à meia-noite no modo DIA). */
function inicioDaJanela(janela, agora = new Date()) {
    if (janela === 'DIA') return new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 0, 0, 0, 0);
    const horas = { '6H': 6, '12H': 12, '24H': 24 }[janela];
    if (!horas) throw new Error('Janela do balanço desconhecida.');
    return new Date(agora.getTime() - horas * 3600000);
}

/** Soma pura: ganhos, perdas e saldo (ganhos − perdas) da internação na janela. Sem interpretação. */
function calcularBalanco(lista, janela = '24H', agora = new Date()) {
    const ini = inicioDaJanela(janela, agora).getTime();
    const validos = lancamentosValidos(lista).filter(l => new Date(l.em).getTime() >= ini && new Date(l.em).getTime() <= agora.getTime() + 5 * 60000);
    const soma = (t) => validos.filter(l => l.tipo === t).reduce((s, l) => s + l.volume_ml, 0);
    const ganhos = soma('GANHO'); const perdas = soma('PERDA');
    const porVia = {};
    validos.forEach(l => { porVia[l.via_rotulo] = (porVia[l.via_rotulo] || 0) + l.volume_ml; });
    return { ganhos, perdas, saldo: ganhos - perdas, lancamentos: validos.length, por_via: porVia };
}

/** Valida a colocação de um dispositivo. */
function validarDispositivo(form, agora = new Date()) {
    if (!TIPOS_DISPOSITIVO[form.tipo]) throw new Error('Escolha o tipo de dispositivo.');
    const local = String(form.local || '').trim();
    if (local.length < 2) throw new Error('Informe o local do dispositivo (ex.: veia jugular direita, 2º espaço...).');
    if (local.length > 80) throw new Error('Local: no máximo 80 caracteres.');
    const quando = form.inserido_em ? new Date(form.inserido_em) : agora;
    if (Number.isNaN(quando.getTime())) throw new Error('Data e hora da inserção inválidas.');
    if (quando.getTime() > agora.getTime() + 5 * 60000) throw new Error('A inserção não pode estar no futuro.');
    if (quando.getTime() < agora.getTime() - 365 * 86400000) throw new Error('A inserção é anterior a 1 ano. Confira a data digitada.');
    const inseridoPor = String(form.inserido_por || '').trim();
    if (inseridoPor.length > 80) throw new Error('Quem inseriu: no máximo 80 caracteres.');
    const observacao = String(form.observacao || '').trim();
    if (observacao.length > 200) throw new Error('Observação: no máximo 200 caracteres.');
    return { tipo: form.tipo, tipo_rotulo: TIPOS_DISPOSITIVO[form.tipo], local, inserido_em: quando.toISOString(), inserido_por: inseridoPor, observacao };
}

/** Dia de uso do dispositivo contado pelo calendário: o dia da inserção é o 1º dia. Retirado: até a data da retirada. */
function diasDeUso(d, agora = new Date()) {
    const fim = d.status === 'RETIRADO' && d.retirado_em ? new Date(d.retirado_em) : agora;
    const dia = (x) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate());
    return Math.max(1, Math.round((dia(fim) - dia(new Date(d.inserido_em))) / 86400000) + 1);
}

/** Motivo da retirada (obrigatório) e horário (não anterior à inserção, não futuro). */
function validarRetiradaDispositivo(form, d, agora = new Date()) {
    const motivo = String(form.motivo || '').trim();
    if (motivo.length < 5) throw new Error('Informe o motivo da retirada (mínimo 5 letras).');
    if (motivo.length > 200) throw new Error('Motivo: no máximo 200 caracteres.');
    const quando = form.retirado_em ? new Date(form.retirado_em) : agora;
    if (Number.isNaN(quando.getTime())) throw new Error('Data e hora da retirada inválidas.');
    if (quando.getTime() > agora.getTime() + 5 * 60000) throw new Error('A retirada não pode estar no futuro.');
    if (quando.getTime() < new Date(d.inserido_em).getTime()) throw new Error('A retirada não pode ser anterior à inserção.');
    return { retirado_em: quando.toISOString(), motivo };
}

// ============ Gravação (Firestore) ============

/** Confere, dentro da transação, que a internação continua ativa; devolve os dados dela. */
async function lerInternacaoAtiva(tx, database, internacaoId) {
    const snap = await tx.get(database.collection(COLH.INTERNACOES).doc(String(internacaoId)));
    if (!snap.exists || snap.data().status !== 'ATIVA') throw new Error('A internação deste paciente não está mais ativa.');
    return { id: snap.id, ...snap.data() };
}

const baseDaInternacao = (i) => ({ internacao_id: i.id, paciente_id: i.paciente_id, paciente_nome: i.paciente_nome, prontuario: i.prontuario || '', leito_id: i.leito_id });

async function lancarBalanco(internacaoId, form) {
    requirePermission('uti_registrar');
    const v = validarLancamentoBalanco(form);
    const database = requireDb();
    const user = state.currentUser;
    const agora = nowISO();
    let lanc;
    await database.runTransaction(async (tx) => {
        const i = await lerInternacaoAtiva(tx, database, internacaoId);
        lanc = { id: newId('bal'), ...baseDaInternacao(i), dia: todayISO(new Date(v.em)), ...v, criado_em: agora, por: user.username, por_nome: user.name, perfil: user.role };
        tx.set(database.collection(COL_BALANCO).doc(lanc.id), lanc);
    });
    await auditar({ entidade: 'balanco_hidrico', entidade_id: lanc.id, acao: 'LANCAR', depois: { internacao: internacaoId, tipo: lanc.tipo, via: lanc.via, volume_ml: lanc.volume_ml } });
    return lanc;
}

/** Anula um lançamento por um novo registro (o original não é alterado) e exige o motivo. */
async function anularLancamentoBalanco(lancamentoId, motivo) {
    requirePermission('uti_registrar');
    const texto = String(motivo || '').trim();
    if (texto.length < 5) throw new Error('Informe o motivo da anulação (mínimo 5 letras).');
    if (texto.length > 200) throw new Error('Motivo: no máximo 200 caracteres.');
    const database = requireDb();
    const user = state.currentUser;
    const agora = nowISO();
    let anul;
    await database.runTransaction(async (tx) => {
        const origRef = database.collection(COL_BALANCO).doc(String(lancamentoId));
        const o = await tx.get(origRef);
        if (!o.exists) throw new Error('Lançamento não encontrado.');
        const orig = { id: o.id, ...o.data() };
        if (orig.tipo === 'ANULACAO') throw new Error('Este registro já é uma anulação.');
        const i = await lerInternacaoAtiva(tx, database, orig.internacao_id);
        const marca = database.collection(COL_BALANCO).doc(`anul_${orig.id}`);   // id fixo: anular duas vezes o mesmo lançamento não duplica
        const ja = await tx.get(marca);
        if (ja.exists) throw new Error('Este lançamento já foi anulado.');
        anul = { id: `anul_${orig.id}`, ...baseDaInternacao(i), dia: todayISO(), tipo: 'ANULACAO', anula_id: orig.id, motivo: texto, em: agora, criado_em: agora, por: user.username, por_nome: user.name, perfil: user.role };
        tx.set(marca, anul);
    });
    await auditar({ entidade: 'balanco_hidrico', entidade_id: lancamentoId, acao: 'ANULAR', motivo: texto });
    return anul;
}

async function registrarDispositivo(internacaoId, form) {
    requirePermission('uti_registrar');
    const v = validarDispositivo(form);
    const database = requireDb();
    const user = state.currentUser;
    const agora = nowISO();
    let disp;
    await database.runTransaction(async (tx) => {
        const i = await lerInternacaoAtiva(tx, database, internacaoId);
        disp = { id: newId('dsp'), ...baseDaInternacao(i), ...v, inserido_por: v.inserido_por || user.name, status: 'EM_USO', criado_em: agora, criado_por: user.username, criado_por_nome: user.name, retirado_em: '', retirada_motivo: '' };
        tx.set(database.collection(COL_DISPOSITIVOS).doc(disp.id), disp);
    });
    await auditar({ entidade: 'dispositivo', entidade_id: disp.id, acao: 'INSERIR', depois: { internacao: internacaoId, tipo: disp.tipo, local: disp.local } });
    return disp;
}

async function retirarDispositivo(id, form) {
    requirePermission('uti_registrar');
    const database = requireDb();
    const user = state.currentUser;
    const agora = nowISO();
    let retirado;
    await database.runTransaction(async (tx) => {
        const ref = database.collection(COL_DISPOSITIVOS).doc(String(id));
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error('Dispositivo não encontrado.');
        const d = { id: snap.id, ...snap.data() };
        if (d.status !== 'EM_USO') throw new Error('Este dispositivo já foi retirado. Atualize a tela.');
        const v = validarRetiradaDispositivo(form, d);
        retirado = { ...d, status: 'RETIRADO', retirado_em: v.retirado_em, retirada_motivo: v.motivo, retirado_por: user.username, retirado_por_nome: user.name, retirada_registrada_em: agora };
        tx.set(ref, retirado);
    });
    await auditar({ entidade: 'dispositivo', entidade_id: id, acao: 'RETIRAR', depois: { retirado_em: retirado.retirado_em }, motivo: retirado.retirada_motivo });
    return retirado;
}

/** Lançamentos do balanço da internação (todos, do mais recente ao mais antigo): a janela do paciente lê direto do banco ao abrir. */
async function db_getBalancoInternacao(internacaoId) {
    const snap = await requireDb().collection(COL_BALANCO).where('internacao_id', '==', String(internacaoId)).get();
    return snap.docs.map(docToObj).sort((a, b) => String(b.em).localeCompare(String(a.em)));
}

/** Dispositivos da internação (em uso e retirados), do mais recente ao mais antigo. */
async function db_getDispositivosInternacao(internacaoId) {
    const snap = await requireDb().collection(COL_DISPOSITIVOS).where('internacao_id', '==', String(internacaoId)).get();
    return snap.docs.map(docToObj).sort((a, b) => String(b.inserido_em).localeCompare(String(a.inserido_em)));
}
