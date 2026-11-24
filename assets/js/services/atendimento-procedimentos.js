// Atendimento na fila de PROCEDIMENTOS (Etapa 8): o paciente encaminhado pelo médico (ou com atendimento do tipo "Procedimento") é
// chamado, atendido pela equipe do procedimento e, ao final, tem o atendimento concluído (procedimento realizado ou não) ou volta
// para a fila médica (reavaliação).
//
// O QUE É: continua o mesmo ATENDIMENTO (coleção `atendimentos`) com as mesmas regras de chamada da triagem, do atendimento médico e
// dos exames (services/triagem-clinica.js). Ao concluir, o profissional assina com o registro no conselho e a conclusão entra no
// PRONTUÁRIO como registro "Procedimento realizado" (tipo PROCEDIMENTO), que não se altera (correção por complemento).
//
// O QUE NÃO É: não escolhe nem sugere o procedimento, não controla material, sala ou consentimento e não substitui a agenda de
// procedimentos antiga (Procedimentos › Agenda), que continua à parte (docs/pendencias.md).

const DESFECHOS_PROCEDIMENTO = {
    REALIZADO: 'Procedimento realizado',
    NAO_REALIZADO: 'Procedimento não realizado',
    DEVOLVER_MEDICO: 'Devolver ao médico (reavaliação)'
};

/** Valida a conclusão. Devolve os campos normalizados; só o desfecho "realizado" exige o nome do procedimento. */
function validarConclusaoProcedimento(form) {
    const tipo = form.tipo;
    if (!DESFECHOS_PROCEDIMENTO[tipo]) throw new Error('Escolha como o atendimento do procedimento termina.');
    const t = (v, max, rotulo) => { const x = String(v || '').trim(); if (x.length > max) throw new Error(`${rotulo}: no máximo ${max} caracteres.`); return x; };
    const procedimento = t(form.procedimento, 200, 'Procedimento');
    const intercorrencia = t(form.intercorrencia, 500, 'Intercorrências');
    const texto = t(form.texto, 500, 'Observações');
    const registro = t(form.registro_conselho, 30, 'Registro no conselho');
    if (tipo === 'REALIZADO' && procedimento.length < 3) throw new Error('Informe o procedimento que foi realizado.');
    if (tipo !== 'REALIZADO' && texto.length < 5) throw new Error(tipo === 'DEVOLVER_MEDICO' ? 'Informe o motivo de devolver o paciente ao médico (mínimo 5 letras).' : 'Informe o motivo de o procedimento não ter sido realizado (mínimo 5 letras).');
    if (registro.length < 3) throw new Error('Informe o seu registro no conselho profissional (COREN/CRM) para assinar o registro.');
    return { tipo, procedimento, intercorrencia, texto, registro_conselho: registro };
}

/** Texto assinado que entra no prontuário. */
function textoProcedimentoRealizado(c, at) {
    const linhas = [`Atendimento ${at.senha} · ${at.tipo_nome || 'Procedimento'}`];
    if (at.queixa) linhas.push(`Solicitado: ${at.queixa}`);
    linhas.push(`${DESFECHOS_PROCEDIMENTO[c.tipo]}${c.procedimento ? ': ' + c.procedimento : ''}`);
    if (c.intercorrencia) linhas.push(`Intercorrências: ${c.intercorrencia}`);
    if (c.texto) linhas.push(`Observações: ${c.texto}`);
    return linhas.join('\n');
}

/** Registro do prontuário gerado pela conclusão (um só). */
function montarRegistroProcedimento(c, at, user, agora) {
    const conteudo = normalizarConteudoClinico({ tipo: 'PROCEDIMENTO', texto: textoProcedimentoRealizado(c, at) });
    return { id: newId('clin'), paciente_id: at.paciente_id, internacao_id: '', atendimento_id: at.id, atendimento_senha: at.senha, complementa_id: '', solicitacao_id: '',
        tipo: 'PROCEDIMENTO', texto: conteudo.texto, itens: conteudo.itens, cid: conteudo.cid, autor: user.username, autor_nome: user.name, perfil: user.role,
        registro_conselho: c.registro_conselho, em: agora, assinado: true };
}

/**
 * Encerra o atendimento na fila de procedimentos numa transação: grava o desfecho e o registro assinado do prontuário.
 * Concluído, ou devolvido à fila médica mantendo o risco e a hora de chegada. Só quem iniciou o atendimento (ou o administrador) encerra.
 */
async function concluirAtendimentoProcedimento(id, form, { paciente = null } = {}) {
    const c = validarConclusaoProcedimento(form);
    // Só quem tem acesso ao prontuário o abre (enfermagem, médico). Centro cirúrgico e hemodinâmica concluem sem abri-lo: o registro assinado
    // entra no prontuário do paciente do mesmo jeito e aparece quando alguém com acesso o abrir.
    if (paciente && hasPermission('prontuario_ver')) await abrirProntuario(paciente);
    return transitarAtendimento(id, {
        permissao: 'atendimento_procedimentos', de: ['EM_ATENDIMENTO'], acaoAuditoria: 'PROCEDIMENTO_CONCLUIR',
        mudar: (at, { agora, user }) => {
            if (at.fila !== 'PROCEDIMENTOS') throw new Error('Este atendimento não está na fila de procedimentos.');
            if (at.em_atendimento_por !== user.username && user.role !== 'ADMIN') throw new Error(`Este atendimento está com ${at.em_atendimento_por_nome || 'outro profissional'}.`);
            const desfecho = { tipo: c.tipo, procedimento: c.procedimento, texto: c.texto, em: agora, por: user.username, por_nome: user.name };
            const limpar = { chamada: null, em_atendimento_por: '', em_atendimento_por_nome: '', em_atendimento_em: '', local_id: '', local_nome: '' };
            const registro = montarRegistroProcedimento(c, at, user, agora);
            const base = { motivo: `${DESFECHOS_PROCEDIMENTO[c.tipo]}${c.texto ? ': ' + c.texto : ''}`, gravar: [{ col: COLH.REGISTROS, obj: registro }] };
            if (c.tipo === 'DEVOLVER_MEDICO') {
                if (at.dia !== todayISO()) throw new Error('Só é possível devolver ao médico no mesmo dia do atendimento. Peça à Recepção um novo check-in.');
                return { ...base, novo: { ...limpar, status: 'AGUARDANDO', fila: 'MEDICO', desfecho_procedimento: desfecho, retorno_de_procedimento_em: agora }, depois: { status: 'AGUARDANDO', fila: 'MEDICO' } };
            }
            return { ...base, novo: { ...limpar, status: 'CONCLUIDO', concluido_em: agora, desfecho_procedimento: desfecho }, depois: { status: 'CONCLUIDO', fila: 'PROCEDIMENTOS', desfecho: c.tipo } };
        }
    });
}
