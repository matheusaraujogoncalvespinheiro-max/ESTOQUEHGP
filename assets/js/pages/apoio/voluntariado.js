// Voluntariado (Etapa 9): cadastro de voluntários (coordenação) e presença (entrada e saída, coordenação ou Portaria), com as horas do período.
// Regras e gravação em services/voluntariado.js. Não guarda documento de identificação nem escala turnos.

function voluntariadoState() {
    if (!state.voluntariado) state.voluntariado = { aba: 'voluntarios', q: '', situacao: 'ATIVO', periodo: '30' };
    return state.voluntariado;
}

const vlBadge = { ATIVO: 'at-badge at-badge--ok', INATIVO: 'at-badge at-badge--off' };
const vlDuracao = (p) => formatarMinutos(minutosDePresenca(p));

function renderVoluntariado() {
    db_watch('voluntarios'); db_watch('presencas'); db_watch('presencas_abertas');
    const st = voluntariadoState();
    const gerencia = hasPermission('voluntariado_gerenciar');
    const presenca = hasPermission('voluntariado_presenca');
    const hoje = todayISO();
    const vols = MOCK_DATA.VOLUNTARIOS || [];
    const presencas = presencasConhecidas();
    const abertas = new Map(presencas.filter(p => p.status === 'ABERTA').map(p => [p.voluntario_id, p]));
    const termo = searchKey(st.q);
    const per = e9Periodo(st.periodo);
    const horas = horasDosVoluntarios(presencas, per.de, per.ate);
    const totalMin = horas.reduce((s, h) => s + h.minutos, 0);

    const corpoVoluntarios = () => {
        const lista = vols.filter(v => (!st.situacao || v.situacao === st.situacao) && (!termo || searchKey(`${v.nome} ${v.contato} ${AREAS_VOLUNTARIADO[v.area]}`).includes(termo)))
            .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
        const linhas = lista.map(v => {
            const ab = abertas.get(v.id);
            let acoes = '';
            if (presenca && v.situacao === 'ATIVO') acoes += ab ? e9Botao('Registrar saída', `vlSaida('${ab.id}')`, true) : e9Botao('Registrar entrada', `vlEntrada('${v.id}')`, true);
            if (gerencia) acoes += e9Botao('Editar', `vlEditar('${v.id}')`) + (v.situacao === 'ATIVO' ? e9Botao('Inativar', `vlInativar('${v.id}')`) : e9Botao('Reativar', `vlReativar('${v.id}')`));
            return `<tr>
                <td data-label="Voluntário"><strong>${escapeHtml(v.nome)}</strong><br><small>${escapeHtml(v.contato || 'Sem contato')}</small></td>
                <td data-label="Área" class="e9-curto">${escapeHtml(AREAS_VOLUNTARIADO[v.area] || v.area)}</td>
                <td data-label="Termo de adesão" class="e9-curto">${escapeHtml(formatDateBR(v.termo_em))}</td>
                <td data-label="Situação" class="e9-curto"><span class="${vlBadge[v.situacao]}">${v.situacao === 'ATIVO' ? 'Ativo' : 'Inativo'}</span>${ab ? `<br><small>Presente desde ${escapeHtml(horaCurta(ab.entrada_em))}</small>` : ''}</td>
                <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${acoes}</div></td></tr>`;
        }).join('');
        return `<div class="rf-filtros">
                ${e9Busca('voluntariado', st.q, 'Nome, contato ou área')}
                <label class="at-field"><span class="at-label">Situação</span>${e9Sel('voluntariado', 'situacao', st.situacao, [['ATIVO', 'Ativos'], ['INATIVO', 'Inativos'], ['', 'Todos']])}</label>
            </div>
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-tabela e9-tab"><thead><tr><th>Voluntário</th><th>Área</th><th>Termo de adesão</th><th>Situação</th><th>Ações</th></tr></thead>
                <tbody>${linhas || '<tr><td colspan="5" class="at-empty">Nenhum voluntário com estes filtros.</td></tr>'}</tbody></table></div>`;
    };

    const corpoPresencas = () => {
        const lista = presencas.filter(p => (p.status === 'ABERTA' || (p.dia >= per.de && p.dia <= per.ate)) && (!termo || searchKey(`${p.voluntario_nome} ${AREAS_VOLUNTARIADO[p.area]}`).includes(termo)))
            .sort((a, b) => (b.status === 'ABERTA') - (a.status === 'ABERTA') || String(b.entrada_em).localeCompare(String(a.entrada_em)));
        const linhas = lista.map(p => `<tr>
            <td data-label="Voluntário"><strong>${escapeHtml(p.voluntario_nome)}</strong><br><small>${escapeHtml(AREAS_VOLUNTARIADO[p.area] || p.area)}</small></td>
            <td data-label="Entrada" class="e9-curto">${escapeHtml(formatDateTimeBR(p.entrada_em))}<br><small>${escapeHtml(p.entrada_por_nome || '')}</small></td>
            <td data-label="Saída" class="e9-curto">${p.saida_em ? `${escapeHtml(formatDateTimeBR(p.saida_em))}<br><small>${escapeHtml(p.saida_por_nome || '')}</small>` : '<span class="at-badge at-badge--outros">Presente</span>'}</td>
            <td data-label="Duração" class="e9-curto">${escapeHtml(vlDuracao(p))}${p.status === 'ABERTA' ? '<br><small>até agora</small>' : ''}</td>
            <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${p.status === 'ABERTA' && presenca ? e9Botao('Registrar saída', `vlSaida('${p.id}')`, true) : ''}</div></td></tr>`).join('');
        return `<div class="rf-filtros">
                ${e9Busca('voluntariado', st.q, 'Nome ou área')}
                <label class="at-field"><span class="at-label">Período</span>${e9Sel('voluntariado', 'periodo', st.periodo, [['0', 'Hoje'], ['7', 'Últimos 7 dias'], ['30', 'Últimos 30 dias'], ['60', 'Últimos 60 dias']])}</label>
            </div>
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-tabela e9-tab"><thead><tr><th>Voluntário</th><th>Entrada</th><th>Saída</th><th>Duração</th><th>Ações</th></tr></thead>
                <tbody>${linhas || '<tr><td colspan="5" class="at-empty">Nenhuma presença no período.</td></tr>'}</tbody></table></div>`;
    };

    const corpoHoras = () => {
        const lista = horas.filter(h => !termo || searchKey(`${h.nome} ${AREAS_VOLUNTARIADO[h.area]}`).includes(termo));
        const linhas = lista.map(h => `<tr><td data-label="Voluntário"><strong>${escapeHtml(h.nome)}</strong></td><td data-label="Área" class="e9-curto">${escapeHtml(AREAS_VOLUNTARIADO[h.area] || h.area)}</td>
            <td data-label="Presenças" class="e9-curto">${h.presencas}</td><td data-label="Horas" class="e9-curto"><strong>${escapeHtml(formatarMinutos(h.minutos))}</strong></td></tr>`).join('');
        return `<div class="rf-filtros">
                ${e9Busca('voluntariado', st.q, 'Nome ou área')}
                <label class="at-field"><span class="at-label">Período</span>${e9Sel('voluntariado', 'periodo', st.periodo, [['7', 'Últimos 7 dias'], ['30', 'Últimos 30 dias'], ['60', 'Últimos 60 dias']])}</label>
            </div>
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-lista e9-tab"><thead><tr><th>Voluntário</th><th>Área</th><th>Presenças</th><th>Horas</th></tr></thead>
                <tbody>${linhas || '<tr><td colspan="4" class="at-empty">Nenhuma presença encerrada no período.</td></tr>'}</tbody></table></div>
            <p class="at-hint" style="margin-top:12px">${lucideIcon('info', 'w-4 h-4')} Só as presenças com saída registrada entram nas horas. O sistema não emite certificado.</p>`;
    };

    return `
    <div class="at-stack tone-teal">
        <header class="cd-head"><div class="cd-head__ico">${lucideIcon('heart-handshake', 'w-7 h-7')}</div>
            <div class="cd-head__txt"><h2>Voluntariado</h2><p>Cadastro de voluntários e registro de entrada e saída. A Portaria também registra a presença.</p></div>
            <div class="cd-head__btns">${gerencia ? `<button type="button" class="at-btn at-btn--primary cd-new" onclick="vlNovo()">${lucideIcon('plus', 'w-5 h-5')} Novo voluntário</button>` : ''}</div></header>
        <section class="rf-kpis" aria-label="Resumo">
            ${e9Kpi(vols.filter(v => v.situacao === 'ATIVO').length, 'Voluntários ativos')}${e9Kpi(abertas.size, 'Presentes agora')}
            ${e9Kpi(presencas.filter(p => p.dia === hoje).length, 'Presenças hoje')}${e9Kpi(formatarMinutos(totalMin), `Horas (${st.periodo === '0' ? 'hoje' : st.periodo + ' dias'})`)}
        </section>
        <section class="at-card">
            ${e9Abas('voluntariado', st.aba, [['voluntarios', 'Voluntários'], ['presencas', 'Presenças'], ['horas', 'Horas']])}
            ${st.aba === 'presencas' ? corpoPresencas() : (st.aba === 'horas' ? corpoHoras() : corpoVoluntarios())}
        </section>
    </div>`;
}

// ============ Cadastro ============

function vlJanela(v) {
    const d = hModal(v ? `Editar voluntário · ${v.nome}` : 'Novo voluntário', `
        <div class="at-form tc-form">
            <label class="at-field at-span-2"><span class="at-label">Nome *</span><input class="at-input" id="vl_nome" maxlength="100" autocomplete="off" value="${v ? escapeHtml(v.nome) : ''}"></label>
            <label class="at-field"><span class="at-label">Contato</span><input class="at-input" id="vl_contato" maxlength="40" autocomplete="off" value="${v ? escapeHtml(v.contato || '') : ''}" placeholder="Telefone ou e-mail"></label>
            <label class="at-field"><span class="at-label">Área de atuação *</span><select class="at-input" id="vl_area"><option value="">-- Selecione --</option>${e9Opcoes(AREAS_VOLUNTARIADO, v ? v.area : '')}</select></label>
            <label class="at-field"><span class="at-label">Termo de adesão assinado em *</span><input class="at-input" type="date" id="vl_termo_em" max="${todayISO()}" value="${v ? escapeHtml(v.termo_em) : ''}"></label>
            <label class="at-field at-span-2"><span class="at-label">Observação</span><input class="at-input" id="vl_observacao" maxlength="200" autocomplete="off" value="${v ? escapeHtml(v.observacao || '') : ''}"></label>
        </div>
        <p class="at-hint">Não registre documento de identificação nem dados de saúde. O termo assinado fica guardado pela coordenação; aqui vai só a data.</p>
        <p class="at-error" id="vl_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="vl_ok">${v ? 'Salvar' : 'Cadastrar'}</button></div>`, 'lg');
    d.querySelector('#vl_ok').onclick = async () => {
        d.querySelector('#vl_erro').textContent = '';
        try {
            const f = e9Ler(d, 'vl', ['nome', 'contato', 'area', 'termo_em', 'observacao']);
            if (v) await editarVoluntario(v.id, f); else await cadastrarVoluntario(f);
            d.close(); showMsg(v ? 'Voluntário atualizado.' : 'Voluntário cadastrado.'); render();
        } catch (err) { e9Erro(d, 'vl_erro', err); }
    };
}

function vlNovo() { try { requirePermission('voluntariado_gerenciar'); vlJanela(null); } catch (err) { showMsg(err.message, 'error'); } }
function vlEditar(id) { const v = (MOCK_DATA.VOLUNTARIOS || []).find(x => x.id === id); if (v) vlJanela(v); }
function vlInativar(id) { pedirMotivo('Inativar voluntário', 'Motivo', true, async (m) => { await inativarVoluntario(id, m); showMsg('Voluntário inativado.'); render(); }); }
const vlReativar = executarAcao(async (id) => { await reativarVoluntario(id); render(); }, 'Voluntário reativado.');
const vlEntrada = executarAcao(async (id) => { await registrarEntradaVoluntario(id); render(); }, 'Entrada registrada.');

function vlSaida(presencaId) {
    const p = presencasConhecidas().find(x => x.id === presencaId);
    const d = hModal(`Registrar saída${p ? ' · ' + p.voluntario_nome : ''}`, `
        <div class="at-form tc-form">
            <label class="at-field"><span class="at-label">Horário da saída (vazio = agora)</span><input class="at-input" type="datetime-local" id="vs_saida_em"></label>
            <label class="at-field at-span-2"><span class="at-label">Observação</span><input class="at-input" id="vs_observacao" maxlength="200" autocomplete="off"></label>
        </div>
        <p class="at-error" id="vs_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="vs_ok">Registrar saída</button></div>`, 'md');
    d.querySelector('#vs_ok').onclick = async () => {
        d.querySelector('#vs_erro').textContent = '';
        try { await registrarSaidaVoluntario(presencaId, e9Ler(d, 'vs', ['saida_em', 'observacao'])); d.close(); showMsg('Saída registrada.'); render(); } catch (err) { e9Erro(d, 'vs_erro', err); }
    };
}
