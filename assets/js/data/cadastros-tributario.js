// Cadastros tributários: CFOP e Operações. Mesmo motor dos demais cadastros (pages/cadastros/engine.js), consulta no
// padrão das telas de referência e cadastro em janela. Gravam em cad_cfop e cad_operacao (regra geral dos cad_* no
// firestore.rules: lê quem está logado; grava Administrador e Chefe OPME).
// Nenhum CFOP vem pré-cadastrado: o hospital cadastra os que usa (a tabela oficial é do CONFAZ/SINIEF).

const R_TRIB = ['ADMIN', 'CHEFE_OPME'];
const CFOP_TIPOS_UF = ['Dentro da UF', 'Fora da UF', 'Exterior'];
const CFOP_PIS_COFINS = ['Neutro', 'Crédito', 'Débito'];
const OPERACAO_ESTOQUE = ['Entrada', 'Saída', 'Neutro'];
const OPERACAO_FINANCEIRO = ['Não gera', 'A pagar', 'A receber'];

/** Pelo primeiro dígito do CFOP: 1/2/3 = entrada, 5/6/7 = saída; 1 e 5 dentro da UF, 2 e 6 fora, 3 e 7 exterior. */
function cfopClassificar(cfop) {
    const d = onlyDigits(cfop).charAt(0);
    const sentido = '123'.includes(d) && d ? 'Entrada' : ('567'.includes(d) && d ? 'Saída' : '');
    const tipo_uf = { 1: 'Dentro da UF', 5: 'Dentro da UF', 2: 'Fora da UF', 6: 'Fora da UF', 3: 'Exterior', 7: 'Exterior' }[d] || '';
    return { sentido, tipo_uf };
}

function validarCfop(form) {
    const n = onlyDigits(form.cfop);
    if (n.length === 4 && !cfopClassificar(n).sentido) {
        return [{ campo: 'cfop', mensagem: 'CFOP inválido: o primeiro dígito deve ser 1, 2 ou 3 (entrada) ou 5, 6 ou 7 (saída).' }];
    }
    return [];
}

/** A operação não pode dar entrada no estoque com CFOP de saída (nem o contrário). */
function validarOperacao(form) {
    if (!form.cfop_id || !form.estoque || form.estoque === 'Neutro') return [];
    const cfop = (typeof CAD_DATA !== 'undefined' && CAD_DATA.cfop || []).find(c => c.id === form.cfop_id);
    const sentido = cfop ? cfopClassificar(cfop.cfop).sentido : '';
    if (sentido && sentido !== form.estoque) {
        return [{ campo: 'cfop_id', mensagem: `O CFOP ${cfop.cfop} é de ${sentido.toLowerCase()}, mas a operação dá ${form.estoque.toLowerCase()} no estoque.` }];
    }
    return [];
}

Object.assign(CAD_DEFS, {
    cfop: {
        key: 'cfop', label: 'CFOP', singular: 'CFOP', icon: 'hash', prefix: 'CFO', roles: roles(R_TRIB),
        desc: 'Códigos Fiscais de Operações e Prestações usados nas notas. O primeiro dígito define se é entrada ou saída e se é dentro do estado, fora ou exterior.',
        rotulo: (r) => `${r.cfop} - ${r.descricao}`,
        search: ['cfop', 'descricao'],
        unique: ['cfop'],
        estiloConsulta: { busca: { label: 'Descrição/CFOP', ph: 'Pesquise pela descrição ou CFOP' }, destaque: 'descricao', mono: ['cfop'] },
        columns: [
            { k: 'cfop', label: 'CFOP', sort: true },
            { k: 'descricao', label: 'Descrição', sort: true },
            { k: 'sentido', label: 'Movimento', sort: true, get: (r) => r.sentido || cfopClassificar(r.cfop).sentido || '—' },
            { k: 'tipo_uf', label: 'Tipo UF', sort: true, get: (r) => r.tipo_uf || cfopClassificar(r.cfop).tipo_uf || '—' },
            { k: 'pis_cofins', label: 'PIS/COFINS', get: (r) => r.pis_cofins || '—' }
        ],
        filters: [{ k: 'sentido', label: 'Movimento', opts: ['Entrada', 'Saída'] }, { k: 'tipo_uf', label: 'Tipo UF', opts: CFOP_TIPOS_UF }],
        usedBy: [{ key: 'operacao', field: 'cfop_id', label: 'operação(ões)' }],
        validate: validarCfop,
        validar: (form) => cfopClassificar(form.cfop),   // grava "Movimento" e "Tipo UF" calculados pelo primeiro dígito
        tabs: [{ id: 'dados', label: 'Dados', fields: [
            { k: 'cfop', label: 'CFOP', type: 'digits', len: 4, maxlen: 4, req: true, ph: 'Ex.: 1102', help: 'Entrada ou saída e o tipo de UF saem do primeiro dígito.' },
            { k: 'pis_cofins', label: 'Tipo PIS / COFINS', type: 'select', opts: CFOP_PIS_COFINS },
            { k: 'descricao', label: 'Descrição', type: 'upper', req: true, span2: true },
            { ...OBS }
        ] }]
    },
    operacao: {
        key: 'operacao', label: 'Operações', singular: 'Operação', icon: 'arrow-left-right', prefix: 'OPE', roles: roles(R_TRIB),
        desc: 'Operações usadas nas movimentações e notas: o efeito no estoque e no financeiro e o CFOP padrão de cada uma.',
        rotulo: (r) => r.descricao,
        search: ['codigo', 'descricao', 'natureza'],
        unique: ['descricao'],
        estiloConsulta: {
            busca: { label: 'Descrição/Código', ph: 'Pesquise pela descrição ou código' },
            textos: [{ k: 'natureza', label: 'Natureza da operação', ph: 'Pesquise pela natureza da operação' }],
            destaque: 'descricao'
        },
        columns: [
            { k: 'codigo', label: 'Código', sort: true },
            { k: 'descricao', label: 'Descrição', sort: true },
            { k: 'natureza', label: 'Natureza da operação', sort: true },
            { k: 'estoque', label: 'Estoque', sort: true },
            { k: 'financeiro', label: 'Financeiro', sort: true },
            { k: 'cfop_id', label: 'CFOP', get: (r) => { const c = (CAD_DATA.cfop || []).find(x => x.id === r.cfop_id); return c ? c.cfop : '—'; } }
        ],
        filters: [{ k: 'estoque', label: 'Estoque', opts: OPERACAO_ESTOQUE }, { k: 'financeiro', label: 'Financeiro', opts: OPERACAO_FINANCEIRO }],
        validate: validarOperacao,
        tabs: [{ id: 'dados', label: 'Dados', fields: [
            { k: 'descricao', label: 'Descrição', type: 'upper', req: true, ph: 'Ex.: ENTRADA POR COMPRA' },
            { k: 'natureza', label: 'Natureza da operação', type: 'upper', req: true, ph: 'Texto que sai na nota' },
            { k: 'estoque', label: 'Estoque', type: 'select', req: true, opts: OPERACAO_ESTOQUE },
            { k: 'financeiro', label: 'Gera financeiro', type: 'select', req: true, opts: OPERACAO_FINANCEIRO },
            { k: 'cfop_id', label: 'CFOP padrão', type: 'ref', ref: 'cfop', help: 'Opcional. Precisa combinar com o estoque (entrada ou saída).' },
            { ...OBS }
        ] }]
    }
});
