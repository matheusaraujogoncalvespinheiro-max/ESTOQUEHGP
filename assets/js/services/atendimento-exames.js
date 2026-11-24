// Atendimento na fila de EXAMES (Etapa 4): o paciente encaminhado pelo médico (ou com atendimento do tipo "Exame") é chamado,
// atendido pela equipe do exame e, ao final, ou tem o atendimento concluído ou volta para a fila médica (reavaliação).
//
// O QUE É: continua o mesmo ATENDIMENTO (coleção `atendimentos`) com as mesmas regras de chamada da triagem e do atendimento
// médico (services/triagem-clinica.js). A situação de cada EXAME segue na central de Imagenologia/Ultrassonografia
// (services/hospital.js); esta tela só cuida de chamar o paciente e encerrar o atendimento dele na fila.
//
// O QUE NÃO É: não marca exame como realizado (isso exige a confirmação e o profissional na central do exame), não decide se o
// paciente deve voltar ao médico e não muda a prioridade clínica.

const DESFECHOS_EXAMES = {
    CONCLUIR: 'Atendimento de exames concluído',
    DEVOLVER_MEDICO: 'Devolver ao médico (reavaliação)'
};

/** Valida a conclusão. `abertos`: exames deste atendimento que ainda não foram realizados nem cancelados. */
function validarConclusaoExames(form, { abertos = 0 } = {}) {
    const tipo = form.tipo;
    if (!DESFECHOS_EXAMES[tipo]) throw new Error('Escolha como o atendimento de exames termina.');
    const texto = String(form.texto || '').trim();
    if (texto.length > 500) throw new Error('Observações: no máximo 500 caracteres.');
    if (tipo === 'DEVOLVER_MEDICO' && texto.length < 5) throw new Error('Informe o motivo de devolver o paciente ao médico (mínimo 5 letras).');
    if (tipo === 'CONCLUIR' && abertos > 0 && texto.length < 5) throw new Error(`Há ${abertos} exame(s) deste atendimento ainda em aberto: descreva o motivo de concluir (por exemplo, exame agendado para outro dia).`);
    return { tipo, texto };
}

/** Exames deste atendimento que ainda não terminaram (realizados ou cancelados). */
const examesAbertosDoAtendimento = (atendimentoId, solicitacoes) => (solicitacoes || []).filter(s => s.atendimento_id === atendimentoId && !statusEncerrado(s.status));

/**
 * Encerra o atendimento na fila de exames: concluído, ou devolvido à fila médica mantendo o risco e a hora de chegada.
 * Só quem iniciou o atendimento (ou o administrador) encerra.
 */
function concluirAtendimentoExames(id, form) {
    return transitarAtendimento(id, {
        permissao: 'atendimento_exames', de: ['EM_ATENDIMENTO'], acaoAuditoria: 'EXAMES_CONCLUIR',
        mudar: (at, { agora, user }) => {
            if (at.fila !== 'EXAMES') throw new Error('Este atendimento não está na fila de exames.');
            if (at.em_atendimento_por !== user.username && user.role !== 'ADMIN') throw new Error(`Este atendimento está com ${at.em_atendimento_por_nome || 'outro profissional'}.`);
            const c = validarConclusaoExames(form, { abertos: examesAbertosDoAtendimento(id, MOCK_DATA.SOLICITACOES_EXAME).length });
            const desfecho = { tipo: c.tipo, texto: c.texto, em: agora, por: user.username, por_nome: user.name };
            const limpar = { chamada: null, em_atendimento_por: '', em_atendimento_por_nome: '', em_atendimento_em: '', local_id: '', local_nome: '' };
            if (c.tipo === 'DEVOLVER_MEDICO') {
                if (at.dia !== todayISO()) throw new Error('Só é possível devolver ao médico no mesmo dia do atendimento. Peça à Recepção um novo check-in.');
                return { novo: { ...limpar, status: 'AGUARDANDO', fila: 'MEDICO', desfecho_exames: desfecho, retorno_de_exames_em: agora },
                    motivo: `Exames concluídos; devolvido ao médico: ${c.texto}`, depois: { status: 'AGUARDANDO', fila: 'MEDICO' } };
            }
            return { novo: { ...limpar, status: 'CONCLUIDO', concluido_em: agora, desfecho_exames: desfecho },
                motivo: `Atendimento de exames concluído${c.texto ? ': ' + c.texto : ''}`, depois: { status: 'CONCLUIDO', fila: 'EXAMES' } };
        }
    });
}
