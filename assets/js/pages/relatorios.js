// Tela de relatórios: um módulo, vários relatórios (state.relatorio.tipo). Cada um tem resumo, tabela, impressão e exportação CSV.

const RELATORIOS = {
    OCUPACAO: { rotulo: 'Ocupação de leitos', periodo: false, gerar: () => relatorioOcupacao(estruturaHospital(), MOCK_DATA.LEITOS_ESTADO), watch: ['leitos'] },
    INTERNACOES: { rotulo: 'Internações', periodo: true, gerar: (f) => relatorioInternacoes(MOCK_DATA.INTERNACOES, f.de, f.ate), watch: ['internacoes'] },
    EXAMES: { rotulo: 'Exames', periodo: true, gerar: (f) => relatorioExames(MOCK_DATA.SOLICITACOES_EXAME, f.de, f.ate), watch: ['solicitacoes'] },
    AUTORIZACOES: { rotulo: 'Autorizações', periodo: false, gerar: () => relatorioAutorizacoes(MOCK_DATA.SOLICITACOES_EXAME, MOCK_DATA.AUTORIZACOES, todayISO()), watch: ['solicitacoes', 'autorizacoes'] },
    CURVA_ABC: { rotulo: 'Curva ABC', periodo: false, gerar: () => relatorioCurvaABC(produtosComSetor()) },
    REPOSICAO: { rotulo: 'Reposição', periodo: false, gerar: () => relatorioReposicao(produtosComSetor()) },
    VALIDADE: { rotulo: 'Validade dos lotes', periodo: false, gerar: () => relatorioValidade(produtosComSetor()) },
    OPME_RASTREIO: { rotulo: 'Rastreabilidade de OPME', periodo: true, busca: true, gerar: (f) => relatorioRastreabilidadeOpme(MOCK_DATA.LAUDOS || [], f.de, f.ate, f.q) },
    EVENTOS_NSP: { rotulo: 'Eventos e segurança do paciente', periodo: true, gerar: (f) => relatorioEventosNsp(MOCK_DATA.OCORRENCIAS_EMERGENCIA || [], f.de, f.ate), watch: ['emergencia'] },
    CONSIGNADO_ESTOQUE: { rotulo: 'Estoque consignado', periodo: false, gerar: () => relatorioConsignadoEstoque(produtosComSetor(), (id) => cadRotuloRef('fornecedor', id)), watch: [], cad: ['fornecedor'] },
    CONSIGNADO_USO: { rotulo: 'Utilizações de consignado', periodo: true, gerar: (f) => relatorioConsignadoUso(MOCK_DATA.LAUDOS || [], produtosComSetor(), (id) => cadRotuloRef('fornecedor', id), f.de, f.ate), cad: ['fornecedor'] },
    PORTARIA_VISITANTES: { rotulo: 'Visitantes', periodo: true, busca: true, gerar: (f) => relatorioPortaria(MOCK_DATA.PORTARIA_VISITS || [], 'VISITANTE', f.de, f.ate, f.q) },
    PORTARIA_ACOMPANHANTES: { rotulo: 'Acompanhantes', periodo: true, busca: true, gerar: (f) => relatorioPortaria(MOCK_DATA.PORTARIA_VISITS || [], 'ACOMPANHANTE', f.de, f.ate, f.q) },
    PORTARIA_HISTORICO: { rotulo: 'Histórico da portaria', periodo: true, busca: true, gerar: (f) => relatorioPortaria(MOCK_DATA.PORTARIA_VISITS || [], '', f.de, f.ate, f.q) },
    MAPA_CIRURGICO: { rotulo: 'Mapa cirúrgico', periodo: true, busca: true, gerar: (f) => relatorioMapaCirurgico(MOCK_DATA.PROCEDIMENTOS_AGENDADOS || [], f.de, f.ate, f.q) },
    CONSUMO: { rotulo: 'Consumo', periodo: true, gerar: (f) => relatorioConsumo(MOCK_DATA.PRODUCT_HISTORY || [], CAD_DATA.saida || [], MOCK_DATA.LAUDOS || [], f.de, f.ate), cad: ['saida'] },
    COMPRAS: { rotulo: 'Compras', periodo: true, gerar: (f) => relatorioCompras(CAD_DATA.pedido || [], CAD_DATA.recebimento || [], (id) => cadRotuloRef('fornecedor', id), f.de, f.ate), cad: ['pedido', 'recebimento', 'fornecedor'] },
    PROCEDIMENTOS_REL: { rotulo: 'Procedimentos', periodo: true, gerar: (f) => relatorioProcedimentos(MOCK_DATA.PROCEDIMENTOS_AGENDADOS || [], MOCK_DATA.PROCEDIMENTOS_NAO_REALIZADOS || [], MOCK_DATA.LAUDOS || [], f.de, f.ate) },
    PERDAS: { rotulo: 'Perdas', periodo: true, gerar: (f) => relatorioPerdas(CAD_DATA.perda || [], f.de, f.ate), cad: ['perda'] },
    PERMISSOES: { rotulo: 'Permissões por perfil', periodo: false, gerar: () => relatorioPermissoes() },
    AUDITORIA: { rotulo: 'Auditoria', periodo: true, auditoria: true, gerar: (f) => relatorioAuditoria(state.relatorio.auditoria || [], { entidade: f.entidade, usuario: f.q, de: f.de, ate: f.ate }) }
};

/** Produtos de todos os setores, cada um com a chave `setor` (os dados originais ficam em MOCK_DATA por setor). */
function produtosComSetor() {
    return ['OPME', 'HEMODINAMICA', 'CENTRO_CIRURGICO'].flatMap(s => (MOCK_DATA[s] || []).map(p => ({ ...p, setor: typeof rotuloSetor === 'function' ? rotuloSetor(s) : s })));
}

function relatorioState() {
    if (!state.relatorio) state.relatorio = { tipo: 'OCUPACAO', de: '', ate: '', q: '', entidade: '', auditoria: null };
    return state.relatorio;
}

function relatorioAbrir(tipo) {
    const st = relatorioState();
    Object.assign(st, { tipo, de: '', ate: '', q: '', entidade: '', auditoria: null });
    (RELATORIOS[tipo].watch || []).forEach(w => { try { db_watch(w); } catch (e) { /* sem banco */ } });
    (RELATORIOS[tipo].cad || []).forEach(k => db_cadWatch(k));
    if (RELATORIOS[tipo].auditoria) relatorioCarregarAuditoria();
}

async function relatorioCarregarAuditoria() {
    const st = relatorioState();
    try {
        requirePermission('auditoria_ver');
        const snap = await requireDb().collection(COL.HISTORICO).orderBy('data_hora', 'desc').limit(500).get();
        st.auditoria = snap.docs.map(docToObj);
        registrarAcesso('auditoria', 'consulta', 'Consulta ao relatório de auditoria');
    } catch (err) { st.auditoria = []; showMsg(err.message, 'error'); }
    render();
}

function renderRelatorios() {
    const st = relatorioState();
    const def = RELATORIOS[st.tipo];
    (def.watch || []).forEach(w => db_watch(w));
    (def.cad || []).forEach(k => db_cadWatch(k));
    const rel = def.gerar(st);
    const campoData = (k, rot) => `<label class="cd-filter"><span>${rot}</span><input class="at-input hs-sel" type="date" value="${st[k]}" onchange="relatorioFiltro('${k}', this.value)" data-keep="rl_${k}"></label>`;
    const entidades = def.auditoria ? [...new Set((st.auditoria || []).map(r => r.entidade))].sort() : [];
    return `
    <div class="at-stack tone-teal">
        <header class="cd-head"><div class="cd-head__ico">${lucideIcon('bar-chart-3', 'w-7 h-7')}</div>
            <div class="cd-head__txt"><h2>${escapeHtml(rel.titulo)}</h2><p>${escapeHtml(rel.descricao)}</p></div>
            <div class="cd-head__btns"><button type="button" class="at-btn at-btn--ghost cd-new" onclick="relatorioImprimir()">${lucideIcon('printer', 'w-5 h-5')} Imprimir</button><button type="button" class="at-btn at-btn--ghost cd-new" onclick="relatorioCsv()">${lucideIcon('download', 'w-5 h-5')} Exportar CSV</button></div></header>
        <div class="cd-kpis">${rel.resumo.map(r => `<div class="cd-kpi"><strong>${escapeHtml(r.valor)}</strong><span>${escapeHtml(r.rot)}</span></div>`).join('')}</div>
        ${def.periodo || def.busca || def.auditoria ? `<section class="at-card cd-filters">${def.periodo ? campoData('de', 'De') + campoData('ate', 'Até') : ''}
            ${def.auditoria ? `<label class="cd-filter"><span>Entidade</span><select class="at-select hs-sel" onchange="relatorioFiltro('entidade', this.value)" data-keep="rl_ent"><option value="">Todas</option>${entidades.map(e => `<option ${st.entidade === e ? 'selected' : ''}>${escapeHtml(e)}</option>`).join('')}</select></label>` : ''}
            ${def.busca || def.auditoria ? `<label class="cd-filter cd-filter--grow"><span>${def.auditoria ? 'Usuário' : 'Pesquisar (paciente, lote, material...)'}</span><input class="at-input hs-sel" type="search" value="${escapeHtml(st.q)}" oninput="relatorioFiltro('q', this.value)" data-keep="rl_q" autocomplete="off"></label>` : ''}</section>` : ''}
        <section class="at-card" style="padding:0;overflow:hidden"><div class="cd-tablewrap"><table class="tri-table cd-table"><thead><tr>${rel.colunas.map(c => `<th>${escapeHtml(c.label)}</th>`).join('')}</tr></thead>
            <tbody>${rel.linhas.length ? rel.linhas.map(l => `<tr>${rel.colunas.map(c => `<td data-label="${escapeHtml(c.label)}">${escapeHtml(l[c.k] ?? '—')}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${rel.colunas.length}" class="at-empty">${def.auditoria && st.auditoria === null ? 'Carregando...' : 'Nenhum dado para este relatório.'}</td></tr>`}</tbody></table></div></section>
    </div>`;
}

function relatorioFiltro(k, v) { relatorioState()[k] = v; render(); }

function relatorioAtual() { const st = relatorioState(); return RELATORIOS[st.tipo].gerar(st); }

function relatorioImprimir() {
    const rel = relatorioAtual();
    const st = relatorioState();
    registrarAcesso('relatorio', st.tipo, 'Impressão de relatório');
    const periodo = (st.de || st.ate) ? `Período: ${st.de ? formatDateBR(st.de) : 'início'} a ${st.ate ? formatDateBR(st.ate) : 'hoje'}` : '';
    cadImprimirHtml(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(rel.titulo)}</title><style>
        @page { size: A4 ${rel.colunas.length > 5 ? 'landscape' : 'portrait'}; margin: 12mm; } body { font-family: Arial, sans-serif; font-size: 11px; color: #111; margin: 0; }
        h1 { font-size: 17px; margin: 0; } h2 { font-size: 13px; margin: 2px 0 0; } .meta { margin: 8px 0; color: #444; } .kpis { display: flex; gap: 18px; margin: 6px 0 10px; } .kpis div { border: 1px solid #999; padding: 4px 10px; }
        table { width: 100%; border-collapse: collapse; } thead { display: table-header-group; } th, td { border: 1px solid #999; padding: 3px 5px; text-align: left; vertical-align: top; overflow-wrap: anywhere; } th { background: #e5e7eb; font-size: 10px; text-transform: uppercase; } tr { page-break-inside: avoid; }
    </style></head><body><h1>${escapeHtml(APP_INFO.hospital)}</h1><h2>${escapeHtml(rel.titulo)}</h2>
    <div class="meta">${escapeHtml(periodo)} Emitido em ${escapeHtml(formatDateTimeBR(new Date().toISOString()))} por ${escapeHtml(state.currentUser.name)} · ${rel.linhas.length} linha(s)</div>
    <div class="kpis">${rel.resumo.map(r => `<div><b>${escapeHtml(r.valor)}</b><br>${escapeHtml(r.rot)}</div>`).join('')}</div>
    <table><thead><tr>${rel.colunas.map(c => `<th>${escapeHtml(c.label)}</th>`).join('')}</tr></thead><tbody>${rel.linhas.map(l => `<tr>${rel.colunas.map(c => `<td>${escapeHtml(l[c.k] ?? '—')}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`);
}

function relatorioCsv() {
    const rel = relatorioAtual();
    registrarAcesso('relatorio', relatorioState().tipo, 'Exportação CSV de relatório');
    const blob = new Blob([relatorioParaCsv(rel)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${rel.titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${todayISO()}.csv`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
