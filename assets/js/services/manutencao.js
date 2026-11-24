// Manutenção, engenharia clínica e patrimônio (Etapa 9): ordens de serviço (OS) e planos de manutenção preventiva e calibração.
//
// O QUE É: qualquer perfil abre um CHAMADO (OS corretiva ou de infraestrutura) sobre um equipamento do cadastro (Cadastro › Apoio ›
// Equipamentos) ou sobre um local. A manutenção assume, pode deixar "aguardando peça" e conclui com a solução; cancelar exige motivo.
// Cada mudança de situação fica no histórico do documento (nada é apagado). O PLANO (preventiva ou calibração) guarda a periodicidade
// em dias que o hospital define; a próxima data é a da última execução + periodicidade. Gerar a OS do plano e concluí-la atualiza o plano.
// A situação do equipamento no painel é DERIVADA das OS abertas (parado, com OS aberta) e não grava no cadastro de equipamentos.
//
// O QUE NÃO É: o sistema não define prazo de atendimento (SLA), periodicidade padrão por tipo de equipamento, nem exigência de laudo de
// calibração, e não substitui o sistema de patrimônio contábil (valor, depreciação, baixa patrimonial). Ver docs/pendencias.md.

const COL_OS = 'os_manutencao';
const COL_PLANOS_MANUT = 'manut_planos';

const TIPOS_OS = { CORRETIVA: 'Corretiva (defeito)', PREVENTIVA: 'Preventiva', CALIBRACAO: 'Calibração', INFRAESTRUTURA: 'Infraestrutura predial' };
const TIPOS_OS_CHAMADO = ['CORRETIVA', 'INFRAESTRUTURA'];   // o que qualquer perfil pode abrir; preventiva e calibração são da manutenção
const PRIORIDADES_OS = { URGENTE: 'Urgente', ALTA: 'Alta', NORMAL: 'Normal', BAIXA: 'Baixa' };
const SITUACOES_OS = { ABERTA: 'Aberta', EM_ATENDIMENTO: 'Em atendimento', AGUARDANDO_PECA: 'Aguardando peça', CONCLUIDA: 'Concluída', CANCELADA: 'Cancelada' };
const SITUACOES_OS_ABERTAS = ['ABERTA', 'EM_ATENDIMENTO', 'AGUARDANDO_PECA'];
const TRANSICOES_OS = { ABERTA: ['EM_ATENDIMENTO', 'CANCELADA'], EM_ATENDIMENTO: ['AGUARDANDO_PECA', 'CONCLUIDA', 'CANCELADA'], AGUARDANDO_PECA: ['EM_ATENDIMENTO', 'CANCELADA'] };
const TIPOS_PLANO = { PREVENTIVA: 'Preventiva', CALIBRACAO: 'Calibração' };
const PLANO_JANELA_PADRAO_DIAS = 30;   // só o filtro "a vencer" da tela, não é prazo do hospital
const ordemPrioridadeOs = { URGENTE: 0, ALTA: 1, NORMAL: 2, BAIXA: 3 };

// ============ Regras puras (testáveis) ============

const osAberta = (os) => SITUACOES_OS_ABERTAS.includes(os && os.status);

/** Valida a abertura de um chamado. `equipamentos` é a lista do cadastro (só os ativos entram). */
function validarChamadoOs(form, { equipamentos = [], podeAgendada = false } = {}) {
    const tipo = apoioEscolha(form.tipo, TIPOS_OS, 'Tipo');
    if (!podeAgendada && !TIPOS_OS_CHAMADO.includes(tipo)) throw new Error('Preventiva e calibração são abertas pela manutenção (pelo plano ou na tela de manutenção).');
    const prioridade = apoioEscolha(form.prioridade || 'NORMAL', PRIORIDADES_OS, 'Prioridade');
    const descricao = apoioTexto(form.descricao, 'Descrição', { min: 10, max: 500 });
    const out = { tipo, prioridade, descricao, objeto: 'LOCAL', equipamento_id: '', equipamento_codigo: '', equipamento_nome: '', patrimonio: '', local: '', parado: false };
    if (tipo === 'INFRAESTRUTURA') {
        out.local = apoioTexto(form.local, 'Local', { min: 3, max: 80 });
        return out;
    }
    const eq = (equipamentos || []).find(e => e.id === String(form.equipamento_id || ''));
    if (!eq) throw new Error('Escolha o equipamento (Cadastro › Apoio › Equipamentos).');
    if (eq.ativo === false) throw new Error('Este equipamento está inativo no cadastro.');
    out.objeto = 'EQUIPAMENTO';
    out.equipamento_id = eq.id; out.equipamento_codigo = eq.codigo || ''; out.equipamento_nome = eq.nome || ''; out.patrimonio = eq.patrimonio || '';
    out.local = apoioTexto(form.local, 'Local', { max: 80 });
    out.parado = Boolean(form.parado) && tipo === 'CORRETIVA';
    return out;
}

/** Valida a conclusão da OS. */
function validarConclusaoOs(form, os, agora = new Date()) {
    const solucao = apoioTexto(form.solucao, 'Solução aplicada', { min: 10, max: 500 });
    const pecas = apoioTexto(form.pecas, 'Peças ou serviços de terceiros', { max: 200 });
    const concluidoEm = apoioDataHora(form.concluido_em, 'Data e hora da conclusão', { agora, maxAntesHoras: 24 * 90 });
    if (new Date(concluidoEm).getTime() < new Date(os.criado_em).getTime()) throw new Error('A conclusão não pode ser anterior à abertura da OS.');
    const custo = apoioDecimal(form.custo, 'Custo do serviço (R$)', 0, 10000000, { opcional: true });   // #69: opcional; vazio = não informado (nunca vira 0)
    return { solucao, pecas, concluido_em: concluidoEm, custo };
}

/** Situação da cobrança de um plano: VENCIDO (data passada), A_VENCER (até a janela) ou EM_DIA. `hoje` AAAA-MM-DD. */
function situacaoDoPlano(plano, hoje = todayISO(), janelaDias = PLANO_JANELA_PADRAO_DIAS) {
    if (!plano || plano.ativo === false) return { codigo: 'INATIVO', dias: null };
    const dias = apoioDiasEntre(hoje, plano.proxima_em);
    if (dias < 0) return { codigo: 'VENCIDO', dias };
    if (dias <= janelaDias) return { codigo: 'A_VENCER', dias };
    return { codigo: 'EM_DIA', dias };
}

/** Valida a criação ou o ajuste de um plano (periodicidade em dias e a próxima data prevista). */
function validarPlanoManut(form, { equipamentos = [] } = {}) {
    const tipo = apoioEscolha(form.tipo, TIPOS_PLANO, 'Tipo do plano');
    const eq = (equipamentos || []).find(e => e.id === String(form.equipamento_id || ''));
    if (!eq) throw new Error('Escolha o equipamento (Cadastro › Apoio › Equipamentos).');
    if (eq.ativo === false) throw new Error('Este equipamento está inativo no cadastro.');
    return {
        tipo, equipamento_id: eq.id, equipamento_codigo: eq.codigo || '', equipamento_nome: eq.nome || '', patrimonio: eq.patrimonio || '',
        periodicidade_dias: apoioInteiro(form.periodicidade_dias, 'Periodicidade (dias)', 1, 3650),
        proxima_em: apoioData(form.proxima_em, 'Próxima data prevista'),
        descricao: apoioTexto(form.descricao, 'O que fazer (referência do procedimento)', { max: 200 })
    };
}

/** Baixa patrimonial (#69): quem baixa informa data (não futura) e motivo. Devolve a lista de erros do cadastro ([] = ok). */
function validarBaixaPatrimonial(f, hoje = todayISO()) {
    if (f.situacao_op !== 'Baixado') return [];
    const erros = [];
    if (!f.baixa_data) erros.push({ campo: 'baixa_data', mensagem: 'Informe a data da baixa.' });
    else if (f.baixa_data > hoje) erros.push({ campo: 'baixa_data', mensagem: 'A data da baixa não pode ser futura.' });
    if (String(f.baixa_motivo || '').trim().length < 5) erros.push({ campo: 'baixa_motivo', mensagem: 'Informe o motivo da baixa (mínimo de 5 caracteres).' });
    return erros;
}

const normChave = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** #69: nº de patrimônio é único no hospital; nº de série é único dentro do mesmo modelo. Devolve a lista de erros do cadastro ([] = ok). */
function validarUnicidadeEquipamento(f, id, existentes = []) {
    const erros = [];
    const outros = (existentes || []).filter(e => e.id !== id);
    const pat = normChave(f.patrimonio);
    if (pat && outros.some(e => normChave(e.patrimonio) === pat)) erros.push({ campo: 'patrimonio', mensagem: 'Já existe equipamento com este nº de patrimônio.' });
    const serie = normChave(f.numero_serie);
    if (serie && outros.some(e => normChave(e.numero_serie) === serie && normChave(e.modelo) === normChave(f.modelo))) erros.push({ campo: 'numero_serie', mensagem: 'Já existe equipamento deste modelo com este nº de série.' });
    return erros;
}

const LOTE_EQUIPAMENTOS_MAX = 50;

/** Planeja o cadastro em lote: uma linha de série (e de patrimônio, se vierem) por unidade. Confere repetidos entre si e com o que já existe (puro). */
function planejarLoteEquipamentos(base, series, patrimonios = [], existentes = []) {
    const lista = (t) => (Array.isArray(t) ? t : String(t || '').split(/\r?\n/)).map(x => String(x).trim()).filter(Boolean);
    const s = lista(series), p = lista(patrimonios);
    if (!s.length) throw new Error('Informe ao menos um nº de série (um por linha).');
    if (s.length > LOTE_EQUIPAMENTOS_MAX) throw new Error(`No máximo ${LOTE_EQUIPAMENTOS_MAX} unidades por lote.`);
    if (p.length && p.length !== s.length) throw new Error(`Informe um patrimônio por unidade (${s.length}) ou deixe em branco.`);
    const unidades = s.map((numero_serie, i) => ({ numero_serie, patrimonio: p[i] || '' }));
    const vistos = [];
    unidades.forEach((u, i) => {
        const e = validarUnicidadeEquipamento({ ...u, modelo: base.modelo }, null, [...existentes, ...vistos]);
        if (e.length) throw new Error(`Unidade ${i + 1}: ${e[0].mensagem}`);
        vistos.push({ ...u, modelo: base.modelo, id: 'lote' + i });
    });
    return unidades;
}

/** Cria uma unidade por série a partir de um equipamento já cadastrado (modelo, setor etc.), cada uma com seu código, série e patrimônio. */
async function cadastrarEquipamentosEmLote(baseId, series, patrimonios = []) {
    requirePermission('manutencao_gerenciar');
    const existentes = cadRowsOf('equipamento');
    const base = existentes.find(e => e.id === baseId);
    if (!base) throw new Error('Equipamento de referência não encontrado.');
    const unidades = planejarLoteEquipamentos(base, series, patrimonios, existentes);
    const user = state.currentUser; const agora = nowISO(); const criados = [];
    for (const u of unidades) {
        const { id: _i, codigo: _c, baixa_data: _bd, baixa_motivo: _bm, busca: _b, criado_em: _ce, criado_por: _cp, atualizado_em: _ae, atualizado_por: _ap, ...resto } = base;
        const reg = { ...resto, id: newId('equ'), codigo: await db_cadProximoCodigo('equipamento', 'EQP'), numero_serie: u.numero_serie, patrimonio: u.patrimonio, situacao_op: 'Operacional', ativo: true,
            criado_em: agora, criado_por: user.username, atualizado_em: agora, atualizado_por: user.username };
        reg.busca = searchKey([reg.nome, reg.codigo, reg.patrimonio, reg.numero_serie, reg.modelo].filter(Boolean).join(' '));
        await db_cadSalvar('equipamento', reg);
        await auditar({ entidade: 'cad_equipamento', entidade_id: reg.id, acao: 'CRIAR', depois: { codigo: reg.codigo, origem: 'Cadastro em lote', serie: reg.numero_serie } });
        criados.push(reg);
    }
    return criados;
}

/** Situação do equipamento no painel: deriva das OS abertas; sem OS aberta vale o que está no cadastro. */
function situacaoDoEquipamento(equipamento, osLista) {
    if (equipamento.situacao_op === 'Baixado') return { codigo: 'BAIXADO', rotulo: 'Baixado (patrimônio)', os: null, abertas: [] };   // baixa patrimonial (#69): vale sobre as OS
    const abertas = (osLista || []).filter(o => o.equipamento_id === equipamento.id && osAberta(o));
    const parada = abertas.find(o => o.parado);
    if (parada) return { codigo: 'PARADO', rotulo: `Parado · ${parada.protocolo}`, os: parada, abertas };
    if (abertas.length) return { codigo: 'COM_OS', rotulo: `Com OS aberta · ${abertas[0].protocolo}`, os: abertas[0], abertas };
    if (equipamento.situacao_op === 'Fora de uso') return { codigo: 'FORA_DE_USO', rotulo: 'Fora de uso (cadastro)', os: null, abertas };
    if (equipamento.situacao_op === 'Em manutenção') return { codigo: 'EM_MANUTENCAO_CAD', rotulo: 'Em manutenção (cadastro)', os: null, abertas };
    return { codigo: 'OPERACIONAL', rotulo: 'Operacional', os: null, abertas };
}

const horasEntreOs = (a, b) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 360000) / 10;

/** Indicadores simples do período (sem meta nem prazo): contagens e tempos médios em horas. */
function indicadoresManutencao(osLista, de = '', ate = '') {
    const noPeriodo = (osLista || []).filter(o => (!de || o.dia >= de) && (!ate || o.dia <= ate));
    const concluidas = noPeriodo.filter(o => o.status === 'CONCLUIDA' && o.concluido_em);
    const media = (lista, fn) => (lista.length ? Math.round(lista.reduce((s, o) => s + fn(o), 0) / lista.length * 10) / 10 : null);
    const assumidas = noPeriodo.filter(o => o.iniciado_em);
    const porTipo = {}; const porPrioridade = {};
    noPeriodo.forEach(o => { porTipo[o.tipo] = (porTipo[o.tipo] || 0) + 1; porPrioridade[o.prioridade] = (porPrioridade[o.prioridade] || 0) + 1; });
    return {
        abertas_no_periodo: noPeriodo.length,
        em_aberto: (osLista || []).filter(osAberta).length,
        concluidas: concluidas.length,
        canceladas: noPeriodo.filter(o => o.status === 'CANCELADA').length,
        horas_ate_assumir: media(assumidas, o => horasEntreOs(o.criado_em, o.iniciado_em)),
        horas_ate_concluir: media(concluidas, o => horasEntreOs(o.criado_em, o.concluido_em)),
        por_tipo: porTipo, por_prioridade: porPrioridade
    };
}

// ============ Gravação (Firestore) ============

const idPlanoManut = (equipamentoId, tipo) => `plano_${equipamentoId}_${tipo}`;

function montarOs(dados, numero, user, agora, extras = {}) {
    return {
        id: newId('os'), protocolo: apoioProtocolo('OS', numero), ...dados, plano_id: '', status: 'ABERTA', dia: todayISO(), criado_em: agora,
        solicitante: user.username, solicitante_nome: user.name, solicitante_perfil: user.role,
        atendente: '', atendente_nome: '', iniciado_em: '', concluido_em: '', solucao: '', pecas: '', cancelada_motivo: '',
        historico: [apoioLinhaHistorico('ABERTA', user, agora, 'Chamado aberto')], ...extras
    };
}

async function abrirChamadoOs(form) {
    requirePermission('manutencao_solicitar');
    const agendada = hasPermission('manutencao_gerenciar');
    const v = validarChamadoOs(form, { equipamentos: cadRowsOf('equipamento'), podeAgendada: agendada });
    const database = requireDb();
    const user = state.currentUser;
    const agora = nowISO();
    let os;
    await database.runTransaction(async (tx) => {
        const c = await apoioProximoNumero(tx, database, 'os_manutencao');
        os = montarOs(v, c.n, user, agora);
        tx.set(c.ref, { ultimo: c.n });
        tx.set(database.collection(COL_OS).doc(os.id), os);
    });
    await auditar({ entidade: 'os_manutencao', entidade_id: os.id, acao: 'ABRIR', depois: { protocolo: os.protocolo, tipo: os.tipo, equipamento: os.equipamento_codigo, prioridade: os.prioridade, parado: os.parado } });
    return os;
}

/** Lê a OS dentro da transação e confere que a mudança de situação é permitida. */
async function lerOsParaMudar(tx, database, id, para) {
    const ref = database.collection(COL_OS).doc(String(id));
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error('OS não encontrada.');
    const os = { id: snap.id, ...snap.data() };
    apoioPodeIr(TRANSICOES_OS, os.status, para, SITUACOES_OS);
    return { ref, os };
}

async function assumirOs(id) {
    requirePermission('manutencao_executar');
    const database = requireDb(); const user = state.currentUser; const agora = nowISO();
    let nova;
    await database.runTransaction(async (tx) => {
        const { ref, os } = await lerOsParaMudar(tx, database, id, 'EM_ATENDIMENTO');
        nova = { ...os, status: 'EM_ATENDIMENTO', atendente: os.atendente || user.username, atendente_nome: os.atendente_nome || user.name, iniciado_em: os.iniciado_em || agora,
            historico: [...(os.historico || []), apoioLinhaHistorico('EM_ATENDIMENTO', user, agora, os.status === 'AGUARDANDO_PECA' ? 'Atendimento retomado' : 'Atendimento iniciado')] };
        tx.set(ref, nova);
    });
    await auditar({ entidade: 'os_manutencao', entidade_id: id, acao: 'ASSUMIR', depois: { status: 'EM_ATENDIMENTO' } });
    return nova;
}

async function aguardarPecaOs(id, motivo) {
    requirePermission('manutencao_executar');
    const texto = apoioTexto(motivo, 'O que está sendo aguardado', { min: 5, max: 200 });
    const database = requireDb(); const user = state.currentUser; const agora = nowISO();
    let nova;
    await database.runTransaction(async (tx) => {
        const { ref, os } = await lerOsParaMudar(tx, database, id, 'AGUARDANDO_PECA');
        nova = { ...os, status: 'AGUARDANDO_PECA', historico: [...(os.historico || []), apoioLinhaHistorico('AGUARDANDO_PECA', user, agora, texto)] };
        tx.set(ref, nova);
    });
    await auditar({ entidade: 'os_manutencao', entidade_id: id, acao: 'AGUARDAR_PECA', motivo: texto });
    return nova;
}

async function concluirOs(id, form) {
    requirePermission('manutencao_executar');
    const database = requireDb(); const user = state.currentUser; const agora = nowISO();
    let nova;
    await database.runTransaction(async (tx) => {
        const { ref, os } = await lerOsParaMudar(tx, database, id, 'CONCLUIDA');
        const v = validarConclusaoOs(form, os);
        let planoRef = null; let plano = null;
        if (os.plano_id) { planoRef = database.collection(COL_PLANOS_MANUT).doc(os.plano_id); const p = await tx.get(planoRef); if (p.exists) plano = { id: p.id, ...p.data() }; }
        nova = { ...os, status: 'CONCLUIDA', solucao: v.solucao, pecas: v.pecas, custo: v.custo, concluido_em: v.concluido_em, concluida_por: user.username, concluida_por_nome: user.name,
            atendente: os.atendente || user.username, atendente_nome: os.atendente_nome || user.name, iniciado_em: os.iniciado_em || agora,
            historico: [...(os.historico || []), apoioLinhaHistorico('CONCLUIDA', user, agora, v.solucao)] };
        tx.set(ref, nova);
        if (plano) {
            const feita = todayISO(new Date(v.concluido_em));
            tx.set(planoRef, { ...plano, ultima_em: feita, proxima_em: apoioSomarDias(feita, plano.periodicidade_dias), os_aberta_id: '',
                historico: [...(plano.historico || []), { em: agora, por: user.username, por_nome: user.name, acao: 'EXECUTADO', detalhe: `${os.protocolo} concluída em ${feita}` }] });
        }
    });
    await auditar({ entidade: 'os_manutencao', entidade_id: id, acao: 'CONCLUIR', depois: { protocolo: nova.protocolo, concluido_em: nova.concluido_em } });
    return nova;
}

// ---------- #69: movimentações, teste elétrico e custo por equipamento (livros que só recebem registros novos; erro = anulação) ----------
const COL_MOVIMENTACOES = 'equipamento_movimentacoes';
const COL_TESTES_ELETRICOS = 'equipamento_testes_eletricos';
const RESULTADOS_TESTE_ELETRICO = { APROVADO: 'Aprovado', REPROVADO: 'Reprovado' };

function validarMovimentacaoEquipamento(form, equip, agora = new Date()) {
    const para = apoioTexto(form.para, 'Novo local ou setor', { min: 2, max: 80 });
    const de = String(equip.local || equip.setor || '').slice(0, 80);
    if (de && de.toLowerCase() === para.toLowerCase()) throw new Error('O novo local é igual ao atual.');
    return { equipamento_id: equip.id, equipamento_nome: String(equip.nome || ''), patrimonio: String(equip.patrimonio || ''), de, para,
        motivo: apoioTexto(form.motivo, 'Motivo da movimentação', { min: 5, max: 200 }), em: apoioDataHora(form.em, 'Data e hora da movimentação', { agora }) };
}

function validarTesteEletrico(form, equip, agora = new Date()) {
    const resultado = apoioEscolha(form.resultado, RESULTADOS_TESTE_ELETRICO, 'Resultado do teste');
    const proximo = String(form.proximo_em || '').trim();
    if (proximo) apoioData(proximo, 'Próximo teste', { futuro: true, agora });
    return { equipamento_id: equip.id, equipamento_nome: String(equip.nome || ''), patrimonio: String(equip.patrimonio || ''), resultado,
        responsavel: apoioTexto(form.responsavel, 'Quem executou (técnico ou empresa)', { min: 3, max: 100 }), laudo: apoioTexto(form.laudo, 'Nº do laudo ou observação', { max: 200 }),
        proximo_em: proximo, em: apoioDataHora(form.em, 'Data e hora do teste', { agora }) };
}

async function equipamentoDoCadastro(id) {
    const e = (typeof cadRowsOf === 'function' ? cadRowsOf('equipamento') : []).find(x => x.id === String(id));
    if (!e) throw new Error('Equipamento não encontrado.');
    return e;
}

/** Registra que o equipamento mudou de local. NÃO altera o cadastro: o histórico é o livro; quem edita o cadastro é o gestor do patrimônio. */
async function registrarMovimentacaoEquipamento(equipamentoId, form) {
    requirePermission('manutencao_gerenciar');
    const equip = await equipamentoDoCadastro(equipamentoId);
    const dados = validarMovimentacaoEquipamento(form, equip);
    return apoioGravarRegistro({ col: COL_MOVIMENTACOES, prefixoId: 'mov', dados, entidade: 'equipamento_movimentacao', perm: 'manutencao_gerenciar', resumoAuditoria: r => ({ equipamento: r.equipamento_id, de: r.de, para: r.para }) });
}

async function registrarTesteEletrico(equipamentoId, form) {
    requirePermission('manutencao_executar');
    const equip = await equipamentoDoCadastro(equipamentoId);
    const dados = validarTesteEletrico(form, equip);
    return apoioGravarRegistro({ col: COL_TESTES_ELETRICOS, prefixoId: 'tel', dados, entidade: 'equipamento_teste_eletrico', perm: 'manutencao_executar', resumoAuditoria: r => ({ equipamento: r.equipamento_id, resultado: r.resultado }) });
}

const anularMovimentacaoEquipamento = (id, motivo) => apoioAnularRegistro({ col: COL_MOVIMENTACOES, id, motivo, perm: 'manutencao_gerenciar', entidade: 'equipamento_movimentacao' });
const anularTesteEletrico = (id, motivo) => apoioAnularRegistro({ col: COL_TESTES_ELETRICOS, id, motivo, perm: 'manutencao_executar', entidade: 'equipamento_teste_eletrico' });

/** Custo de manutenção do equipamento: soma só o que foi informado nas OS concluídas; `semCusto` conta as concluídas sem valor (não entra como zero). */
function custoManutencaoEquipamento(listaOs) {
    const concl = (listaOs || []).filter(o => o.status === 'CONCLUIDA');
    const comCusto = concl.filter(o => typeof o.custo === 'number');
    return { total: Math.round(comCusto.reduce((s, o) => s + o.custo, 0) * 100) / 100, osComCusto: comCusto.length, semCusto: concl.length - comCusto.length };
}

async function db_getRegistrosDoEquipamento(col, equipamentoId) {
    const snap = await requireDb().collection(col).where('equipamento_id', '==', String(equipamentoId)).get();
    return apoioRegistrosValidos(snap.docs.map(docToObj)).sort((a, b) => String(b.em).localeCompare(String(a.em)));
}

/** Cancela a OS (motivo obrigatório). Quem abriu cancela só enquanto está "Aberta"; a manutenção cancela em qualquer situação aberta. */
async function cancelarOs(id, motivo) {
    requirePermission('manutencao_solicitar');
    const texto = apoioTexto(motivo, 'Motivo do cancelamento', { min: 5, max: 200 });
    const database = requireDb(); const user = state.currentUser; const agora = nowISO();
    const gerencia = hasPermission('manutencao_gerenciar');
    let nova;
    await database.runTransaction(async (tx) => {
        const { ref, os } = await lerOsParaMudar(tx, database, id, 'CANCELADA');
        if (!gerencia && (os.solicitante !== user.username || os.status !== 'ABERTA')) throw new Error('Só a manutenção cancela uma OS que já foi assumida, e só quem abriu cancela a própria OS.');
        let planoRef = null; let plano = null;
        if (os.plano_id) { planoRef = database.collection(COL_PLANOS_MANUT).doc(os.plano_id); const p = await tx.get(planoRef); if (p.exists) plano = { id: p.id, ...p.data() }; }
        nova = { ...os, status: 'CANCELADA', cancelada_motivo: texto, cancelada_por: user.username, cancelada_por_nome: user.name, cancelada_em: agora,
            historico: [...(os.historico || []), apoioLinhaHistorico('CANCELADA', user, agora, texto)] };
        tx.set(ref, nova);
        if (plano && plano.os_aberta_id === os.id) tx.set(planoRef, { ...plano, os_aberta_id: '' });
    });
    await auditar({ entidade: 'os_manutencao', entidade_id: id, acao: 'CANCELAR', motivo: texto });
    return nova;
}

async function criarPlanoManut(form) {
    requirePermission('manutencao_gerenciar');
    const v = validarPlanoManut(form, { equipamentos: cadRowsOf('equipamento') });
    const database = requireDb(); const user = state.currentUser; const agora = nowISO();
    const id = idPlanoManut(v.equipamento_id, v.tipo);
    let plano;
    await database.runTransaction(async (tx) => {
        const ref = database.collection(COL_PLANOS_MANUT).doc(id);
        const ja = await tx.get(ref);
        if (ja.exists) throw new Error(ja.data().ativo === false ? 'Já existe um plano inativo deste tipo para o equipamento. Reative-o.' : 'Já existe um plano deste tipo para o equipamento.');
        plano = { id, ...v, ultima_em: '', ativo: true, os_aberta_id: '', criado_em: agora, criado_por: user.username, criado_por_nome: user.name,
            historico: [{ em: agora, por: user.username, por_nome: user.name, acao: 'CRIADO', detalhe: `A cada ${v.periodicidade_dias} dias; próxima em ${v.proxima_em}` }] };
        tx.set(ref, plano);
    });
    await auditar({ entidade: 'plano_manutencao', entidade_id: id, acao: 'CRIAR', depois: { equipamento: v.equipamento_codigo, tipo: v.tipo, periodicidade_dias: v.periodicidade_dias, proxima_em: v.proxima_em } });
    return plano;
}

/** Ajusta periodicidade, próxima data e descrição (motivo obrigatório: fica no histórico do plano). */
async function ajustarPlanoManut(id, form, motivo) {
    requirePermission('manutencao_gerenciar');
    const texto = apoioTexto(motivo, 'Motivo do ajuste', { min: 5, max: 200 });
    const database = requireDb(); const user = state.currentUser; const agora = nowISO();
    let nova;
    await database.runTransaction(async (tx) => {
        const ref = database.collection(COL_PLANOS_MANUT).doc(String(id));
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error('Plano não encontrado.');
        const p = { id: snap.id, ...snap.data() };
        const v = validarPlanoManut({ ...form, tipo: p.tipo, equipamento_id: p.equipamento_id }, { equipamentos: [{ id: p.equipamento_id, codigo: p.equipamento_codigo, nome: p.equipamento_nome, patrimonio: p.patrimonio }] });
        nova = { ...p, periodicidade_dias: v.periodicidade_dias, proxima_em: v.proxima_em, descricao: v.descricao,
            historico: [...(p.historico || []), { em: agora, por: user.username, por_nome: user.name, acao: 'AJUSTADO', detalhe: `A cada ${v.periodicidade_dias} dias; próxima em ${v.proxima_em}`, motivo: texto }] };
        tx.set(ref, nova);
    });
    await auditar({ entidade: 'plano_manutencao', entidade_id: id, acao: 'AJUSTAR', depois: { periodicidade_dias: nova.periodicidade_dias, proxima_em: nova.proxima_em }, motivo: texto });
    return nova;
}

async function alternarPlanoManut(id, ativar, motivo) {
    requirePermission('manutencao_gerenciar');
    const texto = apoioTexto(motivo, 'Motivo', { min: ativar ? 0 : 5, max: 200 });
    const database = requireDb(); const user = state.currentUser; const agora = nowISO();
    await database.runTransaction(async (tx) => {
        const ref = database.collection(COL_PLANOS_MANUT).doc(String(id));
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error('Plano não encontrado.');
        const p = { id: snap.id, ...snap.data() };
        if ((p.ativo !== false) === ativar) throw new Error(ativar ? 'O plano já está ativo.' : 'O plano já está inativo.');
        if (!ativar && p.os_aberta_id) throw new Error('Há uma OS aberta deste plano. Conclua ou cancele a OS antes de inativar o plano.');
        tx.set(ref, { ...p, ativo: ativar, historico: [...(p.historico || []), { em: agora, por: user.username, por_nome: user.name, acao: ativar ? 'REATIVADO' : 'INATIVADO', detalhe: '', motivo: texto }] });
    });
    await auditar({ entidade: 'plano_manutencao', entidade_id: id, acao: ativar ? 'REATIVAR' : 'INATIVAR', motivo: texto });
}

const inativarPlanoManut = (id, motivo) => alternarPlanoManut(id, false, motivo);
const reativarPlanoManut = (id) => alternarPlanoManut(id, true, '');

/** Abre a OS preventiva ou de calibração do plano. Só uma OS aberta por plano (conferido na transação). */
async function gerarOsDoPlano(planoId) {
    requirePermission('manutencao_gerenciar');
    const database = requireDb(); const user = state.currentUser; const agora = nowISO();
    let os;
    await database.runTransaction(async (tx) => {
        const planoRef = database.collection(COL_PLANOS_MANUT).doc(String(planoId));
        const snap = await tx.get(planoRef);
        if (!snap.exists) throw new Error('Plano não encontrado.');
        const p = { id: snap.id, ...snap.data() };
        if (p.ativo === false) throw new Error('Este plano está inativo.');
        if (p.os_aberta_id) throw new Error('Já existe uma OS aberta para este plano.');
        const c = await apoioProximoNumero(tx, database, 'os_manutencao');
        const dados = { tipo: p.tipo, prioridade: 'NORMAL', descricao: p.descricao || `${TIPOS_PLANO[p.tipo]} programada (a cada ${p.periodicidade_dias} dias)`, objeto: 'EQUIPAMENTO',
            equipamento_id: p.equipamento_id, equipamento_codigo: p.equipamento_codigo, equipamento_nome: p.equipamento_nome, patrimonio: p.patrimonio || '', local: '', parado: false };
        os = montarOs(dados, c.n, user, agora, { plano_id: p.id });
        tx.set(c.ref, { ultimo: c.n });
        tx.set(database.collection(COL_OS).doc(os.id), os);
        tx.set(planoRef, { ...p, os_aberta_id: os.id });
    });
    await auditar({ entidade: 'os_manutencao', entidade_id: os.id, acao: 'ABRIR', depois: { protocolo: os.protocolo, tipo: os.tipo, plano: planoId } });
    return os;
}

/** OS de um equipamento (histórico dele): lê direto do banco ao abrir a ficha. */
async function db_getOsDoEquipamento(equipamentoId) {
    const snap = await requireDb().collection(COL_OS).where('equipamento_id', '==', String(equipamentoId)).get();
    return snap.docs.map(docToObj).sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
}
