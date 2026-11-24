// Triagem clínica e chamadas (Etapa 3): chamar o paciente, registrar sinais vitais, classificar o risco e reavaliar.
//
// O QUE É: continua o ATENDIMENTO criado pela Recepção (services/fluxo-atendimento.js). A chamada, a triagem e a
// reavaliação movem o atendimento pelas situações Aguardando → Chamado → Em atendimento e acrescentam ao histórico de
// situação. Os dados clínicos da triagem ficam na coleção `triagens` (um documento por atendimento, só acrescenta);
// em `atendimentos` ficam apenas os campos operacionais (risco atual, quem está atendendo, última chamada), para que
// quem só enxerga a fila (Recepção) não carregue sinais vitais, sintomas ou alergias.
//
// O QUE NÃO É: o sistema não calcula nem sugere o nível de risco e não gera alertas clínicos. Quem classifica é o
// enfermeiro classificador (perfis em PERFIS_CLASSIFICADORES), escolhendo o nível do protocolo Manchester
// (NIVEIS_RISCO em core/regras.js) e justificando. Os limites de SINAIS_VITAIS servem só para barrar erro de digitação.

const COL_TRIAGENS = 'triagens';
const COL_CHAMADAS = 'chamadas';

// Filas que têm tela de chamada e a permissão de quem as opera. O Ambulatório é atendido pelo médico (mesma consulta da fila médica);
// Procedimentos é atendido pela equipe do procedimento (Etapa 8).
const FILAS_COM_TRIAGEM = ['TRIAGEM', 'MEDICO', 'AMBULATORIO'];
const PERMISSAO_DA_FILA = { TRIAGEM: 'triagem_clinica', MEDICO: 'atendimento_medico', EXAMES: 'atendimento_exames', AMBULATORIO: 'atendimento_medico', PROCEDIMENTOS: 'atendimento_procedimentos' };

// Limites de DIGITAÇÃO (não são valores de referência clínica): impedem "1200" no lugar de "120", etc.
const SINAIS_VITAIS = [
    { k: 'pa_sistolica', rotulo: 'PA sistólica', un: 'mmHg', min: 40, max: 300, dec: 0 },
    { k: 'pa_diastolica', rotulo: 'PA diastólica', un: 'mmHg', min: 20, max: 200, dec: 0 },
    { k: 'fc', rotulo: 'Frequência cardíaca', un: 'bpm', min: 20, max: 300, dec: 0 },
    { k: 'fr', rotulo: 'Frequência respiratória', un: 'irpm', min: 4, max: 80, dec: 0 },
    { k: 'spo2', rotulo: 'Saturação de O₂', un: '%', min: 30, max: 100, dec: 0 },
    { k: 'temperatura', rotulo: 'Temperatura', un: '°C', min: 30, max: 45, dec: 1 },
    { k: 'glicemia', rotulo: 'Glicemia capilar', un: 'mg/dL', min: 10, max: 1500, dec: 0 },
    { k: 'dor', rotulo: 'Dor (0 a 10)', un: '', min: 0, max: 10, dec: 0 },
    { k: 'peso', rotulo: 'Peso', un: 'kg', min: 0.3, max: 500, dec: 1 },
    { k: 'altura', rotulo: 'Altura', un: 'cm', min: 20, max: 260, dec: 0 }
];

// ============ Regras puras (testáveis) ============

const permissaoDaFila = (fila) => PERMISSAO_DA_FILA[fila] || null;
/** Permissão para chamar/atender conforme a fila do atendimento (triagem, atendimento médico ou exames); as demais filas ainda não têm tela. */
function permissaoDoAtendimento(at) {
    const permissao = permissaoDaFila(at.fila);
    if (!permissao) throw new Error(`A fila ${rotuloFila(at.fila)} ainda não tem tela de chamada. Use as filas Triagem, Atendimento médico, Exames, Ambulatório ou Procedimentos.`);
    return permissao;
}
const ehNumero = (v) => v !== '' && v !== null && v !== undefined && Number.isFinite(Number(String(v).replace(',', '.')));

/**
 * Valida os sinais vitais digitados. form: { <campo>: texto, nao_aferido, motivo_nao_aferido }.
 * Devolve { valores, aferido, motivo_nao_aferido }; valores só traz os campos preenchidos (como número).
 */
function validarSinaisVitais(form, { exigir = true } = {}) {
    const valores = {};
    SINAIS_VITAIS.forEach(s => {
        const bruto = String(form[s.k] ?? '').trim();
        if (bruto === '') return;
        if (!ehNumero(bruto)) throw new Error(`${s.rotulo}: digite apenas números.`);
        const n = Number(bruto.replace(',', '.'));
        if (n < s.min || n > s.max) throw new Error(`${s.rotulo}: valor fora do limite de digitação (${s.min} a ${s.max}${s.un ? ' ' + s.un : ''}). Confira o que foi digitado.`);
        valores[s.k] = s.dec === 0 ? Math.round(n) : Math.round(n * 10) / 10;
    });
    const temSist = 'pa_sistolica' in valores; const temDiast = 'pa_diastolica' in valores;
    if (temSist !== temDiast) throw new Error('Pressão arterial: informe a sistólica e a diastólica.');
    if (temSist && valores.pa_sistolica <= valores.pa_diastolica) throw new Error('Pressão arterial: a sistólica deve ser maior que a diastólica.');
    const aferido = Object.keys(valores).length > 0;
    const motivo = String(form.motivo_nao_aferido || '').trim();
    if (exigir && !aferido) {
        if (!form.nao_aferido) throw new Error('Informe ao menos um sinal vital ou marque que não foi possível aferir.');
        if (motivo.length < 5) throw new Error('Informe o motivo de não ter sido possível aferir os sinais vitais (mínimo 5 letras).');
    }
    return { valores, aferido, motivo_nao_aferido: aferido ? '' : motivo };
}

/** Texto curto dos sinais para listas e prontuário ("PA 120/80 · FC 72 bpm ..."). */
function resumoSinais(valores) {
    const v = valores || {};
    const partes = [];
    if ('pa_sistolica' in v) partes.push(`PA ${v.pa_sistolica}/${v.pa_diastolica} mmHg`);
    SINAIS_VITAIS.filter(s => !['pa_sistolica', 'pa_diastolica'].includes(s.k) && s.k in v).forEach(s => partes.push(`${s.rotulo.replace('Frequência cardíaca', 'FC').replace('Frequência respiratória', 'FR').replace('Saturação de O₂', 'SpO₂').replace('Glicemia capilar', 'Glicemia').replace(' (0 a 10)', '')} ${v[s.k]}${s.un ? ' ' + s.un : ''}`));
    return partes.join(' · ');
}

/** Só o perfil classificador classifica o risco (e nunca em silêncio: o nível e a justificativa ficam no histórico). */
function validarClassificacao(form, { podeClassificar = false, inicial = true } = {}) {
    if (!podeClassificar) throw new Error('Somente o enfermeiro classificador pode definir o nível de risco.');
    if (!nivelRisco(form.risco)) throw new Error('Escolha o nível de risco (protocolo Manchester).');
    const justificativa = String(form.justificativa || '').trim();
    if (justificativa.length < 5) throw new Error('Informe o fluxograma/discriminador que justifica o nível de risco (mínimo 5 letras).');
    if (justificativa.length > 500) throw new Error('A justificativa pode ter no máximo 500 caracteres.');
    const fila = form.fila_destino || 'MEDICO';
    if (inicial && (!FILAS_ATENDIMENTO[fila] || fila === 'TRIAGEM')) throw new Error('Escolha para onde o paciente segue após a triagem.');
    return { risco: form.risco, justificativa, fila_destino: fila };
}

/** Campos de texto da triagem (queixa, sintomas, alergias, medicamentos). A queixa principal é obrigatória na triagem inicial. */
function validarAnamneseTriagem(form, { exigirQueixa = true } = {}) {
    const t = (c, max) => { const v = String(form[c] || '').trim(); if (v.length > max) throw new Error(`O campo "${c.replace(/_/g, ' ')}" pode ter no máximo ${max} caracteres.`); return v; };
    const dados = { queixa_principal: t('queixa_principal', 500), sintomas: t('sintomas', 1000), alergias: t('alergias', 300), medicamentos_uso: t('medicamentos_uso', 500) };
    if (exigirQueixa && dados.queixa_principal.length < 3) throw new Error('Informe a queixa principal do paciente.');
    return dados;
}

/** Ordem da fila da triagem: preferenciais (lei) e depois a chegada mais antiga. Ainda não há risco para ordenar. */
const ordenarFilaTriagem = (lista) => ordenarFilaRecepcao(lista);

/**
 * Ordem da fila médica: nível de risco (do mais grave ao menos grave); no mesmo nível, preferencial e depois quem foi
 * classificado primeiro. Sem classificação (consulta/retorno que não passou pela triagem) ficam depois, por preferencial e chegada.
 * A regra de convivência entre urgência e consulta marcada deve ser confirmada pelo hospital.
 */
function ordenarFilaMedica(lista) {
    const peso = (a) => { const i = NIVEIS_RISCO.findIndex(n => n.id === a.risco); return i < 0 ? 99 : i; };
    const marco = (a) => String(a.risco_em || a.chegada_em || '');
    return [...lista].sort((a, b) => (peso(a) - peso(b)) || (Number(Boolean(b.preferencial)) - Number(Boolean(a.preferencial))) || marco(a).localeCompare(marco(b)));
}

/**
 * Ordem da fila do ambulatório: preferencial (lei) e depois o horário marcado (quem veio de agendamento) ou, sem agendamento, a chegada.
 * Não há regra de encaixe: a convivência entre agendados e demanda espontânea deve ser confirmada pelo hospital.
 */
function ordenarFilaAmbulatorio(lista) {
    // `agenda_hora_iso` é a hora local marcada (AAAA-MM-DDTHH:MM) e `chegada_em` é UTC: os dois viram instantes antes de comparar
    const marco = (a) => { const t = new Date(a.agenda_hora_iso || a.chegada_em || ''); return Number.isNaN(t.getTime()) ? '' : t.toISOString(); };
    return [...lista].sort((a, b) => (Number(Boolean(b.preferencial)) - Number(Boolean(a.preferencial))) || marco(a).localeCompare(marco(b)));
}

/** Fila de chamada de uma tela: atendimentos de HOJE na fila, ainda em andamento, na ordem de chamada. */
function filaDeChamada(atendimentos, fila, dia) {
    const base = atendimentos.filter(a => a.fila === fila && a.dia === dia && ['AGUARDANDO', 'CHAMADO', 'EM_ATENDIMENTO'].includes(a.status));
    if (fila === 'MEDICO') return ordenarFilaMedica(base);
    return fila === 'AMBULATORIO' ? ordenarFilaAmbulatorio(base) : ordenarFilaTriagem(base);
}

/** O próximo a chamar: primeiro AGUARDANDO da ordem. */
const proximoDaFila = (lista) => lista.find(a => a.status === 'AGUARDANDO') || null;

/** O local escolhido precisa existir, estar ativo e atender a fila do atendimento. */
function validarLocalDaChamada(local, atendimento) {
    if (!local || local.ativo === false) throw new Error('Escolha o local de atendimento (sala ou consultório) antes de chamar.');
    if (local.fila !== atendimento.fila) throw new Error(`O local "${local.nome}" não atende a fila ${rotuloFila(atendimento.fila)}.`);
    return local;
}

/** Texto falado/lido do painel: "Senha E 1, Consultório 1" (o painel nunca traz o nome do paciente). */
function textoChamada(senha, localPainel) {
    const m = /^([A-Z]+)(\d+)$/.exec(String(senha || '').toUpperCase());
    return `Senha ${m ? `${m[1].split('').join(' ')} ${Number(m[2])}` : senha}, ${localPainel}`;
}

/** Tempo-alvo do risco: situação da espera para a tela da fila médica (usa situacaoEspera de core/regras.js). */
function situacaoDaEspera(a, agora = new Date()) {
    return a.risco ? situacaoEspera(a.risco, a.risco_em || a.chegada_em, agora) : null;
}

// ============ Gravação (Firestore) ============

const localDeAtendimento = (id) => (typeof cadRowsOf === 'function' ? cadRowsOf('localatendimento').find(l => l.id === id) : null);
const locaisDaFila = (fila) => (typeof cadRowsOf === 'function' ? cadRowsOf('localatendimento').filter(l => l.ativo && l.fila === fila) : []);

async function db_getTriagem(atendimentoId) {
    return getDocH(COL_TRIAGENS, atendimentoId);
}

/**
 * Executa uma mudança de situação do atendimento numa transação: relê o documento, confere a situação esperada
 * (duas pessoas clicando ao mesmo tempo não passam as duas), grava o novo estado e acrescenta ao histórico.
 * `permissao`: texto ou função(at). `mudar(at, ctx)` devolve { novo, motivo, antes?, depois?, registrarHistorico?, chamadaLog?, triagem?, gravar?: [{ col, obj }] };
 * `triagem` é o documento completo de `triagens` a gravar na mesma transação; `atualizar` lista [{ col, id, mudar(doc) }] de documentos ligados que mudam junto. `via` (opcional) lista situações intermediárias
 * (ex.: ['EM_ATENDIMENTO'] para concluir direto da fila), cada uma conferida na máquina de situações e gravada no histórico.
 */
async function transitarAtendimento(id, { permissao, de, mudar, acaoAuditoria }) {
    if (typeof permissao === 'string') requirePermission(permissao);
    const database = requireDb();
    const user = state.currentUser;
    const agora = nowISO();
    const atRef = database.collection(COL_ATENDIMENTOS).doc(String(id));
    const trRef = database.collection(COL_TRIAGENS).doc(String(id));
    let resultado;
    await database.runTransaction(async (tx) => {
        const snap = await tx.get(atRef);
        if (!snap.exists) throw new Error('Atendimento não encontrado.');
        const at = { id: snap.id, ...snap.data() };
        if (typeof permissao === 'function') requirePermission(permissao(at));   // a fila só é conhecida depois de ler o atendimento
        if (!de.includes(at.status)) throw new Error(`Este atendimento está "${STATUS_ATENDIMENTO[at.status] || at.status}" e não pode receber esta ação agora. Atualize a tela.`);
        // A triagem (dados clínicos) só é lida nas filas que a usam: quem atende Exames e Procedimentos não tem leitura em `triagens`
        const trSnap = FILAS_COM_TRIAGEM.includes(at.fila) ? await tx.get(trRef) : null;
        const tr = trSnap && trSnap.exists ? { id: trSnap.id, ...trSnap.data() } : null;
        const r = mudar(at, { agora, user, triagem: tr });
        const status = r.novo.status || at.status;
        const via = r.via || [];   // situações intermediárias (ver linhasDoCaminho em fluxo-atendimento.js)
        if (!via.length && status !== at.status && !transicaoAtendimentoPermitida(at.status, status)) throw new Error('Transição de situação não permitida.');
        const historico = [...(at.historico_status || [])];
        if (via.length) {
            historico.push(...linhasDoCaminho(at.status, via, status, { fila: r.novo.fila || at.fila, agora, user, motivoVia: r.motivoVia || '', motivo: r.motivo || '' }));
        } else if (status !== at.status || r.registrarHistorico) {
            historico.push({ status, fila: r.novo.fila || at.fila, em: agora, por: user.username, por_nome: user.name, motivo: r.motivo || '' });
        }
        // `atualizar`: documentos ligados que mudam junto (ex.: a consulta da agenda). Lidos aqui, antes de qualquer gravação da transação.
        const ligados = [];
        for (const u of (r.atualizar || [])) {
            const ref = database.collection(u.col).doc(String(u.id));
            const s = await tx.get(ref);
            if (s.exists) ligados.push({ ref, novo: u.mudar({ id: s.id, ...s.data() }) });
        }
        const gravado = { ...at, ...r.novo, historico_status: historico };
        tx.set(atRef, gravado);
        ligados.forEach(l => tx.set(l.ref, l.novo));
        if (r.triagem) tx.set(trRef, r.triagem);
        if (r.chamadaLog) tx.set(database.collection(COL_CHAMADAS).doc(r.chamadaLog.id), r.chamadaLog);
        (r.gravar || []).forEach(g => tx.set(database.collection(g.col).doc(String(g.obj.id)), g.obj));   // documentos extras (consulta, registros do prontuário)
        resultado = { antes: r.antes || { status: at.status, fila: at.fila }, depois: r.depois || { status, fila: gravado.fila }, atendimento: gravado, motivo: r.motivo || '' };
    });
    if (acaoAuditoria) await auditar({ entidade: 'atendimento', entidade_id: id, acao: acaoAuditoria, antes: resultado.antes, depois: resultado.depois, motivo: resultado.motivo });
    return resultado.atendimento;
}

/** Linha do registro de chamadas (o que o painel mostra: só senha, local e hora; nada do paciente). */
function montarChamadaLog(at, local, user, agora, tipo, vez) {
    return { id: newId('cha'), atendimento_id: at.id, senha: at.senha, local_id: local.id, local_nome: local.nome_painel || local.nome, fila: at.fila, dia: at.dia, em: agora, por: user.username, por_nome: user.name, tipo, vez };
}

/** Chama o paciente para um local (sala/consultório): Aguardando → Chamado, e registra a chamada para o painel. */
function chamarAtendimento(id, { local_id, fora_da_ordem = false, motivo = '' }) {
    const local = localDeAtendimento(local_id);
    return transitarAtendimento(id, {
        permissao: permissaoDoAtendimento, de: ['AGUARDANDO'], acaoAuditoria: 'CHAMAR',
        mudar: (at, { agora, user }) => {
            validarLocalDaChamada(local, at);
            if (fora_da_ordem && String(motivo).trim().length < 5) throw new Error('Chamar fora da ordem da fila exige um motivo (mínimo 5 letras).');
            const chamada = { local_id: local.id, local_nome: local.nome_painel || local.nome, chamado_em: agora, chamado_por: user.username, chamado_por_nome: user.name, vezes: 1, ultima_em: agora, fora_da_ordem: Boolean(fora_da_ordem) };
            return {
                novo: { status: 'CHAMADO', chamada }, motivo: fora_da_ordem ? `Chamado fora da ordem: ${String(motivo).trim()}` : `Chamado para ${chamada.local_nome}`,
                chamadaLog: montarChamadaLog(at, local, user, agora, 'CHAMADA', 1), depois: { status: 'CHAMADO', local: chamada.local_nome, fora_da_ordem: Boolean(fora_da_ordem) }
            };
        }
    });
}

/** Repete a chamada (paciente que não apareceu): continua Chamado, soma 1 à contagem e entra de novo no painel. */
function repetirChamada(id) {
    return transitarAtendimento(id, {
        permissao: permissaoDoAtendimento, de: ['CHAMADO'], acaoAuditoria: 'REPETIR_CHAMADA',
        mudar: (at, { agora, user }) => {
            const local = localDeAtendimento(at.chamada && at.chamada.local_id) || { id: at.chamada.local_id, nome: at.chamada.local_nome, nome_painel: at.chamada.local_nome };
            const vezes = (at.chamada.vezes || 1) + 1;
            return {
                novo: { chamada: { ...at.chamada, vezes, ultima_em: agora } }, motivo: `Chamada repetida (${vezes}ª vez)`,
                chamadaLog: montarChamadaLog(at, local, user, agora, 'REPETICAO', vezes), depois: { vezes }
            };
        }
    });
}

/** Paciente chamado que não respondeu: Chamado → Não compareceu (exige ao menos uma chamada registrada). */
function marcarNaoCompareceu(id, motivo = '') {
    return transitarAtendimento(id, {
        permissao: permissaoDoAtendimento, de: ['CHAMADO'], acaoAuditoria: 'NAO_COMPARECEU',
        mudar: (at, { agora, user }) => {
            if (!at.chamada || !(at.chamada.vezes >= 1)) throw new Error('Chame o paciente ao menos uma vez antes de registrar que não compareceu.');
            const texto = String(motivo || '').trim() || `Não respondeu à chamada (${at.chamada.vezes} chamada(s))`;
            return { novo: { status: 'NAO_COMPARECEU', nao_compareceu_em: agora, nao_compareceu_por: user.username }, motivo: texto };
        }
    });
}

/** Devolve o paciente à fila (chamado ou em atendimento que precisou ser interrompido). Exige motivo. */
function devolverAFila(id, motivo) {
    return transitarAtendimento(id, {
        permissao: permissaoDoAtendimento, de: ['CHAMADO', 'EM_ATENDIMENTO'], acaoAuditoria: 'DEVOLVER_FILA',
        mudar: (at) => {
            const texto = String(motivo || '').trim();
            if (texto.length < 5) throw new Error('Informe o motivo de devolver o paciente à fila (mínimo 5 letras).');
            return { novo: { status: 'AGUARDANDO', chamada: null, em_atendimento_por: '', em_atendimento_por_nome: '', em_atendimento_em: '', local_id: '', local_nome: '' }, motivo: texto };
        }
    });
}

/** Paciente que voltou depois de "não compareceu" (no mesmo dia): volta à fila mantendo a hora de chegada. Exige motivo. */
function reabrirNaoCompareceu(id, motivo) {
    return transitarAtendimento(id, {
        permissao: permissaoDoAtendimento, de: ['NAO_COMPARECEU'], acaoAuditoria: 'REABRIR',
        mudar: (at) => {
            if (at.dia !== todayISO()) throw new Error('Só é possível reabrir no mesmo dia. Peça à Recepção um novo check-in.');
            const texto = String(motivo || '').trim();
            if (texto.length < 5) throw new Error('Informe o motivo de reabrir o atendimento (mínimo 5 letras).');
            return { novo: { status: 'AGUARDANDO', chamada: null }, motivo: texto };
        }
    });
}

/** Começa o atendimento (triagem ou consulta): Chamado/Aguardando → Em atendimento, registrando quem e onde. */
function iniciarAtendimentoClinico(id, { local_id = '' } = {}) {
    return transitarAtendimento(id, {
        permissao: permissaoDoAtendimento, de: ['AGUARDANDO', 'CHAMADO', 'EM_ATENDIMENTO'], acaoAuditoria: 'INICIAR',
        mudar: (at, { agora, user }) => {
            if (at.status === 'EM_ATENDIMENTO') {
                if (at.em_atendimento_por && at.em_atendimento_por !== user.username && user.role !== 'ADMIN') throw new Error(`Este atendimento já está sendo feito por ${at.em_atendimento_por_nome || at.em_atendimento_por}.`);
                return { novo: {}, motivo: '', registrarHistorico: false };
            }
            const local = localDeAtendimento(local_id || (at.chamada && at.chamada.local_id));
            if (local) validarLocalDaChamada(local, at);
            return {
                novo: { status: 'EM_ATENDIMENTO', em_atendimento_por: user.username, em_atendimento_por_nome: user.name, em_atendimento_em: agora,
                    local_id: local ? local.id : '', local_nome: local ? (local.nome_painel || local.nome) : '' },
                motivo: `Atendimento iniciado${local ? ' em ' + (local.nome_painel || local.nome) : ''}`
            };
        }
    });
}

/** Monta o documento clínico da triagem acrescentando (nunca substituindo) sinais e classificações. */
function montarDocTriagem(existente, at, { anamnese, sinais, classificacao }, user, agora) {
    const base = existente || {
        id: at.id, atendimento_id: at.id, paciente_id: at.paciente_id, paciente_nome: at.paciente_nome, senha: at.senha, dia: at.dia,
        queixa_principal: '', sintomas: '', alergias: '', medicamentos_uso: '', sinais: [], classificacoes: [], criado_em: agora, criado_por: user.username
    };
    const doc = { ...base, sinais: [...(base.sinais || [])], classificacoes: [...(base.classificacoes || [])] };
    if (anamnese) Object.assign(doc, anamnese);
    if (sinais) doc.sinais.push({ em: agora, por: user.username, por_nome: user.name, perfil: user.role, valores: sinais.valores, aferido: sinais.aferido, motivo_nao_aferido: sinais.motivo_nao_aferido });
    if (classificacao) doc.classificacoes.push({ em: agora, por: user.username, por_nome: user.name, perfil: user.role, ...classificacao });
    doc.atualizado_em = agora;
    return doc;
}

/** Salva sinais vitais e anamnese da triagem sem classificar (qualquer profissional da triagem; o paciente segue em triagem). */
function salvarTriagemParcial(id, form) {
    return transitarAtendimento(id, {
        permissao: 'triagem_clinica', de: ['EM_ATENDIMENTO'], acaoAuditoria: 'TRIAGEM_SINAIS',
        mudar: (at, { agora, user, triagem }) => {
            if (at.fila !== 'TRIAGEM') throw new Error('Este atendimento não está na fila de triagem.');
            const anamnese = validarAnamneseTriagem(form, { exigirQueixa: false });
            const sinais = validarSinaisVitais(form);
            return { novo: {}, motivo: 'Sinais vitais registrados', registrarHistorico: false, triagem: montarDocTriagem(triagem, at, { anamnese, sinais }, user, agora), depois: { sinais: resumoSinais(sinais.valores) || 'não aferidos' } };
        }
    });
}

/** Conclui a triagem: sinais + queixa + classificação de risco → o paciente vai para a fila de destino (normalmente a médica). */
function concluirTriagem(id, form) {
    return transitarAtendimento(id, {
        permissao: 'triagem_clinica', de: ['EM_ATENDIMENTO'], acaoAuditoria: 'TRIAGEM_CONCLUIR',
        mudar: (at, { agora, user, triagem }) => {
            if (at.fila !== 'TRIAGEM') throw new Error('Este atendimento não está na fila de triagem.');
            const anamnese = validarAnamneseTriagem(form);
            const sinais = validarSinaisVitais(form);
            const cl = validarClassificacao(form, { podeClassificar: hasPermission('triagem_classificar') });
            const nivel = nivelRisco(cl.risco);
            const classificacao = { tipo: 'INICIAL', risco: cl.risco, justificativa: cl.justificativa };
            return {
                novo: { status: 'AGUARDANDO', fila: cl.fila_destino, risco: cl.risco, risco_em: agora, risco_por: user.username, risco_por_nome: user.name, triagem_concluida_em: agora,
                    chamada: null, em_atendimento_por: '', em_atendimento_por_nome: '', em_atendimento_em: '', local_id: '', local_nome: '' },
                motivo: `Triagem concluída · encaminhado para ${rotuloFila(cl.fila_destino)}`,
                triagem: montarDocTriagem(triagem, at, { anamnese, sinais, classificacao }, user, agora),
                depois: { risco: cl.risco, nivel: nivel.rotulo, fila: cl.fila_destino }
            };
        }
    });
}

/**
 * Reavaliação do risco de quem espera atendimento (ou já foi classificado): novo nível ou confirmação, com justificativa,
 * e sinais vitais opcionais. O tempo-alvo recomeça só quando o nível muda.
 */
function reavaliarRisco(id, form) {
    return transitarAtendimento(id, {
        permissao: 'triagem_clinica', de: ['AGUARDANDO', 'CHAMADO'], acaoAuditoria: 'REAVALIAR_RISCO',
        mudar: (at, { agora, user, triagem }) => {
            if (!at.risco) throw new Error('Este atendimento ainda não foi classificado. Faça a triagem.');
            const cl = validarClassificacao(form, { podeClassificar: hasPermission('triagem_classificar'), inicial: false });
            const temSinais = SINAIS_VITAIS.some(s => String(form[s.k] ?? '').trim() !== '');
            const sinais = temSinais ? validarSinaisVitais(form, { exigir: false }) : null;
            const mudou = cl.risco !== at.risco;
            const classificacao = { tipo: 'REAVALIACAO', risco: cl.risco, risco_anterior: at.risco, justificativa: cl.justificativa };
            return {
                novo: mudou ? { risco: cl.risco, risco_anterior: at.risco, risco_em: agora, risco_por: user.username, risco_por_nome: user.name, reavaliado_em: agora } : { reavaliado_em: agora },
                motivo: mudou ? `Risco reavaliado: ${nivelRisco(at.risco).rotulo.split(' · ')[0]} → ${nivelRisco(cl.risco).rotulo.split(' · ')[0]}` : 'Risco reavaliado e mantido',
                registrarHistorico: true,
                triagem: montarDocTriagem(triagem, at, { sinais, classificacao }, user, agora),
                antes: { risco: at.risco }, depois: { risco: cl.risco, mudou }
            };
        }
    });
}
