// Aba "Lotes" do cadastro de produto: aparece só quando o produto tem "Controlar estoque por lote" marcado.
//
// Os lotes são os mesmos documentos de sempre (product_batches): aqui se cadastra um lote novo (com ou sem quantidade
// inicial), consulta, filtra, edita os DADOS do lote e inativa/reativa. O SALDO de um lote só muda por movimentação:
// a quantidade inicial é uma entrada registrada no histórico; editar um lote nunca altera saldo nem movimentações anteriores.
// Regras de lote: core/regras.js. Gravação em transação: services/baixa-lote.js.

const LOTES_VER = [
    { id: 'ativos', rotulo: 'Ativos' }, { id: 'saldo', rotulo: 'Com saldo' }, { id: 'vencer', rotulo: 'A vencer' },
    { id: 'vencidos', rotulo: 'Vencidos' }, { id: 'sem_saldo', rotulo: 'Sem saldo' }, { id: 'inativos', rotulo: 'Inativos' }, { id: 'todos', rotulo: 'Todos' }
];
const LOTE_SITUACAO = {
    OK: ['Válido', 'at-badge--ok'], A_VENCER: ['A vencer', 'at-badge--urgente'], VENCIDO: ['Vencido', 'at-badge--emergencia'],
    SEM_SALDO: ['Sem saldo', 'at-badge--off'], INATIVO: ['Inativo', 'at-badge--off']
};

function lotesFiltro() {
    const st = cadState();
    if (!st.lotesF) st.lotesF = { q: '', fabDe: '', fabAte: '', venDe: '', venAte: '', prat: '', ver: 'ativos' };
    return st.lotesF;
}
function lotesFiltrar(k, v) { lotesFiltro()[k] = v; render(); }

/** Produto aberto no cadastro: { p, setor, syncId } ou null (produto ainda não salvo). */
function lotesProdutoAberto() {
    const st = cadState();
    if (!st.id) return null;
    const r = produtoRows().find(x => x.id === st.id);
    return r ? { p: r._p, setor: r.setor, syncId: `${r._p.barcode}_${r.setor}` } : null;
}

const lotesPodeMovimentar = (setor) => hasPermission('update_stock', setor);
const lotesPodeEditar = (setor) => cadCan(cadDef(), 'editar') || hasPermission('register', setor);

/** Lotes do produto que passam nos filtros da aba (o saldo geral zerado de antes do controle por lote não aparece). */
function lotesFiltrados(p) {
    const F = lotesFiltro();
    const hoje = new Date();
    const q = searchKey(F.q);
    return (p.lotes || []).filter(l => !(loteEhSaldoGeral(l) && !(Number(l.quantidade) > 0))).filter(l => {
        const sit = situacaoLote(l, hoje);
        if (F.ver === 'ativos' && sit === 'INATIVO') return false;
        if (F.ver === 'saldo' && !(Number(l.quantidade) > 0 && l.ativo !== false)) return false;
        if (F.ver === 'vencer' && sit !== 'A_VENCER') return false;
        if (F.ver === 'vencidos' && sit !== 'VENCIDO') return false;
        if (F.ver === 'sem_saldo' && !(Number(l.quantidade) <= 0)) return false;
        if (F.ver === 'inativos' && sit !== 'INATIVO') return false;
        if (q && !searchKey(rotuloLote(l.lote)).includes(q)) return false;
        if (F.prat && !searchKey(l.prateleira || '').includes(searchKey(F.prat))) return false;
        const fab = String(l.fabricacao || ''), ven = semValidade(l.validade) ? '' : String(l.validade).slice(0, 10);
        if (F.fabDe && (!fab || fab < F.fabDe)) return false;
        if (F.fabAte && (!fab || fab > F.fabAte)) return false;
        if (F.venDe && (!ven || ven < F.venDe)) return false;
        if (F.venAte && (!ven || ven > F.venAte)) return false;
        return true;
    }).sort((a, b) => compararFEFO(a, b));
}

function renderProdutoLotes(st, readonly) {
    const ctx = lotesProdutoAberto();
    if (!ctx) return `<div class="at-empty">Salve o produto para cadastrar os lotes.</div>`;
    const { p, setor } = ctx;
    if (!produtoControlaLote(p)) {
        return `<div class="at-empty">A opção "Controlar estoque por lote" foi marcada agora: salve o produto para começar a cadastrar os lotes.</div>`;
    }
    const F = lotesFiltro();
    const lotes = lotesFiltrados(p);
    const todos = (p.lotes || []).filter(l => !loteEhSaldoGeral(l));
    const hoje = new Date();
    const conta = (s) => todos.filter(l => situacaoLote(l, hoje) === s).length;
    const podeNovo = lotesPodeMovimentar(setor) || lotesPodeEditar(setor);
    const data = (id, v, k, rotulo) => `<input class="cq-input" type="date" value="${escapeHtml(v)}" onchange="lotesFiltrar('${k}', this.value)" data-keep="${id}" aria-label="${rotulo}">`;
    const dinheiro = (v) => (v === '' || v === undefined || v === null ? '—' : formatMoney(v));

    return `
    <div class="pl-lotes">
        <section class="cq-card cq-filtros pl-filtros" aria-label="Filtros dos lotes" onkeydown="if (event.key === 'Enter') { event.preventDefault(); }">
            <label class="cq-campo"><span>Lote</span><input class="cq-input" type="search" value="${escapeHtml(F.q)}" placeholder="Número do lote" oninput="lotesFiltrar('q', this.value)" data-keep="pl_q" autocomplete="off"></label>
            <div class="cq-campo pl-faixa"><span>Fabricação</span><div class="pl-faixa__in">${data('pl_fde', F.fabDe, 'fabDe', 'Fabricação a partir de')}<em>a</em>${data('pl_fate', F.fabAte, 'fabAte', 'Fabricação até')}</div></div>
            <div class="cq-campo pl-faixa"><span>Vencimento</span><div class="pl-faixa__in">${data('pl_vde', F.venDe, 'venDe', 'Vencimento a partir de')}<em>a</em>${data('pl_vate', F.venAte, 'venAte', 'Vencimento até')}</div></div>
            <label class="cq-campo"><span>Prateleira</span><input class="cq-input" type="search" value="${escapeHtml(F.prat)}" placeholder="Prateleira" oninput="lotesFiltrar('prat', this.value)" data-keep="pl_prat" autocomplete="off"></label>
            <label class="cq-campo cq-campo--sit"><span>Visualizar</span><select class="cq-input" onchange="lotesFiltrar('ver', this.value)" data-keep="pl_ver">
                ${LOTES_VER.map(o => `<option value="${o.id}" ${F.ver === o.id ? 'selected' : ''}>${o.rotulo}</option>`).join('')}</select></label>
            <button type="button" class="cq-pesq" onclick="render()" title="Pesquisar" aria-label="Pesquisar">${lucideIcon('search', 'w-5 h-5')}</button>
            ${podeNovo ? `<button type="button" class="cq-btn cq-btn--novo pl-novo" onclick="loteNovo()">${lucideIcon('plus', 'w-4 h-4')} Novo</button>` : ''}
        </section>

        <div class="pl-resumo" role="status">
            <span>Saldo total: <strong>${Number(p.qtd) || 0} un</strong> <small>(soma dos lotes)</small></span>
            <span>${todos.length} lote(s)</span>
            ${conta('VENCIDO') ? `<span class="at-badge at-badge--emergencia">${conta('VENCIDO')} vencido(s)</span>` : ''}
            ${conta('A_VENCER') ? `<span class="at-badge at-badge--urgente">${conta('A_VENCER')} a vencer em até ${diasAlertaValidade()} dias</span>` : ''}
            ${conta('SEM_SALDO') ? `<span class="at-badge at-badge--off">${conta('SEM_SALDO')} sem saldo</span>` : ''}
        </div>

        <section class="cq-card cq-tabela">
            <div class="cq-scroll"><table>
                <thead><tr><th>Lote</th><th class="pl-dir">Estoque</th><th>Fabricação</th><th>Vencimento</th><th class="pl-dir">Preço</th><th>Prateleira</th><th>Situação</th><th class="cq-acoes">Ações</th></tr></thead>
                <tbody>${lotes.length ? lotes.map(l => {
                    const sit = situacaoLote(l, hoje);
                    const [rot, cls] = LOTE_SITUACAO[sit];
                    const arg = escapeHtml(JSON.stringify(String(l.lote)));
                    return `<tr class="${l.ativo === false ? 'is-off' : ''}">
                        <td class="cq-nome" data-label="Lote">${escapeHtml(rotuloLote(l.lote))}</td>
                        <td class="pl-dir" data-label="Estoque">${Number(l.quantidade) || 0}</td>
                        <td data-label="Fabricação">${l.fabricacao ? formatDateBR(l.fabricacao) : '—'}</td>
                        <td data-label="Vencimento">${semValidade(l.validade) ? '—' : formatDateBR(l.validade)}${rotuloValidade(l.validade) ? `<br><small>${escapeHtml(rotuloValidade(l.validade))}</small>` : ''}</td>
                        <td class="pl-dir" data-label="Preço">${dinheiro(l.preco)}</td>
                        <td data-label="Prateleira">${escapeHtml(l.prateleira || '—')}</td>
                        <td data-label="Situação"><span class="at-badge ${cls}">${rot}</span></td>
                        <td class="cq-acoes">
                            <button type="button" class="cq-acao" title="Histórico de movimentações do lote" aria-label="Histórico do lote" onclick="loteHistorico(${arg})">${lucideIcon('history', 'w-4 h-4')}</button>
                            ${lotesPodeEditar(setor) && !loteEhSaldoGeral(l) ? `<button type="button" class="cq-acao" title="Editar dados do lote" aria-label="Editar lote" onclick="loteEditar(${arg})">${lucideIcon('pencil', 'w-4 h-4')}</button>
                            ${l.ativo === false
                                ? `<button type="button" class="cq-acao cq-acao--ok" title="Reativar lote" aria-label="Reativar lote" onclick="loteSituacao(${arg}, true)">${lucideIcon('rotate-ccw', 'w-4 h-4')}</button>`
                                : `<button type="button" class="cq-acao cq-acao--warn" title="Inativar lote (só sem saldo)" aria-label="Inativar lote" onclick="loteSituacao(${arg}, false)">${lucideIcon('ban', 'w-4 h-4')}</button>`}` : ''}
                        </td></tr>`;
                }).join('') : `<tr><td colspan="8" class="cq-vazio">Nenhum lote encontrado</td></tr>`}
                </tbody></table></div>
        </section>
        <p class="at-hint">O saldo de cada lote só muda por movimentação (Adicionar Estoque, recebimento, saídas, transferências, perdas e ajustes). Saídas usam o lote que vence primeiro e nunca um lote vencido ou inativo. O alerta "a vencer" usa o prazo definido nos Parâmetros (${diasAlertaValidade()} dias).</p>
    </div>
    ${st.loteEd ? renderLoteModal(st.loteEd, setor) : ''}`;
}

// ---------------------------------------------------------------- janela de cadastro/edição do lote

function loteNovo() {
    cadState().loteEd = { modo: 'novo', f: { lote: '', fabricacao: '', validade: '', quantidade: '', preco: '', prateleira: '', fornecedor_id: '', obs: '', remessa: '' } };
    render();
}
function loteEditar(codigo) {
    const ctx = lotesProdutoAberto();
    const l = ctx && (ctx.p.lotes || []).find(x => String(x.lote) === String(codigo));
    if (!l) return showMsg('Lote não encontrado.', 'error');
    cadState().loteEd = { modo: 'editar', codigo: l.lote, f: { lote: l.lote, fabricacao: l.fabricacao || '', validade: semValidade(l.validade) ? '' : l.validade, quantidade: l.quantidade, preco: l.preco ?? '', prateleira: l.prateleira || '', fornecedor_id: l.fornecedor_id || '', obs: l.obs || '' } };
    render();
}
function loteFechar() { cadState().loteEd = null; render(); }
function loteCampo(k, v) { const ed = cadState().loteEd; if (ed) ed.f[k] = v; }

function renderLoteModal(ed, setor) {
    const f = ed.f;
    const novo = ed.modo === 'novo';
    const fornecedores = (typeof cadRowsOf === 'function' ? cadRowsOf('fornecedor') : []).filter(r => r.ativo !== false);
    const campo = (rotulo, html, cls = '') => `<label class="cq-campo ${cls}"><span>${rotulo}</span>${html}</label>`;
    const inp = (k, tipo = 'text', extra = '') => `<input class="cq-input" type="${tipo}" value="${escapeHtml(f[k] ?? '')}" oninput="loteCampo('${k}', this.value)" onchange="loteCampo('${k}', this.value)" data-keep="pl_ed_${k}" ${extra}>`;
    return `
    <div class="cq-modal pl-modal" role="dialog" aria-modal="true" aria-labelledby="pl-modal-t" onkeydown="if (event.key === 'Escape') { event.stopPropagation(); loteFechar(); } if (event.key === 'Enter' && event.target.tagName !== 'TEXTAREA') { event.preventDefault(); }">
        <div class="cq-modal__fundo" onclick="loteFechar()"></div>
        <div class="cq-modal__box">
            <header class="cq-modal__cab">
                <h3 id="pl-modal-t">${novo ? 'Novo lote' : `Editar lote ${escapeHtml(ed.codigo)}`}</h3>
                <div class="cq-modal__acoes"><button type="button" class="cq-modal__ico cq-modal__x" onclick="loteFechar()" title="Fechar" aria-label="Fechar">${lucideIcon('x', 'w-6 h-6')}</button></div>
            </header>
            <div class="cq-modal__corpo">
                <div class="pl-grade">
                    ${campo('Lote *', novo ? inp('lote', 'text', 'maxlength="40" autocomplete="off"') : `<div class="cq-cod-ro">${escapeHtml(f.lote)}</div>`, 'pl-c4')}
                    ${campo('Fabricação', inp('fabricacao', 'date', `max="${todayISO()}"`), 'pl-c4')}
                    ${campo('Vencimento *', inp('validade', 'date'), 'pl-c4')}
                    ${novo ? campo('Quantidade inicial', inp('quantidade', 'number', 'min="0" step="1" inputmode="numeric" placeholder="0"'), 'pl-c4') : campo('Estoque atual', `<div class="cq-cod-ro">${Number(f.quantidade) || 0} un</div>`, 'pl-c4')}
                    ${campo('Preço de custo (R$)', inp('preco', 'number', 'min="0" step="0.01" inputmode="decimal"'), 'pl-c4')}
                    ${campo('Prateleira', inp('prateleira', 'text', 'maxlength="40" placeholder="Ex.: B2"'), 'pl-c4')}
                    ${campo('Fornecedor', `<select class="cq-input" onchange="loteCampo('fornecedor_id', this.value)" data-keep="pl_ed_forn"><option value="">— Não informado —</option>${fornecedores.map(r => `<option value="${escapeHtml(r.id)}" ${f.fornecedor_id === r.id ? 'selected' : ''}>${escapeHtml(CAD_DEFS.fornecedor.rotulo(r))}</option>`).join('')}</select>`, 'pl-c8')}
                    ${novo ? campo('Processo / nota da entrada', inp('remessa', 'text', 'maxlength="40"'), 'pl-c4') : ''}
                    ${campo('Observações', `<textarea class="cq-input" rows="2" maxlength="300" oninput="loteCampo('obs', this.value)" data-keep="pl_ed_obs">${escapeHtml(f.obs || '')}</textarea>`, 'pl-c12')}
                </div>
                <p class="at-hint">${novo
                    ? 'Com quantidade inicial, o lote entra no estoque e a entrada fica no histórico. Sem quantidade, o lote fica cadastrado para receber entradas depois. O número do lote não se repete no produto.'
                    : 'Editar muda só os dados do lote. O saldo e as movimentações anteriores não mudam; o número do lote não pode ser alterado.'}</p>
            </div>
            <footer class="cq-modal__rodape">
                <button type="button" class="cq-btn cq-btn--texto" onclick="loteFechar()">Cancelar</button>
                <button type="button" class="cq-btn cq-btn--novo" onclick="loteSalvar(this)" data-busy-label>${lucideIcon('check', 'w-4 h-4')} Salvar</button>
            </footer>
        </div>
    </div>`;
}

/** Confere os dados digitados na janela do lote. Devolve a lista de erros (vazia = ok). Pura: usada nos testes. */
function validarDadosLote(f, { novo, hoje = todayISO() } = {}) {
    const erros = [];
    const codigo = String(f.lote || '').trim();
    if (novo && !codigo) erros.push('Informe o número do lote.');
    if (novo && codigo.toUpperCase() === LOTE_SEM_CONTROLE) erros.push(`"${LOTE_SEM_CONTROLE}" é reservado pelo sistema.`);
    if (!f.validade) erros.push('Informe o vencimento do lote.');
    if (f.fabricacao && f.fabricacao > hoje) erros.push('A data de fabricação não pode ser futura.');
    if (f.fabricacao && f.validade && f.fabricacao > f.validade) erros.push('A fabricação não pode ser depois do vencimento.');
    const q = f.quantidade === '' || f.quantidade === undefined ? 0 : Number(f.quantidade);
    if (novo && (!Number.isInteger(q) || q < 0)) erros.push('A quantidade inicial deve ser um número inteiro (0 ou mais).');
    if (f.preco !== '' && f.preco !== undefined && f.preco !== null && !(Number(f.preco) >= 0)) erros.push('Preço inválido.');
    return erros;
}

async function loteSalvar(btn) {
    const st = cadState();
    const ed = st.loteEd;
    const ctx = lotesProdutoAberto();
    if (!ed || !ctx) return;
    const { p, setor, syncId } = ctx;
    const f = ed.f;
    const novo = ed.modo === 'novo';
    const erros = validarDadosLote(f, { novo });
    if (erros.length) return showMsg(erros.join(' '), 'error');
    const codigo = novo ? String(f.lote).trim() : ed.codigo;
    const dados = dadosExtrasLote({ fabricacao: f.fabricacao, prateleira: f.prateleira, fornecedor_id: f.fornecedor_id, obs: f.obs, preco: f.preco });
    if (btn) btn.disabled = true;
    try {
        if (novo) {
            if ((p.lotes || []).some(l => String(l.lote) === codigo)) throw new Error(`O lote ${codigo} já está cadastrado neste produto. Para somar quantidade, use "Adicionar Estoque" com este lote.`);
            const qtd = Number(f.quantidade) || 0;
            if (qtd > 0) {
                if (!lotesPodeMovimentar(setor)) throw new Error('Seu perfil não pode dar entrada neste estoque.');
                const r = addProductWithBatch(setor, { barcode: p.barcode, lote: codigo, validade: f.validade, quantidade: qtd, remessa: String(f.remessa || '').trim(), ...dados });
                if (r.type === 'erro') throw new Error(r.message);
                logEntryHistory('ENTRADA', setor, p.barcode, p.material, qtd, codigo, 'Cadastro do lote (aba Lotes)');
            } else {
                if (!lotesPodeEditar(setor)) throw new Error('Seu perfil não pode cadastrar lotes neste estoque.');
                if (typeof db !== 'undefined' && db) await criarLoteSemSaldoTransacional(db, syncId, codigo, { validade: f.validade, remessa: String(f.remessa || '').trim(), ...dados });
                p.lotes = p.lotes || [];
                p.lotes.push({ id: `${syncId}_${codigo}`, lote: codigo, validade: f.validade, quantidade: 0, qtd_inicial: 0, data_entrada: todayISO(), ativo: true, remessa: String(f.remessa || '').trim(), ...dados });
                recalcularProdutoEstoque(p);
            }
            if (typeof auditar === 'function') await auditar({ entidade: 'lote', entidade_id: `${syncId}_${codigo}`, acao: 'CRIAR', depois: { produto: p.barcode, setor, lote: codigo, validade: f.validade, quantidade_inicial: Number(f.quantidade) || 0 } });
            showMsg(`Lote ${codigo} cadastrado.`);
        } else {
            if (!lotesPodeEditar(setor)) throw new Error('Seu perfil não pode editar lotes neste estoque.');
            const l = (p.lotes || []).find(x => String(x.lote) === String(codigo));
            if (!l) throw new Error('Lote não encontrado.');
            const campos = { validade: f.validade, fabricacao: f.fabricacao || '', prateleira: String(f.prateleira || '').trim(), fornecedor_id: f.fornecedor_id || '', obs: String(f.obs || '').trim(), preco: f.preco === '' || f.preco === null ? '' : Number(f.preco) };
            const antes = {}, depois = {};
            Object.keys(campos).forEach(k => { if (String(l[k] ?? '') !== String(campos[k] ?? '')) { antes[k] = l[k] ?? ''; depois[k] = campos[k]; } });
            if (!Object.keys(depois).length) { st.loteEd = null; render(); return; }
            if (typeof db !== 'undefined' && db) await db_atualizarDadosLote(syncId, codigo, depois);
            Object.assign(l, depois);
            recalcularProdutoEstoque(p);
            if (typeof auditar === 'function') await auditar({ entidade: 'lote', entidade_id: `${syncId}_${codigo}`, acao: 'EDITAR', antes, depois });
            showMsg(`Lote ${codigo} atualizado.`);
        }
        st.loteEd = null;
        saveToLocalStorage();
        render();
    } catch (err) {
        console.error(err);
        showMsg(err.message || 'Não foi possível salvar o lote.', 'error');
        if (btn) btn.disabled = false;
    }
}

/** Inativa (só sem saldo: o total do produto nunca deixa de bater com os lotes) ou reativa um lote. */
async function loteSituacao(codigo, ativo) {
    const ctx = lotesProdutoAberto();
    const l = ctx && (ctx.p.lotes || []).find(x => String(x.lote) === String(codigo));
    if (!l) return showMsg('Lote não encontrado.', 'error');
    if (!lotesPodeEditar(ctx.setor)) return showMsg('Seu perfil não pode alterar lotes neste estoque.', 'error');
    if (!ativo && Number(l.quantidade) > 0) return showMsg(`O lote ${codigo} ainda tem ${l.quantidade} un. Dê saída, transfira ou registre a perda antes de inativar.`, 'error');
    if (!confirm(ativo ? `Reativar o lote ${codigo}?` : `Inativar o lote ${codigo}? Ele deixa de receber entradas e de aparecer nas saídas; o histórico continua.`)) return;
    try {
        if (typeof db !== 'undefined' && db) await db_atualizarDadosLote(ctx.syncId, codigo, { ativo });
        l.ativo = ativo;
        if (typeof auditar === 'function') await auditar({ entidade: 'lote', entidade_id: `${ctx.syncId}_${codigo}`, acao: ativo ? 'ATIVAR' : 'INATIVAR' });
        saveToLocalStorage();
        showMsg(ativo ? `Lote ${codigo} reativado.` : `Lote ${codigo} inativado.`);
        render();
    } catch (err) {
        console.error(err);
        showMsg('Não foi possível alterar a situação do lote.', 'error');
    }
}

/** Abre a aba Movimentação filtrada pelo lote. */
function loteHistorico(codigo) {
    const st = cadState();
    if (typeof movState === 'function') movState().lote = rotuloLote(codigo) === 'Sem lote' ? LOTE_SEM_CONTROLE : codigo;
    st.tab = 'movimentacao';
    render();
}

if (typeof module !== 'undefined' && module.exports) module.exports = { validarDadosLote };

// ---- Conversão do saldo geral "Sem lote" em lote real (para poder ligar o controle por lote sem lote fictício) ----

/** Aviso + botão abaixo da opção "Controlar estoque por lote", só quando o produto aberto tem saldo sem lote. */
function produtoSemLoteHtml(st) {
    const ctx = st && st.id ? lotesProdutoAberto() : null;
    if (!ctx || st.mode !== 'form') return '';
    const saldo = (ctx.p.lotes || []).filter(l => loteEhSaldoGeral(l)).reduce((s, l) => s + (Number(l.quantidade) || 0), 0);
    if (!saldo) return '';
    return `<div class="pl-conv"><span>Saldo sem lote: <strong>${saldo} un</strong>. Para controlar por lote, informe o lote e a validade reais desse saldo.</span>
        ${lotesPodeMovimentar(ctx.setor) ? `<button type="button" class="cq-btn cq-btn--texto" onclick="loteConverterSemLote()">${lucideIcon('repeat', 'w-4 h-4')} Converter saldo sem lote</button>` : ''}</div>`;
}

function loteConverterSemLote() {
    const ctx = lotesProdutoAberto();
    if (!ctx) return;
    const saldo = (ctx.p.lotes || []).filter(l => loteEhSaldoGeral(l)).reduce((s, l) => s + (Number(l.quantidade) || 0), 0);
    const d = openModal({ title: `Converter saldo sem lote · ${ctx.p.material}`, size: 'md', content: `<div class="modal__body">
        <p class="at-hint">Informe o lote verdadeiro (da embalagem) de ${saldo} un sem lote. Se o saldo for de mais de um lote, converta uma parte de cada vez. O total do produto não muda; as duas pontas ficam no histórico.</p>
        <div class="pl-grade">
            <label class="cq-campo pl-c6"><span>Lote *</span><input class="cq-input" id="cv_lote" maxlength="40" autocomplete="off"></label>
            <label class="cq-campo pl-c6"><span>Quantidade *</span><input class="cq-input" id="cv_qtd" type="number" min="1" max="${saldo}" step="1" value="${saldo}"></label>
            <label class="cq-campo pl-c6"><span>Fabricação</span><input class="cq-input" id="cv_fab" type="date" max="${todayISO()}"></label>
            <label class="cq-campo pl-c6"><span>Validade *</span><input class="cq-input" id="cv_val" type="date" min="${todayISO()}"></label>
        </div>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--primary" id="cv_ok">Converter</button></div></div>` });
    d.querySelector('#cv_ok').onclick = () => {
        const v = (id) => d.querySelector(id).value;
        const r = converterSaldoGeralEmLote(ctx.setor, ctx.p, { lote: v('#cv_lote'), quantidade: v('#cv_qtd'), validade: v('#cv_val'), fabricacao: v('#cv_fab') });
        if (!r.ok) return showMsg(r.message, 'error');
        if (typeof auditar === 'function') auditar({ entidade: 'lote', entidade_id: `${ctx.syncId}_${r.lote.lote}`, acao: 'CONVERTER_SEM_LOTE', depois: { produto: ctx.p.barcode, setor: ctx.setor, lote: r.lote.lote, quantidade: Number(v('#cv_qtd')) } });
        saveToLocalStorage();
        d.close();
        showMsg(`Saldo convertido no lote ${r.lote.lote}.`);
        render();
    };
}

window.loteConverterSemLote = loteConverterSemLote;
