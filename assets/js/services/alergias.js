// Alergias do paciente (pendência #30): lista ativa x inativada e alerta de medicamento com possível conflito.
//
// O QUE É: as alergias continuam sendo registros ASSINADOS e imutáveis do prontuário (tipo ALERGIA). Inativar uma alergia NÃO apaga nem altera o
// registro: grava um complemento assinado que começa com "INATIVADA: " e o motivo. A alergia inativada sai da lista de alertas, mas fica no
// histórico do prontuário com o motivo, quem inativou e quando. O alerta de conflito compara o nome do agente com o nome do medicamento.
// O QUE NÃO É: não conhece classes de medicamentos (alergia a penicilina não avisa para amoxicilina) nem decide nada: só AVISA, e quem
// prescreve, dispensa ou administra confere. Ausência de aviso não significa que o medicamento seja seguro.

const PREFIXO_INATIVACAO = 'INATIVADA: ';
const alergiaNorm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** Agente da alergia a partir do texto montado por montarTextoAlergia ("Agente: X · Reação: ... · Gravidade: ..."). */
const agenteDaAlergia = (r) => String(r && r.texto || '').replace(/^Agente: /, '').split(' · ')[0].trim();
const ehInativacaoDeAlergia = (r) => Boolean(r && r.complementa_id) && String(r.texto || '').startsWith(PREFIXO_INATIVACAO);

/** Separa os registros de alergia em ativas e inativadas (com o complemento que inativou). Complementos comuns não contam como alergia. */
function separarAlergias(registros) {
    const todos = registros || [];
    const inativacao = new Map();
    todos.filter(ehInativacaoDeAlergia).sort((a, b) => String(a.em).localeCompare(String(b.em))).forEach(r => { if (!inativacao.has(r.complementa_id)) inativacao.set(r.complementa_id, r); });
    const originais = todos.filter(r => !r.complementa_id);
    return {
        ativas: originais.filter(r => !inativacao.has(r.id)),
        inativas: originais.filter(r => inativacao.has(r.id)).map(r => ({ ...r, inativacao: inativacao.get(r.id) }))
    };
}

/** Texto do complemento que inativa uma alergia. O motivo é obrigatório. */
function textoInativacaoAlergia(motivo) {
    const m = String(motivo || '').trim();
    if (m.length < 5) throw new Error('Informe o motivo de inativar a alergia (mínimo 5 letras).');
    if (m.length > 200) throw new Error('Motivo: no máximo 200 caracteres.');
    return PREFIXO_INATIVACAO + m;
}

const palavrasDe = (t) => alergiaNorm(t).split(/[^a-z0-9]+/).filter(x => x.length >= 5);

/** Alergias ativas cujo agente parece ser o medicamento informado (mesma palavra, ou uma contida na outra, com 5+ letras). */
function cruzarAlergiaMedicamento(ativas, medicamento) {
    const med = palavrasDe(medicamento);
    if (!med.length) return [];
    return (ativas || []).filter(r => palavrasDe(agenteDaAlergia(r)).some(a => med.some(m => a === m || a.includes(m) || m.includes(a))));
}

/** Frase de aviso para o profissional. */
function avisoConflitoAlergia(medicamento, conflitos) {
    return `Possível conflito: "${medicamento}" × alergia registrada a ${conflitos.map(agenteDaAlergia).join(', ')}.`;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { separarAlergias, textoInativacaoAlergia, cruzarAlergiaMedicamento, agenteDaAlergia, avisoConflitoAlergia, PREFIXO_INATIVACAO };
