// Fiscal (NF-e, NFS-e, entrada de mercadoria, inventário) e cancelamento de operação. Mesmo motor dos demais cadastros.
// O sistema REGISTRA e CONFERE notas; não emite (emissão exige certificado digital e SEFAZ/prefeitura). Veja services/fiscal.js.

const R_FISC = ['ADMIN', 'CHEFE_OPME'];
const SITUACOES_NOTA = ['Autorizada', 'Cancelada', 'Denegada'];
const lerXmlParaFormulario = (texto) => { const d = lerXmlNFe(texto); return { ...d, chave: d.chave, emitente_cnpj: formatCNPJ(d.emitente_cnpj) }; };

Object.assign(CAD_DEFS, {
    nfe: {
        key: 'nfe', label: 'NF-e', singular: 'NF-e', icon: 'file-text', prefix: 'NFE', semInativar: true, roles: roles(R_FISC),
        desc: 'Notas fiscais eletrônicas (modelo 55) recebidas. Importe o XML ou digite os dados; a chave de acesso tem o dígito verificador conferido. O sistema não emite NF-e.',
        rotulo: (r) => `NF-e ${r.numero}/${r.serie || '1'} - ${r.emitente_nome || ''}`, search: ['codigo', 'numero', 'chave', 'emitente_nome', 'emitente_cnpj'],
        filters: [{ k: 'situacao', label: 'Situação', opts: SITUACOES_NOTA }],
        columns: [{ k: 'codigo', label: 'Código', sort: true }, { k: 'numero', label: 'Nº / série', sort: true, get: (r) => `${r.numero}/${r.serie || '1'}` }, { k: 'emitente_nome', label: 'Emitente', sort: true }, { k: 'natureza_operacao', label: 'Operação', get: (r) => r.natureza_operacao || '—' }, { k: 'data_emissao', label: 'Emissão', sort: true, get: (r) => (r.data_emissao ? formatDateBR(r.data_emissao) : '—') },
            { k: 'valor_total', label: 'Valor', sort: true, num: true, get: (r) => formatMoney(r.valor_total) }, { k: 'situacao', label: 'Situação', sort: true }],
        defaults: { situacao: 'Autorizada' }, validar: validarNFe, filtrosPadrao: {},
        botoesLista: [{ rotulo: 'Importar XML', icon: 'upload', fn: 'nfeImportarXml' }],
        kpisExtra: (todos) => [{ rotulo: 'Valor total (R$)', valor: formatMoney(todos.filter(r => r.situacao === 'Autorizada').reduce((a, r) => a + (Number(r.valor_total) || 0), 0)) }],
        tabs: [
            { id: 'dados', label: 'Dados da nota', fields: [
                { k: '_xml', label: 'Importar XML da NF-e', type: 'arquivo', accept: '.xml,text/xml', onFile: lerXmlParaFormulario, span2: true, help: 'Preenche chave, emitente, valores e itens. Confira antes de salvar.' },
                { k: 'chave', label: 'Chave de acesso (44 dígitos)', type: 'digits', len: 44, maxlen: 44, req: true, span2: true },
                { k: 'numero', label: 'Número', type: 'text', req: true, maxlen: 12 }, { k: 'serie', label: 'Série', type: 'text', maxlen: 4 },
                { k: 'data_emissao', label: 'Data de emissão', type: 'date', req: true, max: todayISO() }, { k: 'situacao', label: 'Situação', type: 'select', req: true, opts: SITUACOES_NOTA },
                { k: 'protocolo', label: 'Protocolo de autorização', type: 'text', maxlen: 20 }, { k: 'natureza_operacao', label: 'Natureza da operação', type: 'text' },
                { k: 'emitente_nome', label: 'Emitente (razão social)', type: 'text', req: true }, { k: 'emitente_cnpj', label: 'CNPJ do emitente', type: 'cnpj', req: true },
                { k: 'fornecedor_id', label: 'Fornecedor cadastrado', type: 'ref', ref: 'fornecedor' },
                { k: 'destinatario_nome', label: 'Destinatário', type: 'text' }, { k: 'destinatario_doc', label: 'CNPJ/CPF do destinatário', type: 'text' }] },
            { id: 'valores', label: 'Valores e itens', fields: [
                { k: 'valor_produtos', label: 'Valor dos produtos (R$)', type: 'money', req: true }, { k: 'valor_frete', label: 'Frete (R$)', type: 'money' }, { k: 'valor_total', label: 'Valor total da nota (R$)', type: 'money', help: 'Em branco = produtos + frete.' },
                { k: 'itens', label: 'Itens da nota', type: 'itens', span2: true, colunas: [{ k: 'codigo', label: 'Código' }, { k: 'descricao', label: 'Descrição', req: true }, { k: 'ncm', label: 'NCM' }, { k: 'cfop', label: 'CFOP' }, { k: 'quantidade', label: 'Qtd.', type: 'number' }, { k: 'valor_unit', label: 'Valor unit.', type: 'money' }] },
                { ...OBS }] }]
    },
    nfse: {
        key: 'nfse', label: 'NFS-e', singular: 'NFS-e', icon: 'receipt', prefix: 'NSE', semInativar: true, roles: roles(R_FISC),
        desc: 'Notas fiscais de serviço recebidas, com cálculo do ISS. O layout da NFS-e varia por município, por isso o registro é digitado. O sistema não emite NFS-e.',
        rotulo: (r) => `NFS-e ${r.numero} - ${cadRotuloRef('fornecedor', r.fornecedor_id)}`, search: ['codigo', 'numero', 'codigo_verificacao', 'descricao_servico'], unique: ['numero+fornecedor_id'],
        filters: [{ k: 'situacao', label: 'Situação', opts: ['Emitida', 'Cancelada'] }, { k: 'fornecedor_id', label: 'Prestador', ref: 'fornecedor' }],
        columns: [{ k: 'codigo', label: 'Código', sort: true }, { k: 'numero', label: 'Número', sort: true }, { k: 'fornecedor_id', label: 'Prestador', get: (r) => cadRotuloRef('fornecedor', r.fornecedor_id) }, { k: 'data_emissao', label: 'Emissão', sort: true, get: (r) => (r.data_emissao ? formatDateBR(r.data_emissao) : '—') },
            { k: 'valor_servicos', label: 'Serviços', sort: true, num: true, get: (r) => formatMoney(r.valor_servicos) }, { k: 'valor_iss', label: 'ISS', num: true, get: (r) => formatMoney(r.valor_iss) }, { k: 'situacao', label: 'Situação', sort: true }],
        defaults: { situacao: 'Emitida' }, validar: validarNFSe,
        tabs: [{ id: 'dados', label: 'Dados da nota', fields: [
            { k: 'numero', label: 'Número da NFS-e', type: 'text', req: true, maxlen: 15 }, { k: 'codigo_verificacao', label: 'Código de verificação', type: 'text', maxlen: 20 },
            { k: 'fornecedor_id', label: 'Prestador (fornecedor)', type: 'ref', ref: 'fornecedor', req: true }, { k: 'data_emissao', label: 'Data de emissão', type: 'date', req: true, max: todayISO() },
            { k: 'competencia', label: 'Competência', type: 'date' }, { k: 'situacao', label: 'Situação', type: 'select', req: true, opts: ['Emitida', 'Cancelada'] },
            { k: 'codigo_servico', label: 'Código do serviço (item da LC 116)', type: 'text', maxlen: 10 }, { k: 'uf', label: 'UF da prestação', type: 'uf' }, { k: 'municipio_id', label: 'Município da prestação', type: 'municipio', dep: 'uf' },
            { k: 'descricao_servico', label: 'Descrição do serviço', type: 'textarea', req: true, span2: true, maxlen: 500 },
            { k: 'valor_servicos', label: 'Valor dos serviços (R$)', type: 'money', req: true }, { k: 'aliquota_iss', label: 'Alíquota de ISS (%)', type: 'number', step: '0.01', max: 5 },
            { k: 'iss_retido', label: 'ISS', type: 'check', checkLabel: 'ISS retido pelo tomador' }, { ...OBS }] }]
    },
    entradanf: {
        key: 'entradanf', label: 'Entrada de Mercadoria', singular: 'Entrada de mercadoria', icon: 'package-open', prefix: 'EMF', semInativar: true, roles: roles(R_FISC),
        desc: 'Entrada fiscal de mercadoria: liga a NF-e autorizada ao recebimento físico. Uma nota só entra uma vez.',
        rotulo: (r) => `${r.codigo} - NF-e ${r.numero_nfe || ''}`, search: ['codigo', 'numero_nfe', 'cfop', 'fornecedor_nome'],
        filters: [{ k: 'situacao', label: 'Status', opts: ['Pendente', 'Lançada', 'Cancelada'] }], filtrosPadrao: { situacao: 'Pendente' },
        botoesLista: [{ rotulo: 'NF destinadas', icon: 'file-text', fn: 'entradaNfDestinadas' }, { rotulo: 'Importar XML', icon: 'upload', fn: 'entradaImportarXml' }],
        kpisExtra: (todos) => [{ rotulo: 'Total pendente', valor: formatMoney(todos.filter(r => r.situacao === 'Pendente').reduce((a, r) => a + (Number(r.valor_nota) || 0), 0)) }],
        columns: [{ k: 'numero_nfe', label: 'Numeração', sort: true }, { k: 'fornecedor_nome', label: 'Fornecedor', sort: true }, { k: 'data_emissao', label: 'Data emissão', sort: true, get: (r) => (r.data_emissao ? formatDateBR(r.data_emissao) : '—') },
            { k: 'data_entrada', label: 'Data lançamento', sort: true, get: (r) => (r.data_entrada ? formatDateBR(r.data_entrada) : '—') }, { k: 'codigo', label: 'N. interno', sort: true }, { k: 'cfop', label: 'CFOP', get: (r) => r.cfop || '—' },
            { k: 'valor_nota', label: 'Valor NF (R$)', sort: true, num: true, get: (r) => formatMoney(r.valor_nota) }, { k: 'situacao', label: 'Status', sort: true }],
        defaults: () => ({ situacao: 'Pendente' }), validar: validarEntradaMercadoria,
        tabs: [{ id: 'dados', label: 'Dados da entrada', fields: [
            { k: 'nfe', label: 'NF-e', type: 'ref', ref: 'nfe', req: true, roEdit: true }, { k: 'recebimento_id', label: 'Recebimento (estoque)', type: 'ref', ref: 'recebimento' },
            { k: 'situacao', label: 'Status', type: 'select', req: true, opts: ['Pendente', 'Lançada', 'Cancelada'] },
            { k: 'data_entrada', label: 'Data do lançamento', type: 'date', max: todayISO(), help: 'Obrigatória para lançar.' }, { k: 'cfop', label: 'CFOP de entrada (4 dígitos)', type: 'digits', len: 4, maxlen: 4, help: 'Obrigatório para lançar.' },
            { k: 'valor_confere', label: 'Conferência', type: 'check', checkLabel: 'Valor e itens conferidos com a mercadoria' }, { ...OBS }] }]
    },
    inventario: {
        key: 'inventario', label: 'Inventário de Estoque', singular: 'Inventário', icon: 'clipboard-list', prefix: 'INV', semInativar: true, roles: roles(R_FISC, ['ADMIN', 'CHEFE_OPME', 'FUNC_OPME', 'CHEFE_HEMODINAMICA', 'FUNC_HEMODINAMICA', 'FUNC_CENTRO_CIRURGICO']),
        desc: 'Contagem física por setor. Carregue os produtos, informe o que contou e conclua: as diferenças ficam registradas e, se quiser, as faltas são baixadas do estoque.',
        rotulo: (r) => `${r.codigo} - ${r.setor}`, search: ['codigo', 'setor'], filters: [{ k: 'situacao', label: 'Situação', opts: ['Em contagem', 'Concluído'] }, filtroSetorOps],
        columns: [{ k: 'codigo', label: 'Código', sort: true }, { k: 'setor', label: 'Setor', sort: true }, { k: 'data_inventario', label: 'Data', sort: true, get: (r) => (r.data_inventario ? formatDateBR(r.data_inventario) : '—') }, { k: 'situacao', label: 'Situação', sort: true },
            { k: 'observacoes', label: 'Observação', get: (r) => r.observacoes || '—' }, { k: 'divergencias', label: 'Divergências', num: true }, { k: 'faltas', label: 'Faltas', num: true }, { k: 'sobras', label: 'Sobras', num: true }],
        defaults: () => ({ data_inventario: todayISO(), situacao: 'Em contagem' }), somenteLeitura: (r) => r.situacao === 'Concluído',
        validar: (form, id) => {
            const atual = id ? (CAD_DATA.inventario || []).find(r => r.id === id) : null;
            if (atual && atual.situacao === 'Concluído') throw new Error('Inventário concluído não pode ser alterado.');
            return validarInventario(form);
        },
        depois: (reg, form) => aplicarAjusteInventario(reg),
        depoisEdicao: (reg, form, atual) => { if (!atual.ajuste_aplicado) aplicarAjusteInventario(reg); },
        tabs: [{ id: 'dados', label: 'Contagem', fields: [
            { k: 'setor', label: 'Setor de estoque', type: 'select', req: true, roEdit: true, opts: SETORES_OPS_OPTS }, { k: 'data_inventario', label: 'Data da contagem', type: 'date', req: true, max: todayISO() },
            { k: 'situacao', label: 'Situação', type: 'select', req: true, opts: ['Em contagem', 'Concluído'] },
            { k: 'aplicar_ajuste', label: 'Ajuste', type: 'check', checkLabel: 'Ao concluir, baixar as faltas do estoque (lotes que vencem primeiro)' },
            { k: 'itens', label: 'Produtos contados', type: 'itens', req: true, span2: true, semAdicionar: true, carregarRotulo: 'Carregar produtos do setor', carregar: (f) => { if (!f.setor) throw new Error('Escolha o setor primeiro.'); return itensInventario(f.setor); },
                colunas: [{ k: 'produto', label: 'Produto', type: 'produto' }, { k: 'quantidade_sistema', label: 'Saldo no sistema', ro: true }, { k: 'quantidade_contada', label: 'Qtd. contada', type: 'number' }] },
            { ...OBS }] }]
    },

    // ============ CANCELAMENTO DE OPERAÇÃO (Movimentações) ============
    cancelamento: {
        key: 'cancelamento', label: 'Cancelamento de Operação', singular: 'Cancelamento', icon: 'x-circle', prefix: 'CAN', imutavel: true, semInativar: true,
        roles: { ver: [...R_FISC, 'CHEFE_FARMACIA'], criar: [...R_FISC, 'CHEFE_FARMACIA'], editar: [], inativar: [] },
        desc: 'Cancela uma movimentação já registrada e desfaz o efeito no estoque. A operação original continua na consulta, marcada como cancelada, e o motivo fica registrado.',
        rotulo: (r) => `${r.codigo} - ${r.operacao_desc}`, search: ['codigo', 'operacao_desc', 'motivo'], filters: [{ k: 'tipo_rotulo', label: 'Tipo', opts: Object.values(OPERACOES_CANCELAVEIS) }],
        columns: [{ k: 'codigo', label: 'Código', sort: true }, { k: 'tipo_rotulo', label: 'Tipo', sort: true }, { k: 'operacao_desc', label: 'Operação cancelada', sort: true }, { k: 'motivo', label: 'Motivo' }, dataHoraCol],
        watch: Object.keys(OPERACOES_CANCELAVEIS), validar: validarCancelamento, depois: aplicarCancelamento,
        tabs: [{ id: 'dados', label: 'Dados do cancelamento', fields: [
            { k: 'tipo_operacao', label: 'Tipo da operação', type: 'select', req: true, opts: Object.entries(OPERACOES_CANCELAVEIS).map(([id, rotulo]) => ({ id, rotulo })) },
            { k: 'operacao', label: 'Operação a cancelar', type: 'operacao', dep: 'tipo_operacao', req: true, help: 'Só aparecem operações ainda ativas.' },
            { k: 'motivo', label: 'Motivo do cancelamento', type: 'textarea', req: true, span2: true, maxlen: 300 }] }]
    }
});

// Operações canceladas aparecem como "Cancelada" (e saem da lista de ativas)
Object.keys(OPERACOES_CANCELAVEIS).forEach(k => { if (CAD_DEFS[k]) CAD_DEFS[k].rotuloInativo = 'Cancelada'; });


// ===== Estilo "ERP" (telas de referência): consulta em pílulas, formulários com bloco de identificação e abas =====
const FRETE_NFE = ['0 - Contratação por conta do emitente', '1 - Contratação por conta do destinatário', '2 - Contratação por conta de terceiros', '9 - Sem ocorrência de transporte'];
const STATUS_ENTRADA = ['Pendente', 'Lançada', 'Cancelada'];

Object.assign(CAD_DEFS.entradanf, {
    estiloERP: true, tituloTela: 'Entrada de Estoque', rotuloNovo: 'Nova', textoVazio: 'Nenhuma entrada encontrada', layout: 'erp',
    colunasERP: 'minmax(0,1fr) minmax(0,1.6fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) 90px minmax(0,1fr) minmax(0,1fr)',
    filtrosTexto: [{ k: 'numero_nfe', label: 'N. NF-e', larg: 'p' }, { k: 'codigo', label: 'N. Interno', larg: 'p' }, { k: 'fornecedor_nome', label: 'Fornecedores', ph: 'Código ou nome', larg: 'g' }],
    filters: [{ k: 'situacao', label: 'Status', opts: STATUS_ENTRADA, todos: 'Todos' }],
    botoesLista: [{ rotulo: 'NF Destinadas', icon: 'file-text', fn: 'entradaNfDestinadas', cor: 'azul' }, { rotulo: 'Importar XML', icon: 'upload', fn: 'entradaImportarXml', cor: 'claro', direita: true }],
    kpiERP: (todos) => ({ rotulo: 'Total Pendente', valor: formatMoney(todos.filter(r => r.situacao === 'Pendente').reduce((a, r) => a + (Number(r.valor_nota) || 0), 0)), icon: 'banknote' }),
    corLinha: (r) => (r.situacao === 'Lançada' ? 'ok' : (r.situacao === 'Cancelada' ? 'cancelada' : '')),
    top: [{ k: 'codigo', label: 'N. Interno', type: 'text', ro: true, roVazio: '0', col: 2 }, { k: 'situacao', label: 'Status', type: 'select', req: true, col: 2, opts: STATUS_ENTRADA },
        { k: 'nfe', label: 'NF-e', type: 'ref', ref: 'nfe', req: true, roEdit: true, col: 5 }, { k: 'data_entrada', label: 'Data do lançamento', type: 'date', max: todayISO(), col: 3 }],
    tabs: [
        { id: 'itens', label: 'Itens', fields: [{ k: 'itens', label: 'Itens da nota', type: 'itens', col: 12, semAdicionar: true,
            colunas: [{ k: 'codigo', label: 'Código', ro: true }, { k: 'descricao', label: 'Descrição', ro: true }, { k: 'quantidade', label: 'Qtde', ro: true }, { k: 'valor_unit', label: 'Vlr un', ro: true }, { k: 'produto', label: 'Produto do estoque', type: 'produto' }] }] },
        { id: 'fatura', label: 'Fatura', fields: [{ k: 'faturas', label: 'Faturas (duplicatas)', type: 'itens', col: 12, semAdicionar: true, colunas: [{ k: 'numero', label: 'Duplicata', ro: true }, { k: 'vencimento', label: 'Vencimento', ro: true }, { k: 'valor', label: 'Valor', ro: true }] }] },
        { id: 'adicionais', label: 'Adicionais', fields: [
            { k: 'cfop', label: 'CFOP de entrada (4 dígitos)', type: 'digits', len: 4, maxlen: 4, col: 3, help: 'Obrigatório para lançar.' }, { k: 'natureza_operacao', label: 'Natureza da operação', type: 'text', col: 5 },
            { k: 'valor_confere', label: 'Conferência', type: 'check', checkLabel: 'Valor e itens conferidos com a mercadoria', col: 4 }, { k: 'observacoes', label: 'Observações', type: 'textarea', col: 12, maxlen: 500 }] }]
});

Object.assign(CAD_DEFS.nfe, {
    estiloERP: true, tituloTela: 'NF-e', rotuloNovo: 'Novo', textoVazio: 'Nenhuma NF-e encontrada', layout: 'erp', semSitForm: true,
    colunasERP: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1.8fr) minmax(0,1.2fr) minmax(0,1fr) minmax(0,1fr)',
    filtrosTexto: [{ k: 'numero', label: 'N° NF-e', larg: 'p' }, { k: 'emitente_nome', label: 'Emitente', ph: 'Código ou nome', larg: 'g' }, { k: 'chave', label: 'Chave', larg: 'g' }],
    filters: [{ k: 'situacao', label: 'Status', opts: SITUACOES_NOTA, todos: 'Todos' }],
    kpiERP: (todos) => ({ rotulo: 'Total', valor: formatMoney(todos.filter(r => r.situacao === 'Autorizada').reduce((a, r) => a + (Number(r.valor_total) || 0), 0)), icon: 'banknote' }),
    corLinha: (r) => (r.situacao === 'Cancelada' ? 'cancelada' : (r.situacao === 'Denegada' ? 'cinza' : '')),
    legenda: [{ cor: 'ok', rotulo: 'Entrada lançada' }, { cor: 'cancelada', rotulo: 'Cancelada' }, { cor: 'cinza', rotulo: 'Denegada' }],
    columns: [{ k: 'data_emissao', label: 'Emissão', sort: true, get: (r) => (r.data_emissao ? formatDateBR(r.data_emissao) : '—') }, { k: 'numero', label: 'Número/Série', sort: true, get: (r) => `${r.numero}/${r.serie || '1'}` },
        { k: 'emitente_nome', label: 'Emitente', sort: true }, { k: 'natureza_operacao', label: 'Operação', get: (r) => r.natureza_operacao || '—' }, { k: 'situacao', label: 'Status', sort: true }, { k: 'valor_total', label: 'Valor', sort: true, num: true, get: (r) => formatMoney(r.valor_total) }],
    top: [{ k: 'numero', label: 'N° NF', type: 'text', req: true, maxlen: 12, col: 2 }, { k: 'serie', label: 'Série', type: 'text', maxlen: 4, col: 1 }, { k: 'chave', label: 'Chave NF', type: 'digits', len: 44, maxlen: 44, req: true, col: 5 },
        { k: 'data_emissao', label: 'Data de emissão', type: 'date', req: true, max: todayISO(), col: 2 }, { k: 'situacao', label: 'Status', type: 'select', req: true, col: 2, opts: SITUACOES_NOTA }],
    tabs: [
        { id: 'itens', label: 'Itens', fields: [{ k: 'itens', label: 'Itens da nota', type: 'itens', col: 12,
            colunas: [{ k: 'codigo', label: 'Código' }, { k: 'descricao', label: 'Descrição', req: true }, { k: 'cst', label: 'CST/CSOSN' }, { k: 'cfop', label: 'CFOP' }, { k: 'un', label: 'UN' }, { k: 'quantidade', label: 'Qtde', type: 'number' }, { k: 'valor_unit', label: 'Vlr un', type: 'money' }] }] },
        { id: 'fatura', label: 'Fatura', fields: [{ k: 'faturas', label: 'Faturas (duplicatas)', type: 'itens', col: 12, colunas: [{ k: 'numero', label: 'Duplicata' }, { k: 'vencimento', label: 'Vencimento', type: 'date' }, { k: 'valor', label: 'Valor', type: 'money' }] }] },
        { id: 'emitente', label: 'Emitente / Destinatário', fields: [
            { k: 'emitente_nome', label: 'Fornecedor (emitente)', type: 'text', req: true, col: 6 }, { k: 'emitente_cnpj', label: 'Fornecedor CNPJ', type: 'cnpj', req: true, col: 3 }, { k: 'emitente_ie', label: 'IE', type: 'text', col: 3 },
            { k: 'fantasia', label: 'Nome fantasia', type: 'text', col: 6 }, { k: 'emitente_uf', label: 'UF', type: 'uf', col: 2 }, { k: 'fornecedor_id', label: 'Fornecedor cadastrado', type: 'ref', ref: 'fornecedor', col: 4 },
            { k: 'destinatario_nome', label: 'Destinatário', type: 'text', col: 8 }, { k: 'destinatario_doc', label: 'CNPJ/CPF do destinatário', type: 'text', col: 4 }] },
        { id: 'transporte', label: 'Transporte', fields: [{ k: 'frete_modalidade', label: 'Frete (modalidade)', type: 'select', col: 6, opts: FRETE_NFE }, { k: 'transportadora', label: 'Transportadora', type: 'text', col: 6 },
            { k: 'placa', label: 'Placa do veículo', type: 'text', maxlen: 8, col: 3 }, { k: 'volumes', label: 'Volumes', type: 'number', col: 3 }] },
        { id: 'adicionais', label: 'Adicionais', fields: [{ k: '_xml', label: 'Importar XML da NF-e', type: 'arquivo', accept: '.xml,text/xml', onFile: lerXmlParaFormulario, col: 12, help: 'Preenche os campos; confira antes de salvar.' },
            { k: 'natureza_operacao', label: 'Natureza da operação', type: 'text', col: 6 }, { k: 'protocolo', label: 'Protocolo de autorização', type: 'text', col: 6 }, { k: 'observacoes', label: 'Informações complementares', type: 'textarea', col: 12, maxlen: 500 }] },
        { id: 'referencia', label: 'Referência', fields: [{ k: 'modelo', label: 'Modelo', type: 'text', col: 2, maxlen: 3 }, { k: 'nfe_referenciada', label: 'Chave da NF-e referenciada', type: 'digits', len: 44, maxlen: 44, col: 10 }] },
        { id: 'impostos', label: 'Impostos e valores', fields: [{ k: 'valor_produtos', label: 'Valor dos produtos (R$)', type: 'money', req: true, col: 3 }, { k: 'valor_frete', label: 'Frete (R$)', type: 'money', col: 3 }, { k: 'valor_total', label: 'Valor total da nota (R$)', type: 'money', col: 3, help: 'Em branco = produtos + frete.' },
            { k: 'valor_icms', label: 'ICMS (R$)', type: 'money', col: 3 }, { k: 'valor_ipi', label: 'IPI (R$)', type: 'money', col: 3 }, { k: 'valor_pis', label: 'PIS (R$)', type: 'money', col: 3 }, { k: 'valor_cofins', label: 'COFINS (R$)', type: 'money', col: 3 }] }]
});

Object.assign(CAD_DEFS.inventario, {
    estiloERP: true, tituloTela: 'Inventário do Estoque', rotuloNovo: 'Novo', textoVazio: 'Nenhum Inventário encontrado', layout: 'erp', mostrarSituacao: false,
    colunasERP: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,2fr)',
    filtrosTexto: [{ k: 'codigo', label: 'Código', larg: 'g' }, { k: 'observacoes', label: 'Observação', ph: 'Pesquise pela Observação', larg: 'g' }],
    filters: [{ k: 'situacao', label: 'Situação', opts: ['Em contagem', 'Concluído'], todos: 'Todos' }, { k: 'setor', label: 'Setor', opts: SETORES_OPS_OPTS, todos: 'Todos' }],
    corLinha: (r) => (r.situacao === 'Concluído' ? 'ok' : ''),
    columns: [{ k: 'codigo', label: 'Código', sort: true }, { k: 'data_inventario', label: 'Data Inventário', sort: true, get: (r) => (r.data_inventario ? formatDateBR(r.data_inventario) : '—') }, { k: 'setor', label: 'Setor', sort: true },
        { k: 'situacao', label: 'Situação', sort: true }, { k: 'observacoes', label: 'Observação', get: (r) => r.observacoes || '—' }],
    top: [{ k: 'codigo', label: 'Código', type: 'text', ro: true, roVazio: '0', col: 2 }, { k: 'data_inventario', label: 'Data Inventário', type: 'date', req: true, max: todayISO(), col: 3 },
        { k: 'setor', label: 'Setor de estoque', type: 'select', req: true, roEdit: true, opts: SETORES_OPS_OPTS, col: 4 }, { k: 'situacao', label: 'Situação', type: 'select', req: true, opts: ['Em contagem', 'Concluído'], col: 3 }],
    tabs: [
        { id: 'itens', label: 'Itens', fields: [{ k: 'itens', label: 'Produtos contados', type: 'itens', req: true, col: 12, semAdicionar: true, carregarRotulo: 'Carregar produtos do setor',
            carregar: (f) => { if (!f.setor) throw new Error('Escolha o setor primeiro.'); return itensInventario(f.setor); },
            colunas: [{ k: 'produto', label: 'Produto', type: 'produto' }, { k: 'quantidade_sistema', label: 'Saldo no sistema', ro: true }, { k: 'quantidade_contada', label: 'Qtd. contada', type: 'number' }] }] },
        { id: 'observacoes', label: 'Observações', fields: [{ k: 'observacoes', label: 'Observação', type: 'textarea', col: 12, maxlen: 500 }, { k: 'aplicar_ajuste', label: 'Ajuste', type: 'check', checkLabel: 'Ao concluir, baixar as faltas do estoque (lotes que vencem primeiro)', col: 12 }] }]
});

Object.assign(CAD_DEFS.nfse, {
    estiloERP: true, tituloTela: 'NFS-e', rotuloNovo: 'Nova', textoVazio: 'Nenhuma NFS-e encontrada',
    colunasERP: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1.6fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)',
    filtrosTexto: [{ k: 'numero', label: 'N° NFS-e', larg: 'p' }, { k: 'descricao_servico', label: 'Serviço', larg: 'g' }],
    filters: [{ k: 'situacao', label: 'Status', opts: ['Emitida', 'Cancelada'], todos: 'Todos' }, { k: 'fornecedor_id', label: 'Prestador', ref: 'fornecedor', todos: 'Todos' }],
    kpiERP: (todos) => ({ rotulo: 'ISS do período', valor: formatMoney(todos.filter(r => r.situacao === 'Emitida').reduce((a, r) => a + (Number(r.valor_iss) || 0), 0)), icon: 'banknote' }),
    corLinha: (r) => (r.situacao === 'Cancelada' ? 'cancelada' : '')
});
