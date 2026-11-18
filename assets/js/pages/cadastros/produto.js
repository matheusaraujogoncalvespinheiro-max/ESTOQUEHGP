// Cadastro de Produtos (referência do padrão): bloco de identificação + quatro abas
// (Dados, Adicionais, Movimentação, Dados Completos de OPME).
//
// Reaproveita os dados que já existem: produto = documento da coleção `products` (+ lotes em `product_batches`).
// Campos novos ficam em `cadastro` no mesmo documento. O SALDO nunca é editado aqui: vem dos lotes e só muda
// por movimentação (Adicionar Estoque, saídas, transferências, Correção OPME).

const SETORES_PRODUTO = ['OPME', 'HEMODINAMICA', 'CENTRO_CIRURGICO'];
const rotuloSetor = (s) => ({ OPME: 'OPME', HEMODINAMICA: 'Hemodinâmica', CENTRO_CIRURGICO: 'Centro Cirúrgico' }[s] || s);

const produtoAtivo = (p) => !p || !p.cadastro || p.cadastro.ativo !== false;
const produtoEhOpme = (p, setor) => (p.cadastro && p.cadastro.eh_opme !== undefined ? Boolean(p.cadastro.eh_opme) : setor === 'OPME');

const CAD_SIM_NAO = [{ id: '1', rotulo: 'Ativo' }, { id: '0', rotulo: 'Inativo' }];

Object.assign(CAD_DEFS.produto, {
    colecao: 'products',
    sensivel: false,
    semSitForm: true,
    // Bloco superior: identificação e informações principais
    top: [
        { k: 'codigo', label: 'Código Interno', type: 'text', req: true, roEdit: true, maxlen: 40, help: 'Código de barras / identificador único no setor. Não muda depois de salvo.' },
        { k: 'codigo_fabricante', label: 'Código do Fabricante', type: 'text', maxlen: 40 },
        { k: 'nome', label: 'Nome do Produto', type: 'upper', req: true, maxlen: 120 },
        { k: 'custo', label: 'Valor de Custo (R$)', type: 'money' },
        { k: 'ativo_sel', label: 'Situação', type: 'select', opts: CAD_SIM_NAO, req: true },
        { k: 'estoque', label: 'Estoque Atual', type: 'text', ro: true, help: 'Saldo real dos lotes. Só muda por movimentação.' }
    ],
    kpisExtra: (todos) => [
        { rotulo: 'Abaixo do mínimo', valor: todos.filter(r => r.estoque_situacao === 'baixo').length },
        { rotulo: 'Com lote vencido', valor: todos.filter(r => r.lotes_vencidos > 0).length }
    ],
    tabs: [
        { id: 'dados', label: 'Dados', fields: [
            { k: 'descricao', label: 'Descrição', type: 'upper', req: true, span2: true, maxlen: 200 },
            { k: 'setor', label: 'Setor de estoque', type: 'select', req: true, roEdit: true, opts: () => SETORES_PRODUTO.filter(s => hasPermission('register', s)).map(s => ({ id: s, rotulo: rotuloSetor(s) })) },
            { k: 'categoria', label: 'Categoria', type: 'select', opts: ['Material médico-hospitalar', 'Medicamento', 'OPME', 'Material de escritório', 'Outros'] },
            { k: 'classe_id', label: 'Classe', type: 'ref', ref: 'classe' },
            { k: 'grupo_id', label: 'Grupo', type: 'ref', ref: 'grupo', dep: 'classe_id', depField: 'classe_id' },
            { k: 'subgrupo_id', label: 'Sub-Grupo', type: 'ref', ref: 'subgrupo', dep: 'grupo_id', depField: 'grupo_id' },
            { k: 'fabricante_id', label: 'Fabricante', type: 'ref', ref: 'fabricante' },
            { k: 'marca', label: 'Marca', type: 'upper' },
            { k: 'unidade_id', label: 'Unidade de medida', type: 'ref', ref: 'unidade' },
            { k: 'min', label: 'Estoque mínimo', type: 'number', req: true, help: 'Abaixo (ou igual) a este saldo o produto aparece como estoque baixo.' },
            { k: 'max', label: 'Estoque máximo', type: 'number' },
            { k: 'localizacao', label: 'Localização de armazenamento', type: 'text', ph: 'Ex.: Prateleira B2' },
            { k: 'eh_opme', label: 'Classificação', type: 'check', checkLabel: 'É OPME (órtese, prótese ou material especial)', rerender: true, span2: true,
                help: 'Habilita a aba "OPME" (depois de salvar). Produtos comuns não preenchem dados de OPME.' }
        ] },
        { id: 'adicionais', label: 'Adicionais', fields: [
            { k: 'desc_complementar', label: 'Descrição complementar', type: 'textarea', span2: true },
            { k: 'especificacoes', label: 'Especificações técnicas', type: 'textarea', span2: true },
            { k: 'referencias', label: 'Referências adicionais', type: 'text', span2: true },
            { k: 'remessa', label: 'Processo (padrão)', type: 'text', help: 'Processo de compra padrão deste produto, quando houver.' },
            { k: 'armazenamento', label: 'Dados de armazenamento', type: 'text', ph: 'Ex.: ambiente seco, abaixo de 25 °C' },
            { k: 'controle', label: 'Informações de controle', type: 'text' },
            { k: 'documentacao', label: 'Documentação relacionada', type: 'text', ph: 'Ex.: nº do processo, instrução de uso' },
            { k: 'observacoes', label: 'Observações', type: 'textarea', span2: true }
        ] },
        { id: 'configuracao', label: 'Configuração', render: (def, st, ro) => renderProdutoConfiguracao(def, st, ro), fields: [] },
        { id: 'movimentacao', label: 'Movimentação', render: (def, st) => renderProdutoMovimentacao(st), hide: (f) => !f.__existente },
        { id: 'opme', label: 'OPME', hide: (f) => !f.__existente, show: (f) => Boolean(f.eh_opme), hintOff: 'Marque "É OPME" na aba Dados para habilitar.', fields: [
            { k: 'opme_classificacao', label: 'Classificação do material', type: 'select', opts: ['Órtese', 'Prótese', 'Material especial', 'Material de uso único'] },
            { k: 'opme_tipo_material', label: 'Tipo de material', type: 'select', opts: ['Próprio', 'Consignado'] },
            { k: 'opme_registro_anvisa', label: 'Registro ANVISA', type: 'text', maxlen: 20, help: 'Número de registro ou notificação.' },
            { k: 'opme_fornecedor_id', label: 'Fornecedor', type: 'ref', ref: 'fornecedor' },
            { k: 'opme_referencia', label: 'Referência do fabricante', type: 'text' },
            { k: 'opme_modelo', label: 'Modelo', type: 'text' },
            { k: 'opme_unidade_fornecimento', label: 'Unidade de fornecimento', type: 'text', ph: 'Ex.: unidade, kit' },
            { k: 'opme_descricao_tecnica', label: 'Descrição técnica', type: 'textarea', span2: true },
            { k: 'opme_caracteristicas', label: 'Características específicas', type: 'textarea', span2: true },
            { k: 'opme_controle_lote', label: 'Controle por lote', type: 'check', checkLabel: 'Exige lote' },
            { k: 'opme_controle_validade', label: 'Controle de validade', type: 'check', checkLabel: 'Exige validade' },
            { k: 'opme_controle_serie', label: 'Número de série', type: 'check', checkLabel: 'Exige número de série' },
            { k: 'opme_rastreabilidade', label: 'Informações de rastreabilidade', type: 'textarea', span2: true, ph: 'Como o item é rastreado até o paciente (etiqueta, nota fiscal, etc.)' },
            { k: 'opme_armazenamento', label: 'Condição de armazenamento', type: 'text' },
            { k: 'opme_complementares', label: 'Informações complementares', type: 'textarea', span2: true }
        ] }
    ]
});

// ---------------------------------------------------------------- aba Configuração (opções do produto)

// Opções em caixas de marcação, cada uma com um "i" que explica o que ela significa.
const PRODUTO_OPCOES = [
    { k: 'listar_inventario', label: 'Listar no Inventário', padrao: true, info: 'O produto entra na contagem periódica de estoque (inventário).' },
    { k: 'usa_lote', label: 'Usa Lote', info: 'O produto é controlado por lote: toda entrada e saída identifica o lote.' },
    { k: 'usa_validade', label: 'Controla Validade', info: 'O produto tem prazo de validade. Lotes vencidos são bloqueados para saída.' },
    { k: 'usa_serie', label: 'Usa Número de Série', info: 'Cada unidade tem número de série próprio e deve ser registrado na entrada e na saída.' },
    { k: 'usa_kit', label: 'Usa Kit', info: 'O produto é um kit composto por outros itens.' },
    { k: 'usa_multipla_embalagem', label: 'Usa Múltipla Embalagem', info: 'O produto é recebido em mais de uma embalagem (ex.: caixa e unidade).' },
    { k: 'usa_conferencia', label: 'Exige Conferência', info: 'A entrada ou a saída deve ser conferida por um segundo responsável.' },
    { k: 'fracionado', label: 'Permite Fracionar', info: 'Aceita quantidade fracionada (ex.: meia unidade, mililitros).' },
    { k: 'altera_descricao', label: 'Alterar Descrição', info: 'Permite que a descrição seja ajustada no uso (ex.: em laudos e pedidos).' },
    { k: 'altera_valor', label: 'Alterar Valor', info: 'Permite que o valor de custo seja ajustado na compra ou na entrada.' }
];

// Três colunas, como no modelo: cada coluna reúne opções do mesmo assunto
const PRODUTO_COLUNAS = [
    ['listar_inventario', 'altera_descricao', 'altera_valor', 'fracionado'],
    ['usa_lote', 'usa_validade', 'usa_serie', 'usa_conferencia'],
    ['usa_kit', 'usa_multipla_embalagem']
];

function renderProdutoConfiguracao(def, st, readonly) {
    const cartao = (k) => {
        const o = PRODUTO_OPCOES.find(x => x.k === k);
        const id = `cad_cfg_${o.k}`;
        return `<div class="cd-opt">
            <label class="cd-opt__main" for="${id}">
                <input type="checkbox" id="${id}" ${st.form['cfg_' + o.k] ? 'checked' : ''} ${readonly ? 'disabled' : ''} onchange="cadCampo('cfg_${o.k}', this)" data-keep="${id}">
                <span>${escapeHtml(o.label)}</span>
            </label>
            <button type="button" class="cd-opt__info" title="${escapeHtml(o.info)}" aria-label="${escapeHtml(o.label)}: ${escapeHtml(o.info)}" onclick="showMsg(${escapeHtml(JSON.stringify(o.info))})">${lucideIcon('info', 'w-4 h-4')}</button>
        </div>`;
    };
    return `<div class="cd-optcols">${PRODUTO_COLUNAS.map(col => `<div class="cd-optcol">${col.map(cartao).join('')}</div>`).join('')}</div>`;
}

// ---------------------------------------------------------------- linhas e leitura

function produtoSetorDe(p) { return SETORES_PRODUTO.find(s => (MOCK_DATA[s] || []).includes(p)); }

function produtoRow(p, setor) {
    const c = p.cadastro || {};
    const lotes = p.lotes || [];
    const estoque = Number(p.qtd) || 0;
    return {
        id: `${p.barcode}_${setor}`, codigo: p.barcode, codigo_fabricante: c.codigo_fabricante || '', nome: p.material, descricao: p.descricao, fabricante: p.empresa || '', marca: p.marca || '',
        setor, estoque, min: p.min ?? 0, max: c.max ?? '', ativo: c.ativo !== false,
        tipo: produtoEhOpme(p, setor) ? 'OPME' : 'Comum',
        classe_id: c.classe_id || '', grupo_id: c.grupo_id || '', subgrupo_id: c.subgrupo_id || '', fabricante_id: c.fabricante_id || '', unidade_id: c.unidade_id || '',
        estoque_situacao: estoque <= 0 ? 'zerado' : (estoque <= Number(p.min || 0) ? 'baixo' : 'ok'),
        lote: lotes.map(l => l.lote).join(' '),
        lotes_vencidos: lotes.filter(l => l.quantidade > 0 && loteVencido(l)).length,
        _p: p
    };
}

function produtoRows() {
    return SETORES_PRODUTO.flatMap(s => (MOCK_DATA[s] || []).map(p => produtoRow(p, s)));
}

// ---------------------------------------------------------------- movimentações (registros reais do sistema)

function parseDataHora(data, hora) {
    if (!data) return 0;
    let iso = String(data);
    const m = iso.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) iso = `${m[3]}-${m[2]}-${m[1]}`;
    const t = new Date(`${iso.slice(0, 10)}T${(hora || '00:00').slice(0, 5)}:00`).getTime();
    return isNaN(t) ? 0 : t;
}

/** Junta entradas, saídas e transferências do produto (setor + código) a partir dos históricos e laudos. */
function produtoMovimentos(codigo, setor) {
    const mov = [];
    (MOCK_DATA.PRODUCT_HISTORY || []).forEach(h => {
        if (h.barcode !== codigo || (h.sector || h.setor) !== setor) return;
        const qtd = Number(h.quantity ?? h.qty ?? 0);
        const acao = h.action || '';
        const saida = acao === 'CONSU_SALA';
        mov.push({ ts: parseDataHora(h.date, h.time), tipo: saida ? 'SAIDA' : 'ENTRADA', rotulo: acao === 'CADASTRO' ? 'Cadastro / entrada inicial' : (saida ? 'Consumo em sala' : 'Entrada de estoque'),
            delta: saida ? -qtd : qtd, qtd, lote: h.batch ?? h.batch_code ?? '', validade: '', origem: saida ? rotuloSetor(setor) : 'Entrada', destino: saida ? 'Sala de procedimento' : rotuloSetor(setor),
            setor: rotuloSetor(setor), usuario: h.user ?? h.user_name ?? '', paciente: '', fornecedor: '', obs: '' });
    });
    (MOCK_DATA.TRANSFER_HISTORY || []).forEach(t => {
        if (t.barcode !== codigo || (t.origem !== setor && t.destino !== setor)) return;
        const saiu = t.origem === setor;
        mov.push({ ts: parseDataHora(t.data, t.hora), tipo: 'TRANSFERENCIA', rotulo: saiu ? 'Transferência enviada' : 'Transferência recebida', delta: saiu ? -Number(t.quantidade || 0) : Number(t.quantidade || 0),
            qtd: Number(t.quantidade || 0), lote: Array.isArray(t.lotes) ? t.lotes.join(', ') : '', validade: '', origem: rotuloSetor(t.origem), destino: rotuloSetor(t.destino),
            setor: rotuloSetor(setor), usuario: t.usuario || '', paciente: '', fornecedor: '', obs: '' });
    });
    (MOCK_DATA.LAUDOS || []).forEach(l => {
        if (l.setor !== setor) return;
        (l.itens_opme || []).filter(i => i.barcode === codigo).forEach(i => {
            mov.push({ ts: parseDataHora(l.data, l.hora), tipo: 'SAIDA', rotulo: 'Saída por laudo', delta: -Number(i.quantidade || 0), qtd: Number(i.quantidade || 0), lote: i.lote || '', validade: i.validade || '',
                origem: rotuloSetor(setor), destino: 'Paciente', setor: rotuloSetor(setor), usuario: l.usuario || '', paciente: l.paciente || '', obs: l.procedimento || '' });
        });
    });
    mov.sort((a, b) => b.ts - a.ts);
    return mov;
}

/** Saldo anterior/posterior reconstruído a partir do saldo atual, andando para trás pelo histórico. */
function produtoComSaldos(mov, saldoAtual) {
    let posterior = saldoAtual;
    return mov.map(m => { const anterior = posterior - m.delta; const r = { ...m, anterior, posterior }; posterior = anterior; return r; });
}

function movState() {
    const st = cadState();
    if (!st.mov) st.mov = { de: '', ate: '', tipo: '', setor: '', resp: '', lote: '' };
    return st.mov;
}
function movFiltro(k, v) { movState()[k] = v; render(); }
function movLimpar() { cadState().mov = null; renderFresh(); }

function renderProdutoMovimentacao(st) {
    const id = st.id;
    const row = produtoRows().find(r => r.id === id);
    if (!row) return '<div class="at-empty">Salve o produto para ver as movimentações.</div>';
    const F = movState();
    let mov = produtoComSaldos(produtoMovimentos(row.codigo, row.setor), row.estoque);
    const dia = (ts) => new Date(ts).toISOString().slice(0, 10);
    if (F.de) mov = mov.filter(m => m.ts && dia(m.ts) >= F.de);
    if (F.ate) mov = mov.filter(m => m.ts && dia(m.ts) <= F.ate);
    if (F.tipo) mov = mov.filter(m => m.tipo === F.tipo);
    if (F.setor) mov = mov.filter(m => m.setor === F.setor || m.origem === F.setor || m.destino === F.setor);
    if (F.resp) mov = mov.filter(m => searchKey(m.usuario).includes(searchKey(F.resp)));
    if (F.lote) mov = mov.filter(m => searchKey(m.lote).includes(searchKey(F.lote)));
    const p = row._p;
    const lotes = (p.lotes || []);
    const campo = (rot, ctl) => `<div class="cd-filter"><span>${rot}</span>${ctl}</div>`;
    return `
    <div class="at-stack">
        <div>
            <h3 class="at-label" style="margin:0 0 8px">Saldo por lote (rastreabilidade)</h3>
            ${lotes.length ? `<div class="cd-tablewrap"><table class="tri-table cd-table"><thead><tr><th>Lote</th><th>Validade</th><th>Quantidade</th><th>Entrada</th><th>Situação do lote</th></tr></thead><tbody>
                ${lotes.map(l => `<tr><td data-label="Lote">${escapeHtml(l.lote)}</td><td data-label="Validade">${l.validade && l.validade !== 'N/A' ? formatDateBR(l.validade) : 'Sem validade'}</td><td data-label="Quantidade">${l.quantidade}</td>
                    <td data-label="Entrada">${l.data_entrada ? formatDateBR(l.data_entrada) : '—'}</td>
                    <td data-label="Situação do lote">${statusValidade(l.validade) === 'VENCIDO' ? '<span class="at-badge at-badge--emergencia">Vencido</span>' : (statusValidade(l.validade) === 'A_VENCER' ? '<span class="at-badge at-badge--urgente">A vencer</span>' : '<span class="at-badge at-badge--ok">Válido</span>')}</td></tr>`).join('')}
            </tbody></table></div>` : '<div class="at-empty">Sem lotes com saldo. Use "Adicionar Estoque" para dar entrada.</div>'}
        </div>

        <div class="cd-filters cd-filters--inner">
            ${campo('De', `<input class="at-input" type="date" value="${F.de}" onchange="movFiltro('de', this.value)" data-keep="mv_de">`)}
            ${campo('Até', `<input class="at-input" type="date" value="${F.ate}" onchange="movFiltro('ate', this.value)" data-keep="mv_ate">`)}
            ${campo('Tipo', cadComboHtml({ id: 'mv_tipo', valor: F.tipo, opts: [{ id: 'ENTRADA', rotulo: 'Entrada' }, { id: 'SAIDA', rotulo: 'Saída' }, { id: 'TRANSFERENCIA', rotulo: 'Transferência' }], vazio: 'Todos', placeholder: 'Todos', fn: 'movFiltro', arg: 'tipo' }))}
            ${campo('Setor', cadComboHtml({ id: 'mv_setor', valor: F.setor, opts: SETORES_PRODUTO.map(x => ({ id: rotuloSetor(x), rotulo: rotuloSetor(x) })), vazio: 'Todos', placeholder: 'Todos', fn: 'movFiltro', arg: 'setor' }))}
            ${campo('Responsável', `<input class="at-input" type="search" value="${escapeHtml(F.resp)}" oninput="movFiltro('resp', this.value)" data-keep="mv_resp">`)}
            ${campo('Lote', `<input class="at-input" type="search" value="${escapeHtml(F.lote)}" oninput="movFiltro('lote', this.value)" data-keep="mv_lote">`)}
            <button type="button" class="at-btn at-btn--ghost at-btn--sm cd-clear" onclick="movLimpar()">${lucideIcon('eraser', 'w-4 h-4')} Limpar</button>
        </div>

        <div class="cd-tablewrap"><table class="tri-table cd-table"><thead><tr>
            <th>Data e hora</th><th>Tipo</th><th>Quantidade</th><th>Saldo anterior</th><th>Saldo posterior</th><th>Origem → destino</th><th>Lote</th><th>Responsável</th><th>Paciente / procedimento</th></tr></thead>
            <tbody>${mov.length ? mov.map(m => `<tr>
                <td data-label="Data e hora">${m.ts ? escapeHtml(formatDateTimeBR(new Date(m.ts).toISOString())) : '—'}</td>
                <td data-label="Tipo"><span class="at-badge ${m.delta < 0 ? 'at-badge--urgente' : 'at-badge--ok'}">${escapeHtml(m.rotulo)}</span></td>
                <td data-label="Quantidade">${m.delta > 0 ? '+' : ''}${m.delta}</td>
                <td data-label="Saldo anterior">${m.anterior < 0 ? '—' : m.anterior}</td><td data-label="Saldo posterior">${m.posterior < 0 ? '—' : m.posterior}</td>
                <td data-label="Origem → destino">${escapeHtml(m.origem)} → ${escapeHtml(m.destino)}</td>
                <td data-label="Lote">${escapeHtml(m.lote || '—')}</td><td data-label="Responsável">${escapeHtml(m.usuario || '—')}</td>
                <td data-label="Paciente / procedimento">${escapeHtml([m.paciente, m.obs].filter(Boolean).join(' · ') || '—')}</td></tr>`).join('')
                : '<tr><td colspan="9" class="at-empty">Nenhuma movimentação registrada para este produto.</td></tr>'}</tbody></table></div>
        <p class="at-hint">O histórico é somente leitura. Os saldos anterior e posterior são calculados a partir do saldo atual e dos registros disponíveis; correções devem usar os fluxos de ajuste autorizados (Adicionar Estoque, Correção OPME), que mantêm a auditoria.</p>
    </div>`;
}

// ---------------------------------------------------------------- store do produto

CAD_STORES.produto = {
    watch: () => {},
    rows: () => produtoRows(),
    defaults: () => ({ cfg_listar_inventario: true, estoque: '0 un', ativo_sel: '1', min: '5', eh_opme: false, setor: SETORES_PRODUTO.find(s => hasPermission('register', s)) || 'OPME' }),
    toForm(def, r) {
        const p = r._p, c = p.cadastro || {};
        const f = { __existente: true, ativo: r.ativo, ativo_sel: r.ativo ? '1' : '0', codigo: p.barcode, codigo_fabricante: c.codigo_fabricante || '', nome: p.material || '', custo: c.custo ?? '', estoque: `${r.estoque} un`,
            descricao: p.descricao || '', setor: r.setor, categoria: c.categoria || '', classe_id: c.classe_id || '', grupo_id: c.grupo_id || '', subgrupo_id: c.subgrupo_id || '', fabricante_id: c.fabricante_id || '',
            marca: p.marca || '', unidade_id: c.unidade_id || '', min: p.min ?? '', max: c.max ?? '', localizacao: c.localizacao || '', eh_opme: produtoEhOpme(p, r.setor), remessa: p.remessa || '' };
        ['desc_complementar', 'especificacoes', 'referencias', 'armazenamento', 'controle', 'documentacao', 'observacoes'].forEach(k => { f[k] = (c.adicionais || {})[k] || ''; });
        Object.entries(c.opme || {}).forEach(([k, v]) => { f['opme_' + k] = v; });
        PRODUTO_OPCOES.forEach(o => { f['cfg_' + o.k] = (c.config || {})[o.k] ?? Boolean(o.padrao); });
        return f;
    },
    async save(def, form, id) {
        requirePermission_cad(def, id ? 'editar' : 'criar');
        const setor = form.setor;
        if (!SETORES_PRODUTO.includes(setor)) throw new Error('Selecione o setor de estoque.');
        if (!hasPermission('register', setor)) throw new Error('Seu perfil não pode cadastrar produtos neste setor.');
        const ehOpme = Boolean(form.eh_opme);
        if (ehOpme && !form.fabricante_id) throw new Error('Produtos OPME exigem o fabricante (aba Dados).');
        if (form.max && Number(form.max) < Number(form.min || 0)) throw new Error('O estoque máximo não pode ser menor que o mínimo.');
        const ativo = form.ativo_sel !== '0';

        let p = null;
        let atual = null;
        if (id) {
            atual = produtoRows().find(r => r.id === id);
            if (!atual) throw new Error('Produto não encontrado.');
            p = atual._p;
            if (!ativo && Number(p.qtd) > 0) throw new Error(`Não é possível inativar: o produto ainda tem ${p.qtd} un em estoque. Dê baixa ou transfira o saldo primeiro.`);
        } else {
            const codigo = String(form.codigo).trim();
            if ((MOCK_DATA[setor] || []).some(x => x.barcode === codigo)) throw new Error('Já existe um produto com este código interno neste setor.');
        }

        const fab = form.fabricante_id ? cadRowsOf('fabricante').find(f => f.id === form.fabricante_id) : null;
        const num = (v) => (v === '' || v === undefined || v === null ? '' : Number(v));
        const cadastro = {
            ...(p && p.cadastro ? p.cadastro : {}),
            ativo, eh_opme: ehOpme, codigo_fabricante: String(form.codigo_fabricante ?? '').trim(), custo: num(form.custo),
            categoria: form.categoria || '', classe_id: form.classe_id || '', grupo_id: form.grupo_id || '', subgrupo_id: form.subgrupo_id || '', fabricante_id: form.fabricante_id || '', unidade_id: form.unidade_id || '',
            max: num(form.max), localizacao: String(form.localizacao ?? '').trim(),
            adicionais: {}, opme: {}, config: {}
        };
        PRODUTO_OPCOES.forEach(o => { cadastro.config[o.k] = Boolean(form['cfg_' + o.k]); });
        ['desc_complementar', 'especificacoes', 'referencias', 'armazenamento', 'controle', 'documentacao', 'observacoes'].forEach(k => { cadastro.adicionais[k] = String(form[k] ?? '').trim(); });
        if (ehOpme) {
            Object.keys(form).filter(k => k.startsWith('opme_')).forEach(k => {
                const v = form[k];
                cadastro.opme[k.slice(5)] = typeof v === 'string' ? v.trim() : v;
            });
        } else if (p && p.cadastro && p.cadastro.opme) cadastro.opme = p.cadastro.opme; // preserva o que já havia

        const antesResumo = p ? { nome: p.material, descricao: p.descricao, min: p.min, ativo: produtoAtivo(p), fabricante: p.empresa } : null;
        const campos = {
            material: String(form.nome).trim().toUpperCase(),
            descricao: String(form.descricao).trim().toUpperCase(),
            empresa: fab ? fab.nome : (p ? p.empresa : 'NÃO INFORMADO'),
            marca: String(form.marca ?? '').trim().toUpperCase(),
            remessa: String(form.remessa ?? '').trim(),
            min: Number(form.min) || 0
        };

        if (p) {
            Object.assign(p, campos, { cadastro }); // qtd e lotes NÃO são tocados
        } else {
            p = { id: Date.now(), barcode: String(form.codigo).trim(), ...campos, qtd: 0, lotes: [], cadastro };
        }
        const salvo = await db_saveProduct(p, setor);
        if (!salvo) throw new Error('Não foi possível gravar o produto no banco de dados.');
        // db_saveProduct não grava a remessa: usa o mesmo documento
        try { await db.collection('products').doc(salvo.id).set({ remessa: campos.remessa }, { merge: true }); } catch (e) { console.warn(e); }
        p.id = salvo.id;
        if (!id) {
            if (!(MOCK_DATA[setor] || []).some(x => x.barcode === p.barcode)) MOCK_DATA[setor].push(p);
            logEntryHistory('CADASTRO', setor, p.barcode, p.material, 0, '');
            await auditar({ entidade: 'produto', entidade_id: salvo.id, acao: 'CRIAR', depois: { codigo: p.barcode, nome: p.material, setor } });
        } else {
            const depois = { nome: p.material, descricao: p.descricao, min: p.min, ativo, fabricante: p.empresa };
            const d = diffCampos(antesResumo, depois, Object.keys(depois));
            await auditar({ entidade: 'produto', entidade_id: salvo.id, acao: 'EDITAR', antes: d.antes, depois: d.depois });
        }
        saveToLocalStorage();
        return p;
    },
    async setAtivo(def, id, ativo) {
        requirePermission_cad(def, 'inativar');
        const r = produtoRows().find(x => x.id === id);
        if (!r) throw new Error('Produto não encontrado.');
        if (!ativo && r.estoque > 0) throw new Error(`Não é possível inativar: o produto ainda tem ${r.estoque} un em estoque.`);
        r._p.cadastro = { ...(r._p.cadastro || {}), ativo };
        const salvo = await db_saveProduct(r._p, r.setor);
        if (!salvo) throw new Error('Não foi possível gravar a situação do produto.');
        saveToLocalStorage();
        await auditar({ entidade: 'produto', entidade_id: salvo.id, acao: ativo ? 'ATIVAR' : 'INATIVAR' });
    }
};
