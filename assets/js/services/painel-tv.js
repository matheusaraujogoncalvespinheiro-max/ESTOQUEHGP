// Painel de chamadas por TV ou setor, com rodízio (pendência #23).
//
// O QUE É: cada TV da sala de espera é cadastrada em Cadastro › Painéis de TV com as filas que ela mostra (triagem, médico, exames...)
// e, se quiser, um rodízio: a TV passa de uma fila para a próxima a cada N segundos. A TV escolhida fica gravada no próprio navegador.
// O QUE NÃO É: continua mostrando só senha, local e hora, nunca nome nem dados clínicos. O rodízio só passa por filas que têm chamada hoje,
// e uma chamada nova em qualquer fila da TV leva a tela direto para ela. O tempo do rodízio é definido pelo hospital (não há padrão).

const FILAS_PAINEL_TV = ['TRIAGEM', 'MEDICO', 'EXAMES', 'AMBULATORIO', 'PROCEDIMENTOS'];

/** Filas marcadas na configuração da TV, na ordem padrão. */
const filasDaTv = (tv) => (tv ? FILAS_PAINEL_TV.filter(f => Boolean(tv['fila_' + f.toLowerCase()])) : []);

/** Valida o cadastro de uma TV (puro). */
function validarTvPainel(form) {
    const nome = String(form.nome || '').trim();
    if (nome.length < 3 || nome.length > 40) throw new Error('Nome da TV: de 3 a 40 caracteres.');
    const filas = filasDaTv(form);
    if (!filas.length) throw new Error('Marque pelo menos uma fila para esta TV.');
    const bruto = form.rodizio_seg;
    if (bruto === '' || bruto === null || bruto === undefined) return { nome, filas, rodizio_seg: null };
    const s = Number(bruto);
    if (!Number.isInteger(s) || s < 5 || s > 300) throw new Error('Rodízio: informe de 5 a 300 segundos (ou deixe em branco para não girar).');
    if (filas.length < 2) throw new Error('O rodízio precisa de pelo menos duas filas marcadas.');
    return { nome, filas, rodizio_seg: s };
}

/** Próxima fila do rodízio: a seguinte (em círculo) que tem chamada; se nenhuma tem, fica onde está. */
function proximaFilaRodizio(filas, atual, temChamada) {
    if (!filas.length) return '';
    const i = Math.max(0, filas.indexOf(atual));
    for (let passo = 1; passo <= filas.length; passo++) {
        const f = filas[(i + passo) % filas.length];
        if (temChamada(f)) return f;
    }
    return filas[i];
}

if (typeof module !== 'undefined' && module.exports) module.exports = { filasDaTv, validarTvPainel, proximaFilaRodizio };
