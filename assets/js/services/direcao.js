// Painel da Direção (Etapa 10): indicadores do hospital num período, com o critério de cada número escrito ao lado.
//
// O QUE É: junta dados que já existem (atendimentos, internações, leitos, ordens de serviço, ouvidoria, qualidade, ensino) e mostra totais e
// tempos médios. Cada indicador traz a fonte e o critério (como foi contado), para ninguém interpretar o número de outro jeito.
// Atendimentos são lidos sob demanda por período (até 5.000), não por ouvinte em tempo real.
//
// O QUE NÃO É: não define meta, semáforo, benchmark nem "esperado": são números do que foi registrado. Não mostra nome de paciente e não traz
// custo nem faturamento (não há esses dados). Óbito aparece só como contagem das saídas por óbito das internações (sem nome); os óbitos fora
// da internação ficam só na tela Óbitos, que é sigilosa. Ver docs/pendencias.md.

const LIMITE_ATENDIMENTOS_DIRECAO = 5000;

/** Lê os atendimentos que chegaram entre `de` e `ate` (AAAA-MM-DD). `truncado` avisa que o limite foi atingido. */
async function db_getAtendimentosPeriodo(de, ate) {
    requirePermission('direcao_ver');
    const database = requireDb();
    const snap = await database.collection('atendimentos').where('chegada_em', '>=', new Date(`${de}T00:00:00`).toISOString()).where('chegada_em', '<=', new Date(`${ate}T23:59:59.999`).toISOString()).limit(LIMITE_ATENDIMENTOS_DIRECAO).get();
    const itens = snap.docs.map(docToObj);
    return { itens, truncado: itens.length >= LIMITE_ATENDIMENTOS_DIRECAO };
}

const emLocal = (iso) => todayISO(new Date(iso));

/** Minutos da chegada até a primeira chamada (lido do histórico de situação, que só acrescenta). `null` se nunca foi chamado. */
function minutosAteChamada(at) {
    const h = at.historico_status || [];
    const chamado = h.find(x => x.status === 'CHAMADO' || x.status === 'EM_ATENDIMENTO');
    return chamado && at.chegada_em ? gestaoMinEntre(at.chegada_em, chamado.em) : null;
}

/** Minutos da chegada até o fim do atendimento (primeira situação CONCLUIDO do histórico). `null` se não concluiu. */
function minutosAteConclusao(at) {
    const fim = (at.historico_status || []).find(x => x.status === 'CONCLUIDO');
    return fim && at.chegada_em ? gestaoMinEntre(at.chegada_em, fim.em) : null;
}

/**
 * Monta os indicadores. Entradas (todas listas simples, sem nome de paciente na saída):
 *  atendimentos (já filtrados pelo período na leitura), internacoes, leitos {total, ocupados}, os, ouvidoria, qualidade {ncs, acoes, docs}, ensino.
 * Saída: { atendimentos: {...}, secoes: [{ id, titulo, itens: [{ rotulo, valor, criterio }] }] }
 */
function indicadoresDirecao(dados, de, ate, hoje = todayISO()) {
    const d = dados || {};
    const noDia = (iso) => { const x = emLocal(iso); return (!de || x >= de) && (!ate || x <= ate); };

    // ----- Atendimentos -----
    const ats = d.atendimentos || [];
    const porFila = {}; const porStatus = {}; const porRisco = {};
    ats.forEach(a => {
        porFila[a.fila || '—'] = (porFila[a.fila || '—'] || 0) + 1;
        porStatus[a.status] = (porStatus[a.status] || 0) + 1;
        const r = a.risco || 'SEM_CLASSIFICACAO'; porRisco[r] = (porRisco[r] || 0) + 1;
    });
    const espera = gestaoMedia(ats.map(minutosAteChamada));
    const duracao = gestaoMedia(ats.map(minutosAteConclusao));
    const retornos = ats.filter(a => a.retorno).length;
    const porTipo = {};
    ats.forEach(a => { const t = a.tipo_nome || '—'; porTipo[t] = (porTipo[t] || 0) + 1; });

    // ----- Internações -----
    const ints = d.internacoes || [];
    const adm = ints.filter(i => i.data_hora_internacao && noDia(i.data_hora_internacao));
    const altas = ints.filter(i => i.status === 'ALTA' && i.data_hora_alta && noDia(i.data_hora_alta));
    const obitos = altas.filter(i => i.tipo_alta === 'OBITO').length;
    const semTipo = altas.filter(i => !i.tipo_alta).length;
    const porTipoAlta = {};
    altas.forEach(i => { const k = (typeof ROTULOS_TIPO_ALTA !== 'undefined' && ROTULOS_TIPO_ALTA[i.tipo_alta]) || 'Não informado'; porTipoAlta[k] = (porTipoAlta[k] || 0) + 1; });
    const permanencia = gestaoMedia(altas.map(i => gestaoDiasEntre(i.data_hora_internacao, i.data_hora_alta)));
    const leitos = d.leitos || { total: 0, ocupados: 0 };
    const taxa = leitos.total ? Math.round(leitos.ocupados / leitos.total * 1000) / 10 : null;

    const fmt = (n, un = '') => (n === null || n === undefined ? '—' : `${String(n).replace('.', ',')}${un}`);
    const secoes = [];

    secoes.push({ id: 'atendimentos', titulo: 'Atendimentos', itens: [
        { rotulo: 'Atendimentos no período', valor: ats.length, criterio: 'Quantos check-ins foram feitos na Recepção entre as datas escolhidas (data e hora da chegada). Inclui cancelados e não comparecimentos.' },
        { rotulo: 'Concluídos', valor: porStatus.CONCLUIDO || 0, criterio: 'Atendimentos que chegaram no período e hoje estão com a situação "Concluído".' },
        { rotulo: 'Não compareceram', valor: porStatus.NAO_COMPARECEU || 0, criterio: 'Chamados que não responderam à chamada (situação "Não compareceu").' },
        { rotulo: 'Cancelados', valor: porStatus.CANCELADO || 0, criterio: 'Atendimentos cancelados na Recepção ou na fila (situação "Cancelado").' },
        { rotulo: 'Retornos', valor: retornos, criterio: 'Atendimentos de quem já tinha outro atendimento anterior no hospital (marca "retorno" do check-in; não há janela de dias, pendência 14).' },
        { rotulo: 'Espera média até a chamada', valor: fmt(espera, ' min'), criterio: 'Média, só entre quem foi chamado, do minuto da chegada até a primeira chamada ou início do atendimento (lido do histórico de situação). Quem ainda aguarda ou nunca foi chamado não entra.' },
        { rotulo: 'Tempo médio até a conclusão', valor: fmt(duracao, ' min'), criterio: 'Média, só dos concluídos, da chegada até o registro "Concluído" no histórico. Inclui a espera e o atendimento.' }
    ] });

    secoes.push({ id: 'internacao', titulo: 'Internação e leitos', itens: [
        { rotulo: 'Admissões', valor: adm.length, criterio: 'Internações cuja data e hora de internação cai no período.' },
        { rotulo: 'Saídas (altas e óbitos)', valor: altas.length, criterio: 'Internações encerradas no período, de qualquer tipo de alta.' },
        { rotulo: 'Saídas por óbito', valor: obitos, criterio: 'Só as internações encerradas com tipo "Óbito". Óbito fora da internação não entra aqui (fica na tela Óbitos, sigilosa).' },
        { rotulo: 'Saídas sem tipo de alta', valor: semTipo, criterio: 'Altas anteriores à Etapa 9, quando o tipo de alta ainda não era exigido.' },
        { rotulo: 'Permanência média', valor: fmt(permanencia, ' dias'), criterio: 'Média, só das saídas do período, de (data da alta − data da internação) em dias com uma casa decimal.' },
        { rotulo: 'Internados agora', valor: ints.filter(i => i.status === 'ATIVA').length, criterio: 'Internações com situação "Ativa" neste instante (não depende do período).' },
        { rotulo: 'Ocupação dos leitos agora', valor: taxa === null ? '—' : fmt(taxa, '%'), criterio: `Leitos ocupados (${leitos.ocupados}) ÷ leitos da estrutura (${leitos.total}) neste instante. Leito bloqueado ou em higienização conta no total e não como ocupado.` }
    ], detalhe: { porTipoAlta } });

    const indOs = typeof indicadoresManutencao === 'function' ? indicadoresManutencao(d.os || [], de, ate) : null;
    if (indOs) secoes.push({ id: 'manutencao', titulo: 'Manutenção', itens: [
        { rotulo: 'OS abertas no período', valor: indOs.abertas_no_periodo, criterio: 'Ordens de serviço criadas no período, de qualquer tipo e situação.' },
        { rotulo: 'OS em aberto agora', valor: indOs.em_aberto, criterio: 'Ordens ainda não concluídas nem canceladas, de qualquer data.' },
        { rotulo: 'Tempo médio até concluir', valor: fmt(indOs.horas_ate_concluir, ' h'), criterio: 'Média, só das concluídas criadas no período, da abertura até a conclusão. Não há prazo de atendimento definido pelo hospital.' }
    ] });

    const indOuv = typeof indicadoresOuvidoria === 'function' ? indicadoresOuvidoria(d.ouvidoria || [], de, ate, hoje) : null;
    if (indOuv) secoes.push({ id: 'ouvidoria', titulo: 'Ouvidoria', itens: [
        { rotulo: 'Manifestações no período', valor: indOuv.total, criterio: 'Manifestações registradas no período (data do registro), de qualquer tipo.' },
        { rotulo: 'Em aberto agora', valor: indOuv.em_aberto, criterio: 'Manifestações recebidas, em análise ou respondidas e ainda não concluídas.' },
        { rotulo: 'Com prazo vencido', valor: indOuv.vencidas, criterio: 'Recebidas ou em análise cujo prazo de resposta digitado pela ouvidoria já passou. Sem prazo digitado, não conta.' },
        { rotulo: 'Dias até a primeira resposta', valor: fmt(indOuv.dias_ate_responder, ' dias'), criterio: 'Média, só das que já têm resposta, do recebimento até a primeira resposta registrada.' }
    ] });

    const indQ = typeof indicadoresQualidade === 'function' ? indicadoresQualidade(d.qualidade || {}, de, ate, hoje) : null;
    if (indQ) secoes.push({ id: 'qualidade', titulo: 'Qualidade', itens: [
        { rotulo: 'Não conformidades no período', valor: indQ.nc_no_periodo, criterio: 'Não conformidades registradas no período, de qualquer situação.' },
        { rotulo: 'Não conformidades em aberto', valor: indQ.nc_em_aberto, criterio: 'Abertas ou em tratamento, de qualquer data.' },
        { rotulo: 'Ações atrasadas', valor: indQ.acoes_atrasadas, criterio: 'Ações pendentes ou em andamento com o prazo digitado já vencido.' },
        { rotulo: 'Documentos com revisão vencida', valor: indQ.docs_revisao_vencida, criterio: 'Documentos vigentes cuja data de próxima revisão (digitada) já passou.' }
    ] });

    const indE = typeof indicadoresEnsino === 'function' ? indicadoresEnsino(d.ensino || [], de, ate) : null;
    if (indE) secoes.push({ id: 'ensino', titulo: 'Ensino e pesquisa', itens: [
        { rotulo: 'Atividades que começam no período', valor: indE.total, criterio: 'Estágios, treinamentos, aulas, visitas e projetos com data de início no período.' },
        { rotulo: 'Participantes', valor: indE.participantes, criterio: 'Soma do número de participantes informado, sem as atividades canceladas. Não é lista de pessoas.' }
    ] });

    return { atendimentos: { total: ats.length, porFila, porStatus, porRisco, porTipo }, secoes };
}
