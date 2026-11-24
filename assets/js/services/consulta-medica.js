// Atendimento médico (Etapa 3): anamnese, exame físico, hipóteses diagnósticas (CID-10), conduta, prescrição,
// solicitação de exames, encaminhamento e desfecho do atendimento de urgência/ambulatório.
//
// O QUE É: o médico assume um atendimento da fila médica (situação Em atendimento), preenche a consulta e a CONCLUI.
// Enquanto não conclui, o conteúdo fica como rascunho na coleção `consultas` (um documento por atendimento). Ao concluir,
// numa única transação, o sistema grava a consulta final, acrescenta ao PRONTUÁRIO os registros assinados (evolução,
// diagnósticos, prescrição) ligados ao atendimento e move o atendimento para o desfecho escolhido.
//
// O QUE NÃO É: o sistema não sugere diagnóstico, conduta nem medicamento, e não tem lista de CID-10 embutida: o código
// vem do médico (só o formato é conferido). Registros assinados não são alterados; correções entram como complemento.

const COL_CONSULTAS = 'consultas';

const DESFECHOS_CONSULTA = {
    ALTA: 'Alta médica',
    ENCAMINHAMENTO: 'Encaminhamento',
    INTERNACAO: 'Indicação de internação',
    EVASAO: 'Saiu sem alta (evasão)'
};
// Para onde o encaminhamento pode seguir (a fila médica e a triagem ficam de fora: o paciente já passou por elas).
const FILAS_ENCAMINHAMENTO = ['EXAMES', 'PROCEDIMENTOS', 'AMBULATORIO', 'INTERNACAO'];
const CAMPOS_ITEM_PRESCRICAO = ['medicamento', 'dose', 'via', 'frequencia', 'duracao', 'observacao'];

// ============ Regras puras (testáveis) ============

/**
 * Valida e normaliza a consulta. `paraConcluir` exige o conteúdo mínimo e o registro no conselho; o rascunho só limpa e limita os textos.
 * form: { anamnese, exame_fisico, conduta, hipoteses: [{cid, descricao}], prescricao: [item], desfecho_tipo, desfecho_texto, desfecho_fila, registro_conselho }
 */
function validarConsulta(form, { paraConcluir = false } = {}) {
    const texto = (v, max, rotulo) => { const t = String(v || '').trim(); if (t.length > max) throw new Error(`${rotulo}: no máximo ${max} caracteres.`); return t; };
    const c = {
        anamnese: texto(form.anamnese, 4000, 'Anamnese'), exame_fisico: texto(form.exame_fisico, 3000, 'Exame físico'), conduta: texto(form.conduta, 3000, 'Conduta'),
        hipoteses: (form.hipoteses || []).map(h => ({ cid: String(h.cid || '').trim().toUpperCase(), descricao: String(h.descricao || '').trim() })).filter(h => h.cid || h.descricao),
        prescricao: (form.prescricao || []).filter(i => CAMPOS_ITEM_PRESCRICAO.some(k => String(i[k] || '').trim())),
        desfecho: { tipo: form.desfecho_tipo || '', texto: texto(form.desfecho_texto, 1000, 'Desfecho'), fila: form.desfecho_fila || '' },
        registro_conselho: String(form.registro_conselho || '').trim()
    };
    if (!paraConcluir) return c;

    const tipo = c.desfecho.tipo;
    if (!DESFECHOS_CONSULTA[tipo]) throw new Error('Escolha o desfecho do atendimento.');
    if (c.registro_conselho.length < 3) throw new Error('Informe o seu registro no conselho profissional (ex.: CRM) para assinar o atendimento.');
    if (tipo === 'EVASAO') {
        if (c.desfecho.texto.length < 5) throw new Error('Descreva as circunstâncias da saída sem alta (mínimo 5 letras).');
        c.prescricao = []; // sem alta não há prescrição de saída
        return c;
    }
    if (c.anamnese.length < 10) throw new Error('Preencha a anamnese (queixa e história, mínimo 10 caracteres).');
    if (c.conduta.length < 5) throw new Error('Preencha a conduta ou as orientações (mínimo 5 caracteres).');
    if (!c.hipoteses.length) throw new Error('Informe ao menos uma hipótese diagnóstica com o CID-10.');
    c.hipoteses.forEach((h, n) => {
        if (!validarCid10(h.cid)) throw new Error(`Hipótese ${n + 1}: informe o CID-10 no formato correto (ex.: I10 ou J18.9).`);
        if (h.descricao.length < 3) throw new Error(`Hipótese ${n + 1}: descreva o diagnóstico.`);
    });
    if (c.prescricao.length) c.prescricao = validarItensPrescricao(c.prescricao);
    if (tipo === 'ENCAMINHAMENTO') {
        if (!FILAS_ENCAMINHAMENTO.includes(c.desfecho.fila)) throw new Error('Escolha para onde o paciente é encaminhado.');
        if (c.desfecho.texto.length < 5) throw new Error('Descreva o encaminhamento (especialidade ou serviço e motivo).');
    }
    if (tipo === 'INTERNACAO') {
        c.desfecho.fila = 'INTERNACAO';
        if (c.desfecho.texto.length < 5) throw new Error('Justifique a indicação de internação (mínimo 5 letras).');
    }
    return c;
}

/** Atendimento após o desfecho: alta e evasão encerram; encaminhamento e internação seguem para a fila de destino. */
function destinoDoDesfecho(tipo, fila) {
    return ['ALTA', 'EVASAO'].includes(tipo) ? { status: 'CONCLUIDO' } : { status: 'AGUARDANDO', fila };
}

/** Texto da evolução assinada que entra no prontuário. */
function textoEvolucaoConsulta(c, at) {
    const linhas = [`Atendimento ${at.senha} · ${at.tipo_nome || ''}`.trim()];
    if (at.queixa) linhas.push(`Queixa na chegada: ${at.queixa}`);
    if (c.anamnese) linhas.push(`Anamnese: ${c.anamnese}`);
    if (c.exame_fisico) linhas.push(`Exame físico: ${c.exame_fisico}`);
    if (c.conduta) linhas.push(`Conduta: ${c.conduta}`);
    const d = c.desfecho;
    linhas.push(`Desfecho: ${DESFECHOS_CONSULTA[d.tipo]}${d.fila ? ' → ' + rotuloFila(d.fila) : ''}${d.texto ? ' — ' + d.texto : ''}`);
    return linhas.join('\n');
}

/** Registros do prontuário gerados pela consulta concluída: 1 evolução, 1 diagnóstico por hipótese e 1 prescrição (se houver itens). */
function montarRegistrosConsulta(c, at, user, agora) {
    const base = { paciente_id: at.paciente_id, internacao_id: '', atendimento_id: at.id, atendimento_senha: at.senha, complementa_id: '', solicitacao_id: '',
        autor: user.username, autor_nome: user.name, perfil: user.role, registro_conselho: c.registro_conselho, em: agora, assinado: true };
    const novo = (tipo, extra) => {
        const conteudo = normalizarConteudoClinico({ tipo, texto: extra.texto, itens: extra.itens || null, cid: extra.cid || '' });
        return { id: newId('clin'), ...base, tipo, texto: conteudo.texto, itens: conteudo.itens, cid: conteudo.cid };
    };
    const regs = [novo('EVOLUCAO', { texto: textoEvolucaoConsulta(c, at) })];
    c.hipoteses.forEach(h => regs.push(novo('DIAGNOSTICO', { texto: h.descricao, cid: h.cid })));
    if (c.prescricao.length) regs.push(novo('PRESCRICAO', { itens: c.prescricao }));
    return regs;
}

/** Permissões que a conclusão exige conforme o conteúdo (evolução sempre; diagnóstico e prescrição só se houver). */
function permissoesDaConsulta(c) {
    const p = ['atendimento_medico', 'prontuario_evoluir'];
    if (c.hipoteses.length) p.push('diagnosticar');
    if (c.prescricao.length) p.push('prescrever');
    return p;
}

// ============ Gravação (Firestore) ============

const db_getConsulta = (atendimentoId) => getDocH(COL_CONSULTAS, atendimentoId);

/** Só quem assumiu o atendimento (ou o administrador) escreve a consulta. */
function exigirResponsavelPelaConsulta(at, user) {
    if (!['MEDICO', 'AMBULATORIO'].includes(at.fila)) throw new Error('Este atendimento não está na fila do atendimento médico nem na do ambulatório.');
    if (at.em_atendimento_por !== user.username && user.role !== 'ADMIN') throw new Error(`Este atendimento está com ${at.em_atendimento_por_nome || 'outro profissional'}.`);
}

function consultaBase(at, user, agora, existente) {
    return {
        ...(existente || {}),
        id: at.id, atendimento_id: at.id, paciente_id: at.paciente_id, paciente_nome: at.paciente_nome, senha: at.senha, dia: at.dia, tipo_nome: at.tipo_nome,
        medico: user.username, medico_nome: user.name, iniciada_em: (existente && existente.iniciada_em) || at.em_atendimento_em || agora, atualizado_em: agora
    };
}

/**
 * Consultas anteriores do MESMO atendimento (o paciente voltou dos exames para nova avaliação): a consulta concluída não é
 * sobrescrita; ela passa para `historico_consultas` do novo documento.
 */
async function historicoDeConsultas(atendimentoId) {
    const anterior = await db_getConsulta(atendimentoId);
    if (!anterior) return [];
    const lista = anterior.historico_consultas || [];
    if (anterior.status !== 'CONCLUIDA') return lista;
    const { historico_consultas, ...resto } = anterior;
    return [...lista, resto];
}

/** Salva o que o médico já escreveu, sem concluir (pode fechar a janela e continuar depois). */
async function salvarRascunhoConsulta(atendimentoId, form) {
    const historico = await historicoDeConsultas(atendimentoId);
    return transitarAtendimento(atendimentoId, {
        permissao: 'atendimento_medico', de: ['EM_ATENDIMENTO'], acaoAuditoria: null,
        mudar: (at, { agora, user }) => {
            exigirResponsavelPelaConsulta(at, user);
            const c = validarConsulta(form);
            return { novo: {}, motivo: '', gravar: [{ col: COL_CONSULTAS, obj: { ...consultaBase(at, user, agora, null), ...c, status: 'RASCUNHO', desfecho_tipo: c.desfecho.tipo, historico_consultas: historico } }] };
        }
    });
}

/**
 * Conclui o atendimento médico numa única transação: grava a consulta final, os registros assinados do prontuário e move o
 * atendimento para o desfecho. `solicitacoes`: exames solicitados neste atendimento ([{id, protocolo, tipo_nome}]).
 */
async function concluirConsulta(atendimentoId, form, { paciente, solicitacoes = [] } = {}) {
    const c = validarConsulta(form, { paraConcluir: true });
    permissoesDaConsulta(c).forEach(p => requirePermission(p));
    if (paciente) await abrirProntuario(paciente);   // garante o prontuário aberto (idempotente) antes de gravar os registros
    const historico = await historicoDeConsultas(atendimentoId);
    let registros = [];
    const at = await transitarAtendimento(atendimentoId, {
        permissao: 'atendimento_medico', de: ['EM_ATENDIMENTO'], acaoAuditoria: 'CONSULTA_CONCLUIR',
        mudar: (atual, { agora, user }) => {
            exigirResponsavelPelaConsulta(atual, user);
            registros = montarRegistrosConsulta(c, atual, user, agora);
            const destino = destinoDoDesfecho(c.desfecho.tipo, c.desfecho.fila);
            const limpar = { chamada: null, em_atendimento_por: '', em_atendimento_por_nome: '', em_atendimento_em: '', local_id: '', local_nome: '' };
            const consulta = { ...consultaBase(atual, user, agora, null), ...c, status: 'CONCLUIDA', desfecho_tipo: c.desfecho.tipo, concluida_em: agora,
                solicitacoes_exame: solicitacoes.map(s => ({ id: s.id, protocolo: s.protocolo, tipo_nome: s.tipo_nome })), historico_consultas: historico };
            return {
                novo: { ...limpar, ...destino, desfecho: { ...c.desfecho, em: agora, por: user.username, por_nome: user.name }, ...(destino.status === 'CONCLUIDO' ? { concluido_em: agora } : {}) },
                motivo: `Atendimento médico concluído · ${DESFECHOS_CONSULTA[c.desfecho.tipo]}${destino.fila ? ' → ' + rotuloFila(destino.fila) : ''}`,
                registrarHistorico: true,
                atualizar: atual.agenda_id && c.desfecho.tipo !== 'EVASAO' ? [{ col: 'agenda_consultas', id: atual.agenda_id, mudar: (ag) => agendaRealizada(ag, user, agora) }] : [],
                gravar: [{ col: COL_CONSULTAS, obj: consulta }, ...registros.map(r => ({ col: COLH.REGISTROS, obj: r }))],
                depois: { desfecho: c.desfecho.tipo, hipoteses: c.hipoteses.map(h => h.cid).join(', '), registros: registros.length }
            };
        }
    });
    await auditar({ entidade: 'prontuario', entidade_id: at.paciente_id, acao: 'REGISTRAR', depois: { atendimento: at.id, senha: at.senha, registros: registros.map(r => r.tipo).join(', ') } });
    return at;
}
