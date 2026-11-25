// Tela "Importar XML Nota Fiscal Eletrônica (NF-e)" da Entrada de Estoque: cabeçalho da nota, abas Itens/Faturas e vínculo
// de cada item com o produto do estoque. O botão "Gerar NF-e Entrada (Pendente)" cria a entrada para conferência e lançamento.

const NATUREZAS_ENTRADA = ['Compra', 'Devolução de venda', 'Remessa em consignação', 'Transferência', 'Bonificação', 'Outras entradas'];

function renderEntradaXml() {
    const x = state.xmlImport;
    if (!x) return '<div class="at-card at-empty">Nenhum XML carregado. Use "Importar XML" na Entrada de Estoque.</div>';
    if (!cadCan(CAD_DEFS.entradanf, 'criar')) return '<div class="p-8 text-center text-red-600 font-bold text-xl">Acesso Negado</div>';
    const d = x.d;
    const ro = (rot, v, col) => `<label class="erp-campo" style="--col:${col}"><span>${rot}</span><div class="erp-ro" title="${escapeHtml(v || '')}">${escapeHtml(v || '')}</div></label>`;
    const vinculados = Object.keys(x.vinculos).length;
    const grade = 'grid-template-columns: 110px 150px minmax(220px,2.2fr) 110px 50px 90px 100px 90px 120px 90px';
    const itens = d.itens.map((i, n) => {
        const prod = x.vinculos[n] ? cadProdutoDe(x.vinculos[n]) : null;
        const total = Math.round((i.quantidade * i.valor_unit - (i.desconto || 0)) * 100) / 100;
        return `<div class="erp-tr ${prod ? 'erp-tr--ok' : ''}" style="${grade}"><span data-label="Código interno">${escapeHtml(prod ? prod.produto.barcode : '—')}</span><span data-label="Código">${escapeHtml(i.codigo)}</span><span data-label="Descrição">${escapeHtml(i.descricao)}</span>
            <span data-label="CST/CSOSN">${escapeHtml(i.cst || '—')}</span><span data-label="UN">${escapeHtml(i.un || '—')}</span><span data-label="Qtde">${i.quantidade.toLocaleString('pt-BR', { minimumFractionDigits: 3 })}</span>
            <span data-label="Vlr un">${i.valor_unit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span><span data-label="Desconto">${(i.desconto || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            <span data-label="Total c/ desc.">${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            <span class="erp-acoes"><button type="button" class="erp-ico erp-ico--azul" title="Vincular ao produto do estoque" aria-label="Vincular produto" onclick="xmlVincular(${n})">${lucideIcon('link', 'w-4 h-4')}</button>
                <button type="button" class="erp-ico" title="Detalhes do item" aria-label="Detalhes" onclick="xmlDetalheItem(${n})">${lucideIcon('eye', 'w-4 h-4')}</button></span></div>`;
    }).join('');
    const faturas = d.faturas.length ? d.faturas.map(f => `<div class="erp-tr" style="grid-template-columns: 1fr 1fr 1fr"><span data-label="Duplicata">${escapeHtml(f.numero)}</span><span data-label="Vencimento">${escapeHtml(f.vencimento ? formatDateBR(f.vencimento) : '—')}</span><span data-label="Valor">${escapeHtml(formatMoney(f.valor))}</span></div>`).join('') : '<div class="erp-vazio">A nota não traz faturas (duplicatas).</div>';

    return `
    <div class="erp-page">
        <div class="erp-bar"><div class="erp-bar__l">
            <button type="button" class="erp-ico" onclick="state.xmlImport = null; cadAbrir('entradanf'); navigateTo('CAD')" title="Voltar" aria-label="Voltar">${lucideIcon('undo-2', 'w-5 h-5')}</button>
            <button type="button" class="erp-btn erp-btn--verde" onclick="gerarEntradaDoXml()">${lucideIcon('check', 'w-4 h-4')} Gerar NF-e Entrada (Pendente)</button></div></div>
        <section class="erp-card erp-xml-cab">
            ${ro('N° NF', d.numero, 1)}${ro('Chave NF', formatChave(d.chave), 5)}${ro('Data NF', d.data_hora_emissao ? formatDateTimeBR(d.data_hora_emissao) : formatDateBR(d.data_emissao), 2)}${ro('Série NF', d.serie, 1)}${ro('Modelo NF', d.modelo === '55' ? 'NotaFiscalEletrônica' : d.modelo, 3)}
            ${ro('Fornecedor', d.emitente_nome, 5)}${ro('Nome Fantasia', d.fantasia, 3)}${ro('UF', d.emitente_uf, 1)}${ro('Fornecedor CNPJ', formatCNPJ(d.emitente_cnpj), 3)}
            <label class="erp-campo" style="--col:4"><span>Natureza da Operação</span><select class="erp-input erp-select" onchange="state.xmlImport.natureza = this.value">${NATUREZAS_ENTRADA.map(n => `<option ${x.natureza === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
            <div class="erp-campo" style="--col:4;justify-content:flex-end"><button type="button" class="erp-btn erp-btn--vermelho" onclick="xmlRemoverVinculos()">${lucideIcon('trash-2', 'w-4 h-4')} Remover Todos Vínculos</button></div>
            <div class="erp-campo" style="--col:4;justify-content:flex-end"><span class="at-hint">${vinculados} de ${d.itens.length} item(ns) vinculado(s) ao estoque · Valor da nota: <strong>${escapeHtml(formatMoney(d.valor_total))}</strong></span></div>
        </section>
        <nav class="erp-abas"><button type="button" class="erp-aba ${x.aba === 'itens' ? 'is-active' : ''}" onclick="state.xmlImport.aba = 'itens'; render()">Itens</button><button type="button" class="erp-aba ${x.aba === 'faturas' ? 'is-active' : ''}" onclick="state.xmlImport.aba = 'faturas'; render()">Faturas</button></nav>
        <section class="erp-card" style="padding:14px"><div class="erp-scroll"><div class="erp-tabela erp-tabela--larga">
            ${x.aba === 'faturas' ? `<div class="erp-th" style="grid-template-columns: 1fr 1fr 1fr"><span>Duplicata</span><span>Vencimento</span><span>Valor</span></div>${faturas}`
                : `<div class="erp-th" style="${grade}"><span>Código Interno</span><span>Código</span><span>Descrição</span><span>CST/CSOSN</span><span>UN</span><span>Qtde</span><span>Vlr Un</span><span>Desconto</span><span>Total C/ Desc</span><span>Ações</span></div>${itens}`}
        </div></div></section>
    </div>`;
}

function xmlRemoverVinculos() { state.xmlImport.vinculos = {}; render(); }

function xmlVincular(n) {
    const x = state.xmlImport;
    const i = x.d.itens[n];
    const ops = cadProdutosOpcoes();
    const d = hModal(`Vincular item: ${i.descricao}`, `
        <p class="at-hint">Escolha o produto do estoque que corresponde a este item da nota (código do fornecedor: <strong>${escapeHtml(i.codigo)}</strong>).</p>
        <div class="at-field"><label class="at-label" for="xv_prod">Produto do estoque</label>
            <select class="at-select" id="xv_prod"><option value="">Sem vínculo</option>${ops.map(o => `<option value="${escapeHtml(o.id)}" ${x.vinculos[n] === o.id ? 'selected' : ''}>${escapeHtml(o.rotulo)}</option>`).join('')}</select></div>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--primary" id="xv_ok">Salvar vínculo</button></div>`, 'md');
    d.querySelector('#xv_ok').onclick = () => { const v = d.querySelector('#xv_prod').value; if (v) x.vinculos[n] = v; else delete x.vinculos[n]; d.close(); render(); };
}

function xmlDetalheItem(n) {
    const i = state.xmlImport.d.itens[n];
    hModal(`Item ${n + 1}`, `<dl class="about-list">${[['Código', i.codigo], ['Descrição', i.descricao], ['NCM', i.ncm], ['CFOP', i.cfop], ['CST/CSOSN', i.cst], ['Unidade', i.un], ['Quantidade', i.quantidade], ['Lote', i.lote || '—'], ['Fabricação', i.fabricacao ? formatDateBR(i.fabricacao) : '—'], ['Validade', i.validade ? formatDateBR(i.validade) : '—'], ['Valor unitário', formatMoney(i.valor_unit)], ['Desconto', formatMoney(i.desconto || 0)]].map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v || '—')}</dd></div>`).join('')}</dl>`, 'md');
}
