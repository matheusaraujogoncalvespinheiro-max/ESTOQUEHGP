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

/** Valor numérico de um parâmetro definido pelo hospital (Cadastro › Parâmetros do Sistema). null = o hospital ainda não definiu. */
function parametroSistema(chave) {
    const lista = (typeof CAD_DATA !== 'undefined' && CAD_DATA.parametro) || [];
    const p = lista.find(x => x.chave === chave && x.ativo !== false);
    if (!p || p.valor === '' || p.valor === null || p.valor === undefined) return null;
    const n = Number(p.valor);
    return Number.isFinite(n) && n > 0 ? n : null;
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

/** Ordem FEFO: vence primeiro sai primeiro; sem validade vai por último. */
function compararFEFO(a, b, hoje = new Date()) {
    const da = diasParaVencer(a.validade, hoje);
    const db = diasParaVencer(b.validade, hoje);
    if (da === null && db === null) return 0;
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
}

/** Lote que pode sair: ativo, com saldo e não vencido. */
const loteDisponivel = (l, hoje = new Date()) => Boolean(l) && l.ativo !== false && Number(l.quantidade) > 0 && !loteVencido(l, hoje);

/** FEFO: entre os lotes com saldo, ativos e não vencidos, o que vence primeiro (sem validade vai por último). */
function escolherLoteFEFO(lotes, hoje = new Date()) {
    return (lotes || []).filter(l => loteDisponivel(l, hoje)).sort((a, b) => compararFEFO(a, b, hoje))[0] || null;
}

// ---------------------------------------------------------------- controle de estoque por lote (por produto)
//
// Cada produto escolhe no cadastro se controla o estoque por lote (cadastro.config.usa_lote = "Controlar estoque por lote").
// O saldo SEMPRE fica em product_batches (a mesma coleção de sempre, sem estrutura paralela):
// - produto COM controle: um documento por lote (número, fabricação, validade, saldo...). Lote zerado continua registrado.
// - produto SEM controle: a entrada que não informa lote vai para o saldo geral do produto (código interno LOTE_SEM_CONTROLE,
//   exibido como "Sem lote"). Os lotes que o produto já tinha continuam valendo como antes.
// Em qualquer caso o saldo do produto é a soma dos lotes: não existe saldo "solto" que possa divergir.

const LOTE_SEM_CONTROLE = 'SEM-LOTE';
const produtoControlaLote = (p) => Boolean(p && p.cadastro && p.cadastro.config && p.cadastro.config.usa_lote);
const loteEhSaldoGeral = (l) => Boolean(l) && String(l.lote) === LOTE_SEM_CONTROLE;
const rotuloLote = (codigo) => (String(codigo ?? '') === LOTE_SEM_CONTROLE ? 'Sem lote' : String(codigo ?? ''));
const dataBR = (iso) => { const [a, m, d] = String(iso || '').slice(0, 10).split('-'); return a && m && d ? `${d}/${m}/${a}` : String(iso || ''); };
const semValidade = (v) => !v || v === 'N/A';

/**
 * Confere os dados de lote de uma ENTRADA (compra, entrada manual, devolução, transferência recebida, estorno).
 * Devolve { ok: true, codigo, validade, existente } ou { ok: false, message }.
 * - produto com controle por lote: exige número do lote e validade; não aceita o mesmo número com outra validade
 *   (o mesmo lote nunca é duplicado) nem entrada em lote inativo.
 * - produto sem controle: lote e validade são opcionais; sem lote, a quantidade vai para o saldo geral (Sem lote).
 * opcoes.retorno = true (devolução/estorno/transferência): o item volta ao lote de onde saiu, mesmo inativo.
 */
function conferirEntradaLote(produto, dados, opcoes = {}) {
    const controla = produtoControlaLote(produto);
    let codigo = String((dados && dados.lote) ?? '').trim();
    if (codigo === 'N/A') codigo = '';
    let validade = dados && !semValidade(dados.validade) ? String(dados.validade).slice(0, 10) : '';
    if (controla) {
        if (!codigo || codigo === LOTE_SEM_CONTROLE) return { ok: false, message: 'Este produto é controlado por lote: informe o número do lote.' };
        if (!validade && !opcoes.retorno) return { ok: false, message: `Este produto é controlado por lote: informe a validade do lote ${codigo}.` };
    } else if (!codigo) {
        codigo = LOTE_SEM_CONTROLE;
        validade = '';
    }
    const existente = ((produto && produto.lotes) || []).find(l => String(l.lote) === codigo) || null;
    if (existente) {
        const vEx = semValidade(existente.validade) ? '' : String(existente.validade).slice(0, 10);
        if (!opcoes.retorno && validade && vEx && vEx !== validade) {
            return { ok: false, message: `O lote ${codigo} já está cadastrado com validade ${dataBR(vEx)}. Confira o número do lote ou a validade (o mesmo lote não pode ter duas validades).` };
        }
        if (!opcoes.retorno && existente.ativo === false) return { ok: false, message: `O lote ${codigo} está inativo. Reative-o na aba Lotes do produto antes de dar entrada.` };
        if (!validade) validade = vEx;
    }
    return { ok: true, codigo, validade: validade || 'N/A', existente };
}

/**
 * Planeja uma saída pelo FEFO, repartindo entre lotes quando um só não basta. Lotes vencidos, inativos ou zerados ficam de fora.
 * Devolve { ok: true, partes: [{ lote, quantidade }] } ou { ok: false, message, disponivel }.
 */
function planejarSaidaFEFO(produto, quantidade, hoje = new Date()) {
    const qtd = Number(quantidade);
    if (!(qtd > 0)) return { ok: false, message: 'Quantidade de saída inválida.', disponivel: 0 };
    const lotes = ((produto && produto.lotes) || []).filter(l => loteDisponivel(l, hoje)).sort((a, b) => compararFEFO(a, b, hoje));
    const disponivel = lotes.reduce((s, l) => s + Number(l.quantidade), 0);
    if (disponivel < qtd) {
        const vencidos = ((produto && produto.lotes) || []).filter(l => Number(l.quantidade) > 0 && loteVencido(l, hoje)).reduce((s, l) => s + Number(l.quantidade), 0);
        return { ok: false, disponivel, message: `Saldo disponível insuficiente: ${disponivel} un${vencidos ? ` (outras ${vencidos} un estão em lote vencido e não podem sair)` : ''}.` };
    }
    let falta = qtd;
    const partes = [];
    for (const l of lotes) {
        if (falta <= 0) break;
        const q = Math.min(Number(l.quantidade), falta);
        partes.push({ lote: l, quantidade: q });
        falta -= q;
    }
    return { ok: true, partes };
}

/** Situação do lote para a tela: 'INATIVO' | 'VENCIDO' | 'SEM_SALDO' | 'A_VENCER' | 'OK'. */
function situacaoLote(l, hoje = new Date()) {
    if (l.ativo === false) return 'INATIVO';
    if (loteVencido(l, hoje)) return 'VENCIDO';
    if (!(Number(l.quantidade) > 0)) return 'SEM_SALDO';
    return statusValidade(l.validade, hoje) === 'A_VENCER' ? 'A_VENCER' : 'OK';
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
