// Fila de leito e disponibilidade (Etapa 5): pacientes com indicação de internação esperando um leito.
//
// O QUE É: o atendimento que o médico encerra com "Indicação de internação" (ou que a recepção abre como internação eletiva) fica
// na fila INTERNACAO, Aguardando. Aqui a enfermagem/recepção registra o que o leito precisa ter (ala, isolamento), vê os leitos
// livres e ALOCA: numa única transação nasce a internação (ligada ao atendimento), o leito passa a Ocupado e o atendimento fica
// Concluído com o leito no histórico. Também é possível devolver o paciente ao médico ou encerrar a espera sem internar (com motivo).
// O resumo de disponibilidade (por andar e ala) alimenta o painel de leitos, que nunca traz o nome do paciente.
//
// O QUE NÃO É: não decide prioridade clínica (a ordem usa o risco que a triagem já classificou, o atendimento preferencial previsto
// em lei e a hora da indicação; essa regra deve ser confirmada pelo hospital), não reserva leito (alocar já é internar) e não cria
// protocolo de isolamento: "isolamento" é o que o profissional pede e o que o cadastro do leito informa.

const TIPO_LEITO_ISOLAMENTO = 'Isolamento';   // valor de TIPOS_LEITO no cadastro de Quartos e Leitos
const MOTIVOS_ENCERRAR_ESPERA = {
    RECUSA: 'Paciente ou família recusou a internação',
    OUTRO_SERVICO: 'Encaminhado a outro serviço ou hospital',
    REVISTA: 'Indicação revista pelo médico',
    OUTRO: 'Outro motivo'
};

// ============ Regras puras (testáveis) ============

/** Hora em que a internação foi indicada (ou a chegada, no caso de internação eletiva sem indicação médica). */
const marcoDaIndicacao = (a) => String((a.desfecho && a.desfecho.em) || a.chegada_em || '');

/**
 * Ordem da fila de leito: nível de risco já classificado (do mais grave ao menos grave; sem classificação por último),
 * depois preferencial e depois quem teve a internação indicada primeiro. A regra de ordem deve ser confirmada pelo hospital.
 */
function ordenarFilaLeito(lista) {
    const peso = (a) => { const i = NIVEIS_RISCO.findIndex(n => n.id === a.risco); return i < 0 ? 99 : i; };
    return [...lista].sort((a, b) => (peso(a) - peso(b)) || (Number(Boolean(b.preferencial)) - Number(Boolean(a.preferencial))) || marcoDaIndicacao(a).localeCompare(marcoDaIndicacao(b)));
}

/** Quem está esperando leito agora (sem corte por dia: quem espera de um dia para o outro continua na fila). */
const filaDeLeito = (lista = MOCK_DATA.FILA_LEITO) => ordenarFilaLeito((lista || []).filter(a => a.fila === 'INTERNACAO' && a.status === 'AGUARDANDO'));

/** Resumo da fila para os cartões da tela. */
function resumoFilaLeito(fila, agora = new Date().toISOString()) {
    const esperas = fila.map(a => esperaMinutos(marcoDaIndicacao(a), agora));
    return {
        aguardando: fila.length,
        preferenciais: fila.filter(a => a.preferencial).length,
        com_requisitos: fila.filter(a => a.requisitos_leito && (a.requisitos_leito.ala || a.requisitos_leito.isolamento)).length,
        espera_media: esperas.length ? Math.round(esperas.reduce((s, v) => s + v, 0) / esperas.length) : 0,
        espera_maior: esperas.length ? Math.max(...esperas) : 0
    };
}

/** Valida o que o leito precisa ter. `alasValidas`: nomes de ala da estrutura (vazio = não confere). */
function validarRequisitosLeito(form, alasValidas = []) {
    const ala = String(form.ala || '').trim();
    if (ala && alasValidas.length && !alasValidas.includes(ala)) throw new Error('Escolha uma ala da lista.');
    const observacao = String(form.observacao || '').trim();
    if (observacao.length > 200) throw new Error('Observações: no máximo 200 caracteres.');
    return { ala, isolamento: Boolean(form.isolamento), observacao };
}

/** O leito atende ao que foi pedido? Devolve { ok, divergencias: [texto] }. Sem requisitos, qualquer leito serve. */
function compatibilidadeLeito(requisitos, leito) {
    const r = requisitos || {};
    const divergencias = [];
    if (r.ala && leito.ala !== r.ala) divergencias.push(`Ala pedida: ${r.ala} (o leito está em ${leito.ala})`);
    if (r.isolamento && leito.tipo_leito !== TIPO_LEITO_ISOLAMENTO) divergencias.push('Isolamento pedido: este leito não está cadastrado como leito de isolamento');
    return { ok: !divergencias.length, divergencias };
}

/** Leitos LIVRES com a compatibilidade para um paciente; os que atendem ao pedido vêm primeiro. */
function leitosLivresParaAlocar(requisitos, leitos = estruturaHospital(), estado = estadoLeito) {
    return leitos.filter(l => estado(l.id).status === 'LIVRE')
        .map(l => ({ leito: l, ...compatibilidadeLeito(requisitos, l) }))
        .sort((a, b) => (Number(b.ok) - Number(a.ok)) || a.leito.id.localeCompare(b.leito.id, 'pt-BR', { numeric: true }));
}

/** Primeiro da fila (na ordem) cujo pedido este leito atende: é quem deve receber o leito sem justificativa. */
const primeiroCompativelDaFila = (fila, leito) => fila.find(a => compatibilidadeLeito(a.requisitos_leito, leito).ok) || null;

/**
 * Confere a alocação antes de gravar. Lança Error com a primeira falha; devolve { divergencias, foraDaOrdem, motivo }.
 * ctx: { at, leito, estado, paciente, internacaoAtiva, fila }. Motivo é obrigatório quando o leito não atende ao pedido
 * ou quando outro paciente da fila, que o leito atende, estava na frente.
 */
function validarAlocacao(form, ctx) {
    const { at, leito, estado, paciente, internacaoAtiva, fila } = ctx;
    if (!at || at.fila !== 'INTERNACAO' || at.status !== 'AGUARDANDO') throw new Error('Este paciente não está mais aguardando leito. Atualize a tela.');
    if (!leito) throw new Error('Escolha um leito da estrutura do hospital.');
    if (!estado || estado.status !== 'LIVRE') throw new Error(`O leito ${leito.rotulo} não está livre (${rotuloStatusLeito(estado && estado.status)}).`);
    if (!paciente) throw new Error('Paciente não encontrado.');
    if (paciente.ativo === false) throw new Error('Este cadastro de paciente está inativo.');
    if (internacaoAtiva) throw new Error('Este paciente já possui uma internação ativa.');
    const setor = String(form.setor_origem || '').trim();
    if (setor.length < 2) throw new Error('Informe o setor de origem.');
    if (setor.length > 80) throw new Error('Setor de origem: no máximo 80 caracteres.');
    const motivo = String(form.motivo || '').trim();
    if (motivo.length > 200) throw new Error('Motivo: no máximo 200 caracteres.');
    const compat = compatibilidadeLeito(at.requisitos_leito, leito);
    const primeiro = primeiroCompativelDaFila(fila, leito);
    const foraDaOrdem = Boolean(primeiro && primeiro.id !== at.id);
    if (!compat.ok && motivo.length < 5) throw new Error('O leito não atende ao que foi pedido: informe o motivo de alocar mesmo assim (mínimo 5 letras).');
    if (foraDaOrdem && motivo.length < 5) throw new Error(`Há outro paciente na frente da fila para este leito (senha ${primeiro.senha}): informe o motivo de alocar fora da ordem (mínimo 5 letras).`);
    return { setor_origem: setor, divergencias: compat.divergencias, foraDaOrdem, motivo };
}

/**
 * Monta, sem gravar, o que a alocação produz: a internação (ligada ao atendimento), o leito ocupado e o atendimento concluído.
 * O histórico do atendimento ganha as duas situações do caminho (Em atendimento "Alocação de leito" → Concluído "Internado no leito X").
 */
function montarAlocacao(at, paciente, leito, { setor_origem, motivo = '', divergencias = [] }, agora, user) {
    const extras = { atendimento_id: at.id, atendimento_senha: at.senha, origem: 'FILA_LEITO' };
    if (motivo) extras.motivo_alocacao = motivo;
    if (divergencias.length) extras.divergencias_alocacao = divergencias;
    const { internacao, leitoNovo } = montarInternacao({ paciente, leito, setor_origem, extras }, agora, { por: user.username, por_nome: user.name });
    const limpar = { chamada: null, em_atendimento_por: '', em_atendimento_por_nome: '', em_atendimento_em: '', local_id: '', local_nome: '' };
    const historico = [...(at.historico_status || []), ...linhasDoCaminho(at.status, ['EM_ATENDIMENTO'], 'CONCLUIDO', {
        fila: at.fila, agora, user, motivoVia: 'Alocação de leito', motivo: `Internado no leito ${leito.rotulo}${motivo ? ` · ${motivo}` : ''}`
    })];
    const atendimento = { ...at, ...limpar, status: 'CONCLUIDO', concluido_em: agora, internacao_id: internacao.id, leito_id: leito.id, leito_rotulo: leito.rotulo, historico_status: historico };
    return { internacao, leitoNovo, atendimento };
}

const contagemVazia = () => ({ total: 0, LIVRE: 0, OCUPADO: 0, HIGIENIZACAO: 0, BLOQUEADO: 0 });
const taxaDeOcupacao = (c) => (c.total ? Math.round((c.OCUPADO / c.total) * 100) : 0);

/**
 * Disponibilidade para o painel: totais gerais e por andar → ala (livres, ocupados, em higienização, bloqueados e taxa de ocupação),
 * mais os leitos de isolamento. Não traz nada do paciente.
 */
function resumoDisponibilidade(leitos = estruturaHospital(), estado = estadoLeito) {
    const somar = (c, e) => { c.total += 1; if (c[e.status] !== undefined) c[e.status] += 1; };
    const geral = contagemVazia();
    const isolamento = { cadastrados: 0, livres: 0, bloqueados_por_isolamento: 0 };
    const andares = arvoreHospital(leitos).map(a => {
        const contA = contagemVazia();
        const alas = a.alas.map(al => {
            const contL = contagemVazia();
            al.quartos.forEach(q => q.leitos.forEach(l => {
                const e = estado(l.id);
                somar(contL, e); somar(contA, e); somar(geral, e);
                if (l.tipo_leito === TIPO_LEITO_ISOLAMENTO) { isolamento.cadastrados += 1; if (e.status === 'LIVRE') isolamento.livres += 1; }
                if (e.status === 'BLOQUEADO' && categoriaDoBloqueio(e) === 'ISOLAMENTO') isolamento.bloqueados_por_isolamento += 1;
            }));
            return { ala: al.ala, ...contL, taxa: taxaDeOcupacao(contL) };
        });
        return { andar: a.andar, andarNome: a.andarNome, ...contA, taxa: taxaDeOcupacao(contA), alas };
    });
    return { geral: { ...geral, taxa: taxaDeOcupacao(geral) }, andares, isolamento };
}

/** Nomes de ala existentes na estrutura (para o campo "ala pedida"). */
const alasDaEstrutura = (leitos = estruturaHospital()) => [...new Set(leitos.map(l => l.ala))].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));

// ============ Gravação (Firestore) ============

function exigirNaFilaDeLeito(at) {
    if (at.fila !== 'INTERNACAO') throw new Error('Este atendimento não está na fila de leito.');
}

/** Guarda o que o leito precisa ter (ala, isolamento). Pode ser refeito enquanto o paciente aguarda; fica no histórico. */
function definirRequisitosLeito(id, form) {
    const r = validarRequisitosLeito(form, alasDaEstrutura());
    return transitarAtendimento(id, {
        permissao: 'fila_leito', de: ['AGUARDANDO'], acaoAuditoria: 'LEITO_REQUISITOS',
        mudar: (at, { agora, user }) => {
            exigirNaFilaDeLeito(at);
            const texto = [r.ala ? `ala ${r.ala}` : '', r.isolamento ? 'isolamento' : ''].filter(Boolean).join(' · ') || 'sem exigência';
            return {
                novo: { requisitos_leito: { ...r, em: agora, por: user.username, por_nome: user.name } },
                motivo: `Requisitos do leito: ${texto}`, registrarHistorico: true,
                antes: { requisitos: at.requisitos_leito ? { ala: at.requisitos_leito.ala, isolamento: at.requisitos_leito.isolamento } : null }, depois: { requisitos: { ala: r.ala, isolamento: r.isolamento } }
            };
        }
    });
}

/**
 * Aloca o leito (internação) a quem aguarda na fila. A internação, o leito e o atendimento são gravados na mesma transação;
 * a tela só precisa tratar o erro de quem chegou depois ("leito não está livre", "não está mais aguardando").
 * form: { leito_id, setor_origem, motivo? }
 */
async function alocarLeitoDaFila(atendimentoId, form) {
    requirePermission('fila_leito');
    requirePermission('internacao_gerenciar');
    const at = (MOCK_DATA.FILA_LEITO || []).find(a => a.id === atendimentoId);
    if (!at) throw new Error('Este paciente não está mais na fila de leito. Atualize a tela.');
    const leito = leitoPorId(form.leito_id);
    const paciente = await db_getPaciente(at.paciente_id);
    const v = validarAlocacao(form, {
        at, leito, estado: leito ? estadoLeito(leito.id) : null, paciente,
        internacaoAtiva: internacaoAtivaDoPaciente(at.paciente_id), fila: filaDeLeito()
    });
    const user = state.currentUser;
    const agora = nowISO();
    const r = await db_alocarLeitoAtomico({ atendimentoId, leitoId: leito.id, montar: (atual) => montarAlocacao(atual, paciente, leito, v, agora, user) });
    await auditarLeito(leito.id, 'OCUPAR', { status: 'LIVRE' }, { status: 'OCUPADO', internacao: r.internacao.id, prontuario: r.internacao.prontuario, atendimento: atendimentoId }, v.motivo);
    await auditar({ entidade: 'internacao', entidade_id: r.internacao.id, acao: 'CRIAR', depois: { paciente_id: paciente.id, leito: leito.rotulo, setor_origem: v.setor_origem, atendimento: at.senha, fora_da_ordem: v.foraDaOrdem } });
    await auditar({ entidade: 'atendimento', entidade_id: atendimentoId, acao: 'LEITO_ALOCAR', antes: { status: 'AGUARDANDO', fila: 'INTERNACAO' }, depois: { status: 'CONCLUIDO', leito: leito.rotulo }, motivo: v.motivo });
    return r.internacao;
}

/**
 * Devolve o paciente à fila médica (a internação precisa ser reavaliada). Só no mesmo dia do atendimento, como a reabertura da
 * triagem: as filas de atendimento são do dia.
 */
function devolverLeitoAoMedico(id, motivo) {
    return transitarAtendimento(id, {
        permissao: 'fila_leito', de: ['AGUARDANDO'], acaoAuditoria: 'LEITO_DEVOLVER_MEDICO',
        mudar: (at, { agora, user }) => {
            exigirNaFilaDeLeito(at);
            const texto = String(motivo || '').trim();
            if (texto.length < 5) throw new Error('Informe o motivo de devolver o paciente ao médico (mínimo 5 letras).');
            if (texto.length > 300) throw new Error('Motivo: no máximo 300 caracteres.');
            if (at.dia !== todayISO()) throw new Error('Só é possível devolver ao médico no mesmo dia do atendimento. Peça à Recepção um novo check-in.');
            return {
                novo: { fila: 'MEDICO', desfecho_leito: { tipo: 'DEVOLVER_MEDICO', texto, em: agora, por: user.username, por_nome: user.name }, retorno_de_leito_em: agora },
                motivo: `Devolvido ao médico (sem internação): ${texto}`, registrarHistorico: true, depois: { status: 'AGUARDANDO', fila: 'MEDICO' }
            };
        }
    });
}

/**
 * Encerra a espera sem internar (recusa, outro serviço, indicação revista). O atendimento passa por Em atendimento e fica
 * Concluído, sempre com o motivo escrito: nada some da fila sem registro.
 * form: { tipo, texto }
 */
function encerrarEsperaSemInternacao(id, form) {
    return transitarAtendimento(id, {
        permissao: 'fila_leito', de: ['AGUARDANDO'], acaoAuditoria: 'LEITO_ENCERRAR',
        mudar: (at, { agora, user }) => {
            exigirNaFilaDeLeito(at);
            if (!MOTIVOS_ENCERRAR_ESPERA[form.tipo]) throw new Error('Escolha por que a espera termina sem internação.');
            const texto = String(form.texto || '').trim();
            if (texto.length < 5) throw new Error('Descreva o motivo (mínimo 5 letras).');
            if (texto.length > 300) throw new Error('Motivo: no máximo 300 caracteres.');
            const limpar = { chamada: null, em_atendimento_por: '', em_atendimento_por_nome: '', em_atendimento_em: '', local_id: '', local_nome: '' };
            return {
                novo: { ...limpar, status: 'CONCLUIDO', concluido_em: agora, desfecho_leito: { tipo: form.tipo, texto, em: agora, por: user.username, por_nome: user.name } },
                via: ['EM_ATENDIMENTO'], motivoVia: 'Fila de leito encerrada',
                motivo: `Sem internação · ${MOTIVOS_ENCERRAR_ESPERA[form.tipo]}: ${texto}`, depois: { status: 'CONCLUIDO', fila: 'INTERNACAO', motivo: form.tipo }
            };
        }
    });
}
