// Consulta no estilo "ERP" (telas fiscais): barra de ícones e botões coloridos, filtros em linha com botão Pesquisar,
// cartão de total, legenda, linhas em formato de pílula e rodapé "Mostrando de X a Y do total: N".
// Ativada por `estiloERP: true` na definição da entidade (veja data/cadastros-fiscal.js). Os dados e as regras são os mesmos da consulta padrão.

function cadTxt(k, v) {
    const L = cadList(cadDef());
    L.txt = L.txt || {};
    L.txt[k] = v;
    L.page = 1;
    clearTimeout(cadTxt.t);
    cadTxt.t = setTimeout(render, 250);
}

function renderCadListaERP(def) {
    const L = cadList(def);
    L.txt = L.txt || {};
    if (L.size === 10) L.size = 20;
    const todos = cadStoreOf(def).rows(def);
    const rows = cadFiltrar(def);
    const total = rows.length;
    const paginas = Math.max(1, Math.ceil(total / L.size));
    if (L.page > paginas) L.page = paginas;
    const ini = total ? (L.page - 1) * L.size : 0;
    const pagina = rows.slice(ini, ini + L.size);
    const podeCriar = cadCan(def, 'criar');
    const grade = `grid-template-columns: ${def.colunasERP || def.columns.map(() => 'minmax(0,1fr)').join(' ')}`;
    const kpi = def.kpiERP ? def.kpiERP(todos) : null;

    const botao = (b) => `<button type="button" class="erp-btn erp-btn--${b.cor || 'azul'}" onclick="${b.fn}()">${lucideIcon(b.icon || 'file', 'w-4 h-4')} ${escapeHtml(b.rotulo)}</button>`;
    const campoTxt = (f) => `<label class="erp-campo erp-campo--${f.larg || 'm'}"><span>${escapeHtml(f.label)}</span><input class="erp-input" type="text" value="${escapeHtml(L.txt[f.k] || '')}" placeholder="${escapeHtml(f.ph || f.label)}" oninput="cadTxt('${f.k}', this.value)" data-keep="erp_${f.k}" autocomplete="off"></label>`;
    const campoSel = (f) => {
        const opts = f.ref ? cadRowsOf(f.ref).filter(r => r.ativo).map(r => ({ id: r.id, rotulo: CAD_DEFS[f.ref].rotulo(r) })) : cadOptsOf(f);
        return `<label class="erp-campo"><span>${escapeHtml(f.label)}</span><select class="erp-input erp-select" onchange="cadFiltro('${f.k}', this.value)" data-keep="erp_s_${f.k}"><option value="">${escapeHtml(f.todos || '-- Selecione --')}</option>${opts.map(o => `<option value="${escapeHtml(cadOptId(o))}" ${L.filtros[f.k] === cadOptId(o) ? 'selected' : ''}>${escapeHtml(cadOptRotulo(o))}</option>`).join('')}</select></label>`;
    };

    return `
    <div class="erp-page">
        <div class="erp-bar">
            <div class="erp-bar__l">
                <button type="button" class="erp-ico" onclick="navigateTo('DASHBOARD')" title="Voltar" aria-label="Voltar">${lucideIcon('undo-2', 'w-5 h-5')}</button>
                <button type="button" class="erp-ico" onclick="cadLimpar()" title="Limpar filtros" aria-label="Limpar filtros">${lucideIcon('sliders-horizontal', 'w-5 h-5')}</button>
                <button type="button" class="erp-ico" onclick="cadImprimir()" title="Imprimir" aria-label="Imprimir">${lucideIcon('printer', 'w-5 h-5')}</button>
                ${(def.botoesLista || []).filter(b => !b.direita && (!b.perm || cadCan(def, b.perm))).map(botao).join('')}
                ${podeCriar ? `<button type="button" class="erp-btn erp-btn--verde" onclick="cadNovo()">${lucideIcon('plus', 'w-4 h-4')} ${escapeHtml(def.rotuloNovo || 'Novo')}</button>` : ''}
            </div>
            <div class="erp-bar__r">${(def.botoesLista || []).filter(b => b.direita).map(botao).join('')}</div>
        </div>

        <div class="erp-top">
            <section class="erp-card erp-filtros" aria-label="Filtros">
                ${(def.filtrosTexto || []).map(campoTxt).join('')}
                ${(def.filters || []).map(campoSel).join('')}
                ${def.mostrarSituacao ? `<label class="erp-campo"><span>Visualizar</span><select class="erp-input erp-select" onchange="cadSituacao(this.value)" data-keep="erp_sit"><option value="ativos" ${L.situacao === 'ativos' ? 'selected' : ''}>Ativos</option><option value="inativos" ${L.situacao === 'inativos' ? 'selected' : ''}>Inativos</option><option value="todos" ${L.situacao === 'todos' ? 'selected' : ''}>Todos</option></select></label>` : ''}
                <button type="button" class="erp-btn erp-btn--azul erp-btn--pesq" onclick="render()">${lucideIcon('search', 'w-4 h-4')} Pesquisar</button>
            </section>
            ${kpi ? `<section class="erp-card erp-kpi"><span>${escapeHtml(kpi.rotulo)}</span><strong>${lucideIcon(kpi.icon || 'banknote', 'w-5 h-5')} ${escapeHtml(kpi.valor)}</strong></section>` : ''}
        </div>

        ${def.legenda ? `<div class="erp-card erp-legenda">${def.legenda.map(l => `<span><i class="erp-bola erp-bola--${l.cor}"></i> - ${escapeHtml(l.rotulo)}</span>`).join('')}</div>` : ''}

        <div class="erp-tabela">
            <div class="erp-th" style="${grade}">${def.columns.map(c => `<span ${c.sort ? `class="is-sort" onclick="cadOrdenar('${c.k}')"` : ''}>${escapeHtml(c.label)}${L.sort.k === c.k ? (L.sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</span>`).join('')}</div>
            ${pagina.length ? pagina.map(r => `<div class="erp-tr ${def.corLinha ? 'erp-tr--' + (def.corLinha(r) || 'normal') : ''}" style="${grade}" tabindex="0" onclick="cadAbrirLinha(${cadArg(r.id)})" onkeydown="if (event.key === 'Enter') cadAbrirLinha(${cadArg(r.id)})">
                ${def.columns.map(c => `<span data-label="${escapeHtml(c.label)}">${escapeHtml(c.get ? c.get(r) : (r[c.k] ?? '—'))}</span>`).join('')}</div>`).join('')
                : `<div class="erp-vazio">${escapeHtml(def.textoVazio || 'Nenhum registro encontrado')}</div>`}
        </div>

        <div class="erp-rodape"><span>Mostrando de ${total ? ini + 1 : 0} a ${ini + pagina.length} do total: ${total}</span>
            <div class="erp-pag"><button type="button" class="erp-ico erp-ico--p" onclick="cadPagina(${L.page - 1})" ${L.page <= 1 ? 'disabled' : ''} aria-label="Página anterior">${lucideIcon('chevron-left', 'w-4 h-4')}</button>
                <span>${L.page} / ${paginas}</span>
                <button type="button" class="erp-ico erp-ico--p" onclick="cadPagina(${L.page + 1})" ${L.page >= paginas ? 'disabled' : ''} aria-label="Próxima página">${lucideIcon('chevron-right', 'w-4 h-4')}</button></div></div>
    </div>`;
}
