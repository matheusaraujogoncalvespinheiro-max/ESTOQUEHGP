// Qualidade (Etapa 10): não conformidades, planos de ação e documentos versionados.
//
// O QUE É: a equipe da qualidade registra não conformidades (o que foi encontrado, onde e a origem), trata cada uma com ações (o que fazer,
// quem, até quando), verifica o resultado e conclui. Os documentos (POP, protocolo, política, norma, formulário) ficam numa lista com
// versões que só acrescentam: a versão nova não apaga a anterior e o documento obsoleto continua consultável.
//
// O QUE NÃO É: não guarda o arquivo do documento (só o código, a versão e onde ele está), não aprova nem assina por ninguém (o nome do
// aprovador é digitado), não define gravidade, prazo nem periodicidade de revisão (campos digitados pela equipe) e não faz análise de causa
// (espinha de peixe, 5 porquês) nem acreditação. Ver docs/pendencias.md.

const COL_NC = 'qualidade_nc';
const COL_ACOES = 'qualidade_acoes';
const COL_DOCS = 'qualidade_docs';

const ORIGENS_NC = { AUDITORIA: 'Auditoria interna', EVENTO: 'Evento assistencial', OUVIDORIA: 'Ouvidoria', INSPECAO: 'Inspeção ou visita', INDICADOR: 'Indicador fora do esperado', OUTRA: 'Outra origem' };
const SITUACOES_NC = { ABERTA: 'Aberta', EM_TRATAMENTO: 'Em tratamento', CONCLUIDA: 'Concluída', CANCELADA: 'Cancelada' };
const SITUACOES_NC_ABERTAS = ['ABERTA', 'EM_TRATAMENTO'];
const TRANSICOES_NC = { ABERTA: ['EM_TRATAMENTO', 'CANCELADA'], EM_TRATAMENTO: ['CONCLUIDA', 'CANCELADA'] };

const SITUACOES_ACAO = { PENDENTE: 'Pendente', EM_ANDAMENTO: 'Em andamento', CONCLUIDA: 'Concluída', CANCELADA: 'Cancelada' };
const SITUACOES_ACAO_ABERTAS = ['PENDENTE', 'EM_ANDAMENTO'];
const TRANSICOES_ACAO = { PENDENTE: ['EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA'], EM_ANDAMENTO: ['CONCLUIDA', 'CANCELADA'] };

const TIPOS_DOC = { POP: 'Procedimento operacional (POP)', PROTOCOLO: 'Protocolo', POLITICA: 'Política', NORMA: 'Norma ou regimento', FORMULARIO: 'Formulário', OUTRO: 'Outro documento' };
const SITUACOES_DOC = { VIGENTE: 'Vigente', OBSOLETO: 'Obsoleto' };

const ncAberta = (n) => SITUACOES_NC_ABERTAS.includes(n && n.status);
const acaoAberta = (a) => SITUACOES_ACAO_ABERTAS.includes(a && a.status);
/** Ação atrasada: aberta e com o prazo digitado anterior a `hoje`. */
const acaoAtrasada = (a, hoje = todayISO()) => Boolean(a && acaoAberta(a) && a.prazo && a.prazo < hoje);
/** Documento vigente com a data de revisão (digitada) já passada. */
const docRevisaoVencida = (d, hoje = todayISO()) => { const v = docVersaoAtual(d); return Boolean(d && d.situacao === 'VIGENTE' && v && v.revisar_em && v.revisar_em < hoje); };
const docVersaoAtual = (d) => { const vs = (d && d.versoes) || []; return vs.length ? vs[vs.length - 1] : null; };
/** Código do documento sem espaços e em maiúsculas; vira o id do documento (impede repetir). */
const normalizarCodigoDoc = (c) => String(c || '').trim().toUpperCase().replace(/\s+/g, '-');

// ============ Regras puras (testáveis) ============

function validarNaoConformidade(form, agora = new Date()) {
    return {
        origem: apoioEscolha(form.origem, ORIGENS_NC, 'Origem'),
        setor: apoioTexto(form.setor, 'Setor', { min: 2, max: 60 }),
        descricao: apoioTexto(form.descricao, 'Descrição da não conformidade', { min: 10, max: 500 }),
        causa: apoioTexto(form.causa, 'Causa identificada', { max: 300 }),
        detectada_em: apoioData(form.detectada_em || todayISO(agora), 'Data da detecção', { futuro: false, agora })
    };
}

/** Ação do plano. `ncOpcional`: a ação pode existir sem não conformidade. O prazo não pode ser anterior a hoje na criação. */
function validarAcaoQualidade(form, agora = new Date()) {
    const prazo = apoioData(form.prazo, 'Prazo');
    if (prazo < todayISO(agora)) throw new Error('Prazo: não pode ser anterior a hoje.');
    return {
        nc_id: String(form.nc_id || '').trim(),
        descricao: apoioTexto(form.descricao, 'O que será feito', { min: 5, max: 300 }),
        responsavel: apoioTexto(form.responsavel, 'Responsável', { min: 3, max: 80 }),
        prazo, motivo_acao: apoioTexto(form.motivo_acao, 'Por que (opcional)', { max: 300 })
    };
}

function validarDocumentoQualidade(form, agora = new Date()) {
    const codigo = normalizarCodigoDoc(form.codigo);
    if (codigo.length < 2 || codigo.length > 30) throw new Error('Código: de 2 a 30 caracteres.');
    return {
        codigo, titulo: apoioTexto(form.titulo, 'Título', { min: 5, max: 120 }),
        tipo: apoioEscolha(form.tipo, TIPOS_DOC, 'Tipo do documento'),
        setor: apoioTexto(form.setor, 'Setor dono do documento', { min: 2, max: 60 }),
        versao: validarVersaoDocumento(form, agora)
    };
}

/** Dados de uma versão (a primeira ou as seguintes). O número é dado pelo serviço. */
function validarVersaoDocumento(form, agora = new Date()) {
    const revisarEm = String(form.revisar_em || '').trim() ? apoioData(form.revisar_em, 'Próxima revisão') : '';
    const aprovadoEm = apoioData(form.aprovado_em, 'Data da aprovação', { futuro: false, agora });
    if (revisarEm && revisarEm < aprovadoEm) throw new Error('Próxima revisão: não pode ser anterior à aprovação.');
    return {
        resumo: apoioTexto(form.resumo, 'O que mudou (ou "primeira versão")', { min: 5, max: 300 }),
        aprovado_por: apoioTexto(form.aprovado_por, 'Aprovado por', { min: 3, max: 80 }),
        aprovado_em: aprovadoEm, revisar_em: revisarEm,
        referencia: apoioTexto(form.referencia, 'Onde está o arquivo (fora do sistema)', { max: 200 })
    };
}

/** Indicadores da qualidade (não conformidades pela data de registro; ações e documentos pela situação de hoje). */
function indicadoresQualidade({ ncs = [], acoes = [], docs = [] } = {}, de = '', ate = '', hoje = todayISO()) {
    const nc = ncs.filter(n => (!de || n.dia >= de) && (!ate || n.dia <= ate));
    const porOrigem = {}; nc.forEach(n => { porOrigem[n.origem] = (porOrigem[n.origem] || 0) + 1; });
    const concl = nc.filter(n => n.status === 'CONCLUIDA' && n.concluido_em);
    return {
        nc_no_periodo: nc.length, nc_em_aberto: ncs.filter(ncAberta).length, nc_concluidas: nc.filter(n => n.status === 'CONCLUIDA').length, por_origem: porOrigem,
        dias_ate_concluir: gestaoMedia(concl.map(n => gestaoDiasEntre(n.criado_em, n.concluido_em))),
        acoes_abertas: acoes.filter(acaoAberta).length, acoes_atrasadas: acoes.filter(a => acaoAtrasada(a, hoje)).length,
        docs_vigentes: docs.filter(d => d.situacao === 'VIGENTE').length, docs_revisao_vencida: docs.filter(d => docRevisaoVencida(d, hoje)).length
    };
}

// ============ Não conformidades ============

function registrarNaoConformidade(form) {
    requirePermission('qualidade_gerenciar');
    const v = validarNaoConformidade(form);
    const user = state.currentUser;
    return gestaoCriarNumerado({
        col: COL_NC, contador: 'qualidade_nc', prefixo: 'NC', prefixoId: 'nc', entidade: 'qualidade_nc',
        monta: () => ({ ...v, status: 'ABERTA', concluido_em: '', verificacao: '', cancelado_motivo: '', historico: [apoioLinhaHistorico('ABERTA', user, nowISO(), 'Não conformidade registrada')] }),
        resumoAuditoria: (n) => ({ protocolo: n.protocolo, origem: n.origem, setor: n.setor })
    });
}

const tratarNaoConformidade = (id) => gestaoMudarSituacao({ col: COL_NC, id, para: 'EM_TRATAMENTO', mapa: TRANSICOES_NC, rotulos: SITUACOES_NC, perm: 'qualidade_gerenciar', entidade: 'qualidade_nc', acao: 'TRATAR',
    texto: 'Tratamento iniciado', naoEncontrado: 'Não conformidade não encontrada.' });

/** Conclui exigindo o parecer da verificação do resultado e nenhuma ação aberta ligada a ela. */
async function concluirNaoConformidade(id, verificacao) {
    requirePermission('qualidade_gerenciar');
    const texto = apoioTexto(verificacao, 'Verificação do resultado', { min: 10, max: 300 });
    const abertas = (await requireDb().collection(COL_ACOES).where('nc_id', '==', String(id)).get()).docs.map(docToObj).filter(acaoAberta);
    if (abertas.length) throw new Error(`Há ${abertas.length} ação(ões) aberta(s) ligada(s) a esta não conformidade. Conclua ou cancele antes.`);
    return gestaoMudarSituacao({ col: COL_NC, id, para: 'CONCLUIDA', mapa: TRANSICOES_NC, rotulos: SITUACOES_NC, perm: 'qualidade_gerenciar', entidade: 'qualidade_nc', acao: 'CONCLUIR',
        texto, campos: (n, u, agora) => ({ verificacao: texto, concluido_em: agora }), naoEncontrado: 'Não conformidade não encontrada.' });
}

function cancelarNaoConformidade(id, motivo) {
    const texto = apoioTexto(motivo, 'Motivo do cancelamento', { min: 5, max: 200 });
    return gestaoMudarSituacao({ col: COL_NC, id, para: 'CANCELADA', mapa: TRANSICOES_NC, rotulos: SITUACOES_NC, perm: 'qualidade_gerenciar', entidade: 'qualidade_nc', acao: 'CANCELAR',
        texto, campos: () => ({ cancelado_motivo: texto }), naoEncontrado: 'Não conformidade não encontrada.' });
}

// ============ Planos de ação ============

async function criarAcaoQualidade(form) {
    requirePermission('qualidade_gerenciar');
    const v = validarAcaoQualidade(form);
    const database = requireDb(); const user = state.currentUser; const agora = nowISO();
    let a;
    await database.runTransaction(async (tx) => {
        const c = await apoioProximoNumero(tx, database, 'qualidade_acao');
        let nc = null;
        if (v.nc_id) {
            const snap = await tx.get(database.collection(COL_NC).doc(v.nc_id));
            if (!snap.exists) throw new Error('Não conformidade não encontrada.');
            nc = { id: snap.id, ...snap.data() };
            if (!ncAberta(nc)) throw new Error('Esta não conformidade já foi encerrada: não aceita novas ações.');
        }
        a = { id: newId('acq'), protocolo: apoioProtocolo('AC', c.n), ...v, nc_protocolo: nc ? nc.protocolo : '', status: 'PENDENTE', dia: todayISO(), criado_em: agora, ...apoioQuem(user),
            resultado: '', concluido_em: '', cancelado_motivo: '', reprogramacoes: [], historico: [apoioLinhaHistorico('PENDENTE', user, agora, 'Ação criada')] };
        tx.set(c.ref, { ultimo: c.n });
        tx.set(database.collection(COL_ACOES).doc(a.id), a);
    });
    await auditar({ entidade: 'qualidade_acao', entidade_id: a.id, acao: 'CRIAR', depois: { protocolo: a.protocolo, nc_id: a.nc_id, prazo: a.prazo, responsavel: a.responsavel } });
    return a;
}

const iniciarAcaoQualidade = (id) => gestaoMudarSituacao({ col: COL_ACOES, id, para: 'EM_ANDAMENTO', mapa: TRANSICOES_ACAO, rotulos: SITUACOES_ACAO, perm: 'qualidade_gerenciar', entidade: 'qualidade_acao', acao: 'INICIAR',
    texto: 'Ação iniciada', naoEncontrado: 'Ação não encontrada.' });

function concluirAcaoQualidade(id, resultado) {
    const texto = apoioTexto(resultado, 'Resultado da ação', { min: 5, max: 300 });
    return gestaoMudarSituacao({ col: COL_ACOES, id, para: 'CONCLUIDA', mapa: TRANSICOES_ACAO, rotulos: SITUACOES_ACAO, perm: 'qualidade_gerenciar', entidade: 'qualidade_acao', acao: 'CONCLUIR',
        texto, campos: (a, u, agora) => ({ resultado: texto, concluido_em: agora }), naoEncontrado: 'Ação não encontrada.' });
}

function cancelarAcaoQualidade(id, motivo) {
    const texto = apoioTexto(motivo, 'Motivo do cancelamento', { min: 5, max: 200 });
    return gestaoMudarSituacao({ col: COL_ACOES, id, para: 'CANCELADA', mapa: TRANSICOES_ACAO, rotulos: SITUACOES_ACAO, perm: 'qualidade_gerenciar', entidade: 'qualidade_acao', acao: 'CANCELAR',
        texto, campos: () => ({ cancelado_motivo: texto }), naoEncontrado: 'Ação não encontrada.' });
}

/** Muda o prazo de uma ação aberta. O prazo antigo fica na lista de reprogramações, com o motivo. */
async function reprogramarAcaoQualidade(id, novoPrazo, motivo) {
    requirePermission('qualidade_gerenciar');
    const prazo = apoioData(novoPrazo, 'Novo prazo');
    if (prazo < todayISO()) throw new Error('Novo prazo: não pode ser anterior a hoje.');
    const texto = apoioTexto(motivo, 'Motivo da reprogramação', { min: 5, max: 200 });
    const database = requireDb(); const user = state.currentUser; const agora = nowISO();
    let nova;
    await database.runTransaction(async (tx) => {
        const ref = database.collection(COL_ACOES).doc(String(id));
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error('Ação não encontrada.');
        const a = { id: snap.id, ...snap.data() };
        if (!acaoAberta(a)) throw new Error('Só se reprograma uma ação aberta. Atualize a tela.');
        if (a.prazo === prazo) throw new Error('O novo prazo é igual ao atual.');
        nova = { ...a, prazo, reprogramacoes: [...(a.reprogramacoes || []), { de: a.prazo, para: prazo, motivo: texto, em: agora, por: user.username, por_nome: user.name }],
            historico: [...(a.historico || []), apoioLinhaHistorico(a.status, user, agora, `Prazo de ${a.prazo} para ${prazo}: ${texto}`)] };
        tx.set(ref, nova);
    });
    await auditar({ entidade: 'qualidade_acao', entidade_id: id, acao: 'REPROGRAMAR', depois: { prazo }, motivo: texto });
    return nova;
}

// ============ Documentos versionados ============

/** Cadastra o documento com a versão 1. O código é o id (`doc_<código>`): o mesmo código não entra duas vezes. */
async function cadastrarDocumentoQualidade(form) {
    requirePermission('qualidade_gerenciar');
    const v = validarDocumentoQualidade(form);
    const database = requireDb(); const user = state.currentUser; const agora = nowISO();
    const id = `doc_${v.codigo}`;
    let d;
    await database.runTransaction(async (tx) => {
        const ref = database.collection(COL_DOCS).doc(id);
        const ja = await tx.get(ref);
        if (ja.exists) throw new Error(`Já existe um documento com o código ${v.codigo}. Use "Nova versão".`);
        d = { id, codigo: v.codigo, titulo: v.titulo, tipo: v.tipo, setor: v.setor, situacao: 'VIGENTE', criado_em: agora, ...apoioQuem(user),
            versoes: [{ numero: 1, ...v.versao, registrada_em: agora, por: user.username, por_nome: user.name }], historico: [apoioLinhaHistorico('VIGENTE', user, agora, 'Versão 1')] };
        tx.set(ref, d);
    });
    await auditar({ entidade: 'qualidade_doc', entidade_id: id, acao: 'CADASTRAR', depois: { codigo: d.codigo, tipo: d.tipo, setor: d.setor } });
    return d;
}

/** Acrescenta a versão seguinte (a anterior continua guardada). Só documento vigente aceita versão nova. */
async function novaVersaoDocumento(id, form) {
    requirePermission('qualidade_gerenciar');
    const v = validarVersaoDocumento(form);
    const database = requireDb(); const user = state.currentUser; const agora = nowISO();
    let d;
    await database.runTransaction(async (tx) => {
        const ref = database.collection(COL_DOCS).doc(String(id));
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error('Documento não encontrado.');
        const atual = { id: snap.id, ...snap.data() };
        if (atual.situacao !== 'VIGENTE') throw new Error('Documento obsoleto não recebe nova versão.');
        const ultima = docVersaoAtual(atual);
        if (ultima && v.aprovado_em < ultima.aprovado_em) throw new Error('A aprovação não pode ser anterior à da versão atual.');
        const numero = (ultima ? ultima.numero : 0) + 1;
        d = { ...atual, versoes: [...(atual.versoes || []), { numero, ...v, registrada_em: agora, por: user.username, por_nome: user.name }],
            historico: [...(atual.historico || []), apoioLinhaHistorico('VIGENTE', user, agora, `Versão ${numero}: ${v.resumo}`)] };
        tx.set(ref, d);
    });
    await auditar({ entidade: 'qualidade_doc', entidade_id: id, acao: 'NOVA_VERSAO', depois: { versao: d.versoes[d.versoes.length - 1].numero } });
    return d;
}

/** Marca o documento como obsoleto (motivo obrigatório). Continua consultável. */
async function tornarDocumentoObsoleto(id, motivo) {
    requirePermission('qualidade_gerenciar');
    const texto = apoioTexto(motivo, 'Motivo', { min: 5, max: 200 });
    const database = requireDb(); const user = state.currentUser; const agora = nowISO();
    let d;
    await database.runTransaction(async (tx) => {
        const ref = database.collection(COL_DOCS).doc(String(id));
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error('Documento não encontrado.');
        const atual = { id: snap.id, ...snap.data() };
        if (atual.situacao === 'OBSOLETO') throw new Error('Este documento já está obsoleto. Atualize a tela.');
        d = { ...atual, situacao: 'OBSOLETO', obsoleto_em: agora, obsoleto_motivo: texto, historico: [...(atual.historico || []), apoioLinhaHistorico('OBSOLETO', user, agora, texto)] };
        tx.set(ref, d);
    });
    await auditar({ entidade: 'qualidade_doc', entidade_id: id, acao: 'OBSOLETAR', motivo: texto });
    return d;
}
