// Relatórios: funções puras que calculam as tabelas a partir dos dados já carregados (sem acesso a tela ou banco).
// Cada relatório devolve { titulo, descricao, colunas: [{ k, label }], linhas: [{...}], resumo: [{ rot, valor }] }.

const diasEntre = (aISO, bISO) => Math.max(0, Math.round((new Date(bISO).getTime() - new Date(aISO).getTime()) / 86400000 * 10) / 10);
const dentro = (iso, de, ate) => { const d = String(iso || '').slice(0, 10); return (!de || d >= de) && (!ate || d <= ate); };
const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '—');

/** Ocupação por andar e ala, com os leitos bloqueados e o motivo. */
function relatorioOcupacao(leitos, estado) {
    const grupos = new Map();
    leitos.forEach(l => {
        const k = `${l.andarNome} · ${l.ala}`;
        if (!grupos.has(k)) grupos.set(k, { local: k, total: 0, OCUPADO: 0, LIVRE: 0, HIGIENIZACAO: 0, BLOQUEADO: 0 });
        const g = grupos.get(k);
        const s = (estado[l.id] || { status: 'LIVRE' }).status;
        g.total++; g[s] = (g[s] || 0) + 1;
    });
    const linhas = [...grupos.values()].map(g => ({ ...g, taxa: pct(g.OCUPADO, g.total) }));
    const tot = linhas.reduce((a, g) => ({ total: a.total + g.total, ocup: a.ocup + g.OCUPADO }), { total: 0, ocup: 0 });
    return {
        titulo: 'Ocupação de leitos', descricao: 'Situação atual dos leitos por andar e ala.',
        colunas: [{ k: 'local', label: 'Andar · Ala' }, { k: 'total', label: 'Leitos' }, { k: 'OCUPADO', label: 'Ocupados' }, { k: 'LIVRE', label: 'Livres' }, { k: 'HIGIENIZACAO', label: 'Higienização' }, { k: 'BLOQUEADO', label: 'Bloqueados' }, { k: 'taxa', label: 'Ocupação' }],
        linhas, resumo: [{ rot: 'Leitos', valor: tot.total }, { rot: 'Ocupados', valor: tot.ocup }, { rot: 'Taxa geral', valor: pct(tot.ocup, tot.total) }]
    };
}

/** Admissões, altas e permanência média no período, por setor de origem. */
function relatorioInternacoes(internacoes, de, ate) {
    const adm = internacoes.filter(i => dentro(i.data_hora_internacao, de, ate));
    const altas = internacoes.filter(i => i.status === 'ALTA' && dentro(i.data_hora_alta, de, ate));
    const perm = altas.length ? Math.round(altas.reduce((a, i) => a + diasEntre(i.data_hora_internacao, i.data_hora_alta), 0) / altas.length * 10) / 10 : 0;
    const origens = new Map();
    adm.forEach(i => origens.set(i.setor_origem, (origens.get(i.setor_origem) || 0) + 1));
    const tiposAlta = new Map();
    altas.forEach(i => { const r = ROTULOS_TIPO_ALTA[i.tipo_alta] || 'Não informado'; tiposAlta.set(r, (tiposAlta.get(r) || 0) + 1); });
    return {
        titulo: 'Internações', descricao: 'Admissões e altas no período, por setor de origem.',
        colunas: [{ k: 'origem', label: 'Setor de origem' }, { k: 'admissoes', label: 'Admissões' }],
        linhas: [...origens.entries()].sort((a, b) => b[1] - a[1]).map(([origem, admissoes]) => ({ origem, admissoes })),
        resumo: [{ rot: 'Admissões', valor: adm.length }, { rot: 'Altas', valor: altas.length }, { rot: 'Permanência média (dias)', valor: perm }, { rot: 'Internados agora', valor: internacoes.filter(i => i.status === 'ATIVA').length }, ...[...tiposAlta.entries()].map(([r, n]) => ({ rot: 'Saídas: ' + r, valor: n }))]
    };
}

/** Exames por setor e tipo no período: solicitados, realizados, cancelados, em fila e tempo médio até a realização. */
function relatorioExames(solicitacoes, de, ate) {
    const sols = solicitacoes.filter(s => dentro(s.data_solicitacao, de, ate));
    const grupos = new Map();
    sols.forEach(s => {
        const k = `${s.setor_destino}|${s.tipo_nome}`;
        if (!grupos.has(k)) grupos.set(k, { setor: s.setor_destino === 'ULTRASSONOGRAFIA' ? 'Ultrassonografia' : 'Imagenologia', exame: s.tipo_nome, solicitados: 0, urgentes: 0, realizados: 0, cancelados: 0, fila: 0, _dias: [] });
        const g = grupos.get(k);
        g.solicitados++;
        if (s.prioridade === 'URGENTE') g.urgentes++;
        if (s.status === 'REALIZADO') { g.realizados++; if (s.realizado) g._dias.push(diasEntre(s.criado_em, s.realizado.em)); }
        else if (s.status === 'CANCELADO') g.cancelados++;
        else g.fila++;
    });
    const linhas = [...grupos.values()].map(g => ({ ...g, espera: g._dias.length ? Math.round(g._dias.reduce((a, b) => a + b, 0) / g._dias.length * 10) / 10 : '—' }));
    const tot = (k) => linhas.reduce((a, g) => a + g[k], 0);
    return {
        titulo: 'Exames', descricao: 'Solicitações por tipo no período. "Espera" = dias entre a solicitação e a realização.',
        colunas: [{ k: 'setor', label: 'Setor' }, { k: 'exame', label: 'Exame' }, { k: 'solicitados', label: 'Solicitados' }, { k: 'urgentes', label: 'Urgentes' }, { k: 'realizados', label: 'Realizados' }, { k: 'cancelados', label: 'Cancelados' }, { k: 'fila', label: 'Em andamento' }, { k: 'espera', label: 'Espera média (dias)' }],
        linhas, resumo: [{ rot: 'Solicitados', valor: tot('solicitados') }, { rot: 'Realizados', valor: tot('realizados') }, { rot: 'Em andamento', valor: tot('fila') }, { rot: 'Cancelados', valor: tot('cancelados') }]
    };
}

/** Autorizações: pendentes, aprovadas, vencidas e as que vencem nos próximos 15 dias. */
function relatorioAutorizacoes(solicitacoes, autorizacoes, hoje) {
    const porSol = new Map(autorizacoes.map(a => [a.solicitacao_id, a]));
    const limite = new Date(new Date(hoje).getTime() + 15 * 86400000).toISOString().slice(0, 10);
    const linhas = solicitacoes.filter(s => s.exige_autorizacao).map(s => {
        const a = porSol.get(s.id);
        const st = statusAutorizacao(a, hoje);
        const vence = st === 'APROVADA' && a.validade_fim <= limite;
        return { protocolo: s.protocolo, paciente: s.paciente_dados.nome, exame: s.tipo_nome, situacao: STATUS_AUTORIZACAO[st] + (vence ? ' (vence em breve)' : ''), apac: (a && a.numero_apac) || '—', validade: a && a.validade_fim ? formatDateBR(a.validade_fim) : '—', executante: a ? `${a.estab_executante_nome} · CNES ${a.estab_executante_cnes}` : '—', _st: st, _vence: vence };
    }).sort((a, b) => (a._st === 'PENDENTE' ? 0 : 1) - (b._st === 'PENDENTE' ? 0 : 1));
    const c = (st) => linhas.filter(l => l._st === st).length;
    return {
        titulo: 'Autorizações', descricao: 'Situação das autorizações (APAC) das solicitações que dependem delas.',
        colunas: [{ k: 'protocolo', label: 'Protocolo' }, { k: 'paciente', label: 'Paciente' }, { k: 'exame', label: 'Exame' }, { k: 'situacao', label: 'Situação' }, { k: 'apac', label: 'Nº APAC' }, { k: 'validade', label: 'Validade' }, { k: 'executante', label: 'Executante' }],
        linhas, resumo: [{ rot: 'Pendentes', valor: c('PENDENTE') }, { rot: 'Aprovadas', valor: c('APROVADA') }, { rot: 'Vencidas', valor: c('VENCIDA') }, { rot: 'Vencem em 15 dias', valor: linhas.filter(l => l._vence).length }]
    };
}

/** Curva ABC pelo valor em estoque (saldo × custo). A = 80% do valor, B = até 95%, C = o resto. Produtos sem custo ficam de fora. */
function relatorioCurvaABC(produtos) {
    const itens = produtos.map(p => ({ codigo: p.barcode, produto: p.material, setor: p.setor, qtd: Number(p.qtd) || 0, custo: Number(p.cadastro && p.cadastro.custo) || 0 }))
        .map(i => ({ ...i, valor: Math.round(i.qtd * i.custo * 100) / 100 })).filter(i => i.valor > 0).sort((a, b) => b.valor - a.valor);
    const total = itens.reduce((a, i) => a + i.valor, 0);
    let acum = 0;
    const linhas = itens.map(i => { const antes = total ? acum / total : 0; acum += i.valor; const p = total ? acum / total : 0; return { ...i, participacao: pct(i.valor, total), acumulado: Math.round(p * 100) + '%', classe: antes < 0.8 ? 'A' : (antes < 0.95 ? 'B' : 'C') }; });
    const semCusto = produtos.filter(p => !(Number(p.cadastro && p.cadastro.custo) > 0)).length;
    return {
        titulo: 'Curva ABC do estoque', descricao: 'Classificação pelo valor em estoque. Produtos sem valor de custo cadastrado não entram.',
        colunas: [{ k: 'classe', label: 'Classe' }, { k: 'codigo', label: 'Código' }, { k: 'produto', label: 'Produto' }, { k: 'setor', label: 'Setor' }, { k: 'qtd', label: 'Saldo' }, { k: 'custo', label: 'Custo (R$)' }, { k: 'valor', label: 'Valor em estoque (R$)' }, { k: 'participacao', label: '% do total' }, { k: 'acumulado', label: '% acumulado' }],
        linhas, resumo: [{ rot: 'Valor total (R$)', valor: Math.round(total * 100) / 100 }, { rot: 'Classe A', valor: linhas.filter(l => l.classe === 'A').length }, { rot: 'Classe B', valor: linhas.filter(l => l.classe === 'B').length }, { rot: 'Classe C', valor: linhas.filter(l => l.classe === 'C').length }, { rot: 'Sem custo', valor: semCusto }]
    };
}

/** Reposição: produtos no ponto de pedido (saldo ≤ mínimo), com a quantidade sugerida até o máximo (ou o dobro do mínimo). */
function relatorioReposicao(produtos) {
    const linhas = produtos.filter(p => Number(p.qtd) <= Number(p.min || 0)).map(p => {
        const max = Number(p.cadastro && p.cadastro.max) || Number(p.min || 0) * 2;
        return { codigo: p.barcode, produto: p.material, setor: p.setor, saldo: Number(p.qtd) || 0, minimo: Number(p.min || 0), maximo: max, sugerido: Math.max(0, max - (Number(p.qtd) || 0)), situacao: Number(p.qtd) <= 0 ? 'Zerado' : 'Abaixo do mínimo' };
    }).sort((a, b) => a.saldo - b.saldo);
    return {
        titulo: 'Reposição de estoque', descricao: 'Produtos no ponto de pedido. Sugestão = máximo (ou o dobro do mínimo, se não houver máximo) menos o saldo.',
        colunas: [{ k: 'situacao', label: 'Situação' }, { k: 'codigo', label: 'Código' }, { k: 'produto', label: 'Produto' }, { k: 'setor', label: 'Setor' }, { k: 'saldo', label: 'Saldo' }, { k: 'minimo', label: 'Mínimo' }, { k: 'maximo', label: 'Máximo' }, { k: 'sugerido', label: 'Sugestão de compra' }],
        linhas, resumo: [{ rot: 'Produtos a repor', valor: linhas.length }, { rot: 'Zerados', valor: linhas.filter(l => l.saldo <= 0).length }]
    };
}

/** Lotes vencidos e a vencer (alerta de DIAS_ALERTA_VALIDADE dias), com saldo. */
function relatorioValidade(produtos, hoje = new Date()) {
    const linhas = [];
    produtos.forEach(p => (p.lotes || []).filter(l => l.quantidade > 0).forEach(l => {
        const st = statusValidade(l.validade, hoje);
        if (st !== 'VENCIDO' && st !== 'A_VENCER') return;
        linhas.push({ situacao: st === 'VENCIDO' ? 'Vencido' : 'A vencer', codigo: p.barcode, produto: p.material, setor: p.setor, lote: l.lote, validade: formatDateBR(l.validade), dias: diasParaVencer(l.validade, hoje), quantidade: l.quantidade });
    }));
    linhas.sort((a, b) => a.dias - b.dias);
    return {
        titulo: 'Validade dos lotes', descricao: `Lotes vencidos e que vencem em até ${DIAS_ALERTA_VALIDADE} dias. Vencidos não podem sair do estoque: use perda/descarte.`,
        colunas: [{ k: 'situacao', label: 'Situação' }, { k: 'codigo', label: 'Código' }, { k: 'produto', label: 'Produto' }, { k: 'setor', label: 'Setor' }, { k: 'lote', label: 'Lote' }, { k: 'validade', label: 'Validade' }, { k: 'dias', label: 'Dias' }, { k: 'quantidade', label: 'Qtd.' }],
        linhas, resumo: [{ rot: 'Lotes vencidos', valor: linhas.filter(l => l.situacao === 'Vencido').length }, { rot: 'A vencer', valor: linhas.filter(l => l.situacao === 'A vencer').length }, { rot: 'Unidades em risco', valor: linhas.reduce((a, l) => a + l.quantidade, 0) }]
    };
}

/** Rastreabilidade de OPME: cada item usado em laudo, com paciente, procedimento, lote e validade. */
function relatorioRastreabilidadeOpme(laudos, de, ate, termo = '') {
    const t = searchKey(termo);
    const linhas = [];
    laudos.filter(l => dentro(l.data, de, ate)).forEach(l => (l.itens_opme || []).forEach(i => {
        const row = { data: formatDateBR(l.data) + (l.hora ? ' ' + l.hora : ''), paciente: l.paciente || '—', cns: l.cartao_sus || '—', procedimento: l.procedimento || l.tipo_laudo || '—', produto: i.descricao || i.material || '—', codigo: i.barcode || '—', lote: i.lote || '—', validade: i.validade && i.validade !== 'N/A' ? formatDateBR(i.validade) : '—', quantidade: i.quantidade, setor: l.setor || '—', responsavel: l.usuario || '—' };
        if (!t || searchKey(Object.values(row).join(' ')).includes(t)) linhas.push(row);
    }));
    return {
        titulo: 'Rastreabilidade de OPME', descricao: 'Do material ao paciente: item, lote, validade, procedimento e responsável, a partir dos laudos.',
        colunas: [{ k: 'data', label: 'Data' }, { k: 'paciente', label: 'Paciente' }, { k: 'cns', label: 'CNS' }, { k: 'procedimento', label: 'Procedimento' }, { k: 'produto', label: 'Material' }, { k: 'codigo', label: 'Código' }, { k: 'lote', label: 'Lote' }, { k: 'validade', label: 'Validade' }, { k: 'quantidade', label: 'Qtd.' }, { k: 'setor', label: 'Setor' }, { k: 'responsavel', label: 'Responsável' }],
        linhas, resumo: [{ rot: 'Itens utilizados', valor: linhas.reduce((a, l) => a + (Number(l.quantidade) || 0), 0) }, { rot: 'Registros', valor: linhas.length }]
    };
}

/**
 * Rastreabilidade por paciente e lote: dispensações da Farmácia, saídas de estoque para paciente e uso em laudos num só relatório.
 * `setores` (lista de ids) limita ao que o perfil enxerga. Registros cancelados continuam na lista, marcados como cancelados.
 */
function relatorioRastreabilidade({ dispensacoes = [], saidas = [], laudos = [], setores = null } = {}, de, ate, termo = '') {
    const t = searchKey(termo);
    const okSetor = (s) => !setores || setores.includes(s);
    const situacao = (r) => (r.ativo === false ? 'Cancelada' : 'Ativa');
    const linhas = [];
    dispensacoes.filter(d => okSetor(d.setor) && dentro(d.criado_em, de, ate)).forEach(d => linhas.push({ ordem: String(d.criado_em), data: formatDateTimeBR(d.criado_em), tipo: 'Dispensação (Farmácia)', paciente: d.paciente_nome || '—', prontuario: d.prontuario || '—', produto: d.produto_desc || '—', lote: d.lote_codigo || '—', quantidade: Number(d.quantidade) || 0, responsavel: d.dispensado_por_nome || '—', situacao: situacao(d) }));
    saidas.filter(s => s.destino === 'Paciente' && okSetor(s.setor) && dentro(s.criado_em, de, ate)).forEach(s => linhas.push({ ordem: String(s.criado_em), data: formatDateTimeBR(s.criado_em), tipo: 'Saída para paciente', paciente: s.destino_detalhe || '—', prontuario: '—', produto: s.produto_desc || '—', lote: s.lote_codigo || '—', quantidade: Number(s.quantidade) || 0, responsavel: s.criado_por || '—', situacao: situacao(s) }));
    laudos.filter(l => okSetor(l.setor) && dentro(dataBr(l.data), de, ate)).forEach(l => (l.itens_opme || []).forEach(i => linhas.push({ ordem: dataBr(l.data) + ' ' + (l.hora || ''), data: formatDateBR(dataBr(l.data)) + (l.hora ? ' ' + l.hora : ''), tipo: 'Uso em laudo', paciente: l.paciente || '—', prontuario: '—', produto: i.descricao || i.material || '—', lote: i.lote || '—', quantidade: Number(i.quantidade) || 0, responsavel: l.usuario || '—', situacao: 'Ativa' })));
    const lista = linhas.filter(l => !t || searchKey(Object.values(l).join(' ')).includes(t)).sort((a, b) => String(b.ordem).localeCompare(String(a.ordem)));
    const ativas = lista.filter(l => l.situacao === 'Ativa');
    return {
        titulo: 'Rastreabilidade por paciente e lote', descricao: 'Do estoque ao paciente: dispensações da Farmácia, saídas para paciente e uso em laudos, com produto, lote, quantidade e responsável. Pesquise pelo nome do paciente ou pelo lote para ver o caminho completo.',
        colunas: [{ k: 'data', label: 'Data' }, { k: 'tipo', label: 'Origem' }, { k: 'paciente', label: 'Paciente' }, { k: 'prontuario', label: 'Prontuário' }, { k: 'produto', label: 'Produto' }, { k: 'lote', label: 'Lote' }, { k: 'quantidade', label: 'Qtd.' }, { k: 'responsavel', label: 'Responsável' }, { k: 'situacao', label: 'Situação' }],
        linhas: lista, resumo: [{ rot: 'Registros', valor: lista.length }, { rot: 'Pacientes', valor: new Set(ativas.map(l => l.paciente)).size }, { rot: 'Lotes', valor: new Set(ativas.map(l => l.lote).filter(x => x !== '—')).size }, { rot: 'Unidades', valor: ativas.reduce((a, l) => a + l.quantidade, 0) }]
    };
}

/** Auditoria: o que foi feito, por quem e quando (consulta ao histórico de alterações). */
function relatorioAuditoria(registros, { entidade = '', usuario = '', de = '', ate = '' } = {}) {
    const u = searchKey(usuario);
    const linhas = registros.filter(r => (!entidade || r.entidade === entidade) && (!u || searchKey(`${r.usuario} ${r.usuario_nome}`).includes(u)) && dentro(r.data_hora, de, ate))
        .map(r => ({ quando: formatDateTimeBR(r.data_hora), usuario: r.usuario_nome || r.usuario, perfil: r.perfil || '—', entidade: r.entidade, registro: r.entidade_id, acao: r.acao, detalhe: [r.motivo, r.depois ? JSON.stringify(r.depois).slice(0, 120) : ''].filter(Boolean).join(' · ') || '—' }));
    return {
        titulo: 'Auditoria', descricao: 'Últimas operações registradas (quem, quando, o quê), incluindo consultas a prontuários e dados pessoais.',
        colunas: [{ k: 'quando', label: 'Quando' }, { k: 'usuario', label: 'Usuário' }, { k: 'perfil', label: 'Perfil' }, { k: 'entidade', label: 'Entidade' }, { k: 'registro', label: 'Registro' }, { k: 'acao', label: 'Ação' }, { k: 'detalhe', label: 'Detalhe' }],
        linhas, resumo: [{ rot: 'Registros', valor: linhas.length }, { rot: 'Consultas a dados', valor: linhas.filter(l => l.acao === 'CONSULTAR').length }]
    };
}

/** Segurança do paciente: ocorrências com a situação da avaliação/notificação do NSP e os dias em aberto. */
function relatorioEventosNsp(ocorrencias, de, ate, hoje = todayISO()) {
    const linhas = ocorrencias.filter(o => dentro(o.data_ocorrencia, de, ate)).map(o => {
        const st = o.nsp_status || 'AVALIAR';
        return { protocolo: o.protocolo, data: formatDateBR(o.data_ocorrencia), setor: o.setor_origem, classificacao: rotuloClassificacao(o.classificacao), o_que: o.o_que_aconteceu, nsp: STATUS_NSP[st], notificacao: o.nsp_protocolo ? `${o.nsp_protocolo} (${formatDateBR(o.nsp_data)})` : '—', dias: st === 'AVALIAR' ? Math.max(0, Math.round((new Date(hoje) - new Date(o.data_ocorrencia)) / 86400000)) : '—', _st: st };
    }).sort((a, b) => (a._st === 'AVALIAR' ? 0 : 1) - (b._st === 'AVALIAR' ? 0 : 1));
    const c = (s) => linhas.filter(l => l._st === s).length;
    return {
        titulo: 'Eventos e segurança do paciente', descricao: 'Ocorrências da Emergência e a avaliação do Núcleo de Segurança do Paciente. "Dias" = tempo sem avaliação. Prazos de notificação seguem a norma vigente da Anvisa, a confirmar pelo NSP.',
        colunas: [{ k: 'protocolo', label: 'Protocolo' }, { k: 'data', label: 'Data' }, { k: 'setor', label: 'Setor' }, { k: 'classificacao', label: 'Classificação' }, { k: 'o_que', label: 'O que aconteceu' }, { k: 'nsp', label: 'Avaliação do NSP' }, { k: 'notificacao', label: 'Notificação' }, { k: 'dias', label: 'Dias em aberto' }],
        linhas, resumo: [{ rot: 'Ocorrências', valor: linhas.length }, { rot: 'A avaliar', valor: c('AVALIAR') }, { rot: 'Notificadas', valor: c('NOTIFICADA') }, { rot: 'Não é evento', valor: c('NAO_E_EVENTO') }]
    };
}

// ---------------- Relatórios das demais áreas (consignado, portaria, procedimentos, consumo, compras, perdas, permissões) ----------------

const diaDe = (iso) => String(iso || '').slice(0, 10);
const dataBr = (s) => { const m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : diaDe(s); };
const ehConsig = (p) => Boolean(p.cadastro && p.cadastro.opme && p.cadastro.opme.tipo_material === 'Consignado');

/** Estoque consignado: lotes de produtos marcados como consignados, com o fornecedor. */
function relatorioConsignadoEstoque(produtos, nomeFornecedor = (id) => id) {
    const linhas = [];
    produtos.filter(ehConsig).forEach(p => (p.lotes || []).filter(l => l.quantidade > 0).forEach(l => linhas.push({
        fornecedor: nomeFornecedor(p.cadastro.opme.fornecedor_id) || '—', codigo: p.barcode, produto: p.material, setor: p.setor, lote: l.lote,
        validade: l.validade && l.validade !== 'N/A' ? formatDateBR(l.validade) : '—', quantidade: l.quantidade, situacao: ({ VENCIDO: 'Vencido', A_VENCER: 'A vencer', OK: 'Válido', SEM_VALIDADE: 'Sem validade' })[statusValidade(l.validade)] })));
    linhas.sort((a, b) => String(a.fornecedor).localeCompare(String(b.fornecedor)) || String(a.produto).localeCompare(String(b.produto)));
    return {
        titulo: 'Estoque consignado', descricao: 'Material de terceiros em estoque (produtos marcados como "Consignado" na aba OPME do cadastro).',
        colunas: [{ k: 'fornecedor', label: 'Fornecedor' }, { k: 'codigo', label: 'Código' }, { k: 'produto', label: 'Produto' }, { k: 'setor', label: 'Setor' }, { k: 'lote', label: 'Lote' }, { k: 'validade', label: 'Validade' }, { k: 'quantidade', label: 'Qtd.' }, { k: 'situacao', label: 'Situação do lote' }],
        linhas, resumo: [{ rot: 'Lotes', valor: linhas.length }, { rot: 'Unidades', valor: linhas.reduce((a, l) => a + l.quantidade, 0) }, { rot: 'Fornecedores', valor: new Set(linhas.map(l => l.fornecedor)).size }]
    };
}

/** Utilizações de material consignado: itens de laudo cujo produto é consignado (base para o acerto com o fornecedor). */
function relatorioConsignadoUso(laudos, produtos, nomeFornecedor, de, ate) {
    const consig = new Map(produtos.filter(ehConsig).map(p => [`${p.setorId || p.setor}|${p.barcode}`, p]));
    const porCodigo = new Map(produtos.filter(ehConsig).map(p => [p.barcode, p]));
    const linhas = [];
    laudos.filter(l => dentro(l.data, de, ate)).forEach(l => (l.itens_opme || []).forEach(i => {
        const p = porCodigo.get(i.barcode);
        if (!p) return;
        linhas.push({ data: formatDateBR(l.data), paciente: l.paciente || '—', procedimento: l.procedimento || l.tipo_laudo || '—', fornecedor: nomeFornecedor(p.cadastro.opme.fornecedor_id) || '—', produto: p.material, lote: i.lote || '—', quantidade: Number(i.quantidade) || 0, responsavel: l.usuario || '—' });
    }));
    return {
        titulo: 'Utilizações de consignado', descricao: 'Material consignado usado em procedimentos, por fornecedor e lote (base para o acerto de contas).',
        colunas: [{ k: 'data', label: 'Data' }, { k: 'fornecedor', label: 'Fornecedor' }, { k: 'produto', label: 'Material' }, { k: 'lote', label: 'Lote' }, { k: 'quantidade', label: 'Qtd.' }, { k: 'paciente', label: 'Paciente' }, { k: 'procedimento', label: 'Procedimento' }, { k: 'responsavel', label: 'Responsável' }],
        linhas, resumo: [{ rot: 'Utilizações', valor: linhas.length }, { rot: 'Unidades usadas', valor: linhas.reduce((a, l) => a + l.quantidade, 0) }]
    };
}

/** Visitas da portaria. tipo: 'VISITANTE' (todos menos acompanhantes), 'ACOMPANHANTE' ou '' (histórico completo). */
function relatorioPortaria(visitas, tipo, de, ate, termo = '') {
    const t = searchKey(termo);
    const ehAcomp = (v) => /acompanhante/i.test(v.tipo || '');
    const linhas = visitas.filter(v => (tipo === 'ACOMPANHANTE' ? ehAcomp(v) : (tipo === 'VISITANTE' ? !ehAcomp(v) : true)) && dentro(v.hora_entrada, de, ate))
        .sort((a, b) => String(b.hora_entrada).localeCompare(String(a.hora_entrada)))
        .map(v => ({ nome: v.nome, documento: v.documento ? maskCPF(onlyDigits(v.documento)) : '—', tipo: v.tipo || 'Visita', destino: [v.setor, v.destino].filter(Boolean).join(' · ') || '—', entrada: formatDateTimeBR(v.hora_entrada), saida: v.hora_saida ? formatDateTimeBR(v.hora_saida) : 'Dentro', porteiro: v.porteiro_entrada || '—' }))
        .filter(l => !t || searchKey(Object.values(l).join(' ')).includes(t));
    return {
        titulo: tipo === 'ACOMPANHANTE' ? 'Acompanhantes' : (tipo === 'VISITANTE' ? 'Visitantes' : 'Histórico da portaria'),
        descricao: 'Entradas e saídas registradas na portaria. Documentos aparecem mascarados (LGPD).',
        colunas: [{ k: 'nome', label: 'Nome' }, { k: 'documento', label: 'Documento' }, { k: 'tipo', label: 'Tipo' }, { k: 'destino', label: 'Destino' }, { k: 'entrada', label: 'Entrada' }, { k: 'saida', label: 'Saída' }, { k: 'porteiro', label: 'Porteiro' }],
        linhas, resumo: [{ rot: 'Registros', valor: linhas.length }, { rot: 'Ainda dentro', valor: linhas.filter(l => l.saida === 'Dentro').length }]
    };
}

/** Mapa cirúrgico: procedimentos agendados por dia. */
function relatorioMapaCirurgico(agendados, de, ate, termo = '') {
    const t = searchKey(termo);
    const linhas = agendados.filter(a => dentro(a.data, de, ate)).sort((a, b) => String(a.data).localeCompare(String(b.data)))
        .map(a => ({ data: a.data ? formatDateBR(a.data) : '—', paciente: a.pacienteNome || '—', cns: a.cartaoSus || '—', exame: a.exame || '—', procedimento: a.procedimento || '—' }))
        .filter(l => !t || searchKey(Object.values(l).join(' ')).includes(t));
    const dias = new Set(linhas.map(l => l.data));
    return {
        titulo: 'Mapa cirúrgico', descricao: 'Procedimentos agendados, por data.',
        colunas: [{ k: 'data', label: 'Data' }, { k: 'paciente', label: 'Paciente' }, { k: 'cns', label: 'CNS' }, { k: 'exame', label: 'Exame' }, { k: 'procedimento', label: 'Procedimento' }],
        linhas, resumo: [{ rot: 'Procedimentos', valor: linhas.length }, { rot: 'Dias com agenda', valor: dias.size }]
    };
}

/** Consumo: tudo que saiu do estoque no período (saídas, consumo em sala, laudos), por produto. */
function relatorioConsumo(historico, saidas, laudos, de, ate) {
    const mapa = new Map();
    const soma = (codigo, nome, qtd, tipo) => { const k = String(codigo); if (!mapa.has(k)) mapa.set(k, { codigo: k, produto: nome, saidas: 0, sala: 0, laudos: 0 }); mapa.get(k)[tipo] += Number(qtd) || 0; };
    historico.filter(h => h.action === 'CONSU_SALA' && dentro(dataBr(h.date), de, ate)).forEach(h => soma(h.barcode, h.product || h.product_desc, h.quantity ?? h.qty, 'sala'));
    saidas.filter(s => dentro(s.criado_em, de, ate)).forEach(s => soma(String(s.produto).split('|')[1], s.produto_desc, s.quantidade, 'saidas'));
    laudos.filter(l => dentro(l.data, de, ate)).forEach(l => (l.itens_opme || []).forEach(i => soma(i.barcode, i.descricao || i.material, i.quantidade, 'laudos')));
    const linhas = [...mapa.values()].map(l => ({ ...l, total: l.saidas + l.sala + l.laudos })).sort((a, b) => b.total - a.total);
    return {
        titulo: 'Consumo de materiais', descricao: 'Saídas, consumo em sala e uso em laudos, por produto, no período.',
        colunas: [{ k: 'codigo', label: 'Código' }, { k: 'produto', label: 'Produto' }, { k: 'saidas', label: 'Saídas' }, { k: 'sala', label: 'Em sala' }, { k: 'laudos', label: 'Em laudos' }, { k: 'total', label: 'Total' }],
        linhas, resumo: [{ rot: 'Produtos', valor: linhas.length }, { rot: 'Unidades consumidas', valor: linhas.reduce((a, l) => a + l.total, 0) }]
    };
}

/** Compras: pedidos e recebimentos no período, por fornecedor. */
function relatorioCompras(pedidos, recebimentos, nomeFornecedor, de, ate) {
    const peds = pedidos.filter(p => dentro(p.criado_em, de, ate));
    const recs = recebimentos.filter(r => dentro(r.data_recebimento, de, ate));
    const mapa = new Map();
    const get = (id) => { const k = nomeFornecedor(id) || '—'; if (!mapa.has(k)) mapa.set(k, { fornecedor: k, pedidos: 0, valor_pedido: 0, recebidos: 0, abertos: 0, valor_recebido: 0 }); return mapa.get(k); };
    peds.forEach(p => { const g = get(p.fornecedor_id); g.pedidos++; g.valor_pedido += Number(p.valor_total) || 0; if (p.situacao === 'Recebido') g.recebidos++; else if (p.situacao !== 'Cancelado') g.abertos++; });
    const porPedido = new Map(pedidos.map(p => [p.id, p]));
    recs.forEach(r => { const p = porPedido.get(r.pedido); if (p) get(p.fornecedor_id).valor_recebido += Number(r.valor_total) || 0; });
    const linhas = [...mapa.values()].map(l => ({ ...l, valor_pedido: formatMoney(l.valor_pedido), valor_recebido: formatMoney(l.valor_recebido) }));
    return {
        titulo: 'Compras', descricao: 'Pedidos e recebimentos por fornecedor no período.',
        colunas: [{ k: 'fornecedor', label: 'Fornecedor' }, { k: 'pedidos', label: 'Pedidos' }, { k: 'valor_pedido', label: 'Valor pedido' }, { k: 'recebidos', label: 'Recebidos' }, { k: 'abertos', label: 'Em aberto' }, { k: 'valor_recebido', label: 'Valor recebido' }],
        linhas, resumo: [{ rot: 'Pedidos', valor: peds.length }, { rot: 'Recebimentos', valor: recs.length }, { rot: 'Em aberto', valor: peds.filter(p => !['Recebido', 'Cancelado'].includes(p.situacao)).length }]
    };
}

/** Procedimentos: agendados, não realizados (com o motivo) e laudos emitidos, no período. */
function relatorioProcedimentos(agendados, naoRealizados, laudos, de, ate) {
    const ag = agendados.filter(a => dentro(a.data, de, ate));
    const nr = naoRealizados.filter(n => dentro(n.data, de, ate));
    const lau = laudos.filter(l => dentro(l.data, de, ate));
    const motivos = new Map();
    nr.forEach(n => motivos.set(n.motivo || 'Sem motivo', (motivos.get(n.motivo || 'Sem motivo') || 0) + 1));
    const linhas = [...motivos.entries()].sort((a, b) => b[1] - a[1]).map(([motivo, quantidade]) => ({ motivo, quantidade }));
    return {
        titulo: 'Procedimentos', descricao: 'Agendados, não realizados (por motivo) e laudos emitidos no período.',
        colunas: [{ k: 'motivo', label: 'Motivo do não realizado' }, { k: 'quantidade', label: 'Ocorrências' }],
        linhas, resumo: [{ rot: 'Agendados', valor: ag.length }, { rot: 'Não realizados', valor: nr.length }, { rot: 'Laudos emitidos', valor: lau.length }]
    };
}

/** Perdas: registros de perda no período, por motivo e produto. */
function relatorioPerdas(perdas, de, ate) {
    const linhas = perdas.filter(p => dentro(p.criado_em, de, ate)).sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)))
        .map(p => ({ data: formatDateTimeBR(p.criado_em), produto: p.produto_desc, lote: p.lote_codigo, quantidade: p.quantidade, motivo: p.motivo, descricao: p.descricao || '—', responsavel: p.criado_por }));
    const porMotivo = new Map();
    linhas.forEach(l => porMotivo.set(l.motivo, (porMotivo.get(l.motivo) || 0) + l.quantidade));
    return {
        titulo: 'Perdas', descricao: 'Material perdido no período, com motivo e responsável.',
        colunas: [{ k: 'data', label: 'Data' }, { k: 'produto', label: 'Produto' }, { k: 'lote', label: 'Lote' }, { k: 'quantidade', label: 'Qtd.' }, { k: 'motivo', label: 'Motivo' }, { k: 'descricao', label: 'Descrição' }, { k: 'responsavel', label: 'Responsável' }],
        linhas, resumo: [{ rot: 'Registros', valor: linhas.length }, { rot: 'Unidades perdidas', valor: linhas.reduce((a, l) => a + l.quantidade, 0) }, ...[...porMotivo.entries()].slice(0, 3).map(([m, q]) => ({ rot: m, valor: q }))]
    };
}

/** Permissões: quais telas do menu cada perfil enxerga (calculado com as mesmas regras que montam o menu). */
function relatorioPermissoes() {
    const original = state.currentUser;
    const perfis = ASSIGNABLE_ROLES;
    const telas = [];
    walkMenuTree(MENU_TREE, (node, trilha) => { if (node.module && !node.soon) telas.push({ node, trilha }); });
    try {
        const linhas = telas.map(({ node, trilha }) => {
            const l = { tela: [...trilha, node.label].join(' › ') };
            perfis.forEach(r => { state.currentUser = { username: '_', role: r, name: '_' }; let ok = false; try { ok = !node.access || node.access(); } catch (e) { ok = false; } l[r] = ok ? 'Sim' : '—'; });
            return l;
        });
        return {
            titulo: 'Permissões por perfil', descricao: 'Quem acessa cada tela. As permissões são definidas no código (core/permissions.js e data/menu.js); esta tabela mostra o resultado.',
            colunas: [{ k: 'tela', label: 'Tela' }, ...perfis.map(r => ({ k: r, label: getRoleLabel(r) }))],
            linhas, resumo: [{ rot: 'Telas', valor: linhas.length }, { rot: 'Perfis', valor: perfis.length }]
        };
    } finally { state.currentUser = original; }
}

/** CSV para Excel (separador ponto e vírgula, com BOM para acentos). */
function relatorioParaCsv(rel) {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    return '﻿' + [rel.colunas.map(c => esc(c.label)).join(';'), ...rel.linhas.map(l => rel.colunas.map(c => esc(l[c.k])).join(';'))].join('\r\n');
}

// ============ Apoio e infraestrutura (Etapa 9) ============
// Relatórios de manutenção, transporte, rouparia, resíduos e voluntariado. Nenhum mostra nome de paciente.

const apoioNumBr = (n) => (n === null || n === undefined ? '—' : String(n).replace('.', ','));

/** Ordens de serviço do período: por tipo e prioridade, com tempos médios (da abertura até assumir e até concluir). */
function relatorioManutencaoTela(osLista, de, ate) {
    const ind = indicadoresManutencao(osLista, de, ate);
    const lista = (osLista || []).filter(o => (!de || o.dia >= de) && (!ate || o.dia <= ate)).sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
    return {
        titulo: 'Manutenção e equipamentos',
        descricao: 'Ordens de serviço abertas no período (a tela carrega as abertas de qualquer data e as dos últimos 90 dias). Não há prazo de atendimento definido pelo hospital: os tempos são só informativos.',
        colunas: [{ k: 'dia', label: 'Dia' }, { k: 'protocolo', label: 'OS' }, { k: 'tipo', label: 'Tipo' }, { k: 'prioridade', label: 'Prioridade' }, { k: 'objeto', label: 'Equipamento ou local' }, { k: 'situacao', label: 'Situação' }, { k: 'horas', label: 'Horas até concluir' }],
        linhas: lista.map(o => ({ dia: formatDateBR(o.dia), protocolo: o.protocolo, tipo: TIPOS_OS[o.tipo] || o.tipo, prioridade: PRIORIDADES_OS[o.prioridade] || o.prioridade,
            objeto: o.equipamento_nome ? `${o.equipamento_nome}${o.patrimonio ? ' (' + o.patrimonio + ')' : ''}` : (o.local || '—'), situacao: SITUACOES_OS[o.status] || o.status,
            horas: o.status === 'CONCLUIDA' && o.concluido_em ? apoioNumBr(Math.round((new Date(o.concluido_em) - new Date(o.criado_em)) / 360000) / 10) : '—' })),
        resumo: [{ rot: 'OS no período', valor: ind.abertas_no_periodo }, { rot: 'Em aberto agora', valor: ind.em_aberto }, { rot: 'Concluídas', valor: ind.concluidas }, { rot: 'Canceladas', valor: ind.canceladas },
            { rot: 'Média até assumir (h)', valor: apoioNumBr(ind.horas_ate_assumir) }, { rot: 'Média até concluir (h)', valor: apoioNumBr(ind.horas_ate_concluir) }]
    };
}

/** Solicitações de transporte do período, com tempos médios. Não lista o nome do paciente. */
function relatorioTransporteTela(lista, de, ate) {
    const ind = indicadoresTransporte(lista, de, ate);
    const itens = (lista || []).filter(t => (!de || t.dia >= de) && (!ate || t.dia <= ate)).sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
    return {
        titulo: 'Transporte',
        descricao: 'Solicitações dos últimos 7 dias (a tela carrega só esse período, mais as ainda abertas). Não identifica o paciente e não há prazo de atendimento definido.',
        colunas: [{ k: 'dia', label: 'Dia' }, { k: 'protocolo', label: 'Protocolo' }, { k: 'tipo', label: 'Tipo' }, { k: 'origem', label: 'Origem' }, { k: 'destino', label: 'Destino' }, { k: 'prioridade', label: 'Prioridade' }, { k: 'situacao', label: 'Situação' }],
        linhas: itens.map(t => ({ dia: formatDateBR(t.dia), protocolo: t.protocolo, tipo: TIPOS_TRANSPORTE[t.tipo] || t.tipo, origem: t.origem, destino: t.destino, prioridade: PRIORIDADES_TRANSPORTE[t.prioridade] || t.prioridade || '—', situacao: SITUACOES_TRANSPORTE[t.status] || t.status })),
        resumo: [{ rot: 'Solicitações', valor: ind.total }, { rot: 'Em aberto', valor: ind.em_aberto }, { rot: 'Concluídos', valor: ind.concluidos }, { rot: 'Cancelados', valor: ind.cancelados },
            { rot: 'Média até aceitar (min)', valor: apoioNumBr(ind.min_ate_aceitar) }, { rot: 'Média em transporte (min)', valor: apoioNumBr(ind.min_em_transporte) }]
    };
}

/** Rouparia por setor e peça: coletadas, entregues, baixas e diferença. Registros anulados não entram. */
function relatorioRoupariaTela(lista, de, ate) {
    const r = resumoRouparia(lista, de, ate);
    return {
        titulo: 'Rouparia e lavanderia',
        descricao: 'Movimentos dos últimos 30 dias (a tela carrega só esse período). A diferença é coletadas menos entregues: não considera estoque nem enxoval mínimo.',
        colunas: [{ k: 'setor', label: 'Setor' }, { k: 'peca', label: 'Peça' }, { k: 'coletadas', label: 'Coletadas' }, { k: 'entregues', label: 'Entregues' }, { k: 'diferenca', label: 'Diferença' }, { k: 'baixas', label: 'Baixas' }, { k: 'kg_coletado', label: 'Kg coletado' }, { k: 'kg_entregue', label: 'Kg entregue' }],
        linhas: r.linhas.map(l => ({ setor: l.setor, peca: l.peca_rotulo, coletadas: l.coletadas, entregues: l.entregues, diferenca: l.diferenca, baixas: l.baixas, kg_coletado: apoioNumBr(l.kg_coletado), kg_entregue: apoioNumBr(l.kg_entregue) })),
        resumo: [{ rot: 'Peças coletadas', valor: r.total.coletadas }, { rot: 'Peças entregues', valor: r.total.entregues }, { rot: 'Baixas', valor: r.total.baixas }, { rot: 'Kg coletado', valor: apoioNumBr(r.total.kg_coletado) }, { rot: 'Kg entregue', valor: apoioNumBr(r.total.kg_entregue) }]
    };
}

/** Resíduos por setor e grupo (kg). Registros anulados não entram. */
function relatorioResiduosTela(lista, de, ate) {
    const r = resumoResiduos(lista, de, ate);
    const grupos = Object.keys(GRUPOS_RESIDUO);
    return {
        titulo: 'Resíduos por grupo e setor',
        descricao: 'Pesagens dos últimos 30 dias (a tela carrega só esse período), em kg. Os grupos são uma lista de apoio: confira com o PGRSS do hospital.',
        colunas: [{ k: 'setor', label: 'Setor' }, { k: 'registros', label: 'Registros' }, ...grupos.map(g => ({ k: 'g_' + g, label: 'Grupo ' + g + ' (kg)' })), { k: 'total', label: 'Total (kg)' }],
        linhas: r.setores.map(s => { const l = { setor: s.setor, registros: s.registros, total: apoioNumBr(s.total_kg) }; grupos.forEach(g => { l['g_' + g] = apoioNumBr(s[g] || 0); }); return l; }),
        resumo: [{ rot: 'Registros', valor: r.registros }, { rot: 'Total (kg)', valor: apoioNumBr(r.total_kg) }, ...grupos.map(g => ({ rot: 'Grupo ' + g + ' (kg)', valor: apoioNumBr(r.por_grupo[g] || 0) }))]
    };
}

/** Horas de voluntariado por pessoa no período (só presenças encerradas). */
function relatorioVoluntariadoTela(presencas, de, ate) {
    const horas = horasDosVoluntarios(presencas, de, ate);
    const total = horas.reduce((s, h) => s + h.minutos, 0);
    return {
        titulo: 'Voluntariado e horas',
        descricao: 'Presenças encerradas dos últimos 60 dias (a tela carrega só esse período). Presença sem saída registrada não conta horas.',
        colunas: [{ k: 'nome', label: 'Voluntário' }, { k: 'area', label: 'Área' }, { k: 'presencas', label: 'Presenças' }, { k: 'horas', label: 'Horas' }],
        linhas: horas.map(h => ({ nome: h.nome, area: AREAS_VOLUNTARIADO[h.area] || h.area, presencas: h.presencas, horas: formatarMinutos(h.minutos) })),
        resumo: [{ rot: 'Voluntários com horas', valor: horas.length }, { rot: 'Presenças', valor: horas.reduce((s, h) => s + h.presencas, 0) }, { rot: 'Total de horas', valor: formatarMinutos(total) }]
    };
}

// ============ Gestão (Etapa 10) ============
// Relatórios de ouvidoria, qualidade e ensino e pesquisa. O da ouvidoria nunca traz o nome de quem se manifestou.

/** Manifestações do período (data do recebimento). Sem identidade. */
function relatorioOuvidoriaTela(lista, de, ate, hoje = todayISO()) {
    const ind = indicadoresOuvidoria(lista, de, ate, hoje);
    const itens = (lista || []).filter(m => (!de || m.dia >= de) && (!ate || m.dia <= ate)).sort((a, b) => String(b.recebida_em).localeCompare(String(a.recebida_em)));
    return {
        titulo: 'Ouvidoria',
        descricao: 'Manifestações recebidas no período (a tela carrega as abertas de qualquer data e as dos últimos 180 dias). Sem identificação de quem se manifestou. O prazo é o digitado pela ouvidoria: o sistema não aplica prazo legal.',
        colunas: [{ k: 'dia', label: 'Recebida em' }, { k: 'protocolo', label: 'Protocolo' }, { k: 'tipo', label: 'Tipo' }, { k: 'canal', label: 'Canal' }, { k: 'setor', label: 'Setor envolvido' }, { k: 'situacao', label: 'Situação' }, { k: 'prazo', label: 'Prazo de resposta' }, { k: 'dias', label: 'Dias até a 1ª resposta' }],
        linhas: itens.map(m => ({ dia: formatDateBR(m.dia), protocolo: m.protocolo, tipo: TIPOS_MANIFESTACAO[m.tipo] || m.tipo, canal: CANAIS_OUVIDORIA[m.canal] || m.canal, setor: m.setor_envolvido || '—', situacao: SITUACOES_OUVIDORIA[m.status] || m.status,
            prazo: m.prazo_resposta ? formatDateBR(m.prazo_resposta) : '—', dias: (m.respostas || []).length ? apoioNumBr(gestaoDiasEntre(m.recebida_em, m.respostas[0].em)) : '—' })),
        resumo: [{ rot: 'No período', valor: ind.total }, { rot: 'Em aberto agora', valor: ind.em_aberto }, { rot: 'Com prazo vencido', valor: ind.vencidas }, { rot: 'Concluídas', valor: ind.concluidas }, { rot: 'Arquivadas', valor: ind.arquivadas },
            { rot: 'Média até a 1ª resposta (dias)', valor: apoioNumBr(ind.dias_ate_responder) }]
    };
}

/** Não conformidades do período, com o número de ações abertas de cada uma. */
function relatorioQualidadeTela({ ncs = [], acoes = [], docs = [] } = {}, de, ate, hoje = todayISO()) {
    const ind = indicadoresQualidade({ ncs, acoes, docs }, de, ate, hoje);
    const itens = ncs.filter(n => (!de || n.dia >= de) && (!ate || n.dia <= ate)).sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
    return {
        titulo: 'Qualidade',
        descricao: 'Não conformidades registradas no período (a tela carrega as abertas de qualquer data e as dos últimos 180 dias). Ações e documentos entram no resumo pela situação de hoje.',
        colunas: [{ k: 'dia', label: 'Detectada em' }, { k: 'protocolo', label: 'Protocolo' }, { k: 'origem', label: 'Origem' }, { k: 'setor', label: 'Setor' }, { k: 'situacao', label: 'Situação' }, { k: 'abertas', label: 'Ações abertas' }, { k: 'dias', label: 'Dias até concluir' }],
        linhas: itens.map(n => ({ dia: formatDateBR(n.detectada_em), protocolo: n.protocolo, origem: ORIGENS_NC[n.origem] || n.origem, setor: n.setor, situacao: SITUACOES_NC[n.status] || n.status,
            abertas: acoes.filter(a => a.nc_id === n.id && acaoAberta(a)).length, dias: n.status === 'CONCLUIDA' && n.concluido_em ? apoioNumBr(gestaoDiasEntre(n.criado_em, n.concluido_em)) : '—' })),
        resumo: [{ rot: 'Não conformidades no período', valor: ind.nc_no_periodo }, { rot: 'Em aberto agora', valor: ind.nc_em_aberto }, { rot: 'Concluídas', valor: ind.nc_concluidas }, { rot: 'Ações abertas', valor: ind.acoes_abertas },
            { rot: 'Ações atrasadas', valor: ind.acoes_atrasadas }, { rot: 'Documentos vigentes', valor: ind.docs_vigentes }, { rot: 'Documentos com revisão vencida', valor: ind.docs_revisao_vencida }]
    };
}

/** Atividades de ensino e pesquisa que começam no período. Sem nomes de participantes. */
function relatorioEnsinoTela(lista, de, ate) {
    const ind = indicadoresEnsino(lista, de, ate);
    const itens = (lista || []).filter(a => (!de || a.inicio >= de) && (!ate || a.inicio <= ate)).sort((a, b) => String(b.inicio).localeCompare(String(a.inicio)));
    return {
        titulo: 'Ensino e pesquisa',
        descricao: 'Atividades com início no período (a tela carrega as em aberto e as dos últimos 365 dias). Não lista participantes.',
        colunas: [{ k: 'inicio', label: 'Início' }, { k: 'protocolo', label: 'Protocolo' }, { k: 'tipo', label: 'Tipo' }, { k: 'titulo', label: 'Título' }, { k: 'setor', label: 'Setor' }, { k: 'participantes', label: 'Participantes' }, { k: 'situacao', label: 'Situação' }, { k: 'parecer', label: 'Parecer do comitê de ética' }],
        linhas: itens.map(a => ({ inicio: formatDateBR(a.inicio), protocolo: a.protocolo, tipo: TIPOS_ENSINO[a.tipo] || a.tipo, titulo: a.titulo, setor: a.setor, participantes: a.participantes === null || a.participantes === undefined ? '—' : a.participantes,
            situacao: SITUACOES_ENSINO[a.status] || a.status, parecer: a.tipo === 'PESQUISA' ? (a.parecer_cep || 'Não informado') : '—' })),
        resumo: [{ rot: 'Atividades no período', valor: ind.total }, { rot: 'Planejadas ou em andamento agora', valor: ind.em_aberto }, { rot: 'Concluídas', valor: ind.concluidas }, { rot: 'Canceladas', valor: ind.canceladas },
            { rot: 'Participantes', valor: ind.participantes }, { rot: 'Pesquisas sem nº do parecer', valor: ind.pesquisas_sem_parecer }]
    };
}

// ---------- Farmácia (#50) ----------
/** Dispensações da Farmácia no período, por produto. Canceladas aparecem à parte e não entram nas unidades. */
function relatorioFarmaciaDispensacoes(dispensacoes, de, ate, termo = '') {
    const t = searchKey(termo);
    const lista = (dispensacoes || []).filter(d => dentro(d.criado_em, de, ate) && (!t || searchKey(`${d.produto_desc} ${d.paciente_nome} ${d.lote_codigo} ${d.codigo}`).includes(t)));
    const ativas = lista.filter(d => d.ativo !== false);
    const porProduto = new Map();
    ativas.forEach(d => {
        const k = d.produto_desc || '—';
        const x = porProduto.get(k) || { produto: k, dispensacoes: 0, unidades: 0, controle: 0, pacientes: new Set(), lotes: new Set() };
        x.dispensacoes += 1; x.unidades += Number(d.quantidade) || 0; if (d.controle === 'Controle especial') x.controle += 1;
        x.pacientes.add(d.paciente_nome); if (d.lote_codigo) x.lotes.add(d.lote_codigo);
        porProduto.set(k, x);
    });
    const linhas = [...porProduto.values()].sort((a, b) => b.unidades - a.unidades).map(x => ({ produto: x.produto, dispensacoes: x.dispensacoes, unidades: x.unidades, controle: x.controle, pacientes: x.pacientes.size, lotes: x.lotes.size }));
    return {
        titulo: 'Dispensações da Farmácia', descricao: 'Medicamentos dispensados a pacientes internados no período, somados por produto. Dispensação cancelada não conta nas unidades. Sem "De" e "Até" mostra todas as carregadas.',
        colunas: [{ k: 'produto', label: 'Produto' }, { k: 'dispensacoes', label: 'Dispensações' }, { k: 'unidades', label: 'Unidades' }, { k: 'controle', label: 'Controle especial' }, { k: 'pacientes', label: 'Pacientes' }, { k: 'lotes', label: 'Lotes' }],
        linhas, resumo: [{ rot: 'Dispensações', valor: ativas.length }, { rot: 'Unidades', valor: ativas.reduce((a, d) => a + (Number(d.quantidade) || 0), 0) }, { rot: 'Controle especial', valor: ativas.filter(d => d.controle === 'Controle especial').length }, { rot: 'Canceladas', valor: lista.length - ativas.length }]
    };
}

/** Requisições das unidades à Farmácia: situação, prioridade e itens pedidos. A requisição não baixa estoque. */
function relatorioFarmaciaRequisicoes(requisicoes, de, ate, termo = '') {
    const t = searchKey(termo);
    const lista = (requisicoes || []).filter(r => dentro(r.criado_em, de, ate) && (!t || searchKey(`${r.codigo} ${r.unidade} ${r.solicitante_nome}`).includes(t)))
        .sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
    const cont = (f) => lista.filter(f).length;
    return {
        titulo: 'Requisições à Farmácia', descricao: 'Pedidos das unidades à Farmácia no período, com situação e prioridade. A requisição não baixa estoque: a saída só acontece na dispensação ou na saída registrada.',
        colunas: [{ k: 'data', label: 'Data' }, { k: 'codigo', label: 'Código' }, { k: 'unidade', label: 'Unidade' }, { k: 'prioridade', label: 'Prioridade' }, { k: 'situacao', label: 'Situação' }, { k: 'itens', label: 'Itens' }, { k: 'solicitante', label: 'Solicitante' }],
        linhas: lista.map(r => ({ data: formatDateTimeBR(r.criado_em), codigo: r.codigo, unidade: r.unidade, prioridade: r.prioridade, situacao: r.situacao, itens: (r.itens || []).length, solicitante: r.solicitante_nome || '—' })),
        resumo: [{ rot: 'Requisições', valor: lista.length }, { rot: 'Solicitadas', valor: cont(r => r.situacao === 'Solicitada') }, { rot: 'Atendidas', valor: cont(r => r.situacao === 'Atendida') }, { rot: 'Urgentes', valor: cont(r => r.prioridade !== 'Rotina') }]
    };
}
