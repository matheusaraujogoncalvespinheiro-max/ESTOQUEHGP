// Telas operacionais que antes estavam "em breve": movimentações de estoque, compras, consignado e configurações do sistema.
// Usam o mesmo motor de consulta/cadastro dos cadastros (pages/cadastros/engine.js) e as regras de services/operacoes.js.
// Registros de movimentação são IMUTÁVEIS (só consulta): correção = novo lançamento, nunca edição.

const R_OPS = ['ADMIN', 'CHEFE_OPME', 'FUNC_OPME', 'CHEFE_HEMODINAMICA', 'FUNC_HEMODINAMICA', 'FUNC_CENTRO_CIRURGICO'];
const ROLES_MOV = { ver: R_OPS, criar: R_OPS, editar: [], inativar: [] };
const ROLES_MOV_EST = { ver: R_EST, criar: R_EST, editar: [], inativar: [] };
const SETORES_OPS_OPTS = [{ id: 'OPME', rotulo: 'OPME' }, { id: 'HEMODINAMICA', rotulo: 'Hemodinâmica' }, { id: 'CENTRO_CIRURGICO', rotulo: 'Centro Cirúrgico' }];
const dataHoraCol = { k: 'criado_em', label: 'Registrado em', sort: true, get: (r) => (r.criado_em ? formatDateTimeBR(r.criado_em) : '—') };
const fProduto = { k: 'produto', label: 'Produto', type: 'produto', req: true, span2: true };
const fLote = { k: 'lote', label: 'Lote (com saldo)', type: 'lote', dep: 'produto', req: true };
const fQtd = { k: 'quantidade', label: 'Quantidade', type: 'number', req: true, min: 1 };
const colsProduto = [{ k: 'codigo', label: 'Código', sort: true }, { k: 'produto_desc', label: 'Produto', sort: true }, { k: 'lote_codigo', label: 'Lote' }, { k: 'quantidade', label: 'Qtd.', sort: true, num: true }];
const filtroSetorOps = { k: 'setor', label: 'Setor', opts: SETORES_OPS_OPTS };

Object.assign(CAD_DEFS, {
    // ============ MOVIMENTAÇÕES ============
    saida: {
        key: 'saida', label: 'Saídas', singular: 'Saída', icon: 'log-out', prefix: 'SAI', imutavel: true, semInativar: true, roles: ROLES_MOV,
        desc: 'Saída de material para setor, paciente ou procedimento. Usa o lote que vence primeiro e bloqueia lote vencido.',
        rotulo: (r) => `${r.codigo} - ${r.produto_desc}`, search: ['codigo', 'produto_desc', 'lote_codigo', 'destino_detalhe'], filters: [filtroSetorOps],
        columns: [...colsProduto, { k: 'destino_detalhe', label: 'Destino', sort: true }, dataHoraCol],
        validar: validarSaida, depois: aplicarSaida,
        tabs: [{ id: 'dados', label: 'Dados da saída', fields: [fProduto, fLote, fQtd,
            { k: 'destino', label: 'Tipo de destino', type: 'select', req: true, opts: ['Setor', 'Paciente', 'Procedimento', 'Outro'] },
            { k: 'destino_detalhe', label: 'Destino (setor, paciente ou procedimento)', type: 'text', req: true, span2: true },
            { ...OBS }] }]
    },
    devolucao: {
        key: 'devolucao', label: 'Devoluções ao Estoque', singular: 'Devolução', icon: 'undo-2', prefix: 'DEV', imutavel: true, semInativar: true, roles: ROLES_MOV,
        desc: 'Item que volta ao estoque (não utilizado, procedimento cancelado, troca). Lote vencido não volta: use Perdas.',
        rotulo: (r) => `${r.codigo} - ${r.produto_desc}`, search: ['codigo', 'produto_desc', 'lote_codigo', 'origem'], filters: [filtroSetorOps],
        columns: [...colsProduto, { k: 'origem', label: 'Origem', sort: true }, { k: 'motivo', label: 'Motivo' }, dataHoraCol],
        validar: validarDevolucao, depois: aplicarDevolucao,
        tabs: [{ id: 'dados', label: 'Dados da devolução', fields: [fProduto,
            { k: 'lote_codigo', label: 'Lote do item devolvido', type: 'text', req: true, maxlen: 40 }, { k: 'validade', label: 'Validade do lote', type: 'date', req: true }, fQtd,
            { k: 'origem', label: 'Origem (setor, paciente ou sala)', type: 'text', req: true },
            { k: 'motivo', label: 'Motivo', type: 'select', req: true, opts: MOTIVOS_DEVOLUCAO }, { ...OBS }] }]
    },
    perda: {
        key: 'perda', label: 'Perdas', singular: 'Perda', icon: 'trash-2', prefix: 'PER', imutavel: true, semInativar: true, roles: ROLES_MOV,
        desc: 'Material perdido (vencimento, avaria, extravio...). Aceita lote vencido e baixa o estoque com motivo e responsável.',
        rotulo: (r) => `${r.codigo} - ${r.produto_desc}`, search: ['codigo', 'produto_desc', 'lote_codigo', 'motivo'], filters: [filtroSetorOps, { k: 'motivo', label: 'Motivo', opts: MOTIVOS_PERDA }],
        columns: [...colsProduto, { k: 'motivo', label: 'Motivo', sort: true }, dataHoraCol],
        validar: validarPerda, depois: aplicarRemocao('PERDA'),
        tabs: [{ id: 'dados', label: 'Dados da perda', fields: [fProduto, fLote, fQtd,
            { k: 'motivo', label: 'Motivo', type: 'select', req: true, opts: MOTIVOS_PERDA },
            { k: 'descricao', label: 'Descrição (obrigatória se "Outro")', type: 'textarea', span2: true, maxlen: 300 }] }]
    },
    baixa: {
        key: 'baixa', label: 'Baixas', singular: 'Baixa', icon: 'package-minus', prefix: 'BXA', imutavel: true, semInativar: true, roles: ROLES_MOV_EST,
        desc: 'Baixa administrativa do estoque (ajuste de inventário, doação, descarte autorizado). Exige documento ou autorização.',
        rotulo: (r) => `${r.codigo} - ${r.produto_desc}`, search: ['codigo', 'produto_desc', 'lote_codigo', 'documento'], filters: [filtroSetorOps, { k: 'motivo', label: 'Motivo', opts: MOTIVOS_BAIXA }],
        columns: [...colsProduto, { k: 'motivo', label: 'Motivo', sort: true }, { k: 'documento', label: 'Documento' }, dataHoraCol],
        validar: validarBaixa, depois: aplicarRemocao('BAIXA'),
        tabs: [{ id: 'dados', label: 'Dados da baixa', fields: [fProduto, fLote, fQtd,
            { k: 'motivo', label: 'Motivo', type: 'select', req: true, opts: MOTIVOS_BAIXA },
            { k: 'documento', label: 'Documento / nº da autorização', type: 'text', req: true },
            { k: 'descricao', label: 'Descrição (obrigatória se "Outro")', type: 'textarea', span2: true, maxlen: 300 }] }]
    },
    entrega: {
        key: 'entrega', label: 'Entregas', singular: 'Entrega', icon: 'package-check', prefix: 'ENT', imutavel: true, semInativar: true, roles: ROLES_MOV,
        desc: 'Registro da entrega de material separado a um setor, com quem entregou e quem recebeu.',
        rotulo: (r) => `${r.codigo} - ${r.destino}`, search: ['codigo', 'destino', 'recebido_por', 'solicitacao_ref'], filters: [],
        columns: [{ k: 'codigo', label: 'Código', sort: true }, { k: 'destino', label: 'Destino', sort: true }, { k: 'recebido_por', label: 'Recebido por' }, { k: 'entregue_por_nome', label: 'Entregue por' }, dataHoraCol],
        validar: (f) => ({ entregue_por_nome: state.currentUser.name }),
        tabs: [{ id: 'dados', label: 'Dados da entrega', fields: [
            { k: 'destino', label: 'Setor de destino', type: 'select', req: true, opts: ['OPME', 'Hemodinâmica', 'Centro Cirúrgico', 'Enfermagem', 'Emergência', 'UTI', 'Outro'] },
            { k: 'solicitacao_ref', label: 'Nº da solicitação (opcional)', type: 'text' },
            { k: 'recebido_por', label: 'Recebido por', type: 'text', req: true },
            { k: 'itens', label: 'Itens entregues', type: 'itens', req: true, span2: true, colunas: [{ k: 'descricao', label: 'Item', req: true }, { k: 'quantidade', label: 'Qtd.', type: 'number', req: true }, { k: 'lote', label: 'Lote' }] },
            { ...OBS }] }]
    },

    // ============ COMPRAS ============
    solcompra: {
        key: 'solcompra', label: 'Solicitações de Compra', singular: 'Solicitação de Compra', icon: 'shopping-cart', prefix: 'SC', semInativar: true, roles: roles(R_EST),
        desc: 'Pedido interno de compra: o que falta, por quê e com que urgência. Alimenta as cotações.',
        rotulo: (r) => `${r.codigo} - ${r.setor_solicitante}`, search: ['codigo', 'setor_solicitante', 'justificativa'],
        filters: [{ k: 'situacao', label: 'Situação', opts: ['Aberta', 'Aprovada', 'Em cotação', 'Atendida', 'Cancelada'] }, { k: 'prioridade', label: 'Prioridade', opts: ['Normal', 'Urgente'] }],
        columns: [{ k: 'codigo', label: 'Código', sort: true }, { k: 'setor_solicitante', label: 'Setor', sort: true }, { k: 'prioridade', label: 'Prioridade', sort: true }, { k: 'situacao', label: 'Situação', sort: true }, dataHoraCol],
        defaults: { situacao: 'Aberta', prioridade: 'Normal' },
        tabs: [{ id: 'dados', label: 'Dados da solicitação', fields: [
            { k: 'setor_solicitante', label: 'Setor solicitante', type: 'select', req: true, opts: ['OPME', 'Hemodinâmica', 'Centro Cirúrgico', 'Enfermagem', 'Farmácia', 'Outro'] },
            { k: 'prioridade', label: 'Prioridade', type: 'select', req: true, opts: ['Normal', 'Urgente'] },
            { k: 'situacao', label: 'Situação', type: 'select', req: true, opts: ['Aberta', 'Aprovada', 'Em cotação', 'Atendida', 'Cancelada'] },
            { k: 'justificativa', label: 'Justificativa', type: 'textarea', req: true, span2: true, maxlen: 400 },
            { k: 'itens', label: 'Itens solicitados', type: 'itens', req: true, span2: true, colunas: [{ k: 'descricao', label: 'Item / material', req: true }, { k: 'quantidade', label: 'Qtd.', type: 'number', req: true }, { k: 'observacao', label: 'Observação' }] }] }]
    },
    cotacao: {
        key: 'cotacao', label: 'Cotações', singular: 'Cotação', icon: 'scale', prefix: 'COT', semInativar: true, roles: roles(R_EST),
        desc: 'Propostas dos fornecedores para uma solicitação de compra. Marque a vencedora para gerar o pedido.',
        rotulo: (r) => `${r.codigo} - ${cadRotuloRef('fornecedor', r.fornecedor_id)}`, search: ['codigo', 'condicao_pagamento'],
        filters: [{ k: 'solicitacao_id', label: 'Solicitação', ref: 'solcompra' }, { k: 'fornecedor_id', label: 'Fornecedor', ref: 'fornecedor' }],
        columns: [{ k: 'codigo', label: 'Código', sort: true }, { k: 'solicitacao_id', label: 'Solicitação', get: (r) => cadRotuloRef('solcompra', r.solicitacao_id) }, { k: 'fornecedor_id', label: 'Fornecedor', get: (r) => cadRotuloRef('fornecedor', r.fornecedor_id) },
            { k: 'valor_total', label: 'Valor total', sort: true, num: true, get: (r) => formatMoney(r.valor_total) }, { k: 'vencedora', label: 'Vencedora', get: (r) => (r.vencedora ? 'Sim' : 'Não') }],
        tabs: [{ id: 'dados', label: 'Proposta', fields: [
            { k: 'solicitacao_id', label: 'Solicitação de compra', type: 'ref', ref: 'solcompra', req: true }, { k: 'fornecedor_id', label: 'Fornecedor', type: 'ref', ref: 'fornecedor', req: true },
            { k: 'valor_total', label: 'Valor total (R$)', type: 'money', req: true }, { k: 'prazo_dias', label: 'Prazo de entrega (dias)', type: 'number', max: 365 },
            { k: 'validade_proposta', label: 'Validade da proposta', type: 'date' }, { k: 'condicao_pagamento', label: 'Condição de pagamento', type: 'text' },
            { k: 'vencedora', label: 'Resultado', type: 'check', checkLabel: 'Proposta vencedora' }, { ...OBS }] }]
    },
    pedido: {
        key: 'pedido', label: 'Pedidos de Compra', singular: 'Pedido', icon: 'file-text', prefix: 'PED', semInativar: true, roles: roles(R_EST),
        desc: 'Pedido emitido ao fornecedor. A situação muda para Parcial ou Recebido conforme os recebimentos.',
        rotulo: (r) => `${r.codigo} - ${cadRotuloRef('fornecedor', r.fornecedor_id)}`, search: ['codigo', 'observacoes'],
        filters: [{ k: 'situacao', label: 'Situação', opts: ['Emitido', 'Parcial', 'Recebido', 'Cancelado'] }, { k: 'fornecedor_id', label: 'Fornecedor', ref: 'fornecedor' }],
        columns: [{ k: 'codigo', label: 'Código', sort: true }, { k: 'fornecedor_id', label: 'Fornecedor', get: (r) => cadRotuloRef('fornecedor', r.fornecedor_id) }, { k: 'data_previsao', label: 'Previsão', sort: true, get: (r) => (r.data_previsao ? formatDateBR(r.data_previsao) : '—') },
            { k: 'valor_total', label: 'Valor', sort: true, num: true, get: (r) => formatMoney(r.valor_total) }, { k: 'situacao', label: 'Situação', sort: true }],
        defaults: { situacao: 'Emitido' }, validar: validarPedido,
        tabs: [{ id: 'dados', label: 'Dados do pedido', fields: [
            { k: 'fornecedor_id', label: 'Fornecedor', type: 'ref', ref: 'fornecedor', req: true }, { k: 'cotacao_id', label: 'Cotação (opcional)', type: 'ref', ref: 'cotacao' },
            { k: 'data_previsao', label: 'Previsão de entrega', type: 'date' }, { k: 'situacao', label: 'Situação', type: 'select', req: true, opts: ['Emitido', 'Parcial', 'Recebido', 'Cancelado'] },
            { k: 'itens', label: 'Itens do pedido', type: 'itens', req: true, span2: true, colunas: [{ k: 'descricao', label: 'Item', req: true }, { k: 'quantidade', label: 'Qtd.', type: 'number', req: true }, { k: 'valor_unit', label: 'Valor unit. (R$)', type: 'money' }] },
            { ...OBS }] }]
    },
    recebimento: {
        key: 'recebimento', label: 'Recebimentos', singular: 'Recebimento', icon: 'package-open', prefix: 'REC', imutavel: true, semInativar: true, roles: ROLES_MOV_EST,
        desc: 'Entrada de mercadoria com nota fiscal, lote e validade. Dá entrada no estoque e atualiza a situação do pedido.',
        rotulo: (r) => `${r.codigo} - NF ${r.nota_fiscal}`, search: ['codigo', 'nota_fiscal'],
        filters: [{ k: 'pedido', label: 'Pedido', ref: 'pedido' }],
        columns: [{ k: 'codigo', label: 'Código', sort: true }, { k: 'pedido', label: 'Pedido', get: (r) => cadRotuloRef('pedido', r.pedido) }, { k: 'nota_fiscal', label: 'Nota fiscal', sort: true },
            { k: 'data_recebimento', label: 'Data', sort: true, get: (r) => (r.data_recebimento ? formatDateBR(r.data_recebimento) : '—') }, { k: 'valor_total', label: 'Valor', num: true, get: (r) => formatMoney(r.valor_total) }],
        defaults: () => ({ data_recebimento: todayISO() }), validar: validarRecebimento, depois: aplicarRecebimento,
        tabs: [{ id: 'dados', label: 'Dados do recebimento', fields: [
            { k: 'pedido', label: 'Pedido de compra', type: 'ref', ref: 'pedido', req: true }, { k: 'nota_fiscal', label: 'Nota fiscal', type: 'text', req: true, maxlen: 30 },
            { k: 'data_recebimento', label: 'Data do recebimento', type: 'date', req: true, max: todayISO() },
            { k: 'recebimento_total', label: 'Pedido', type: 'check', checkLabel: 'Recebimento total do pedido' },
            { k: 'itens', label: 'Itens recebidos (entram no estoque)', type: 'itens', req: true, span2: true, colunas: [{ k: 'produto', label: 'Produto', type: 'produto', req: true }, { k: 'lote', label: 'Lote', req: true }, { k: 'validade', label: 'Validade', type: 'date', req: true }, { k: 'quantidade', label: 'Qtd.', type: 'number', req: true }, { k: 'valor_unit', label: 'Valor unit. (R$)', type: 'money' }] },
            { ...OBS }] }]
    },

    // ============ CONSIGNADO ============
    contrato: {
        key: 'contrato', label: 'Contratos de Consignação', singular: 'Contrato', icon: 'handshake', prefix: 'CON', roles: roles(R_EST),
        desc: 'Contratos com os fornecedores de material consignado: vigência, prazo de devolução e condições.',
        rotulo: (r) => `${r.codigo} - ${r.numero_contrato}`, search: ['codigo', 'numero_contrato'], unique: ['numero_contrato'],
        filters: [{ k: 'fornecedor_id', label: 'Fornecedor', ref: 'fornecedor' }],
        columns: [{ k: 'codigo', label: 'Código', sort: true }, { k: 'fornecedor_id', label: 'Fornecedor', get: (r) => cadRotuloRef('fornecedor', r.fornecedor_id) }, { k: 'numero_contrato', label: 'Nº do contrato', sort: true },
            { k: 'vigencia_fim', label: 'Vigência até', sort: true, get: (r) => (r.vigencia_fim ? formatDateBR(r.vigencia_fim) + (r.vigencia_fim < todayISO() ? ' (vencido)' : '') : '—') }],
        validar: (f) => (f.vigencia_fim < f.vigencia_inicio ? (() => { throw new Error('O fim da vigência não pode ser antes do início.'); })() : {}),
        tabs: [{ id: 'dados', label: 'Dados do contrato', fields: [
            { k: 'fornecedor_id', label: 'Fornecedor', type: 'ref', ref: 'fornecedor', req: true }, { k: 'numero_contrato', label: 'Nº do contrato', type: 'text', req: true },
            { k: 'vigencia_inicio', label: 'Início da vigência', type: 'date', req: true }, { k: 'vigencia_fim', label: 'Fim da vigência', type: 'date', req: true },
            { k: 'prazo_devolucao_dias', label: 'Prazo para devolução (dias)', type: 'number', max: 365 }, { k: 'condicoes', label: 'Condições', type: 'textarea', span2: true, maxlen: 500 }, { ...OBS }] }]
    },
    consigdev: {
        key: 'consigdev', label: 'Devoluções ao Fornecedor', singular: 'Devolução ao fornecedor', icon: 'corner-up-left', prefix: 'DVF', imutavel: true, semInativar: true, roles: ROLES_MOV_EST,
        desc: 'Material consignado devolvido ao fornecedor. Baixa o estoque do lote e registra o motivo e a nota de remessa.',
        rotulo: (r) => `${r.codigo} - ${r.produto_desc}`, search: ['codigo', 'produto_desc', 'lote_codigo', 'nota_remessa'], filters: [{ k: 'fornecedor_id', label: 'Fornecedor', ref: 'fornecedor' }],
        columns: [...colsProduto, { k: 'fornecedor_id', label: 'Fornecedor', get: (r) => cadRotuloRef('fornecedor', r.fornecedor_id) }, { k: 'motivo', label: 'Motivo' }, dataHoraCol],
        validar: validarDevFornecedor, depois: aplicarRemocao('DEV_FORNECEDOR'),
        tabs: [{ id: 'dados', label: 'Dados da devolução', fields: [fProduto, fLote, fQtd,
            { k: 'fornecedor_id', label: 'Fornecedor', type: 'ref', ref: 'fornecedor', req: true }, { k: 'motivo', label: 'Motivo', type: 'select', req: true, opts: MOTIVOS_DEV_FORNECEDOR },
            { k: 'nota_remessa', label: 'Nota de remessa', type: 'text', req: true }, { ...OBS }] }]
    },
    conferencia: {
        key: 'conferencia', label: 'Conferências', singular: 'Conferência', icon: 'clipboard-check', prefix: 'CNF', imutavel: true, semInativar: true, roles: ROLES_MOV_EST,
        desc: 'Contagem física do estoque consignado comparada com o saldo do sistema; divergências ficam registradas.',
        rotulo: (r) => `${r.codigo} - ${r.situacao}`, search: ['codigo', 'situacao'], filters: [{ k: 'fornecedor_id', label: 'Fornecedor', ref: 'fornecedor' }],
        columns: [{ k: 'codigo', label: 'Código', sort: true }, { k: 'fornecedor_id', label: 'Fornecedor', get: (r) => cadRotuloRef('fornecedor', r.fornecedor_id) }, { k: 'data_conferencia', label: 'Data', sort: true, get: (r) => (r.data_conferencia ? formatDateBR(r.data_conferencia) : '—') },
            { k: 'situacao', label: 'Resultado', sort: true }, { k: 'divergencias', label: 'Divergências', num: true }],
        defaults: () => ({ data_conferencia: todayISO() }), validar: validarConferencia,
        tabs: [{ id: 'dados', label: 'Dados da conferência', fields: [
            { k: 'fornecedor_id', label: 'Fornecedor', type: 'ref', ref: 'fornecedor', req: true }, { k: 'data_conferencia', label: 'Data da conferência', type: 'date', req: true, max: todayISO() },
            { k: 'itens', label: 'Itens conferidos', type: 'itens', req: true, span2: true, colunas: [{ k: 'produto', label: 'Produto', type: 'produto', req: true }, { k: 'quantidade_contada', label: 'Qtd. contada', type: 'number', req: true }, { k: 'observacao', label: 'Observação' }] },
            { ...OBS }] }]
    },

    // ============ SISTEMA ============
    empresa: {
        key: 'empresa', label: 'Dados da Empresa', singular: 'Empresa', icon: 'building', prefix: 'EMP', roles: roles(['ADMIN']), semInativar: true,
        desc: 'Dados institucionais do hospital (razão social, CNPJ, CNES, endereço e responsável).',
        rotulo: (r) => r.nome_fantasia || r.razao_social, search: ['codigo', 'razao_social', 'nome_fantasia', 'cnpj', 'cnes'], unique: ['cnpj'], filters: [],
        columns: [{ k: 'codigo', label: 'Código', sort: true }, { k: 'razao_social', label: 'Razão social', sort: true }, { k: 'cnpj', label: 'CNPJ', get: (r) => formatCNPJ(r.cnpj) }, { k: 'cnes', label: 'CNES' }],
        tabs: [{ id: 'dados', label: 'Dados institucionais', fields: [
            { k: 'razao_social', label: 'Razão social', type: 'upper', req: true, span2: true }, { k: 'nome_fantasia', label: 'Nome fantasia', type: 'upper' }, { k: 'cnpj', label: 'CNPJ', type: 'cnpj', req: true },
            { k: 'cnes', label: 'CNES (7 dígitos)', type: 'digits', len: 7, maxlen: 7 }, { k: 'telefone', label: 'Telefone', type: 'phone' }, { k: 'email', label: 'E-mail', type: 'email' },
            { k: 'cep', label: 'CEP', type: 'cep' }, { k: 'uf', label: 'UF', type: 'uf' }, { k: 'municipio_id', label: 'Município', type: 'municipio', dep: 'uf' }, { k: 'logradouro', label: 'Endereço', type: 'text' },
            { k: 'numero', label: 'Número', type: 'text', maxlen: 10 }, { k: 'bairro', label: 'Bairro', type: 'text' }, { k: 'responsavel', label: 'Responsável legal', type: 'text' }] }]
    },
    setor: {
        key: 'setor', label: 'Setores', singular: 'Setor', icon: 'network', prefix: 'SET', roles: roles(['ADMIN'], ['ADMIN', 'CHEFE_OPME']),
        desc: 'Setores do hospital (assistenciais, apoio e administrativos).',
        rotulo: (r) => r.nome, search: ['codigo', 'nome', 'responsavel'], unique: ['nome'], filters: [{ k: 'tipo', label: 'Tipo', opts: ['Assistencial', 'Apoio', 'Administrativo'] }],
        columns: [{ k: 'codigo', label: 'Código', sort: true }, { k: 'nome', label: 'Setor', sort: true }, { k: 'tipo', label: 'Tipo', sort: true }, { k: 'responsavel', label: 'Responsável', get: (r) => r.responsavel || '—' }],
        tabs: [{ id: 'dados', label: 'Dados', fields: [{ k: 'nome', label: 'Nome do setor', type: 'upper', req: true, span2: true }, { k: 'tipo', label: 'Tipo', type: 'select', req: true, opts: ['Assistencial', 'Apoio', 'Administrativo'] },
            { k: 'responsavel', label: 'Responsável', type: 'text' }, { ...OBS }] }]
    },
    titulo: {
        key: 'titulo', label: 'Contas a Pagar / Receber', singular: 'Título', icon: 'banknote', prefix: 'FIN', roles: roles(R_FIN), semInativar: true,
        desc: 'Títulos financeiros a pagar e a receber, com vencimento, situação e vínculo ao plano de contas e centro de custo.',
        rotulo: (r) => `${r.codigo} - ${r.descricao}`, search: ['codigo', 'descricao', 'documento'],
        filters: [{ k: 'tipo', label: 'Tipo', opts: ['A pagar', 'A receber'] }, { k: 'situacao', label: 'Situação', opts: ['Aberto', 'Pago', 'Cancelado'] }],
        columns: [{ k: 'codigo', label: 'Código', sort: true }, { k: 'tipo', label: 'Tipo', sort: true }, { k: 'descricao', label: 'Descrição', sort: true }, { k: 'vencimento', label: 'Vencimento', sort: true, get: (r) => (r.vencimento ? formatDateBR(r.vencimento) + (r.situacao === 'Aberto' && r.vencimento < todayISO() ? ' (atrasado)' : '') : '—') },
            { k: 'valor', label: 'Valor', sort: true, num: true, get: (r) => formatMoney(r.valor) }, { k: 'situacao', label: 'Situação', sort: true }],
        defaults: { situacao: 'Aberto', tipo: 'A pagar' },
        validar: (f) => (f.situacao === 'Pago' && !f.data_pagamento ? (() => { throw new Error('Informe a data do pagamento/recebimento para marcar como pago.'); })() : {}),
        tabs: [{ id: 'dados', label: 'Dados do título', fields: [
            { k: 'tipo', label: 'Tipo', type: 'select', req: true, opts: ['A pagar', 'A receber'] }, { k: 'descricao', label: 'Descrição', type: 'text', req: true, span2: true },
            { k: 'valor', label: 'Valor (R$)', type: 'money', req: true }, { k: 'vencimento', label: 'Vencimento', type: 'date', req: true },
            { k: 'situacao', label: 'Situação', type: 'select', req: true, opts: ['Aberto', 'Pago', 'Cancelado'] }, { k: 'data_pagamento', label: 'Data do pagamento/recebimento', type: 'date', max: todayISO() },
            { k: 'fornecedor_id', label: 'Fornecedor', type: 'ref', ref: 'fornecedor' }, { k: 'documento', label: 'Documento / nota', type: 'text' }] },
            { id: 'classificacao', label: 'Classificação', fields: [{ k: 'conta_id', label: 'Conta', type: 'ref', ref: 'conta' }, { k: 'plano_id', label: 'Plano de contas', type: 'ref', ref: 'plano' },
                { k: 'centro_id', label: 'Centro de custo', type: 'ref', ref: 'centrocusto' }, { ...OBS }] }]
    },
    parametro: {
        key: 'parametro', label: 'Parâmetros do Sistema', singular: 'Parâmetro', icon: 'sliders-horizontal', prefix: 'PAR', roles: roles(['ADMIN']), semInativar: true,
        desc: 'Ajustes do painel e dos alertas. Hoje: quantos dias antes do vencimento um lote passa a ser alertado.',
        rotulo: (r) => `${r.chave}: ${r.valor}`, search: ['chave', 'descricao'], unique: ['chave'], filters: [],
        columns: [{ k: 'chave', label: 'Parâmetro', sort: true, get: (r) => (PARAMETROS_SISTEMA.find(p => p.id === r.chave) || { rotulo: r.chave }).rotulo }, { k: 'valor', label: 'Valor', sort: true, num: true }],
        tabs: [{ id: 'dados', label: 'Parâmetro', fields: [{ k: 'chave', label: 'Parâmetro', type: 'select', req: true, opts: () => PARAMETROS_SISTEMA, roEdit: true },
            { k: 'valor', label: 'Valor', type: 'number', req: true, min: 1, max: 365 }, { ...OBS }] }]
    }
});

const PARAMETROS_SISTEMA = [{ id: 'dias_alerta_validade', rotulo: 'Dias de alerta de validade dos lotes (padrão 30)' }];
