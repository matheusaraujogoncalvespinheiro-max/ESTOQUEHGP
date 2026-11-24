// Painel de chamadas (Etapa 3): tela para a TV da sala de espera. Mostra SÓ a senha, o local e a hora das chamadas do dia;
// nunca o nome do paciente, a queixa ou o nível de risco (privacidade). Lê o registro `chamadas`, alimentado pela
// triagem clínica e pelo atendimento médico quando chamam ou repetem a chamada. A voz é opcional e vem do navegador.

const PAINEL_JANELA_NOVA_MS = 30000;

function painelState() {
    if (!state.painel) {
        let tv = '';
        try { tv = localStorage.getItem('painel_tv') || ''; } catch (e) { /* sem armazenamento: a TV é escolhida de novo */ }
        state.painel = { fila: '', voz: false, visto: undefined, tv, filaRod: '', rodizioEm: Date.now() };
    }
    return state.painel;
}

/** TV escolhida neste navegador (cadastro Painéis de TV) e as filas dela. */
function painelTvAtual() {
    const st = painelState();
    const tv = cadRowsOf('paineltv').find(t => t.id === st.tv && t.ativo) || null;
    return { tv, filas: filasDaTv(tv), seg: tv && Number(tv.rodizio_seg) >= 5 && filasDaTv(tv).length > 1 ? Number(tv.rodizio_seg) : 0 };
}

function renderPainelChamada() {
    db_watch('chamadas'); db_cadWatch('paineltv');
    const st = painelState();
    const hoje = todayISO();
    const { tv, filas: filasTv, seg } = painelTvAtual();
    const base = (MOCK_DATA.CHAMADAS || []).filter(c => c.dia === hoje && (tv ? filasTv.includes(c.fila) : (!st.fila || c.fila === st.fila))).sort((a, b) => String(b.em).localeCompare(String(a.em)));
    // Rodízio: mostra uma fila por vez; chamada nova em qualquer fila da TV leva a tela para ela.
    if (seg) {
        if (!filasTv.includes(st.filaRod)) { st.filaRod = filasTv[0]; st.rodizioEm = Date.now(); }
        if (base[0] && st.visto !== undefined && st.visto !== base[0].id && Date.now() - new Date(base[0].em).getTime() < PAINEL_JANELA_NOVA_MS) { st.filaRod = base[0].fila; st.rodizioEm = Date.now(); }
    }
    const lista = seg ? base.filter(c => c.fila === st.filaRod) : base;
    const atual = lista[0] || null;

    // Nova chamada (ou repetição) desde a última leitura: pisca e, se a voz estiver ligada, fala. Chamadas que já existiam ao abrir
    // a tela (ou com mais de 30 s) só são marcadas como vistas, para o painel não anunciar de novo o que já foi chamado.
    let nova = false;
    const ultima = base[0] || null;
    if (ultima && st.visto !== ultima.id) {
        nova = st.visto !== undefined && Date.now() - new Date(ultima.em).getTime() < PAINEL_JANELA_NOVA_MS;
        if (nova) painelAnunciar(ultima);
    }
    if (st.visto === undefined || ultima) st.visto = ultima ? ultima.id : null;

    const historico = lista.slice(1, 9);
    return `
    <div class="pn-root">
        <header class="pn-top">
            <button type="button" class="pn-btn" onclick="immersiveHome()" aria-label="HOME: voltar ao Dashboard">${lucideIcon('home', 'w-5 h-5')} HOME</button>
            <h1>${lucideIcon('tv', 'w-7 h-7')} Painel de chamadas</h1>
            <div class="pn-tools">
                ${cadRowsOf('paineltv').some(t => t.ativo) ? `<label class="pn-sel"><span>TV</span><select onchange="painelTv(this.value)" data-native="true" data-keep="pn_tv">
                    <option value="" ${st.tv ? '' : 'selected'}>Sem TV definida</option>
                    ${cadRowsOf('paineltv').filter(t => t.ativo).map(t => `<option value="${escapeHtml(t.id)}" ${st.tv === t.id ? 'selected' : ''}>${escapeHtml(t.nome)}</option>`).join('')}</select></label>` : ''}
                ${tv ? '' : `<label class="pn-sel"><span>Mostrar</span><select onchange="painelFila(this.value)" data-native="true" data-keep="pn_fila">
                    <option value="" ${st.fila ? '' : 'selected'}>Todas as chamadas</option>
                    ${['TRIAGEM', 'MEDICO', 'EXAMES', 'AMBULATORIO', 'PROCEDIMENTOS'].map(k => `<option value="${k}" ${st.fila === k ? 'selected' : ''}>${escapeHtml(FILAS_ATENDIMENTO[k])}</option>`).join('')}</select></label>`}
                <button type="button" class="pn-btn" onclick="painelVoz()" aria-pressed="${st.voz}" title="Ler a chamada em voz alta (usa a voz do navegador)">${lucideIcon(st.voz ? 'volume-2' : 'volume-x', 'w-5 h-5')} Voz ${st.voz ? 'ligada' : 'desligada'}</button>
                <button type="button" class="pn-btn pn-btn--ico" onclick="painelTelaCheia()" title="Tela cheia" aria-label="Tela cheia">${lucideIcon('maximize', 'w-5 h-5')}</button>
                <span class="pn-clock" data-clock>${escapeHtml(formatDateTimeBR(new Date().toISOString()))}</span>
            </div>
        </header>
        <main class="pn-main">
            <section class="pn-atual ${nova ? 'pn-pulse' : ''}" aria-live="assertive" aria-label="Chamada atual">
                ${atual ? `
                    <p class="pn-rot">${atual.tipo === 'REPETICAO' ? 'Chamando novamente' : 'Chamando'}</p>
                    <div class="pn-senha">${escapeHtml(atual.senha)}</div>
                    <div class="pn-local">${escapeHtml(atual.local_nome)}</div>
                    <p class="pn-fila">${escapeHtml(rotuloFila(atual.fila))} · ${escapeHtml(horaCurta(atual.em))}</p>`
                : `<p class="pn-rot">Aguardando chamadas</p><div class="pn-vazio">${lucideIcon('clock', 'w-16 h-16')}</div>`}
            </section>
            <aside class="pn-hist" aria-label="Últimas chamadas">
                <h2>Últimas chamadas</h2>
                <ol>${historico.map(c => `<li><strong>${escapeHtml(c.senha)}</strong><span>${escapeHtml(c.local_nome)}</span><time>${escapeHtml(horaCurta(c.em))}</time></li>`).join('') || '<li class="pn-nada">Nenhuma chamada anterior.</li>'}</ol>
            </aside>
        </main>
    </div>`;
}

function painelTv(id) {
    const st = painelState();
    st.tv = id; st.filaRod = ''; st.rodizioEm = Date.now(); st.visto = undefined;
    try { localStorage.setItem('painel_tv', id); } catch (e) { /* sem armazenamento */ }
    render();
}

// Rodízio: a cada segundo confere se já passou o tempo da TV e muda para a próxima fila que tem chamada hoje.
setInterval(() => {
    if (state.activeModule !== 'PAINEL_CHAMADA' || !state.painel) return;
    const { filas, seg } = painelTvAtual();
    const st = painelState();
    if (!seg || Date.now() - st.rodizioEm < seg * 1000) return;
    const hoje = todayISO();
    const tem = (f) => (MOCK_DATA.CHAMADAS || []).some(c => c.dia === hoje && c.fila === f);
    st.filaRod = proximaFilaRodizio(filas, st.filaRod, tem);
    st.rodizioEm = Date.now();
    render();
}, 1000);

function painelFila(valor) { painelState().fila = valor; painelState().visto = undefined; render(); }

function painelVoz() {
    const st = painelState();
    st.voz = !st.voz;
    if (st.voz) {
        if (!('speechSynthesis' in window)) { st.voz = false; showMsg('Este navegador não tem leitura de voz.', 'error'); }
        else painelFalar('Voz do painel ligada.');   // também libera o áudio, que o navegador só permite após um clique
    } else if ('speechSynthesis' in window) speechSynthesis.cancel();
    render();
}

function painelFalar(texto) {
    try {
        const u = new SpeechSynthesisUtterance(texto);
        u.lang = 'pt-BR'; u.rate = 0.9;
        speechSynthesis.cancel();
        speechSynthesis.speak(u);
    } catch (e) { /* voz indisponível: o painel continua visual */ }
}

function painelAnunciar(chamada) {
    if (painelState().voz && 'speechSynthesis' in window) painelFalar(textoChamada(chamada.senha, chamada.local_nome));
}

function painelTelaCheia() {
    try {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen();
    } catch (e) { showMsg('Não foi possível entrar em tela cheia.', 'error'); }
}
