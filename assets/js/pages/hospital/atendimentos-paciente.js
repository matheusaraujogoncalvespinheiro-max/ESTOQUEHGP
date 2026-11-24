// Histórico de atendimentos do paciente (Etapa 4): aba "Atendimentos" do prontuário (com triagem, consulta e documentos de cada
// atendimento) e aba "Atendimentos" do Cadastro › Paciente (só dados operacionais: senha, tipo, fila, situação).
// Os dados clínicos só aparecem para quem tem acesso ao prontuário.

/** Lê os atendimentos do paciente e, de cada um, a triagem e a consulta concluída. Guarda no estado do prontuário. */
async function prontuarioCarregarAtendimentos(pacienteId) {
    const st = prontuarioState();
    st.atend = { pacienteId, carregando: true, itens: [], erro: '' };
    try {
        requirePermission('prontuario_ver');
        const ats = (await db_getAtendimentosPaciente(pacienteId)).slice(0, 30);
        const itens = await Promise.all(ats.map(async (at) => ({
            at,
            triagem: await db_getTriagem(at.id).catch(() => null),
            consulta: await db_getConsulta(at.id).catch(() => null)
        })));
        st.atend = { pacienteId, carregando: false, itens, erro: '' };
    } catch (err) {
        st.atend = { pacienteId, carregando: false, itens: [], erro: err.message || 'Não foi possível carregar os atendimentos.' };
    }
    if (state.prontuario === st && st.tab === 'atendimentos') render();
}

/** Uma linha "Rótulo: valor" só quando há valor. */
const linhaAtend = (r, v) => (v ? `<div><dt>${escapeHtml(r)}</dt><dd>${escapeHtml(v)}</dd></div>` : '');

function htmlAtendimentoDoPaciente({ at, triagem, consulta }, documentos, solicitacoes) {
    const ultimoSinal = triagem && (triagem.sinais || []).slice(-1)[0];
    const classif = triagem && (triagem.classificacoes || []).slice(-1)[0];
    const concluida = consulta && consulta.status === 'CONCLUIDA' ? consulta : null;
    const anteriores = consulta ? (consulta.historico_consultas || []) : [];
    const exames = solicitacoes.filter(s => s.atendimento_id === at.id);
    const docs = documentos.filter(d => d.atendimento_id === at.id);
    const desfecho = at.desfecho ? `${DESFECHOS_CONSULTA[at.desfecho.tipo] || at.desfecho.tipo}${at.desfecho.fila ? ' → ' + rotuloFila(at.desfecho.fila) : ''}${at.desfecho.texto ? ' — ' + at.desfecho.texto : ''}` : '';
    const triagemHtml = triagem ? `<h4 class="at-label">Triagem</h4><dl class="about-list">
            ${linhaAtend('Queixa principal', triagem.queixa_principal)}${linhaAtend('Sintomas', triagem.sintomas)}${linhaAtend('Alergias informadas', triagem.alergias)}${linhaAtend('Medicamentos em uso', triagem.medicamentos_uso)}
            ${linhaAtend('Sinais vitais', ultimoSinal ? (resumoSinais(ultimoSinal.valores) || `Não aferidos: ${ultimoSinal.motivo_nao_aferido}`) + ` (${formatDateTimeBR(ultimoSinal.em)})` : '')}
            ${linhaAtend('Classificação', classif ? `${nivelRisco(classif.risco) ? nivelRisco(classif.risco).rotulo : classif.risco} · ${classif.por_nome}: ${classif.justificativa}` : '')}</dl>` : '';
    const consultaHtml = concluida ? `<h4 class="at-label">Consulta médica</h4><dl class="about-list">
            ${linhaAtend('Médico', `${concluida.medico_nome}${concluida.registro_conselho ? ' · ' + concluida.registro_conselho : ''} em ${formatDateTimeBR(concluida.concluida_em)}`)}
            ${linhaAtend('Hipóteses', (concluida.hipoteses || []).map(h => `${h.cid} ${h.descricao}`).join(' | '))}${linhaAtend('Conduta', concluida.conduta)}
            ${linhaAtend('Prescrição', (concluida.prescricao || []).map(textoDoItemPrescricao).join(' | '))}</dl>
            ${anteriores.length ? `<p class="at-hint">Este atendimento teve ${anteriores.length} consulta(s) anterior(es) (o paciente voltou dos exames); o conteúdo de cada uma está nos registros do prontuário.</p>` : ''}`
        : (consulta && consulta.status === 'RASCUNHO' ? '<p class="at-hint">Consulta em andamento (rascunho ainda não assinado).</p>' : '');
    const examesHtml = exames.length ? `<h4 class="at-label">Exames solicitados</h4><ul class="at-list">${exames.map(s => `<li class="at-item"><div class="at-item__top"><span class="at-item__name">${escapeHtml(s.tipo_nome)}</span><span>${escapeHtml(rotuloStatusExame(s.status))}${selosDoResultado(s)}</span></div></li>`).join('')}</ul>` : '';
    const docsHtml = docs.length ? `<h4 class="at-label">Documentos emitidos</h4><ul class="at-list">${docs.map(d => `<li class="at-item"><div class="at-item__top"><span class="at-item__name">${escapeHtml(d.tipo_rotulo)}</span><span>${escapeHtml(d.numero)}</span></div></li>`).join('')}</ul>` : '';
    const trajeto = (at.historico_status || []).length ? `<details class="pr-det"><summary>Trajetória do atendimento (${at.historico_status.length})</summary><ol class="at-list">${at.historico_status.map(h => `<li class="at-item"><div class="at-item__top"><span class="at-item__name">${escapeHtml(STATUS_ATENDIMENTO[h.status] || h.status)} · ${escapeHtml(rotuloFila(h.fila))}</span><span class="at-badge">${escapeHtml(formatDateTimeBR(h.em))}</span></div>
            <div class="at-item__meta"><span>${escapeHtml(h.por_nome || h.por || '—')}</span>${h.motivo ? `<span>${escapeHtml(h.motivo)}</span>` : ''}</div></li>`).join('')}</ol></details>` : '';
    return `<article class="pr-reg">
        <header><strong>${escapeHtml(formatDateTimeBR(at.chegada_em))} · ${escapeHtml(at.senha)}</strong> ${chipRisco(at.risco)} <span class="at-badge">${escapeHtml(STATUS_ATENDIMENTO[at.status] || at.status)}</span> <small>${escapeHtml(at.tipo_nome || '')} · ${escapeHtml(rotuloFila(at.fila))}</small></header>
        <dl class="about-list">${linhaAtend('Queixa na chegada', at.queixa)}${linhaAtend('Desfecho', desfecho)}${linhaAtend('Leito', at.leito_rotulo ? `Internado no leito ${at.leito_rotulo}` : '')}${linhaAtend('Fila de leito', at.desfecho_leito ? `${MOTIVOS_ENCERRAR_ESPERA[at.desfecho_leito.tipo] || (at.desfecho_leito.tipo === 'DEVOLVER_MEDICO' ? 'Devolvido ao médico' : at.desfecho_leito.tipo)}${at.desfecho_leito.texto ? ' — ' + at.desfecho_leito.texto : ''}` : '')}${linhaAtend('Desfecho dos exames', at.desfecho_exames ? `${DESFECHOS_EXAMES[at.desfecho_exames.tipo] || at.desfecho_exames.tipo}${at.desfecho_exames.texto ? ' — ' + at.desfecho_exames.texto : ''}` : '')}</dl>
        ${triagemHtml}${consultaHtml}${examesHtml}${docsHtml}${trajeto}</article>`;
}

function renderProntuarioAtendimentos(st, p) {
    if (!st.atend || st.atend.pacienteId !== p.id) { prontuarioCarregarAtendimentos(p.id); return '<div class="at-empty">Carregando atendimentos...</div>'; }
    const a = st.atend;
    if (a.carregando) return '<div class="at-empty">Carregando atendimentos...</div>';
    if (a.erro) return `<div class="tri-banner tri-banner--warn">${escapeHtml(a.erro)}</div>`;
    const documentos = (MOCK_DATA.DOCUMENTOS_CLINICOS || {}).items || [];
    const solicitacoes = MOCK_DATA.SOLICITACOES_EXAME.filter(s => s.paciente_id === p.id);
    return `<div class="at-actions pr-acoes"><button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="prontuarioAtualizarAtendimentos()">${lucideIcon('refresh-cw', 'w-4 h-4')} Atualizar</button>
            <span class="at-hint">Cada atendimento reúne a triagem, a consulta, os exames e os documentos daquela chegada. Mostra os ${a.itens.length >= 30 ? '30 mais recentes' : a.itens.length + ' atendimento(s)'}.</span></div>
        ${a.itens.length ? a.itens.map(i => htmlAtendimentoDoPaciente(i, documentos, solicitacoes)).join('') : '<div class="at-empty">Nenhum atendimento com senha registrado para este paciente.</div>'}`;
}

function prontuarioAtualizarAtendimentos() { prontuarioState().atend = null; render(); }

// ---------------- Cadastro › Paciente: aba "Atendimentos" (só dados operacionais) ----------------

async function cadPacienteCarregarAtendimentos(pacienteId) {
    state.cadPacAtend = { id: pacienteId, carregando: true, itens: [], antigos: [], erro: '' };
    try {
        const [ats, antigos] = await Promise.all([db_getAtendimentosPaciente(pacienteId), db_getRegistrosAntigosPaciente(pacienteId)]);
        state.cadPacAtend = { id: pacienteId, carregando: false, itens: ats, antigos, erro: '' };
    } catch (err) {
        state.cadPacAtend = { id: pacienteId, carregando: false, itens: [], antigos: [], erro: err.message || 'Não foi possível carregar os atendimentos.' };
    }
    if (state.activeModule === 'CAD') render();
}

/** Conteúdo da aba: tabela com a mesma fonte da Recepção. Não mostra triagem nem consulta (isso fica no prontuário). */
function cadPacienteAtendimentosHtml(st) {
    if (!st.id) return '<div class="at-hint">Salve o cadastro para ver os atendimentos do paciente.</div>';
    const c = state.cadPacAtend;
    if (!c || c.id !== st.id) { cadPacienteCarregarAtendimentos(st.id); return '<div class="at-empty">Carregando atendimentos...</div>'; }
    if (c.carregando) return '<div class="at-empty">Carregando atendimentos...</div>';
    if (c.erro) return `<div class="tri-banner tri-banner--warn">${escapeHtml(c.erro)}</div>`;
    const hist = montarHistoricoPaciente(c.itens, c.antigos);
    const linhas = hist.map(h => h.tipo === 'ATENDIMENTO'
        ? `<tr><td data-label="Data e hora">${escapeHtml(formatDateTimeBR(h.em))}</td><td data-label="Tipo">${escapeHtml(h.ref.tipo_nome)}</td><td data-label="Senha"><strong>${escapeHtml(h.ref.senha)}</strong></td><td data-label="Queixa">${escapeHtml(h.ref.queixa || '—')}</td><td data-label="Fila">${escapeHtml(rotuloFila(h.ref.fila))}</td><td data-label="Situação">${escapeHtml(STATUS_ATENDIMENTO[h.ref.status] || h.ref.status)}</td></tr>`
        : `<tr><td data-label="Data e hora">${escapeHtml(formatDateTimeBR(h.em))}</td><td data-label="Tipo">Registro de recepção</td><td data-label="Senha">—</td><td data-label="Queixa">${escapeHtml(h.ref.observacoes || '—')}</td><td data-label="Fila">—</td><td data-label="Situação">Registrado</td></tr>`).join('');
    return `<p class="at-hint" style="margin-bottom:10px">${c.itens.length} atendimento(s) com senha e ${c.antigos.length} registro(s) anteriores da recepção. A triagem e a consulta ficam no prontuário.</p>
        <div class="tri-tablewrap"><table class="tri-table cd-table rf-lista"><thead><tr><th>Data e hora</th><th>Tipo</th><th>Senha</th><th>Queixa / observação</th><th>Fila</th><th>Situação</th></tr></thead>
        <tbody>${linhas || '<tr><td colspan="6" class="at-empty">Nenhum atendimento registrado.</td></tr>'}</tbody></table></div>`;
}
