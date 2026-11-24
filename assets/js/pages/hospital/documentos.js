// Documentos clínicos impressos (Etapa 4): formulário de emissão, folha para imprimir/PDF e lista no prontuário.
// Regras e gravação em services/documentos-clinicos.js. O texto é do profissional; o sistema só valida, numera, guarda e imprime.

const crmDoUsuario = () => { try { return localStorage.getItem(`hgp_crm_${state.currentUser.username}`) || ''; } catch (e) { return ''; } };
const lembrarCrmDoUsuario = (v) => { try { if (String(v || '').trim()) localStorage.setItem(`hgp_crm_${state.currentUser.username}`, String(v).trim()); } catch (e) { /* opcional */ } };
const horaLocalHHMM = (d = new Date()) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Folha do documento para impressão/PDF: cabeçalho do hospital, paciente, conteúdo, profissional e linha de assinatura. */
function htmlDocumentoClinico(doc) {
    const e = escapeHtml;
    const c = doc.corpo || { titulo: doc.tipo_rotulo, itens: [], paragrafos: [] };
    const p = doc.paciente_dados || {};
    const estab = doc.estabelecimento || {};
    const profissional = `${e(doc.emitido_por_nome)}${doc.registro_conselho ? ' · ' + e(doc.registro_conselho) : ''}`;
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${e(c.titulo)} ${e(doc.numero)}</title><style>
        @page{size:A4 portrait;margin:16mm} *{box-sizing:border-box} body{font-family:Arial,sans-serif;font-size:13px;color:#111;margin:0} @media screen{body{padding:20px 24px}}
        .cab{text-align:center;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:14px} .cab h1{font-size:18px;margin:0} .cab p{margin:2px 0;font-size:11px;color:#333}
        h2{text-align:center;font-size:17px;letter-spacing:1px;margin:10px 0 14px} .pac{border:1px solid #999;padding:8px 10px;margin-bottom:14px;display:grid;grid-template-columns:1fr 1fr;gap:3px 16px;font-size:12px}
        .corpo p{margin:0 0 10px;line-height:1.55;text-align:justify;overflow-wrap:anywhere} .corpo ol{margin:0 0 12px;padding-left:20px} .corpo li{margin-bottom:8px;line-height:1.45}
        .ass{margin-top:70px;text-align:center} .ass .linha{border-top:1px solid #111;width:70%;margin:0 auto 4px} .rod{margin-top:26px;font-size:10px;color:#444;border-top:1px solid #ccc;padding-top:6px}
    </style></head><body>
        <div class="cab"><h1>${e(estab.nome || APP_INFO.hospital)}</h1>${estab.cnes ? `<p>CNES ${e(estab.cnes)}</p>` : ''}</div>
        <h2>${e(c.titulo)}</h2>
        <div class="pac"><div><b>Paciente:</b> ${e(p.nome)}</div><div><b>Prontuário:</b> ${e(p.prontuario || '—')}</div>
            <div><b>Nascimento:</b> ${p.data_nascimento ? e(formatDateBR(p.data_nascimento)) : '—'}</div><div><b>CNS:</b> ${e(p.cns || '—')}</div></div>
        <div class="corpo">${(c.itens || []).length ? `<ol>${c.itens.map(i => `<li>${e(i)}</li>`).join('')}</ol>` : ''}${(c.paragrafos || []).map(t => `<p>${e(t)}</p>`).join('')}</div>
        <div class="ass"><div class="linha"></div>${profissional}<br><small>${e(getRoleLabel(doc.perfil))} · assinatura e carimbo</small></div>
        <div class="rod">Documento nº ${e(doc.numero)} · emitido em ${e(formatDateTimeBR(doc.emitido_em))} pelo sistema do hospital. Vale com a assinatura e o carimbo do profissional. Contém dados pessoais protegidos pela LGPD.</div>
    </body></html>`;
}

const documentoImprimir = aviso(async (id) => {
    const doc = ((MOCK_DATA.DOCUMENTOS_CLINICOS || {}).items || []).find(d => d.id === id) || await getDocH(COL_DOCUMENTOS, id);
    if (!doc) throw new Error('Documento não encontrado.');
    registrarAcesso('documento_clinico', doc.id, `Impressão do documento ${doc.numero}`);
    cadImprimirHtml(htmlDocumentoClinico(doc), `${doc.tipo_rotulo} ${doc.numero}`);
});

// ---------------- Formulário de emissão ----------------

function documentoLinhaItem(item = {}) {
    const campos = [['medicamento', 'Medicamento *'], ['dose', 'Dose *'], ['via', 'Via'], ['frequencia', 'Frequência *'], ['duracao', 'Duração'], ['observacao', 'Observação']];
    return `<div class="dc-item at-form" style="margin:6px 0">${campos.map(([k, r]) => `<div class="at-field"><label class="at-label">${r}</label><input class="at-input dc-i-${k}" maxlength="120" autocomplete="off" value="${escapeHtml(item[k] || '')}"></div>`).join('')}</div>`;
}

function documentoAddItem() { document.getElementById('dc_itens').insertAdjacentHTML('beforeend', documentoLinhaItem()); }
function documentoDeclaranteMudou(v) { const el = document.getElementById('dc_acomp_wrap'); if (el) el.hidden = v !== 'ACOMPANHANTE'; }

/**
 * Abre o formulário do documento. `op`: { paciente, atendimento?, itens? (receita já preenchida), crm?, aoEmitir? }.
 * Depois de emitir, abre a folha para imprimir.
 */
function documentoAbrirForm(tipo, op) {
    const cfg = TIPOS_DOCUMENTO[tipo];
    try { if (!cfg) throw new Error('Tipo de documento inválido.'); requirePermission(cfg.permissao); } catch (err) { return showMsg(err.message, 'error'); }
    const p = op.paciente, a = op.atendimento || null;
    const campo = (id, rot, ctl, span2 = false) => `<div class="at-field${span2 ? ' at-span-2' : ''}"><label class="at-label" for="${id}">${rot}</label>${ctl}</div>`;
    const inp = (id, extra = '') => `<input class="at-input" id="${id}" autocomplete="off" ${extra}>`;
    const hoje = todayISO();
    let corpo = '';
    if (tipo === 'RECEITA') {
        corpo = `<div id="dc_itens">${((op.itens && op.itens.length) ? op.itens : [{}]).map(documentoLinhaItem).join('')}</div>
            <button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="documentoAddItem()">${lucideIcon('plus', 'w-4 h-4')} Adicionar item</button>
            <div class="at-form" style="margin-top:10px">${campo('dc_orient', 'Orientações ao paciente', '<textarea class="at-textarea" id="dc_orient" rows="3" maxlength="1000"></textarea>', true)}</div>`;
    } else if (tipo === 'ATESTADO') {
        corpo = `<div class="at-form">${campo('dc_dias', 'Dias de afastamento *', inp('dc_dias', 'type="number" min="1" max="365" inputmode="numeric"'))}${campo('dc_inicio', 'A partir de *', inp('dc_inicio', `type="date" value="${hoje}"`))}
            ${campo('dc_obs', 'Observação (opcional)', '<textarea class="at-textarea" id="dc_obs" rows="2" maxlength="500"></textarea>', true)}
            ${campo('dc_cid', 'CID-10 (opcional)', inp('dc_cid', 'maxlength="7" placeholder="Ex.: J11" style="text-transform:uppercase"'))}</div>
            <label class="cd-check" style="margin-top:8px"><input type="checkbox" id="dc_cid_ok"> <span>O paciente ou o responsável autorizou informar o CID no atestado.</span></label>`;
    } else if (tipo === 'ENCAMINHAMENTO') {
        corpo = `<div class="at-form">${campo('dc_destino', 'Encaminhar para (especialidade ou serviço) *', inp('dc_destino', 'maxlength="120"'), true)}
            ${campo('dc_motivo', 'Motivo e resumo clínico *', '<textarea class="at-textarea" id="dc_motivo" rows="5" maxlength="2000"></textarea>', true)}
            ${campo('dc_cid', 'CID-10 (opcional)', inp('dc_cid', 'maxlength="7" placeholder="Ex.: I10" style="text-transform:uppercase"'))}</div>`;
    } else {
        const chegada = a && a.chegada_em ? horaLocalHHMM(new Date(a.chegada_em)) : '';
        corpo = `<div class="at-form">${campo('dc_data', 'Data *', inp('dc_data', `type="date" max="${hoje}" value="${a && a.dia ? a.dia : hoje}"`))}
            ${campo('dc_hc', 'Hora de chegada *', inp('dc_hc', `type="time" value="${chegada}"`))}${campo('dc_hs', 'Hora de saída *', inp('dc_hs', `type="time" value="${horaLocalHHMM()}"`))}
            ${campo('dc_decl', 'Quem comparece', '<select class="at-select" id="dc_decl" onchange="documentoDeclaranteMudou(this.value)"><option value="PACIENTE">O próprio paciente</option><option value="ACOMPANHANTE">Acompanhante do paciente</option></select>')}
            <div class="at-field at-span-2" id="dc_acomp_wrap" hidden><label class="at-label" for="dc_acomp">Nome do acompanhante *</label>${inp('dc_acomp', 'maxlength="120"')}</div>
            ${campo('dc_fin', 'Finalidade *', inp('dc_fin', 'maxlength="120" placeholder="Ex.: consulta médica"'), true)}</div>`;
    }
    const pedeConselho = cfg.exige_conselho;
    const d = hModal(`${cfg.rotulo} · ${p.nome}`, `
        ${a ? `<p class="at-hint">Atendimento ${escapeHtml(a.senha)} · ${escapeHtml(a.tipo_nome || '')}</p>` : ''}
        ${corpo}
        ${pedeConselho ? `<div class="at-form" style="margin-top:10px">${campo('dc_crm', 'Seu registro no conselho (CRM) *', inp('dc_crm', `maxlength="30" value="${escapeHtml(op.crm || crmDoUsuario())}"`))}</div>` : ''}
        <p class="at-hint">${tipo === 'COMPARECIMENTO' ? 'A declaração informa apenas o comparecimento, sem dados clínicos.' : 'O conteúdo é seu: o sistema não sugere diagnóstico, medicamento nem dias de afastamento.'} O documento é numerado e guardado; imprima e assine. Não substitui receituário de medicamentos controlados.</p>
        <p class="at-error" id="dc_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="dc_ok">${lucideIcon('printer', 'w-4 h-4')} Emitir e imprimir</button></div>`, 'xl');

    d.querySelector('#dc_ok').onclick = async () => {
        d.querySelector('#dc_erro').textContent = '';
        const v = (id) => { const el = d.querySelector('#' + id); return el ? el.value : ''; };
        const form = { registro_conselho: v('dc_crm') };
        if (tipo === 'RECEITA') {
            Object.assign(form, { orientacoes: v('dc_orient'), itens: [...d.querySelectorAll('.dc-item')].map(r => Object.fromEntries(CAMPOS_ITEM_PRESCRICAO.map(k => [k, r.querySelector('.dc-i-' + k).value]))) });
        } else if (tipo === 'ATESTADO') {
            Object.assign(form, { dias: v('dc_dias'), inicio: v('dc_inicio'), observacao: v('dc_obs'), cid: v('dc_cid'), cid_autorizado: d.querySelector('#dc_cid_ok').checked });
        } else if (tipo === 'ENCAMINHAMENTO') {
            Object.assign(form, { destino: v('dc_destino'), motivo: v('dc_motivo'), cid: v('dc_cid') });
        } else {
            Object.assign(form, { data: v('dc_data'), hora_chegada: v('dc_hc'), hora_saida: v('dc_hs'), declarante: v('dc_decl'), acompanhante_nome: v('dc_acomp'), finalidade: v('dc_fin') });
        }
        try {
            const doc = await emitirDocumento(tipo, form, { paciente: p, atendimento: a });
            if (pedeConselho) lembrarCrmDoUsuario(form.registro_conselho);
            d.close();
            showMsg(`${cfg.rotulo} ${doc.numero} emitido.`);
            if (op.aoEmitir) op.aoEmitir(doc);
            registrarAcesso('documento_clinico', doc.id, `Impressão do documento ${doc.numero}`);
            cadImprimirHtml(htmlDocumentoClinico(doc), `${doc.tipo_rotulo} ${doc.numero}`);
        } catch (err) { d.querySelector('#dc_erro').textContent = err.message || 'Operação não realizada.'; }
    };
}

/** Declaração de comparecimento a partir de um atendimento (Recepção e fila de atendimento). */
const documentoDeclaracaoDoAtendimento = aviso(async (atendimentoId) => {
    const a = (MOCK_DATA.ATENDIMENTOS || []).find(x => x.id === atendimentoId);
    if (!a) throw new Error('Atendimento não encontrado.');
    requirePermission('documento_comparecimento');
    const paciente = await db_getPaciente(a.paciente_id);
    if (!paciente) throw new Error('Paciente não encontrado.');
    documentoAbrirForm('COMPARECIMENTO', { paciente, atendimento: a });
});

// ---------------- Lista no prontuário ----------------

function renderProntuarioDocumentos(st, p) {
    const docs = [...((MOCK_DATA.DOCUMENTOS_CLINICOS || {}).items || [])].sort((a, b) => String(b.emitido_em).localeCompare(String(a.emitido_em)));
    const botoes = Object.entries(TIPOS_DOCUMENTO).filter(([, c]) => hasPermission(c.permissao))
        .map(([k, c]) => `<button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="prontuarioNovoDocumento('${k}')">${lucideIcon('file-plus', 'w-4 h-4')} ${escapeHtml(c.rotulo)}</button>`).join('');
    return `
        ${botoes ? `<div class="at-actions pr-acoes">${botoes}</div>` : '<p class="at-hint">Seu perfil pode consultar, mas não emitir documentos.</p>'}
        <div class="tri-tablewrap"><table class="tri-table cd-table rf-lista"><thead><tr><th>Número</th><th>Tipo</th><th>Emitido em</th><th>Emitido por</th><th>Atendimento</th><th>Ações</th></tr></thead>
            <tbody>${docs.length ? docs.map(d => `<tr><td data-label="Número"><strong>${escapeHtml(d.numero)}</strong></td><td data-label="Tipo">${escapeHtml(d.tipo_rotulo)}</td>
                <td data-label="Emitido em">${escapeHtml(formatDateTimeBR(d.emitido_em))}</td><td data-label="Emitido por">${escapeHtml(d.emitido_por_nome)}${d.registro_conselho ? '<br><small>' + escapeHtml(d.registro_conselho) + '</small>' : ''}</td>
                <td data-label="Atendimento">${escapeHtml(d.atendimento_senha || '—')}</td>
                <td data-label="Ações" class="rf-acoes"><div class="rf-btns"><button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="documentoImprimir('${d.id}')">${lucideIcon('printer', 'w-4 h-4')} Reimprimir</button></div></td></tr>`).join('')
                : '<tr><td colspan="6" class="at-empty">Nenhum documento emitido para este paciente.</td></tr>'}</tbody></table></div>`;
}

function prontuarioNovoDocumento(tipo) { documentoAbrirForm(tipo, { paciente: prontuarioState().paciente }); }
