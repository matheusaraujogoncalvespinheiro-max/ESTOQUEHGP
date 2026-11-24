// Ouvidoria (Etapa 10): registro e acompanhamento de manifestações (reclamação, sugestão, elogio, denúncia, solicitação e pedido de informação).
//
// O QUE É: a equipe da ouvidoria registra a manifestação (por qualquer canal), analisa, encaminha ao setor envolvido, registra a resposta e
// conclui. Cada manifestação tem protocolo, histórico de quem fez e quando, encaminhamentos e respostas que só acrescentam. A identificação de
// quem se manifestou é opcional (anônima) e pode ser sigilosa: só a ouvidoria a vê.
//
// O QUE NÃO É: não define prazo legal de resposta (o prazo é um campo opcional digitado pela ouvidoria), não envia a resposta ao
// manifestante (e-mail, carta e telefone ficam fora), não integra com a plataforma federal de ouvidorias e não classifica a denúncia
// (apuração, sindicância e processo ficam fora do sistema). Ver docs/pendencias.md.

const COL_OUVIDORIA = 'ouvidoria';

const TIPOS_MANIFESTACAO = { RECLAMACAO: 'Reclamação', SUGESTAO: 'Sugestão', ELOGIO: 'Elogio', DENUNCIA: 'Denúncia', SOLICITACAO: 'Solicitação', INFORMACAO: 'Pedido de informação' };
const CANAIS_OUVIDORIA = { PRESENCIAL: 'Presencial', TELEFONE: 'Telefone', EMAIL: 'E-mail', CARTA: 'Carta', SITE: 'Site ou formulário', CAIXA: 'Caixa de sugestões', OUTRO: 'Outro canal' };
const SITUACOES_OUVIDORIA = { RECEBIDA: 'Recebida', EM_ANALISE: 'Em análise', RESPONDIDA: 'Respondida', CONCLUIDA: 'Concluída', ARQUIVADA: 'Arquivada' };
const SITUACOES_OUVIDORIA_ABERTAS = ['RECEBIDA', 'EM_ANALISE', 'RESPONDIDA'];
const TRANSICOES_OUVIDORIA = {
    RECEBIDA: ['EM_ANALISE', 'ARQUIVADA'],
    EM_ANALISE: ['RESPONDIDA', 'ARQUIVADA'],
    RESPONDIDA: ['CONCLUIDA', 'EM_ANALISE']
};
const ouvidoriaAberta = (m) => SITUACOES_OUVIDORIA_ABERTAS.includes(m && m.status);

// ============ Regras puras (testáveis) ============

/** Valida o registro de uma manifestação. Anônima não guarda nome nem contato. */
function validarManifestacao(form, agora = new Date()) {
    const tipo = apoioEscolha(form.tipo, TIPOS_MANIFESTACAO, 'Tipo da manifestação');
    const canal = apoioEscolha(form.canal, CANAIS_OUVIDORIA, 'Canal de entrada');
    const anonima = form.anonima === true || form.anonima === 'true' || form.anonima === 'on';
    const out = {
        tipo, tipo_rotulo: TIPOS_MANIFESTACAO[tipo], canal,
        assunto: apoioTexto(form.assunto, 'Assunto', { min: 5, max: 100 }),
        descricao: apoioTexto(form.descricao, 'Descrição', { min: 10, max: 1000 }),
        setor_envolvido: apoioTexto(form.setor_envolvido, 'Setor envolvido', { max: 60 }),
        anonima, sigilo: false, manifestante: '', contato: '',
        recebida_em: apoioDataHora(form.recebida_em, 'Data e hora do recebimento', { agora, maxAntesHoras: 24 * 60 }),
        prazo_resposta: ''
    };
    if (!anonima) {
        out.manifestante = apoioTexto(form.manifestante, 'Nome de quem se manifestou', { min: 3, max: 100 });
        out.contato = apoioTexto(form.contato, 'Contato', { max: 60 });
        out.sigilo = form.sigilo === true || form.sigilo === 'true' || form.sigilo === 'on';
    }
    if (String(form.prazo_resposta || '').trim()) {
        out.prazo_resposta = apoioData(form.prazo_resposta, 'Prazo de resposta');
        if (out.prazo_resposta < todayISO(new Date(out.recebida_em))) throw new Error('Prazo de resposta: não pode ser anterior ao recebimento.');
    }
    return out;
}

/** Texto da resposta, com data e hora (não futura, não anterior ao recebimento). */
function validarRespostaOuvidoria(form, m, agora = new Date()) {
    const em = apoioDataHora(form.em, 'Data e hora da resposta', { agora, maxAntesHoras: 24 * 60 });
    if (m && new Date(em).getTime() < new Date(m.recebida_em).getTime()) throw new Error('A resposta não pode ser anterior ao recebimento.');
    return { texto: apoioTexto(form.texto, 'Resposta', { min: 10, max: 1000 }), forma: apoioTexto(form.forma, 'Forma de envio (ex.: telefone, e-mail)', { max: 60 }), em };
}

/** Manifestação com prazo vencido: aberta (ainda sem resposta) e com prazo digitado anterior a `hoje`. */
const ouvidoriaVencida = (m, hoje = todayISO()) => Boolean(m && ['RECEBIDA', 'EM_ANALISE'].includes(m.status) && m.prazo_resposta && m.prazo_resposta < hoje);

/** Indicadores do período (por data de recebimento): totais, por tipo, abertas, vencidas e tempo médio até a primeira resposta (dias). */
function indicadoresOuvidoria(lista, de = '', ate = '', hoje = todayISO()) {
    const todas = lista || [];
    const noPeriodo = todas.filter(m => (!de || m.dia >= de) && (!ate || m.dia <= ate));
    const porTipo = {}; noPeriodo.forEach(m => { porTipo[m.tipo] = (porTipo[m.tipo] || 0) + 1; });
    const respondidas = noPeriodo.filter(m => (m.respostas || []).length);
    return {
        total: noPeriodo.length, por_tipo: porTipo,
        em_aberto: todas.filter(ouvidoriaAberta).length,
        vencidas: todas.filter(m => ouvidoriaVencida(m, hoje)).length,
        concluidas: noPeriodo.filter(m => m.status === 'CONCLUIDA').length,
        arquivadas: noPeriodo.filter(m => m.status === 'ARQUIVADA').length,
        dias_ate_responder: gestaoMedia(respondidas.map(m => gestaoDiasEntre(m.recebida_em, m.respostas[0].em)))
    };
}

// ============ Gravação (Firestore) ============

function registrarManifestacao(form) {
    requirePermission('ouvidoria_gerenciar');
    const v = validarManifestacao(form);
    const user = state.currentUser;
    return gestaoCriarNumerado({
        col: COL_OUVIDORIA, contador: 'ouvidoria', prefixo: 'OV', prefixoId: 'ouv', entidade: 'ouvidoria',
        monta: () => ({ ...v, status: 'RECEBIDA', responsavel: '', responsavel_nome: '', encaminhamentos: [], respostas: [], concluido_em: '', arquivado_motivo: '',
            historico: [apoioLinhaHistorico('RECEBIDA', user, nowISO(), `Recebida por ${CANAIS_OUVIDORIA[v.canal]}`)] }),
        resumoAuditoria: (m) => ({ protocolo: m.protocolo, tipo: m.tipo, canal: m.canal, anonima: m.anonima, setor_envolvido: m.setor_envolvido })
    });
}

const analisarManifestacao = (id) => gestaoMudarSituacao({ col: COL_OUVIDORIA, id, para: 'EM_ANALISE', mapa: TRANSICOES_OUVIDORIA, rotulos: SITUACOES_OUVIDORIA, perm: 'ouvidoria_gerenciar', entidade: 'ouvidoria', acao: 'ANALISAR',
    texto: 'Análise iniciada', campos: (m, u) => ({ responsavel: m.responsavel || u.username, responsavel_nome: m.responsavel_nome || u.name }), naoEncontrado: 'Manifestação não encontrada.' });

/** Registra o encaminhamento ao setor envolvido (não muda a situação; vale enquanto a manifestação não foi respondida). */
async function encaminharManifestacao(id, form) {
    requirePermission('ouvidoria_gerenciar');
    const setor = apoioTexto(form.setor, 'Setor de destino', { min: 2, max: 60 });
    const observacao = apoioTexto(form.observacao, 'Observação', { max: 200 });
    const database = requireDb(); const user = state.currentUser; const agora = nowISO();
    let nova;
    await database.runTransaction(async (tx) => {
        const ref = database.collection(COL_OUVIDORIA).doc(String(id));
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error('Manifestação não encontrada.');
        const m = { id: snap.id, ...snap.data() };
        if (!['RECEBIDA', 'EM_ANALISE'].includes(m.status)) throw new Error('Só se encaminha uma manifestação ainda sem resposta. Atualize a tela.');
        nova = { ...m, encaminhamentos: [...(m.encaminhamentos || []), { setor, observacao, em: agora, por: user.username, por_nome: user.name }],
            historico: [...(m.historico || []), apoioLinhaHistorico(m.status, user, agora, `Encaminhada ao setor ${setor}`)] };
        tx.set(ref, nova);
    });
    await auditar({ entidade: 'ouvidoria', entidade_id: id, acao: 'ENCAMINHAR', depois: { setor }, motivo: observacao });
    return nova;
}

function responderManifestacao(id, form) {
    const v = validarRespostaOuvidoria(form, null);
    return gestaoMudarSituacao({ col: COL_OUVIDORIA, id, para: 'RESPONDIDA', mapa: TRANSICOES_OUVIDORIA, rotulos: SITUACOES_OUVIDORIA, perm: 'ouvidoria_gerenciar', entidade: 'ouvidoria', acao: 'RESPONDER',
        texto: 'Resposta registrada', naoEncontrado: 'Manifestação não encontrada.',
        autoriza: (m) => { if (new Date(v.em).getTime() < new Date(m.recebida_em).getTime()) throw new Error('A resposta não pode ser anterior ao recebimento.'); },
        campos: (m, u) => ({ respostas: [...(m.respostas || []), { ...v, por: u.username, por_nome: u.name }] }) });
}

const concluirManifestacao = (id, observacao = '') => gestaoMudarSituacao({ col: COL_OUVIDORIA, id, para: 'CONCLUIDA', mapa: TRANSICOES_OUVIDORIA, rotulos: SITUACOES_OUVIDORIA, perm: 'ouvidoria_gerenciar', entidade: 'ouvidoria', acao: 'CONCLUIR',
    texto: apoioTexto(observacao, 'Observação', { max: 200 }) || 'Manifestação concluída', campos: (m, u, agora) => ({ concluido_em: agora }), naoEncontrado: 'Manifestação não encontrada.' });

/** Reabre uma manifestação respondida (a resposta não foi suficiente). Motivo obrigatório. */
function reabrirManifestacao(id, motivo) {
    const texto = apoioTexto(motivo, 'Motivo da reabertura', { min: 5, max: 200 });
    return gestaoMudarSituacao({ col: COL_OUVIDORIA, id, para: 'EM_ANALISE', mapa: TRANSICOES_OUVIDORIA, rotulos: SITUACOES_OUVIDORIA, perm: 'ouvidoria_gerenciar', entidade: 'ouvidoria', acao: 'REABRIR', texto, naoEncontrado: 'Manifestação não encontrada.' });
}

/** Arquiva (sem resposta), com motivo. */
function arquivarManifestacao(id, motivo) {
    const texto = apoioTexto(motivo, 'Motivo do arquivamento', { min: 5, max: 200 });
    return gestaoMudarSituacao({ col: COL_OUVIDORIA, id, para: 'ARQUIVADA', mapa: TRANSICOES_OUVIDORIA, rotulos: SITUACOES_OUVIDORIA, perm: 'ouvidoria_gerenciar', entidade: 'ouvidoria', acao: 'ARQUIVAR', texto,
        campos: () => ({ arquivado_motivo: texto }), naoEncontrado: 'Manifestação não encontrada.' });
}
