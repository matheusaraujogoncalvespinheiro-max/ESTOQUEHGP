// Aba Anexos do prontuário (#31): lista os arquivos do paciente e envia novos (PDF, JPEG, PNG até 700 KB). Regras em services/anexos.js.

function renderProntuarioAnexos(st, p) {
    const lista = [...((MOCK_DATA.ANEXOS_CLINICOS || {}).items || [])].sort((a, b) => String(b.enviado_em).localeCompare(String(a.enviado_em)));
    const pode = hasPermission('prontuario_evoluir');
    const kb = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
    return `
        <div class="at-actions pr-acoes">${pode ? `<button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="prontuarioNovoAnexo()">${lucideIcon('paperclip', 'w-4 h-4')} Enviar anexo</button>` : '<p class="at-hint">Seu perfil pode consultar, mas não enviar anexos.</p>'}</div>
        <p class="at-hint">PDF, JPEG ou PNG de até 700 KB. Um anexo enviado não é apagado nem substituído; se foi enviado por engano, registre isso em uma evolução.</p>
        <div class="tri-tablewrap"><table class="tri-table cd-table rf-lista"><thead><tr><th>Descrição</th><th>Tipo</th><th>Tamanho</th><th>Enviado em</th><th>Enviado por</th><th>Ações</th></tr></thead>
            <tbody>${lista.length ? lista.map(a => `<tr><td data-label="Descrição"><strong>${escapeHtml(a.descricao)}</strong><br><small>${escapeHtml(a.nome)}</small></td><td data-label="Tipo">${escapeHtml(a.tipo_rotulo)}</td>
                <td data-label="Tamanho">${escapeHtml(kb(a.tamanho))}</td><td data-label="Enviado em">${escapeHtml(formatDateTimeBR(a.enviado_em))}</td><td data-label="Enviado por">${escapeHtml(a.enviado_por_nome)}</td>
                <td data-label="Ações" class="rf-acoes"><div class="rf-btns"><button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="prontuarioAbrirAnexo('${a.id}')">${lucideIcon('external-link', 'w-4 h-4')} Abrir</button></div></td></tr>`).join('')
                : '<tr><td colspan="6" class="at-empty">Nenhum anexo para este paciente.</td></tr>'}</tbody></table></div>`;
}

function prontuarioNovoAnexo() {
    const st = prontuarioState();
    const d = hModal('Enviar anexo', `<div class="at-form">
            <label class="at-field at-span-2"><span class="at-label">Arquivo (PDF, JPEG ou PNG, até 700 KB) *</span><input class="at-input" type="file" id="ax_arquivo" accept="application/pdf,image/jpeg,image/png"></label>
            <label class="at-field at-span-2"><span class="at-label">Descrição *</span><input class="at-input" id="ax_desc" maxlength="120" autocomplete="off" placeholder="Ex.: Laudo de tomografia de outro serviço"></label></div>
        <p class="at-error" id="ax_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="ax_ok">Enviar</button></div>`, 'md');
    d.querySelector('#ax_ok').onclick = async () => {
        const btn = d.querySelector('#ax_ok'); btn.disabled = true; d.querySelector('#ax_erro').textContent = '';
        try {
            await enviarAnexo(st.pacienteId, d.querySelector('#ax_arquivo').files[0], d.querySelector('#ax_desc').value);
            showMsg('Anexo enviado.'); fecharModais(); render();
        } catch (err) { d.querySelector('#ax_erro').textContent = err.message; btn.disabled = false; }
    };
}

async function prontuarioAbrirAnexo(id) {
    const a = ((MOCK_DATA.ANEXOS_CLINICOS || {}).items || []).find(x => x.id === id);
    if (!a) return;
    try { window.open(await urlDoAnexo(a), '_blank', 'noopener'); } catch (err) { showMsg('Não foi possível abrir o arquivo: ' + ((err && err.message) || err), 'error'); }
}
