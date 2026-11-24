// Configurações do hospital: metas e prazos, sistemas em uso e listas dos módulos. Regras e gravação em services/config-hospital.js.
// Quem tem a permissão `config_gerenciar` (Administrador e Direção por padrão) altera; os demais perfis com acesso à tela só consultam.

const cfgState = { aba: 'metas', lista: 'PRIORIDADES_CIRURGIA' };
const CFG_ABAS = { metas: 'Metas e prazos', sistemas: 'Sistemas em uso', listas: 'Listas dos módulos' };

function cfgPodeAlterar() { return hasPermission('config_gerenciar'); }

function renderConfiguracoes() {
    if (!cfgPodeAlterar() && !hasPermission('direcao_ver')) return '<div class="at-stack"><p class="tri-banner tri-banner--warn">Acesso negado: seu perfil não pode ver as configurações.</p></div>';
    db_cadWatch('parametro'); db_cadWatch('listaapoio'); db_watch('config_sistema');
    const pode = cfgPodeAlterar();
    const abas = Object.entries(CFG_ABAS).map(([id, r]) => `<button type="button" class="at-btn ${cfgState.aba === id ? 'at-btn--primary' : 'at-btn--ghost'}" onclick="cfgAba('${id}')">${escapeHtml(r)}</button>`).join('');
    const corpo = cfgState.aba === 'sistemas' ? cfgCorpoSistemas(pode) : cfgState.aba === 'listas' ? cfgCorpoListas(pode) : cfgCorpoMetas(pode);
    return `<div class="at-stack tone-teal">
        <header class="cd-head"><div class="cd-head__ico">${lucideIcon('sliders-horizontal', 'w-7 h-7')}</div>
            <div class="cd-head__txt"><h2>Configurações do Hospital</h2><p>${pode ? 'Defina aqui as metas, os prazos, o sistema em uso e as opções das listas. Cada alteração fica na auditoria.' : 'Consulta: seu perfil não altera estas configurações.'}</p></div></header>
        <section class="at-card"><div class="at-actions" style="justify-content:flex-start;flex-wrap:wrap">${abas}</div></section>${corpo}</div>`;
}

function cfgAba(id) { cfgState.aba = id; render(); }

// ---------- Metas e prazos ----------
function cfgCorpoMetas(pode) {
    const grupos = new Map();
    CATALOGO_PARAMETROS.forEach(p => { if (!grupos.has(p.grupo)) grupos.set(p.grupo, []); grupos.get(p.grupo).push(p); });
    return [...grupos.entries()].map(([g, itens]) => `<section class="at-card"><h3 class="at-card__title">${escapeHtml(g)}</h3>
        <div class="tri-tablewrap"><table class="tri-table cd-table"><thead><tr><th>Parâmetro</th><th>Valor</th><th>Efeito</th>${pode ? '<th>Ação</th>' : ''}</tr></thead><tbody>${itens.map(p => {
            const v = parametroSistema(p.id);
            return `<tr><td data-label="Parâmetro"><strong>${escapeHtml(p.rotulo)}</strong><br><small>${p.min} a ${p.max} ${escapeHtml(p.unidade)}</small></td>
                <td data-label="Valor">${pode ? `<input class="at-input" id="cfg_${p.id}" inputmode="numeric" value="${v === null ? '' : v}" placeholder="${p.padrao ? 'padrão ' + p.padrao : 'não definido'}" style="max-width:130px" aria-label="${escapeHtml(p.rotulo)}"> ${escapeHtml(p.unidade)}` : (v === null ? 'não definido' : `${v} ${escapeHtml(p.unidade)}`)}</td>
                <td data-label="Efeito"><small>${escapeHtml(p.efeito)}</small></td>
                ${pode ? `<td data-label="Ação" class="rf-acoes"><div class="rf-btns">${e9Botao('Salvar', `cfgSalvarParametro('${p.id}')`, true)}</div></td>` : ''}</tr>`;
        }).join('')}</tbody></table></div></section>`).join('') + `<p class="at-hint">${lucideIcon('info', 'w-4 h-4')} Valor em branco = sem meta ou prazo definido (o sistema não inventa um). As metas definidas aparecem no Painel da Direção.</p>`;
}

async function cfgSalvarParametro(id) {
    const el = document.getElementById(`cfg_${id}`);
    try { const r = await salvarParametroHospital(id, el ? el.value : ''); showMsg(r.ativo ? 'Valor salvo.' : 'Valor removido: sem meta ou prazo definido.'); }
    catch (err) { showMsg(err.message || 'Não foi possível salvar.', 'error'); }
    render();
}

// ---------- Sistemas em uso ----------
function cfgCorpoSistemas(pode) {
    const meta = (MOCK_DATA.CONFIG_SISTEMA || {});
    return `<p class="at-hint">${lucideIcon('info', 'w-4 h-4')} Existem dois fluxos para cada uma destas áreas. Enquanto nenhum for escolhido, os dois funcionam. Ao escolher, o outro deixa de aceitar NOVOS registros; o que já foi registrado continua sendo exibido.${meta.atualizado_por_nome ? ` Última alteração por ${escapeHtml(meta.atualizado_por_nome)} em ${escapeHtml(formatDateTimeBR(meta.atualizado_em))}.` : ''}</p>` +
        Object.entries(SISTEMAS_PARALELOS).map(([area, def]) => {
            const em = sistemaEmUso(area);
            return `<section class="at-card"><h3 class="at-card__title">${escapeHtml(def.rotulo)}</h3>
                <p class="at-hint">Em uso: <strong>${em ? escapeHtml(def.opcoes[em]) : 'nenhum escolhido (os dois funcionam)'}</strong></p>
                ${pode ? `<div class="at-form tc-form"><label class="at-field at-span-2"><span class="at-label">Sistema a usar</span><select class="at-input" id="cfgs_${area}"><option value="">-- Nenhum (os dois funcionam) --</option>${Object.entries(def.opcoes).map(([k, r]) => `<option value="${k}" ${k === em ? 'selected' : ''}>${escapeHtml(r)}</option>`).join('')}</select></label>
                    <label class="at-field at-span-2"><span class="at-label">Motivo da escolha *</span><input class="at-input" id="cfgm_${area}" maxlength="200" autocomplete="off"></label></div>
                    <div class="at-actions"><button type="button" class="at-btn at-btn--primary" onclick="cfgSalvarSistema('${area}')">Salvar</button></div>` : ''}</section>`;
        }).join('');
}

async function cfgSalvarSistema(area) {
    try { await salvarSistemaEmUso(area, document.getElementById(`cfgs_${area}`).value, document.getElementById(`cfgm_${area}`).value); showMsg('Escolha salva.'); }
    catch (err) { showMsg(err.message || 'Não foi possível salvar.', 'error'); return; }
    render();
}

// ---------- Listas dos módulos ----------
function cfgCorpoListas(pode) {
    const lista = LISTAS_APOIO[cfgState.lista] ? cfgState.lista : Object.keys(LISTAS_APOIO)[0];
    const opcoes = opcoesDaListaApoio(lista);
    return `<section class="at-card"><label class="at-field"><span class="at-label">Lista</span><select class="at-input" onchange="cfgEscolherLista(this.value)">${Object.entries(LISTAS_APOIO).map(([id, c]) => `<option value="${id}" ${id === lista ? 'selected' : ''}>${escapeHtml(c.rotulo)}</option>`).join('')}</select></label>
        <div class="tri-tablewrap"><table class="tri-table cd-table"><thead><tr><th>Código</th><th>Nome da opção</th><th>Origem</th>${pode ? '<th>Ações</th>' : ''}</tr></thead><tbody>${opcoes.map(o => `<tr><td data-label="Código"><code>${escapeHtml(o.codigo)}</code></td><td data-label="Nome">${escapeHtml(o.rotulo)}</td><td data-label="Origem">${o.padrao ? (o.meu ? 'Padrão (renomeada)' : 'Padrão do sistema') : 'Acrescentada pelo hospital'}</td>
            ${pode ? `<td data-label="Ações" class="rf-acoes"><div class="rf-btns">${e9Botao('Renomear', `cfgRenomearOpcao('${lista}','${o.codigo}')`)}${o.padrao ? '' : e9Botao('Retirar', `cfgRetirarOpcao('${lista}','${o.codigo}')`)}</div></td>` : ''}</tr>`).join('') || '<tr><td colspan="4" class="at-empty">Sem opções.</td></tr>'}</tbody></table></div></section>
        ${pode ? `<section class="at-card"><h3 class="at-card__title">Nova opção</h3><div class="at-form tc-form"><label class="at-field"><span class="at-label">Código *</span><input class="at-input" id="cfgl_codigo" maxlength="30" autocomplete="off" placeholder="EX.: CAMPO_CIRURGICO"></label>
            <label class="at-field"><span class="at-label">Nome da opção *</span><input class="at-input" id="cfgl_rotulo" maxlength="60" autocomplete="off"></label></div>
            <div class="at-actions"><button type="button" class="at-btn at-btn--primary" onclick="cfgNovaOpcao()">Acrescentar</button></div></section>` : ''}
        <p class="at-hint">${lucideIcon('info', 'w-4 h-4')} As opções padrão não saem da lista (só podem ser renomeadas) e os registros antigos continuam como estavam.</p>`;
}

function cfgEscolherLista(id) { cfgState.lista = id; render(); }

async function cfgNovaOpcao() {
    try { await salvarOpcaoListaApoio({ lista: cfgState.lista, codigo: document.getElementById('cfgl_codigo').value, rotulo: document.getElementById('cfgl_rotulo').value }); showMsg('Opção salva.'); }
    catch (err) { showMsg(err.message || 'Não foi possível salvar.', 'error'); return; }
    render();
}

function cfgRenomearOpcao(lista, codigo) {
    const atual = (opcoesDaListaApoio(lista).find(o => o.codigo === codigo) || {}).rotulo || '';
    const d = hModal('Renomear opção', `<label class="at-field"><span class="at-label">Novo nome para ${escapeHtml(codigo)} *</span><input class="at-input" id="cfgr_nome" maxlength="60" value="${escapeHtml(atual)}" autocomplete="off"></label>
        <p class="at-error" id="cfgr_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="cfgr_ok">Salvar</button></div>`);
    d.querySelector('#cfgr_ok').onclick = async () => {
        try { await salvarOpcaoListaApoio({ lista, codigo, rotulo: d.querySelector('#cfgr_nome').value }); d.close(); showMsg('Opção renomeada.'); render(); }
        catch (err) { e9Erro(d, 'cfgr_erro', err); }
    };
}

async function cfgRetirarOpcao(lista, codigo) {
    try { await desativarOpcaoListaApoio(lista, codigo); showMsg('Opção retirada da lista.'); }
    catch (err) { showMsg(err.message || 'Não foi possível retirar.', 'error'); }
    render();
}
