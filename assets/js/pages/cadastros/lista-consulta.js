// Consulta e cadastro no padrão das telas de referência:
//   - CONSULTA: Voltar e Novo à esquerda; Exportar e Imprimir à direita; cartão de filtros em linha com o botão de
//     pesquisa; tabela com cabeçalho discreto e ação de visualizar; e rodapé com "Mostrando de X a Y do total: N"
//     e páginas numeradas.
//   - CADASTRO SIMPLES (poucos campos): abre numa janela (modal) por cima da consulta, com maximizar, fechar (X, Esc ou
//     clique fora) e Salvar embaixo. Os cadastros grandes continuam em tela própria.
// Vale para todos os cadastros, menos os de `estiloERP` (telas fiscais) e os marcados com `listaClassica: true`.
// Ajustes opcionais na definição da entidade (data/cadastros*.js):
//   estiloConsulta: { busca: { label, ph }, textos: [{ k, label, ph, mascara: 'cpf' | 'doc' }], destaque, mono: [...] }
//   modal: true | false  → força (ou impede) o cadastro em janela
// Dados, permissões, validação e gravação são os mesmos do motor (engine.js).

const CQ_MASCARAS = {
    cpf: (v) => (onlyDigits(v) ? formatCPF(onlyDigits(v).slice(0, 11)) : ''),
    doc: (v) => (onlyDigits(v) ? cadFormatarDoc(onlyDigits(v).slice(0, 14)) : '')
};

function cqTexto(k, el, mascara) {
    if (mascara && CQ_MASCARAS[mascara]) {
        const v = CQ_MASCARAS[mascara](el.value);
        if (v !== el.value) el.value = v;
    }
    cadTxt(k, el.value);
}

/** Números de página exibidos (até 5, centrados na página atual). */
function cqPaginas(atual, total) {
    const ini = Math.max(1, Math.min(atual - 2, total - 4));
    return Array.from({ length: Math.min(5, total) }, (_, i) => ini + i);
}

const cqMaiuscula = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);

/** Configuração da consulta: a da entidade ou uma automática (campo de pesquisa e coluna em destaque). */
function cqConfig(def) {
    const cfg = { ...(def.estiloConsulta || {}) };
    const nome = cadNomeCampo(def);
    const busca = def.search || [];
    if (!cfg.busca) {
        cfg.busca = {
            label: busca.slice(0, 2).map(k => cqMaiuscula(nome(k))).join('/') || 'Pesquisar',
            ph: busca.length ? 'Pesquise por ' + busca.map(nome).join(', ') : 'Pesquisar'
        };
    }
    if (!cfg.destaque) {
        const ks = def.columns.map(c => c.k);
        cfg.destaque = ['descricao', 'nome', 'razao_social'].find(k => ks.includes(k)) || (ks[1] || ks[0]);
    }
    return cfg;
}

/** Voltar: tela anterior do navegador (ou a inicial, se a consulta foi a primeira tela aberta). */
function cqVoltar() {
    if (window.history.length > 1) window.history.back();
    else goHome();
}

function renderCadListaConsulta(def) {
    const cfg = cqConfig(def);
    const L = cadList(def);
    L.txt = L.txt || {};
    const rows = cadFiltrar(def);
    const total = rows.length;
    const paginas = Math.max(1, Math.ceil(total / L.size));
    if (L.page > paginas) L.page = paginas;
    const ini = total ? (L.page - 1) * L.size : 0;
    const pagina = rows.slice(ini, ini + L.size);
    const podeCriar = cadCan(def, 'criar');
    const podeInativar = cadCan(def, 'inativar') && !def.semInativar;
    const mono = cfg.mono || [];

    const campoTxt = (f) => `<label class="cq-campo cq-campo--grow"><span title="${escapeHtml(f.label)}">${escapeHtml(f.label)}</span>
        <input class="cq-input" type="text" value="${escapeHtml(L.txt[f.k] || '')}" placeholder="${escapeHtml(f.ph || 'Pesquise pelo ' + f.label)}"
            oninput="cqTexto('${f.k}', this, '${f.mascara || ''}')" data-keep="cq_${f.k}" autocomplete="off" ${f.mascara ? 'inputmode="numeric"' : ''}></label>`;
    const campoSel = (f) => {
        const opts = f.ref ? cadRowsOf(f.ref).filter(r => r.ativo).map(r => ({ id: r.id, rotulo: CAD_DEFS[f.ref].rotulo(r) })) : cadOptsOf(f);
        return `<label class="cq-campo"><span title="${escapeHtml(f.label)}">${escapeHtml(f.label)}</span><select class="cq-input" onchange="cadFiltro('${f.k}', this.value)" data-keep="cq_s_${f.k}">
            <option value="">${escapeHtml(f.todos || "Todos")}</option>${opts.map(o => `<option value="${escapeHtml(cadOptId(o))}" ${L.filtros[f.k] === cadOptId(o) ? 'selected' : ''}>${escapeHtml(cadOptRotulo(o))}</option>`).join('')}</select></label>`;
    };
    const sit = (v, r) => `<option value="${v}" ${L.situacao === v ? 'selected' : ''}>${r}</option>`;
    const celula = (c, r, i) => {
        const v = c.get ? c.get(r) : (r[c.k] ?? '—');
        const cls = c.k === cfg.destaque ? 'cq-nome' : (mono.includes(c.k) ? 'cq-mono' : (i === 0 ? 'cq-cod' : ''));
        const tag = c.k === cfg.destaque && !r.ativo ? ` <em class="cq-tag">${escapeHtml(def.rotuloInativo || 'Inativo')}</em>` : '';
        return `<td class="${cls}" data-label="${escapeHtml(c.label)}">${escapeHtml(v === '' || v === null ? '—' : v)}${tag}</td>`;
    };

    return `
    <div class="cq-page">
        <div class="cq-bar">
            <div class="cq-bar__l">
                <button type="button" class="cq-voltar" onclick="cqVoltar()" title="Voltar" aria-label="Voltar">${lucideIcon('undo-2', 'w-5 h-5')}</button>
                ${podeCriar ? `<button type="button" class="cq-btn cq-btn--novo" onclick="cadNovo()">${lucideIcon('plus', 'w-4 h-4')} ${escapeHtml(def.rotuloNovo || 'Novo')}</button>` : ''}
            </div>
            <div class="cq-bar__r">
                ${(def.botoesLista || []).filter(b => !b.perm || cadCan(def, b.perm)).map(b => `<button type="button" class="cq-btn cq-btn--linha" onclick="${b.fn}()">${lucideIcon(b.icon || 'file', 'w-4 h-4')} ${escapeHtml(b.rotulo)}</button>`).join('')}
                <button type="button" class="cq-btn cq-btn--linha" onclick="cadExportar()" title="Exportar a consulta (com os filtros atuais) para planilha">${lucideIcon('download', 'w-4 h-4 cq-ico-exp')} Exportar</button>
                <button type="button" class="cq-ico" onclick="cadImprimir()" title="Imprimir" aria-label="Imprimir">${lucideIcon('printer', 'w-5 h-5')}</button>
            </div>
        </div>

        <section class="cq-card cq-filtros" aria-label="Filtros">
            <label class="cq-campo cq-campo--grow"><span>${escapeHtml(cfg.busca.label)}</span>
                <input class="cq-input" id="cd_q" type="search" value="${escapeHtml(L.q)}" placeholder="${escapeHtml(cfg.busca.ph || 'Pesquisar')}" oninput="cadBusca(this.value)" data-keep="cd_q" autocomplete="off"></label>
            ${(cfg.textos || []).map(campoTxt).join('')}
            ${(def.filters || []).map(campoSel).join('')}
            ${def.semInativar ? '' : `<label class="cq-campo cq-campo--sit"><span>Visualizar</span><select class="cq-input" onchange="cadSituacao(this.value)" data-keep="cq_sit">${sit('ativos', 'Ativos')}${sit('inativos', 'Inativos')}${sit('todos', 'Todos')}</select></label>`}
            <button type="button" class="cq-pesq" onclick="render()" title="Pesquisar" aria-label="Pesquisar">${lucideIcon('search', 'w-5 h-5')}</button>
        </section>

        <section class="cq-card cq-tabela">
            <div class="cq-scroll"><table>
                <thead><tr>
                    ${def.columns.map(c => `<th ${c.sort ? `class="is-sort" onclick="cadOrdenar('${c.k}')" aria-sort="${L.sort.k === c.k ? (L.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}"` : ''}>${escapeHtml(c.label)}${L.sort.k === c.k ? (L.sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>`).join('')}
                    <th class="cq-acoes">Ações</th>
                </tr></thead>
                <tbody>${pagina.length ? pagina.map(r => `<tr class="${r.ativo ? '' : 'is-off'}" tabindex="0" onclick="cadAbrirLinha(${cadArg(r.id)})" onkeydown="if (event.key === 'Enter') cadAbrirLinha(${cadArg(r.id)})">
                    ${def.columns.map((c, i) => celula(c, r, i)).join('')}
                    <td class="cq-acoes">
                        <button type="button" class="cq-acao" title="Visualizar" aria-label="Visualizar" onclick="event.stopPropagation(); cadVer(${cadArg(r.id)})">${lucideIcon('eye', 'w-4 h-4')}</button>
                        ${podeInativar ? (r.ativo
                            ? `<button type="button" class="cq-acao cq-acao--warn" title="Inativar" aria-label="Inativar" onclick="event.stopPropagation(); cadInativar(${cadArg(r.id)})">${lucideIcon('ban', 'w-4 h-4')}</button>`
                            : `<button type="button" class="cq-acao cq-acao--ok" title="Reativar" aria-label="Reativar" onclick="event.stopPropagation(); cadReativar(${cadArg(r.id)})">${lucideIcon('rotate-ccw', 'w-4 h-4')}</button>`) : ''}
                    </td></tr>`).join('')
                    : `<tr><td colspan="${def.columns.length + 1}" class="cq-vazio">${cadStoreOf(def).rows(def).length ? 'Nenhum registro encontrado com estes filtros.' : 'Nenhum registro cadastrado ainda.'}</td></tr>`}
                </tbody></table></div>
            <footer class="cq-rodape">
                <span>Mostrando de <b>${total ? ini + 1 : 0}</b> a <b>${ini + pagina.length}</b> do total: <strong>${total}</strong></span>
                <div class="cq-pag">
                    <select class="cq-tam" onchange="cadTamanho(this.value)" aria-label="Registros por página" data-native>${['10', '20', '50', '100'].map(n => `<option ${String(L.size) === n ? 'selected' : ''}>${n}</option>`).join('')}</select>
                    <button type="button" class="cq-pg" onclick="cadPagina(${L.page - 1})" ${L.page <= 1 ? 'disabled' : ''} aria-label="Página anterior">${lucideIcon('chevron-left', 'w-4 h-4')}</button>
                    ${cqPaginas(L.page, paginas).map(n => `<button type="button" class="cq-pg ${n === L.page ? 'is-on' : ''}" onclick="cadPagina(${n})" ${n === L.page ? 'aria-current="page"' : ''}>${n}</button>`).join('')}
                    <button type="button" class="cq-pg" onclick="cadPagina(${L.page + 1})" ${L.page >= paginas ? 'disabled' : ''} aria-label="Próxima página">${lucideIcon('chevron-right', 'w-4 h-4')}</button>
                </div>
            </footer>
        </section>
    </div>`;
}

// ============================================================ CADASTRO EM JANELA (MODAL)

/** Cadastro pequeno (até 2 abas e 10 campos, sem listas de itens): abre em janela. `def.modal` força a escolha. */
function cadEmModal(def) {
    if (def.modal !== undefined) return Boolean(def.modal);
    // Movimentações (imutáveis ou sem inativar) e cadastros com gravação própria (usuário, produto...) ficam em tela própria
    if (def.estiloERP || def.layout === 'erp' || def.top || def.listaClassica || def.imutavel || def.semInativar || def.store) return false;
    const abas = def.tabs || [];
    if (!abas.length || abas.length > 2 || abas.some(t => t.render || t.show || t.hide)) return false;
    const campos = abas.flatMap(t => t.fields || []);
    return campos.length <= 10 && !campos.some(f => ['lista', 'itens', 'arquivo'].includes(f.type));
}

/** "Nova Conta" / "Novo Grupo": `def.feminino` define; senão, pela terminação do nome. */
function cqFeminino(def) {
    if (def.feminino !== undefined) return Boolean(def.feminino);
    const s = String(def.singular || '').toLowerCase().split(' ')[0];
    return /(a|ção|dade|gem|classe|^tv)$/.test(s) && !/(sistema|problema|tema|programa|esquema)$/.test(s);
}

function cqMaximizar() { const st = cadState(); st.maxi = !st.maxi; render(); }

function renderCadModal(def, readonly) {
    const st = cadState();
    const rec = st.id ? cadStoreOf(def).rows(def).find(r => r.id === st.id) : null;
    const abas = cadAbas(def, st.form);
    if (!abas.find(t => t.id === st.tab)) st.tab = abas[0].id;
    const aba = abas.find(t => t.id === st.tab);
    const ativo = st.form.ativo !== false;
    const titulo = readonly ? def.singular : (st.id ? `Editar ${def.singular}` : `${cqFeminino(def) ? 'Nova' : 'Novo'} ${def.singular}`);

    return `
    <div class="cq-modal ${st.maxi ? 'is-max' : ''}" role="dialog" aria-modal="true" aria-labelledby="cq-modal-t">
        <div class="cq-modal__fundo" onclick="cadVoltar()"></div>
        <form id="cad-form" class="cq-modal__box" onsubmit="cadSalvar(event)" novalidate>
            <header class="cq-modal__cab">
                <h3 id="cq-modal-t">${escapeHtml(titulo)}${rec && !ativo ? ` <em class="cq-tag">${escapeHtml(def.rotuloInativo || 'Inativo')}</em>` : ''}</h3>
                <div class="cq-modal__acoes">
                    <button type="button" class="cq-modal__ico" onclick="cqMaximizar()" title="${st.maxi ? 'Restaurar' : 'Maximizar'}" aria-label="${st.maxi ? 'Restaurar' : 'Maximizar'}">${lucideIcon(st.maxi ? 'minimize-2' : 'maximize-2', 'w-5 h-5')}</button>
                    <button type="button" class="cq-modal__ico cq-modal__x" onclick="cadVoltar()" title="Fechar (Esc)" aria-label="Fechar">${lucideIcon('x', 'w-6 h-6')}</button>
                </div>
            </header>
            <div class="cq-modal__corpo">
                ${abas.length > 1 ? `<nav class="cq-modal__abas" role="tablist">${abas.map(t => `<button type="button" role="tab" class="${t.id === st.tab ? 'is-on' : ''}" aria-selected="${t.id === st.tab}" onclick="cadAba('${t.id}')">${escapeHtml(t.label)}</button>`).join('')}</nav>` : ''}
                ${aba.render ? aba.render(def, st, readonly) : cqGradeCampos(def, aba.fields || [], st, readonly, cqCelulasFixas(def, st, readonly))}
            </div>
            <footer class="cq-modal__rodape">
                ${readonly
                    ? (cadCan(def, 'editar') && !def.imutavel ? `<button type="button" class="cq-btn cq-btn--novo" onclick="cadEditar(${cadArg(st.id)})">${lucideIcon('pencil', 'w-4 h-4')} Editar</button>` : '')
                    : `<button type="button" class="cq-btn cq-btn--texto" onclick="cadVoltar()">Cancelar</button>
                       <button type="submit" class="cq-btn cq-btn--novo" data-busy-label>${lucideIcon('check', 'w-4 h-4')} Salvar</button>`}
            </footer>
        </form>
    </div>`;
}

/** Ao abrir a janela, o cursor vai para o primeiro campo. */
function cqFocarModal() {
    setTimeout(() => {
        const el = document.querySelector('.cq-modal__corpo input:not([type=hidden]):not([disabled]), .cq-modal__corpo textarea, .cq-modal__corpo .cd-combo__btn');
        if (el && !document.querySelector('.cq-modal__corpo :focus')) el.focus();
    }, 30);
}

// Esc fecha a janela (se não houver uma lista suspensa aberta)
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !document.querySelector('.cq-modal')) return;
    if (document.querySelector('.cd-combo.is-open')) return;
    e.preventDefault();
    cadVoltar();
});

// ============================================================ EXPORTAR

/** Exporta a consulta (colunas visíveis e filtros atuais) para CSV, que abre no Excel. */
function cadExportar() {
    const def = cadDef();
    if (!cadCan(def, 'ver')) return showMsg('Seu perfil não pode exportar esta consulta.', 'error');
    const rows = cadFiltrar(def);
    if (!rows.length) return showMsg('Não há registros para exportar com os filtros atuais.', 'error');
    if (def.sensivel && typeof registrarAcesso === 'function') registrarAcesso(def.key, 'listagem', 'Exportação da listagem de ' + def.label);
    const cel = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const linhas = [
        [...def.columns.map(c => c.label), 'Situação'].map(cel).join(';'),
        ...rows.map(r => [...def.columns.map(c => (c.get ? c.get(r) : r[c.k])), r.ativo ? 'Ativo' : (def.rotuloInativo || 'Inativo')].map(cel).join(';'))
    ];
    const blob = new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${def.key}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ============================================================ GRADE DE CAMPOS ALINHADA

// Largura (em 12 colunas) de cada tipo de campo. Campos curtos (datas, números, seleções) ficam lado a lado;
// textos ocupam o que sobrar da linha; observações e listas ficam numa linha inteira, no fim.
const CQ_CURTOS = ['check', 'digits', 'date', 'money', 'number', 'cep', 'phone', 'cpf', 'cnpj', 'doc', 'password'];
const CQ_SELECAO = ['select', 'ref', 'uf', 'municipio', 'operacao', 'produto', 'lote'];
const CQ_LINHA = ['textarea', 'lista', 'itens'];

function cqLargura(f) {
    if (f.colGrade) return f.colGrade;
    if (CQ_LINHA.includes(f.type)) return 12;
    if (CQ_CURTOS.includes(f.type)) return 3;
    if (CQ_SELECAO.includes(f.type)) return 4;
    return f.span2 ? 8 : 5;
}

/**
 * Distribui os itens em linhas de 12 colunas. A sobra de cada linha vai para os campos de texto dela (ou é dividida entre todos),
 * então toda linha fica cheia e as bordas se alinham. `reserva` guarda espaço na 1ª linha (para o "Ativo").
 */
function cqEmpacotar(itens, reserva = 0) {
    const linhas = [];
    let linha = [], cap = 12 - reserva, usado = 0;
    const fechar = () => {
        if (!linha.length) return;
        const sobra = cap - usado;
        if (sobra > 0) {
            const flex = linha.filter(i => i.flex);
            if (flex.length) {
                flex.forEach((i, n) => { i.col += Math.floor(sobra / flex.length) + (n < sobra % flex.length ? 1 : 0); });
            } else {
                // só campos curtos e listas: ficam do mesmo tamanho, no máximo meia linha (uma data sozinha não estica até o fim)
                const igual = Math.min(6, Math.floor(cap / linha.length));
                linha.forEach(i => { i.col = Math.max(i.col, igual); });
            }
        }
        linhas.push(linha);
        linha = []; usado = 0; cap = 12;
    };
    itens.forEach(i => {
        if (usado + i.col > cap) fechar();
        i.col = Math.min(i.col, cap);
        linha.push(i); usado += i.col;
        if (usado >= cap) fechar();
    });
    fechar();
    if (!linhas.length && reserva) linhas.push([]);
    return linhas;
}

/** Uma célula da grade: rótulo, controle, dica e erro (mesmo controle do motor de cadastros). */
function cqCelula(def, f, st, readonly, col) {
    const ctl = cadControle(def, f, st, readonly);
    if (f.type === 'lista' || f.type === 'itens') return `<div class="cd-cell" style="--col:${col}">${ctl}</div>`;
    return `<div class="cd-cell" style="--col:${col}">
        <label class="at-label" for="cad_${f.k}">${escapeHtml(cadRotuloCampo(f, st.form))}${f.req && !readonly ? ' <span class="req">*</span>' : ''}</label>${ctl}
        ${!readonly && f.help ? `<span class="at-hint">${escapeHtml(f.help)}</span>` : ''}<p class="at-error" data-error="cad_${f.k}" role="alert"></p>
    </div>`;
}

/**
 * Campos de uma aba em grade alinhada. `inicio` = células antes dos campos (ex.: Código); `fimPrimeira` = célula fixa
 * no fim da 1ª linha (ex.: Ativo). Marcadores { secao: 'Título' } abrem um bloco com título.
 */
function cqGradeCampos(def, campos, st, readonly, { inicio = [], fimPrimeira = null } = {}) {
    const blocos = [{ titulo: '', campos: [] }];
    campos.forEach(f => {
        if (f.secao) blocos.push({ titulo: f.secao, campos: [] });
        else if (f.k && !(f.ocultoNovo && !st.id)) blocos[blocos.length - 1].campos.push(f);
    });
    return blocos.filter((b, n) => b.titulo || b.campos.length || n === 0).map((b, n) => {
        const itens = [...b.campos.filter(f => !CQ_LINHA.includes(f.type)), ...b.campos.filter(f => CQ_LINHA.includes(f.type))]
            .map(f => ({ col: cqLargura(f), flex: !CQ_CURTOS.includes(f.type) && !CQ_SELECAO.includes(f.type) && !CQ_LINHA.includes(f.type), html: (c) => cqCelula(def, f, st, readonly, c) }));
        if (n === 0) itens.unshift(...inicio);
        const fixo = n === 0 ? fimPrimeira : null;
        const linhas = cqEmpacotar(itens, fixo ? fixo.col : 0);
        if (fixo) linhas[0].push(fixo);
        const corpo = linhas.flat().map(i => i.html(i.col)).join('');
        return `${b.titulo ? `<h3 class="cq-secao">${escapeHtml(b.titulo)}</h3>` : ''}${corpo ? `<div class="cd-grid12 cq-grade">${corpo}</div>` : ''}`;
    }).join('');
}

/** Células "Código" (só leitura) e "Ativo" (Sim/Não) para a 1ª linha do cadastro. */
function cqCelulasFixas(def, st, readonly) {
    const rec = st.id ? cadStoreOf(def).rows(def).find(r => r.id === st.id) : null;
    const ativo = st.form.ativo !== false;
    const inicio = rec && rec.codigo ? [{ col: 2, html: (c) => `<div class="cd-cell" style="--col:${c}"><span class="at-label">Código</span><div class="cd-ro cq-cod-ro">${escapeHtml(rec.codigo)}</div></div>` }] : [];
    const podeSit = !def.semInativar && !def.semSitForm && Boolean(st.id) && (readonly || cadCan(def, 'inativar'));
    const fimPrimeira = podeSit ? { col: 2, html: (c) => `<div class="cd-cell" style="--col:${c}"><label class="at-label" for="cad_ativo_sel">Ativo</label>${readonly
        ? `<div class="cd-ro">${ativo ? 'Sim' : 'Não'}</div>`
        : cadComboHtml({ id: 'cad_ativo_sel', valor: ativo ? '1' : '0', opts: [{ id: '1', rotulo: 'Sim' }, { id: '0', rotulo: 'Não' }], vazio: null, fn: 'cadSituacaoForm' })}</div>` } : null;
    return { inicio, fimPrimeira };
}
