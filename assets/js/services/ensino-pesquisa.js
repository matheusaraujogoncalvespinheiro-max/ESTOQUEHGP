// Ensino e pesquisa (Etapa 10): estágios, treinamentos, aulas, visitas técnicas e projetos de pesquisa realizados no hospital.
//
// O QUE É: um registro por atividade (tipo, título, instituição, responsável, setor, período, número de participantes) com situação
// (planejado, em andamento, concluído, cancelado), resultado ao concluir e histórico de quem fez e quando. Para projeto de pesquisa guarda
// o número do parecer do comitê de ética (digitado).
//
// O QUE NÃO É: não lista nomes de participantes (alunos, pacientes ou voluntários da pesquisa), não guarda dados de pesquisa nem termos de
// consentimento, não valida o parecer do comitê de ética nem impede iniciar sem ele (a tela só avisa), não controla vagas, frequência,
// notas, convênio com a instituição de ensino nem a escala do estagiário. Ver docs/pendencias.md.

const COL_ENSINO = 'ensino_pesquisa';

const TIPOS_ENSINO = { ESTAGIO: 'Estágio', TREINAMENTO: 'Treinamento interno', AULA: 'Aula ou palestra', VISITA: 'Visita técnica', PESQUISA: 'Projeto de pesquisa', OUTRO: 'Outra atividade' };
const SITUACOES_ENSINO = { PLANEJADO: 'Planejado', EM_ANDAMENTO: 'Em andamento', CONCLUIDO: 'Concluído', CANCELADO: 'Cancelado' };
const SITUACOES_ENSINO_ABERTAS = ['PLANEJADO', 'EM_ANDAMENTO'];
const TRANSICOES_ENSINO = { PLANEJADO: ['EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO'], EM_ANDAMENTO: ['CONCLUIDO', 'CANCELADO'] };

/** Pesquisa em andamento sem número de parecer do comitê de ética: só um aviso informativo. */
const ensinoSemParecer = (a) => Boolean(a && a.tipo === 'PESQUISA' && ['EM_ANDAMENTO', 'CONCLUIDO'].includes(a.status) && !a.parecer_cep);

function validarAtividadeEnsino(form, agora = new Date()) {
    const tipo = apoioEscolha(form.tipo, TIPOS_ENSINO, 'Tipo da atividade');
    const inicio = apoioData(form.inicio, 'Início');
    const fim = String(form.fim || '').trim() ? apoioData(form.fim, 'Fim') : '';
    if (fim && fim < inicio) throw new Error('Fim: não pode ser anterior ao início.');
    const bruto = String(form.participantes ?? '').trim();
    return {
        tipo, tipo_rotulo: TIPOS_ENSINO[tipo],
        titulo: apoioTexto(form.titulo, 'Título', { min: 5, max: 120 }),
        instituicao: apoioTexto(form.instituicao, 'Instituição', { max: 80 }),
        responsavel: apoioTexto(form.responsavel, 'Responsável no hospital', { min: 3, max: 80 }),
        setor: apoioTexto(form.setor, 'Setor', { min: 2, max: 60 }),
        inicio, fim,
        participantes: bruto === '' ? null : apoioInteiro(bruto, 'Participantes', 0, 9999),
        parecer_cep: tipo === 'PESQUISA' ? apoioTexto(form.parecer_cep, 'Nº do parecer do comitê de ética', { max: 40 }) : '',
        observacao: apoioTexto(form.observacao, 'Observação', { max: 200 })
    };
}

/** Indicadores do período (atividades que começam no período). */
function indicadoresEnsino(lista, de = '', ate = '') {
    const todas = lista || [];
    const noPeriodo = todas.filter(a => (!de || a.inicio >= de) && (!ate || a.inicio <= ate));
    const porTipo = {}; noPeriodo.forEach(a => { porTipo[a.tipo] = (porTipo[a.tipo] || 0) + 1; });
    return {
        total: noPeriodo.length, por_tipo: porTipo, em_aberto: todas.filter(a => SITUACOES_ENSINO_ABERTAS.includes(a.status)).length,
        concluidas: noPeriodo.filter(a => a.status === 'CONCLUIDO').length, canceladas: noPeriodo.filter(a => a.status === 'CANCELADO').length,
        participantes: noPeriodo.filter(a => a.status !== 'CANCELADO').reduce((s, a) => s + (a.participantes || 0), 0),
        pesquisas_sem_parecer: todas.filter(ensinoSemParecer).length
    };
}

function registrarAtividadeEnsino(form) {
    requirePermission('ensino_gerenciar');
    const v = validarAtividadeEnsino(form);
    const user = state.currentUser;
    return gestaoCriarNumerado({
        col: COL_ENSINO, contador: 'ensino_pesquisa', prefixo: 'EP', prefixoId: 'ens', entidade: 'ensino_pesquisa',
        monta: () => ({ ...v, status: 'PLANEJADO', resultado: '', concluido_em: '', cancelado_motivo: '', historico: [apoioLinhaHistorico('PLANEJADO', user, nowISO(), 'Atividade registrada')] }),
        resumoAuditoria: (a) => ({ protocolo: a.protocolo, tipo: a.tipo, setor: a.setor })
    });
}

const iniciarAtividadeEnsino = (id) => gestaoMudarSituacao({ col: COL_ENSINO, id, para: 'EM_ANDAMENTO', mapa: TRANSICOES_ENSINO, rotulos: SITUACOES_ENSINO, perm: 'ensino_gerenciar', entidade: 'ensino_pesquisa', acao: 'INICIAR',
    texto: 'Atividade iniciada', naoEncontrado: 'Atividade não encontrada.' });

function concluirAtividadeEnsino(id, resultado) {
    const texto = apoioTexto(resultado, 'Resultado ou balanço', { min: 5, max: 300 });
    return gestaoMudarSituacao({ col: COL_ENSINO, id, para: 'CONCLUIDO', mapa: TRANSICOES_ENSINO, rotulos: SITUACOES_ENSINO, perm: 'ensino_gerenciar', entidade: 'ensino_pesquisa', acao: 'CONCLUIR',
        texto, campos: (a, u, agora) => ({ resultado: texto, concluido_em: agora }), naoEncontrado: 'Atividade não encontrada.' });
}

function cancelarAtividadeEnsino(id, motivo) {
    const texto = apoioTexto(motivo, 'Motivo do cancelamento', { min: 5, max: 200 });
    return gestaoMudarSituacao({ col: COL_ENSINO, id, para: 'CANCELADO', mapa: TRANSICOES_ENSINO, rotulos: SITUACOES_ENSINO, perm: 'ensino_gerenciar', entidade: 'ensino_pesquisa', acao: 'CANCELAR',
        texto, campos: () => ({ cancelado_motivo: texto }), naoEncontrado: 'Atividade não encontrada.' });
}
