// Painel da Direção (Etapa 10): indicadores do hospital num período, cada um com o critério de contagem escrito ao lado.
// Regras e cálculo em services/direcao.js. Só consulta: não mostra nome de paciente nem define meta.

function direcaoState() {
    if (!state.direcao) state.direcao = { de: todayISO(new Date(Date.now() - 30 * 86400000)), ate: todayISO(), atend: null, truncado: false, carregando: false, erro: '' };
    return state.direcao;
}

/** Lê os atendimentos do período (sob demanda) e redesenha. */
async function direcaoCarregar() {
    const st = direcaoState();
    if (st.carregando) return;
    st.carregando = true; st.erro = '';
    try {
        const r = await db_getAtendimentosPeriodo(st.de, st.ate);
        st.atend = r.itens; st.truncado = r.truncado;
    } catch (err) { st.erro = err.message || 'Não foi possível carregar os atendimentos.'; st.atend = []; }
    st.carregando = false;
    render();
}
function direcaoPeriodo(campo, valor) { const st = direcaoState(); st[campo] = valor; st.atend = null; render(); }

/** Leitos da estrutura e quantos estão ocupados agora. */
function direcaoLeitos() {
    const leitos = typeof estruturaHospital === 'function' ? estruturaHospital() : [];
    const estado = MOCK_DATA.LEITOS_ESTADO || {};
    return { total: leitos.length, ocupados: leitos.filter(l => (estado[l.id] || {}).status === 'OCUPADO').length };
}

/** Metas e prazos que o hospital definiu em Configurações (só os que têm valor). A Direção com permissão altera por lá. */
function direcaoMetasDefinidas() {
    if (typeof CATALOGO_PARAMETROS === 'undefined' || typeof parametroSistema !== 'function') return '';
    const itens = CATALOGO_PARAMETROS.map(p => ({ p, v: parametroSistema(p.id) })).filter(x => x.v !== null);
    const link = hasPermission('config_gerenciar') ? `<button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="navigateTo('CONFIGURACOES')">Alterar em Configurações</button>` : '';
    return `<section class="at-card e10-sec"><h3 class="e10-sec__t">Metas e prazos definidos pelo hospital</h3>
        ${itens.length ? `<dl class="about-list">${itens.map(x => `<div><dt>${escapeHtml(x.p.rotulo)}</dt><dd>${x.v} ${escapeHtml(x.p.unidade)}</dd></div>`).join('')}</dl>` : '<p class="at-hint">O hospital ainda não definiu metas nem prazos.</p>'}${link}</section>`;
}

function renderDirecao() {
    if (!hasPermission('direcao_ver')) return '<div class="at-stack"><p class="tri-banner tri-banner--warn">Acesso negado: seu perfil não pode ver o painel da direção.</p></div>';
    ['internacoes', 'leitos', 'os_abertas', 'os_recentes', 'ouvidoria_abertas', 'ouvidoria_recentes', 'nc_abertas', 'nc_recentes', 'acoes_qualidade_abertas', 'acoes_qualidade_recentes', 'docs_qualidade', 'ensino_abertas', 'ensino_recentes']
        .forEach(w => { try { db_watch(w); } catch (e) { /* sem banco */ } });
    db_cadWatch('leito');
    const st = direcaoState();
    if (st.atend === null && !st.carregando) setTimeout(direcaoCarregar, 0);
    const dados = {
        atendimentos: st.atend || [], internacoes: MOCK_DATA.INTERNACOES || [], leitos: direcaoLeitos(), os: osConhecidas(), ouvidoria: ouvidoriaConhecidas(),
        qualidade: { ncs: ncConhecidas(), acoes: acoesQualidadeConhecidas(), docs: MOCK_DATA.DOCS_QUALIDADE || [] }, ensino: ensinoConhecidas()
    };
    const r = indicadoresDirecao(dados, st.de, st.ate);

    const lista = (mapa, rotulos = {}) => {
        const itens = Object.entries(mapa).sort((a, b) => b[1] - a[1]);
        return itens.length ? `<dl class="about-list">${itens.map(([k, v]) => `<div><dt>${escapeHtml(rotulos[k] || k)}</dt><dd>${v}</dd></div>`).join('')}</dl>` : '<p class="at-hint">Sem registros no período.</p>';
    };
    // Metas definidas pelo hospital (Parâmetros do Sistema): só são exibidas, o painel não julga atingiu/não atingiu
    const METAS = { 'Espera média até a chamada': ['meta_espera_chamada_min', ' min'], 'Ocupação dos leitos agora': ['meta_ocupacao_pct', '%'] };
    const metaDe = (rotulo) => { const m = METAS[rotulo]; const v = m && typeof parametroSistema === 'function' ? parametroSistema(m[0]) : null; return v === null ? '' : `<p class="e10-ind__c">Meta definida pelo hospital: ${v}${m[1]}</p>`; };
    const secao = (s) => `<section class="at-card e10-sec"><h3 class="e10-sec__t">${escapeHtml(s.titulo)}</h3>
        <div class="e10-grid">${s.itens.map(i => `<article class="e10-ind"><span class="e10-ind__r">${escapeHtml(i.rotulo)}</span><strong class="e10-ind__v">${escapeHtml(String(i.valor))}</strong><p class="e10-ind__c">${escapeHtml(i.criterio)}</p>${metaDe(i.rotulo)}</article>`).join('')}</div></section>`;

    const at = r.atendimentos;
    const rotRisco = { SEM_CLASSIFICACAO: 'Sem classificação' };
    const detalhes = `<section class="at-card e10-sec"><h3 class="e10-sec__t">Atendimentos em detalhe</h3>
        <div class="e10-det">
            <div><h4 class="e10-det__t">Por fila</h4>${lista(at.porFila)}</div>
            <div><h4 class="e10-det__t">Por tipo de atendimento</h4>${lista(at.porTipo)}</div>
            <div><h4 class="e10-det__t">Por situação</h4>${lista(at.porStatus, STATUS_ATENDIMENTO)}</div>
            <div><h4 class="e10-det__t">Por classificação de risco</h4>${lista(at.porRisco, rotRisco)}</div>
        </div></section>`;

    return `
    <div class="at-stack tone-teal">
        <header class="cd-head"><div class="cd-head__ico">${lucideIcon('layout-dashboard', 'w-7 h-7')}</div>
            <div class="cd-head__txt"><h2>Painel da Direção</h2><p>Números do que foi registrado no sistema, com o critério de cada um. Sem nome de paciente, sem meta e sem custo.</p></div></header>
        <section class="at-card">
            <div class="rf-filtros">
                <label class="at-field"><span class="at-label">De</span><input class="at-input" type="date" value="${escapeHtml(st.de)}" max="${todayISO()}" onchange="direcaoPeriodo('de', this.value)" data-keep="dir_de"></label>
                <label class="at-field"><span class="at-label">Até</span><input class="at-input" type="date" value="${escapeHtml(st.ate)}" max="${todayISO()}" onchange="direcaoPeriodo('ate', this.value)" data-keep="dir_ate"></label>
            </div>
            ${st.erro ? `<p class="tri-banner tri-banner--warn">${escapeHtml(st.erro)}</p>` : ''}
            ${st.truncado ? `<p class="tri-banner tri-banner--warn">O período tem mais de ${LIMITE_ATENDIMENTOS_DIRECAO} atendimentos: os números de atendimento consideram só os primeiros ${LIMITE_ATENDIMENTOS_DIRECAO}. Reduza o período.</p>` : ''}
            ${st.atend === null ? '<p class="at-hint">Carregando os atendimentos do período...</p>' : ''}
        </section>
        ${r.secoes.map(secao).join('')}
        ${detalhes}
        ${direcaoMetasDefinidas()}
        <p class="at-hint">${lucideIcon('info', 'w-4 h-4')} Internações, ocupação e ordens de serviço usam os dados já carregados pelo sistema; atendimentos são lidos do banco para o período escolhido.</p>
    </div>`;
}
