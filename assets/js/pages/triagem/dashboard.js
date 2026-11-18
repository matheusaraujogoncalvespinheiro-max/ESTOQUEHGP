// Gestão das Triagens: painel com as quatro equipes na competência (mês/ano) escolhida.
// Quem tem permissão de gerenciar vê o botão GERENCIAR EQUIPES (pages/triagem/gestao.js).

function triagemState() {
    if (!state.triagem) state.triagem = { competencia: competenciaAtual(), view: 'cards', tab: 'funcionarios', gestComp: competenciaAtual(), funcBusca: '', funcFiltro: '' };
    return state.triagem;
}

/** Cartões das quatro equipes (somente leitura). equipes = montarEquipes(...) */
function renderTriagemCards(equipes, competencia) {
    return `<div class="tri-grid">${equipes.map(({ equipe, integrantes, coordenador, total }) => `
        <article class="tri-card tone-teal" aria-label="${escapeHtml(equipe.nome)}">
            <div class="tri-card__head">
                <h3>${escapeHtml(equipe.nome.toUpperCase())}</h3>
                <span class="tri-card__count" title="Funcionários">${total}</span>
            </div>
            <div class="tri-card__coord">${lucideIcon('star', 'w-4 h-4 tri-star')} Responsável: <strong>${coordenador ? escapeHtml(coordenador.nome_funcionario) : 'não definido'}</strong></div>
            <div class="at-hint">Competência: ${escapeHtml(formatCompetencia(competencia))}</div>
            ${integrantes.length ? `<ul class="tri-members">${integrantes.map(i => `
                <li class="tri-member">
                    <span class="tri-member__name">${i.coordenador ? lucideIcon('star', 'w-4 h-4 tri-star') + ' ' : ''}${escapeHtml(i.nome_funcionario)}
                        <span class="tri-member__role">${escapeHtml(i.cargo)}</span></span>
                </li>`).join('')}</ul>` : '<div class="at-empty">Sem integrantes</div>'}
        </article>`).join('')}</div>`;
}

/** Mesma composição em tabela. */
function renderTriagemTabela(equipes) {
    const linhas = equipes.flatMap(({ equipe, integrantes }) => integrantes.map(i => `
        <tr>
            <td><strong>${escapeHtml(equipe.nome)}</strong></td>
            <td>${i.coordenador ? lucideIcon('star', 'w-4 h-4 tri-star') + ' ' : ''}${escapeHtml(i.nome_funcionario)}</td>
            <td>${escapeHtml(i.matricula)}</td>
            <td>${escapeHtml(i.cargo)}<br><small class="at-hint">${escapeHtml(i.categoria)}</small></td>
            <td>${i.coordenador ? '<span class="at-badge">Responsável</span>' : 'Integrante'}</td>
        </tr>`));
    return `<div class="at-card" style="padding:0;overflow-x:auto"><table class="tri-table">
        <thead><tr><th>Equipe</th><th>Funcionário</th><th>Matrícula</th><th>Cargo / categoria</th><th>Função</th></tr></thead>
        <tbody>${linhas.length ? linhas.join('') : '<tr><td colspan="5" class="at-empty">Nenhum integrante nesta competência.</td></tr>'}</tbody>
    </table></div>`;
}

/** Seletor de mês/ano com setas. onChange: nome da função global chamada com 'AAAA-MM'. */
function renderSeletorCompetencia(valor, onChange, prefixo) {
    return `<div class="tri-month" role="group" aria-label="Competência">
        <button type="button" class="at-btn at-btn--ghost" onclick="${onChange}('${prevCompetencia(valor)}')" aria-label="Mês anterior">${lucideIcon('chevron-left', 'w-5 h-5')}</button>
        <input class="at-input" type="month" id="${prefixo}_mes" value="${valor}" data-keep="${prefixo}_mes" onchange="if (isCompetencia(this.value)) ${onChange}(this.value)" aria-label="Mês e ano">
        <button type="button" class="at-btn at-btn--ghost" onclick="${onChange}('${nextCompetencia(valor)}')" aria-label="Próximo mês">${lucideIcon('chevron-right', 'w-5 h-5')}</button>
        <button type="button" class="at-btn at-btn--ghost" onclick="${onChange}('${competenciaAtual()}')">Mês atual</button>
    </div>`;
}

function renderTriagemDashboard() {
    db_watch('funcionarios');
    db_watch('composicoes');
    const st = triagemState();
    db_watchIntegrantes(st.competencia);

    const composicao = getComposicao(st.competencia);
    const equipes = montarEquipes(st.competencia);
    const pode = hasPermission('triagem_gerenciar');

    let faixa;
    if (!composicao) {
        faixa = `<div class="tri-banner tri-banner--warn">Ainda não há composição das equipes para <strong>${escapeHtml(formatCompetencia(st.competencia))}</strong>.
            ${pode && st.competencia >= competenciaAtual() ? `<button type="button" class="at-btn at-btn--ghost at-btn--sm" style="margin-left:10px" onclick="triagemAbrirGestao('composicao', '${st.competencia}')">Criar composição</button>` : ''}</div>`;
    } else {
        faixa = `<div class="tri-banner tri-banner--info">Competência <strong>${escapeHtml(formatCompetencia(st.competencia))}</strong> ·
            <span class="at-badge ${composicao.status === 'ENCERRADA' ? 'at-badge--off' : 'at-badge--ok'}">${composicao.status === 'ENCERRADA' ? 'Encerrada' : 'Aberta'}</span>
            ${composicao.copiada_de ? ` · copiada de ${escapeHtml(formatCompetencia(composicao.copiada_de))}` : ''}</div>`;
    }

    return `
    <div class="tone-teal at-stack">
        <div class="tri-toolbar">
            ${renderSeletorCompetencia(st.competencia, 'triagemMudarCompetencia', 'tri')}
            <span class="tri-spacer"></span>
            <div class="at-tabs" role="group" aria-label="Forma de exibição">
                <button type="button" class="at-tab ${st.view === 'cards' ? 'is-active' : ''}" onclick="triagemMudarView('cards')" aria-pressed="${st.view === 'cards'}">${lucideIcon('layout-grid', 'w-5 h-5')} Cartões</button>
                <button type="button" class="at-tab ${st.view === 'table' ? 'is-active' : ''}" onclick="triagemMudarView('table')" aria-pressed="${st.view === 'table'}">${lucideIcon('table', 'w-5 h-5')} Tabela</button>
            </div>
            ${pode ? `<button type="button" class="at-btn at-btn--primary" style="flex:none;min-height:52px" onclick="triagemAbrirGestao('funcionarios')">${lucideIcon('settings', 'w-5 h-5')} GERENCIAR EQUIPES</button>` : ''}
        </div>
        ${faixa}
        ${st.view === 'cards' ? renderTriagemCards(equipes, st.competencia) : renderTriagemTabela(equipes)}
    </div>`;
}

function triagemMudarCompetencia(c) {
    if (!isCompetencia(c)) return;
    triagemState().competencia = c;
    renderFresh();
}

function triagemMudarView(view) {
    triagemState().view = view;
    render();
}

function triagemAbrirGestao(aba, competencia = null) {
    const st = triagemState();
    st.tab = aba;
    if (competencia) st.gestComp = competencia;
    navigateTo('TRIAGEM_GESTAO');
}
