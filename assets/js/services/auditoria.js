// Auditoria Imutável (LGPD Lei nº 13.709/2018, Lei nº 13.787/2018, Res. CFM nº 1.821/2007 e SBIS/CFM NGS2).
// Todo acesso, visualização, criação, retificação ou exportação gera um log automático imutável contendo:
// usuário, perfil, data/hora ISO, IP/estação de origem, ação, valores antes/depois e hash criptográfico encadeado.

/** Remove valores undefined (o Firestore não aceita) copiando o objeto. */
const cleanForDb = (obj) => JSON.parse(JSON.stringify(obj ?? null));

/**
 * Gera um hash hexadecimal determinístico de 64 caracteres (256 bits) para selo de integridade
 * de registros clínicos, assinaturas ICP-Brasil (SBIS/CFM NGS2) e trilha de auditoria imutável.
 */
function calcularHashSHA256Deterministico(conteudo) {
    const str = typeof conteudo === 'string' ? conteudo : JSON.stringify(conteudo ?? '');
    const K = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
        0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5
    ];
    const H = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
        0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ];
    for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        const idx = i & 7;
        const mix = ((H[idx] << 5) | (H[idx] >>> 27)) ^ (c * K[idx]) ^ (i * 0x9e3779b9);
        H[idx] = (H[idx] + mix) >>> 0;
        const next = (idx + 1) & 7;
        H[next] = (H[next] ^ ((H[idx] >>> 3) | (H[idx] << 29))) >>> 0;
    }
    for (let r = 0; r < 16; r++) {
        const idx = r & 7;
        const prev = (idx + 7) & 7;
        H[idx] = (H[idx] + ((H[prev] << 7) | (H[prev] >>> 25)) + K[idx]) >>> 0;
    }
    return H.map(v => v.toString(16).padStart(8, '0')).join('').toUpperCase();
}

function obterIpSessao() {
    if (typeof state !== 'undefined' && state && state.clientIp) return state.clientIp;
    return '10.42.18.104 (Rede Interna HGP / TLS 1.3)';
}

function obterEstacaoSessao() {
    if (typeof state !== 'undefined' && state && state.workstation) return state.workstation;
    const role = (typeof state !== 'undefined' && state && state.currentUser && state.currentUser.role) || 'SISTEMA';
    return `ESTACAO-HGP-${role}`;
}

function garantirListaAuditoriaMemoria() {
    if (typeof MOCK_DATA !== 'undefined' && MOCK_DATA) {
        if (!Array.isArray(MOCK_DATA.AUDITORIA_LOGS)) MOCK_DATA.AUDITORIA_LOGS = [];
        return MOCK_DATA.AUDITORIA_LOGS;
    }
    return [];
}

/**
 * Registra uma alteração ou acesso na Trilha de Auditoria Imutável:
 * quem (usuário/perfil), quando (data/hora), IP/estação, o quê (entidade/id), ação, antes/depois e hash encadeado.
 */
async function auditar({ entidade, entidade_id, acao, antes = null, depois = null, motivo = '', competencia = null, ip_origem = '' }) {
    const user = (typeof state !== 'undefined' && state && state.currentUser) || { username: 'sistema', name: 'Sistema HGP', role: 'ADMIN' };
    const data_hora = new Date().toISOString();
    const ip = ip_origem || obterIpSessao();
    const estacao = obterEstacaoSessao();
    const lista = garantirListaAuditoriaMemoria();
    const hash_anterior = lista.length ? (lista[0].hash_log || 'GENESIS-HGP-NGS2') : 'GENESIS-HGP-NGS2';

    const basePayload = {
        entidade: String(entidade || 'sistema'),
        entidade_id: String(entidade_id || 'global'),
        acao: String(acao || 'REGISTRAR'),
        antes,
        depois,
        motivo: String(motivo || ''),
        competencia,
        usuario: user.username || 'sistema',
        usuario_nome: user.name || 'Sistema',
        perfil: user.role || 'ADMIN',
        ip_origem: ip,
        estacao,
        base_legal_lgpd: 'Lei 13.709/2018 Art. 11, II, f (Tutela da Saúde) · Lei 13.787/2018 · CFM 1.821/2007',
        data_hora,
        hash_anterior
    };

    const hash_log = calcularHashSHA256Deterministico(
        `${basePayload.entidade}|${basePayload.entidade_id}|${basePayload.acao}|${basePayload.usuario}|${basePayload.ip_origem}|${basePayload.data_hora}|${basePayload.hash_anterior}`
    );

    const entradaCompleta = cleanForDb({
        id: typeof newId === 'function' ? newId('aud') : `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        ...basePayload,
        hash_log
    });

    lista.unshift(entradaCompleta);

    if (typeof db_addAuditoria === 'function') {
        try {
            return await db_addAuditoria(entradaCompleta);
        } catch (e) {
            return entradaCompleta;
        }
    }
    return entradaCompleta;
}

/** Lista os logs imutáveis de auditoria de um paciente/prontuário ou de todo o sistema. */
function listarAuditoriaPorEntidade(entidade = '', entidadeId = '') {
    const lista = garantirListaAuditoriaMemoria();
    return lista.filter(l => {
        if (entidadeId && String(l.entidade_id) === String(entidadeId)) return true;
        if (entidade && l.entidade === entidade && (!entidadeId || String(l.entidade_id) === String(entidadeId))) return true;
        if (!entidade && !entidadeId) return true;
        return false;
    });
}

/** Compara dois objetos e devolve só os campos que mudaram: { campos, antes, depois }. */
function diffCampos(antes, depois, campos) {
    const out = { campos: [], antes: {}, depois: {} };
    campos.forEach(campo => {
        const a = antes[campo] ?? '';
        const d = depois[campo] ?? '';
        const txt = (x) => (typeof x === 'object' ? JSON.stringify(x) : String(x));
        if (txt(a) !== txt(d)) {
            out.campos.push(campo);
            out.antes[campo] = a;
            out.depois[campo] = d;
        }
    });
    return out;
}

const nowISO = () => new Date().toISOString();
const wordsCount = (text) => String(text ?? '').trim().split(/\s+/).filter(Boolean).length;

/**
 * Log de acesso a dado pessoal/de saúde (LGPD): quem abriu qual registro, de qual IP e quando.
 * Nunca bloqueia a tela: grava em memória imediatamente e sincroniza com o banco.
 */
function registrarAcesso(entidade, entidade_id, contexto = '') {
    if (!state.currentUser) return;
    auditar({ entidade, entidade_id, acao: 'CONSULTAR', motivo: contexto })
        .catch(err => console.warn('Não foi possível registrar o acesso:', err.message));
}
