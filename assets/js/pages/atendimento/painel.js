// Painel de chamadas (Etapa 3): tela para a TV da sala de espera. Mostra SÓ a senha, o local e a hora das chamadas do dia;
// nunca o nome do paciente, a queixa ou o nível de risco (privacidade). Lê o registro `chamadas`, alimentado pela
// triagem clínica e pelo atendimento médico quando chamam ou repetem a chamada. A voz é opcional e vem do navegador.

const PAINEL_JANELA_NOVA_MS = 30000;

function painelState() {
    if (!state.painel) state.painel = { fila: '', voz: false, visto: undefined };
    return state.painel;
}

function renderPainelChamada() {
    db_watch('chamadas');
    const st = painelState();
    const hoje = todayISO();
    const lista = (MOCK_DATA.CHAMADAS || []).filter(c => c.dia === hoje && (!st.fila || c.fila === st.fila)).sort((a, b) => String(b.em).localeCompare(String(a.em)));
    const atual = lista[0] || null;

    // Nova chamada (ou repetição) desde a última leitura: pisca e, se a voz estiver ligada, fala. Chamadas que já existiam ao abrir
    // a tela (ou com mais de 30 s) só são marcadas como vistas, para o painel não anunciar de novo o que já foi chamado.
    let nova = false;
    if (atual && st.visto !== atual.id) {
        nova = st.visto !== undefined && Date.now() - new Date(atual.em).getTime() < PAINEL_JANELA_NOVA_MS;
        if (nova) painelAnunciar(atual);
    }
    if (st.visto === undefined || atual) st.visto = atual ? atual.id : null;

    const historico = lista.slice(1, 9);
    return `
    <div class="pn-root">
        <header class="pn-top">
            <button type="button" class="pn-btn" onclick="immersiveHome()" aria-label="HOME: voltar ao Dashboard">${lucideIcon('home', 'w-5 h-5')} HOME</button>
            <h1>${lucideIcon('tv', 'w-7 h-7')} Painel de chamadas</h1>
            <div class="pn-tools">
                <label class="pn-sel"><span>Mostrar</span><select onchange="painelFila(this.value)" data-native="true" data-keep="pn_fila">
                    <option value="" ${st.fila ? '' : 'selected'}>Todas as chamadas</option>
                    ${['TRIAGEM', 'MEDICO', 'EXAMES', 'AMBULATORIO', 'PROCEDIMENTOS'].map(k => `<option value="${k}" ${st.fila === k ? 'selected' : ''}>${escapeHtml(FILAS_ATENDIMENTO[k])}</option>`).join('')}</select></label>
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
