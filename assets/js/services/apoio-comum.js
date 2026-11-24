// Apoio e infraestrutura (Etapa 9): regras e utilitários compartilhados pelos serviços de manutenção, patrimônio, transporte,
// rouparia, resíduos, voluntariado e óbitos.
//
// O QUE É: validadores puros (texto, inteiro, decimal, data e hora), numeração de protocolo por contador, o desenho dos registros
// que só acrescentam (lançamento + anulação por novo registro com motivo) e a escrita do mesmo "quem fez" em todos os documentos.
//
// O QUE NÃO É: não define prazo, meta, cota nem regra legal de nenhum setor. Tudo o que depende de norma ou de rotina do hospital
// (tempo de atendimento da manutenção, grupos e destinos de resíduos, cota de enxoval, rito do óbito) fica em listas de apoio
// que o hospital precisa confirmar (docs/pendencias.md).

/** Texto aparado, com limites. `min` 0 = opcional. */
function apoioTexto(valor, rotulo, { min = 0, max = 200 } = {}) {
    const t = String(valor ?? '').trim();
    if (min > 0 && t.length === 0) throw new Error(`${rotulo}: informe.`);
    if (t.length > 0 && t.length < min) throw new Error(`${rotulo}: mínimo de ${min} caracteres.`);
    if (t.length > max) throw new Error(`${rotulo}: no máximo ${max} caracteres.`);
    return t;
}

/** Inteiro entre `min` e `max` (aceita texto digitado). */
function apoioInteiro(valor, rotulo, min, max) {
    const bruto = String(valor ?? '').trim();
    const n = Number(bruto);
    if (bruto === '' || !Number.isInteger(n) || n < min || n > max) throw new Error(`${rotulo}: número inteiro de ${min} a ${max}.`);
    return n;
}

/** Número com até `casas` decimais entre `min` e `max` (aceita vírgula). Vazio devolve `null` quando `opcional`. */
function apoioDecimal(valor, rotulo, min, max, { casas = 2, opcional = false } = {}) {
    const bruto = String(valor ?? '').trim().replace(',', '.');
    if (bruto === '') { if (opcional) return null; throw new Error(`${rotulo}: informe.`); }
    const n = Number(bruto);
    if (!/^\d+(\.\d+)?$/.test(bruto) || !Number.isFinite(n) || n < min || n > max) throw new Error(`${rotulo}: número de ${min} a ${max}.`);
    const f = Math.pow(10, casas);
    if (Math.abs(Math.round(n * f) / f - n) > 1e-9) throw new Error(`${rotulo}: no máximo ${casas} casa(s) decimal(is).`);
    return Math.round(n * f) / f;
}

/** Data e hora do evento: vazio = agora; não pode estar no futuro (tolerância de 5 min) nem além de `maxAntesHoras`. */
function apoioDataHora(valor, rotulo, { agora = new Date(), maxAntesHoras = 24 * 60 } = {}) {
    const quando = valor ? new Date(valor) : agora;
    if (Number.isNaN(quando.getTime())) throw new Error(`${rotulo}: data e hora inválidas.`);
    if (quando.getTime() > agora.getTime() + 5 * 60000) throw new Error(`${rotulo}: não pode estar no futuro.`);
    if (quando.getTime() < agora.getTime() - maxAntesHoras * 3600000) throw new Error(`${rotulo}: anterior ao limite permitido. Confira a data digitada.`);
    return quando.toISOString();
}

/** Data (AAAA-MM-DD) válida. `futuro: false` recusa data depois de hoje. */
function apoioData(valor, rotulo, { futuro = true, agora = new Date() } = {}) {
    const t = String(valor || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || Number.isNaN(new Date(t + 'T12:00:00').getTime())) throw new Error(`${rotulo}: data inválida.`);
    if (!futuro && t > todayISO(agora)) throw new Error(`${rotulo}: não pode estar no futuro.`);
    return t;
}

/** Soma `dias` a uma data AAAA-MM-DD (calendário local, sem fuso). */
function apoioSomarDias(dataISO, dias) {
    const [a, m, d] = String(dataISO).split('-').map(Number);
    return todayISO(new Date(a, m - 1, d + Number(dias), 12, 0, 0));
}

/** Dias entre duas datas AAAA-MM-DD (b − a). */
function apoioDiasEntre(aISO, bISO) {
    const [a1, m1, d1] = String(aISO).split('-').map(Number);
    const [a2, m2, d2] = String(bISO).split('-').map(Number);
    return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
}

/** Valor que precisa estar na lista (devolve o valor; erro com o nome do campo). */
function apoioEscolha(valor, lista, rotulo) {
    if (!Object.prototype.hasOwnProperty.call(lista, valor)) throw new Error(`${rotulo}: escolha uma opção da lista.`);
    return valor;
}

const apoioQuem = (user) => ({ por: user.username, por_nome: user.name, perfil: user.role });
const apoioProtocolo = (prefixo, n, digitos = 5) => `${prefixo}${String(n).padStart(digitos, '0')}`;

/**
 * Lê o contador (dentro da transação, antes de qualquer gravação) e devolve o próximo número e a referência para gravá-lo.
 * O contador mora em `cad_contadores/<chave>` (qualquer usuário logado grava, ver firestore.rules).
 */
async function apoioProximoNumero(tx, database, chave) {
    const ref = database.collection('cad_contadores').doc(chave);
    const snap = await tx.get(ref);
    return { ref, n: ((snap.exists && snap.data().ultimo) || 0) + 1 };
}

/** Registros de um livro (rouparia, resíduos) que valem: sem as anulações e sem os registros anulados. */
function apoioRegistrosValidos(lista) {
    const anulados = new Set((lista || []).filter(l => l.tipo === 'ANULACAO').map(l => l.anula_id));
    return (lista || []).filter(l => l.tipo !== 'ANULACAO' && !anulados.has(l.id));
}

/**
 * Anula um registro de livro por um NOVO documento (o original não é alterado). O id fixo `anul_<id>` impede anular duas vezes.
 * `perm`: permissão exigida; `entidade`: nome na auditoria.
 */
async function apoioAnularRegistro({ col, id, motivo, perm, entidade }) {
    requirePermission(perm);
    const texto = apoioTexto(motivo, 'Motivo da anulação', { min: 5, max: 200 });
    const database = requireDb();
    const user = state.currentUser;
    const agora = nowISO();
    let anul;
    await database.runTransaction(async (tx) => {
        const o = await tx.get(database.collection(col).doc(String(id)));
        if (!o.exists) throw new Error('Registro não encontrado.');
        const orig = { id: o.id, ...o.data() };
        if (orig.tipo === 'ANULACAO') throw new Error('Este registro já é uma anulação.');
        const marca = database.collection(col).doc(`anul_${orig.id}`);
        const ja = await tx.get(marca);
        if (ja.exists) throw new Error('Este registro já foi anulado.');
        anul = { id: `anul_${orig.id}`, dia: todayISO(), tipo: 'ANULACAO', anula_id: orig.id, motivo: texto, em: agora, criado_em: agora, ...apoioQuem(user) };
        tx.set(marca, anul);
    });
    await auditar({ entidade, entidade_id: id, acao: 'ANULAR', motivo: texto });
    return anul;
}

/** Grava um novo registro de livro com id gerado (sem leitura prévia). */
async function apoioGravarRegistro({ col, prefixoId, dados, entidade, perm, resumoAuditoria }) {
    requirePermission(perm);
    const database = requireDb();
    const user = state.currentUser;
    const agora = nowISO();
    const reg = { id: newId(prefixoId), dia: todayISO(new Date(dados.em || agora)), ...dados, criado_em: agora, ...apoioQuem(user) };
    await database.runTransaction(async (tx) => { tx.set(database.collection(col).doc(reg.id), reg); });
    await auditar({ entidade, entidade_id: reg.id, acao: 'REGISTRAR', depois: resumoAuditoria ? resumoAuditoria(reg) : null });
    return reg;
}

/** Linha de histórico de um documento que muda de situação. */
const apoioLinhaHistorico = (status, user, agora, motivo = '') => ({ status, em: agora, por: user.username, por_nome: user.name, motivo });

/** Valida que a mudança de situação é permitida pelo mapa `{ DE: [PARA...] }`. */
function apoioPodeIr(mapa, de, para, rotuloSituacoes = {}) {
    if (de === para) throw new Error(`Este passo já foi registrado (situação atual: ${rotuloSituacoes[de] || de}). Atualize a tela.`);
    if (!(mapa[de] || []).includes(para)) throw new Error(`Não é possível passar de "${rotuloSituacoes[de] || de}" para "${rotuloSituacoes[para] || para}". Atualize a tela.`);
}
