// Regras da assistência hospitalar: leitos, internações, prontuário digital, solicitações de exame (Imagenologia), agenda, autorizações e transporte NIR.
// As telas só chamam estas funções (que validam permissão e regras); quem grava é services/db-hospital.js.

// ============ Leitos ============

const STATUS_LEITO = {
    LIVRE: { rotulo: 'Livre', cor: '#16a34a', fundo: '#dcfce7' },
    OCUPADO: { rotulo: 'Ocupado', cor: '#dc2626', fundo: '#fee2e2' },
    HIGIENIZACAO: { rotulo: 'Em higienização', cor: '#d97706', fundo: '#fef3c7' },
    BLOQUEADO: { rotulo: 'Bloqueado', cor: '#475569', fundo: '#e2e8f0' }
};
const rotuloStatusLeito = (s) => (STATUS_LEITO[s] || { rotulo: s || '—' }).rotulo;

// Por que um leito está bloqueado. Lista de apoio (a confirmar com o hospital); bloqueios antigos, sem categoria, contam como "Outro motivo".
const CATEGORIAS_BLOQUEIO = { MANUTENCAO: 'Manutenção', ISOLAMENTO: 'Isolamento', OUTRO: 'Outro motivo' };
const categoriaDoBloqueio = (estado) => (CATEGORIAS_BLOQUEIO[estado && estado.categoria] ? estado.categoria : 'OUTRO');

/** Situação do leito lida do banco (não da memória): para quem precisa de certeza antes de mudar o cadastro do leito. */
/** #39: grava a estrutura padrão de leitos no banco (só Administrador). Não sobrescreve nem apaga nada; pode ser repetida. */
async function migrarLeitosParaBanco() {
    if (!state.currentUser || state.currentUser.role !== 'ADMIN') throw new Error('Acesso negado: só o Administrador migra a estrutura de leitos.');
    const r = await db_migrarLeitos(leitosAMigrar());
    await auditar({ entidade: 'leito', entidade_id: 'estrutura', acao: 'MIGRACAO_LEITOS', antes: null, depois: r, motivo: 'Gravação da estrutura padrão no banco' });
    return r;
}
async function estadoLeitoNoBanco(id) { return (await getDocH(COLH.LEITOS, id)) || { id, status: 'LIVRE' }; }
const estadoLeito = (id) => (MOCK_DATA.LEITOS_ESTADO && MOCK_DATA.LEITOS_ESTADO[id]) || { id, status: 'LIVRE' };
const internacaoAtivaDoLeito = (leitoId) => (MOCK_DATA.INTERNACOES || []).find(i => i.status === 'ATIVA' && i.leito_id === leitoId) || null;
const internacaoAtivaDoPaciente = (pacienteId) => (MOCK_DATA.INTERNACOES || []).find(i => i.status === 'ATIVA' && i.paciente_id === pacienteId) || null;
const internacoesDoPaciente = (pacienteId) => (MOCK_DATA.INTERNACOES || []).filter(i => i.paciente_id === pacienteId).sort((a, b) => String(b.data_hora_internacao).localeCompare(String(a.data_hora_internacao)));

function indicadoresLeitos(leitos = estruturaHospital()) {
    const c = { total: leitos.length, LIVRE: 0, OCUPADO: 0, HIGIENIZACAO: 0, BLOQUEADO: 0, bloqueio: { MANUTENCAO: 0, ISOLAMENTO: 0, OUTRO: 0 } };
    leitos.forEach(l => {
        const e = estadoLeito(l.id);
        c[e.status] = (c[e.status] || 0) + 1;
        if (e.status === 'BLOQUEADO') c.bloqueio[categoriaDoBloqueio(e)] += 1;
    });
    c.taxa = c.total ? Math.round((c.OCUPADO / c.total) * 100) : 0;
    return c;
}

const agoraISO = () => new Date().toISOString();
const quem = () => ({
    por: (state.currentUser && state.currentUser.username) || 'sistema',
    por_nome: (state.currentUser && state.currentUser.name) || 'Sistema'
});

async function auditarLeito(leitoId, acao, antes, depois, motivo = '') {
    if (typeof auditar === 'function') await auditar({ entidade: 'leito', entidade_id: leitoId, acao, antes, depois, motivo });
}

/** Monta a internação e o novo estado do leito (puro). `extras` entra na internação (ex.: a ligação com o atendimento de origem). */
function montarInternacao({ paciente, leito, setor_origem, extras = {} }, agora, u) {
    const internacao = {
        id: newId('int'), paciente_id: paciente.id, paciente_nome: paciente.nome, prontuario: paciente.prontuario || '',
        leito_id: leito.id, andar: leito.andar, ala: leito.ala, quarto: leito.quarto,
        data_hora_internacao: agora, registrado_por: u.por, registrado_por_nome: u.por_nome, setor_origem: String(setor_origem).trim(),
        status: 'ATIVA', data_hora_alta: '', alta_por: '', ...extras
    };
    const leitoNovo = { id: leito.id, status: 'OCUPADO', internacao_id: internacao.id, paciente_id: paciente.id, desde: agora, atualizado_por: u.por, atualizado_por_nome: u.por_nome, motivo: '' };
    return { internacao, leitoNovo };
}

/** Interna o paciente no leito. Valida leito livre e paciente sem internação ativa (de forma atômica no banco). */
async function internarPaciente({ paciente, leito_id, setor_origem }) {
    if (typeof exigirPacienteVivo === 'function' && paciente) await exigirPacienteVivo(paciente.id);   // #68
    requirePermission('internacao_gerenciar');
    const leito = leitoPorId(leito_id);
    if (!leito) throw new Error('Leito inválido: escolha um leito da estrutura do hospital.');
    if (!paciente || !paciente.id) throw new Error('Selecione o paciente.');
    if (paciente.ativo === false) throw new Error('Este cadastro de paciente está inativo.');
    if (!String(setor_origem || '').trim()) throw new Error('Informe o setor de origem.');
    if (estadoLeito(leito.id).status !== 'LIVRE') throw new Error(`O leito ${leito.rotulo} não está livre (${rotuloStatusLeito(estadoLeito(leito.id).status)}).`);
    if (internacaoAtivaDoPaciente(paciente.id)) throw new Error('Este paciente já possui uma internação ativa.');
    // Quem espera na fila de leito é internado por ela: assim o atendimento fica ligado à internação e não sobra na fila.
    const naFila = (MOCK_DATA.FILA_LEITO || []).find(a => a.paciente_id === paciente.id && a.fila === 'INTERNACAO' && a.status === 'AGUARDANDO');
    if (naFila) throw new Error(`Este paciente está na fila de leito (senha ${naFila.senha}). Aloque o leito pela Fila de Leito.`);

    const { internacao, leitoNovo } = montarInternacao({ paciente, leito, setor_origem }, agoraISO(), quem());
    await db_internarAtomico({ internacao, leitoNovo });
    await auditarLeito(leito.id, 'OCUPAR', { status: 'LIVRE' }, { status: 'OCUPADO', internacao: internacao.id, prontuario: internacao.prontuario });
    if (typeof auditar === 'function') await auditar({ entidade: 'internacao', entidade_id: internacao.id, acao: 'CRIAR', depois: { paciente_id: paciente.id, leito: leito.rotulo, setor_origem: internacao.setor_origem } });
    return internacao;
}

// Tipos de alta (Etapa 9). Lista de apoio: o hospital confirma a nomenclatura (ver docs/pendencias.md). O óbito NÃO é uma alta comum:
// é registrado pela tela Óbitos (services/obitos.js), que também encerra a internação com tipo_alta = 'OBITO'.
const TIPOS_ALTA = { MELHORADA: 'Alta melhorada', CURADO: 'Alta curado', A_PEDIDO: 'Alta a pedido', TRANSFERENCIA_EXTERNA: 'Transferência para outro serviço', EVASAO: 'Evasão', OUTRO: 'Outro motivo' };
const ROTULOS_TIPO_ALTA = { ...TIPOS_ALTA, OBITO: 'Óbito' };
const TIPOS_ALTA_COM_OBSERVACAO = ['A_PEDIDO', 'EVASAO', 'OUTRO'];

/** Valida o tipo de alta e os campos que ele exige (puro, testável). */
function validarAlta(form) {
    const f = form || {};
    const tipo = String(f.tipo_alta || '');
    if (tipo === 'OBITO') throw new Error('O óbito é registrado pela tela Óbitos (pelo médico), não como alta.');
    if (!Object.prototype.hasOwnProperty.call(TIPOS_ALTA, tipo)) throw new Error('Escolha o tipo de alta.');
    const observacao = String(f.observacao || '').trim();
    const destino = String(f.destino || '').trim();
    if (observacao.length > 200) throw new Error('Observação: no máximo 200 caracteres.');
    if (destino.length > 80) throw new Error('Serviço de destino: no máximo 80 caracteres.');
    if (tipo === 'TRANSFERENCIA_EXTERNA' && destino.length < 3) throw new Error('Informe o serviço de destino da transferência.');
    if (TIPOS_ALTA_COM_OBSERVACAO.includes(tipo) && observacao.length < 5) throw new Error('Informe a observação (mínimo de 5 caracteres) para este tipo de alta.');
    return { tipo_alta: tipo, alta_destino: tipo === 'TRANSFERENCIA_EXTERNA' ? destino : '', alta_observacao: observacao };
}

/** Alta: encerra a internação e coloca o leito em higienização (nunca direto para livre). Exige o tipo de alta. */
async function darAltaInternacao(internacaoId, form) {
    requirePermission('internacao_gerenciar');
    const tipo = validarAlta(form);
    const atual = MOCK_DATA.INTERNACOES.find(i => i.id === internacaoId) || await getDocH(COLH.INTERNACOES, internacaoId);
    if (!atual || atual.status !== 'ATIVA') throw new Error('Esta internação não está ativa.');
    const agora = agoraISO();
    const u = quem();
    const internacao = { ...atual, status: 'ALTA', data_hora_alta: agora, alta_por: u.por, alta_por_nome: u.por_nome, ...tipo };
    const leitoNovo = { id: atual.leito_id, status: 'HIGIENIZACAO', internacao_id: '', paciente_id: '', desde: agora, atualizado_por: u.por, atualizado_por_nome: u.por_nome, motivo: 'Alta do paciente' };
    await db_altaAtomica({ internacao, leitoNovo });
    await auditarLeito(atual.leito_id, 'ALTA_HIGIENIZACAO', { status: 'OCUPADO' }, { status: 'HIGIENIZACAO' });
    await auditar({ entidade: 'internacao', entidade_id: atual.id, acao: 'ALTA', antes: { status: 'ATIVA' }, depois: { status: 'ALTA', tipo_alta: tipo.tipo_alta, destino: tipo.alta_destino } });
    // Horários de medicação/cuidado que ficaram pendentes deixam de valer (a tela já ignora internação encerrada; isto só deixa o histórico limpo).
    if (typeof encerrarChecagensDaInternacao === 'function') { try { await encerrarChecagensDaInternacao(atual.id, 'Alta do paciente'); } catch (err) { console.warn('Checagens pendentes não foram encerradas:', err.message); } }
    return internacao;
}

/** Transfere o paciente internado para outro leito LIVRE; o leito antigo vai para higienização e a trajetória fica na internação. */
async function transferirLeito(internacaoId, novoLeitoId, motivo) {
    requirePermission('internacao_gerenciar');
    const atual = MOCK_DATA.INTERNACOES.find(i => i.id === internacaoId) || await getDocH(COLH.INTERNACOES, internacaoId);
    if (!atual || atual.status !== 'ATIVA') throw new Error('Esta internação não está ativa.');
    const novo = leitoPorId(novoLeitoId);
    if (!novo) throw new Error('Escolha um leito da estrutura do hospital.');
    if (novo.id === atual.leito_id) throw new Error('O paciente já está neste leito.');
    if (String(motivo || '').trim().length < 5) throw new Error('Informe o motivo da transferência (mínimo de 5 caracteres).');
    if (estadoLeito(novo.id).status !== 'LIVRE') throw new Error(`O leito ${novo.rotulo} não está livre (${rotuloStatusLeito(estadoLeito(novo.id).status)}).`);
    const agora = agoraISO(); const u = quem();
    const internacao = { ...atual, leito_id: novo.id, andar: novo.andar, ala: novo.ala, quarto: novo.quarto,
        historico_leitos: [...(atual.historico_leitos || [{ leito_id: atual.leito_id, desde: atual.data_hora_internacao }]), { leito_id: novo.id, desde: agora, de: atual.leito_id, por: u.por_nome, motivo: String(motivo).trim() }] };
    const base = { atualizado_por: u.por, atualizado_por_nome: u.por_nome, desde: agora };
    await db_transferirAtomico({
        internacao,
        leitoOrigemNovo: { id: atual.leito_id, status: 'HIGIENIZACAO', internacao_id: '', paciente_id: '', motivo: 'Transferência do paciente', ...base },
        leitoDestinoNovo: { id: novo.id, status: 'OCUPADO', internacao_id: atual.id, paciente_id: atual.paciente_id, motivo: '', ...base }
    });
    await auditarLeito(atual.leito_id, 'TRANSFERENCIA_SAIDA', { status: 'OCUPADO' }, { status: 'HIGIENIZACAO', destino: novo.id }, String(motivo).trim());
    await auditarLeito(novo.id, 'TRANSFERENCIA_ENTRADA', { status: 'LIVRE' }, { status: 'OCUPADO', origem: atual.leito_id, internacao: atual.id }, String(motivo).trim());
    if (typeof auditar === 'function') await auditar({ entidade: 'internacao', entidade_id: atual.id, acao: 'TRANSFERIR', antes: { leito: atual.leito_id }, depois: { leito: novo.id }, motivo: String(motivo).trim() });
    return internacao;
}

async function concluirHigienizacao(leitoId) {
    requirePermission('leito_gerenciar');
    const agora = agoraISO(); const u = quem();
    await db_mudarLeito(leitoId, ['HIGIENIZACAO'], { id: leitoId, status: 'LIVRE', internacao_id: '', paciente_id: '', desde: agora, atualizado_por: u.por, atualizado_por_nome: u.por_nome, motivo: '', liberado_em: agora, liberado_por: u.por_nome });
    await auditarLeito(leitoId, 'LIBERAR', { status: 'HIGIENIZACAO' }, { status: 'LIVRE', liberado_por: u.por_nome });
}

/**
 * Valida o bloqueio de um leito (puro): motivo escrito, categoria da lista (padrão "Outro motivo", que é o que os bloqueios
 * anteriores à categoria representam) e previsão de liberação opcional, que não pode ser data passada.
 */
function validarBloqueio({ motivo, categoria = 'OUTRO', previsao = '' }, hoje = todayISO()) {
    const texto = String(motivo || '').trim();
    if (texto.length < 5) throw new Error('Informe o motivo do bloqueio (mínimo de 5 caracteres).');
    if (texto.length > 200) throw new Error('Motivo: no máximo 200 caracteres.');
    if (!CATEGORIAS_BLOQUEIO[categoria]) throw new Error('Escolha o tipo de bloqueio (manutenção, isolamento ou outro motivo).');
    const prev = String(previsao || '').trim();
    if (prev) {
        const d = new Date(`${prev}T00:00:00`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(prev) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== prev) throw new Error('Previsão de liberação: data inválida.');
        if (prev < hoje) throw new Error('A previsão de liberação não pode ser uma data passada.');
    }
    return { motivo: texto, categoria, previsao: prev };
}

async function bloquearLeito(leitoId, motivo, { categoria = 'OUTRO', previsao = '' } = {}) {
    requirePermission('leito_gerenciar');
    const b = validarBloqueio({ motivo, categoria, previsao });
    if (!leitoPorId(leitoId)) throw new Error('Leito inválido.');
    const agora = agoraISO(); const u = quem();
    const antes = estadoLeito(leitoId).status;
    await db_mudarLeito(leitoId, ['LIVRE', 'HIGIENIZACAO'], { id: leitoId, status: 'BLOQUEADO', internacao_id: '', paciente_id: '', desde: agora, atualizado_por: u.por, atualizado_por_nome: u.por_nome, motivo: b.motivo, categoria: b.categoria, previsao: b.previsao });
    await auditarLeito(leitoId, 'BLOQUEAR', { status: antes }, { status: 'BLOQUEADO', categoria: b.categoria, previsao: b.previsao }, b.motivo);
}

async function desbloquearLeito(leitoId) {
    requirePermission('leito_gerenciar');
    const agora = agoraISO(); const u = quem();
    await db_mudarLeito(leitoId, ['BLOQUEADO'], { id: leitoId, status: 'LIVRE', internacao_id: '', paciente_id: '', desde: agora, atualizado_por: u.por, atualizado_por_nome: u.por_nome, motivo: '', liberado_em: agora, liberado_por: u.por_nome });
    await auditarLeito(leitoId, 'DESBLOQUEAR', { status: 'BLOQUEADO' }, { status: 'LIVRE', liberado_por: u.por_nome });
}

// ============ Prontuário: registros clínicos (somente acrescentam; nada é editado ou apagado) ============
// Conformidade Legal: LGPD (Lei nº 13.709/2018), Lei do Prontuário Eletrônico (Lei nº 13.787/2018),
// Resolução CFM nº 1.821/2007 (guarda mínima de 20 anos) e Manual SBIS/CFM NGS2 (Assinatura Digital ICP-Brasil).

const ANOS_GUARDA_LEGAL_CFM = 20;

const CID10_FORMATO = /^[A-Z][0-9]{2}(\.[0-9A-Z]{1,2})?$/;
/** Valida o FORMATO do CID-10 (ex.: I10, J18.9, S72.0). */
const validarCid10 = (cid) => CID10_FORMATO.test(String(cid || '').trim().toUpperCase());

const CID11_FORMATO = /^[0-9A-HJ-NP-Z][A-HJ-NP-Z0-9]{2,5}(\.[0-9A-HJ-NP-Z]{1,3})?$/;
/** Valida o FORMATO do CID-11 OMS (ex.: BA00, 8B20, CA40.Z, 5A11, GB61, NC72.0). */
const validarCid11 = (cid) => {
    const v = String(cid || '').trim().toUpperCase();
    return v.length >= 4 && CID11_FORMATO.test(v) && !CID10_FORMATO.test(v);
};
// Tipos que valem para o paciente e não para um episódio: podem ser registrados sem internação ativa.
const TIPOS_SEM_INTERNACAO = ['ALERGIA', 'RESULTADO', 'TRANSPORTE_NIR', 'FARMACIA_PISO'];
// Gravidade informada por quem registra a alergia (descrição do profissional, não classificação do sistema).
const GRAVIDADES_ALERGIA = ['Leve', 'Moderada', 'Grave', 'Não informada'];

/** Texto único da alergia a partir dos campos digitados. O sistema não confere o agente nem sugere reações. */
function montarTextoAlergia({ agente, reacao = '', gravidade = '' }) {
    const ag = String(agente || '').trim();
    if (ag.length < 3) throw new Error('Informe o agente da alergia (medicamento, alimento, látex etc.), com ao menos 3 letras.');
    if (ag.length > 120) throw new Error('Agente: no máximo 120 caracteres.');
    const re = String(reacao || '').trim();
    if (re.length > 200) throw new Error('Reação: no máximo 200 caracteres.');
    const gr = String(gravidade || '').trim() || 'Não informada';
    if (!GRAVIDADES_ALERGIA.includes(gr)) throw new Error('Gravidade inválida.');
    return `Agente: ${ag}${re ? ` · Reação: ${re}` : ''} · Gravidade: ${gr}`;
}

/** Tabela nativa de correspondência e transição CID-10 ↔ CID-11 (OMS / Ministério da Saúde). */
const TABELA_CID_TRANSICAO = [
    { cid10: 'I10', cid11: 'BA00', descricao: 'Hipertensão essencial (primária)' },
    { cid10: 'I64', cid11: '8B20', descricao: 'Acidente vascular cerebral (AVC), não especificado como hemorrágico ou isquêmico' },
    { cid10: 'I20.0', cid11: 'BA40.0', descricao: 'Angina instável / Síndrome coronariana aguda' },
    { cid10: 'I21.9', cid11: 'BA41', descricao: 'Infarto agudo do miocárdio' },
    { cid10: 'J18.9', cid11: 'CA40.Z', descricao: 'Pneumonia bacteriana não especificada' },
    { cid10: 'E11.9', cid11: '5A11', descricao: 'Diabetes mellitus tipo 2 sem complicações' },
    { cid10: 'N18.9', cid11: 'GB61', descricao: 'Doença renal crônica não especificada' },
    { cid10: 'R51', cid11: '8A8Z', descricao: 'Cefaleia / Dor de cabeça aguda' },
    { cid10: 'S72.0', cid11: 'NC72.0', descricao: 'Fratura do colo do fêmur' },
    { cid10: 'A41.9', cid11: '1G40', descricao: 'Sepse não especificada' },
    { cid10: 'K35.8', cid11: 'DB10.0', descricao: 'Apendicite aguda' },
    { cid10: 'J44.1', cid11: 'CA22.0', descricao: 'Doença pulmonar obstrutiva crônica (DPOC) com exacerbação aguda' }
];

function buscarCorrespondenciaCid(codigo) {
    const c = String(codigo || '').trim().toUpperCase();
    if (!c) return null;
    return TABELA_CID_TRANSICAO.find(x => x.cid10 === c || x.cid11 === c) || null;
}

/**
 * Calcula a data de guarda obrigatória mínima de 20 anos a partir da última movimentação
 * (Lei nº 13.787/2018 Art. 6º e Resolução CFM nº 1.821/2007 Art. 8º).
 */
function calcularGuardaLegal20Anos(ultimaMovimentacaoISO) {
    const baseStr = String(ultimaMovimentacaoISO || new Date().toISOString()).slice(0, 10);
    const partes = baseStr.split('-');
    const anoBase = Number(partes[0]) || new Date().getFullYear();
    const mes = partes[1] || '01';
    const dia = partes[2] || '01';
    const guardaAte = `${anoBase + ANOS_GUARDA_LEGAL_CFM}-${mes}-${dia}`;
    return {
        ultima_movimentacao: baseStr,
        guarda_obrigatoria_ate: guardaAte,
        anos_minimos: ANOS_GUARDA_LEGAL_CFM,
        bloqueio_expurgo: true,
        norma: 'Lei nº 13.787/2018 (Art. 6º) e Resolução CFM nº 1.821/2007 (Art. 8º)'
    };
}

/** Verifica se um prontuário pode ser eliminado/expurgado (proibido antes de 20 anos da última movimentação). */
function podeExpurgarProntuario(ultimaMovimentacaoISO, dataReferenciaISO = todayISO()) {
    const info = calcularGuardaLegal20Anos(ultimaMovimentacaoISO);
    const ref = String(dataReferenciaISO || todayISO()).slice(0, 10);
    const permitido = ref >= info.guarda_obrigatoria_ate;
    return {
        permitido,
        guarda_obrigatoria_ate: info.guarda_obrigatoria_ate,
        motivo: permitido
            ? 'Prazo legal mínimo de 20 anos cumprido.'
            : `EXPURGO BLOQUEADO PELA LEI Nº 13.787/2018 E RES. CFM Nº 1.821/2007: guarda obrigatória por 20 anos até ${formatDateBR(info.guarda_obrigatoria_ate)}.`
    };
}

/**
 * Gera o bloco de Assinatura Digital padrão ICP-Brasil (SBIS/CFM NGS2 — Nível de Garantia de Segurança 2)
 * e o hash criptográfico SHA-256 do documento clínico para impedir adulteração.
 */
function gerarAssinaturaDigitalICPBrasil({ autor, autor_nome, perfil, registro_conselho, tipo, texto, cid = '', cid_11 = '', em }) {
    const conselho = String(registro_conselho || '').trim()
        || 'NÃO INFORMADO';
    const payloadCan = `${tipo}|${autor || 'sistema'}|${autor_nome || 'Profissional'}|${conselho}|${cid || ''}|${cid_11 || ''}|${String(texto || '').trim()}|${em}`;
    const hashFn = typeof calcularHashSHA256Deterministico === 'function'
        ? calcularHashSHA256Deterministico
        : (s) => String(s).length.toString(16).padStart(64, '0');
    const hash_documento = hashFn(payloadCan);
    const serial = hashFn(`${autor || 'hgp'}|${conselho}|ICP-BRASIL`).slice(0, 20);
    return {
        padrao: 'ICP-Brasil / SBIS-CFM NGS2',
        algoritmo: 'SHA256withRSA (PKCS#7 / CMS / PAdES)',
        ac_emissora: 'AC CFM / ICP-Brasil — Cadeia V5',
        certificado_cn: `${autor_nome || 'Profissional HGP'}:${conselho}`,
        registro_conselho: conselho,
        serial_certificado: `ICP-BR-${serial}`,
        carimbo_tempo: em,
        autoridade_carimbo_tempo: 'ACT ICP-Brasil / Observatório Nacional',
        hash_documento,
        validado: true
    };
}

/**
 * Verifica matematicamente se um registro clínico do PEP mantém sua integridade original ou se sofreu tentativa de adulteração.
 */
function verificarIntegridadeRegistroClinico(reg) {
    if (!reg) return { integro: false, motivo: 'Registro inexistente.' };
    const ass = reg.assinatura_icp || {};
    const conselho = reg.registro_conselho || ass.registro_conselho || '';
    const esperado = gerarAssinaturaDigitalICPBrasil({
        autor: reg.autor,
        autor_nome: reg.autor_nome,
        perfil: reg.perfil,
        registro_conselho: conselho,
        tipo: reg.tipo,
        texto: reg.texto,
        cid: reg.cid || '',
        cid_11: reg.cid_11 || '',
        em: reg.em
    });
    const hashSalvo = reg.hash_integridade || ass.hash_documento || esperado.hash_documento;
    const integro = hashSalvo === esperado.hash_documento;
    return {
        integro,
        hash_atual: esperado.hash_documento,
        hash_assinado: hashSalvo,
        padrao: ass.padrao || 'ICP-Brasil / SBIS-CFM NGS2',
        certificado_cn: ass.certificado_cn || esperado.certificado_cn,
        motivo: integro
            ? 'Documento íntegro e autêntico: hash SHA-256 confere com a assinatura digital ICP-Brasil (SBIS/CFM NGS2).'
            : 'ALERTA CRÍTICO DE ADULTERAÇÃO: o conteúdo atual do registro diverge do hash SHA-256 assinado digitalmente!'
    };
}

// ============ Escalas de Riscos Assistenciais (Queda / Morse e Lesão por Pressão / Braden) ============

const ESCALA_MORSE_OPCOES = [
    { id: 'BAIXO', rotulo: 'Baixo Risco de Queda (Morse 0–24)', cor: '#16a34a' },
    { id: 'MODERADO', rotulo: 'Risco Moderado de Queda (Morse 25–44)', cor: '#d97706' },
    { id: 'ALTO', rotulo: 'Alto Risco de Queda — Pulseira Amarela (Morse ≥ 45)', cor: '#dc2626' }
];

const ESCALA_BRADEN_OPCOES = [
    { id: 'BAIXO', rotulo: 'Baixo Risco de LPP (Braden 15–18)', cor: '#16a34a' },
    { id: 'MODERADO', rotulo: 'Risco Moderado de LPP (Braden 13–14)', cor: '#d97706' },
    { id: 'ALTO', rotulo: 'Alto Risco de Lesão por Pressão / LPP (Braden 10–12)', cor: '#ea580c' },
    { id: 'MUITO_ALTO', rotulo: 'Altíssimo Risco de LPP — Mudança de Decúbito 2/2h (Braden ≤ 9)', cor: '#dc2626' }
];

const TIPOS_CLINICOS = {
    EVOLUCAO: { rotulo: 'Evolução Médica', permissao: 'prontuario_evoluir', cor: '#0284c7' },
    // Enfermagem (Etapa 6): assinadas com o registro no conselho (COREN/CRM), que o sistema só exige preenchido, sem validar o número.
    EVOLUCAO_ENFERMAGEM: { rotulo: 'Evolução de Enfermagem', permissao: 'enfermagem_registrar', exigeConselho: true, cor: '#0d9488' },
    INTERCORRENCIA: { rotulo: 'Intercorrência', permissao: 'enfermagem_registrar', exigeConselho: true, cor: '#dc2626' },
    CUIDADO: { rotulo: 'Prescrição de cuidados', permissao: 'prescrever_cuidados', exigeConselho: true, cor: '#0d9488' },
    EVOLUCAO_MULTIPROFISSIONAL: { rotulo: 'Evolução Multiprofissional', permissao: 'prontuario_evoluir', cor: '#6366f1' },
    SINAIS_VITAIS: { rotulo: 'Sinais Vitais', permissao: 'prontuario_evoluir', cor: '#16a34a' },
    PRESCRICAO: { rotulo: 'Prescrição Eletrônica (Medicamentos e Dietas)', permissao: 'prescrever', cor: '#7c3aed' },
    DIAGNOSTICO: { rotulo: 'Diagnóstico (CID-10 / CID-11)', permissao: 'diagnosticar', cor: '#d97706' },
    RESULTADO: { rotulo: 'Resultado / Laudo de Exame', permissao: 'exame_resultado', cor: '#2563eb' },
    ALERGIA: { rotulo: 'Alergia / alerta', permissao: 'prontuario_evoluir', cor: '#be123c' },
    // Etapa 8: conclusão do atendimento na fila de procedimentos (assinada com o registro no conselho)
    PROCEDIMENTO: { rotulo: 'Procedimento realizado', permissao: 'atendimento_procedimentos', exigeConselho: true, cor: '#0891b2' },
    PREPARO_EXAME: { rotulo: 'Preparo de Exame (Enfermagem)', permissao: 'prontuario_evoluir', cor: '#059669' },
    FARMACIA_PISO: { rotulo: 'Farmácia (Distribuição p/ Piso)', permissao: 'prontuario_ver', cor: '#0891b2' },
    TRANSPORTE_NIR: { rotulo: 'Movimentação / Transporte (NIR)', permissao: 'transporte_ver', cor: '#ea580c' }
};

/** Prescrição por item: tipo_item (MEDICAMENTO, DIETA, CUIDADO), medicamento/item, dose, via, frequência e duração. */
function validarItensPrescricao(itens) {
    const lista = (itens || []).filter(i => String(i.medicamento || '').trim() || String(i.dose || '').trim());
    if (!lista.length) throw new Error('Inclua ao menos um item na prescrição.');
    return lista.map((i, n) => {
        const tipo_item = ['MEDICAMENTO', 'DIETA', 'CUIDADO'].includes(i.tipo_item) ? i.tipo_item : 'MEDICAMENTO';
        const item = {
            tipo_item,
            medicamento: String(i.medicamento || '').trim(),
            dose: String(i.dose || '').trim(),
            via: String(i.via || (tipo_item === 'DIETA' ? 'VO / Enteral' : '')).trim(),
            frequencia: String(i.frequencia || '').trim(),
            duracao: String(i.duracao || '').trim(),
            observacao: String(i.observacao || '').trim(),
            checagem_enfermagem: i.checagem_enfermagem || null
        };
        if (item.medicamento.length < 2) throw new Error(`Item ${n + 1}: informe o medicamento, dieta ou conduta.`);
        if (!item.dose) throw new Error(`Item ${n + 1}: informe a dose ou padrão da dieta.`);
        if (!item.frequencia) throw new Error(`Item ${n + 1}: informe a frequência / aprazamento.`);
        return item;
    });
}
const textoDoItemPrescricao = (i) => [
    i.tipo_item && i.tipo_item !== 'MEDICAMENTO' ? `[${i.tipo_item}]` : null,
    i.medicamento,
    i.dose,
    i.via,
    i.frequencia,
    i.duracao && `por ${i.duracao}`,
    i.observacao && `(${i.observacao})`
].filter(Boolean).join(' · ');

/** Valida e normaliza o conteúdo de um registro clínico (usado na internação e no atendimento de urgência/ambulatório). */
function normalizarConteudoClinico({ tipo, texto, itens = null, sinais = null, cid = '', cid_11 = '' }) {
    if (tipo === 'PRESCRICAO' && itens) { itens = validarItensPrescricao(itens); texto = itens.map(textoDoItemPrescricao).join('\n'); }
    if (tipo === 'CUIDADO' && itens) { itens = validarItensCuidados(itens); texto = itens.map(textoDoItemCuidado).join('\n'); }   // o complemento é só texto
    if (tipo === 'SINAIS_VITAIS' && sinais) { sinais = validarSinaisVitaisProntuario(sinais); texto = textoSinaisVitais(sinais, texto); }
    if (String(texto || '').trim().length < 5) throw new Error('Escreva o registro (mínimo de 5 caracteres).');
    let cidNorm = String(cid || '').trim().toUpperCase();
    let cid11Norm = String(cid_11 || '').trim().toUpperCase();
    if (tipo === 'DIAGNOSTICO') {
        if (!validarCid10(cidNorm)) throw new Error('Informe o CID-10 no formato correto (ex.: I10 ou J18.9).');
        if (cid11Norm && !validarCid11(cid11Norm)) throw new Error('Informe o CID-11 no formato correto da OMS (ex.: BA00, 8B20, CA40.Z).');
        if (!cid11Norm) {
            const corr = buscarCorrespondenciaCid(cidNorm);
            if (corr) cid11Norm = corr.cid11;
        }
    }
    return { texto: String(texto).trim(), itens: itens || [], sinais: sinais || null, cid: cidNorm, cid_11: cid11Norm };
}

/** Verifica se algum item prescrito conflita com as alergias registradas no cabeçalho fixo do paciente. */
function verificarAlertaAlergiaPrescricao(paciente, itens) {
    if (!paciente || !paciente.alergias || paciente.alergias.toLowerCase().startsWith('nega')) {
        return { conflito: false, substancias: [], mensagem: '' };
    }
    const termosAlergia = searchKey(paciente.alergias)
        .split(/[\s,;./]+/)
        .filter(t => t.length >= 4 && !['alergia', 'alergias', 'medicamentosa', 'conhecida', 'grave', 'sinais', 'sodica'].includes(t));
    const conflitos = [];
    (itens || []).forEach(it => {
        const medKey = searchKey(it.medicamento || '');
        termosAlergia.forEach(termo => {
            if (medKey.includes(termo) && !conflitos.includes(it.medicamento)) {
                conflitos.push(it.medicamento);
            }
        });
    });
    return {
        conflito: conflitos.length > 0,
        substancias: conflitos,
        mensagem: conflitos.length
            ? `ALERTA DE SEGURANÇA (ALERGIA MEDICAMENTOSA): O paciente possui alergia registrada ("${paciente.alergias}") incompatível com: ${conflitos.join(', ')}.`
            : ''
    };
}

/** Valida e formata aferição de Sinais Vitais pela Enfermagem. */
function validarSinaisVitaisProntuario(sinais = {}) {
    const pa = String(sinais.pa || '').trim();
    const fc = String(sinais.fc || '').trim();
    const fr = String(sinais.fr || '').trim();
    const temp = String(sinais.temp || '').trim();
    const spo2 = String(sinais.spo2 || '').trim();
    const hgt = String(sinais.hgt || '').trim();
    const dor = String(sinais.dor || '').trim();
    if (!pa && !fc && !temp && !spo2) {
        throw new Error('Informe ao menos Pressão Arterial (PA), Frequência Cardíaca (FC), Temperatura ou SpO2.');
    }
    return {
        pa: pa ? (pa.includes('mmHg') ? pa : `${pa} mmHg`) : '',
        fc: fc ? (fc.includes('bpm') ? fc : `${fc} bpm`) : '',
        fr: fr ? (fr.includes('irpm') ? fr : `${fr} irpm`) : '',
        temp: temp ? (temp.includes('°') ? temp : `${temp} °C`) : '',
        spo2: spo2 ? (spo2.includes('%') ? spo2 : `${spo2}%`) : '',
        hgt: hgt ? (hgt.includes('mg') ? hgt : `${hgt} mg/dL`) : '',
        dor: dor ? (dor.includes('/') ? dor : `${dor}/10`) : ''
    };
}

function textoSinaisVitais(s, obs = '') {
    const partes = [
        s.pa && `PA: ${s.pa}`,
        s.fc && `FC: ${s.fc}`,
        s.fr && `FR: ${s.fr}`,
        s.temp && `Temp: ${s.temp}`,
        s.spo2 && `SpO2: ${s.spo2}`,
        s.hgt && `HGT: ${s.hgt}`,
        s.dor && `Dor (EVA): ${s.dor}`
    ].filter(Boolean);
    return partes.join(' · ') + (String(obs || '').trim() ? ` — ${String(obs).trim()}` : '');
}

/**
 * Onde o registro clínico se encaixa (regra pura):
 *  - COMPLEMENTO: precisa de um registro original do mesmo paciente e do mesmo tipo, e herda dele a internação e o atendimento.
 *    Vale para qualquer registro assinado, com ou sem internação ativa (correções depois da alta ou de um atendimento de urgência).
 *    Um complemento não recebe outro complemento: todos ficam ligados ao registro original.
 *  - ALERGIA: vale para o paciente, sem internação.
 *  - Demais tipos novos: exigem internação ativa (o atendimento de urgência/ambulatório entra pela consulta médica).
 */
function resolverContextoClinico({ tipo, internacao = null, paciente_id = '', original = null, complementa_id = '' }) {
    const pid = String(paciente_id || (internacao && internacao.paciente_id) || '');
    if (!pid) throw new Error('Selecione o paciente.');
    if (complementa_id) {
        if (!original) throw new Error('Registro original não encontrado para complementar.');
        if (original.paciente_id !== pid) throw new Error('O registro original pertence a outro paciente.');
        if (original.tipo !== tipo) throw new Error('O complemento precisa ser do mesmo tipo do registro original.');
        if (original.complementa_id) throw new Error('Complemente o registro original, não outro complemento.');
        return { paciente_id: pid, internacao_id: original.internacao_id || '', atendimento_id: original.atendimento_id || '', atendimento_senha: original.atendimento_senha || '' };
    }
    if (TIPOS_SEM_INTERNACAO.includes(tipo)) return { paciente_id: pid, internacao_id: internacao && internacao.status === 'ATIVA' ? internacao.id : '', atendimento_id: '', atendimento_senha: '' };
    if (!internacao || internacao.status !== 'ATIVA') throw new Error('O registro clínico exige uma internação ativa do paciente.');
    return { paciente_id: pid, internacao_id: internacao.id, atendimento_id: '', atendimento_senha: '' };
}

async function registrarClinico({ internacao = null, paciente_id = '', tipo, texto, itens = null, sinais = null, cid = '', cid_11 = '', complementa_id = '', solicitacao_id = '', transporte_id = '', registro_conselho = '', certificado_icp = '' }) {
    const cfg = TIPOS_CLINICOS[tipo];
    if (!cfg) throw new Error('Tipo de registro inválido.');
    // Movimentação (NIR) e distribuição da farmácia são lançadas pelos módulos de apoio, com a permissão de cada um.
    if (tipo !== 'TRANSPORTE_NIR' && tipo !== 'FARMACIA_PISO') requirePermission(cfg.permissao);
    const original = complementa_id ? (((MOCK_DATA.REGISTROS_CLINICOS || {}).items || []).find(r => r.id === complementa_id) || await getDocH(COLH.REGISTROS, complementa_id)) : null;
    const ctx = resolverContextoClinico({ tipo, internacao, paciente_id, original, complementa_id });
    if (tipo === 'CUIDADO' && !complementa_id && !(itens && itens.length)) throw new Error('Inclua ao menos um cuidado.');
    const conteudo = normalizarConteudoClinico({ tipo, texto, itens, sinais, cid, cid_11 });
    if (cfg.exigeConselho && String(registro_conselho || '').trim().length < 3) throw new Error(`Informe o seu registro no conselho (COREN/CRM) para assinar ${cfg.rotulo.toLowerCase()}.`);
    if (String(registro_conselho || '').length > 30) throw new Error('Registro no conselho: no máximo 30 caracteres.');
    const u = quem();
    const em = agoraISO();
    const perfil = (state.currentUser && state.currentUser.role) || 'ADMIN';
    // O número do conselho é o que a pessoa informou. Sem ele, o registro sai com a marca "não informado" (nunca um número inventado).
    const conselho = String(registro_conselho || '').trim() || 'NÃO INFORMADO';
    const assinatura_icp = gerarAssinaturaDigitalICPBrasil({
        autor: u.por, autor_nome: u.por_nome, perfil, registro_conselho: conselho, tipo,
        texto: conteudo.texto, cid: conteudo.cid, cid_11: conteudo.cid_11, em
    });
    if (certificado_icp) assinatura_icp.tipo_midia = String(certificado_icp).trim();
    const guarda = calcularGuardaLegal20Anos(em);
    const pacId = ctx.paciente_id;
    const reg = {
        id: newId('clin'), ...ctx, tipo, texto: conteudo.texto, itens: conteudo.itens, sinais: conteudo.sinais, cid: conteudo.cid, cid_11: conteudo.cid_11,
        complementa_id, solicitacao_id, transporte_id, autor: u.por, autor_nome: u.por_nome, perfil, registro_conselho: conselho,
        em, assinado: true, assinatura_icp, hash_integridade: assinatura_icp.hash_documento, guarda_legal_ate: guarda.guarda_obrigatoria_ate
    };
    await setDocH(COLH.REGISTROS, reg);
    itens = conteudo.itens;
    if (tipo === 'PRESCRICAO' && Array.isArray(itens) && itens.length && internacao) {
        const lObj = leitoPorId(internacao.leito_id) || { rotulo: internacao.leito_id };
        for (let idx = 0; idx < itens.length; idx++) {
            const it = itens[idx];
            if (it.tipo_item && it.tipo_item !== 'MEDICAMENTO') continue; // Dietas e cuidados ficam na prescrição/enfermagem
            const disp = {
                id: newId('far'),
                codigo: `FAR-${todayISO().replace(/-/g, '')}-${String((MOCK_DATA.FARMACIA_DISPENSACOES || []).length + 1).padStart(4, '0')}`,
                prescricao_id: reg.id,
                item_index: idx,
                paciente_id: internacao.paciente_id,
                paciente_nome: internacao.paciente_nome,
                prontuario: internacao.prontuario || '',
                internacao_id: internacao.id,
                piso_andar: String(internacao.andar || '1'),
                piso_rotulo: `${internacao.andar || '1'}º Andar (Piso ${internacao.andar || '1'})`,
                ala_setor: internacao.ala || 'Unidade de Internação',
                leito_id: internacao.leito_id,
                leito_rotulo: lObj.rotulo,
                medicamento: it.medicamento,
                dose: it.dose,
                via: it.via || '—',
                frequencia: it.frequencia,
                lote: '',
                quantidade: it.duracao || 'Dose prescrita (24h)',
                prescrito_por: u.por_nome,
                prescrito_em: reg.em,
                status: 'AGUARDANDO_RETIRADA',
                retirada: null,
                administracao: null
            };
            await setDocH(COLH.FARMACIA, disp);
        }
    }
    await auditar({ entidade: 'prontuario', entidade_id: pacId, acao: complementa_id ? 'COMPLEMENTAR' : 'REGISTRAR', depois: { tipo, registro: reg.id, internacao: ctx.internacao_id, atendimento: ctx.atendimento_id } });
    return reg;
}

/**
 * Checagem Beira-Leito pela Enfermagem de um item da Prescrição Eletrônica (Medicamento, Dieta ou Cuidado).
 * Registra confirmação de administração com data/hora, profissional, COREN e sincroniza com a Farmácia do Piso.
 */
async function checarItemPrescricaoEnfermagem(prescricaoId, indiceItem, { checado_por = '', coren = '', observacao = '' } = {}) {
    if (!hasPermission('prescricao_checar') && !hasPermission('prontuario_evoluir')) {
        throw new Error('Acesso negado: apenas Enfermagem ou Médico pode checar a administração da prescrição.');
    }
    let reg = null;
    for (const arr of Object.values(MOCK_DATA.REGISTROS_CLINICOS_CACHE || {})) {
        const achado = (arr || []).find(r => r.id === prescricaoId);
        if (achado) { reg = achado; break; }
    }
    if (!reg && MOCK_DATA.REGISTROS_CLINICOS && Array.isArray(MOCK_DATA.REGISTROS_CLINICOS.items)) {
        reg = MOCK_DATA.REGISTROS_CLINICOS.items.find(r => r.id === prescricaoId) || null;
    }
    if (!reg) throw new Error('Prescrição não encontrada.');
    const idx = Number(indiceItem);
    if (!Array.isArray(reg.itens) || !reg.itens[idx]) throw new Error('Item da prescrição não encontrado.');

    const u = quem();
    const agora = agoraISO();
    const profNome = String(checado_por || u.por_nome).trim();
    const profCoren = String(coren || '').trim();
    if (profCoren.length < 3) throw new Error('Informe o seu registro no conselho (COREN/CRM) para assinar a checagem.');
    const checagem = {
        checado: true,
        por: profNome,
        coren: profCoren,
        em: agora,
        observacao: String(observacao || 'Administrado e checado à beira-leito').trim()
    };

    const novosItens = reg.itens.map((it, i) => (i === idx ? { ...it, checagem_enfermagem: checagem } : it));
    const atualizado = { ...reg, itens: novosItens };
    await setDocH(COLH.REGISTROS, atualizado);

    // Sincroniza também na aba Farmácia se houver item vinculado
    const itemAlvo = reg.itens[idx];
    const dispVinc = (MOCK_DATA.FARMACIA_DISPENSACOES || []).find(f =>
        (f.prescricao_id === prescricaoId && (f.item_index === idx || f.medicamento === itemAlvo.medicamento))
        || (f.paciente_id === reg.paciente_id && f.medicamento === itemAlvo.medicamento && f.status !== 'ADMINISTRADO')
    );
    if (dispVinc && dispVinc.status !== 'ADMINISTRADO') {
        await setDocH(COLH.FARMACIA, {
            ...dispVinc,
            status: 'ADMINISTRADO',
            administracao: { administrado_por: `${profNome} (${profCoren})`, administrado_em: agora, observacao: checagem.observacao }
        });
    }

    if (typeof auditar === 'function') {
        await auditar({ entidade: 'prontuario', entidade_id: reg.paciente_id, acao: 'CHECAGEM_PRESCRICAO', depois: { prescricao_id: prescricaoId, item: itemAlvo.medicamento, checagem } });
    }
    return atualizado;
}

/**
 * Atualiza os Alertas Visuais Fixos de Riscos Assistenciais do paciente (Escala de Morse - Risco de Queda,
 * Escala de Braden - Risco de Lesão por Pressão / LPP e Precaução de Contato/Isolamento) e audita.
 */
async function atualizarRiscosAssistenciaisPaciente(pacienteId, { risco_queda = 'BAIXO', risco_lpp = 'BAIXO', precaucao = 'Padrão', observacoes = '' } = {}) {
    if (!hasPermission('risco_assistencial_gerenciar') && !hasPermission('prontuario_evoluir')) {
        throw new Error('Acesso negado: seu perfil não pode alterar escalas de risco assistencial.');
    }
    const pac = await db_getPaciente(pacienteId);
    if (!pac) throw new Error('Paciente não encontrado.');
    const u = quem();
    const agora = agoraISO();
    const antes = pac.riscos_assistenciais || null;
    const riscos_assistenciais = {
        risco_queda: ['BAIXO', 'MODERADO', 'ALTO'].includes(risco_queda) ? risco_queda : 'BAIXO',
        risco_lpp: ['BAIXO', 'MODERADO', 'ALTO', 'MUITO_ALTO'].includes(risco_lpp) ? risco_lpp : 'BAIXO',
        precaucao: String(precaucao || 'Padrão').trim(),
        observacoes: String(observacoes || '').trim(),
        avaliado_por: u.por_nome,
        avaliado_em: agora
    };
    const atualizado = { ...pac, riscos_assistenciais, atualizado_em: agora, atualizado_por: u.por };
    await db_savePaciente(atualizado);
    if (state.prontuario && state.prontuario.pacienteId === pacienteId) {
        state.prontuario.paciente = atualizado;
    }
    if (typeof auditar === 'function') {
        await auditar({ entidade: 'paciente', entidade_id: pacienteId, acao: 'RISCOS_ASSISTENCIAIS', antes, depois: riscos_assistenciais });
    }
    return atualizado;
}

/** Atualiza as alergias em destaque no cabeçalho do Prontuário do paciente e audita a alteração. */
async function atualizarAlergiasPaciente(pacienteId, alergiasTexto) {
    if (!hasPermission('alergia_gerenciar') && !hasPermission('prontuario_evoluir')) {
        throw new Error('Acesso negado: seu perfil não pode alterar o registro de alergias.');
    }
    const pac = await db_getPaciente(pacienteId);
    if (!pac) throw new Error('Paciente não encontrado.');
    const texto = String(alergiasTexto || '').trim() || 'Nega alergias medicamentosas conhecidas';
    const antes = pac.alergias || '';
    const atualizado = { ...pac, alergias: texto, atualizado_em: agoraISO(), atualizado_por: quem().por };
    await db_savePaciente(atualizado);
    if (state.prontuario && state.prontuario.pacienteId === pacienteId) {
        state.prontuario.paciente = atualizado;
    }
    if (typeof auditar === 'function') {
        await auditar({ entidade: 'paciente', entidade_id: pacienteId, acao: 'ALERGIAS', antes: { alergias: antes }, depois: { alergias: texto } });
    }
    return atualizado;
}

/** Abre o prontuário de um paciente cadastrado (uma vez só; reabrir devolve o mesmo). Fica na auditoria. */
async function abrirProntuario(paciente) {
    requirePermission('prontuario_ver');
    if (!paciente || !paciente.id) throw new Error('Selecione o paciente.');
    if (paciente.ativo === false) throw new Error('Este cadastro de paciente está inativo.');
    const existente = MOCK_DATA.PRONTUARIOS.find(p => p.id === paciente.id) || await getDocH(COLH.PRONTUARIOS, paciente.id);
    if (existente) return existente;
    const u = quem();
    const reg = { id: paciente.id, paciente_id: paciente.id, nome: paciente.nome, prontuario: paciente.prontuario || '', aberto_em: agoraISO(), aberto_por: u.por_nome };
    await setDocH(COLH.PRONTUARIOS, reg);
    if (typeof auditar === 'function') await auditar({ entidade: 'prontuario', entidade_id: paciente.id, acao: 'ABRIR_PRONTUARIO', depois: { prontuario: reg.prontuario } });
    return reg;
}

/** Consulta de prontuários: união dos prontuários abertos com os pacientes que já tiveram internação. */
function listaProntuarios(abertos, internacoes) {
    const mapa = new Map();
    const get = (id, nome, prontuario) => {
        if (!mapa.has(id)) {
            const pCache = (MOCK_DATA.PACIENTES_SEED_MAP && MOCK_DATA.PACIENTES_SEED_MAP[id])
                || ((typeof CAD_DATA !== 'undefined' && Array.isArray(CAD_DATA.paciente)) ? CAD_DATA.paciente.find(x => x.id === id) : null);
            mapa.set(id, {
                paciente_id: id,
                nome: nome || (pCache && pCache.nome) || '',
                prontuario: prontuario || (pCache && pCache.prontuario) || '',
                cpf: (pCache && pCache.cpf) || '',
                alergias: (pCache && pCache.alergias) || '',
                internacoes: 0,
                ativa: null,
                ultima: '',
                aberto_em: ''
            });
        }
        return mapa.get(id);
    };
    (abertos || []).forEach(a => { const r = get(a.paciente_id, a.nome, a.prontuario); r.aberto_em = a.aberto_em; });
    (internacoes || []).forEach(i => {
        const r = get(i.paciente_id, i.paciente_nome, i.prontuario);
        r.internacoes++;
        if (i.status === 'ATIVA') r.ativa = i;
        if (String(i.data_hora_internacao) > r.ultima) r.ultima = i.data_hora_internacao;
    });
    return [...mapa.values()].sort((a, b) => String(b.ultima || b.aberto_em).localeCompare(String(a.ultima || a.aberto_em)));
}

// ============ Tipos de exame, status e prioridade ============

const PRIORIDADES = [{ id: 'URGENTE', rotulo: 'Urgente' }, { id: 'ELETIVO', rotulo: 'Eletivo' }];
const SETORES_EXAME = { IMAGENOLOGIA: 'Imagenologia', ULTRASSONOGRAFIA: 'Ultrassonografia' };

const SALAS_IMAGENOLOGIA = [
    'Sala 01 - Tomógrafo Multislice 64 Canais',
    'Sala 02 - Raio-X Digital (Radiografia)',
    'Sala 03 - Ressonância Magnética 1.5T',
    'Sala 04 - Ultrassonografia / Doppler',
    'Exame no Leito (Equipamento Portátil)'
];

const STATUS_EXAME = {
    SOLICITADO: 'Solicitado',
    AGUARDANDO_TRIAGEM: 'Aguardando triagem',
    EM_AVALIACAO: 'Em avaliação',
    AGUARDANDO_AGENDAMENTO: 'Aguardando agendamento',
    AGENDADO: 'Agendado',
    EM_ATENDIMENTO: 'Em realização',
    REALIZADO: 'Disponível / Laudo liberado',
    CANCELADO: 'Cancelado',
    REAGENDAMENTO_NECESSARIO: 'Reagendamento necessário',
    PENDENTE_AUTORIZACAO: 'Pendente de autorização'
};
const rotuloStatusExame = (s) => STATUS_EXAME[s] || s;

/** Mudanças de status permitidas. REALIZADO e CANCELADO encerram o fluxo. */
const TRANSICOES_EXAME = {
    SOLICITADO: ['AGUARDANDO_TRIAGEM', 'PENDENTE_AUTORIZACAO', 'AGENDADO', 'CANCELADO'],
    PENDENTE_AUTORIZACAO: ['AGUARDANDO_TRIAGEM', 'CANCELADO'],
    AGUARDANDO_TRIAGEM: ['EM_AVALIACAO', 'AGENDADO', 'CANCELADO'],
    EM_AVALIACAO: ['AGUARDANDO_AGENDAMENTO', 'PENDENTE_AUTORIZACAO', 'AGENDADO', 'CANCELADO'],
    AGUARDANDO_AGENDAMENTO: ['AGENDADO', 'CANCELADO'],
    AGENDADO: ['EM_ATENDIMENTO', 'REAGENDAMENTO_NECESSARIO', 'CANCELADO'],
    REAGENDAMENTO_NECESSARIO: ['AGENDADO', 'CANCELADO'],
    EM_ATENDIMENTO: ['REALIZADO', 'REAGENDAMENTO_NECESSARIO', 'CANCELADO'],
    REALIZADO: [], CANCELADO: []
};
const transicaoPermitida = (de, para) => (TRANSICOES_EXAME[de] || []).includes(para);
const statusEncerrado = (s) => s === 'REALIZADO' || s === 'CANCELADO';

function tiposExame() {
    const cad = typeof cadRowsOf === 'function' ? cadRowsOf('tipoexame').filter(t => t.ativo !== false) : [];
    if (cad.length) return cad;
    if (typeof CAD_DATA !== 'undefined' && Array.isArray(CAD_DATA.tipoexame) && CAD_DATA.tipoexame.length) {
        return CAD_DATA.tipoexame.filter(t => t.ativo !== false);
    }
    return TIPOS_EXAME_PADRAO;
}
const permissaoDoSetor = (setor) => (setor === 'ULTRASSONOGRAFIA' ? 'ultrassom_gerenciar' : 'imagem_gerenciar');

// ============ Autorizações (APAC) ============

const STATUS_AUTORIZACAO = { PENDENTE: 'Pendente', APROVADA: 'Aprovada', NEGADA: 'Negada', VENCIDA: 'Vencida' };

/** Situação REAL da autorização: só é aprovada com número, data e validade; vence quando passa da validade. */
function statusAutorizacao(aut, hoje = todayISO()) {
    if (!aut) return 'PENDENTE';
    if (aut.decisao === 'NEGADA') return 'NEGADA';
    if (aut.decisao !== 'APROVADA' || !String(aut.numero_apac || '').trim() || !aut.data_autorizacao || !aut.validade_fim) return 'PENDENTE';
    return aut.validade_fim < hoje ? 'VENCIDA' : 'APROVADA';
}
const autorizacaoDaSolicitacao = (solId) => (MOCK_DATA.AUTORIZACOES || []).find(a => a.solicitacao_id === solId) || null;
const autorizacaoVigente = (solId) => statusAutorizacao(autorizacaoDaSolicitacao(solId)) === 'APROVADA';

/** Um exame que exige autorização só pode ser agendado com autorização aprovada e dentro da validade. */
function podeAgendar(sol, dataAgendamento) {
    if (!sol.exige_autorizacao) return { ok: true };
    const aut = autorizacaoDaSolicitacao(sol.id);
    if (statusAutorizacao(aut) !== 'APROVADA') return { ok: false, motivo: 'Este exame exige autorização aprovada e dentro da validade antes de ser agendado.' };
    if (dataAgendamento && dataAgendamento > aut.validade_fim) return { ok: false, motivo: `A data do agendamento passa da validade da autorização (${formatDateBR(aut.validade_fim)}).` };
    return { ok: true };
}

// ============ Solicitação de exame ============

const MAX_PROCEDIMENTOS_SECUNDARIOS = 5; // como no formulário oficial de referência

function validarSolicitacao(f) {
    const erros = [];
    if (!f.tipo_exame_id) erros.push({ campo: 'tipo_exame_id', mensagem: 'Selecione o tipo de exame.' });
    if (!PRIORIDADES.some(p => p.id === f.prioridade)) erros.push({ campo: 'prioridade', mensagem: 'Informe a prioridade clínica.' });
    if (String(f.prioridade_justificativa || '').trim().length < 5) erros.push({ campo: 'prioridade_justificativa', mensagem: 'Justifique a prioridade escolhida (mínimo de 5 caracteres).' });
    if (!String(f.proc_nome || '').trim()) erros.push({ campo: 'proc_nome', mensagem: 'Informe o nome do procedimento principal.' });
    if (!(Number(f.proc_qtd) >= 1)) erros.push({ campo: 'proc_qtd', mensagem: 'Informe a quantidade (mínimo 1).' });
    if (String(f.diagnostico_descricao || '').trim().length < 5) erros.push({ campo: 'diagnostico_descricao', mensagem: 'Descreva o diagnóstico (justificativa clínica).' });
    if (!validarCid10(f.cid_principal)) erros.push({ campo: 'cid_principal', mensagem: 'Informe o CID-10 principal no formato correto (ex.: I10).' });
    ['cid_secundario', 'cid_causas'].forEach(c => { if (String(f[c] || '').trim() && !validarCid10(f[c])) erros.push({ campo: c, mensagem: 'CID-10 em formato inválido.' }); });
    if (!['CNS', 'CPF'].includes(f.solic_tipo_doc)) erros.push({ campo: 'solic_tipo_doc', mensagem: 'Informe o tipo de documento do solicitante (CNS ou CPF).' });
    const doc = onlyDigits(f.solic_documento);
    if (f.solic_tipo_doc === 'CPF' && !validateCPF(doc)) erros.push({ campo: 'solic_documento', mensagem: 'CPF do solicitante inválido.' });
    if (f.solic_tipo_doc === 'CNS' && doc.length !== 15) erros.push({ campo: 'solic_documento', mensagem: 'CNS do solicitante deve ter 15 dígitos.' });
    if (String(f.solic_registro || '').trim().length < 3) erros.push({ campo: 'solic_registro', mensagem: 'Informe o registro no conselho profissional.' });
    if (!f.confere) erros.push({ campo: 'confere', mensagem: 'Confirme que conferiu os dados do paciente.' });
    return erros;
}

/** Dados do paciente no momento da emissão (o formulário oficial é um documento datado). O vínculo é sempre o paciente_id. */
function dadosPacienteParaFormulario(paciente) {
    const mun = typeof cadNomeMunicipio === 'function' && paciente.municipio_id ? cadNomeMunicipio(paciente.municipio_id) : '';
    return {
        nome: paciente.nome || '', sexo: paciente.sexo || '', prontuario: paciente.prontuario || '', cns: paciente.cns || '', cpf: paciente.cpf || '',
        data_nascimento: paciente.data_nascimento || '', raca_cor: paciente.raca_cor || '', etnia: paciente.etnia || '', nome_mae: paciente.nome_mae || '',
        telefone: paciente.telefone || paciente.celular || '', responsavel_nome: paciente.responsavel_nome || '', responsavel_telefone: paciente.responsavel_telefone || '',
        endereco: [paciente.logradouro, paciente.numero, paciente.complemento, paciente.bairro].filter(Boolean).join(', '),
        municipio: mun.split('/')[0] || '', codigo_ibge: paciente.municipio_id || '', uf: paciente.uf || '', cep: paciente.cep || ''
    };
}

async function emitirSolicitacaoExame(paciente, internacao, f) {
    if (typeof exigirPacienteVivo === 'function' && paciente) await exigirPacienteVivo(paciente.id);   // #68
    requirePermission('exame_solicitar');
    const erros = validarSolicitacao(f);
    if (erros.length) throw new Error(erros[0].mensagem);
    const tipo = tiposExame().find(t => t.id === f.tipo_exame_id);
    if (!tipo) throw new Error('Tipo de exame não encontrado ou inativo.');
    const u = quem();
    const cfg = MOCK_DATA.CONFIG_HOSPITAL || {};
    const agora = agoraISO();
    const exigeAut = Boolean(f.exige_autorizacao !== undefined ? f.exige_autorizacao : tipo.exige_autorizacao);
    const stInicial = exigeAut ? 'PENDENTE_AUTORIZACAO' : 'SOLICITADO';
    const padraoProc = typeof obterProcedimentoPadronizado === 'function' ? obterProcedimentoPadronizado(tipo.id, f.proc_nome || tipo.nome) : null;
    const tabelaEscolhida = ['SIGTAP', 'TUSS'].includes(f.tabela_procedimento) ? f.tabela_procedimento : 'SIGTAP';
    const codigoSigtap = String(f.codigo_sigtap || (tabelaEscolhida === 'SIGTAP' && f.proc_codigo) || tipo.codigo_procedimento || (padraoProc && padraoProc.sigtap) || '').trim();
    const codigoTuss = String(f.codigo_tuss || (tabelaEscolhida === 'TUSS' && f.proc_codigo) || (padraoProc && padraoProc.tuss) || '').trim();
    const cid10Norm = String(f.cid_principal).trim().toUpperCase();
    const corrCid = typeof buscarCorrespondenciaCid === 'function' ? buscarCorrespondenciaCid(cid10Norm) : null;
    const cid11Norm = String(f.cid_11 || (corrCid && corrCid.cid11) || '').trim().toUpperCase();
    const protocolo = `EXA-${todayISO().replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    const sol = {
        id: newId('exa'), protocolo,
        paciente_id: paciente.id, internacao_id: internacao ? internacao.id : '', atendimento_id: String(f.atendimento_id || ''),
        localizacao: internacao ? { leito_id: internacao.leito_id, andar: internacao.andar, ala: internacao.ala, quarto: internacao.quarto } : null,
        tipo_exame_id: tipo.id, tipo_nome: tipo.nome, setor_destino: tipo.setor_destino, exige_autorizacao: exigeAut,
        prioridade: f.prioridade, prioridade_justificativa: String(f.prioridade_justificativa).trim(),
        prioridade_historico: [],
        contraste: Boolean(f.contraste),
        detalhe_contraste: String(f.detalhe_contraste || (f.contraste ? 'Com contraste' : 'Sem contraste')).trim(),
        tabela_procedimento: tabelaEscolhida,
        procedimento_principal: {
            tabela: tabelaEscolhida,
            codigo: String(f.proc_codigo || (tabelaEscolhida === 'TUSS' ? codigoTuss : codigoSigtap)).trim(),
            codigo_sigtap: codigoSigtap,
            codigo_tuss: codigoTuss,
            nome: String(f.proc_nome).trim(),
            qtd: Number(f.proc_qtd)
        },
        procedimentos_secundarios: (f.secundarios || []).filter(p => String(p.nome || '').trim()).slice(0, MAX_PROCEDIMENTOS_SECUNDARIOS)
            .map(p => ({ codigo: String(p.codigo || '').trim(), nome: String(p.nome).trim(), qtd: Number(p.qtd) || 1 })),
        diagnostico_descricao: String(f.diagnostico_descricao).trim(), cid_principal: cid10Norm, cid_11: cid11Norm,
        cid_secundario: String(f.cid_secundario || '').trim().toUpperCase(), cid_causas: String(f.cid_causas || '').trim().toUpperCase(), observacoes: String(f.observacoes || '').trim(),
        solicitante: { nome: u.por_nome, username: u.por, tipo_doc: f.solic_tipo_doc, documento: onlyDigits(f.solic_documento), registro_conselho: String(f.solic_registro).trim() },
        data_solicitacao: todayISO(), estabelecimento_solicitante: { nome: cfg.nome || (typeof APP_INFO !== 'undefined' ? APP_INFO.hospital : 'HGP'), cnes: cfg.cnes || '2497654' },
        paciente_dados: dadosPacienteParaFormulario(paciente),
        status: stInicial,
        historico: [{ status: stInicial, em: agora, por: u.por_nome, motivo: 'Solicitação emitida no prontuário eletrônico' }],
        pendencias: [], agendamento: null, preparo_enfermagem: null, realizado: null, criado_em: agora, criado_por: u.por
    };
    if (typeof gerarMetadadosDicomExame === 'function') {
        sol.dicom = gerarMetadadosDicomExame(sol);
    }
    await setDocH(COLH.SOLICITACOES, sol);
    if (typeof auditar === 'function') await auditar({ entidade: 'solicitacao_exame', entidade_id: sol.id, acao: 'CRIAR', depois: { protocolo: sol.protocolo, exame: sol.tipo_nome, prioridade: sol.prioridade, paciente: paciente.id } });
    return sol;
}

const exigirCentral = (sol) => requirePermission(permissaoDoSetor(sol.setor_destino));
const buscarSol = async (id) => { const s = await getDocH(COLH.SOLICITACOES, id); if (!s) throw new Error('Solicitação não encontrada.'); return s; };

/**
 * Atualiza a cópia local da solicitação logo depois de gravar. A janela do exame é reaberta na sequência e não pode depender de o
 * listener já ter devolvido o documento (numa transação ele só chega depois da confirmação do servidor); o listener depois traz o mesmo dado.
 */
function espelharSolicitacaoLocal(sol) {
    const lista = MOCK_DATA.SOLICITACOES_EXAME;
    const i = lista.findIndex(s => s.id === sol.id);
    if (i >= 0) lista[i] = sol;
}

async function gravarStatusExame(sol, para, motivo, extras = {}) {
    if (!transicaoPermitida(sol.status, para)) throw new Error(`Não é possível passar de "${rotuloStatusExame(sol.status)}" para "${rotuloStatusExame(para)}".`);
    const u = quem();
    const novo = { ...sol, ...extras, status: para, historico: [...(sol.historico || []), { status: para, em: agoraISO(), por: u.por_nome, motivo: motivo || '' }] };
    await setDocH(COLH.SOLICITACOES, novo);
    espelharSolicitacaoLocal(novo);
    await auditar({ entidade: 'solicitacao_exame', entidade_id: sol.id, acao: 'STATUS', antes: { status: sol.status }, depois: { status: para }, motivo: motivo || '' });
    return novo;
}

async function avancarExame(solId, para, motivo = '') {
    const sol = await buscarSol(solId);
    exigirCentral(sol);
    if (para === 'CANCELADO') return cancelarExame(solId, motivo);
    if (para === 'AGENDADO' || para === 'REALIZADO') throw new Error('Use as ações de agendar e de registrar a realização.');
    if (para === 'AGUARDANDO_TRIAGEM' && sol.exige_autorizacao && !autorizacaoVigente(sol.id) && sol.status !== 'SOLICITADO') throw new Error('Aguardando a autorização aprovada.');
    if (para === 'PENDENTE_AUTORIZACAO' && !sol.exige_autorizacao) throw new Error('Este tipo de exame não exige autorização.');
    return gravarStatusExame(sol, para, motivo);
}

async function cancelarExame(solId, motivo) {
    const sol = await buscarSol(solId);
    if (!hasPermission(permissaoDoSetor(sol.setor_destino)) && !hasPermission('exame_solicitar')) throw new Error('Acesso negado: seu perfil não pode cancelar este exame.');
    if (String(motivo || '').trim().length < 5) throw new Error('Informe o motivo do cancelamento (mínimo de 5 caracteres).');
    if (sol.agendamento && sol.agendamento.vaga_id) await db_ajustarVaga(sol.agendamento.vaga_id, -1);
    return gravarStatusExame(sol, 'CANCELADO', String(motivo).trim(), { agendamento: null });
}

/** Agenda (ou reagenda) numa vaga existente, com opção de informar Sala/Equipamento e Observações de Preparo. */
async function agendarExame(solId, vagaId, extras = {}) {
    const sol = await buscarSol(solId);
    exigirCentral(sol);
    const vaga = MOCK_DATA.VAGAS_EXAME.find(v => v.id === vagaId) || await getDocH(COLH.VAGAS, vagaId);
    if (!vaga || vaga.setor !== sol.setor_destino) throw new Error('Escolha uma vaga do setor deste exame.');
    if (vaga.data < todayISO()) throw new Error('Não é possível agendar numa data passada.');
    const reagendando = sol.status === 'AGENDADO';
    if (!reagendando && !transicaoPermitida(sol.status, 'AGENDADO')) throw new Error(`Não é possível agendar um exame "${rotuloStatusExame(sol.status)}".`);
    const pode = podeAgendar(sol, vaga.data);
    if (!pode.ok) throw new Error(pode.motivo);
    if (reagendando && sol.agendamento && sol.agendamento.vaga_id === vagaId && !extras.sala && !extras.preparo) throw new Error('O exame já está nesta vaga.');
    if (!reagendando || !sol.agendamento || sol.agendamento.vaga_id !== vagaId) {
        await db_ajustarVaga(vagaId, +1);
        try {
            if (reagendando && sol.agendamento && sol.agendamento.vaga_id) await db_ajustarVaga(sol.agendamento.vaga_id, -1);
        } catch (e) { /* vaga antiga ajustada */ }
    }
    const u = quem();
    const sala = String(extras.sala || vaga.sala || SALAS_IMAGENOLOGIA[0]).trim();
    const preparo = String(extras.preparo || (sol.agendamento && sol.agendamento.preparo) || '').trim();
    const agendamento = { vaga_id: vaga.id, data: vaga.data, hora: vaga.hora, sala, preparo, por: u.por_nome, em: agoraISO() };
    const resumo = `${formatDateBR(vaga.data)} às ${vaga.hora}${sala ? ' · ' + sala : ''}${preparo ? ' (Preparo: ' + preparo + ')' : ''}`;
    if (typeof createNotification === 'function') {
        createNotification('EXAME_AGENDADO', `Exame ${sol.tipo_nome} de ${sol.paciente_dados.nome} agendado para ${resumo}.`, sol.setor_destino);
    }
    if (reagendando) {
        const novo = { ...sol, agendamento, historico: [...sol.historico, { status: 'AGENDADO', em: agoraISO(), por: u.por_nome, motivo: `Reagendado para ${resumo}` }] };
        await setDocH(COLH.SOLICITACOES, novo);
        if (typeof auditar === 'function') await auditar({ entidade: 'solicitacao_exame', entidade_id: sol.id, acao: 'REAGENDAR', antes: sol.agendamento, depois: agendamento });
        return novo;
    }
    return gravarStatusExame(sol, 'AGENDADO', `Agendado para ${resumo}`, { agendamento });
}

/**
 * Agendamento direto na Agenda da Imagenologia: permite selecionar uma vaga existente OU definir Data, Horário,
 * Sala/Equipamento e Observações de Preparo diretamente (criando/vinculando a vaga automaticamente).
 */
async function agendarExameDireto(solId, { vaga_id = '', data = '', hora = '', sala = '', preparo = '' }) {
    const sol = await buscarSol(solId);
    exigirCentral(sol);
    let targetVagaId = vaga_id;
    if (!targetVagaId) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data || '')) || data < todayISO()) throw new Error('Informe uma data válida para o agendamento (hoje em diante).');
        if (!/^\d{2}:\d{2}$/.test(String(hora || ''))) throw new Error('Informe o horário do exame.');
        if (!String(sala || '').trim()) throw new Error('Informe a Sala / Equipamento do exame.');
        const idVaga = `vaga_${sol.setor_destino}_${data}_${hora.replace(':', '')}_${sol.tipo_exame_id || 'todos'}`;
        let vagaExistente = MOCK_DATA.VAGAS_EXAME.find(v => v.id === idVaga) || await getDocH(COLH.VAGAS, idVaga);
        if (!vagaExistente) {
            vagaExistente = { id: idVaga, setor: sol.setor_destino, data, hora, sala: String(sala).trim(), capacidade: 5, ocupadas: 0, tipo_exame_id: sol.tipo_exame_id, criado_por: quem().por_nome, criado_em: agoraISO() };
            await setDocH(COLH.VAGAS, vagaExistente);
        }
        targetVagaId = vagaExistente.id;
    }
    return agendarExame(solId, targetVagaId, { sala, preparo });
}

/** Enfermagem checa o preparo do paciente para o exame agendado (jejum, acesso venoso, alergia verificada). */
async function registrarPreparoExame(solId, { jejum = false, acesso_venoso = false, alergia_verificada = false, observacoes = '' }) {
    if (!hasPermission('preparo_exame_checar') && !hasPermission('prontuario_evoluir')) {
        throw new Error('Acesso negado: apenas Enfermagem ou Médico pode checar o preparo do exame.');
    }
    const sol = await buscarSol(solId);
    const u = quem();
    const agora = agoraISO();
    const preparo_enfermagem = {
        checado: Boolean(jejum || acesso_venoso || alergia_verificada),
        jejum: Boolean(jejum),
        acesso_venoso: Boolean(acesso_venoso),
        alergia_verificada: Boolean(alergia_verificada),
        observacoes: String(observacoes || '').trim(),
        por: u.por_nome,
        em: agora
    };
    const itensOk = [
        jejum && 'Jejum confirmado',
        acesso_venoso && 'Acesso venoso pérvio',
        alergia_verificada && 'Alergia/contraste verificado'
    ].filter(Boolean).join(', ') || 'Preparo atualizado';
    const novo = {
        ...sol,
        preparo_enfermagem,
        historico: [...(sol.historico || []), { status: sol.status, em: agora, por: u.por_nome, motivo: `Preparo de enfermagem: ${itensOk}${observacoes ? ' (' + observacoes + ')' : ''}` }]
    };
    await setDocH(COLH.SOLICITACOES, novo);
    const internacao = internacaoAtivaDoPaciente(sol.paciente_id);
    if (internacao) {
        await registrarClinico({
            internacao,
            tipo: 'PREPARO_EXAME',
            solicitacao_id: sol.id,
            texto: `Checklist de Preparo (${sol.tipo_nome} - ${sol.protocolo}): ${itensOk}.${observacoes ? ' Obs.: ' + String(observacoes).trim() : ''}`
        });
    }
    return novo;
}

async function marcarReagendamento(solId, motivo) {
    const sol = await buscarSol(solId);
    exigirCentral(sol);
    if (String(motivo || '').trim().length < 5) throw new Error('Informe o motivo (mínimo de 5 caracteres).');
    if (sol.agendamento && sol.agendamento.vaga_id) await db_ajustarVaga(sol.agendamento.vaga_id, -1);
    return gravarStatusExame(sol, 'REAGENDAMENTO_NECESSARIO', String(motivo).trim(), { agendamento: null });
}

/** O exame só vira REALIZADO (Disponível / Laudo Liberado) com confirmação explícita, assinatura ICP-Brasil e metadados DICOM/PACS. */
async function registrarRealizacao(solId, { profissional, confirmado, resultado = '', registro_conselho = '' }) {
    const sol = await buscarSol(solId);
    exigirCentral(sol);
    if (!confirmado) throw new Error('Confirme que o exame foi realizado.');
    if (String(profissional || '').trim().length < 3) throw new Error('Informe o profissional responsável pelo atendimento.');
    const u = quem();
    const em = agoraISO();
    const texto = String(resultado || '').trim();
    const laudoFinal = texto || 'Exame realizado e imagens disponibilizadas no PACS/Prontuário.';
    const assinatura_icp = gerarAssinaturaDigitalICPBrasil({
        autor: u.por,
        autor_nome: String(profissional).trim(),
        perfil: 'MEDICO',
        registro_conselho,
        tipo: 'RESULTADO',
        texto: laudoFinal,
        cid: sol.cid_principal || '',
        cid_11: sol.cid_11 || '',
        em
    });
    const dicom = typeof gerarMetadadosDicomExame === 'function' ? gerarMetadadosDicomExame(sol, 'ARCHIVED_PACS') : (sol.dicom || null);
    const realizadoObj = {
        em,
        por: u.por_nome,
        profissional: String(profissional).trim(),
        registro_conselho,
        laudo: laudoFinal,
        assinatura_icp,
        hash_integridade: assinatura_icp.hash_documento
    };
    const novo = await gravarStatusExame(sol, 'REALIZADO', `Realizado e laudo assinado digitalmente (ICP-Brasil) por ${String(profissional).trim()}`, { realizado: realizadoObj, dicom });
    if (texto.length >= 5) {
        const internacao = MOCK_DATA.INTERNACOES.find(i => i.id === sol.internacao_id) || internacaoAtivaDoPaciente(sol.paciente_id);
        if (hasPermission('exame_resultado')) {
            await registrarClinico({
                internacao,
                paciente_id: sol.paciente_id,
                tipo: 'RESULTADO',
                texto: `[${sol.tipo_nome} · ${sol.protocolo}] ${texto}`,
                solicitacao_id: sol.id,
                registro_conselho
            });
        }
    }
    if (typeof createNotification === 'function') {
        createNotification('LAUDO_LIBERADO', `Laudo disponível: ${sol.tipo_nome} do paciente ${sol.paciente_dados.nome}.`, sol.setor_destino);
    }
    return novo;
}

// ============ Resultado e laudo do exame ============

const LIMITE_LAUDO = 4000;

/**
 * Valida o resultado/laudo digitado por quem assina. O sistema não interpreta o resultado nem decide o que é crítico:
 * "crítico" é marcação de quem assina, que precisa informar a quem comunicou (nome); a hora da comunicação é a do registro.
 */
function validarResultadoExame(form) {
    const texto = String(form.texto || '').trim();
    if (texto.length < 10) throw new Error('Escreva o resultado ou o laudo (mínimo de 10 caracteres).');
    if (texto.length > LIMITE_LAUDO) throw new Error(`Resultado: no máximo ${LIMITE_LAUDO} caracteres.`);
    const registro = String(form.registro_conselho || '').trim();
    if (registro.length < 3) throw new Error('Informe o seu registro no conselho profissional para assinar o laudo.');
    const critico = Boolean(form.critico);
    const comunicado = String(form.comunicado_a || '').trim();
    if (critico && comunicado.length < 3) throw new Error('Resultado crítico: informe quem foi comunicado (nome do médico ou da equipe responsável).');
    return { texto, registro_conselho: registro, critico, comunicado_a: critico ? comunicado : '' };
}

/** Linha do histórico do exame e metadados do resultado (o texto fica no prontuário, assinado e imutável). */
function montarResultadoDaSolicitacao(reg, r, agora, user) {
    return { registro_id: reg.id, em: agora, por: user.por_nome, registro_conselho: r.registro_conselho, critico: r.critico, comunicado_a: r.comunicado_a, comunicado_em: r.critico ? agora : '' };
}

/**
 * Registra o resultado/laudo de um exame JÁ REALIZADO: grava o registro assinado no prontuário do paciente (com ou sem internação)
 * e marca a solicitação, tudo na mesma transação (dois laudos ao mesmo tempo não passam). Correção posterior entra como complemento.
 */
async function registrarResultadoExame(solId, form) {
    requirePermission('exame_resultado');
    const r = validarResultadoExame(form);
    const database = requireDb();
    const u = quem();
    const solRef = database.collection(COLH.SOLICITACOES).doc(String(solId));
    let reg, gravada;
    await database.runTransaction(async (tx) => {
        const snap = await tx.get(solRef);
        if (!snap.exists) throw new Error('Solicitação não encontrada.');
        const sol = { id: snap.id, ...snap.data() };
        exigirCentral(sol);
        if (sol.status !== 'REALIZADO') throw new Error('O resultado só é registrado depois que o exame é realizado.');
        if (sol.resultado && sol.resultado.registro_id) throw new Error('Este exame já tem resultado registrado. Para corrigir, use "Complementar" no prontuário.');
        const agora = agoraISO();
        reg = {
            id: newId('clin'), paciente_id: sol.paciente_id, internacao_id: sol.internacao_id || '', atendimento_id: sol.atendimento_id || '', atendimento_senha: '', tipo: 'RESULTADO',
            texto: r.texto, itens: [], cid: '', complementa_id: '', solicitacao_id: sol.id, exame_nome: sol.tipo_nome, protocolo: sol.protocolo,
            critico: r.critico, comunicado_a: r.comunicado_a, autor: u.por, autor_nome: u.por_nome, perfil: state.currentUser.role, registro_conselho: r.registro_conselho, em: agora, assinado: true
        };
        const resultado = montarResultadoDaSolicitacao(reg, r, agora, u);
        gravada = { ...sol, resultado, historico: [...(sol.historico || []), { status: sol.status, em: agora, por: u.por_nome, motivo: r.critico ? `Resultado registrado (crítico; comunicado a ${r.comunicado_a})` : 'Resultado registrado' }] };
        tx.set(database.collection(COLH.REGISTROS).doc(reg.id), reg);
        tx.set(solRef, gravada);
    });
    espelharSolicitacaoLocal(gravada);
    await auditar({ entidade: 'solicitacao_exame', entidade_id: gravada.id, acao: 'RESULTADO', depois: { protocolo: gravada.protocolo, critico: r.critico, comunicado_a: r.comunicado_a, registro: reg.id } });
    await auditar({ entidade: 'prontuario', entidade_id: gravada.paciente_id, acao: 'REGISTRAR', depois: { tipo: 'RESULTADO', registro: reg.id, internacao: reg.internacao_id, atendimento: reg.atendimento_id } });
    return gravada;
}

/** Complemento de um laudo já assinado (o original nunca é alterado). Quem assina o complemento é o setor do exame. */
async function complementarResultadoExame(solId, form) {
    requirePermission('exame_resultado');
    const sol = await buscarSol(solId);
    exigirCentral(sol);
    if (!(sol.resultado && sol.resultado.registro_id)) throw new Error('Este exame ainda não tem resultado registrado.');
    const r = validarResultadoExame({ texto: form.texto, registro_conselho: form.registro_conselho });
    return registrarClinico({ paciente_id: sol.paciente_id, tipo: 'RESULTADO', texto: r.texto, complementa_id: sol.resultado.registro_id, solicitacao_id: sol.id, registro_conselho: r.registro_conselho });
}

/** Exames realizados que ainda não têm laudo, e os com resultado crítico (para os indicadores e os alertas). */
const examesSemLaudo = (lista) => lista.filter(s => s.status === 'REALIZADO' && !(s.resultado && s.resultado.registro_id));
const examesCriticos = (lista) => lista.filter(s => s.resultado && s.resultado.critico);

async function alterarPrioridade(solId, nova, justificativa) {
    requirePermission('exame_priorizar');
    const sol = await buscarSol(solId);
    if (statusEncerrado(sol.status)) throw new Error('Esta solicitação já foi encerrada.');
    if (!PRIORIDADES.some(p => p.id === nova)) throw new Error('Prioridade inválida.');
    if (nova === sol.prioridade) throw new Error('A solicitação já tem esta prioridade.');
    if (String(justificativa || '').trim().length < 5) throw new Error('Justifique a alteração de prioridade (mínimo de 5 caracteres).');
    const u = quem();
    const novoDoc = { ...sol, prioridade: nova, prioridade_justificativa: String(justificativa).trim(), prioridade_historico: [...(sol.prioridade_historico || []), { de: sol.prioridade, para: nova, em: agoraISO(), por: u.por_nome, justificativa: String(justificativa).trim() }] };
    await setDocH(COLH.SOLICITACOES, novoDoc);
    if (typeof auditar === 'function') await auditar({ entidade: 'solicitacao_exame', entidade_id: sol.id, acao: 'PRIORIDADE', antes: { prioridade: sol.prioridade }, depois: { prioridade: nova }, motivo: String(justificativa).trim() });
    return novoDoc;
}

async function adicionarPendencia(solId, texto) {
    const sol = await buscarSol(solId);
    exigirCentral(sol);
    if (String(texto || '').trim().length < 5) throw new Error('Descreva a pendência (mínimo de 5 caracteres).');
    const u = quem();
    const novo = { ...sol, pendencias: [...(sol.pendencias || []), { texto: String(texto).trim(), em: agoraISO(), por: u.por_nome, resolvida: false }] };
    await setDocH(COLH.SOLICITACOES, novo);
    if (typeof auditar === 'function') await auditar({ entidade: 'solicitacao_exame', entidade_id: sol.id, acao: 'PENDENCIA', depois: { texto: String(texto).trim() } });
    return novo;
}

async function resolverPendencia(solId, indice) {
    const sol = await buscarSol(solId);
    exigirCentral(sol);
    const pend = [...(sol.pendencias || [])];
    if (!pend[indice] || pend[indice].resolvida) throw new Error('Pendência não encontrada.');
    pend[indice] = { ...pend[indice], resolvida: true, resolvida_em: agoraISO(), resolvida_por: quem().por_nome };
    const novo = { ...sol, pendencias: pend };
    await setDocH(COLH.SOLICITACOES, novo);
    if (typeof auditar === 'function') await auditar({ entidade: 'solicitacao_exame', entidade_id: sol.id, acao: 'PENDENCIA_RESOLVIDA', depois: { texto: pend[indice].texto } });
    return novo;
}

// ============ Vagas ============

async function criarVaga({ setor, data, hora, capacidade, tipo_exame_id = '', sala = '' }) {
    if (!SETORES_EXAME[setor]) throw new Error('Setor inválido.');
    requirePermission(permissaoDoSetor(setor));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data || '')) || data < todayISO()) throw new Error('Informe uma data de hoje em diante.');
    if (!/^\d{2}:\d{2}$/.test(String(hora || ''))) throw new Error('Informe o horário.');
    const cap = Number(capacidade);
    if (!Number.isInteger(cap) || cap < 1 || cap > 50) throw new Error('A capacidade deve ser de 1 a 50 vagas.');
    const idVaga = `vaga_${setor}_${data}_${hora.replace(':', '')}_${tipo_exame_id || 'todos'}`;
    if (await getDocH(COLH.VAGAS, idVaga)) throw new Error('Já existe uma vaga neste dia e horário.');
    const vaga = { id: idVaga, setor, data, hora, sala: String(sala || '').trim(), capacidade: cap, ocupadas: 0, tipo_exame_id, criado_por: quem().por_nome, criado_em: agoraISO() };
    await setDocH(COLH.VAGAS, vaga);
    if (typeof auditar === 'function') await auditar({ entidade: 'agenda_vaga', entidade_id: vaga.id, acao: 'CRIAR', depois: { setor, data, hora, capacidade: cap } });
    return vaga;
}

// ============ Autorização / APAC ============

async function registrarAutorizacao(solId, f) {
    requirePermission('autorizacao_gerenciar');
    const sol = await buscarSol(solId);
    if (!['APROVADA', 'NEGADA'].includes(f.decisao)) throw new Error('Informe a decisão: aprovada ou negada.');
    const erros = [];
    if (String(f.autorizador_nome || '').trim().length < 3) erros.push('Informe o nome do profissional autorizador.');
    if (String(f.orgao_emissor || '').trim().length < 2) erros.push('Informe o código do órgão emissor.');
    if (!['CNS', 'CPF'].includes(f.autorizador_tipo_doc)) erros.push('Informe o tipo de documento do autorizador.');
    const doc = onlyDigits(f.autorizador_documento);
    if (f.autorizador_tipo_doc === 'CPF' && !validateCPF(doc)) erros.push('CPF do autorizador inválido.');
    if (f.autorizador_tipo_doc === 'CNS' && doc.length !== 15) erros.push('CNS do autorizador deve ter 15 dígitos.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(f.data_autorizacao || ''))) erros.push('Informe a data da autorização.');
    else if (f.data_autorizacao > todayISO()) erros.push('A data da autorização não pode ser futura.');
    if (f.decisao === 'APROVADA') {
        if (String(f.numero_apac || '').trim().length < 3) erros.push('Informe o número da autorização/APAC.');
        if (!f.validade_inicio || !f.validade_fim) erros.push('Informe o período de validade da APAC.');
        else if (f.validade_fim < f.validade_inicio) erros.push('O fim da validade não pode ser antes do início.');
    } else if (String(f.motivo_negativa || '').trim().length < 5) erros.push('Informe o motivo da negativa.');
    if (!String(f.estab_executante_nome || '').trim() || String(f.estab_executante_cnes || '').trim() === '') erros.push('Informe o estabelecimento executante e o CNES.');
    if (String(f.autorizador_registro || '').trim().length < 3) erros.push('Informe o registro do autorizador no conselho.');
    if (erros.length) throw new Error(erros[0]);

    const anterior = autorizacaoDaSolicitacao(solId);
    const u = quem();
    const aut = {
        id: `aut_${solId}`, solicitacao_id: solId, paciente_id: sol.paciente_id, decisao: f.decisao,
        autorizador_nome: String(f.autorizador_nome).trim(), orgao_emissor: String(f.orgao_emissor).trim(), autorizador_tipo_doc: f.autorizador_tipo_doc, autorizador_documento: doc,
        autorizador_registro: String(f.autorizador_registro).trim(), data_autorizacao: f.data_autorizacao,
        numero_apac: f.decisao === 'APROVADA' ? String(f.numero_apac).trim() : '', validade_inicio: f.decisao === 'APROVADA' ? f.validade_inicio : '', validade_fim: f.decisao === 'APROVADA' ? f.validade_fim : '',
        motivo_negativa: f.decisao === 'NEGADA' ? String(f.motivo_negativa).trim() : '',
        estab_executante_nome: String(f.estab_executante_nome).trim(), estab_executante_cnes: String(f.estab_executante_cnes).trim(),
        registrado_por: u.por_nome, registrado_em: agoraISO(),
        historico: [...((anterior && anterior.historico) || []), { em: agoraISO(), por: u.por_nome, decisao: f.decisao, numero_apac: f.decisao === 'APROVADA' ? String(f.numero_apac).trim() : '' }]
    };
    await setDocH(COLH.AUTORIZACOES, aut);
    if (typeof auditar === 'function') await auditar({ entidade: 'autorizacao', entidade_id: aut.id, acao: anterior ? 'EDITAR' : 'CRIAR', antes: anterior ? { decisao: anterior.decisao, numero_apac: anterior.numero_apac } : null, depois: { decisao: aut.decisao, numero_apac: aut.numero_apac, validade_fim: aut.validade_fim } });
    // Aprovada: libera a solicitação para a fila do setor (nunca aprova nem agenda sozinha)
    if (statusAutorizacao(aut) === 'APROVADA' && sol.status === 'PENDENTE_AUTORIZACAO') await gravarStatusExame(sol, 'AGUARDANDO_TRIAGEM', `Autorização ${aut.numero_apac} registrada`);
    return aut;
}

async function salvarConfigHospital({ nome, cnes }) {
    requirePermission('autorizacao_gerenciar');
    const c = onlyDigits(cnes);
    if (c && c.length !== 7) throw new Error('O CNES tem 7 dígitos.');
    await setDocH(COLH.CONFIG, { id: 'active', nome: String(nome || '').trim(), cnes: c, atualizado_por: quem().por_nome, atualizado_em: agoraISO() });
    if (typeof auditar === 'function') await auditar({ entidade: 'config_hospital', entidade_id: 'active', acao: 'EDITAR', depois: { nome: String(nome || '').trim(), cnes: c } });
}

// Tipos de exame padrão (TC, Raio-X, RNM, Biópsia, Ultrassonografia). Criados uma vez, com IDs fixos, pelo administrador.
const TIPOS_EXAME_PADRAO = [
    { id: 'tipo_tc', nome: 'Tomografia Computadorizada (TC)', setor_destino: 'IMAGENOLOGIA', exige_autorizacao: true },
    { id: 'tipo_rx', nome: 'Raio-X Digital (Radiografia)', setor_destino: 'IMAGENOLOGIA', exige_autorizacao: false },
    { id: 'tipo_rnm', nome: 'Ressonância Magnética (RNM)', setor_destino: 'IMAGENOLOGIA', exige_autorizacao: true },
    { id: 'tipo_biopsia', nome: 'Biópsia Guiada por Imagem', setor_destino: 'IMAGENOLOGIA', exige_autorizacao: true },
    { id: 'tipo_us', nome: 'Ultrassonografia', setor_destino: 'ULTRASSONOGRAFIA', exige_autorizacao: false }
];

async function garantirTiposExamePadrao() {
    if (!state.currentUser || state.currentUser.role !== 'ADMIN') return;
    if (typeof db === 'undefined' || !db) return;
    const database = requireDb();
    for (const t of TIPOS_EXAME_PADRAO) {
        const ref = database.collection('cad_tipoexame').doc(t.id);
        if ((await ref.get()).exists) continue;
        const codigo = await db_cadProximoCodigo('tipoexame', 'EXM');
        await ref.set({ ...t, codigo, codigo_procedimento: '', nome_procedimento: '', observacoes: 'Tipo padrão. Informe o código do procedimento conforme a tabela oficial.', ativo: true, criado_em: agoraISO(), criado_por: state.currentUser.username, versao: 1 });
    }
}

// ============================================================ MÓDULO 3: DOIS SETORES INTEGRADOS — NIR (REGULAÇÃO E DOCUMENTAÇÃO) & SETOR DE TRANSPORTE

const TIPOS_TRANSPORTE_NIR = [
    { id: 'PACIENTE', rotulo: 'Paciente' },
    { id: 'INSUMO', rotulo: 'Medicamento / Insumo' }
];

const PRIORIDADES_TRANSPORTE_NIR = [
    { id: 'ELETIVA', rotulo: 'Eletiva (Normal)', badge: 'at-badge--outros' },
    { id: 'URGENTE', rotulo: 'Urgente', badge: 'at-badge--urgente' },
    { id: 'EMERGENCIA', rotulo: 'Emergência (Imediata)', badge: 'at-badge--emergencia' }
];

const MEIOS_TRANSPORTE_NIR = [
    { id: 'MACA', rotulo: 'Maca' },
    { id: 'CADEIRA_RODAS', rotulo: 'Cadeira de Rodas' },
    { id: 'AMBULANCIA_BASICA', rotulo: 'Ambulância Básica (USB)' },
    { id: 'AMBULANCIA_UTI', rotulo: 'Ambulância UTI Móvel (USA)' },
    { id: 'MALOTE_TERMICO', rotulo: 'Carrinho / Malote Térmico (Insumos)' }
];

const SUPORTES_TRANSPORTE_NIR = [
    { id: 'OXIGENIO', rotulo: 'Oxigênio (Cilindro O2)' },
    { id: 'MONITOR', rotulo: 'Monitor Multiparamétrico' },
    { id: 'ACOMPANHANTE_MEDICO', rotulo: 'Acompanhante Médico' },
    { id: 'BOMBA_INFUSAO', rotulo: 'Bomba de Infusão Contínua' }
];

/** Documentos que o NIR organiza, confere e encaminha obrigatoriamente ao Setor de Transporte. */
const DOCUMENTOS_NIR_OPCOES = [
    { id: 'FICHA_REGULACAO_NIR', rotulo: 'Ficha de Regulação e Autorização do NIR Assinada' },
    { id: 'RESUMO_CLINICO', rotulo: 'Resumo Clínico / Prontuário / Evolução Atualizada' },
    { id: 'GUIA_EXAME_APAC', rotulo: 'Guia de Solicitação Médica / Pedido de Exame ou APAC' },
    { id: 'VAGA_CONFIRMADA', rotulo: 'Confirmação de Vaga / Sala no Setor de Destino' },
    { id: 'TERMO_TRANSFERENCIA', rotulo: 'Termo de Consentimento / Guia de Remessa de Insumo' }
];

const DESTINOS_TRANSPORTE_NIR = [
    'Imagenologia - Sala 01 (Tomografia)',
    'Imagenologia - Sala 02 (Raio-X Digital)',
    'Imagenologia - Sala 03 (Ressonância Magnética)',
    'Ultrassonografia - Sala 04',
    'Centro Cirúrgico',
    'Hemodinâmica - Sala 01',
    'UTI Adulto',
    'Pronto Socorro / Emergência',
    'Clínica Médica (3º Andar)',
    'Farmácia Central / Estoque OPME',
    'Portaria / Alta Hospitalar',
    'Transferência Externa'
];

const STATUS_TRANSPORTE_NIR = {
    AGUARDANDO_NIR: { rotulo: 'Em Organização / Documentação no NIR', setor: 'NIR', cor: '#7c3aed', fundo: '#f3e8ff', badge: 'at-badge--outros' },
    SOLICITADO_NIR: { rotulo: 'Doc. Encaminhada pelo NIR (Aguardando Transporte)', setor: 'TRANSPORTE', cor: '#d97706', fundo: '#fef3c7', badge: 'at-badge--urgente' },
    EQUIPE_DESIGNADA: { rotulo: 'Equipe Designada (Setor de Transporte)', setor: 'TRANSPORTE', cor: '#0284c7', fundo: '#e0f2fe', badge: 'at-badge--outros' },
    EM_TRANSITO: { rotulo: 'Em Trânsito (Setor de Transporte)', setor: 'TRANSPORTE', cor: '#ea580c', fundo: '#ffedd5', badge: 'at-badge--emergencia' },
    CONCLUIDO: { rotulo: 'Concluído (Entregue pelo Transporte)', setor: 'TRANSPORTE', cor: '#16a34a', fundo: '#dcfce7', badge: 'at-badge--ok' },
    CANCELADO: { rotulo: 'Cancelado', setor: 'NIR', cor: '#64748b', fundo: '#f1f5f9', badge: 'at-badge--off' }
};

const TRANSICOES_TRANSPORTE_NIR = {
    AGUARDANDO_NIR: ['SOLICITADO_NIR', 'CANCELADO'],
    SOLICITADO_NIR: ['EQUIPE_DESIGNADA', 'CANCELADO'],
    EQUIPE_DESIGNADA: ['EM_TRANSITO', 'CANCELADO'],
    EM_TRANSITO: ['CONCLUIDO', 'CANCELADO'],
    CONCLUIDO: [],
    CANCELADO: []
};

const rotuloStatusTransporteNIR = (s) => (STATUS_TRANSPORTE_NIR[s] || { rotulo: s || '—' }).rotulo;
const rotuloMeioTransporteNIR = (id) => (MEIOS_TRANSPORTE_NIR.find(m => m.id === id) || { rotulo: id || '—' }).rotulo;
const rotuloPrioridadeTransporteNIR = (id) => (PRIORIDADES_TRANSPORTE_NIR.find(p => p.id === id) || { rotulo: id || '—' }).rotulo;
const rotuloDocumentoNIR = (id) => (DOCUMENTOS_NIR_OPCOES.find(d => d.id === id) || { rotulo: id || '—' }).rotulo;
const transicaoTransportePermitida = (de, para) => (TRANSICOES_TRANSPORTE_NIR[de] || []).includes(para);

/**
 * Retorna a demanda de transporte que está EM_TRANSITO para o paciente informado (se houver).
 * Usado pelo Mapa de Leitos e pelo Cabeçalho do Prontuário para exibir o selo "Em Transporte (Destino: X)".
 */
function transporteAtivoDoPaciente(pacienteId) {
    if (!pacienteId) return null;
    return (MOCK_DATA.TRANSPORTES_NIR || []).find(t =>
        t.tipo === 'PACIENTE' && t.paciente_id === pacienteId && t.status === 'EM_TRANSITO'
    ) || null;
}

/** Retorna a última demanda vinculada a um exame agendado. */
function transporteDoExame(solId) {
    if (!solId) return null;
    return (MOCK_DATA.TRANSPORTES_NIR || []).find(t =>
        t.solicitacao_exame_id === solId && t.status !== 'CANCELADO'
    ) || null;
}

function validarDemandaTransporteNIR(f) {
    const erros = [];
    if (!['PACIENTE', 'INSUMO'].includes(f.tipo)) erros.push({ campo: 'tipo', mensagem: 'Selecione o tipo de transporte (Paciente ou Medicamento/Insumo).' });
    if (!PRIORIDADES_TRANSPORTE_NIR.some(p => p.id === f.prioridade)) erros.push({ campo: 'prioridade', mensagem: 'Selecione a prioridade da demanda.' });
    if (!String(f.setor_destino || '').trim()) erros.push({ campo: 'setor_destino', mensagem: 'Informe o destino da viagem.' });
    if (String(f.motivo || '').trim().length < 3) erros.push({ campo: 'motivo', mensagem: 'Informe o motivo da viagem.' });

    if (f.tipo === 'PACIENTE') {
        if (!f.paciente_id) erros.push({ campo: 'paciente_id', mensagem: 'Selecione obrigatoriamente um paciente cadastrado/internado.' });
        if (!MEIOS_TRANSPORTE_NIR.some(m => m.id === f.meio_transporte)) erros.push({ campo: 'meio_transporte', mensagem: 'Selecione o meio de transporte.' });
    } else if (f.tipo === 'INSUMO') {
        if (String(f.insumo_descricao || '').trim().length < 3) erros.push({ campo: 'insumo_descricao', mensagem: 'Informe o item/lote ou descrição do medicamento/insumo.' });
        if (!String(f.setor_origem || '').trim()) erros.push({ campo: 'setor_origem', mensagem: 'Informe o setor de origem do insumo.' });
    }
    return erros;
}

/**
 * Cria uma demanda no NIR (para Paciente ou Medicamento/Insumo).
 * - Se for criada por um setor solicitante (Médico/Enfermagem/Imagenologia) sem documentação NIR anexada (`encaminhar_agora === false`),
 *   entra como `AGUARDANDO_NIR` para o setor NIR organizar e encaminhar a documentação necessária ao Setor de Transporte.
 * - Se for criada pelo próprio NIR já com a documentação conferida (`encaminhar_agora !== false`), já encaminha a documentação
 *   para o Setor de Transporte (`SOLICITADO_NIR`).
 */
async function criarDemandaTransporteNIR(f) {
    requirePermission('transporte_solicitar');
    const erros = validarDemandaTransporteNIR(f);
    if (erros.length) throw new Error(erros[0].mensagem);

    const u = quem();
    const agora = agoraISO();
    const hoje = todayISO().replace(/-/g, '');
    const seq = String((MOCK_DATA.TRANSPORTES_NIR || []).length + 1).padStart(4, '0');
    const protocolo = `NIR-${hoje}-${seq}`;

    let dadosPaciente = {};
    if (f.tipo === 'PACIENTE') {
        const pac = await db_getPaciente(f.paciente_id);
        const ativa = internacaoAtivaDoPaciente(f.paciente_id);
        const leitoObj = ativa ? leitoPorId(ativa.leito_id) : (f.leito_origem_id ? leitoPorId(f.leito_origem_id) : null);
        const origemAuto = ativa
            ? `${ativa.andar}º Andar · ${ativa.ala} · Leito ${leitoObj ? leitoObj.rotulo : ativa.leito_id}`
            : (String(f.setor_origem || 'Recepção / Ambulatório').trim());
        dadosPaciente = {
            paciente_id: f.paciente_id,
            paciente_nome: (pac && pac.nome) || f.paciente_nome || 'Paciente',
            prontuario: (pac && pac.prontuario) || (ativa && ativa.prontuario) || f.prontuario || '',
            internacao_id: ativa ? ativa.id : '',
            leito_origem_id: ativa ? ativa.leito_id : (f.leito_origem_id || ''),
            setor_origem: origemAuto,
            meio_transporte: f.meio_transporte,
            suporte: Array.isArray(f.suporte) ? f.suporte : []
        };
    } else {
        dadosPaciente = {
            insumo_descricao: String(f.insumo_descricao).trim(),
            insumo_lote: String(f.insumo_lote || '').trim(),
            insumo_qtd: Number(f.insumo_qtd) || 1,
            setor_origem: String(f.setor_origem).trim(),
            meio_transporte: f.meio_transporte || 'MALOTE_TERMICO',
            suporte: []
        };
    }

    const podeRegularNIR = hasPermission('nir_gerenciar');
    const jaEncaminha = f.encaminhar_agora !== undefined ? Boolean(f.encaminhar_agora && podeRegularNIR) : podeRegularNIR;
    const docsLista = Array.isArray(f.documentos_nir) && f.documentos_nir.length
        ? f.documentos_nir
        : (f.tipo === 'PACIENTE'
            ? ['FICHA_REGULACAO_NIR', 'RESUMO_CLINICO', 'GUIA_EXAME_APAC', 'VAGA_CONFIRMADA']
            : ['FICHA_REGULACAO_NIR', 'TERMO_TRANSFERENCIA']);
    const guiaNum = String(f.numero_guia_nir || `DOC-NIR-${hoje}-${seq}`).trim();

    const documentacao_nir = jaEncaminha
        ? {
            encaminhada: true,
            numero_guia: guiaNum,
            documentos: docsLista,
            observacoes: String(f.observacoes_nir || 'Documentação conferida, organizada pelo NIR e encaminhada ao Setor de Transporte.').trim(),
            organizado_por: u.por_nome,
            encaminhado_em: agora
        }
        : {
            encaminhada: false,
            numero_guia: '',
            documentos: docsLista,
            observacoes: String(f.observacoes_nir || 'Aguardando conferência e encaminhamento documental pelo NIR.').trim(),
            organizado_por: '',
            encaminhado_em: ''
        };

    const statusInicial = jaEncaminha ? 'SOLICITADO_NIR' : 'AGUARDANDO_NIR';

    const demanda = {
        id: newId('nir'),
        protocolo,
        tipo: f.tipo,
        prioridade: f.prioridade,
        ...dadosPaciente,
        setor_destino: String(f.setor_destino).trim(),
        motivo: String(f.motivo).trim(),
        solicitacao_exame_id: f.solicitacao_exame_id || '',
        solicitante_nome: String(f.solicitante_nome || u.por_nome).trim(),
        documentacao_nir,
        status: statusInicial,
        equipe: null,
        criado_em: agora,
        criado_por: u.por,
        historico: [
            {
                status: statusInicial,
                em: agora,
                por: u.por_nome,
                detalhe: jaEncaminha
                    ? `NIR organizou e encaminhou a documentação (${guiaNum}) para o Setor de Transporte`
                    : `Demanda enviada ao NIR para organização e encaminhamento da documentação necessária`
            }
        ]
    };

    await setDocH(COLH.TRANSPORTES, demanda);

    if (f.solicitacao_exame_id) {
        const sol = await getDocH(COLH.SOLICITACOES, f.solicitacao_exame_id);
        if (sol) {
            await setDocH(COLH.SOLICITACOES, {
                ...sol,
                transporte_nir_id: demanda.id,
                historico: [...(sol.historico || []), { status: sol.status, em: agora, por: u.por_nome, motivo: `Encaminhado ao NIR (${demanda.protocolo})` }]
            });
        }
    }

    if (typeof auditar === 'function') {
        await auditar({ entidade: 'transporte_nir', entidade_id: demanda.id, acao: 'CRIAR', depois: { protocolo: demanda.protocolo, tipo: demanda.tipo, status: statusInicial, destino: demanda.setor_destino } });
    }
    return demanda;
}

/**
 * SETOR 1 (NIR): Organiza a demanda, confere/anexa a documentação necessária e encaminha formalmente ao Setor de Transporte.
 */
async function encaminharDocumentacaoNIR(id, { numero_guia_nir = '', documentos = [], observacoes_nir = '', meio_transporte = '', prioridade = '', suporte = null } = {}) {
    requirePermission('nir_gerenciar');
    const atual = await getDocH(COLH.TRANSPORTES, id);
    if (!atual) throw new Error('Demanda do NIR não encontrada.');
    if (['CONCLUIDO', 'CANCELADO'].includes(atual.status)) throw new Error('Esta demanda já foi encerrada.');
    const docsValidos = (Array.isArray(documentos) ? documentos : []).filter(Boolean);
    if (!docsValidos.length) throw new Error('Selecione ao menos um documento conferido pelo NIR para encaminhar ao Setor de Transporte.');
    const guia = String(numero_guia_nir || (atual.documentacao_nir && atual.documentacao_nir.numero_guia) || `DOC-${atual.protocolo}`).trim();
    if (guia.length < 3) throw new Error('Informe o número da Guia / Protocolo Documental do NIR.');

    const u = quem();
    const agora = agoraISO();
    const documentacao_nir = {
        encaminhada: true,
        numero_guia: guia,
        documentos: docsValidos,
        observacoes: String(observacoes_nir || 'Documentação conferida e encaminhada ao Setor de Transporte.').trim(),
        organizado_por: u.por_nome,
        encaminhado_em: agora
    };

    const novoStatus = atual.status === 'AGUARDANDO_NIR' ? 'SOLICITADO_NIR' : atual.status;
    const novo = {
        ...atual,
        prioridade: prioridade || atual.prioridade,
        meio_transporte: meio_transporte || atual.meio_transporte,
        suporte: Array.isArray(suporte) ? suporte : atual.suporte,
        documentacao_nir,
        status: novoStatus,
        historico: [
            ...(atual.historico || []),
            {
                status: novoStatus,
                em: agora,
                por: `${u.por_nome} (NIR)`,
                detalhe: `Documentação organizada e encaminhada ao Setor de Transporte · Guia: ${guia} (${docsValidos.map(rotuloDocumentoNIR).join(', ')})`
            }
        ]
    };
    await setDocH(COLH.TRANSPORTES, novo);
    if (typeof auditar === 'function') {
        await auditar({ entidade: 'transporte_nir', entidade_id: id, acao: 'ENCAMINHAR_DOCUMENTACAO_NIR', depois: documentacao_nir });
    }
    return novo;
}

/**
 * SETOR 2 (SETOR DE TRANSPORTE): Etapa 1 — Designar equipe (motorista/maqueiro e veículo/maca).
 * Exige que o NIR já tenha encaminhado a documentação (`SOLICITADO_NIR`).
 */
async function designarEquipeTransporteNIR(id, { motorista_maqueiro, veiculo_maca }) {
    requirePermission('transporte_gerenciar');
    const atual = await getDocH(COLH.TRANSPORTES, id);
    if (!atual) throw new Error('Demanda de transporte não encontrada.');
    if (atual.status === 'AGUARDANDO_NIR' || (atual.documentacao_nir && atual.documentacao_nir.encaminhada === false)) {
        throw new Error('Aguardando o setor NIR organizar e encaminhar a documentação necessária antes de designar a equipe de transporte.');
    }
    if (!transicaoTransportePermitida(atual.status, 'EQUIPE_DESIGNADA')) {
        throw new Error(`Não é possível designar equipe para uma demanda "${rotuloStatusTransporteNIR(atual.status)}".`);
    }
    if (String(motorista_maqueiro || '').trim().length < 3) throw new Error('Informe o nome do motorista ou maqueiro responsável.');
    if (String(veiculo_maca || '').trim().length < 2) throw new Error('Informe a identificação do veículo, maca ou cadeira.');

    const u = quem();
    const agora = agoraISO();
    const equipe = {
        motorista_maqueiro: String(motorista_maqueiro).trim(),
        veiculo_maca: String(veiculo_maca).trim(),
        designado_em: agora,
        designado_por: u.por_nome
    };
    const novo = {
        ...atual,
        status: 'EQUIPE_DESIGNADA',
        equipe,
        historico: [...(atual.historico || []), { status: 'EQUIPE_DESIGNADA', em: agora, por: `${u.por_nome} (Transporte)`, detalhe: `Equipe de Transporte designada: ${equipe.motorista_maqueiro} · ${equipe.veiculo_maca}` }]
    };
    await setDocH(COLH.TRANSPORTES, novo);
    if (typeof auditar === 'function') await auditar({ entidade: 'transporte_nir', entidade_id: id, acao: 'DESIGNAR_EQUIPE', depois: equipe });
    return novo;
}

/** SETOR 2 (SETOR DE TRANSPORTE): Etapa 2 — Iniciar trânsito (ativa o selo "Em Transporte" no Mapa de Leitos e no Prontuário). */
async function iniciarTransitoNIR(id) {
    requirePermission('transporte_gerenciar');
    const atual = await getDocH(COLH.TRANSPORTES, id);
    if (!atual) throw new Error('Demanda de transporte não encontrada.');
    if (!transicaoTransportePermitida(atual.status, 'EM_TRANSITO')) {
        throw new Error(`Não é possível iniciar trânsito a partir de "${rotuloStatusTransporteNIR(atual.status)}".`);
    }
    const u = quem();
    const agora = agoraISO();
    const novo = {
        ...atual,
        status: 'EM_TRANSITO',
        inicio_transito_em: agora,
        historico: [...(atual.historico || []), { status: 'EM_TRANSITO', em: agora, por: `${u.por_nome} (Transporte)`, detalhe: `Setor de Transporte iniciou o deslocamento: ${atual.setor_origem} → ${atual.setor_destino}` }]
    };
    await setDocH(COLH.TRANSPORTES, novo);
    if (typeof auditar === 'function') await auditar({ entidade: 'transporte_nir', entidade_id: id, acao: 'INICIAR_TRANSITO', depois: { status: 'EM_TRANSITO', destino: atual.setor_destino } });
    return novo;
}

/**
 * SETOR 2 (SETOR DE TRANSPORTE): Etapa 3 — Concluir transporte no destino.
 * Se for transporte de PACIENTE, grava automaticamente na linha do tempo do Prontuário Digital do paciente!
 */
async function concluirTransporteNIR(id, { recebido_por = '', observacoes = '' } = {}) {
    requirePermission('transporte_gerenciar');
    const atual = await getDocH(COLH.TRANSPORTES, id);
    if (!atual) throw new Error('Demanda de transporte não encontrada.');
    if (!transicaoTransportePermitida(atual.status, 'CONCLUIDO')) {
        throw new Error(`Não é possível concluir uma viagem com status "${rotuloStatusTransporteNIR(atual.status)}".`);
    }
    const u = quem();
    const agora = agoraISO();
    const det = [recebido_por && `Recebido por: ${String(recebido_por).trim()}`, observacoes && String(observacoes).trim()].filter(Boolean).join(' · ') || 'Entregue no destino pelo Setor de Transporte';
    const novo = {
        ...atual,
        status: 'CONCLUIDO',
        concluido_em: agora,
        concluido_por: u.por_nome,
        recebido_por: String(recebido_por || '').trim(),
        observacoes_conclusao: String(observacoes || '').trim(),
        historico: [...(atual.historico || []), { status: 'CONCLUIDO', em: agora, por: `${u.por_nome} (Transporte)`, detalhe: det }]
    };
    await setDocH(COLH.TRANSPORTES, novo);

    // Integração Cruzada: registrar automaticamente uma entrada na linha do tempo do Prontuário Digital do paciente
    if (atual.tipo === 'PACIENTE' && atual.paciente_id) {
        const internacao = internacaoAtivaDoPaciente(atual.paciente_id) || (atual.internacao_id ? MOCK_DATA.INTERNACOES.find(i => i.id === atual.internacao_id) : null);
        const leitoRot = atual.leito_origem_id ? ((leitoPorId(atual.leito_origem_id) || { rotulo: atual.leito_origem_id }).rotulo) : atual.setor_origem;
        const eqInfo = atual.equipe ? ` · Equipe de Transporte: ${atual.equipe.motorista_maqueiro} (${atual.equipe.veiculo_maca})` : '';
        const guiaInfo = atual.documentacao_nir && atual.documentacao_nir.numero_guia ? ` · Doc. NIR: ${atual.documentacao_nir.numero_guia}` : '';
        const textoTimeline = `Transporte concluído via NIR (${atual.protocolo}${guiaInfo}): Leito ${leitoRot} (${atual.setor_origem}) → ${atual.setor_destino} - Motivo: ${atual.motivo}${eqInfo}${recebido_por ? ' · Recebido por: ' + String(recebido_por).trim() : ''}.`;
        await registrarClinico({
            internacao,
            paciente_id: atual.paciente_id,
            tipo: 'TRANSPORTE_NIR',
            transporte_id: atual.id,
            texto: textoTimeline
        });
    }

    if (typeof auditar === 'function') await auditar({ entidade: 'transporte_nir', entidade_id: id, acao: 'CONCLUIR', depois: { status: 'CONCLUIDO', concluido_em: agora } });
    return novo;
}

/** Cancelar demanda (pelo NIR ou Setor de Transporte, com justificativa obrigatória). */
async function cancelarTransporteNIR(id, motivo) {
    if (!hasPermission('transporte_gerenciar') && !hasPermission('nir_gerenciar') && !hasPermission('transporte_solicitar')) {
        throw new Error('Acesso negado: seu perfil não pode cancelar demandas.');
    }
    const atual = await getDocH(COLH.TRANSPORTES, id);
    if (!atual) throw new Error('Demanda de transporte não encontrada.');
    if (!transicaoTransportePermitida(atual.status, 'CANCELADO')) {
        throw new Error(`Não é possível cancelar uma demanda "${rotuloStatusTransporteNIR(atual.status)}".`);
    }
    if (String(motivo || '').trim().length < 5) {
        throw new Error('Informe a justificativa do cancelamento (mínimo de 5 caracteres).');
    }
    const u = quem();
    const agora = agoraISO();
    const novo = {
        ...atual,
        status: 'CANCELADO',
        motivo_cancelamento: String(motivo).trim(),
        cancelado_em: agora,
        cancelado_por: u.por_nome,
        historico: [...(atual.historico || []), { status: 'CANCELADO', em: agora, por: u.por_nome, detalhe: `Cancelado: ${String(motivo).trim()}` }]
    };
    await setDocH(COLH.TRANSPORTES, novo);
    if (typeof auditar === 'function') await auditar({ entidade: 'transporte_nir', entidade_id: id, acao: 'CANCELAR', motivo: String(motivo).trim() });
    return novo;
}

// ============================================================ ABA FARMÁCIA DO PRONTUÁRIO: DISTRIBUIÇÃO PARA OS PISOS & QUEM PEGOU O QUÊ

const STATUS_FARMACIA_PISO = {
    AGUARDANDO_RETIRADA: { rotulo: 'Na Farmácia (Aguardando Retirada p/ o Piso)', cor: '#d97706', fundo: '#fef3c7', badge: 'at-badge--urgente' },
    DISTRIBUIDO_PISO: { rotulo: 'Retirado / Distribuído para o Piso', cor: '#0284c7', fundo: '#e0f2fe', badge: 'at-badge--outros' },
    ADMINISTRADO: { rotulo: 'Administrado no Paciente (Leito)', cor: '#16a34a', fundo: '#dcfce7', badge: 'at-badge--ok' }
};

// Sem lista fixa de profissionais: quem retira o medicamento é digitado (nome e registro), nunca sugerido por dados fictícios.
const PROFISSIONAIS_RETIRADA_PISOS = [];

const rotuloStatusFarmacia = (s) => (STATUS_FARMACIA_PISO[s] || { rotulo: s || '—' }).rotulo;

function dispensacoesDoPaciente(pacienteId) {
    return (MOCK_DATA.FARMACIA_DISPENSACOES || [])
        .filter(f => f.paciente_id === pacienteId)
        .sort((a, b) => String(b.prescrito_em || '').localeCompare(String(a.prescrito_em || '')));
}

/**
 * Cria um novo registro de medicamento a ser distribuído para um Piso/Ala/Leito (e opcionalmente já registra quem pegou na Farmácia).
 */
async function criarDispensacaoFarmaciaPiso(f) {
    if (!hasPermission('prontuario_ver') && !hasPermission('prescrever')) {
        throw new Error('Acesso negado para registrar distribuição de medicamentos.');
    }
    const med = String(f.medicamento || '').trim();
    const dose = String(f.dose || '').trim();
    const qtd = String(f.quantidade || '').trim();
    if (med.length < 2) throw new Error('Informe o nome do medicamento.');
    if (!dose) throw new Error('Informe a apresentação ou dose do medicamento.');
    if (!qtd) throw new Error('Informe a quantidade a ser distribuída para o piso.');
    if (!f.paciente_id) throw new Error('Selecione o paciente / leito de destino no piso.');

    const pac = await db_getPaciente(f.paciente_id);
    const ativa = internacaoAtivaDoPaciente(f.paciente_id);
    const andar = String((ativa && ativa.andar) || f.piso_andar || '1');
    const ala = (ativa && ativa.ala) || f.ala_setor || 'Unidade de Internação';
    const leitoId = (ativa && ativa.leito_id) || f.leito_id || '';
    const leitoRot = leitoId ? ((leitoPorId(leitoId) || { rotulo: leitoId }).rotulo) : 'Sem leito';

    const u = quem();
    const agora = agoraISO();
    const hoje = todayISO().replace(/-/g, '');
    const seq = String((MOCK_DATA.FARMACIA_DISPENSACOES || []).length + 1).padStart(4, '0');

    let status = 'AGUARDANDO_RETIRADA';
    let retirada = null;

    if (f.ja_retirado) {
        const qNome = String(f.quem_pegou_nome || '').trim();
        const qCargo = String(f.quem_pegou_cargo || '').trim();
        const qDoc = String(f.quem_pegou_documento || '').trim();
        if (qNome.length < 3) throw new Error('Informe o nome completo do profissional que pegou o medicamento.');
        if (qCargo.length < 2) throw new Error('Informe o cargo/setor de quem pegou o medicamento.');
        if (qDoc.length < 3) throw new Error('Informe a matrícula ou registro (COREN/CPF) de quem pegou.');
        status = 'DISTRIBUIDO_PISO';
        retirada = {
            quem_pegou_nome: qNome,
            quem_pegou_cargo: qCargo,
            quem_pegou_documento: qDoc,
            dispensado_por: String(f.dispensado_por || u.por_nome).trim(),
            retirado_em: agora,
            observacao: String(f.observacao || '').trim()
        };
    }

    const reg = {
        id: newId('far'),
        codigo: `FAR-${hoje}-${seq}`,
        paciente_id: f.paciente_id,
        paciente_nome: (pac && pac.nome) || (ativa && ativa.paciente_nome) || 'Paciente',
        prontuario: (pac && pac.prontuario) || (ativa && ativa.prontuario) || '',
        internacao_id: ativa ? ativa.id : '',
        piso_andar: andar,
        piso_rotulo: `${andar}º Andar (Piso ${andar})`,
        ala_setor: ala,
        leito_id: leitoId,
        leito_rotulo: leitoRot,
        medicamento: med,
        dose,
        via: String(f.via || 'VO').trim(),
        frequencia: String(f.frequencia || 'Conforme prescrição').trim(),
        lote: String(f.lote || '').trim(),
        quantidade: qtd,
        prescrito_por: u.por_nome,
        prescrito_em: agora,
        status,
        retirada,
        administracao: null
    };

    await setDocH(COLH.FARMACIA, reg);

    if (retirada) {
        await registrarClinico({
            internacao: ativa,
            paciente_id: reg.paciente_id,
            tipo: 'FARMACIA_PISO',
            texto: `Farmácia — Distribuição para o ${reg.piso_rotulo} (${reg.ala_setor} · Leito ${reg.leito_rotulo}): ${reg.medicamento} ${reg.dose} (Qtd: ${reg.quantidade}${reg.lote ? ' · Lote: ' + reg.lote : ''}) — QUEM PEGOU: ${retirada.quem_pegou_nome} (${retirada.quem_pegou_cargo} · ${retirada.quem_pegou_documento}) · Dispensado por: ${retirada.dispensado_por}.`
        });
    }

    if (typeof auditar === 'function') {
        await auditar({ entidade: 'farmacia_piso', entidade_id: reg.id, acao: 'CRIAR', depois: { codigo: reg.codigo, medicamento: reg.medicamento, piso: reg.piso_rotulo, status: reg.status } });
    }
    return reg;
}

/**
 * Registra QUEM PEGOU o medicamento na Farmácia para levar ao Piso / Posto de Enfermagem / Leito.
 * Grava também na linha do tempo do Prontuário Digital do paciente.
 */
async function registrarRetiradaFarmaciaPiso(id, { quem_pegou_nome, quem_pegou_cargo, quem_pegou_documento, dispensado_por = '', lote = '', observacao = '' }) {
    if (!hasPermission('prontuario_ver') && !hasPermission('prontuario_evoluir')) {
        throw new Error('Acesso negado para registrar retirada de medicamento na Farmácia.');
    }
    const atual = await getDocH(COLH.FARMACIA, id);
    if (!atual) throw new Error('Registro de dispensação não encontrado.');
    const qNome = String(quem_pegou_nome || '').trim();
    const qCargo = String(quem_pegou_cargo || '').trim();
    const qDoc = String(quem_pegou_documento || '').trim();
    if (qNome.length < 3) throw new Error('Informe o nome completo de quem pegou o medicamento.');
    if (qCargo.length < 2) throw new Error('Informe a função / setor de quem pegou o medicamento.');
    if (qDoc.length < 3) throw new Error('Informe a matrícula ou conselho (COREN/CPF) de quem pegou.');

    const u = quem();
    const agora = agoraISO();
    const retirada = {
        quem_pegou_nome: qNome,
        quem_pegou_cargo: qCargo,
        quem_pegou_documento: qDoc,
        dispensado_por: String(dispensado_por || u.por_nome).trim(),
        retirado_em: agora,
        observacao: String(observacao || '').trim()
    };

    const novoLote = String(lote || atual.lote || '').trim();
    const novo = {
        ...atual,
        lote: novoLote,
        status: 'DISTRIBUIDO_PISO',
        retirada
    };
    await setDocH(COLH.FARMACIA, novo);

    const ativa = internacaoAtivaDoPaciente(atual.paciente_id);
    await registrarClinico({
        internacao: ativa,
        paciente_id: atual.paciente_id,
        tipo: 'FARMACIA_PISO',
        texto: `Farmácia — Medicamento Distribuído para o ${atual.piso_rotulo} (${atual.ala_setor} · Leito ${atual.leito_rotulo}): ${atual.medicamento} ${atual.dose} (Qtd: ${atual.quantidade}${novoLote ? ' · Lote: ' + novoLote : ''}) — QUEM PEGOU: ${retirada.quem_pegou_nome} (${retirada.quem_pegou_cargo} · ${retirada.quem_pegou_documento}) · Entregue pela Farmácia por: ${retirada.dispensado_por}.${retirada.observacao ? ' Obs.: ' + retirada.observacao : ''}`
    });

    if (typeof auditar === 'function') {
        await auditar({ entidade: 'farmacia_piso', entidade_id: id, acao: 'RETIRADA_PISO', depois: retirada });
    }
    return novo;
}

/** Confirma a administração do medicamento retirado diretamente no paciente no leito. */
async function confirmarAdministracaoFarmaciaLeito(id, { administrado_por = '', observacao = '' } = {}) {
    if (!hasPermission('prontuario_evoluir')) {
        throw new Error('Acesso negado: apenas Enfermagem ou Médico confirma a administração no leito.');
    }
    const atual = await getDocH(COLH.FARMACIA, id);
    if (!atual) throw new Error('Registro de medicamento não encontrado.');
    if (atual.status === 'AGUARDANDO_RETIRADA') {
        throw new Error('Registre primeiro quem pegou o medicamento na Farmácia antes de checar a administração no leito.');
    }
    const u = quem();
    const agora = agoraISO();
    const administracao = {
        administrado_por: String(administrado_por || u.por_nome).trim(),
        administrado_em: agora,
        observacao: String(observacao || '').trim()
    };
    const novo = { ...atual, status: 'ADMINISTRADO', administracao };
    await setDocH(COLH.FARMACIA, novo);

    const ativa = internacaoAtivaDoPaciente(atual.paciente_id);
    await registrarClinico({
        internacao: ativa,
        paciente_id: atual.paciente_id,
        tipo: 'FARMACIA_PISO',
        texto: `Checagem Beira-Leito (${atual.piso_rotulo} · Leito ${atual.leito_rotulo}): Medicamento ${atual.medicamento} (${atual.dose}, via ${atual.via}) ADMINISTRADO por ${administracao.administrado_por} (Retirado na Farmácia por ${atual.retirada ? atual.retirada.quem_pegou_nome : '—'}).${administracao.observacao ? ' Obs.: ' + administracao.observacao : ''}`
    });
    return novo;
}

// ============================================================ PADRÕES DE INTEROPERABILIDADE (SIGTAP, TUSS/TISS, DICOM/PACS E HL7 FHIR R4 / RNDS)

const TABELAS_PROCEDIMENTOS_PADRAO = [
    { tipo_id: 'exm_tc_cranio', nome: 'TOMOGRAFIA COMPUTADORIZADA DE CRÂNIO', sigtap: '02.06.01.007-9', tuss: '41001010', dicom_modality: 'CT', loinc: '24725-4', categoria: 'IMAGEM' },
    { tipo_id: 'exm_tc_torax', nome: 'TOMOGRAFIA COMPUTADORIZADA DE TÓRAX', sigtap: '02.06.02.003-1', tuss: '41001079', dicom_modality: 'CT', loinc: '24627-2', categoria: 'IMAGEM' },
    { tipo_id: 'exm_rx_torax', nome: 'RADIOGRAFIA DE TÓRAX (PA E PERFIL)', sigtap: '02.04.03.015-3', tuss: '40805018', dicom_modality: 'CR', loinc: '30746-2', categoria: 'IMAGEM' },
    { tipo_id: 'exm_rm_cranio', nome: 'RESSONÂNCIA MAGNÉTICA DE CRÂNIO', sigtap: '02.07.01.006-4', tuss: '41101014', dicom_modality: 'MR', loinc: '24590-2', categoria: 'IMAGEM' },
    { tipo_id: 'exm_usg_abdome', nome: 'ULTRASSONOGRAFIA DE ABDOME TOTAL', sigtap: '02.05.02.004-6', tuss: '40901122', dicom_modality: 'US', loinc: '24558-9', categoria: 'IMAGEM' },
    { tipo_id: 'exm_ecodoppler', nome: 'ECODOPPLERCARDIOGRAMA TRANSTORÁCICO', sigtap: '02.05.01.003-2', tuss: '40901106', dicom_modality: 'US', loinc: '34552-0', categoria: 'IMAGEM' },
    { tipo_id: 'exm_lab_hemograma', nome: 'HEMOGRAMA COMPLETO + PLAQUETAS (LABORATORIAL)', sigtap: '02.02.02.038-0', tuss: '40304361', dicom_modality: 'LAB', loinc: '58410-2', categoria: 'LABORATORIAL' },
    { tipo_id: 'exm_lab_bioquimica', nome: 'PAINEL BIOQUÍMICO (CREATININA, UREIA, ELETRÓLITOS, TROPONINA)', sigtap: '02.02.01.067-8', tuss: '40302571', dicom_modality: 'LAB', loinc: '6598-7', categoria: 'LABORATORIAL' }
];

function obterProcedimentoPadronizado(tipoId = '', nome = '') {
    const porId = TABELAS_PROCEDIMENTOS_PADRAO.find(p => p.tipo_id === tipoId);
    if (porId) return porId;
    const chave = searchKey(nome);
    if (chave.includes('tomografia') && chave.includes('torax')) return TABELAS_PROCEDIMENTOS_PADRAO[1];
    if (chave.includes('tomografia')) return TABELAS_PROCEDIMENTOS_PADRAO[0];
    if (chave.includes('radiografia') || chave.includes('raio')) return TABELAS_PROCEDIMENTOS_PADRAO[2];
    if (chave.includes('ressonancia')) return TABELAS_PROCEDIMENTOS_PADRAO[3];
    if (chave.includes('ecodoppler')) return TABELAS_PROCEDIMENTOS_PADRAO[5];
    if (chave.includes('ultrassom') || chave.includes('ultrassonografia')) return TABELAS_PROCEDIMENTOS_PADRAO[4];
    if (chave.includes('hemograma') || chave.includes('laborator')) return TABELAS_PROCEDIMENTOS_PADRAO[6];
    return TABELAS_PROCEDIMENTOS_PADRAO[0];
}

/**
 * Gera metadados no padrão DICOM (PS3.3 / PACS / Modality Worklist) para integração com servidores de imagem PACS.
 */
function gerarMetadadosDicomExame(sol, pacsStatus = 'MWL_SCHEDULED') {
    const padrao = obterProcedimentoPadronizado(sol.tipo_exame_id, sol.tipo_nome);
    const modality = (padrao && padrao.dicom_modality) || (sol.setor_destino === 'ULTRASSONOGRAFIA' ? 'US' : 'CT');
    const numHash = String(sol.protocolo || sol.id || '1001').replace(/\D/g, '').slice(0, 10) || '20261119';
    return {
        standard: 'DICOM PS3.3 / IHE SWF',
        study_instance_uid: `1.2.826.0.1.3680043.8.498.8102.${numHash}.1`,
        series_instance_uid: `1.2.826.0.1.3680043.8.498.8102.${numHash}.1.1`,
        accession_number: sol.protocolo || sol.id,
        modality,
        ae_title: modality === 'CT' ? 'HGP_CT64_SALA01' : (modality === 'CR' ? 'HGP_DR_SALA02' : (modality === 'MR' ? 'HGP_MR15_SALA03' : 'HGP_US_SALA04')),
        pacs_status: sol.status === 'REALIZADO' ? 'ARCHIVED_PACS' : pacsStatus,
        wado_rs_endpoint: `/dicom-web/studies/1.2.826.0.1.3680043.8.498.8102.${numHash}.1`
    };
}

/**
 * Gera um Bundle JSON estruturado no padrão HL7 FHIR R4 (Perfil BR-Core / RNDS — Rede Nacional de Dados em Saúde)
 * contendo Patient (CPF+CNS), Encounter, AllergyIntolerance, Condition (CID-10 + CID-11), Observation (LOINC),
 * MedicationRequest, MedicationDispense, ServiceRequest (SIGTAP + TUSS), ImagingStudy (DICOM), DiagnosticReport e Provenance (ICP-Brasil).
 */
function gerarBundleHL7FhirRNDS(pacienteId) {
    const pac = (MOCK_DATA.PACIENTES_SEED_MAP && MOCK_DATA.PACIENTES_SEED_MAP[pacienteId])
        || ((typeof CAD_DATA !== 'undefined' && Array.isArray(CAD_DATA.paciente)) ? CAD_DATA.paciente.find(p => p.id === pacienteId) : null)
        || (state.prontuario && state.prontuario.pacienteId === pacienteId ? state.prontuario.paciente : null);
    if (!pac) throw new Error('Paciente não encontrado para exportação HL7 FHIR.');

    const ativa = internacaoAtivaDoPaciente(pacienteId);
    const regs = (MOCK_DATA.REGISTROS_CLINICOS_CACHE && MOCK_DATA.REGISTROS_CLINICOS_CACHE[pacienteId])
        || (MOCK_DATA.REGISTROS_CLINICOS && MOCK_DATA.REGISTROS_CLINICOS.paciente_id === pacienteId ? MOCK_DATA.REGISTROS_CLINICOS.items : [])
        || [];
    const exames = (MOCK_DATA.SOLICITACOES_EXAME || []).filter(s => s.paciente_id === pacienteId);
    const farmacia = (MOCK_DATA.FARMACIA_DISPENSACOES || []).filter(f => f.paciente_id === pacienteId);
    const cfg = MOCK_DATA.CONFIG_HOSPITAL || { nome: 'Hospital Geral de Palmas (HGP)', cnes: '2497654' };
    const agora = agoraISO();
    const guarda = calcularGuardaLegal20Anos(agora);

    const entry = [];

    // 1. Recurso Patient (BRIndividuo - RNDS com CPF e CNS)
    entry.push({
        fullUrl: `urn:uuid:patient-${pac.id}`,
        resource: {
            resourceType: 'Patient',
            id: pac.id,
            meta: { profile: ['http://www.saude.gov.br/fhir/r4/StructureDefinition/BRIndividuo-1.0'] },
            identifier: [
                { use: 'official', system: 'http://rnds.saude.gov.br/fhir/r4/NamingSystem/cpf', value: onlyDigits(pac.cpf || '') },
                { use: 'official', system: 'http://rnds.saude.gov.br/fhir/r4/NamingSystem/cns', value: onlyDigits(pac.cns || '') },
                { use: 'secondary', system: 'urn:hgp:to:gov:br:prontuario', value: String(pac.prontuario || '') }
            ],
            active: pac.ativo !== false,
            name: [{ use: 'official', text: pac.nome }],
            gender: pac.sexo === 'F' ? 'female' : (pac.sexo === 'M' ? 'male' : 'other'),
            birthDate: pac.data_nascimento || ''
        }
    });

    // 2. Recurso Encounter (Internação / Leito Atual + CNES)
    if (ativa) {
        const lObj = leitoPorId(ativa.leito_id) || { rotulo: ativa.leito_id };
        entry.push({
            fullUrl: `urn:uuid:encounter-${ativa.id}`,
            resource: {
                resourceType: 'Encounter',
                id: ativa.id,
                status: ativa.status === 'ATIVA' ? 'in-progress' : 'finished',
                class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'IMP', display: 'Internação Hospitalar' },
                subject: { reference: `Patient/${pac.id}`, display: pac.nome },
                period: { start: ativa.data_hora_internacao },
                location: [{ location: { display: `${ativa.andar}º Andar · ${ativa.ala} · Quarto ${ativa.quarto} · Leito ${lObj.rotulo}` } }],
                serviceProvider: { identifier: { system: 'http://cnes.datasus.gov.br', value: cfg.cnes || '2497654' }, display: cfg.nome || 'Hospital Geral de Palmas' }
            }
        });
    }

    // 3. Recurso AllergyIntolerance (Alergias em Destaque)
    entry.push({
        fullUrl: `urn:uuid:allergy-${pac.id}`,
        resource: {
            resourceType: 'AllergyIntolerance',
            id: `alg-${pac.id}`,
            clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: 'active' }] },
            criticality: pac.alergias && !pac.alergias.toLowerCase().startsWith('nega') ? 'high' : 'low',
            code: { text: pac.alergias || 'Nega alergias medicamentosas conhecidas' },
            patient: { reference: `Patient/${pac.id}` }
        }
    });

    // 4. Recursos Condition (Diagnósticos com dupla codificação CID-10 e CID-11)
    regs.filter(r => r.tipo === 'DIAGNOSTICO').forEach(r => {
        const corr = buscarCorrespondenciaCid(r.cid);
        const cid11 = r.cid_11 || (corr && corr.cid11) || '';
        const codings = [{ system: 'http://hl7.org/fhir/sid/icd-10', code: r.cid, display: r.texto }];
        if (cid11) codings.push({ system: 'http://id.who.int/icd/release/11/mms', code: cid11, display: (corr && corr.descricao) || r.texto });
        entry.push({
            fullUrl: `urn:uuid:condition-${r.id}`,
            resource: {
                resourceType: 'Condition',
                id: r.id,
                code: { coding: codings, text: r.texto },
                subject: { reference: `Patient/${pac.id}` },
                recordedDate: r.em,
                recorder: { display: `${r.autor_nome} (${r.registro_conselho || ''})` }
            }
        });
    });

    // 5. Recursos Observation (Sinais Vitais e Escalas de Risco Morse/Braden com LOINC)
    regs.filter(r => r.tipo === 'SINAIS_VITAIS').forEach(r => {
        entry.push({
            fullUrl: `urn:uuid:obs-${r.id}`,
            resource: {
                resourceType: 'Observation',
                id: r.id,
                status: 'final',
                category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs', display: 'Vital Signs' }] }],
                code: { coding: [{ system: 'http://loinc.org', code: '85353-1', display: 'Vital signs panel' }], text: r.texto },
                subject: { reference: `Patient/${pac.id}` },
                effectiveDateTime: r.em,
                performer: [{ display: r.autor_nome }]
            }
        });
    });

    // 6. Recursos MedicationDispense (Farmácia por Pisos e Quem Pegou)
    farmacia.forEach(f => {
        entry.push({
            fullUrl: `urn:uuid:meddisp-${f.id}`,
            resource: {
                resourceType: 'MedicationDispense',
                id: f.id,
                status: f.status === 'ADMINISTRADO' ? 'completed' : (f.status === 'DISTRIBUIDO_PISO' ? 'in-progress' : 'preparation'),
                medicationCodeableConcept: { text: `${f.medicamento} — ${f.dose} (${f.via})` },
                subject: { reference: `Patient/${pac.id}`, display: f.paciente_nome },
                destination: { display: `${f.piso_rotulo} · ${f.ala_setor} · Leito ${f.leito_rotulo}` },
                receiver: f.retirada ? [{ display: `${f.retirada.quem_pegou_nome} (${f.retirada.quem_pegou_cargo} · ${f.retirada.quem_pegou_documento})` }] : []
            }
        });
    });

    // 7. Recursos ServiceRequest, ImagingStudy (DICOM) e DiagnosticReport (SIGTAP + TUSS)
    exames.forEach(s => {
        const proc = s.procedimento_principal || {};
        const padrao = obterProcedimentoPadronizado(s.tipo_exame_id, s.tipo_nome);
        const sigtap = proc.codigo_sigtap || proc.codigo || (padrao && padrao.sigtap) || '';
        const tuss = proc.codigo_tuss || (padrao && padrao.tuss) || '';
        const dicom = s.dicom || gerarMetadadosDicomExame(s);
        entry.push({
            fullUrl: `urn:uuid:servicerequest-${s.id}`,
            resource: {
                resourceType: 'ServiceRequest',
                id: s.id,
                status: s.status === 'REALIZADO' ? 'completed' : 'active',
                priority: s.prioridade === 'URGENTE' ? 'urgent' : 'routine',
                code: {
                    coding: [
                        { system: 'http://sigtap.datasus.gov.br', code: sigtap, display: s.tipo_nome },
                        { system: 'http://www.ans.gov.br/tuss', code: tuss, display: s.tipo_nome }
                    ],
                    text: s.tipo_nome
                },
                subject: { reference: `Patient/${pac.id}` },
                authoredOn: s.criado_em
            }
        });
        entry.push({
            fullUrl: `urn:uuid:imagingstudy-${s.id}`,
            resource: {
                resourceType: 'ImagingStudy',
                id: `dicom-${s.id}`,
                identifier: [{ system: 'urn:dicom:uid', value: `urn:oid:${dicom.study_instance_uid}` }],
                status: s.status === 'REALIZADO' ? 'available' : 'registered',
                subject: { reference: `Patient/${pac.id}` },
                modality: [{ system: 'http://dicom.nema.org/resources/ontology/DCM', code: dicom.modality }]
            }
        });
    });

    // 8. Recurso Provenance (Assinatura Digital ICP-Brasil SBIS/CFM NGS2 e Guarda Legal 20 anos)
    entry.push({
        fullUrl: `urn:uuid:provenance-${pac.id}`,
        resource: {
            resourceType: 'Provenance',
            id: `prov-${pac.id}`,
            recorded: agora,
            policy: [
                'urn:brasil:lei:13709:2018:lgpd',
                'urn:brasil:lei:13787:2018:pep-guarda-20-anos',
                'urn:cfm:resolucao:1821:2007',
                'urn:sbis:cfm:ngs2:icp-brasil'
            ],
            signature: [{
                type: [{ system: 'urn:iso-astm:E1762-95:2013', code: '1.2.840.10065.1.12.1.1', display: 'Author Signature ICP-Brasil' }],
                when: agora,
                who: { display: (state.currentUser && state.currentUser.name) || 'HGP ICP-Brasil Signer' },
                sigFormat: 'application/pkcs7-signature'
            }],
            extension: [{ url: 'http://rnds.saude.gov.br/fhir/r4/StructureDefinition/guarda-legal-ate', valueDate: guarda.guarda_obrigatoria_ate }]
        }
    });

    return {
        resourceType: 'Bundle',
        id: `rnds-bundle-${pac.id}`,
        meta: {
            lastUpdated: agora,
            profile: ['http://www.saude.gov.br/fhir/r4/StructureDefinition/BRSumarioAlta-1.0']
        },
        identifier: { system: 'http://rnds.saude.gov.br/fhir/r4/NamingSystem/BRRNDS', value: `HGP-RNDS-${pac.prontuario || pac.id}` },
        type: 'document',
        timestamp: agora,
        total: entry.length,
        entry
    };
}
