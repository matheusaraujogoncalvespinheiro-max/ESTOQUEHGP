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
    return {
        titulo: 'Internações', descricao: 'Admissões e altas no período, por setor de origem.',
        colunas: [{ k: 'origem', label: 'Setor de origem' }, { k: 'admissoes', label: 'Admissões' }],
        linhas: [...origens.entries()].sort((a, b) => b[1] - a[1]).map(([origem, admissoes]) => ({ origem, admissoes })),
        resumo: [{ rot: 'Admissões', valor: adm.length }, { rot: 'Altas', valor: altas.length }, { rot: 'Permanência média (dias)', valor: perm }, { rot: 'Internados agora', valor: internacoes.filter(i => i.status === 'ATIVA').length }]
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
