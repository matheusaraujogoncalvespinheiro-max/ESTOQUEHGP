// Recursos compartilhados pelas telas de apoio e infraestrutura (Etapa 9): manutenção, patrimônio, transporte, rouparia, resíduos,
// voluntariado e óbitos. Regras e gravação ficam em services/*.js; esta camada só desenha e chama os serviços.

const e9Kpi = (valor, rotulo) => `<div class="rf-kpi"><strong>${escapeHtml(String(valor))}</strong><span>${escapeHtml(rotulo)}</span></div>`;
const e9Botao = (rotulo, acao, primario = false) => `<button type="button" class="at-btn ${primario ? 'at-btn--primary' : 'at-btn--ghost'} at-btn--sm" onclick="${acao}">${rotulo}</button>`;
const e9Opcoes = (mapa, atual = '', vazio = '') => `${vazio ? `<option value="">${escapeHtml(vazio)}</option>` : ''}${Object.entries(mapa).map(([k, r]) => `<option value="${escapeHtml(k)}" ${k === atual ? 'selected' : ''}>${escapeHtml(r)}</option>`).join('')}`;

/** Filtro em lista: `campo` da tela `chave` recebe `valor` e a tela é redesenhada (a busca em texto espera 250 ms). */
let e9Timer = null;
function e9Filtro(chave, campo, valor) { state[chave][campo] = valor; render(); }
function e9FiltroTexto(chave, valor) { state[chave].q = valor; clearTimeout(e9Timer); e9Timer = setTimeout(render, 250); }

/** Seletor do filtro da tela: `opts` é uma lista de [valor, rótulo]. */
const e9Sel = (chave, campo, valor, opts) => `<select class="at-input" onchange="e9Filtro('${chave}', '${campo}', this.value)" data-keep="${chave}_${campo}">${opts.map(([v, r]) => `<option value="${escapeHtml(v)}" ${v === valor ? 'selected' : ''}>${escapeHtml(r)}</option>`).join('')}</select>`;

/** Campo de busca do filtro (mantém o foco e o texto ao redesenhar). */
const e9Busca = (chave, valor, dica) => `<label class="at-field"><span class="at-label">Buscar</span><input class="at-input" type="search" value="${escapeHtml(valor)}" placeholder="${escapeHtml(dica)}" oninput="e9FiltroTexto('${chave}', this.value)" data-keep="${chave}_q" autocomplete="off"></label>`;

/** Abas simples da tela. `abas` é uma lista de [id, rótulo]. */
const e9Abas = (chave, atual, abas) => `<nav class="at-tabs cd-tabs" aria-label="Seções">${abas.map(([id, r]) => `<button type="button" class="at-tab ${id === atual ? 'is-active' : ''}" onclick="e9Filtro('${chave}', 'aba', '${id}')">${escapeHtml(r)}</button>`).join('')}</nav>`;

/** Períodos de resumo em dias (hoje, 7, 30). Devolve { de, ate } em AAAA-MM-DD. */
const E9_PERIODOS = [['0', 'Hoje'], ['7', 'Últimos 7 dias'], ['30', 'Últimos 30 dias']];
function e9Periodo(dias) {
    const n = Number(dias);
    return { de: todayISO(new Date(Date.now() - n * 86400000)), ate: todayISO() };
}

const e9BadgeOs = { ABERTA: 'at-badge', EM_ATENDIMENTO: 'at-badge at-badge--outros', AGUARDANDO_PECA: 'at-badge at-badge--emergencia', CONCLUIDA: 'at-badge at-badge--ok', CANCELADA: 'at-badge at-badge--off' };
const e9BadgePrioridade = { URGENTE: 'at-badge at-badge--emergencia', ALTA: 'at-badge at-badge--outros', NORMAL: 'at-badge', BAIXA: 'at-badge at-badge--off' };

/** Mensagem de erro dentro de uma janela (campo `#id`). */
function e9Erro(d, id, err) { const el = d.querySelector('#' + id); if (el) el.textContent = (err && err.message) || 'Operação não realizada.'; }

/** Lê o valor de vários campos da janela por id (sufixo comum): { campo: valor }. */
function e9Ler(d, prefixo, campos) {
    const o = {};
    campos.forEach(c => { const el = d.querySelector(`#${prefixo}_${c}`); o[c] = el ? (el.type === 'checkbox' ? el.checked : el.value) : ''; });
    return o;
}

/** Linha "rótulo: valor" do detalhe. */
const e9Dl = (pares) => `<dl class="about-list">${pares.filter(p => p).map(([r, v]) => `<div><dt>${escapeHtml(r)}</dt><dd>${v === '' || v === null || v === undefined ? '—' : escapeHtml(String(v))}</dd></div>`).join('')}</dl>`;

/** Linha do tempo do histórico de um documento (status, quando, quem, motivo). `rotulos` traduz o código da situação. */
const e9Historico = (hist, rotulos = {}) => `<ol class="at-timeline">${(hist || []).map(h => `<li><strong>${escapeHtml(rotulos[h.status] || h.status || h.acao || '')}</strong> <small>${escapeHtml(formatDateTimeBR(h.em))} · ${escapeHtml(h.por_nome || h.por || '')}</small>${(h.motivo || h.detalhe) ? `<br><small>${escapeHtml(h.motivo || h.detalhe)}</small>` : ''}</li>`).join('')}</ol>`;

/** Datas e horários para campos datetime-local (hora local) e a hora atual como padrão. */
const e9AgoraLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

/** Quem vê o nome do paciente nas listas de apoio: quem já pode consultar pacientes. */
const e9VeNome = () => (typeof podeVerNomePaciente === 'function' ? podeVerNomePaciente() : hasPermission('pacientes_consultar'));

/** Nomes de setores e unidades do cadastro (ativos, sem repetir) para sugerir no campo de setor. O campo continua livre. */
function e9NomesDeSetor() {
    const nomes = [...cadRowsOf('setor'), ...cadRowsOf('unidadeassist')].filter(r => r.ativo !== false && r.nome).map(r => String(r.nome).trim());
    return [...new Set(nomes)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
/** Campo de setor com sugestões (datalist) do cadastro. */
const e9CampoSetor = (id, rotulo = 'Setor *') => `<label class="at-field"><span class="at-label">${escapeHtml(rotulo)}</span><input class="at-input" id="${id}" list="${id}_lista" maxlength="60" autocomplete="off"><datalist id="${id}_lista">${e9NomesDeSetor().map(n => `<option value="${escapeHtml(n)}"></option>`).join('')}</datalist></label>`;
