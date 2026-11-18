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

const cadOptsOf = (f) => (typeof f.opts === 'function' ? f.opts() : (f.opts || []));
const cadOptId = (o) => (typeof o === 'string' ? o : o.id);
const cadOptRotulo = (o) => (typeof o === 'string' ? o : o.rotulo);

// ============================================================ CONSULTA

function cadList(def) {
    const st = cadState();
    if (!st.lists[def.key]) st.lists[def.key] = { q: '', filtros: {}, situacao: 'ativos', sort: { k: (def.columns[0] || {}).k, dir: 'asc' }, page: 1, size: 10 };
    return st.lists[def.key];
}

function cadFiltrar(def) {
    const L = cadList(def);
    const q = searchKey(L.q);
    let rows = cadStoreOf(def).rows(def);
    if (L.situacao === 'ativos') rows = rows.filter(r => r.ativo);
    else if (L.situacao === 'inativos') rows = rows.filter(r => !r.ativo);
    Object.entries(L.filtros).forEach(([k, v]) => { if (v) rows = rows.filter(r => String(r[k] ?? '') === v); });
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
    const L = cadList(def);
    const rows = cadFiltrar(def);
    const pages = Math.max(1, Math.ceil(rows.length / L.size));
    if (L.page > pages) L.page = pages;
    const pageRows = rows.slice((L.page - 1) * L.size, L.page * L.size);
    const podeCriar = cadCan(def, 'criar');
    const filtrosAtivos = L.q || L.situacao !== 'ativos' || Object.values(L.filtros).some(Boolean);

    const filterSelect = (f) => {
        const opts = f.ref ? cadRowsOf(f.ref).filter(r => r.ativo).map(r => ({ id: r.id, rotulo: CAD_DEFS[f.ref].rotulo(r) })) : cadOptsOf(f);
        return `<label class="cd-filter"><span>${escapeHtml(f.label)}</span>
            <select class="at-select" onchange="cadFiltro('${f.k}', this.value)" data-keep="cdf_${f.k}">
                <option value="">Todos</option>${opts.map(o => `<option value="${escapeHtml(cadOptId(o))}" ${L.filtros[f.k] === cadOptId(o) ? 'selected' : ''}>${escapeHtml(cadOptRotulo(o))}</option>`).join('')}
            </select></label>`;
    };

    return `
    <div class="cd-page at-stack tone-blue">
        <header class="cd-head">
            <div class="cd-head__ico">${lucideIcon(def.icon, 'w-7 h-7')}</div>
            <div class="cd-head__txt"><h2>${escapeHtml(def.label)}</h2><p>${escapeHtml(def.desc)}</p></div>
            ${podeCriar ? `<button type="button" class="at-btn at-btn--primary cd-new" onclick="cadNovo()">${lucideIcon('plus', 'w-5 h-5')} Novo Cadastro</button>` : ''}
        </header>

        <div class="cd-kpis">${cadKpis(def, rows).map(k => `<div class="cd-kpi"><strong>${escapeHtml(k.valor)}</strong><span>${escapeHtml(k.rotulo)}</span></div>`).join('')}</div>

        <section class="at-card cd-filters" aria-label="Pesquisa e filtros">
            <label class="cd-filter cd-filter--grow"><span>Pesquisar</span>
                <input class="at-input" id="cd_q" type="search" value="${escapeHtml(L.q)}" placeholder="${escapeHtml('Pesquisar por ' + def.search.map(cadNomeCampo(def)).join(', '))}" oninput="cadBusca(this.value)" data-keep="cd_q" autocomplete="off">
            </label>
            ${def.filters.map(filterSelect).join('')}
            <label class="cd-filter"><span>Situação</span>
                <select class="at-select" onchange="cadSituacao(this.value)" data-keep="cd_sit">
                    <option value="ativos" ${L.situacao === 'ativos' ? 'selected' : ''}>Ativos</option>
                    <option value="inativos" ${L.situacao === 'inativos' ? 'selected' : ''}>Inativos</option>
                    <option value="todos" ${L.situacao === 'todos' ? 'selected' : ''}>Todos</option>
                </select></label>
            <button type="button" class="at-btn at-btn--ghost at-btn--sm cd-clear" onclick="cadLimpar()" ${filtrosAtivos ? '' : 'disabled'}>${lucideIcon('eraser', 'w-4 h-4')} Limpar filtros</button>
        </section>

        <section class="at-card" style="padding:0;overflow:hidden">
            <div class="cd-tablewrap"><table class="tri-table cd-table">
                <thead><tr>
                    ${def.columns.map(c => `<th ${c.sort ? `class="is-sort" onclick="cadOrdenar('${c.k}')" aria-sort="${L.sort.k === c.k ? (L.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}"` : ''}>${escapeHtml(c.label)}${L.sort.k === c.k ? (L.sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>`).join('')}
                    <th>Situação</th><th class="cd-actcol">Ações</th>
                </tr></thead>
                <tbody>${pageRows.length ? pageRows.map(r => `<tr class="${r.ativo ? '' : 'is-off'}">
                    ${def.columns.map(c => `<td data-label="${escapeHtml(c.label)}">${escapeHtml(c.get ? c.get(r) : (r[c.k] ?? '—'))}</td>`).join('')}
                    <td data-label="Situação">${cadBadge(r)}</td>
                    <td class="cd-actcol">
                        <button type="button" class="cd-ico" title="Visualizar" aria-label="Visualizar" onclick="cadVer(${cadArg(r.id)})">${lucideIcon('eye', 'w-4 h-4')}</button>
                        ${cadCan(def, 'editar') ? `<button type="button" class="cd-ico" title="Editar" aria-label="Editar" onclick="cadEditar(${cadArg(r.id)})">${lucideIcon('pencil', 'w-4 h-4')}</button>` : ''}
                        ${cadCan(def, 'inativar') ? (r.ativo
                            ? `<button type="button" class="cd-ico cd-ico--warn" title="Inativar" aria-label="Inativar" onclick="cadInativar(${cadArg(r.id)})">${lucideIcon('ban', 'w-4 h-4')}</button>`
                            : `<button type="button" class="cd-ico cd-ico--ok" title="Reativar" aria-label="Reativar" onclick="cadReativar(${cadArg(r.id)})">${lucideIcon('rotate-ccw', 'w-4 h-4')}</button>`) : ''}
                    </td></tr>`).join('') : `<tr><td colspan="${def.columns.length + 2}" class="at-empty">${cadStoreOf(def).rows(def).length ? 'Nenhum registro encontrado com estes filtros.' : 'Nenhum registro cadastrado ainda.'}</td></tr>`}
                </tbody></table></div>
            <footer class="cd-pager">
                <span>${rows.length} registro(s)</span>
                <label>Por página
                    <select class="at-select" onchange="cadTamanho(this.value)" data-keep="cd_size">${[10, 25, 50].map(n => `<option ${L.size === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
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
const cadBadge = (r) => `<span class="at-badge ${r.ativo ? 'at-badge--ok' : 'at-badge--off'}">${r.ativo ? 'Ativo' : 'Inativo'}</span>`;
const cadNomeCampo = (def) => (k) => {
    const f = cadCamposDe(def).find(x => x.k === k);
    const c = def.columns.find(x => x.k === k);
    return ((f && f.label) || (c && c.label) || k).toLowerCase();
};
const cadCamposDe = (def) => [...(def.top || []), ...(def.tabs || []).flatMap(t => t.fields || [])];

// Ações da consulta
function cadBusca(v) { const L = cadList(cadDef()); L.q = v; L.page = 1; clearTimeout(cadBusca.t); cadBusca.t = setTimeout(render, 180); }
function cadFiltro(k, v) { const L = cadList(cadDef()); L.filtros[k] = v; L.page = 1; render(); }
function cadSituacao(v) { const L = cadList(cadDef()); L.situacao = v; L.page = 1; render(); }
function cadLimpar() { const L = cadList(cadDef()); L.q = ''; L.filtros = {}; L.situacao = 'ativos'; L.page = 1; renderFresh(); }
function cadOrdenar(k) { const L = cadList(cadDef()); L.sort = { k, dir: L.sort.k === k && L.sort.dir === 'asc' ? 'desc' : 'asc' }; render(); }
function cadPagina(n) { const L = cadList(cadDef()); L.page = Math.max(1, n); render(); }
function cadTamanho(n) { const L = cadList(cadDef()); L.size = Number(n); L.page = 1; render(); }

// ============================================================ CADASTRO / VISUALIZAÇÃO

function cadNovo() {
    const def = cadDef();
    if (!cadCan(def, 'criar')) return showMsg('Seu perfil não pode criar este cadastro.', 'error');
    const st = cadState();
    st.mode = 'form'; st.id = null; st.tab = cadAbas(def, {})[0].id; st.dirty = false; st.saving = false;
    st.form = { ativo: true, ...((cadStoreOf(def).defaults && cadStoreOf(def).defaults(def)) || {}) };
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
    st.form = cadStoreOf(def).toForm ? cadStoreOf(def).toForm(def, rec) : { ...rec };
    renderFresh(); window.scrollTo(0, 0);
}
const cadEditar = (id) => cadAbrirRegistro(id, 'form');
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
    if (f.type === 'cnpj') v = el.value = formatCNPJ(v);
    else if (f.type === 'cpf') v = el.value = formatCPF(v);
    else if (f.type === 'cep') v = el.value = formatCEP(v);
    else if (f.type === 'phone') v = el.value = formatPhone(v);
    else if (f.type === 'upper') { const pos = el.selectionStart; v = el.value = v.toUpperCase(); try { el.setSelectionRange(pos, pos); } catch (e) { /* sem seleção */ } }
    st.form[k] = v;
    if (k === 'ativo_sel') st.form.ativo = v !== '0';
    st.dirty = true;
    cadCamposDe(def).filter(x => x.dep === k).forEach(x => { st.form[x.k] = ''; });
    if (f.rerender || cadCamposDe(def).some(x => x.dep === k)) render();
}

function cadControle(def, f, st, readonly) {
    const val = st.form[f.k] ?? '';
    const id = `cad_${f.k}`;
    if (readonly || f.ro || (f.roEdit && st.id)) return `<div class="cd-ro" id="${id}">${escapeHtml(cadValorLegivel(def, f, val) || '—')}</div>`;
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
            return `<select class="at-select" id="${id}" name="${f.k}" onchange="cadCampo('${f.k}', this)" ${keep}>
                <option value="">${semOpcoes ? 'Nenhum cadastro disponível' : 'Selecione'}</option>
                ${opts.map(o => `<option value="${escapeHtml(cadOptId(o))}" ${cadOptId(o) === val ? 'selected' : ''}>${escapeHtml(cadOptRotulo(o))}</option>`).join('')}</select>`;
        }
        case 'check': return `<label class="cd-check"><input type="checkbox" id="${id}" name="${f.k}" ${val ? 'checked' : ''} onchange="cadCampo('${f.k}', this)" ${keep}> <span>${escapeHtml(f.checkLabel || 'Sim')}</span></label>`;
        case 'date': return `<input class="at-input" type="date" id="${id}" name="${f.k}" value="${escapeHtml(val)}" ${f.max ? `max="${f.max}"` : ''} oninput="cadCampo('${f.k}', this)" ${keep}>`;
        case 'number': case 'money':
            return `<input class="at-input" type="number" inputmode="decimal" step="${f.type === 'money' ? '0.01' : (f.step || '1')}" min="${f.min ?? 0}" ${f.max ? `max="${f.max}"` : ''} id="${id}" name="${f.k}" value="${escapeHtml(val)}" placeholder="${escapeHtml(f.ph || '')}" ${on} ${keep}>`;
        case 'password': return `<input class="at-input" type="password" id="${id}" name="${f.k}" value="${escapeHtml(val)}" autocomplete="new-password" ${on} ${keep}>`;
        case 'email': return `<input class="at-input" type="email" id="${id}" name="${f.k}" value="${escapeHtml(val)}" maxlength="120" autocomplete="off" ${on} ${keep}>`;
        default: return `<input class="at-input" type="text" id="${id}" name="${f.k}" value="${escapeHtml(val)}" maxlength="${f.maxlen || 120}" placeholder="${escapeHtml(f.ph || '')}" autocomplete="off" ${on} ${keep}>`;
    }
}

function cadValorLegivel(def, f, val) {
    if (val === '' || val === null || val === undefined) return '';
    if (f.type === 'ref') return cadRotuloRef(f.ref, val);
    if (f.type === 'check') return val ? 'Sim' : 'Não';
    if (f.type === 'date') return formatDateBR(val);
    if (f.type === 'money') return formatMoney(val);
    if (f.type === 'password') return '••••••';
    if (f.type === 'select') { const o = cadOptsOf(f).find(x => cadOptId(x) === val); return o ? cadOptRotulo(o) : val; }
    return String(val);
}

function cadCampoHtml(def, f, st, readonly) {
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
    const podeSit = !readonly && !def.semSitForm && cadCan(def, 'inativar') && Boolean(st.id);
    const titulo = readonly ? `Visualizar ${def.singular}` : (st.id ? `Editar ${def.singular}` : `Novo ${def.singular}`);
    const ident = rec ? def.rotulo(rec) : '';

    const topHtml = def.top
        ? `<section class="at-card cd-top"><div class="at-form cd-topgrid">${def.top.map(f => cadCampoHtml(def, f, st, readonly)).join('')}</div></section>`
        : '';

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
            ${aba.render ? aba.render(def, st, readonly) : `<div class="at-form">${aba.fields.map(f => cadCampoHtml(def, f, st, readonly)).join('')}
                ${aba.fields.length === 0 ? '<div class="at-empty">Sem campos.</div>' : ''}</div>`}
            </div>
        </section>

        ${podeSit ? `<section class="at-card cd-sit"><label class="cd-filter"><span>Situação do registro</span>
            <select class="at-select" id="cad_ativo_sel" onchange="cadSituacaoForm(this.value)" data-keep="cad_ativo_sel">
                <option value="1" ${ativo ? 'selected' : ''}>Ativo</option><option value="0" ${ativo ? '' : 'selected'}>Inativo</option></select></label>
            <span class="at-hint">Registros já usados em outras operações não são excluídos: apenas inativados.</span></section>` : ''}
    </form>`;
}

function cadSituacaoForm(v) { const st = cadState(); st.form.ativo = v === '1'; st.dirty = true; render(); }
function cadCancelar() { const st = cadState(); if (st.dirty && !confirm('Descartar as alterações feitas?')) return; if (st.id) cadAbrirRegistro(st.id, 'view'); else cadVoltar(); }

// ============================================================ VALIDAÇÃO E GRAVAÇÃO

function cadValidar(def, form, id) {
    const erros = [];
    const campos = cadCamposDe(def);
    campos.forEach(f => {
        if (f.ro) return;
        const v = form[f.k];
        const vazio = v === undefined || v === null || String(v).trim() === '';
        if (f.req && vazio && !(f.type === 'password' && id)) erros.push({ campo: f.k, mensagem: `Informe ${f.label.toLowerCase()}.` });
        if (vazio) return;
        const s = String(v).trim();
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
    return (def.usedBy || []).map(u => {
        const n = cadRowsOf(u.key).filter(r => r.ativo && r[u.field] === id).length;
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
                let v = form[f.k];
                if (v === undefined || v === null) v = f.type === 'check' ? false : '';
                if (typeof v === 'string') v = v.trim();
                if (['cnpj', 'cpf', 'cep', 'phone'].includes(f.type)) v = onlyDigits(v);
                if ((f.type === 'number' || f.type === 'money') && v !== '') v = Number(v);
                dados[f.k] = v;
            });
            dados.busca = searchKey(Object.values(dados).filter(x => typeof x === 'string').join(' '));
            if (!id) {
                const reg = { id: newId(def.key.slice(0, 3)), codigo: await db_cadProximoCodigo(def.key, def.prefix), ...dados, ativo: true, criado_em: agora, criado_por: user.username, atualizado_em: agora, atualizado_por: user.username, versao: 1 };
                await db_cadSalvar(def.key, reg);
                await auditar({ entidade: 'cad_' + def.key, entidade_id: reg.id, acao: 'CRIAR', depois: { codigo: reg.codigo, rotulo: def.rotulo(reg) } });
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
        toForm: (def, r) => ({ ...r, cpf: r.cpf ? formatCPF(r.cpf) : '', telefone: r.telefone ? formatPhone(r.telefone) : '', responsavel_telefone: r.responsavel_telefone ? formatPhone(r.responsavel_telefone) : '', cep: r.cep ? formatCEP(r.cep) : '' }),
        async save(def, form, id) {
            requirePermission_cad(def, id ? 'editar' : 'criar');
            const base = buildPacientePayload(form);
            const erros = validatePacienteForm(form);
            if (erros.length) throw new Error(erros[0].mensagem);
            const dup = (await findDuplicatePacientes(base, id)).filter(d => d.bloqueia);
            if (dup.length) throw new Error(`Já existe paciente com ${dup[0].motivos.join(' / ').toLowerCase()}: ${dup[0].paciente.nome}.`);
            const extras = {};
            ['cns', 'sexo', 'nome_mae', 'email', 'cep', 'logradouro', 'numero', 'bairro', 'municipio_id', 'uf', 'estado_civil', 'responsavel_nome', 'responsavel_telefone', 'observacoes'].forEach(k => {
                let v = String(form[k] ?? '').trim();
                if (['cep', 'responsavel_telefone', 'cns'].includes(k)) v = onlyDigits(v);
                extras[k] = v;
            });
            const agora = nowISO();
            const user = state.currentUser;
            if (!id) {
                const p = { id: newId('pac'), ...base, ...extras, ativo: true, criado_em: agora, criado_por: user.username, criado_por_nome: user.name, atualizado_em: agora, atualizado_por: user.username };
                await db_savePaciente(p);
                await auditar({ entidade: 'paciente', entidade_id: p.id, acao: 'CRIAR', depois: { nome: p.nome, prontuario: p.prontuario } });
                return p;
            }
            const atual = CAD_DATA.paciente.find(r => r.id === id);
            if (!atual) throw new Error('Paciente não encontrado.');
            const ativoNovo = form.ativo !== false;
            const novo = { ...base, ...extras, ativo: ativoNovo };
            const diff = diffCampos(atual, novo, Object.keys(novo).filter(k => !['nome_busca', 'nome_palavras'].includes(k)));
            if (!diff.campos.length) throw new Error('Nenhuma informação foi alterada.');
            await db_savePaciente({ id, ...novo, atualizado_em: agora, atualizado_por: user.username });
            await auditar({ entidade: 'paciente', entidade_id: id, acao: 'EDITAR', antes: diff.antes, depois: diff.depois });
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
            ['setor', 'telefone', 'email', 'admissao', 'usuario_acesso'].forEach(k => { extras[k] = String(form[k] ?? '').trim(); });
            if (extras.telefone) extras.telefone = onlyDigits(extras.telefone);
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
                USERS_DB[username] = { password: senha, role: form.role, name: form.nome.trim(), setor: String(form.setor ?? '').trim(), email: String(form.email ?? '').trim(), ativo: true };
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
                if (senha) u.password = senha;
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

// ============================================================ ENTRADA

function renderCad() {
    const st = cadState();
    const def = st.key ? CAD_DEFS[st.key] : null;
    if (!def) return '<div class="at-empty">Selecione um cadastro no menu.</div>';
    if (!cadCan(def, 'ver')) return '<div class="p-8 text-center text-red-600 font-bold text-xl">Acesso Negado</div>';
    cadWatchEntity(def.key);
    return st.mode === 'list' ? renderCadList(def) : renderCadForm(def, st.mode === 'view');
}
