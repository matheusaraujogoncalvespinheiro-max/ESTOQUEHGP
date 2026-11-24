// Recursos compartilhados pelas telas de gestão (Etapa 10): ouvidoria, qualidade, ensino e pesquisa e painel da direção.
// Regras e gravação ficam em services/*.js; esta camada só desenha e chama os serviços. Os desenhos de tabela, filtro, aba e indicador
// vêm de pages/apoio/comum.js (e9*), para as telas novas terem o mesmo jeito das de apoio.

/** Janela de uma etapa do fluxo: campos lidos por id `<prefixo>_<campo>`, botão que chama `executar(form)` e, se der certo, fecha e redesenha. */
function gsPasso(titulo, corpo, prefixo, campos, rotuloBotao, executar, aviso = '') {
    const d = hModal(titulo, `<div class="at-form tc-form">${corpo}</div>${aviso}<p class="at-error" id="${prefixo}_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="${prefixo}_ok">${rotuloBotao}</button></div>`, 'lg');
    d.querySelector(`#${prefixo}_ok`).onclick = async () => {
        d.querySelector(`#${prefixo}_erro`).textContent = '';
        try {
            const f = e9Ler(d, prefixo, campos);
            ['em', 'recebida_em'].forEach(k => { if (f[k]) f[k] = new Date(f[k]).toISOString(); });
            await executar(f); d.close(); render();
        } catch (err) { e9Erro(d, `${prefixo}_erro`, err); }
    };
    return d;
}

/** Janela que pede só um texto (motivo, resultado, observação). */
const gsTexto = (titulo, rotulo, prefixo, rotuloBotao, executar, { obrigatorio = true, aviso = '' } = {}) => gsPasso(titulo,
    `<label class="at-field at-span-2"><span class="at-label">${escapeHtml(rotulo)}${obrigatorio ? ' *' : ''}</span><input class="at-input" id="${prefixo}_texto" maxlength="300" autocomplete="off"></label>`,
    prefixo, ['texto'], rotuloBotao, (f) => executar(f.texto), aviso);

/** Campo de data (AAAA-MM-DD) com rótulo. */
const gsData = (id, rotulo, valor = '', extra = '') => `<label class="at-field"><span class="at-label">${escapeHtml(rotulo)}</span><input class="at-input" type="date" id="${id}" value="${escapeHtml(valor)}" ${extra}></label>`;
/** Campo de texto com rótulo. */
const gsCampo = (id, rotulo, { max = 100, span = false, valor = '', dica = '' } = {}) => `<label class="at-field${span ? ' at-span-2' : ''}"><span class="at-label">${escapeHtml(rotulo)}</span><input class="at-input" id="${id}" maxlength="${max}" autocomplete="off" value="${escapeHtml(valor)}" ${dica ? `placeholder="${escapeHtml(dica)}"` : ''}></label>`;

/** Etiqueta de situação genérica: aberta, em andamento, concluída, cancelada. */
const gsBadge = (status) => ({ RECEBIDA: 'at-badge', EM_ANALISE: 'at-badge at-badge--outros', RESPONDIDA: 'at-badge at-badge--outros', CONCLUIDA: 'at-badge at-badge--ok', CONCLUIDO: 'at-badge at-badge--ok',
    ARQUIVADA: 'at-badge at-badge--off', CANCELADA: 'at-badge at-badge--off', CANCELADO: 'at-badge at-badge--off', ABERTA: 'at-badge', EM_TRATAMENTO: 'at-badge at-badge--outros', PENDENTE: 'at-badge',
    EM_ANDAMENTO: 'at-badge at-badge--outros', PLANEJADO: 'at-badge', VIGENTE: 'at-badge at-badge--ok', OBSOLETO: 'at-badge at-badge--off' }[status] || 'at-badge');
const gsAviso = (texto) => `<span class="at-badge at-badge--emergencia">${escapeHtml(texto)}</span>`;
