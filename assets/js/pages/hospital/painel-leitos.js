// Painel de Disponibilidade de Leitos (Etapa 5): tela imersiva para a coordenação/TV. Mostra SÓ números (livres, ocupados, higienização,
// bloqueados e quem aguarda leito), por andar e ala; nunca o nome do paciente. Dados em tempo real de `leitos_estado` e da fila de leito.
// Regras de contagem em services/fila-leito.js (resumoDisponibilidade).

function painelLeitosState() {
    if (!state.painelLeitos) state.painelLeitos = { andar: '' };
    return state.painelLeitos;
}

const PL_STATUS = [['LIVRE', 'Livres', 'livre'], ['OCUPADO', 'Ocupados', 'ocupado'], ['HIGIENIZACAO', 'Em higienização', 'higien'], ['BLOQUEADO', 'Bloqueados', 'bloq']];

function renderPainelLeitos() {
    db_watch('leitos'); db_cadWatch('leito');
    const verFila = hasPermission('fila_leito');   // o painel é aberto também por perfis sem acesso aos atendimentos: eles veem só os leitos
    if (verFila) db_watch('fila_leito');
    const st = painelLeitosState();
    const res = resumoDisponibilidade();
    const fila = resumoFilaLeito(filaDeLeito(), nowISO());
    const andares = res.andares.filter(a => !st.andar || a.andar === st.andar);
    const ind = indicadoresLeitos();

    const kpi = (valor, rotulo, cls) => `<div class="pl-kpi pl-kpi--${cls}"><strong>${escapeHtml(String(valor))}</strong><span>${escapeHtml(rotulo)}</span></div>`;
    const barra = (c) => `<div class="pl-bar" role="img" aria-label="${PL_STATUS.map(([k, r]) => `${c[k]} ${r.toLowerCase()}`).join(', ')}">${PL_STATUS.map(([k, , cls]) => (c[k] ? `<i class="pl-seg pl-seg--${cls}" style="width:${(c[k] / c.total) * 100}%"></i>` : '')).join('')}</div>`;
    const numeros = (c) => `<ul class="pl-nums">${PL_STATUS.map(([k, r, cls]) => `<li class="pl-num pl-num--${cls}"><strong>${c[k]}</strong><span>${escapeHtml(r)}</span></li>`).join('')}</ul>`;

    const cartoes = andares.map(a => `
        <section class="pl-andar" aria-label="${escapeHtml(a.andarNome)}">
            <header class="pl-andar__top"><h2>${escapeHtml(a.andarNome)}</h2><p><strong>${a.LIVRE}</strong> livres de ${a.total} · ocupação ${a.taxa}%</p></header>
            ${barra(a)}
            <div class="pl-alas">${a.alas.map(al => `
                <div class="pl-ala"><div class="pl-ala__top"><h3>${escapeHtml(al.ala)}</h3><span>${al.LIVRE} livres de ${al.total}</span></div>
                    ${barra(al)}${numeros(al)}</div>`).join('')}</div>
        </section>`).join('');

    return `
    <div class="pn-root pl-root">
        <header class="pn-top">
            <button type="button" class="pn-btn" onclick="immersiveHome()" aria-label="HOME: voltar ao Dashboard">${lucideIcon('home', 'w-5 h-5')} HOME</button>
            <h1>${lucideIcon('bed-double', 'w-7 h-7')} Disponibilidade de leitos</h1>
            <div class="pn-tools">
                <label class="pn-sel"><span>Andar</span><select onchange="painelLeitosAndar(this.value)" data-native="true" data-keep="pl_andar">
                    <option value="" ${st.andar ? '' : 'selected'}>Todos os andares</option>
                    ${res.andares.map(a => `<option value="${escapeHtml(a.andar)}" ${st.andar === a.andar ? 'selected' : ''}>${escapeHtml(a.andarNome)}</option>`).join('')}</select></label>
                ${hasPermission('fila_leito') ? `<button type="button" class="pn-btn" onclick="navigateTo('FILA_LEITO')">${lucideIcon('list-ordered', 'w-5 h-5')} Fila de leito</button>` : ''}
                <button type="button" class="pn-btn pn-btn--ico" onclick="painelTelaCheia()" title="Tela cheia" aria-label="Tela cheia">${lucideIcon('maximize', 'w-5 h-5')}</button>
                <span class="pn-clock" data-clock>${escapeHtml(formatDateTimeBR(new Date().toISOString()))}</span>
            </div>
        </header>
        <main class="pl-main">
            <section class="pl-kpis" style="--n:${verFila ? 6 : 5}" data-n="${verFila ? 6 : 5}" aria-label="Resumo geral">
                ${kpi(res.geral.LIVRE, 'Leitos livres', 'livre')}${kpi(res.geral.OCUPADO, 'Ocupados', 'ocupado')}${kpi(res.geral.HIGIENIZACAO, 'Em higienização', 'higien')}${kpi(res.geral.BLOQUEADO, 'Bloqueados', 'bloq')}
                ${kpi(`${res.geral.taxa}%`, 'Taxa de ocupação', 'taxa')}${verFila ? kpi(fila.aguardando, fila.aguardando ? `Aguardando leito · maior espera ${filaLeitoEspera(fila.espera_maior)}` : 'Aguardando leito', 'fila') : ''}
            </section>
            <p class="pl-nota">${lucideIcon('info', 'w-4 h-4')} Total de ${res.geral.total} leitos. Bloqueados: ${ind.bloqueio.MANUTENCAO} por manutenção, ${ind.bloqueio.ISOLAMENTO} por isolamento e ${ind.bloqueio.OUTRO} por outro motivo.
                Leitos de isolamento cadastrados: ${res.isolamento.cadastrados} (${res.isolamento.livres} livres). Este painel não mostra dados de pacientes.</p>
            <div class="pl-grid">${cartoes || '<p class="pl-nota">Nenhum leito na estrutura do hospital.</p>'}</div>
        </main>
    </div>`;
}

function painelLeitosAndar(valor) { painelLeitosState().andar = valor; render(); }
