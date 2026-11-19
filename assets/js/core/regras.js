// Regras de negócio hospitalares puras (sem acesso a tela ou banco), reaproveitadas por várias telas e testadas em tests/.

// ---------- Classificação de risco (protocolo Manchester) ----------
// Tempos-alvo de espera até o primeiro atendimento médico, em minutos. São os valores usuais do protocolo
// e podem ser ajustados pelo hospital aqui, num único lugar.
const NIVEIS_RISCO = [
    { id: 'VERMELHO', rotulo: 'Vermelho · Emergência', minutos: 0, cor: '#dc2626' },
    { id: 'LARANJA', rotulo: 'Laranja · Muito urgente', minutos: 10, cor: '#ea580c' },
    { id: 'AMARELO', rotulo: 'Amarelo · Urgente', minutos: 60, cor: '#ca8a04' },
    { id: 'VERDE', rotulo: 'Verde · Pouco urgente', minutos: 120, cor: '#16a34a' },
    { id: 'AZUL', rotulo: 'Azul · Não urgente', minutos: 240, cor: '#2563eb' }
];

const nivelRisco = (id) => NIVEIS_RISCO.find(n => n.id === id) || null;

/**
 * Situação do tempo de espera de uma ocorrência classificada.
 * Devolve null se não houver classificação; senão { nivel, restanteMin, estourado, aviso } (aviso = faltam ≤ 25% do tempo).
 */
function situacaoEspera(nivelId, inicioISO, agora = new Date()) {
    const nivel = nivelRisco(nivelId);
    if (!nivel || !inicioISO) return null;
    const decorridoMin = Math.floor((agora.getTime() - new Date(inicioISO).getTime()) / 60000);
    const restanteMin = nivel.minutos - decorridoMin;
    const estourado = restanteMin < 0 || (nivel.minutos === 0 && decorridoMin > 0);
    return { nivel, decorridoMin, restanteMin, estourado, aviso: !estourado && restanteMin <= nivel.minutos * 0.25 };
}

/** Só enfermeiro ou administrador classifica o risco (Resolução COFEN 661/2021). */
const PERFIS_CLASSIFICADORES = ['ADMIN', 'FUNC_EMERGENCIA'];

// ---------- Validade de lotes (estoque / OPME) ----------
const DIAS_ALERTA_VALIDADE = 30; // padrão; o valor em uso vem de diasAlertaValidade()

/** Dias de alerta configurados em Sistema › Dashboard › Parâmetros (padrão 30). */
function diasAlertaValidade() {
    const lista = (typeof CAD_DATA !== 'undefined' && CAD_DATA.parametro) || [];
    const p = lista.find(x => x.chave === 'dias_alerta_validade' && x.ativo !== false);
    return Number(p && p.valor) > 0 ? Number(p.valor) : DIAS_ALERTA_VALIDADE;
}

/** Dias até vencer (negativo = vencido). null quando o lote não tem validade (N/A). */
function diasParaVencer(validade, hoje = new Date()) {
    if (!validade || validade === 'N/A') return null;
    const [a, m, d] = String(validade).slice(0, 10).split('-').map(Number);
    if (!a || !m || !d) return null;
    const fim = Date.UTC(a, m - 1, d);
    const ini = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    return Math.round((fim - ini) / 86400000);
}

/** 'SEM_VALIDADE' | 'VENCIDO' | 'A_VENCER' | 'OK'. O lote vale até o fim do dia da validade. */
function statusValidade(validade, hoje = new Date()) {
    const dias = diasParaVencer(validade, hoje);
    if (dias === null) return 'SEM_VALIDADE';
    if (dias < 0) return 'VENCIDO';
    return dias <= diasAlertaValidade() ? 'A_VENCER' : 'OK';
}

const loteVencido = (lote, hoje = new Date()) => statusValidade(lote && lote.validade, hoje) === 'VENCIDO';

/** FEFO: entre os lotes com saldo e não vencidos, o que vence primeiro (sem validade vai por último). */
function escolherLoteFEFO(lotes, hoje = new Date()) {
    const validos = (lotes || []).filter(l => l.quantidade > 0 && !loteVencido(l, hoje));
    return validos.sort((a, b) => {
        const da = diasParaVencer(a.validade, hoje);
        const db = diasParaVencer(b.validade, hoje);
        if (da === null && db === null) return 0;
        if (da === null) return 1;
        if (db === null) return -1;
        return da - db;
    })[0] || null;
}

/** Ponto de pedido: quando o saldo chega ao mínimo (ou abaixo) é hora de comprar. */
const abaixoDoMinimo = (produto) => Number(produto.qtd) <= Number(produto.min || 0);

/** Texto curto de apoio para mostrar o status de validade na tela. */
function rotuloValidade(validade, hoje = new Date()) {
    const dias = diasParaVencer(validade, hoje);
    switch (statusValidade(validade, hoje)) {
        case 'VENCIDO': return `Vencido há ${-dias} dia(s)`;
        case 'A_VENCER': return dias === 0 ? 'Vence hoje' : `Vence em ${dias} dia(s)`;
        default: return '';
    }
}
