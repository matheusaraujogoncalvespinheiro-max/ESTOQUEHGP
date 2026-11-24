// Óbitos (Etapa 9): registro do óbito pelo médico, comunicação à família, liberação do corpo e nº da Declaração de Óbito. Dado SIGILOSO.
// Regras e gravação em services/obitos.js. A lista é lida sob demanda (sem ouvinte em tempo real) e cada leitura e cada abertura de registro
// gravam o acesso. O nome do paciente só aparece para quem já pode vê-lo (prontuário ou internação).

function obitosState() {
    if (!state.obitos) state.obitos = { q: '', situacao: '', de: todayISO(new Date(Date.now() - 30 * 86400000)), ate: todayISO(), lista: null, carregando: false, erro: '' };
    return state.obitos;
}

const obBadge = { REGISTRADO: 'at-badge at-badge--emergencia', FAMILIA_COMUNICADA: 'at-badge at-badge--outros', CORPO_LIBERADO: 'at-badge at-badge--ok' };
const obCrm = () => { try { return localStorage.getItem(`hgp_crm_${state.currentUser.username}`) || ''; } catch (e) { return ''; } };
const obGuardarCrm = (v) => { try { if (v) localStorage.setItem(`hgp_crm_${state.currentUser.username}`, v); } catch (e) { /* opcional */ } };

/** Lê a lista do período (grava o acesso) e redesenha. Erros viram aviso na tela, sem repetir a leitura em laço. */
async function obCarregar() {
    const st = obitosState();
    if (st.carregando) return;
    st.carregando = true; st.erro = '';
    try { st.lista = await db_getObitos(st.de, st.ate); } catch (err) { st.erro = err.message || 'Não foi possível carregar os óbitos.'; st.lista = []; }
    st.carregando = false;
    render();
}

function obPeriodo(campo, valor) { obitosState()[campo] = valor; obitosState().lista = null; render(); }

function renderObitos() {
    if (!hasPermission('obito_ver')) return '<div class="at-stack"><p class="tri-banner tri-banner--warn">Acesso negado: seu perfil não pode ver os óbitos.</p></div>';
    db_watch('internacoes'); db_watch('leitos'); db_cadWatch('leito');
    const st = obitosState();
    if (st.lista === null && !st.carregando) setTimeout(obCarregar, 0);
    const lista = st.lista || [];
    const registra = hasPermission('obito_registrar');
    const acompanha = hasPermission('obito_acompanhar');
    const nomes = e9VeNome();
    const termo = searchKey(st.q);
    const filtrada = lista.filter(o => (!st.situacao || o.status === st.situacao) && (!termo || searchKey(`${o.protocolo} ${nomes ? o.paciente_nome : ''} ${o.prontuario} ${o.numero_do}`).includes(termo)));
    const ind = indicadoresObitos(lista);

    const linhas = filtrada.map(o => {
        let acoes = e9Botao('Detalhes', `obDetalhe('${o.id}')`);
        if (acompanha && !o.comunicacao) acoes += e9Botao('Comunicar família', `obComunicar('${o.id}')`);
        if (acompanha && !o.liberacao) acoes += e9Botao('Liberar corpo', `obLiberar('${o.id}')`);
        if (registra) acoes += e9Botao(o.numero_do ? 'Retificar DO' : 'Informar nº da DO', `obNumeroDo('${o.id}')`);
        return `<tr>
            <td data-label="Protocolo" class="e9-curto"><strong>${escapeHtml(o.protocolo)}</strong><br><small>${escapeHtml(formatDateTimeBR(o.registrado_em))}</small></td>
            <td data-label="Óbito em" class="e9-curto">${escapeHtml(formatDateTimeBR(o.data_hora_obito))}<br><small>${escapeHtml(LOCAIS_OBITO[o.local] || o.local)}</small></td>
            <td data-label="Paciente"><strong>${nomes ? escapeHtml(o.paciente_nome) : 'Paciente'}</strong><br><small>Prontuário ${escapeHtml(o.prontuario || '—')}${o.leito_id ? ' · Leito ' + escapeHtml((leitoPorId(o.leito_id) || { rotulo: o.leito_id }).rotulo) : ''}</small></td>
            <td data-label="Declaração de Óbito" class="e9-curto">${o.numero_do ? escapeHtml(o.numero_do) : '<span class="at-badge at-badge--emergencia">Pendente</span>'}</td>
            <td data-label="Situação" class="e9-curto"><span class="${obBadge[o.status] || 'at-badge'}">${escapeHtml(SITUACOES_OBITO[o.status] || o.status)}</span></td>
            <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${acoes}</div></td></tr>`;
    }).join('');

    return `
    <div class="at-stack tone-teal">
        <header class="cd-head"><div class="cd-head__ico">${lucideIcon('lock', 'w-7 h-7')}</div>
            <div class="cd-head__txt"><h2>Óbitos</h2><p>Registro do óbito, comunicação à família e liberação do corpo. Informação sigilosa: cada consulta fica gravada (quem e quando).</p></div>
            <div class="cd-head__btns">${registra ? `<button type="button" class="at-btn at-btn--primary cd-new" onclick="obNovo()">${lucideIcon('plus', 'w-5 h-5')} Registrar óbito</button>` : ''}</div></header>
        <section class="rf-kpis" aria-label="Resumo do período">
            ${e9Kpi(ind.total, 'Óbitos no período')}${e9Kpi(ind.sem_numero_do, 'Sem nº da Declaração de Óbito')}${e9Kpi(ind.sem_comunicacao, 'Família não comunicada')}${e9Kpi(ind.sem_liberacao, 'Corpo não liberado')}
        </section>
        <section class="at-card">
            ${st.erro ? `<p class="tri-banner tri-banner--warn">${escapeHtml(st.erro)}</p>` : ''}
            <div class="rf-filtros">
                ${e9Busca('obitos', st.q, nomes ? 'Protocolo, paciente, prontuário ou nº da DO' : 'Protocolo, prontuário ou nº da DO')}
                <label class="at-field"><span class="at-label">De</span><input class="at-input" type="date" value="${escapeHtml(st.de)}" max="${todayISO()}" onchange="obPeriodo('de', this.value)" data-keep="ob_de"></label>
                <label class="at-field"><span class="at-label">Até</span><input class="at-input" type="date" value="${escapeHtml(st.ate)}" max="${todayISO()}" onchange="obPeriodo('ate', this.value)" data-keep="ob_ate"></label>
                <label class="at-field"><span class="at-label">Situação</span>${e9Sel('obitos', 'situacao', st.situacao, [['', 'Todas'], ...Object.entries(SITUACOES_OBITO)])}</label>
            </div>
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-tabela e9-tab"><thead><tr><th>Protocolo</th><th>Óbito em</th><th>Paciente</th><th>Declaração de Óbito</th><th>Situação</th><th>Ações</th></tr></thead>
                <tbody>${st.lista === null ? '<tr><td colspan="6" class="at-empty">Carregando...</td></tr>' : (linhas || '<tr><td colspan="6" class="at-empty">Nenhum óbito neste período.</td></tr>')}</tbody></table></div>
            <p class="at-hint" style="margin-top:12px">${lucideIcon('info', 'w-4 h-4')} A Declaração de Óbito é emitida fora do sistema: aqui se guarda só o número. O sistema não define quando o caso vai ao IML ou SVO nem exige a DO para liberar o corpo.${ind.horas_ate_liberar !== null ? ` Média do óbito até a liberação no período: ${String(ind.horas_ate_liberar).replace('.', ',')} h.` : ''}</p>
        </section>
    </div>`;
}

// ============ Registrar óbito ============

function obNovo() {
    try {
        requirePermission('obito_registrar');
        const internados = (MOCK_DATA.INTERNACOES || []).filter(i => i.status === 'ATIVA').map(i => ({ i, l: leitoPorId(i.leito_id) || { rotulo: i.leito_id, ala: '' } }))
            .sort((a, b) => String(a.l.rotulo).localeCompare(String(b.l.rotulo), 'pt-BR', { numeric: true }));
        let paciente = null;
        const d = hModal('Registrar óbito', `
            <p class="tri-banner tri-banner--warn">O registro do óbito na internação encerra a internação e coloca o leito em higienização. Não pode ser desfeito: confira os dados.</p>
            <div class="at-form tc-form">
                <label class="at-field"><span class="at-label">Local do óbito *</span><select class="at-input" id="ob_local">${e9Opcoes(LOCAIS_OBITO, 'INTERNACAO')}</select></label>
                <label class="at-field" id="ob_w_int"><span class="at-label">Paciente internado *</span><select class="at-input" id="ob_internacao_id"><option value="">-- Selecione --</option>${internados.map(x => `<option value="${escapeHtml(x.i.id)}">Leito ${escapeHtml(x.l.rotulo)} · ${escapeHtml(x.i.paciente_nome)}</option>`).join('')}</select></label>
                <div class="at-span-2" id="ob_w_pac" hidden>${pacienteBuscaHtml('ob_pac')}</div>
                <label class="at-field"><span class="at-label">Data e hora do óbito *</span><input class="at-input" type="datetime-local" id="ob_data_hora_obito" value="${e9AgoraLocal()}"></label>
                <label class="at-field"><span class="at-label">Seu registro no conselho (CRM) *</span><input class="at-input" id="ob_registro_conselho" maxlength="30" autocomplete="off" value="${escapeHtml(obCrm())}" placeholder="Ex.: CRM-TO 12345"></label>
                <label class="at-field"><span class="at-label">CID-10 da causa</span><input class="at-input" id="ob_cid_causa" maxlength="8" autocomplete="off" placeholder="Ex.: I46.9"></label>
                <label class="at-field"><span class="at-label">Nº da Declaração de Óbito</span><input class="at-input" id="ob_numero_do" maxlength="20" autocomplete="off" placeholder="Pode ser informado depois"></label>
                <label class="at-field at-span-2"><span class="at-label">Observação</span><input class="at-input" id="ob_observacao" maxlength="200" autocomplete="off"></label>
            </div>
            ${internados.length ? '' : '<p class="at-hint">Nenhum paciente com internação ativa. Para óbito fora da internação, escolha outro local e busque o paciente.</p>'}
            <p class="at-error" id="ob_erro" role="alert"></p>
            <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="ob_ok">Registrar óbito</button></div>`, 'lg');
        const ajusta = () => {
            const emInt = d.querySelector('#ob_local').value === 'INTERNACAO';
            d.querySelector('#ob_w_int').hidden = !emInt;
            d.querySelector('#ob_w_pac').hidden = emInt;
        };
        d.querySelector('#ob_local').onchange = ajusta; ajusta();
        pacienteBuscaLigar(d, 'ob_pac', (p) => { paciente = p; });
        d.querySelector('#ob_ok').onclick = async () => {
            d.querySelector('#ob_erro').textContent = '';
            try {
                const f = e9Ler(d, 'ob', ['local', 'internacao_id', 'data_hora_obito', 'registro_conselho', 'cid_causa', 'numero_do', 'observacao']);
                if (f.local !== 'INTERNACAO') f.paciente_id = paciente ? paciente.id : '';
                if (f.data_hora_obito) f.data_hora_obito = new Date(f.data_hora_obito).toISOString();
                if (!confirm(f.local === 'INTERNACAO' ? 'Confirmar o registro do óbito? A internação será encerrada e o leito irá para higienização.' : 'Confirmar o registro do óbito?')) return;
                const o = await registrarObito(f);
                obGuardarCrm(f.registro_conselho);
                d.close(); showMsg(`Óbito ${o.protocolo} registrado.`); obitosState().lista = null; render();
            } catch (err) { e9Erro(d, 'ob_erro', err); }
        };
    } catch (err) { showMsg(err.message || 'Não foi possível abrir o registro.', 'error'); }
}

// ============ Passos do rito e nº da DO ============

const obAchar = (id) => (obitosState().lista || []).find(o => o.id === id);
const obRecarregar = () => { obitosState().lista = null; render(); };

function obPasso(titulo, corpo, prefixo, campos, rotuloBotao, executar, aviso = '') {
    const d = hModal(titulo, `<div class="at-form tc-form">${corpo}</div>${aviso}<p class="at-error" id="${prefixo}_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="${prefixo}_ok">${rotuloBotao}</button></div>`, 'lg');
    d.querySelector(`#${prefixo}_ok`).onclick = async () => {
        d.querySelector(`#${prefixo}_erro`).textContent = '';
        try {
            const f = e9Ler(d, prefixo, campos);
            if (f.em) f.em = new Date(f.em).toISOString();
            await executar(f); d.close(); obRecarregar();
        } catch (err) { e9Erro(d, `${prefixo}_erro`, err); }
    };
}

function obComunicar(id) {
    const o = obAchar(id); if (!o) return;
    obPasso(`Comunicação à família · ${o.protocolo}`, `
        <label class="at-field at-span-2"><span class="at-label">Comunicado a (nome) *</span><input class="at-input" id="oc_comunicado_a" maxlength="100" autocomplete="off"></label>
        <label class="at-field"><span class="at-label">Parentesco ou vínculo</span><input class="at-input" id="oc_parentesco" maxlength="40" autocomplete="off"></label>
        <label class="at-field"><span class="at-label">Data e hora *</span><input class="at-input" type="datetime-local" id="oc_em" value="${e9AgoraLocal()}"></label>
        <label class="at-field at-span-2"><span class="at-label">Observação</span><input class="at-input" id="oc_observacao" maxlength="200" autocomplete="off"></label>`,
        'oc', ['comunicado_a', 'parentesco', 'em', 'observacao'], 'Registrar comunicação', async (f) => { await registrarComunicacaoObito(id, f); showMsg('Comunicação registrada.'); });
}

function obLiberar(id) {
    const o = obAchar(id); if (!o) return;
    obPasso(`Liberação do corpo · ${o.protocolo}`, `
        <label class="at-field"><span class="at-label">Destino do corpo *</span><select class="at-input" id="ol_destino"><option value="">-- Selecione --</option>${e9Opcoes(DESTINOS_CORPO)}</select></label>
        <label class="at-field"><span class="at-label">Data e hora *</span><input class="at-input" type="datetime-local" id="ol_em" value="${e9AgoraLocal()}"></label>
        <label class="at-field at-span-2"><span class="at-label">Quem recebeu o corpo (nome) *</span><input class="at-input" id="ol_recebedor" maxlength="100" autocomplete="off"></label>
        <label class="at-field at-span-2"><span class="at-label">Observação</span><input class="at-input" id="ol_observacao" maxlength="200" autocomplete="off"></label>`,
        'ol', ['destino', 'em', 'recebedor', 'observacao'], 'Registrar liberação', async (f) => { await liberarCorpoObito(id, f); showMsg('Liberação registrada.'); },
        o.numero_do ? '' : '<p class="tri-banner tri-banner--warn" style="margin-top:12px">O nº da Declaração de Óbito ainda não foi informado neste registro.</p>');
}

function obNumeroDo(id) {
    const o = obAchar(id); if (!o) return;
    obPasso(`${o.numero_do ? 'Retificar' : 'Informar'} nº da Declaração de Óbito · ${o.protocolo}`, `
        <label class="at-field"><span class="at-label">Nº da Declaração de Óbito *</span><input class="at-input" id="od_numero" maxlength="20" autocomplete="off" value="${escapeHtml(o.numero_do || '')}"></label>
        ${o.numero_do ? '<label class="at-field at-span-2"><span class="at-label">Motivo da retificação *</span><input class="at-input" id="od_motivo" maxlength="200" autocomplete="off"></label>' : ''}`,
        'od', ['numero', 'motivo'], 'Salvar', async (f) => { await registrarNumeroDoObito(id, f.numero, f.motivo); showMsg('Nº da Declaração de Óbito salvo.'); });
}

function obDetalhe(id) {
    const o = obAchar(id); if (!o) return;
    registrarAcesso('obito', o.id, 'Óbitos: ver registro');
    const nomes = e9VeNome();
    const dt = (x) => (x ? formatDateTimeBR(x) : '');
    hModal(`${o.protocolo} · Óbito`, `
        ${e9Dl([['Situação', SITUACOES_OBITO[o.status]], ['Paciente', nomes ? o.paciente_nome : 'Paciente'], ['Prontuário', o.prontuario], ['Data e hora do óbito', dt(o.data_hora_obito)], ['Local', LOCAIS_OBITO[o.local]],
            o.leito_id ? ['Leito', (leitoPorId(o.leito_id) || { rotulo: o.leito_id }).rotulo] : null, ['CID-10 da causa', o.cid_causa], ['Nº da Declaração de Óbito', o.numero_do || 'Pendente'],
            ['Constatado por', `${o.registrado_por_nome || o.registrado_por} (${o.registro_conselho})`], ['Registrado em', dt(o.registrado_em)], ['Observação', o.observacao]])}
        <h3 class="at-label" style="margin:14px 0 6px">Comunicação à família</h3>
        ${o.comunicacao ? e9Dl([['Comunicado a', o.comunicacao.comunicado_a], ['Vínculo', o.comunicacao.parentesco], ['Quando', dt(o.comunicacao.em)], ['Registrado por', o.comunicacao.por_nome], ['Observação', o.comunicacao.observacao]]) : '<p class="at-hint">Ainda não registrada.</p>'}
        <h3 class="at-label" style="margin:14px 0 6px">Liberação do corpo</h3>
        ${o.liberacao ? e9Dl([['Destino', DESTINOS_CORPO[o.liberacao.destino]], ['Recebido por', o.liberacao.recebedor], ['Quando', dt(o.liberacao.em)], ['Registrado por', o.liberacao.por_nome], ['Observação', o.liberacao.observacao]]) : '<p class="at-hint">Ainda não registrada.</p>'}
        ${(o.retificacoes || []).length ? `<h3 class="at-label" style="margin:14px 0 6px">Retificações</h3><ul class="e8-resumo">${o.retificacoes.map(r => `<li>Nº da DO de ${escapeHtml(r.de)} para ${escapeHtml(r.para)} · ${escapeHtml(dt(r.em))} · ${escapeHtml(r.por_nome)}<br><small>${escapeHtml(r.motivo)}</small></li>`).join('')}</ul>` : ''}
        <h3 class="at-label" style="margin:14px 0 6px">Histórico</h3>${e9Historico(o.historico, SITUACOES_OBITO)}
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Fechar</button></div>`, 'lg');
}
