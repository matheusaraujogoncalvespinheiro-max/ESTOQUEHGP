// Painel da UTI (Etapa 8): internados da UTI com balanço hídrico, dispositivos invasivos em uso e último sinal vital.
// Regras e gravação em services/uti.js. Mostra só o que foi lançado: não interpreta o saldo nem alerta tempo de dispositivo.

function utiState() {
    if (!state.utiPainel) state.utiPainel = { escopo: 'uti', unidade: '', janela: '24H', q: '' };
    return state.utiPainel;
}

let utiBuscaTimer = null;
function utiFiltro(campo, valor) { utiState()[campo] = valor; render(); }
function utiFiltroTexto(valor) { utiState().q = valor; clearTimeout(utiBuscaTimer); utiBuscaTimer = setTimeout(render, 250); }

const utiLeitoDe = (i) => leitoPorId(i.leito_id) || { id: i.leito_id, rotulo: i.leito_id, ala: i.ala };
const utiDiasInternado = (i) => Math.max(1, Math.round((Date.parse(todayISO() + 'T00:00:00') - Date.parse(todayISO(new Date(i.data_hora_internacao)) + 'T00:00:00')) / 86400000) + 1);
const sinalFmt = (v) => (v >= 0 ? '+' : '−') + Math.abs(v);

function renderPainelUti() {
    db_watch('internacoes'); db_watch('leitos'); db_cadWatch('leito'); db_watch('balanco'); db_watch('dispositivos'); db_watch('sinais');
    const st = utiState();
    const agora = new Date();
    const ativas = (MOCK_DATA.INTERNACOES || []).filter(i => i.status === 'ATIVA');
    const naUti = ativas.filter(i => ehLeitoUti(utiLeitoDe(i)));
    const base = st.escopo === 'todos' ? ativas : naUti;
    const unidades = [...new Set(base.map(i => utiLeitoDe(i).ala))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
    const termo = searchKey(st.q);
    const lista = base.filter(i => (!st.unidade || utiLeitoDe(i).ala === st.unidade) && (!termo || searchKey(`${i.paciente_nome} ${i.prontuario} ${utiLeitoDe(i).rotulo}`).includes(termo)))
        .sort((a, b) => String(utiLeitoDe(a).rotulo).localeCompare(String(utiLeitoDe(b).rotulo), 'pt-BR', { numeric: true }));
    const registra = hasPermission('uti_registrar');
    const emUso = (MOCK_DATA.DISPOSITIVOS_EM_USO || []);
    const botao = (rotulo, acao, primario = false) => `<button type="button" class="at-btn ${primario ? 'at-btn--primary' : 'at-btn--ghost'} at-btn--sm" onclick="${acao}">${rotulo}</button>`;
    const kpi = (valor, rotulo) => `<div class="rf-kpi"><strong>${escapeHtml(String(valor))}</strong><span>${escapeHtml(rotulo)}</span></div>`;
    const sel = (campo, valor, opts) => `<select class="at-input" onchange="utiFiltro('${campo}', this.value)" data-keep="uti_${campo}">${opts.map(([v, rot]) => `<option value="${escapeHtml(v)}" ${v === valor ? 'selected' : ''}>${escapeHtml(rot)}</option>`).join('')}</select>`;
    const nomesVisiveis = podeVerNomePaciente();

    const linhas = lista.map(i => {
        const leito = utiLeitoDe(i);
        const bal = calcularBalanco((MOCK_DATA.BALANCO_HIDRICO || []).filter(l => l.internacao_id === i.id), st.janela, agora);
        const disp = emUso.filter(d => d.internacao_id === i.id);
        const ult = (MOCK_DATA.SINAIS_VITAIS || []).filter(s => s.internacao_id === i.id).sort((a, b) => String(b.medido_em).localeCompare(String(a.medido_em)))[0];
        return `<tr>
            <td data-label="Leito"><strong>${escapeHtml(leito.rotulo)}</strong><br><small>${escapeHtml(leito.ala || '')}</small></td>
            <td data-label="Paciente">${nomesVisiveis ? escapeHtml(i.paciente_nome) : 'Paciente internado'}<br><small>Prontuário: ${escapeHtml(i.prontuario || '—')} · ${utiDiasInternado(i)}º dia</small></td>
            <td data-label="Balanço (${escapeHtml(JANELAS_BALANCO[st.janela])})">${bal.lancamentos ? `<strong>${sinalFmt(bal.saldo)} mL</strong><br><small>Ganhos ${bal.ganhos} · Perdas ${bal.perdas}</small>` : '<small>Sem lançamentos</small>'}</td>
            <td data-label="Dispositivos">${disp.length ? disp.map(d => `<span class="at-badge at-badge--outros" title="${escapeHtml(d.tipo_rotulo + ' · ' + d.local)}">${escapeHtml(d.tipo)} D${diasDeUso(d, agora)}</span>`).join(' ') : '<small>Nenhum em uso</small>'}</td>
            <td data-label="Último sinal vital">${ult ? `${escapeHtml(horaCurta(ult.medido_em))}<br><small>${escapeHtml(ult.aferido ? resumoSinais(ult.valores) : 'não aferido')}</small>` : '<small>—</small>'}</td>
            <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${botao('Balanço hídrico', `utiBalanco('${i.id}')`, registra)}${botao('Dispositivos', `utiDispositivos('${i.id}')`)}${hasPermission('prontuario_ver') ? botao('Prontuário', `prontuarioAbrir('${i.paciente_id}')`) : ''}</div></td></tr>`;
    }).join('');

    return `
    <div class="at-stack tone-teal">
        <header class="cd-head"><div class="cd-head__ico">${lucideIcon('activity', 'w-7 h-7')}</div>
            <div class="cd-head__txt"><h2>Painel da UTI</h2><p>Internados da UTI com balanço hídrico, dispositivos invasivos em uso e último sinal vital. Mostra só o que foi lançado, sem interpretar.</p></div></header>
        <section class="rf-kpis" aria-label="Resumo da UTI">
            ${kpi(lista.length, 'Pacientes na lista')}${kpi(new Set(emUso.filter(d => lista.some(i => i.id === d.internacao_id)).map(d => d.internacao_id)).size, 'Com dispositivo em uso')}
            ${kpi(emUso.filter(d => lista.some(i => i.id === d.internacao_id)).length, 'Dispositivos em uso')}${kpi(lista.filter(i => (MOCK_DATA.BALANCO_HIDRICO || []).some(l => l.internacao_id === i.id)).length, 'Com balanço lançado (2 dias)')}
        </section>
        <section class="at-card">
            <div class="rf-filtros">
                <label class="at-field"><span class="at-label">Buscar</span><input class="at-input" type="search" value="${escapeHtml(st.q)}" placeholder="Paciente, prontuário ou leito" oninput="utiFiltroTexto(this.value)" data-keep="uti_q" autocomplete="off"></label>
                <label class="at-field"><span class="at-label">Quem listar</span>${sel('escopo', st.escopo, [['uti', 'Leitos de UTI'], ['todos', 'Todos os internados']])}</label>
                <label class="at-field"><span class="at-label">Unidade</span>${sel('unidade', st.unidade, [['', 'Todas'], ...unidades.map(u => [u, u])])}</label>
                <label class="at-field"><span class="at-label">Período do balanço</span>${sel('janela', st.janela, Object.entries(JANELAS_BALANCO))}</label>
            </div>
            ${st.escopo === 'uti' && !naUti.length ? `<p class="tri-banner tri-banner--warn">Nenhum internado em leito de UTI. A UTI é identificada pelo tipo do leito (Cadastro › Assistência › Quartos e Leitos, tipo "UTI") ou por "UTI" no nome da ala. ${ativas.length ? 'Use "Todos os internados" para lançar em outro setor.' : ''}</p>` : ''}
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-tabela e8-tab e8-tab--leito-cheio"><thead><tr><th>Leito</th><th>Paciente</th><th>Balanço</th><th>Dispositivos</th><th>Último sinal vital</th><th>Ações</th></tr></thead>
                <tbody>${linhas || '<tr><td colspan="6" class="at-empty">Nenhum paciente com estes filtros.</td></tr>'}</tbody></table></div>
            <p class="at-hint" style="margin-top:12px">${lucideIcon('info', 'w-4 h-4')} Saldo = ganhos − perdas lançados no período, sem perda insensível nem meta de balanço (parâmetros do hospital). "D3" é o 3º dia de uso do dispositivo; o sistema não alerta tempo máximo de uso.</p>
        </section>
    </div>`;
}

// ============ Balanço hídrico ============

const utiCabecalho = (i) => `<section class="tc-paciente"><div><strong>${escapeHtml(i.paciente_nome)}</strong> <span class="at-badge at-badge--outros">Leito ${escapeHtml(utiLeitoDe(i).rotulo)}</span></div>
    <small>Prontuário ${escapeHtml(i.prontuario || '—')} · ${escapeHtml(utiLeitoDe(i).ala || '')} · internado em ${escapeHtml(formatDateTimeBR(i.data_hora_internacao))}</small></section>`;

async function utiBalanco(internacaoId) {
    try {
        requirePermission('uti_ver');
        const i = (MOCK_DATA.INTERNACOES || []).find(x => x.id === internacaoId);
        if (!i || i.status !== 'ATIVA') throw new Error('Este paciente não tem internação ativa.');
        registrarAcesso('paciente', i.paciente_id, 'UTI: balanço hídrico');
        const registra = hasPermission('uti_registrar');
        let lancs = await db_getBalancoInternacao(internacaoId);
        const janela = utiState().janela;
        const d = hModal(`Balanço hídrico · ${i.paciente_nome}`, `
            ${utiCabecalho(i)}
            <div id="bal_resumo" style="margin-top:12px"></div>
            ${registra ? `<h3 class="at-label" style="margin:14px 0 6px">Novo lançamento</h3>
            <div class="at-form tc-form">
                <label class="at-field"><span class="at-label">Tipo *</span><select class="at-input" id="bal_tipo"><option value="GANHO">Ganho</option><option value="PERDA">Perda</option></select></label>
                <label class="at-field"><span class="at-label">Via *</span><select class="at-input" id="bal_via"></select></label>
                <label class="at-field"><span class="at-label">Volume (mL) *</span><input class="at-input" id="bal_vol" inputmode="numeric" maxlength="4" autocomplete="off"></label>
                <label class="at-field"><span class="at-label">Hora do evento (vazio = agora)</span><input class="at-input" type="datetime-local" id="bal_em"></label>
                <label class="at-field at-span-2"><span class="at-label">Observação</span><input class="at-input" id="bal_obs" maxlength="200" autocomplete="off"></label>
            </div>
            <p class="at-error" id="bal_erro" role="alert"></p>
            <div class="at-actions" style="margin-top:8px"><button type="button" class="at-btn at-btn--primary" id="bal_ok">Lançar</button></div>` : ''}
            <h3 class="at-label" style="margin:14px 0 6px">Lançamentos</h3>
            <div id="bal_lista"></div>
            <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Fechar</button></div>`, 'xl');
        const pintar = () => {
            const b = calcularBalanco(lancs, janela);
            const anulados = new Set(lancs.filter(l => l.tipo === 'ANULACAO').map(l => l.anula_id));
            d.querySelector('#bal_resumo').innerHTML = `<div class="rf-kpis"><div class="rf-kpi"><strong>${sinalFmt(b.saldo)} mL</strong><span>Saldo (${escapeHtml(JANELAS_BALANCO[janela])})</span></div>
                <div class="rf-kpi"><strong>${b.ganhos} mL</strong><span>Ganhos</span></div><div class="rf-kpi"><strong>${b.perdas} mL</strong><span>Perdas</span></div><div class="rf-kpi"><strong>${b.lancamentos}</strong><span>Lançamentos</span></div></div>`;
            const itens = lancs.filter(l => l.tipo !== 'ANULACAO').slice(0, 40);
            d.querySelector('#bal_lista').innerHTML = itens.length ? `<div class="tri-tablewrap"><table class="tri-table cd-table rf-lista"><thead><tr><th>Hora</th><th>Tipo</th><th>Via</th><th>Volume</th><th>Por</th><th>Ações</th></tr></thead><tbody>${itens.map(l => `<tr class="${anulados.has(l.id) ? 'e8-anulado' : ''}">
                <td data-label="Hora">${escapeHtml(formatDateTimeBR(l.em))}</td><td data-label="Tipo">${l.tipo === 'GANHO' ? 'Ganho' : 'Perda'}</td><td data-label="Via">${escapeHtml(l.via_rotulo)}${l.observacao ? `<br><small>${escapeHtml(l.observacao)}</small>` : ''}</td>
                <td data-label="Volume">${l.volume_ml} mL</td><td data-label="Por">${escapeHtml(l.por_nome || '')}</td>
                <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${anulados.has(l.id) ? '<span class="at-badge at-badge--off">Anulado</span>' : (registra ? `<button type="button" class="at-btn at-btn--ghost at-btn--sm" data-anular="${escapeHtml(l.id)}">Anular</button>` : '')}</div></td></tr>`).join('')}</tbody></table></div>`
                : '<p class="at-hint">Nenhum lançamento nos últimos dois dias.</p>';
        };
        pintar();
        if (!registra) return;
        const vias = () => { const t = d.querySelector('#bal_tipo').value; d.querySelector('#bal_via').innerHTML = Object.entries(VIAS_BALANCO[t]).map(([k, r]) => `<option value="${k}">${escapeHtml(r)}</option>`).join(''); };
        vias();
        d.querySelector('#bal_tipo').onchange = vias;
        d.querySelector('#bal_ok').onclick = async () => {
            d.querySelector('#bal_erro').textContent = '';
            try {
                await lancarBalanco(internacaoId, { tipo: d.querySelector('#bal_tipo').value, via: d.querySelector('#bal_via').value, volume_ml: d.querySelector('#bal_vol').value, em: d.querySelector('#bal_em').value, observacao: d.querySelector('#bal_obs').value });
                lancs = await db_getBalancoInternacao(internacaoId);
                d.querySelector('#bal_vol').value = ''; d.querySelector('#bal_obs').value = ''; d.querySelector('#bal_em').value = '';
                pintar(); showMsg('Lançamento registrado.');
            } catch (err) { d.querySelector('#bal_erro').textContent = err.message || 'Operação não realizada.'; }
        };
        d.querySelector('#bal_lista').addEventListener('click', (ev) => {
            const b = ev.target.closest('[data-anular]');
            if (!b) return;
            pedirMotivo('Anular lançamento', 'Motivo da anulação', true, async (m) => { await anularLancamentoBalanco(b.dataset.anular, m); lancs = await db_getBalancoInternacao(internacaoId); pintar(); showMsg('Lançamento anulado.'); });
        });
    } catch (err) { showMsg(err.message || 'Não foi possível abrir o balanço.', 'error'); }
}

// ============ Dispositivos ============

async function utiDispositivos(internacaoId) {
    try {
        requirePermission('uti_ver');
        const i = (MOCK_DATA.INTERNACOES || []).find(x => x.id === internacaoId);
        if (!i || i.status !== 'ATIVA') throw new Error('Este paciente não tem internação ativa.');
        registrarAcesso('paciente', i.paciente_id, 'UTI: dispositivos');
        const registra = hasPermission('uti_registrar');
        let lista = await db_getDispositivosInternacao(internacaoId);
        const d = hModal(`Dispositivos · ${i.paciente_nome}`, `
            ${utiCabecalho(i)}
            <h3 class="at-label" style="margin:14px 0 6px">Dispositivos</h3>
            <div id="dsp_lista"></div>
            ${registra ? `<h3 class="at-label" style="margin:14px 0 6px">Registrar dispositivo</h3>
            <div class="at-form tc-form">
                <label class="at-field"><span class="at-label">Tipo *</span><select class="at-input" id="dsp_tipo"><option value="">-- Selecione --</option>${Object.entries(TIPOS_DISPOSITIVO).map(([k, r]) => `<option value="${k}">${escapeHtml(r)}</option>`).join('')}</select></label>
                <label class="at-field"><span class="at-label">Local *</span><input class="at-input" id="dsp_local" maxlength="80" autocomplete="off" placeholder="Ex.: veia jugular direita"></label>
                <label class="at-field"><span class="at-label">Inserido em (vazio = agora)</span><input class="at-input" type="datetime-local" id="dsp_em"></label>
                <label class="at-field"><span class="at-label">Inserido por (vazio = você)</span><input class="at-input" id="dsp_por" maxlength="80" autocomplete="off"></label>
                <label class="at-field at-span-2"><span class="at-label">Observação</span><input class="at-input" id="dsp_obs" maxlength="200" autocomplete="off"></label>
            </div>
            <p class="at-error" id="dsp_erro" role="alert"></p>
            <div class="at-actions" style="margin-top:8px"><button type="button" class="at-btn at-btn--primary" id="dsp_ok">Registrar dispositivo</button></div>` : ''}
            <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Fechar</button></div>`, 'xl');
        const pintar = () => {
            const agora = new Date();
            d.querySelector('#dsp_lista').innerHTML = lista.length ? `<div class="tri-tablewrap"><table class="tri-table cd-table rf-lista"><thead><tr><th>Dispositivo</th><th>Inserção</th><th>Dias de uso</th><th>Situação</th><th>Ações</th></tr></thead><tbody>${lista.map(x => `<tr>
                <td data-label="Dispositivo"><strong>${escapeHtml(x.tipo_rotulo)}</strong><br><small>${escapeHtml(x.local)}${x.observacao ? ' · ' + escapeHtml(x.observacao) : ''}</small></td>
                <td data-label="Inserção">${escapeHtml(formatDateTimeBR(x.inserido_em))}<br><small>${escapeHtml(x.inserido_por || '')}</small></td>
                <td data-label="Dias de uso">${diasDeUso(x, agora)}</td>
                <td data-label="Situação">${x.status === 'EM_USO' ? '<span class="at-badge at-badge--outros">Em uso</span>' : `<span class="at-badge at-badge--off">Retirado</span><br><small>${escapeHtml(formatDateTimeBR(x.retirado_em))} · ${escapeHtml(x.retirada_motivo || '')}</small>`}</td>
                <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${x.status === 'EM_USO' && registra ? `<button type="button" class="at-btn at-btn--ghost at-btn--sm" data-retirar="${escapeHtml(x.id)}">Registrar retirada</button>` : ''}</div></td></tr>`).join('')}</tbody></table></div>`
                : '<p class="at-hint">Nenhum dispositivo registrado para esta internação.</p>';
        };
        pintar();
        if (!registra) return;
        d.querySelector('#dsp_ok').onclick = async () => {
            d.querySelector('#dsp_erro').textContent = '';
            try {
                await registrarDispositivo(internacaoId, { tipo: d.querySelector('#dsp_tipo').value, local: d.querySelector('#dsp_local').value, inserido_em: d.querySelector('#dsp_em').value, inserido_por: d.querySelector('#dsp_por').value, observacao: d.querySelector('#dsp_obs').value });
                lista = await db_getDispositivosInternacao(internacaoId);
                ['dsp_tipo', 'dsp_local', 'dsp_em', 'dsp_por', 'dsp_obs'].forEach(k => { d.querySelector('#' + k).value = ''; });
                pintar(); showMsg('Dispositivo registrado.');
            } catch (err) { d.querySelector('#dsp_erro').textContent = err.message || 'Operação não realizada.'; }
        };
        d.querySelector('#dsp_lista').addEventListener('click', (ev) => {
            const b = ev.target.closest('[data-retirar]');
            if (!b) return;
            pedirMotivo('Registrar retirada do dispositivo', 'Motivo da retirada', true, async (m) => { await retirarDispositivo(b.dataset.retirar, { motivo: m }); lista = await db_getDispositivosInternacao(internacaoId); pintar(); showMsg('Retirada registrada.'); });
        });
    } catch (err) { showMsg(err.message || 'Não foi possível abrir os dispositivos.', 'error'); }
}
