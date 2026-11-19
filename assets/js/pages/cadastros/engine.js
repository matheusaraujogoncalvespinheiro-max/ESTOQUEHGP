// Motor das telas do menu Cadastro: CONSULTA e CADASTRO separados para cada entidade.
//
// Padroniza a EXPERIÊNCIA (pesquisa, filtros, ordenação, paginação, ver/editar/inativar, abas, salvar/cancelar/voltar),
// não os dados: campos, abas, colunas e filtros vêm da definição de cada entidade (data/cadastros.js).
// Como cada entidade grava (coleção própria, funcionários, usuários, produtos) está nos "stores" abaixo.

const formatMoney = (v) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

function cadState() {
    if (!state.cad) state.cad = { key: null, mode: 'list', id: null, tab: 'dados', form: {}, dirty: false, saving: false, lists: {} };
    return state.cad;
}

const cadDef = () => CAD_DEFS[cadState().key];
const cadStoreOf = (def) => CAD_STORES[def.store || 'generic'];

/** Permissão de ver/criar/editar/inativar da entidade (ADMIN sempre pode). */
function cadCan(def, acao) {
    const u = state.currentUser;
    if (!u) return false;
    if (u.role === 'ADMIN') return true;
    return ((def.roles || {})[acao] || []).includes(u.role);
}

// Abre uma entidade (chamado pelo menu).
function cadAbrir(key) {
    const st = cadState();
    st.key = key; st.mode = 'list'; st.id = null; st.tab = 'dados'; st.form = {}; st.dirty = false; st.saving = false;
    cadWatchEntity(key);
}

function cadWatchEntity(key) {
    const def = CAD_DEFS[key];
    if (!def || !cadCan(def, 'ver')) return;
    cadStoreOf(def).watch(def);
    (def.watch || []).forEach(k => db_cadWatch(k));
    // entidades referenciadas (seletores e filtros)
    const refs = new Set();
    (def.tabs || []).forEach(t => (t.fields || []).forEach(f => f.ref && refs.add(f.ref)));
    (def.filters || []).forEach(f => f.ref && refs.add(f.ref));
    refs.forEach(r => { if (CAD_DEFS[r]) cadStoreOf(CAD_DEFS[r]).watch(CAD_DEFS[r]); });
}

/** Registros normalizados de uma entidade: sempre com id e ativo (boolean). */
function cadRowsOf(key) {
    const def = CAD_DEFS[key];
    return def ? cadStoreOf(def).rows(def) : [];
}

function cadRotuloRef(key, id) {
    if (!id) return '—';
    const r = cadRowsOf(key).find(x => x.id === id);
    return r ? CAD_DEFS[key].rotulo(r) : '—';
}

/** Rótulo do campo conforme o tipo de pessoa (labelF = física, labelJ = jurídica). O cadastro abre como pessoa física. */
const cadRotuloCampo = (f, form) => (((form && form.pessoa) || 'F') === 'J' ? (f.labelJ || f.label) : (f.labelF || f.label));

const cadOptsOf = (f) => (typeof f.opts === 'function' ? f.opts() : (f.opts || []));
const cadOptId = (o) => (typeof o === 'string' ? o : o.id);
const cadOptRotulo = (o) => (typeof o === 'string' ? o : o.rotulo);

// ============================================================ CONSULTA

function cadList(def) {
    const st = cadState();
    if (!st.lists[def.key]) st.lists[def.key] = { q: '', filtros: { ...(def.filtrosPadrao || {}) }, situacao: 'ativos', sort: { k: (def.columns[0] || {}).k, dir: 'asc' }, page: 1, size: 10 };
    return st.lists[def.key];
}

function cadFiltrar(def) {
    const L = cadList(def);
    const q = searchKey(L.q);
    let rows = cadStoreOf(def).rows(def);
    if (L.situacao === 'ativos') rows = rows.filter(r => r.ativo);
    else if (L.situacao === 'inativos') rows = rows.filter(r => !r.ativo);
    Object.entries(L.filtros).forEach(([k, v]) => { if (v) rows = rows.filter(r => String(r[k] ?? '') === v); });
    Object.entries(L.txt || {}).forEach(([k, v]) => { if (v) { const t = searchKey(v); rows = rows.filter(r => searchKey(r[k]).includes(t) || (onlyDigits(v) && onlyDigits(r[k]).includes(onlyDigits(v)))); } });
    if (q) rows = rows.filter(r => (def.search || []).some(k => searchKey(r[k]).includes(q) || onlyDigits(q) && onlyDigits(r[k]).includes(onlyDigits(q))));
    const col = def.columns.find(c => c.k === L.sort.k);
    const val = (r) => (col && col.num ? Number(r[L.sort.k]) || 0 : searchKey(r[L.sort.k]));
    rows = [...rows].sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * (L.sort.dir === 'desc' ? -1 : 1));
    return rows;
}

function cadKpis(def, rows) {
    const todos = cadStoreOf(def).rows(def);
    const k = [{ rotulo: 'Cadastrados', valor: todos.length }, { rotulo: 'Ativos', valor: todos.filter(r => r.ativo).length }, { rotulo: 'Inativos', valor: todos.filter(r => !r.ativo).length }];
    if (def.kpisExtra) k.push(...def.kpisExtra(todos));
    return k;
}

function renderCadList(def) {
    if (def.estiloERP && typeof renderCadListaERP === 'function') return renderCadListaERP(def);
    const L = cadList(def);
    const rows = cadFiltrar(def);
    const pages = Math.max(1, Math.ceil(rows.length / L.size));
    if (L.page > pages) L.page = pages;
    const pageRows = rows.slice((L.page - 1) * L.size, L.page * L.size);
    const podeCriar = cadCan(def, 'criar');
    const padrao = def.filtrosPadrao || {};
    const filtrosAtivos = L.q || L.situacao !== 'ativos' || Object.keys({ ...padrao, ...L.filtros }).some(k => (L.filtros[k] || '') !== (padrao[k] || ''));

    const filterSelect = (f) => {
        const opts = f.ref ? cadRowsOf(f.ref).filter(r => r.ativo).map(r => ({ id: r.id, rotulo: CAD_DEFS[f.ref].rotulo(r) })) : cadOptsOf(f);
        return `<div class="cd-filter"><span>${escapeHtml(f.label)}</span>${cadComboHtml({ id: 'cdf_' + f.k, valor: L.filtros[f.k] || '', opts, vazio: 'Todos', placeholder: 'Todos', fn: 'cadFiltro', arg: f.k })}</div>`;
    };

    return `
    <div class="cd-page at-stack tone-blue">
        <header class="cd-head">
            <div class="cd-head__ico">${lucideIcon(def.icon, 'w-7 h-7')}</div>
            <div class="cd-head__txt"><h2>${escapeHtml(def.label)}</h2><p>${escapeHtml(def.desc)}</p></div>
            <div class="cd-head__btns">
                ${(def.botoesLista || []).filter(b => !b.perm || cadCan(def, b.perm)).map(b => `<button type="button" class="at-btn at-btn--ghost cd-new" onclick="${b.fn}()">${lucideIcon(b.icon || 'file', 'w-5 h-5')} ${escapeHtml(b.rotulo)}</button>`).join('')}
                <button type="button" class="at-btn at-btn--ghost cd-new" onclick="cadImprimir()" title="Imprimir os dados desta consulta (com os filtros atuais)">${lucideIcon('printer', 'w-5 h-5')} Imprimir</button>
                ${podeCriar ? `<button type="button" class="at-btn at-btn--primary cd-new" onclick="cadNovo()">${lucideIcon('plus', 'w-5 h-5')} Novo Cadastro</button>` : ''}
            </div>
        </header>

        <div class="cd-kpis">${cadKpis(def, rows).map(k => `<div class="cd-kpi"><strong>${escapeHtml(k.valor)}</strong><span>${escapeHtml(k.rotulo)}</span></div>`).join('')}</div>

        <section class="at-card cd-filters" aria-label="Pesquisa e filtros">
            <label class="cd-filter cd-filter--grow"><span>Pesquisar</span>
                <input class="at-input" id="cd_q" type="search" value="${escapeHtml(L.q)}" placeholder="${escapeHtml('Pesquisar por ' + def.search.map(cadNomeCampo(def)).join(', '))}" oninput="cadBusca(this.value)" data-keep="cd_q" autocomplete="off">
            </label>
            ${def.filters.map(filterSelect).join('')}
            <div class="cd-filter"><span>Situação</span>${cadComboHtml({ id: 'cd_sit', valor: L.situacao, opts: [{ id: 'ativos', rotulo: 'Ativos' }, { id: 'inativos', rotulo: 'Inativos' }, { id: 'todos', rotulo: 'Todos' }], vazio: null, fn: 'cadSituacao' })}</div>
            <button type="button" class="at-btn at-btn--ghost at-btn--sm cd-clear" onclick="cadLimpar()" ${filtrosAtivos ? '' : 'disabled'}>${lucideIcon('eraser', 'w-4 h-4')} Limpar filtros</button>
        </section>

        <section class="at-card" style="padding:0;overflow:hidden">
            <div class="cd-tablewrap"><table class="tri-table cd-table">
                <thead><tr>
                    ${def.columns.map(c => `<th ${c.sort ? `class="is-sort" onclick="cadOrdenar('${c.k}')" aria-sort="${L.sort.k === c.k ? (L.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}"` : ''}>${escapeHtml(c.label)}${L.sort.k === c.k ? (L.sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>`).join('')}
                    ${def.semInativar && !def.rotuloInativo ? '' : '<th>Situação</th>'}${def.semInativar ? '' : '<th class="cd-actcol">Ações</th>'}
                </tr></thead>
                <tbody>${pageRows.length ? pageRows.map(r => `<tr class="cd-row ${r.ativo ? '' : 'is-off'}" tabindex="0" title="Abrir cadastro" onclick="cadAbrirLinha(${cadArg(r.id)})" onkeydown="if (event.key === 'Enter') cadAbrirLinha(${cadArg(r.id)})">
                    ${def.columns.map(c => `<td data-label="${escapeHtml(c.label)}">${escapeHtml(c.get ? c.get(r) : (r[c.k] ?? '—'))}</td>`).join('')}
                    ${def.semInativar && !def.rotuloInativo ? '' : `<td data-label="Situação">${cadBadge(r)}</td>`}
                    ${def.semInativar ? '' : `<td class="cd-actcol">
                        ${cadCan(def, 'inativar') && !def.semInativar ? (r.ativo
                            ? `<button type="button" class="cd-ico cd-ico--warn" title="Inativar" aria-label="Inativar" onclick="event.stopPropagation(); cadInativar(${cadArg(r.id)})">${lucideIcon('ban', 'w-4 h-4')}</button>`
                            : `<button type="button" class="cd-ico cd-ico--ok" title="Reativar" aria-label="Reativar" onclick="event.stopPropagation(); cadReativar(${cadArg(r.id)})">${lucideIcon('rotate-ccw', 'w-4 h-4')}</button>`) : ''}</td>`}</tr>`).join('') : `<tr><td colspan="${def.columns.length + 2}" class="at-empty">${cadStoreOf(def).rows(def).length ? 'Nenhum registro encontrado com estes filtros.' : 'Nenhum registro cadastrado ainda.'}</td></tr>`}
                </tbody></table></div>
            <footer class="cd-pager">
                <span>${rows.length} registro(s)</span>
                <label>Por página
                    ${cadComboHtml({ id: 'cd_size', valor: String(L.size), opts: ['10', '25', '50'], vazio: null, fn: 'cadTamanho' })}</label>
                <div class="cd-pager__nav">
                    <button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="cadPagina(${L.page - 1})" ${L.page <= 1 ? 'disabled' : ''} aria-label="Página anterior">${lucideIcon('chevron-left', 'w-4 h-4')}</button>
                    <span>Página ${L.page} de ${pages}</span>
                    <button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="cadPagina(${L.page + 1})" ${L.page >= pages ? 'disabled' : ''} aria-label="Próxima página">${lucideIcon('chevron-right', 'w-4 h-4')}</button>
                </div>
            </footer>
        </section>
    </div>`;
}

const cadArg = (id) => escapeHtml(JSON.stringify(String(id)));
const cadBadge = (r) => { const d = state.cad && CAD_DEFS[state.cad.key]; return `<span class="at-badge ${r.ativo ? 'at-badge--ok' : 'at-badge--off'}">${r.ativo ? 'Ativo' : ((d && d.rotuloInativo) || 'Inativo')}</span>`; };
const cadNomeCampo = (def) => (k) => {
    const f = cadCamposDe(def).find(x => x.k === k);
    const c = def.columns.find(x => x.k === k);
    return ((f && f.label) || (c && c.label) || k).toLowerCase();
};
const cadCamposDe = (def) => [...(def.top || []), ...(def.tabs || []).flatMap(t => t.fields || [])].filter(f => f.k);

// Ações da consulta
function cadBusca(v) { const L = cadList(cadDef()); L.q = v; L.page = 1; clearTimeout(cadBusca.t); cadBusca.t = setTimeout(render, 180); }
function cadFiltro(k, v) { const L = cadList(cadDef()); L.filtros[k] = v; L.page = 1; render(); }
function cadSituacao(v) { const L = cadList(cadDef()); L.situacao = v; L.page = 1; render(); }
function cadLimpar() { const L = cadList(cadDef()); L.q = ''; L.filtros = { ...(cadDef().filtrosPadrao || {}) }; L.situacao = 'ativos'; L.page = 1; renderFresh(); }
function cadOrdenar(k) { const L = cadList(cadDef()); L.sort = { k, dir: L.sort.k === k && L.sort.dir === 'asc' ? 'desc' : 'asc' }; render(); }
function cadPagina(n) { const L = cadList(cadDef()); L.page = Math.max(1, n); render(); }
function cadTamanho(n) { const L = cadList(cadDef()); L.size = Number(n); L.page = 1; render(); }

// ============================================================ CADASTRO / VISUALIZAÇÃO

function cadNovo() {
    const def = cadDef();
    if (!cadCan(def, 'criar')) return showMsg('Seu perfil não pode criar este cadastro.', 'error');
    const st = cadState();
    st.mode = 'form'; st.id = null; st.tab = cadAbas(def, {})[0].id; st.dirty = false; st.saving = false;
    st.form = { ativo: true, ativo_sel: '1', ...(typeof def.defaults === 'function' ? def.defaults() : (def.defaults || {})), ...((cadStoreOf(def).defaults && cadStoreOf(def).defaults(def)) || {}) };
    st.secoes = {};
    renderFresh(); window.scrollTo(0, 0);
}

async function cadAbrirRegistro(id, modo) {
    const def = cadDef();
    const st = cadState();
    const rec = cadStoreOf(def).rows(def).find(r => r.id === id);
    if (!rec) return showMsg('Registro não encontrado.', 'error');
    if (modo === 'form' && !cadCan(def, 'editar')) return showMsg('Seu perfil não pode editar este cadastro.', 'error');
    if (def.sensivel && typeof registrarAcesso === 'function') registrarAcesso(def.key, id, `Cadastro: ${modo === 'form' ? 'abriu para edição' : 'visualizou'}`);
    st.mode = modo; st.id = id; st.tab = cadAbas(def, rec)[0].id; st.dirty = false; st.saving = false;
    st.form = cadStoreOf(def).toForm ? cadStoreOf(def).toForm(def, rec) : cadFormatarParaForm(def, rec);
    st.form.ativo_sel = rec.ativo === false ? '0' : '1';
    st.secoes = {};
    renderFresh(); window.scrollTo(0, 0);
}
const cadEditar = (id) => cadAbrirRegistro(id, 'form');
/** Clique em qualquer parte da linha da grid: abre o cadastro para edição (ou só para ver, sem permissão de editar). */
function cadAbrirLinha(id) {
    const def = cadDef();
    const rec = cadStoreOf(def).rows(def).find(r => r.id === id);
    const travado = def.imutavel || (def.somenteLeitura && rec && def.somenteLeitura(rec));
    return cadAbrirRegistro(id, cadCan(def, 'editar') && !travado ? 'form' : 'view');
}
const cadVer = (id) => cadAbrirRegistro(id, 'view');

function cadVoltar() {
    const st = cadState();
    if (st.dirty && st.mode === 'form' && !confirm('Há alterações não salvas. Deseja sair mesmo assim?')) return;
    st.mode = 'list'; st.id = null; st.form = {}; st.dirty = false;
    renderFresh(); window.scrollTo(0, 0);
}

const cadAbas = (def, form) => (def.tabs || []).filter(t => (!t.hide || !t.hide(form)) && (!t.show || t.show(form)));
function cadAba(id) { cadState().tab = id; render(); }

/** Chamado a cada digitação: guarda o valor, aplica máscaras e limpa seletores dependentes. */
function cadCampo(k, el) {
    const def = cadDef();
    const st = cadState();
    const f = cadCamposDe(def).find(x => x.k === k) || {};
    let v = el.type === 'checkbox' ? el.checked : el.value;
    const antes = st.form[k];
    if (f.type === 'cnpj') v = el.value = formatCNPJ(v);
    else if (f.type === 'cpf') v = el.value = formatCPF(v);
    else if (f.type === 'doc') { v = el.value = cadFormatarDoc(v); st.form.pessoa = cadPessoaDoDoc(v) || ''; }
    else if (f.type === 'digits') v = el.value = onlyDigits(v).slice(0, f.maxlen || 20);
    else if (f.type === 'cep') v = el.value = formatCEP(v);
    else if (f.type === 'phone') v = el.value = formatPhone(v);
    else if (f.type === 'upper') { const pos = el.selectionStart; v = el.value = v.toUpperCase(); try { el.setSelectionRange(pos, pos); } catch (e) { /* sem seleção */ } }
    st.form[k] = v;
    if (k === 'ativo_sel') st.form.ativo = v !== '0';
    st.dirty = true;
    cadCamposDe(def).filter(x => x.dep === k).forEach(x => { st.form[x.k] = ''; });
    const mudouPessoa = f.type === 'doc' && cadPessoaDoDoc(v) !== cadPessoaDoDoc(antes);
    if (f.rerender || mudouPessoa || cadCamposDe(def).some(x => x.dep === k)) render();
}

/** Até 11 dígitos é CPF; acima disso, CNPJ. */
const cadFormatarDoc = (v) => (onlyDigits(v).length > 11 ? formatCNPJ(v) : formatCPF(v));
/** Tipo de pessoa pelo tamanho: 11 = Física (F), 12 a 14 = Jurídica (J). */
const cadPessoaDoDoc = (v) => { const n = onlyDigits(v).length; return n === 11 ? 'F' : (n > 11 ? 'J' : ''); };

/** Registro gravado (só dígitos) -> valores formatados para o formulário. */
function cadFormatarParaForm(def, rec) {
    const f = { ...rec };
    cadCamposDe(def).forEach(c => {
        const v = rec[c.k];
        if (!v) return;
        if (c.type === 'cnpj') f[c.k] = formatCNPJ(v);
        else if (c.type === 'cpf') f[c.k] = formatCPF(v);
        else if (c.type === 'doc') f[c.k] = cadFormatarDoc(v);
        else if (c.type === 'phone') f[c.k] = formatPhone(v);
        else if (c.type === 'cep') f[c.k] = formatCEP(v);
    });
    return f;
}

// ---- Listas (Anotações, Acompanhamentos): só acrescentam itens, nunca apagam (preserva o histórico) ----
function cadAddItem(k) {
    const st = cadState();
    const input = document.getElementById(`cad_novo_${k}`);
    const texto = String(input ? input.value : '').trim();
    if (texto.length < 3) return showMsg('Escreva ao menos 3 caracteres.', 'error');
    st.form[k] = [...(st.form[k] || []), { texto, em: nowISO(), por: state.currentUser.name }];
    st.dirty = true;
    renderFresh();
    document.getElementById(`cad_novo_${k}`)?.focus();
}

function cadListaHtml(f, st, readonly) {
    const itens = [...(st.form[f.k] || [])].reverse();
    return `<div class="cd-lista">
        <div class="cd-lista__head"><span>${escapeHtml(f.label)}</span>${readonly ? '' : `<button type="button" class="cd-plus" title="Adicionar" aria-label="Adicionar ${escapeHtml(f.label)}" onclick="cadAddItem('${f.k}')">${lucideIcon('plus', 'w-5 h-5')}</button>`}</div>
        ${readonly ? '' : `<input class="at-input cd-lista__in" id="cad_novo_${f.k}" maxlength="400" placeholder="${escapeHtml(f.ph || 'Escreva e clique em +')}" autocomplete="off" onkeydown="if (event.key === 'Enter') { event.preventDefault(); cadAddItem('${f.k}'); }" data-keep="cad_novo_${f.k}">`}
        <div class="cd-lista__box">${itens.length ? itens.map(i => `<div class="cd-lista__item"><p>${escapeHtml(i.texto)}</p><small>${escapeHtml(formatDateTimeBR(i.em))} · ${escapeHtml(i.por)}</small></div>`).join('') : '<div class="cd-lista__vazio">Nenhum registro.</div>'}</div>
    </div>`;
}



// ---------------- Campos extras: arquivo (importar XML), operação (para cancelamento) e carga de itens ----------------

/** Lê o arquivo escolhido e deixa o campo da definição (onFile) preencher o formulário. */
function cadArquivo(k, el) {
    const f = cadCamposDe(cadDef()).find(x => x.k === k);
    const arquivo = el.files && el.files[0];
    if (!arquivo || !f || !f.onFile) return;
    const leitor = new FileReader();
    leitor.onload = () => {
        try {
            Object.assign(cadState().form, f.onFile(String(leitor.result)));
            cadState().dirty = true;
            renderFresh();
            showMsg('Arquivo lido. Confira os dados antes de salvar.');
        } catch (err) { showMsg(err.message, 'error'); }
    };
    leitor.readAsText(arquivo, 'utf-8');
}

/** Botão "Carregar" de uma tabela de itens (ex.: todos os produtos do setor num inventário). */
function cadItensCarregar(k) {
    const st = cadState();
    const f = cadCamposDe(cadDef()).find(x => x.k === k);
    try {
        const linhas = f.carregar(st.form);
        if (!linhas.length) return showMsg('Nada para carregar. Confira os campos acima.', 'error');
        st.form[k] = linhas; st.dirty = true; render();
    } catch (err) { showMsg(err.message, 'error'); }
}

/** Operações já registradas de um tipo (para cancelar). Valor do campo "tipo_operacao" = chave da entidade. */
function cadOperacoesOpcoes(tipoChave) {
    const def = CAD_DEFS[tipoChave];
    if (!def) return [];
    return (CAD_DATA[tipoChave] || []).filter(r => r.ativo !== false).sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)))
        .map(r => ({ id: r.id, rotulo: `${r.codigo} · ${r.produto_desc || r.nota_fiscal || r.destino || ''} · ${r.criado_em ? formatDateTimeBR(r.criado_em) : ''}` }));
}

// ---------------- Tipos de campo das operações: produto, lote e tabela de itens ----------------

const SETORES_ESTOQUE_OPS = ['OPME', 'HEMODINAMICA', 'CENTRO_CIRURGICO'];
const rotuloSetorOps = (s) => ({ OPME: 'OPME', HEMODINAMICA: 'Hemodinâmica', CENTRO_CIRURGICO: 'Centro Cirúrgico' }[s] || s);

/** Opções de produto de todos os setores: valor "SETOR|código". */
function cadProdutosOpcoes() {
    return SETORES_ESTOQUE_OPS.flatMap(s => (MOCK_DATA[s] || []).map(p => ({ id: `${s}|${p.barcode}`, rotulo: `${p.barcode} · ${p.material} — ${rotuloSetorOps(s)} (saldo ${p.qtd})` })));
}

/** Produto escolhido num campo do tipo produto: { setor, produto } ou null. */
function cadProdutoDe(valor) {
    const [setor, barcode] = String(valor || '').split('|');
    const produto = (MOCK_DATA[setor] || []).find(p => p.barcode === barcode);
    return produto ? { setor, produto } : null;
}

function cadLotesOpcoes(valorProduto) {
    const pr = cadProdutoDe(valorProduto);
    if (!pr) return [];
    return (pr.produto.lotes || []).filter(l => l.quantidade > 0).map(l => ({ id: String(l.id), rotulo: `${l.lote} · ${l.validade && l.validade !== 'N/A' ? 'val. ' + formatDateBR(l.validade) : 'sem validade'} · ${l.quantidade} un${loteVencido(l) ? ' · VENCIDO' : ''}` }));
}

function cadItemCampo(k, i, c, v) {
    const st = cadState();
    const col = ((cadCamposDe(cadDef()).find(f => f.k === k) || {}).colunas || []).find(x => x.k === c) || {};
    st.form[k][i][c] = col.type === 'number' || col.type === 'money' ? (v === '' ? '' : Number(v)) : v;
    st.dirty = true;
}
function cadItemAdd(k) { const st = cadState(); st.form[k] = [...(st.form[k] || []), {}]; st.dirty = true; render(); }
function cadItemRem(k, i) { const st = cadState(); st.form[k] = (st.form[k] || []).filter((_, n) => n !== i); st.dirty = true; render(); }

/** Tabela de itens editável (compras, recebimentos, entregas, conferências). */
function cadItensHtml(f, st, readonly) {
    const linhas = st.form[f.k] || [];
    const ctl = (c, v, i) => {
        if (readonly) return escapeHtml(c.type === 'produto' ? ((cadProdutosOpcoes().find(o => o.id === v) || {}).rotulo || v || '—') : (c.type === 'money' ? formatMoney(v) : (c.type === 'date' && v ? formatDateBR(v) : (v ?? '—'))));
        const on = `oninput="cadItemCampo('${f.k}', ${i}, '${c.k}', this.value)"`;
        if (c.type === 'produto') return `<select class="at-select" onchange="cadItemCampo('${f.k}', ${i}, '${c.k}', this.value)"><option value="">Selecione</option>${cadProdutosOpcoes().map(o => `<option value="${escapeHtml(o.id)}" ${o.id === v ? 'selected' : ''}>${escapeHtml(o.rotulo)}</option>`).join('')}</select>`;
        if (c.ro) return `<span>${escapeHtml(v ?? '—')}</span>`;
        const tipo = c.type === 'number' || c.type === 'money' ? 'number" step="' + (c.type === 'money' ? '0.01' : '1') + '" min="0' : (c.type === 'date' ? 'date' : 'text');
        return `<input class="at-input" type="${tipo}" value="${escapeHtml(v ?? '')}" maxlength="150" ${on} autocomplete="off">`;
    };
    return `<div class="cd-itens"><div class="cd-lista__head"><span>${escapeHtml(f.label)}${f.req && !readonly ? ' *' : ''}</span>${readonly || !f.carregar ? '' : `<button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="cadItensCarregar('${f.k}')">${escapeHtml(f.carregarRotulo || 'Carregar itens')}</button>`}${readonly || f.semAdicionar ? '' : `<button type="button" class="cd-plus" title="Adicionar item" aria-label="Adicionar item" onclick="cadItemAdd('${f.k}')">${lucideIcon('plus', 'w-5 h-5')}</button>`}</div>
        <div class="cd-tablewrap"><table class="tri-table cd-table"><thead><tr>${f.colunas.map(c => `<th>${escapeHtml(c.label)}${c.req ? ' *' : ''}</th>`).join('')}${readonly || f.semAdicionar ? '' : '<th></th>'}</tr></thead>
        <tbody>${linhas.length ? linhas.map((l, i) => `<tr>${f.colunas.map(c => `<td data-label="${escapeHtml(c.label)}">${ctl(c, l[c.k], i)}</td>`).join('')}${readonly || f.semAdicionar ? '' : `<td><button type="button" class="cd-ico cd-ico--warn" title="Remover item" aria-label="Remover item" onclick="cadItemRem('${f.k}', ${i})">${lucideIcon('trash-2', 'w-4 h-4')}</button></td>`}</tr>`).join('') : `<tr><td colspan="${f.colunas.length + 1}" class="at-empty">Nenhum item. Use o botão + para adicionar.</td></tr>`}</tbody></table></div></div>`;
}

function cadControle(def, f, st, readonly) {
    const val = st.form[f.k] ?? '';
    const id = `cad_${f.k}`;
    if (f.type === 'lista') return cadListaHtml(f, st, readonly);
    if (f.type === 'itens') return cadItensHtml(f, st, readonly);
    if (readonly || f.ro || (f.roEdit && st.id)) return `<div class="cd-ro" id="${id}">${escapeHtml(cadValorLegivel(def, f, val) || f.roVazio || '—')}</div>`;
    const on = `oninput="cadCampo('${f.k}', this)"`;
    const keep = `data-keep="${id}"`;
    switch (f.type) {
        case 'textarea': return `<textarea class="at-textarea" id="${id}" name="${f.k}" rows="3" maxlength="${f.maxlen || 1000}" placeholder="${escapeHtml(f.ph || '')}" ${on} ${keep}>${escapeHtml(val)}</textarea>`;
        case 'select': case 'uf': case 'ref': {
            let opts;
            if (f.type === 'uf') opts = UFS;
            else if (f.type === 'ref') {
                opts = cadRowsOf(f.ref).filter(r => (r.ativo || r.id === val) && (!f.dep || !st.form[f.dep] || r[f.depField || f.dep] === st.form[f.dep]))
                    .map(r => ({ id: r.id, rotulo: CAD_DEFS[f.ref].rotulo(r) })).sort((a, b) => a.rotulo.localeCompare(b.rotulo));
            } else opts = cadOptsOf(f);
            const semOpcoes = f.type === 'ref' && !opts.length;
            return cadComboHtml({ id, valor: val, opts, placeholder: semOpcoes ? 'Nenhum cadastro disponível' : 'Selecione', vazio: semOpcoes ? null : 'Selecione', fn: 'cadSelecionar', arg: f.k, desabilitado: semOpcoes });
        }
        case 'check': return `<label class="cd-check"><input type="checkbox" id="${id}" name="${f.k}" ${val ? 'checked' : ''} onchange="cadCampo('${f.k}', this)" ${keep}> <span>${escapeHtml(f.checkLabel || 'Sim')}</span></label>`;
        case 'date': return `<input class="at-input" type="date" id="${id}" name="${f.k}" value="${escapeHtml(val)}" ${f.max ? `max="${f.max}"` : ''} oninput="cadCampo('${f.k}', this)" ${keep}>`;
        case 'number': case 'money':
            return `<input class="at-input" type="number" inputmode="decimal" step="${f.type === 'money' ? '0.01' : (f.step || '1')}" min="${f.min ?? 0}" ${f.max ? `max="${f.max}"` : ''} id="${id}" name="${f.k}" value="${escapeHtml(val)}" placeholder="${escapeHtml(f.ph || '')}" ${on} ${keep}>`;
        case 'doc': {
            const juridica = cadPessoaDoDoc(val) === 'J';
            return `<div class="cd-inputbtn${juridica ? ' has-btn' : ''}"><input class="at-input" type="text" inputmode="numeric" id="${id}" name="${f.k}" value="${escapeHtml(val)}" maxlength="18" placeholder="${juridica ? '00.000.000/0000-00' : '000.000.000-00'}" autocomplete="off" ${on} ${keep}>
                ${juridica ? `<button type="button" class="cd-searchbtn" title="Buscar dados pelo CNPJ" aria-label="Buscar dados pelo CNPJ" onclick="cadBuscarCnpj()">${lucideIcon('search', 'w-5 h-5')}</button>` : ''}</div>`;
        }
        case 'cep': return `<div class="cd-inputbtn has-btn"><input class="at-input" type="text" inputmode="numeric" id="${id}" name="${f.k}" value="${escapeHtml(val)}" maxlength="9" placeholder="00000-000" autocomplete="off" ${on} ${keep}>
            <button type="button" class="cd-searchbtn" title="Buscar endereço pelo CEP" aria-label="Buscar endereço pelo CEP" onclick="cadBuscarCep()">${lucideIcon('search', 'w-5 h-5')}</button></div>`;
        case 'arquivo': return `<input class="at-input" type="file" accept="${f.accept || '*'}" onchange="cadArquivo('${f.k}', this)">`;
        case 'operacao': { const ops = cadOperacoesOpcoes(st.form[f.dep]); return cadComboHtml({ id, valor: val, opts: ops, placeholder: st.form[f.dep] ? (ops.length ? 'Selecione a operação' : 'Nenhuma operação ativa deste tipo') : 'Escolha o tipo primeiro', vazio: ops.length ? 'Selecione' : null, fn: 'cadSelecionar', arg: f.k, desabilitado: !ops.length }); }
        case 'produto': return cadComboHtml({ id, valor: val, opts: cadProdutosOpcoes(), placeholder: 'Selecione o produto', vazio: 'Selecione', fn: 'cadSelecionar', arg: f.k });
        case 'lote': { const ops = cadLotesOpcoes(st.form[f.dep]); return cadComboHtml({ id, valor: String(val || ''), opts: ops, placeholder: st.form[f.dep] ? (ops.length ? 'Selecione o lote' : 'Sem lote com saldo') : 'Selecione o produto primeiro', vazio: ops.length ? 'Selecione' : null, fn: 'cadSelecionar', arg: f.k, desabilitado: !ops.length }); }
        case 'municipio': {
            const uf = st.form[f.dep || 'uf'];
            const lista = (IBGE_MUNICIPIOS[uf] || []).map(([cod, nome]) => ({ id: String(cod), rotulo: nome }));
            return cadComboHtml({ id, valor: String(val || ''), opts: lista, placeholder: uf ? 'Selecione o município' : 'Selecione o estado primeiro', vazio: uf ? 'Selecione' : null, fn: 'cadSelecionar', arg: f.k, desabilitado: !uf });
        }
        case 'digits': return `<input class="at-input" type="text" inputmode="numeric" id="${id}" name="${f.k}" value="${escapeHtml(val)}" maxlength="${f.maxlen || 20}" placeholder="${escapeHtml(f.ph || '')}" autocomplete="off" ${on} ${keep}>`;
        case 'password': return `<input class="at-input" type="password" id="${id}" name="${f.k}" value="${escapeHtml(val)}" placeholder="${escapeHtml(f.ph || '')}" autocomplete="new-password" ${on} ${keep}>`;
        case 'email': return `<input class="at-input" type="email" id="${id}" name="${f.k}" value="${escapeHtml(val)}" maxlength="120" placeholder="${escapeHtml(f.ph || '')}" autocomplete="off" ${on} ${keep}>`;
        default: return `<input class="at-input" type="text" id="${id}" name="${f.k}" value="${escapeHtml(val)}" maxlength="${f.maxlen || 120}" placeholder="${escapeHtml(f.ph || '')}" autocomplete="off" ${on} ${keep}>`;
    }
}

function cadValorLegivel(def, f, val) {
    if (val === '' || val === null || val === undefined) return '';
    if (f.type === 'ref') return cadRotuloRef(f.ref, val);
    if (f.type === 'operacao') return (cadOperacoesOpcoes(cadState().form[f.dep]).find(o => o.id === val) || {}).rotulo || val;
    if (f.type === 'produto') return (cadProdutosOpcoes().find(o => o.id === val) || {}).rotulo || val;
    if (f.type === 'lote') return (cadLotesOpcoes(cadState().form[f.dep]).find(o => o.id === String(val)) || {}).rotulo || val;
    if (f.type === 'municipio') return cadNomeMunicipio(val);
    if (f.type === 'check') return val ? 'Sim' : 'Não';
    if (f.type === 'date') return formatDateBR(val);
    if (f.type === 'money') return formatMoney(val);
    if (f.type === 'password') return '••••••';
    if (f.type === 'select') { const o = cadOptsOf(f).find(x => cadOptId(x) === val); return o ? cadOptRotulo(o) : val; }
    return String(val);
}

function cadCampoHtml(def, f, st, readonly) {
    if (def.layout === 'erp') {
        if (f.ocultoNovo && !st.id) return '';
        const ctl = cadControle(def, f, st, readonly);
        return `<div class="cd-cell" style="--col:${(!st.id && f.colNovo) || f.col || 3}">
            ${f.type === 'lista' || f.type === 'itens' ? ctl : `<label class="at-label" for="cad_${f.k}">${escapeHtml(cadRotuloCampo(f, st.form))}${f.req && !readonly ? ' <span class="req">*</span>' : ''}</label>${ctl}
            ${!readonly && f.help ? `<span class="at-hint">${escapeHtml(f.help)}</span>` : ''}<p class="at-error" data-error="cad_${f.k}" role="alert"></p>`}
        </div>`;
    }
    return atField({ prefix: 'cad', campo: f.k, label: f.label, required: Boolean(f.req) && !readonly, hint: readonly ? '' : (f.help || ''), span2: f.span2, control: cadControle(def, f, st, readonly) });
}

function renderCadForm(def, readonly) {
    const st = cadState();
    const store = cadStoreOf(def);
    const rec = st.id ? store.rows(def).find(r => r.id === st.id) : null;
    const abas = cadAbas(def, st.form);
    if (!abas.find(t => t.id === st.tab)) st.tab = abas[0].id;
    const aba = abas.find(t => t.id === st.tab);
    const ativo = st.form.ativo !== false;
    const podeSit = !readonly && !def.semSitForm && !def.semInativar && cadCan(def, 'inativar') && Boolean(st.id);
    const titulo = readonly ? `Visualizar ${def.singular}` : (st.id ? `Editar ${def.singular}` : `Novo ${def.singular}`);
    const ident = rec ? def.rotulo(rec) : '';

    const topHtml = def.top
        ? (def.layout === 'erp'
            ? `<section class="at-card cd-top cd-top--erp"><div class="cd-grid12">${def.top.map(f => cadCampoHtml(def, f, st, readonly)).join('')}</div></section>`
            : `<section class="at-card cd-top"><div class="at-form cd-topgrid">${def.top.map(f => cadCampoHtml(def, f, st, readonly)).join('')}</div></section>`)
        : '';

    if (def.layout === 'erp') {
        return `
    <form id="cad-form" class="cd-page at-stack tone-blue cd-erp" onsubmit="cadSalvar(event)" novalidate>
        <div class="cd-erpbar">
            <button type="button" class="cd-back" onclick="cadVoltar()" title="Voltar para a consulta" aria-label="Voltar para a consulta">${lucideIcon('undo-2', 'w-5 h-5')}</button>
            <span class="cd-erpbar__t">${escapeHtml(titulo)}${ident ? ' · <strong>' + escapeHtml(ident) + '</strong>' : ''} ${cadBadge({ ativo })}</span>
        </div>
        ${topHtml}
        <section class="at-card cd-block">
            <nav class="at-tabs cd-tabs cd-tabs--erp" role="tablist" aria-label="Seções do cadastro">
            ${(def.tabs || []).filter(t => !t.hide || !t.hide(st.form)).map(t => `<button type="button" role="tab" class="at-tab ${t.id === st.tab ? 'is-active' : ''}" aria-selected="${t.id === st.tab}" onclick="cadAba('${t.id}')">${escapeHtml(t.label)}</button>`).join('')}
            </nav>
            <div role="tabpanel" class="cd-panel">${aba.render ? aba.render(def, st, readonly) : cadCorpoDaAba(def, aba, st, readonly)}</div>
        </section>
        <div class="cd-footbar">
            ${readonly
                ? (cadCan(def, 'editar') ? `<button type="button" class="at-btn at-btn--primary at-btn--sm" style="flex:none" onclick="cadEditar(${cadArg(st.id)})">${lucideIcon('pencil', 'w-4 h-4')} Editar</button>` : '')
                : `<button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="cadCancelar()">Cancelar</button>
                   <button type="submit" class="at-btn at-btn--primary at-btn--sm" style="flex:none" data-busy-label>${lucideIcon('check', 'w-4 h-4')} Salvar</button>`}
        </div>
    </form>`;
    }

    return `
    <form id="cad-form" class="cd-page at-stack tone-blue" onsubmit="cadSalvar(event)" novalidate>
        <header class="cd-head cd-head--form">
            <div class="cd-head__ico">${lucideIcon(def.icon, 'w-7 h-7')}</div>
            <div class="cd-head__txt">
                <h2>${escapeHtml(titulo)}</h2>
                <p>${escapeHtml(def.label)}${ident ? ' · <strong>' + escapeHtml(ident) + '</strong>' : ''}${rec && rec.codigo ? ' · ' + escapeHtml(rec.codigo) : ''} ${cadBadge({ ativo })}</p>
            </div>
            <div class="cd-head__btns">
                <button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="cadVoltar()">${lucideIcon('arrow-left', 'w-4 h-4')} Voltar para consulta</button>
                ${readonly
                    ? (cadCan(def, 'editar') ? `<button type="button" class="at-btn at-btn--primary at-btn--sm" style="flex:none" onclick="cadEditar(${cadArg(st.id)})">${lucideIcon('pencil', 'w-4 h-4')} Editar</button>` : '')
                    : `<button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="cadCancelar()">Cancelar</button>
                       <button type="submit" class="at-btn at-btn--primary at-btn--sm" style="flex:none" data-busy-label>${lucideIcon('save', 'w-4 h-4')} Salvar</button>`}
            </div>
        </header>

        ${topHtml}


        <section class="at-card cd-block">
            <nav class="at-tabs cd-tabs" role="tablist" aria-label="Seções do cadastro">
            ${(def.tabs || []).filter(t => !t.hide || !t.hide(st.form)).map(t => {
                const visivel = !t.show || t.show(st.form);
                return `<button type="button" role="tab" class="at-tab ${t.id === st.tab ? 'is-active' : ''}" aria-selected="${t.id === st.tab}" ${visivel ? `onclick="cadAba('${t.id}')"` : 'disabled'} ${!visivel && t.hintOff ? `title="${escapeHtml(t.hintOff)}"` : ''}>${escapeHtml(t.label)}</button>`;
            }).join('')}
            </nav>
            <div role="tabpanel" class="cd-panel">
            ${aba.render ? aba.render(def, st, readonly) : cadCorpoDaAba(def, aba, st, readonly)}
            </div>
        </section>

        ${podeSit ? `<section class="at-card cd-sit"><label class="cd-filter"><span>Situação do registro</span>
            <select class="at-select" id="cad_ativo_sel" onchange="cadSituacaoForm(this.value)" data-keep="cad_ativo_sel">
                <option value="1" ${ativo ? 'selected' : ''}>Ativo</option><option value="0" ${ativo ? '' : 'selected'}>Inativo</option></select></label>
            <span class="at-hint">Registros já usados em outras operações não são excluídos: apenas inativados.</span></section>` : ''}
    </form>`;
}

/** Campos da aba; no layout ERP, em grade de 12 colunas com seções (Endereço, Contato...) que podem ser recolhidas. */
function cadCorpoDaAba(def, aba, st, readonly) {
    if (def.layout !== 'erp') return `<div class="at-form">${aba.fields.map(f => cadCampoHtml(def, f, st, readonly)).join('')}${aba.fields.length === 0 ? '<div class="at-empty">Sem campos.</div>' : ''}</div>`;
    const blocos = [];
    let atual = { titulo: '', campos: [] };
    aba.fields.forEach(f => { if (f.secao) { blocos.push(atual); atual = { titulo: f.secao, campos: [] }; } else atual.campos.push(f); });
    blocos.push(atual);
    return blocos.filter(b => b.titulo || b.campos.length).map(b => {
        const oculto = b.titulo && (st.secoes || {})[b.titulo];
        return `<div class="cd-secao">
            ${b.titulo ? `<h3 class="cd-sec" onclick="cadSecao(${escapeHtml(JSON.stringify(b.titulo))})" role="button" tabindex="0" aria-expanded="${!oculto}">${escapeHtml(b.titulo)} ${lucideIcon(oculto ? 'eye-off' : 'eye', 'w-4 h-4')}</h3>` : ''}
            ${oculto ? '' : `<div class="cd-grid12">${b.campos.map(f => cadCampoHtml(def, f, st, readonly)).join('')}</div>`}
        </div>`;
    }).join('');
}

function cadSecao(titulo) { const st = cadState(); st.secoes = st.secoes || {}; st.secoes[titulo] = !st.secoes[titulo]; render(); }

function cadSituacaoForm(v) { const st = cadState(); st.form.ativo = v === '1'; st.dirty = true; render(); }
function cadCancelar() { const st = cadState(); if (st.dirty && !confirm('Descartar as alterações feitas?')) return; if (st.id) cadAbrirRegistro(st.id, 'view'); else cadVoltar(); }

// ============================================================ VALIDAÇÃO E GRAVAÇÃO

function cadValidar(def, form, id) {
    const erros = [];
    const campos = cadCamposDe(def);
    campos.forEach(f => {
        if (f.type === 'itens') {
            const linhas = (form[f.k] || []).filter(l => Object.values(l).some(x => String(x ?? '').trim() !== ''));
            if (f.req && !linhas.length) erros.push({ campo: f.k, mensagem: `Inclua ao menos um item em ${f.label.toLowerCase()}.` });
            linhas.forEach((l, n) => f.colunas.filter(c => c.req).forEach(c => { if (String(l[c.k] ?? '').trim() === '') erros.push({ campo: f.k, mensagem: `Item ${n + 1}: informe ${c.label.toLowerCase()}.` }); }));
            return;
        }
        if (f.ro || f.type === 'lista') return;
        const v = form[f.k];
        const vazio = v === undefined || v === null || String(v).trim() === '';
        const relaxa = def.key === 'paciente' && form.provisorio && f.k !== 'nome'; // paciente não identificado: só a descrição é obrigatória
        if (f.req && vazio && !relaxa && !(f.type === 'password' && id)) erros.push({ campo: f.k, mensagem: `Informe ${cadRotuloCampo(f, form).toLowerCase()}.` });
        if (vazio) return;
        const s = String(v).trim();
        if (f.type === 'doc') {
            const n = onlyDigits(s).length;
            if (n !== 11 && n !== 14) erros.push({ campo: f.k, mensagem: 'Informe um CPF (11 dígitos) ou um CNPJ (14 dígitos).' });
            else if (n === 11 ? !validateCPF(s) : !validateCNPJ(s)) erros.push({ campo: f.k, mensagem: n === 11 ? 'CPF inválido.' : 'CNPJ inválido.' });
        }
        if (f.type === 'digits' && f.len && onlyDigits(s).length !== f.len) erros.push({ campo: f.k, mensagem: `${f.label}: informe ${f.len} dígitos.` });
        if (f.type === 'cnpj' && !validateCNPJ(s)) erros.push({ campo: f.k, mensagem: 'CNPJ inválido.' });
        if (f.type === 'cpf' && !validateCPF(s)) erros.push({ campo: f.k, mensagem: 'CPF inválido.' });
        if (f.type === 'phone' && !validatePhone(s)) erros.push({ campo: f.k, mensagem: 'Telefone inválido. Use DDD + número.' });
        if (f.type === 'email' && !validateEmail(s)) erros.push({ campo: f.k, mensagem: 'E-mail inválido.' });
        if (f.type === 'cep' && onlyDigits(s).length !== 8) erros.push({ campo: f.k, mensagem: 'CEP inválido.' });
        if ((f.type === 'number' || f.type === 'money') && (isNaN(Number(s)) || Number(s) < (f.min ?? 0))) erros.push({ campo: f.k, mensagem: `${f.label}: valor inválido.` });
        if (f.max && f.type === 'number' && Number(s) > f.max) erros.push({ campo: f.k, mensagem: `${f.label}: máximo ${f.max}.` });
    });
    // unicidade ("a+b" = combinação de campos)
    const outros = cadStoreOf(def).rows(def).filter(r => r.id !== id);
    (def.unique || []).forEach(regra => {
        const ks = regra.split('+');
        const chave = (o) => ks.map(k => searchKey(String(o[k] ?? '').replace(/[.\-/]/g, ''))).join('|');
        if (ks.some(k => !String(form[k] ?? '').trim())) return;
        if (outros.some(o => chave(o) === chave(form))) {
            erros.push({ campo: ks[0] === 'descricao' && ks.length > 1 ? 'descricao' : ks[0], mensagem: `Já existe um registro com ${ks.map(cadNomeCampo(def)).join(' + ')} igual.` });
        }
    });
    if (def.validate) erros.push(...def.validate(form, id));
    return erros;
}

/** Vínculos ativos que impedem a inativação. Devolve lista de textos. */
function cadDependencias(def, id) {
    const rec = cadStoreOf(def).rows(def).find(r => r.id === id);
    return (def.usedBy || []).map(u => {
        const valor = u.por && rec ? String(rec[u.por]) : id;
        const n = cadRowsOf(u.key).filter(r => r.ativo && String(r[u.field]) === valor).length;
        return n ? `${n} ${u.label}` : null;
    }).filter(Boolean);
}

async function cadSalvar(event) {
    event.preventDefault();
    const st = cadState();
    if (st.saving) return; // evita envio duplicado
    const def = cadDef();
    const store = cadStoreOf(def);
    const novo = !st.id;
    if (!cadCan(def, novo ? 'criar' : 'editar')) return showMsg('Seu perfil não tem permissão para salvar.', 'error');

    const erros = cadValidar(def, st.form, st.id);
    const deps = !novo && st.form.ativo === false ? cadDependencias(def, st.id) : [];
    if (!erros.length && deps.length) erros.push({ campo: null, mensagem: `Não é possível inativar: existem vínculos ativos (${deps.join(', ')}).` });
    if (erros.length) {
        const alvo = erros.find(e => e.campo);
        if (alvo) {
            const aba = cadAbas(def, st.form).find(t => (t.fields || []).some(f => f.k === alvo.campo));
            if (aba && aba.id !== st.tab) { st.tab = aba.id; render(); }
        }
        showFieldErrors('cad', erros.filter(e => e.campo));
        showMsg(erros[0].mensagem, 'error');
        return;
    }

    const formEl = document.getElementById('cad-form');
    st.saving = true;
    setFormBusy(formEl, true);
    try {
        const salvo = await store.save(def, st.form, st.id);
        showMsg(`${def.singular} ${novo ? 'cadastrado' : 'atualizado'} com sucesso!`);
        st.saving = false; st.dirty = false;
        st.mode = 'list'; st.id = null; st.form = {};
        const L = cadList(def);
        if (novo) { L.q = ''; L.filtros = {}; L.situacao = 'ativos'; L.page = 1; }
        renderFresh(); window.scrollTo(0, 0);
        return salvo;
    } catch (err) {
        st.saving = false;
        setFormBusy(formEl, false);
        showMsg(err.message || 'Não foi possível salvar.', 'error');
    }
}

async function cadMudarSituacao(id, ativo) {
    const def = cadDef();
    if (!cadCan(def, 'inativar')) return showMsg('Seu perfil não pode alterar a situação.', 'error');
    const rec = cadStoreOf(def).rows(def).find(r => r.id === id);
    if (!rec) return;
    if (!ativo) {
        const deps = cadDependencias(def, id);
        if (deps.length) return showMsg(`Não é possível inativar "${def.rotulo(rec)}": existem vínculos ativos (${deps.join(', ')}).`, 'error');
    }
    if (!confirm(`${ativo ? 'Reativar' : 'Inativar'} "${def.rotulo(rec)}"?${ativo ? '' : '\nO registro continua no histórico, mas deixa de aparecer nos seletores.'}`)) return;
    try {
        await cadStoreOf(def).setAtivo(def, id, ativo);
        showMsg(`${def.singular} ${ativo ? 'reativado' : 'inativado'} com sucesso!`);
        render();
    } catch (err) { showMsg(err.message || 'Não foi possível alterar a situação.', 'error'); }
}
const cadInativar = (id) => cadMudarSituacao(id, false);
const cadReativar = (id) => cadMudarSituacao(id, true);

// ============================================================ STORES (como cada entidade lê e grava)

const CAD_STORES = {
    // Coleção própria cad_<entidade>
    generic: {
        watch: (def) => db_cadWatch(def.key),
        rows: (def) => (CAD_DATA[def.key] || []).map(r => ({ ...r, ativo: r.ativo !== false })),
        async save(def, form, id) {
            requirePermission_cad(def, id ? 'editar' : 'criar');
            const agora = nowISO();
            const user = state.currentUser;
            const dados = {};
            cadCamposDe(def).forEach(f => {
                if (f.ro || f.k === 'ativo_sel' || f.type === 'arquivo') return;
                let v = form[f.k];
                if (v === undefined || v === null) v = f.type === 'check' ? false : '';
                if (f.type === 'lista' || f.type === 'itens') { dados[f.k] = Array.isArray(v) ? v : []; return; }
                if (typeof v === 'string') v = v.trim();
                if (['cnpj', 'cpf', 'cep', 'phone', 'doc', 'digits'].includes(f.type)) v = onlyDigits(v);
                if (f.type === 'doc') dados.pessoa = cadPessoaDoDoc(v);
                if ((f.type === 'number' || f.type === 'money') && v !== '') v = Number(v);
                dados[f.k] = v;
            });
            dados.busca = searchKey(Object.values(dados).filter(x => typeof x === 'string').join(' '));
            if (def.validar) Object.assign(dados, (await def.validar(form, id, dados)) || {});
            if (!id) {
                const reg = { id: newId(def.key.slice(0, 3)), codigo: await db_cadProximoCodigo(def.key, def.prefix), ...dados, ativo: true, criado_em: agora, criado_por: user.username, atualizado_em: agora, atualizado_por: user.username, versao: 1 };
                await db_cadSalvar(def.key, reg);
                await auditar({ entidade: 'cad_' + def.key, entidade_id: reg.id, acao: 'CRIAR', depois: { codigo: reg.codigo, rotulo: def.rotulo(reg) } });
                if (def.depois) await def.depois(reg, form);
                return reg;
            }
            const atual = CAD_DATA[def.key].find(r => r.id === id);
            if (!atual) throw new Error('Registro não encontrado.');
            const ativoNovo = form.ativo !== false;
            const diff = diffCampos(atual, { ...dados, ativo: ativoNovo }, [...Object.keys(dados).filter(k => k !== 'busca'), 'ativo']);
            if (!diff.campos.length) throw new Error('Nenhuma informação foi alterada.');
            const reg = { id, ...dados, ativo: ativoNovo, atualizado_em: agora, atualizado_por: user.username, versao: (atual.versao || 1) + 1 };
            await db_cadSalvar(def.key, reg);
            await auditar({ entidade: 'cad_' + def.key, entidade_id: id, acao: 'EDITAR', antes: diff.antes, depois: diff.depois });
            if (def.depoisEdicao) await def.depoisEdicao({ ...atual, ...reg }, form, atual);
            return reg;
        },
        async setAtivo(def, id, ativo) {
            requirePermission_cad(def, 'inativar');
            await db_cadAlterarSituacao(def.key, id, ativo, { atualizado_em: nowISO(), atualizado_por: state.currentUser.username });
            await auditar({ entidade: 'cad_' + def.key, entidade_id: id, acao: ativo ? 'ATIVAR' : 'INATIVAR' });
        }
    },

    // Pacientes (coleção pacientes, a mesma da Recepção e da Emergência)
    paciente: {
        watch: () => { if (cadCan(CAD_DEFS.paciente, 'ver')) db_cadWatch('paciente', 'pacientes'); },
        rows: () => (CAD_DATA.paciente || []).map(r => ({ ...r, ativo: r.ativo !== false })),
        toForm: (def, r) => cadFormatarParaForm(def, r),
        async save(def, form, id) {
            requirePermission_cad(def, id ? 'editar' : 'criar');
            const provisorio = Boolean(form.provisorio);
            if (provisorio) {
                // Atendimento sem identificação: só a descrição é obrigatória; o prontuário provisório é gerado. Os dados reais entram depois, no MESMO registro.
                if (String(form.nome || '').trim().length < 5) throw new Error('Descreva o paciente não identificado (ex.: "Homem adulto, vítima de acidente").');
                if (!String(form.prontuario || '').trim()) form.prontuario = await db_cadProximoCodigo('paciente_provisorio', 'PROV');
            }
            const base = buildPacientePayload(form);
            if (!provisorio) {
                const erros = validatePacienteForm(form);
                if (erros.length) throw new Error(erros[0].mensagem);
                const dup = (await findDuplicatePacientes(base, id)).filter(d => d.bloqueia);
                if (dup.length) throw new Error(`Já existe paciente com ${dup[0].motivos.join(' / ').toLowerCase()}: ${dup[0].paciente.nome}.`);
            }
            base.provisorio = provisorio;
            const extras = {};
            ['cns', 'sexo', 'nome_mae', 'email', 'celular', 'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'municipio_id', 'uf', 'estado_civil', 'nacionalidade', 'naturalidade', 'profissao', 'raca_cor', 'etnia',
                'responsavel_nome', 'responsavel_parentesco', 'responsavel_telefone', 'observacoes'].forEach(k => {
                let v = String(form[k] ?? '').trim();
                if (['cep', 'responsavel_telefone', 'celular', 'cns'].includes(k)) v = onlyDigits(v);
                extras[k] = v;
            });
            extras.anotacoes = Array.isArray(form.anotacoes) ? form.anotacoes : [];
            const agora = nowISO();
            const user = state.currentUser;
            if (!id) {
                const p = { id: newId('pac'), ...base, ...extras, ativo: true, criado_em: agora, criado_por: user.username, criado_por_nome: user.name, atualizado_em: agora, atualizado_por: user.username };
                await db_savePaciente(p);
                await auditar({ entidade: 'paciente', entidade_id: p.id, acao: provisorio ? 'CRIAR_PROVISORIO' : 'CRIAR', depois: { nome: p.nome, prontuario: p.prontuario } });
                return p;
            }
            const atual = CAD_DATA.paciente.find(r => r.id === id);
            if (!atual) throw new Error('Paciente não encontrado.');
            const ativoNovo = form.ativo !== false;
            const novo = { ...base, ...extras, ativo: ativoNovo };
            const diff = diffCampos(atual, novo, Object.keys(novo).filter(k => !['nome_busca', 'nome_palavras'].includes(k)));
            if (!diff.campos.length) throw new Error('Nenhuma informação foi alterada.');
            await db_savePaciente({ id, ...novo, atualizado_em: agora, atualizado_por: user.username });
            await auditar({ entidade: 'paciente', entidade_id: id, acao: atual.provisorio && !provisorio ? 'IDENTIFICAR' : 'EDITAR', antes: diff.antes, depois: diff.depois });
            return { id, ...novo };
        },
        async setAtivo(def, id, ativo) {
            requirePermission_cad(def, 'inativar');
            await db_savePaciente({ id, ativo, atualizado_em: nowISO(), atualizado_por: state.currentUser.username });
            await auditar({ entidade: 'paciente', entidade_id: id, acao: ativo ? 'ATIVAR' : 'INATIVAR' });
        }
    },

    // Funcionários (coleção funcionarios, a mesma das Triagens)
    funcionario: {
        watch: () => { if (typeof db_watch === 'function') db_watch('funcionarios'); },
        rows: () => (MOCK_DATA.FUNCIONARIOS_TRIAGEM || []).map(r => ({ ...r, ativo: r.situacao !== 'INATIVO' })),
        async save(def, form, id) {
            requirePermission_cad(def, id ? 'editar' : 'criar');
            const dados = { nome: form.nome, matricula: form.matricula, cargo: form.cargo, categoria: form.categoria, situacao: form.ativo === false ? 'INATIVO' : 'ATIVO' };
            const extras = {};
            ['setor', 'telefone', 'email', 'admissao', 'usuario_acesso', 'registro_conselho', 'observacoes'].forEach(k => { extras[k] = String(form[k] ?? '').trim(); });
            if (extras.telefone) extras.telefone = onlyDigits(extras.telefone);
            extras.anotacoes = Array.isArray(form.anotacoes) ? form.anotacoes : [];
            return salvarFuncionario({ ...dados, ...extras }, id);
        },
        async setAtivo(def, id, ativo) { return alterarSituacaoFuncionario(id, ativo ? 'ATIVO' : 'INATIVO'); },
        toForm: (def, r) => ({ ...r, telefone: r.telefone ? formatPhone(r.telefone) : '' })
    },

    // Usuários do sistema (app_users)
    usuario: {
        watch: () => {},
        rows: () => Object.entries(USERS_DB).map(([username, u]) => ({ id: username, username, nome: u.name, role: u.role, perfil: getRoleLabel(u.role), setor: u.setor || '', email: u.email || '', ativo: u.ativo !== false })),
        toForm: (def, r) => ({ ...r, senha: '' }),
        async save(def, form, id) {
            requirePermission_cad(def, id ? 'editar' : 'criar');
            const username = String(form.username ?? '').toLowerCase().trim();
            if (!/^[a-z0-9]{3,30}$/.test(username)) throw new Error('Nome de usuário: use de 3 a 30 letras ou números.');
            if (!ASSIGNABLE_ROLES.includes(form.role)) throw new Error('Selecione o perfil de acesso.');
            const senha = String(form.senha ?? '');
            if (senha && !/^[a-zA-Z0-9]{4,}$/.test(senha)) throw new Error('A senha deve ter no mínimo 4 letras ou números.');
            const ativoNovo = form.ativo !== false;
            const eu = state.currentUser;
            if (!id) {
                if (USERS_DB[username]) throw new Error('Já existe um usuário com este nome de usuário.');
                if (!senha) throw new Error('Informe a senha do novo usuário.');
                USERS_DB[username] = { role: form.role, name: form.nome.trim(), setor: String(form.setor ?? '').trim(), email: String(form.email ?? '').trim(), ativo: true };
                await definirSenha(USERS_DB[username], senha);
                await auditar({ entidade: 'usuario', entidade_id: username, acao: 'CRIAR', depois: { nome: form.nome.trim(), perfil: form.role } });
            } else {
                const u = USERS_DB[id];
                if (!u) throw new Error('Usuário não encontrado.');
                if (id === eu.username && (form.role !== u.role || !ativoNovo)) throw new Error('Você não pode alterar o próprio perfil nem inativar a si mesmo.');
                if (u.role === 'ADMIN' && (form.role !== 'ADMIN' || !ativoNovo) && Object.values(USERS_DB).filter(x => x.role === 'ADMIN' && x.ativo !== false).length <= 1) throw new Error('É preciso manter ao menos um administrador ativo.');
                const antes = { nome: u.name, perfil: u.role, setor: u.setor || '', email: u.email || '', ativo: u.ativo !== false };
                const depois = { nome: form.nome.trim(), perfil: form.role, setor: String(form.setor ?? '').trim(), email: String(form.email ?? '').trim(), ativo: ativoNovo };
                const d = diffCampos(antes, depois, Object.keys(depois));
                if (!d.campos.length && !senha) throw new Error('Nenhuma informação foi alterada.');
                Object.assign(u, { name: depois.nome, role: depois.perfil, setor: depois.setor, email: depois.email, ativo: ativoNovo });
                if (senha) await definirSenha(u, senha);
                await auditar({ entidade: 'usuario', entidade_id: id, acao: 'EDITAR', antes: d.antes, depois: { ...d.depois, ...(senha ? { senha: 'alterada' } : {}) } });
            }
            saveToLocalStorage();
            const alvo = id || username;
            if (typeof db_saveMember === 'function') await db_saveMember(alvo, USERS_DB[alvo]);
            return USERS_DB[alvo];
        },
        async setAtivo(def, id, ativo) {
            requirePermission_cad(def, 'inativar');
            const u = USERS_DB[id];
            if (!u) throw new Error('Usuário não encontrado.');
            if (!ativo && id === state.currentUser.username) throw new Error('Você não pode inativar a si mesmo.');
            if (!ativo && u.role === 'ADMIN' && Object.values(USERS_DB).filter(x => x.role === 'ADMIN' && x.ativo !== false).length <= 1) throw new Error('É preciso manter ao menos um administrador ativo.');
            u.ativo = ativo;
            saveToLocalStorage();
            if (typeof db_saveMember === 'function') await db_saveMember(id, u);
            await auditar({ entidade: 'usuario', entidade_id: id, acao: ativo ? 'ATIVAR' : 'INATIVAR' });
        }
    }
};

function requirePermission_cad(def, acao) {
    if (!cadCan(def, acao)) throw new Error('Acesso negado: seu perfil não tem permissão para esta operação.');
}


// ---------------------------------------------------------------- buscas por CNPJ e CEP

/** Nome do município (lista do IBGE) pelo código de 7 dígitos. */
function cadNomeMunicipio(cod) {
    if (!cod) return '';
    for (const uf of Object.keys(IBGE_MUNICIPIOS)) { const m = IBGE_MUNICIPIOS[uf].find(x => String(x[0]) === String(cod)); if (m) return `${m[1]}/${uf}`; }
    return String(cod);
}

async function cadConsultar(url) {
    const resp = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!resp.ok) throw new Error(resp.status === 404 ? 'Nada encontrado para o valor informado.' : 'O serviço de consulta não respondeu. Tente novamente.');
    return resp.json();
}

function cadPreencher(st, valores) {
    Object.entries(valores).forEach(([k, v]) => { if (v !== undefined && v !== null && String(v).trim() !== '') st.form[k] = v; });
    st.dirty = true;
}

function cadAvisoMunicipio(st, ibge, nome, uf) {
    if ((IBGE_MUNICIPIOS[uf] || []).some(m => String(m[0]) === String(ibge))) { st.form.municipio_id = String(ibge); return ''; }
    return ` O município ${nome}/${uf} não foi encontrado na lista do IBGE: escolha-o manualmente.`;
}

/** Botão ao lado do CNPJ: preenche os dados da empresa pela Receita (BrasilAPI). Só envia o CNPJ digitado. */
async function cadBuscarCnpj() {
    const st = cadState();
    const cnpj = onlyDigits(st.form.documento);
    if (cnpj.length !== 14 || !validateCNPJ(cnpj)) return showMsg('Informe um CNPJ válido (14 dígitos) para buscar.', 'error');
    if (st.buscando) return;
    st.buscando = true;
    showMsg('Buscando CNPJ...');
    try {
        const d = await cadConsultar(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
        const fone = onlyDigits(d.ddd_telefone_1);
        cadPreencher(st, {
            razao_social: String(d.razao_social || '').toUpperCase(),
            nome_fantasia: String(d.nome_fantasia || '').toUpperCase(),
            telefone: fone.length >= 10 ? formatPhone(fone) : '',
            email: String(d.email || '').toLowerCase(),
            cep: d.cep ? formatCEP(String(d.cep)) : '',
            uf: d.uf, logradouro: [d.descricao_tipo_de_logradouro, d.logradouro].filter(Boolean).join(' '),
            numero: d.numero, complemento: d.complemento, bairro: d.bairro
        });
        const aviso = cadAvisoMunicipio(st, d.codigo_municipio_ibge, d.municipio, d.uf);
        st.buscando = false;
        renderFresh();
        showMsg(`Dados do CNPJ carregados: confira antes de salvar.${aviso}`, aviso ? 'error' : 'success');
    } catch (err) {
        st.buscando = false;
        showMsg(err.message || 'Não foi possível consultar o CNPJ.', 'error');
    }
}

/** Botão ao lado do CEP: preenche endereço, bairro, UF e município pelo ViaCEP. Só envia o CEP digitado. */
async function cadBuscarCep() {
    const st = cadState();
    const cep = onlyDigits(st.form.cep);
    if (cep.length !== 8) return showMsg('Informe o CEP completo (8 dígitos) para buscar.', 'error');
    if (st.buscando) return;
    st.buscando = true;
    showMsg('Buscando CEP...');
    try {
        const d = await cadConsultar(`https://viacep.com.br/ws/${cep}/json/`);
        if (d.erro) throw new Error('CEP não encontrado.');
        cadPreencher(st, { logradouro: d.logradouro, bairro: d.bairro, uf: d.uf });
        if (d.complemento && !st.form.complemento) st.form.complemento = d.complemento;
        const aviso = cadAvisoMunicipio(st, d.ibge, d.localidade, d.uf);
        st.buscando = false;
        renderFresh();
        showMsg(`Endereço carregado.${aviso}`, aviso ? 'error' : 'success');
        document.getElementById('cad_numero')?.focus();
    } catch (err) {
        st.buscando = false;
        showMsg(err.message || 'Não foi possível consultar o CEP.', 'error');
    }
}


// ============================================================ COMBOBOX PADRONIZADO
// Substitui o <select> nativo (cuja lista não segue o visual do sistema). A lista abre logo abaixo do campo,
// com a mesma largura, cantos arredondados, destaque do item escolhido e busca quando há muitas opções.

/**
 * opts: [{ id, rotulo }] ou strings. fn/arg: função global chamada ao escolher: fn(valor) ou fn(arg, valor).
 * vazio: texto do primeiro item (que limpa a escolha); null = sem item vazio.
 */
function cadComboHtml({ id, valor = '', opts = [], placeholder = 'Selecione', fn, arg = '', vazio = 'Selecione', desabilitado = false }) {
    const lista = opts.map(o => ({ id: cadOptId(o), rotulo: cadOptRotulo(o) }));
    const atual = lista.find(o => o.id === valor);
    const itens = [...(vazio === null ? [] : [{ id: '', rotulo: vazio }]), ...lista];
    return `<div class="cd-combo" data-fn="${fn}" data-arg="${escapeHtml(arg)}">
        <button type="button" class="cd-combo__btn" id="${id}" aria-haspopup="listbox" aria-expanded="false" data-keep="${id}" ${desabilitado ? 'disabled' : ''}>
            <span class="cd-combo__txt ${atual ? '' : 'is-ph'}">${escapeHtml(atual ? atual.rotulo : placeholder)}</span>${lucideIcon('chevron-down', 'w-4 h-4')}
        </button>
        <div class="cd-combo__pop" role="listbox">
            ${lista.length > 8 ? '<input type="search" class="cd-combo__q" placeholder="Pesquisar..." autocomplete="off" aria-label="Pesquisar na lista">' : ''}
            <div class="cd-combo__items">${itens.map(o => `<button type="button" role="option" class="cd-combo__opt ${o.id === valor ? 'is-sel' : ''}" data-v="${escapeHtml(o.id)}" aria-selected="${o.id === valor}"><span>${escapeHtml(o.rotulo)}</span>${o.id === valor && o.id !== '' ? lucideIcon('check', 'w-4 h-4') : ''}</button>`).join('')}</div>
        </div>
    </div>`;
}

function cadComboFechar() {
    document.querySelectorAll('.cd-combo.is-open').forEach(c => { c.classList.remove('is-open', 'is-up'); c.querySelector('.cd-combo__btn')?.setAttribute('aria-expanded', 'false'); });
}

document.addEventListener('click', (e) => {
    const opt = e.target.closest('.cd-combo__opt');
    if (opt) {
        const combo = opt.closest('.cd-combo');
        const fn = window[combo.dataset.fn];
        cadComboFechar();
        if (typeof fn === 'function') (combo.dataset.arg ? fn(combo.dataset.arg, opt.dataset.v) : fn(opt.dataset.v));
        return;
    }
    const btn = e.target.closest('.cd-combo__btn');
    if (btn) {
        const combo = btn.closest('.cd-combo');
        const estavaAberto = combo.classList.contains('is-open');
        cadComboFechar();
        if (!estavaAberto) {
            combo.classList.add('is-open');
            btn.setAttribute('aria-expanded', 'true');
            const r = btn.getBoundingClientRect();
            if (window.innerHeight - r.bottom < 280 && r.top > 280) combo.classList.add('is-up');
            const q = combo.querySelector('.cd-combo__q');
            if (q) { q.value = ''; q.dispatchEvent(new Event('input')); q.focus(); }
            else combo.querySelector('.cd-combo__opt.is-sel, .cd-combo__opt')?.focus();
        }
        return;
    }
    if (!e.target.closest('.cd-combo__pop')) cadComboFechar();
});

document.addEventListener('input', (e) => {
    if (!e.target.classList || !e.target.classList.contains('cd-combo__q')) return;
    const termo = searchKey(e.target.value);
    e.target.closest('.cd-combo').querySelectorAll('.cd-combo__opt').forEach(o => { o.hidden = Boolean(termo) && !searchKey(o.textContent).includes(termo); });
});

document.addEventListener('keydown', (e) => {
    const combo = e.target.closest && e.target.closest('.cd-combo');
    if (e.key === 'Escape' && document.querySelector('.cd-combo.is-open')) { const b = document.querySelector('.cd-combo.is-open .cd-combo__btn'); cadComboFechar(); b?.focus(); return; }
    if (!combo || !combo.classList.contains('is-open') || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
    e.preventDefault();
    const itens = [...combo.querySelectorAll('.cd-combo__opt')].filter(o => !o.hidden);
    const i = itens.indexOf(document.activeElement);
    (itens[e.key === 'ArrowDown' ? Math.min(i + 1, itens.length - 1) : Math.max(i - 1, 0)] || itens[0])?.focus();
});

/** Escolha feita num combobox de campo do formulário. */
function cadSelecionar(k, v) {
    cadCampo(k, { value: v, type: 'select' });
    render();
}


// ============================================================ IMPRESSÃO DA CONSULTA

/** Texto dos filtros aplicados, para constar no topo da impressão. */
function cadResumoFiltros(def) {
    const L = cadList(def);
    const partes = [];
    if (L.q) partes.push(`Pesquisa: "${L.q}"`);
    (def.filters || []).forEach(f => {
        const v = L.filtros[f.k];
        if (!v) return;
        const opts = f.ref ? cadRowsOf(f.ref).map(r => ({ id: r.id, rotulo: CAD_DEFS[f.ref].rotulo(r) })) : cadOptsOf(f);
        const o = opts.find(x => cadOptId(x) === v);
        partes.push(`${f.label}: ${o ? cadOptRotulo(o) : v}`);
    });
    partes.push(`Situação: ${{ ativos: 'Ativos', inativos: 'Inativos', todos: 'Todos' }[L.situacao]}`);
    return partes.join(' · ');
}

/** HTML da listagem para impressão: TODOS os registros do filtro atual (não só a página), com cabeçalho e rodapé. */
function cadHtmlImpressao(def) {
    const rows = cadFiltrar(def);
    const colunas = def.columns;
    const hospital = APP_INFO.hospital;
    const agora = new Date();
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Listagem de ${escapeHtml(def.label)}</title>
<style>
  @page { size: A4 ${colunas.length > 5 ? 'landscape' : 'portrait'}; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; }
  h1 { margin: 0; font-size: 17px; } h2 { margin: 2px 0 0; font-size: 13px; font-weight: 600; }
  .meta { margin: 8px 0 12px; color: #444; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  th, td { border: 1px solid #999; padding: 4px 6px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
  th { background: #e5e7eb; font-size: 10px; text-transform: uppercase; letter-spacing: .03em; }
  tr { page-break-inside: avoid; }
  tr.off td { color: #666; }
  .rodape { margin-top: 10px; color: #555; font-size: 10px; }
</style></head><body>
<h1>${escapeHtml(hospital)}</h1>
<h2>Listagem de ${escapeHtml(def.label)}</h2>
<div class="meta">${escapeHtml(cadResumoFiltros(def))}<br>
Emitido em ${escapeHtml(formatDateTimeBR(agora.toISOString()))} por ${escapeHtml(state.currentUser.name)} · ${rows.length} registro(s)</div>
<table><thead><tr>${colunas.map(c => `<th>${escapeHtml(c.label)}</th>`).join('')}<th>Situação</th></tr></thead>
<tbody>${rows.map(r => `<tr class="${r.ativo ? '' : 'off'}">${colunas.map(c => `<td>${escapeHtml(c.get ? c.get(r) : (r[c.k] ?? '—'))}</td>`).join('')}<td>${r.ativo ? 'Ativo' : 'Inativo'}</td></tr>`).join('')}</tbody></table>
<div class="rodape">Documento gerado pelo sistema de Gestão de Estoque. Contém dados de uso interno${def.sensivel ? ' e dados pessoais protegidos pela LGPD: guarde e descarte com segurança' : ''}.</div>
</body></html>`;
}

/**
 * Mostra o documento numa pré-visualização e só imprime quando o usuário clica em "Imprimir": assim o navegador abre a janela
 * de impressão (escolha da impressora, ou "Salvar como PDF"). Um quadro invisível sendo impresso sozinho é bloqueado por alguns navegadores.
 */
function cadImprimirHtml(html, titulo = 'Pré-visualização de impressão') {
    const dialog = openModal({
        title: titulo, size: 'xl',
        content: `<div class="modal__body prev-corpo">
            <div class="prev-barra"><button type="button" class="at-btn at-btn--primary at-btn--sm" style="flex:none" data-imprimir>${lucideIcon('printer', 'w-4 h-4')} Imprimir / escolher impressora</button>
                <button type="button" class="at-btn at-btn--ghost at-btn--sm" data-aba>${lucideIcon('external-link', 'w-4 h-4')} Abrir em outra aba</button>
                <span class="at-hint">Na janela de impressão você escolhe a impressora ou "Salvar como PDF".</span></div>
            <iframe class="prev-quadro" title="Documento para impressão"></iframe></div>`
    });
    const quadro = dialog.querySelector('.prev-quadro');
    quadro.srcdoc = html;
    dialog.querySelector('[data-imprimir]').addEventListener('click', () => {
        try { quadro.contentWindow.focus(); quadro.contentWindow.print(); }
        catch (err) { showMsg('Não foi possível abrir a impressão. Use "Abrir em outra aba" e imprima por lá (Ctrl+P).', 'error'); }
    });
    dialog.querySelector('[data-aba]').addEventListener('click', () => {
        const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
        const w = window.open(url, '_blank');
        if (!w) showMsg('O navegador bloqueou a nova aba. Libere pop-ups para este site.', 'error');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    });
}

function cadImprimir() {
    const def = cadDef();
    if (!cadCan(def, 'ver')) return showMsg('Seu perfil não pode imprimir esta consulta.', 'error');
    if (!cadFiltrar(def).length) return showMsg('Não há registros para imprimir com os filtros atuais.', 'error');
    if (def.sensivel && typeof registrarAcesso === 'function') registrarAcesso(def.key, 'listagem', 'Impressão da listagem de ' + def.label);
    cadImprimirHtml(cadHtmlImpressao(def));
}

// ============================================================ ENTRADA

function renderCad() {
    const st = cadState();
    const def = st.key ? CAD_DEFS[st.key] : null;
    if (!def) return '<div class="at-empty">Selecione um cadastro no menu.</div>';
    if (!cadCan(def, 'ver')) return '<div class="p-8 text-center text-red-600 font-bold text-xl">Acesso Negado</div>';
    cadWatchEntity(def.key);
    return st.mode === 'list' ? renderCadList(def) : renderCadForm(def, st.mode === 'view');
}
