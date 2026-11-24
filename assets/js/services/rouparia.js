// Lavanderia e rouparia (Etapa 9): livro de movimentos do enxoval entre os setores e a lavanderia.
//
// O QUE É: um livro que só acrescenta. Cada movimento guarda o tipo (coleta de roupa suja, entrega de roupa limpa ou baixa), o setor, a peça,
// a quantidade de peças e, se foi pesado, o peso em kg. Um lançamento errado não se edita: ele é ANULADO por um novo registro com motivo e
// deixa de entrar nas somas. A tela soma por setor e peça no período e mostra a diferença entre o que foi coletado e o que foi entregue.
//
// O QUE NÃO É: não calcula cota de enxoval por leito, não controla o estoque (par) de cada setor, não faz inventário nem custo por kg e
// não interpreta a diferença (ela pode ser roupa em processamento ou divergência: só a lavanderia sabe). A lista de peças é de apoio e
// precisa ser confirmada pela lavanderia. Ver docs/pendencias.md.

const COL_ROUPARIA = 'rouparia_mov';

const TIPOS_MOV_ROUPARIA = { COLETA_SUJA: 'Coleta de roupa suja', ENTREGA_LIMPA: 'Entrega de roupa limpa', BAIXA: 'Baixa (perda, extravio ou descarte)' };
const PECAS_ROUPARIA = {
    LENCOL: 'Lençol', FRONHA: 'Fronha', COBERTOR: 'Cobertor ou manta', TOALHA: 'Toalha', CAMISOLA: 'Camisola ou avental do paciente',
    CAMPO_CIRURGICO: 'Campo cirúrgico', PIJAMA_CIRURGICO: 'Pijama cirúrgico', UNIFORME: 'Uniforme', OUTRA: 'Outra peça'
};

// ============ Regras puras (testáveis) ============

/** Valida um movimento. `agora` é injetável para teste; o horário não pode ser futuro nem anterior a 48 h. */
function validarMovimentoRouparia(form, agora = new Date()) {
    const tipo = apoioEscolha(form.tipo, TIPOS_MOV_ROUPARIA, 'Tipo de movimento');
    const peca = apoioEscolha(form.peca, PECAS_ROUPARIA, 'Peça');
    const out = {
        tipo, peca, peca_rotulo: PECAS_ROUPARIA[peca],
        setor: apoioTexto(form.setor, 'Setor', { min: 2, max: 60 }),
        quantidade: apoioInteiro(form.quantidade, 'Quantidade de peças', 1, 9999),
        peso_kg: apoioDecimal(form.peso_kg, 'Peso (kg)', 0.01, 9999.99, { casas: 2, opcional: true }),
        em: apoioDataHora(form.em, 'Horário do movimento', { agora, maxAntesHoras: 48 }),
        observacao: apoioTexto(form.observacao, 'Observação', { max: 200 }), motivo: ''
    };
    if (tipo === 'BAIXA') out.motivo = apoioTexto(form.motivo, 'Motivo da baixa', { min: 5, max: 200 });
    return out;
}

/** Soma por setor e peça (só os registros que valem). `diferenca` = coletadas − entregues, sem interpretação. */
function resumoRouparia(lista, de = '', ate = '') {
    const validos = apoioRegistrosValidos(lista).filter(m => (!de || m.dia >= de) && (!ate || m.dia <= ate));
    const grupos = new Map();
    validos.forEach(m => {
        const k = `${m.setor}|${m.peca}`;
        if (!grupos.has(k)) grupos.set(k, { setor: m.setor, peca: m.peca, peca_rotulo: m.peca_rotulo, coletadas: 0, entregues: 0, baixas: 0, kg_coletado: 0, kg_entregue: 0 });
        const g = grupos.get(k);
        if (m.tipo === 'COLETA_SUJA') { g.coletadas += m.quantidade; g.kg_coletado += m.peso_kg || 0; }
        if (m.tipo === 'ENTREGA_LIMPA') { g.entregues += m.quantidade; g.kg_entregue += m.peso_kg || 0; }
        if (m.tipo === 'BAIXA') g.baixas += m.quantidade;
    });
    const linhas = [...grupos.values()].map(g => ({ ...g, kg_coletado: Math.round(g.kg_coletado * 100) / 100, kg_entregue: Math.round(g.kg_entregue * 100) / 100, diferenca: g.coletadas - g.entregues }))
        .sort((a, b) => a.setor.localeCompare(b.setor, 'pt-BR') || a.peca_rotulo.localeCompare(b.peca_rotulo, 'pt-BR'));
    const soma = (campo) => linhas.reduce((s, l) => s + l[campo], 0);
    return { linhas, total: { coletadas: soma('coletadas'), entregues: soma('entregues'), baixas: soma('baixas'), kg_coletado: Math.round(soma('kg_coletado') * 100) / 100, kg_entregue: Math.round(soma('kg_entregue') * 100) / 100, movimentos: validos.length } };
}

// ============ Gravação (Firestore) ============

function registrarMovimentoRouparia(form) {
    requirePermission('rouparia_registrar');
    const v = validarMovimentoRouparia(form);
    return apoioGravarRegistro({ col: COL_ROUPARIA, prefixoId: 'rou', dados: v, entidade: 'rouparia', perm: 'rouparia_registrar',
        resumoAuditoria: (r) => ({ tipo: r.tipo, setor: r.setor, peca: r.peca, quantidade: r.quantidade, peso_kg: r.peso_kg }) });
}

const anularMovimentoRouparia = (id, motivo) => apoioAnularRegistro({ col: COL_ROUPARIA, id, motivo, perm: 'rouparia_registrar', entidade: 'rouparia' });
