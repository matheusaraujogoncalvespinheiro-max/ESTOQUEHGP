// Regras da assistência hospitalar: leitos, internações, prontuário, solicitações de exame, agenda e autorizações.
// As telas só chamam estas funções (que validam permissão e regras); quem grava é services/db-hospital.js.

// ============ Leitos ============

const STATUS_LEITO = {
    LIVRE: { rotulo: 'Livre', cor: '#16a34a', fundo: '#dcfce7' },
    OCUPADO: { rotulo: 'Ocupado', cor: '#dc2626', fundo: '#fee2e2' },
    HIGIENIZACAO: { rotulo: 'Em higienização', cor: '#d97706', fundo: '#fef3c7' },
    BLOQUEADO: { rotulo: 'Bloqueado', cor: '#475569', fundo: '#e2e8f0' }
};
const rotuloStatusLeito = (s) => (STATUS_LEITO[s] || { rotulo: s || '—' }).rotulo;

const estadoLeito = (id) => MOCK_DATA.LEITOS_ESTADO[id] || { id, status: 'LIVRE' };
const internacaoAtivaDoLeito = (leitoId) => MOCK_DATA.INTERNACOES.find(i => i.status === 'ATIVA' && i.leito_id === leitoId) || null;
const internacaoAtivaDoPaciente = (pacienteId) => MOCK_DATA.INTERNACOES.find(i => i.status === 'ATIVA' && i.paciente_id === pacienteId) || null;
const internacoesDoPaciente = (pacienteId) => MOCK_DATA.INTERNACOES.filter(i => i.paciente_id === pacienteId).sort((a, b) => String(b.data_hora_internacao).localeCompare(String(a.data_hora_internacao)));

function indicadoresLeitos(leitos = estruturaHospital()) {
    const c = { total: leitos.length, LIVRE: 0, OCUPADO: 0, HIGIENIZACAO: 0, BLOQUEADO: 0 };
    leitos.forEach(l => { c[estadoLeito(l.id).status] = (c[estadoLeito(l.id).status] || 0) + 1; });
    c.taxa = c.total ? Math.round((c.OCUPADO / c.total) * 100) : 0;
    return c;
}

const agoraISO = () => new Date().toISOString();
const quem = () => ({ por: state.currentUser.username, por_nome: state.currentUser.name });

async function auditarLeito(leitoId, acao, antes, depois, motivo = '') {
    await auditar({ entidade: 'leito', entidade_id: leitoId, acao, antes, depois, motivo });
}

/** Interna o paciente no leito. Valida leito livre e paciente sem internação ativa (de forma atômica no banco). */
async function internarPaciente({ paciente, leito_id, setor_origem }) {
    requirePermission('internacao_gerenciar');
    const leito = leitoPorId(leito_id);
    if (!leito) throw new Error('Leito inválido: escolha um leito da estrutura do hospital.');
    if (!paciente || !paciente.id) throw new Error('Selecione o paciente.');
    if (paciente.ativo === false) throw new Error('Este cadastro de paciente está inativo.');
    if (!String(setor_origem || '').trim()) throw new Error('Informe o setor de origem.');
    if (estadoLeito(leito.id).status !== 'LIVRE') throw new Error(`O leito ${leito.rotulo} não está livre (${rotuloStatusLeito(estadoLeito(leito.id).status)}).`);
    if (internacaoAtivaDoPaciente(paciente.id)) throw new Error('Este paciente já possui uma internação ativa.');

    const agora = agoraISO();
    const u = quem();
    const internacao = {
        id: newId('int'), paciente_id: paciente.id, paciente_nome: paciente.nome, prontuario: paciente.prontuario || '',
        leito_id: leito.id, andar: leito.andar, ala: leito.ala, quarto: leito.quarto,
        data_hora_internacao: agora, registrado_por: u.por, registrado_por_nome: u.por_nome, setor_origem: String(setor_origem).trim(),
        status: 'ATIVA', data_hora_alta: '', alta_por: ''
    };
    const leitoNovo = { id: leito.id, status: 'OCUPADO', internacao_id: internacao.id, paciente_id: paciente.id, desde: agora, atualizado_por: u.por, atualizado_por_nome: u.por_nome, motivo: '' };
    await db_internarAtomico({ internacao, leitoNovo });
    await auditarLeito(leito.id, 'OCUPAR', { status: 'LIVRE' }, { status: 'OCUPADO', internacao: internacao.id, prontuario: internacao.prontuario });
    await auditar({ entidade: 'internacao', entidade_id: internacao.id, acao: 'CRIAR', depois: { paciente_id: paciente.id, leito: leito.rotulo, setor_origem: internacao.setor_origem } });
    return internacao;
}

/** Alta: encerra a internação e coloca o leito em higienização (nunca direto para livre). */
async function darAltaInternacao(internacaoId) {
    requirePermission('internacao_gerenciar');
    const atual = MOCK_DATA.INTERNACOES.find(i => i.id === internacaoId) || await getDocH(COLH.INTERNACOES, internacaoId);
    if (!atual || atual.status !== 'ATIVA') throw new Error('Esta internação não está ativa.');
    const agora = agoraISO();
    const u = quem();
    const internacao = { ...atual, status: 'ALTA', data_hora_alta: agora, alta_por: u.por, alta_por_nome: u.por_nome };
    const leitoNovo = { id: atual.leito_id, status: 'HIGIENIZACAO', internacao_id: '', paciente_id: '', desde: agora, atualizado_por: u.por, atualizado_por_nome: u.por_nome, motivo: 'Alta do paciente' };
    await db_altaAtomica({ internacao, leitoNovo });
    await auditarLeito(atual.leito_id, 'ALTA_HIGIENIZACAO', { status: 'OCUPADO' }, { status: 'HIGIENIZACAO' });
    await auditar({ entidade: 'internacao', entidade_id: atual.id, acao: 'ALTA', antes: { status: 'ATIVA' }, depois: { status: 'ALTA' } });
    return internacao;
}

/** Transfere o paciente internado para outro leito LIVRE; o leito antigo vai para higienização e a trajetória fica na internação. */
async function transferirLeito(internacaoId, novoLeitoId, motivo) {
    requirePermission('internacao_gerenciar');
    const atual = MOCK_DATA.INTERNACOES.find(i => i.id === internacaoId) || await getDocH(COLH.INTERNACOES, internacaoId);
    if (!atual || atual.status !== 'ATIVA') throw new Error('Esta internação não está ativa.');
    const novo = leitoPorId(novoLeitoId);
    if (!novo) throw new Error('Escolha um leito da estrutura do hospital.');
    if (novo.id === atual.leito_id) throw new Error('O paciente já está neste leito.');
    if (String(motivo || '').trim().length < 5) throw new Error('Informe o motivo da transferência (mínimo de 5 caracteres).');
    if (estadoLeito(novo.id).status !== 'LIVRE') throw new Error(`O leito ${novo.rotulo} não está livre (${rotuloStatusLeito(estadoLeito(novo.id).status)}).`);
    const agora = agoraISO(); const u = quem();
    const internacao = { ...atual, leito_id: novo.id, andar: novo.andar, ala: novo.ala, quarto: novo.quarto,
        historico_leitos: [...(atual.historico_leitos || [{ leito_id: atual.leito_id, desde: atual.data_hora_internacao }]), { leito_id: novo.id, desde: agora, de: atual.leito_id, por: u.por_nome, motivo: String(motivo).trim() }] };
    const base = { atualizado_por: u.por, atualizado_por_nome: u.por_nome, desde: agora };
    await db_transferirAtomico({
        internacao,
        leitoOrigemNovo: { id: atual.leito_id, status: 'HIGIENIZACAO', internacao_id: '', paciente_id: '', motivo: 'Transferência do paciente', ...base },
        leitoDestinoNovo: { id: novo.id, status: 'OCUPADO', internacao_id: atual.id, paciente_id: atual.paciente_id, motivo: '', ...base }
    });
    await auditarLeito(atual.leito_id, 'TRANSFERENCIA_SAIDA', { status: 'OCUPADO' }, { status: 'HIGIENIZACAO', destino: novo.id }, String(motivo).trim());
    await auditarLeito(novo.id, 'TRANSFERENCIA_ENTRADA', { status: 'LIVRE' }, { status: 'OCUPADO', origem: atual.leito_id, internacao: atual.id }, String(motivo).trim());
    await auditar({ entidade: 'internacao', entidade_id: atual.id, acao: 'TRANSFERIR', antes: { leito: atual.leito_id }, depois: { leito: novo.id }, motivo: String(motivo).trim() });
    return internacao;
}

async function concluirHigienizacao(leitoId) {
    requirePermission('leito_gerenciar');
    const agora = agoraISO(); const u = quem();
    await db_mudarLeito(leitoId, ['HIGIENIZACAO'], { id: leitoId, status: 'LIVRE', internacao_id: '', paciente_id: '', desde: agora, atualizado_por: u.por, atualizado_por_nome: u.por_nome, motivo: '', liberado_em: agora, liberado_por: u.por_nome });
    await auditarLeito(leitoId, 'LIBERAR', { status: 'HIGIENIZACAO' }, { status: 'LIVRE', liberado_por: u.por_nome });
}

async function bloquearLeito(leitoId, motivo) {
    requirePermission('leito_gerenciar');
    if (String(motivo || '').trim().length < 5) throw new Error('Informe o motivo do bloqueio (mínimo de 5 caracteres).');
    if (!leitoPorId(leitoId)) throw new Error('Leito inválido.');
    const agora = agoraISO(); const u = quem();
    const antes = estadoLeito(leitoId).status;
    await db_mudarLeito(leitoId, ['LIVRE', 'HIGIENIZACAO'], { id: leitoId, status: 'BLOQUEADO', internacao_id: '', paciente_id: '', desde: agora, atualizado_por: u.por, atualizado_por_nome: u.por_nome, motivo: String(motivo).trim() });
    await auditarLeito(leitoId, 'BLOQUEAR', { status: antes }, { status: 'BLOQUEADO' }, String(motivo).trim());
}

async function desbloquearLeito(leitoId) {
    requirePermission('leito_gerenciar');
    const agora = agoraISO(); const u = quem();
    await db_mudarLeito(leitoId, ['BLOQUEADO'], { id: leitoId, status: 'LIVRE', internacao_id: '', paciente_id: '', desde: agora, atualizado_por: u.por, atualizado_por_nome: u.por_nome, motivo: '', liberado_em: agora, liberado_por: u.por_nome });
    await auditarLeito(leitoId, 'DESBLOQUEAR', { status: 'BLOQUEADO' }, { status: 'LIVRE', liberado_por: u.por_nome });
}

// ============ Prontuário: registros clínicos (somente acrescentam; nada é editado ou apagado) ============

const CID10_FORMATO = /^[A-Z][0-9]{2}(\.[0-9A-Z]{1,2})?$/;
/** Valida só o FORMATO do CID-10 (ex.: I10, J18.9). Não há lista embutida: o código vem de quem diagnostica. */
const validarCid10 = (cid) => CID10_FORMATO.test(String(cid || '').trim().toUpperCase());

const TIPOS_CLINICOS = {
    EVOLUCAO: { rotulo: 'Evolução', permissao: 'prontuario_evoluir' },
    PRESCRICAO: { rotulo: 'Prescrição', permissao: 'prescrever' },
    DIAGNOSTICO: { rotulo: 'Diagnóstico', permissao: 'diagnosticar' },
    RESULTADO: { rotulo: 'Resultado/Laudo de exame', permissao: 'exame_resultado' }
};

/** Prescrição por item: medicamento, dose, via, frequência e duração. Gera também o texto corrido para leitura e impressão. */
function validarItensPrescricao(itens) {
    const lista = (itens || []).filter(i => String(i.medicamento || '').trim() || String(i.dose || '').trim());
    if (!lista.length) throw new Error('Inclua ao menos um item na prescrição.');
    return lista.map((i, n) => {
        const item = { medicamento: String(i.medicamento || '').trim(), dose: String(i.dose || '').trim(), via: String(i.via || '').trim(), frequencia: String(i.frequencia || '').trim(), duracao: String(i.duracao || '').trim(), observacao: String(i.observacao || '').trim() };
        if (item.medicamento.length < 2) throw new Error(`Item ${n + 1}: informe o medicamento ou a conduta.`);
        if (!item.dose) throw new Error(`Item ${n + 1}: informe a dose.`);
        if (!item.frequencia) throw new Error(`Item ${n + 1}: informe a frequência.`);
        return item;
    });
}
const textoDoItemPrescricao = (i) => [i.medicamento, i.dose, i.via, i.frequencia, i.duracao && `por ${i.duracao}`, i.observacao && `(${i.observacao})`].filter(Boolean).join(' · ');

async function registrarClinico({ internacao, tipo, texto, itens = null, cid = '', complementa_id = '', solicitacao_id = '', registro_conselho = '' }) {
    const cfg = TIPOS_CLINICOS[tipo];
    if (!cfg) throw new Error('Tipo de registro inválido.');
    requirePermission(cfg.permissao);
    if (!internacao || internacao.status !== 'ATIVA') throw new Error('O registro clínico exige uma internação ativa do paciente.');
    if (tipo === 'PRESCRICAO' && itens) { itens = validarItensPrescricao(itens); texto = itens.map(textoDoItemPrescricao).join('\n'); }
    if (String(texto || '').trim().length < 5) throw new Error('Escreva o registro (mínimo de 5 caracteres).');
    if (tipo === 'DIAGNOSTICO') {
        if (!validarCid10(cid)) throw new Error('Informe o CID-10 no formato correto (ex.: I10 ou J18.9).');
        cid = String(cid).trim().toUpperCase();
    }
    const u = quem();
    const reg = {
        id: newId('clin'), paciente_id: internacao.paciente_id, internacao_id: internacao.id, tipo, texto: String(texto).trim(), itens: itens || [], cid,
        complementa_id, solicitacao_id, autor: u.por, autor_nome: u.por_nome, perfil: state.currentUser.role, registro_conselho: String(registro_conselho || '').trim(),
        em: agoraISO(), assinado: true
    };
    await setDocH(COLH.REGISTROS, reg);
    await auditar({ entidade: 'prontuario', entidade_id: internacao.paciente_id, acao: complementa_id ? 'COMPLEMENTAR' : 'REGISTRAR', depois: { tipo, registro: reg.id, internacao: internacao.id } });
    return reg;
}

/** Abre o prontuário de um paciente cadastrado (uma vez só; reabrir devolve o mesmo). Fica na auditoria. */
async function abrirProntuario(paciente) {
    requirePermission('prontuario_ver');
    if (!paciente || !paciente.id) throw new Error('Selecione o paciente.');
    if (paciente.ativo === false) throw new Error('Este cadastro de paciente está inativo.');
    const existente = MOCK_DATA.PRONTUARIOS.find(p => p.id === paciente.id) || await getDocH(COLH.PRONTUARIOS, paciente.id);
    if (existente) return existente;
    const u = quem();
    const reg = { id: paciente.id, paciente_id: paciente.id, nome: paciente.nome, prontuario: paciente.prontuario || '', aberto_em: agoraISO(), aberto_por: u.por_nome };
    await setDocH(COLH.PRONTUARIOS, reg);
    await auditar({ entidade: 'prontuario', entidade_id: paciente.id, acao: 'ABRIR_PRONTUARIO', depois: { prontuario: reg.prontuario } });
    return reg;
}

/** Consulta de prontuários: união dos prontuários abertos com os pacientes que já tiveram internação. */
function listaProntuarios(abertos, internacoes) {
    const mapa = new Map();
    const get = (id, nome, prontuario) => { if (!mapa.has(id)) mapa.set(id, { paciente_id: id, nome, prontuario, internacoes: 0, ativa: null, ultima: '', aberto_em: '' }); return mapa.get(id); };
    abertos.forEach(a => { const r = get(a.paciente_id, a.nome, a.prontuario); r.aberto_em = a.aberto_em; });
    internacoes.forEach(i => {
        const r = get(i.paciente_id, i.paciente_nome, i.prontuario);
        r.internacoes++;
        if (i.status === 'ATIVA') r.ativa = i;
        if (String(i.data_hora_internacao) > r.ultima) r.ultima = i.data_hora_internacao;
    });
    return [...mapa.values()].sort((a, b) => String(b.ultima || b.aberto_em).localeCompare(String(a.ultima || a.aberto_em)));
}

// ============ Tipos de exame, status e prioridade ============

const PRIORIDADES = [{ id: 'URGENTE', rotulo: 'Urgente' }, { id: 'ELETIVO', rotulo: 'Eletivo' }];
const SETORES_EXAME = { IMAGENOLOGIA: 'Imagenologia', ULTRASSONOGRAFIA: 'Ultrassonografia' };

const STATUS_EXAME = {
    SOLICITADO: 'Solicitado', AGUARDANDO_TRIAGEM: 'Aguardando triagem', EM_AVALIACAO: 'Em avaliação', AGUARDANDO_AGENDAMENTO: 'Aguardando agendamento',
    AGENDADO: 'Agendado', EM_ATENDIMENTO: 'Em atendimento', REALIZADO: 'Realizado', CANCELADO: 'Cancelado',
    REAGENDAMENTO_NECESSARIO: 'Reagendamento necessário', PENDENTE_AUTORIZACAO: 'Pendente de autorização'
};
const rotuloStatusExame = (s) => STATUS_EXAME[s] || s;

/** Mudanças de status permitidas. REALIZADO e CANCELADO encerram o fluxo. */
const TRANSICOES_EXAME = {
    SOLICITADO: ['AGUARDANDO_TRIAGEM', 'PENDENTE_AUTORIZACAO', 'CANCELADO'],
    PENDENTE_AUTORIZACAO: ['AGUARDANDO_TRIAGEM', 'CANCELADO'],
    AGUARDANDO_TRIAGEM: ['EM_AVALIACAO', 'CANCELADO'],
    EM_AVALIACAO: ['AGUARDANDO_AGENDAMENTO', 'PENDENTE_AUTORIZACAO', 'CANCELADO'],
    AGUARDANDO_AGENDAMENTO: ['AGENDADO', 'CANCELADO'],
    AGENDADO: ['EM_ATENDIMENTO', 'REAGENDAMENTO_NECESSARIO', 'CANCELADO'],
    REAGENDAMENTO_NECESSARIO: ['AGENDADO', 'CANCELADO'],
    EM_ATENDIMENTO: ['REALIZADO', 'REAGENDAMENTO_NECESSARIO', 'CANCELADO'],
    REALIZADO: [], CANCELADO: []
};
const transicaoPermitida = (de, para) => (TRANSICOES_EXAME[de] || []).includes(para);
const statusEncerrado = (s) => s === 'REALIZADO' || s === 'CANCELADO';

const tiposExame = () => (typeof cadRowsOf === 'function' ? cadRowsOf('tipoexame').filter(t => t.ativo) : []);
const permissaoDoSetor = (setor) => (setor === 'ULTRASSONOGRAFIA' ? 'ultrassom_gerenciar' : 'imagem_gerenciar');

// ============ Autorizações (APAC) ============

const STATUS_AUTORIZACAO = { PENDENTE: 'Pendente', APROVADA: 'Aprovada', NEGADA: 'Negada', VENCIDA: 'Vencida' };

/** Situação REAL da autorização: só é aprovada com número, data e validade; vence quando passa da validade. */
function statusAutorizacao(aut, hoje = todayISO()) {
    if (!aut) return 'PENDENTE';
    if (aut.decisao === 'NEGADA') return 'NEGADA';
    if (aut.decisao !== 'APROVADA' || !String(aut.numero_apac || '').trim() || !aut.data_autorizacao || !aut.validade_fim) return 'PENDENTE';
    return aut.validade_fim < hoje ? 'VENCIDA' : 'APROVADA';
}
const autorizacaoDaSolicitacao = (solId) => MOCK_DATA.AUTORIZACOES.find(a => a.solicitacao_id === solId) || null;
const autorizacaoVigente = (solId) => statusAutorizacao(autorizacaoDaSolicitacao(solId)) === 'APROVADA';

/** Um exame que exige autorização só pode ser agendado com autorização aprovada e dentro da validade. */
function podeAgendar(sol, dataAgendamento) {
    if (!sol.exige_autorizacao) return { ok: true };
    const aut = autorizacaoDaSolicitacao(sol.id);
    if (statusAutorizacao(aut) !== 'APROVADA') return { ok: false, motivo: 'Este exame exige autorização aprovada e dentro da validade antes de ser agendado.' };
    if (dataAgendamento && dataAgendamento > aut.validade_fim) return { ok: false, motivo: `A data do agendamento passa da validade da autorização (${formatDateBR(aut.validade_fim)}).` };
    return { ok: true };
}

// ============ Solicitação de exame ============

const MAX_PROCEDIMENTOS_SECUNDARIOS = 5; // como no formulário oficial de referência

function validarSolicitacao(f) {
    const erros = [];
    if (!f.tipo_exame_id) erros.push({ campo: 'tipo_exame_id', mensagem: 'Selecione o tipo de exame.' });
    if (!PRIORIDADES.some(p => p.id === f.prioridade)) erros.push({ campo: 'prioridade', mensagem: 'Informe a prioridade clínica.' });
    if (String(f.prioridade_justificativa || '').trim().length < 5) erros.push({ campo: 'prioridade_justificativa', mensagem: 'Justifique a prioridade escolhida (mínimo de 5 caracteres).' });
    if (!String(f.proc_nome || '').trim()) erros.push({ campo: 'proc_nome', mensagem: 'Informe o nome do procedimento principal.' });
    if (!(Number(f.proc_qtd) >= 1)) erros.push({ campo: 'proc_qtd', mensagem: 'Informe a quantidade (mínimo 1).' });
    if (String(f.diagnostico_descricao || '').trim().length < 5) erros.push({ campo: 'diagnostico_descricao', mensagem: 'Descreva o diagnóstico (justificativa clínica).' });
    if (!validarCid10(f.cid_principal)) erros.push({ campo: 'cid_principal', mensagem: 'Informe o CID-10 principal no formato correto (ex.: I10).' });
    ['cid_secundario', 'cid_causas'].forEach(c => { if (String(f[c] || '').trim() && !validarCid10(f[c])) erros.push({ campo: c, mensagem: 'CID-10 em formato inválido.' }); });
    if (!['CNS', 'CPF'].includes(f.solic_tipo_doc)) erros.push({ campo: 'solic_tipo_doc', mensagem: 'Informe o tipo de documento do solicitante (CNS ou CPF).' });
    const doc = onlyDigits(f.solic_documento);
    if (f.solic_tipo_doc === 'CPF' && !validateCPF(doc)) erros.push({ campo: 'solic_documento', mensagem: 'CPF do solicitante inválido.' });
    if (f.solic_tipo_doc === 'CNS' && doc.length !== 15) erros.push({ campo: 'solic_documento', mensagem: 'CNS do solicitante deve ter 15 dígitos.' });
    if (String(f.solic_registro || '').trim().length < 3) erros.push({ campo: 'solic_registro', mensagem: 'Informe o registro no conselho profissional.' });
    if (!f.confere) erros.push({ campo: 'confere', mensagem: 'Confirme que conferiu os dados do paciente.' });
    return erros;
}

/** Dados do paciente no momento da emissão (o formulário oficial é um documento datado). O vínculo é sempre o paciente_id. */
function dadosPacienteParaFormulario(paciente) {
    const mun = typeof cadNomeMunicipio === 'function' && paciente.municipio_id ? cadNomeMunicipio(paciente.municipio_id) : '';
    return {
        nome: paciente.nome || '', sexo: paciente.sexo || '', prontuario: paciente.prontuario || '', cns: paciente.cns || '', cpf: paciente.cpf || '',
        data_nascimento: paciente.data_nascimento || '', raca_cor: paciente.raca_cor || '', etnia: paciente.etnia || '', nome_mae: paciente.nome_mae || '',
        telefone: paciente.telefone || paciente.celular || '', responsavel_nome: paciente.responsavel_nome || '', responsavel_telefone: paciente.responsavel_telefone || '',
        endereco: [paciente.logradouro, paciente.numero, paciente.complemento, paciente.bairro].filter(Boolean).join(', '),
        municipio: mun.split('/')[0] || '', codigo_ibge: paciente.municipio_id || '', uf: paciente.uf || '', cep: paciente.cep || ''
    };
}

async function emitirSolicitacaoExame(paciente, internacao, f) {
    requirePermission('exame_solicitar');
    const erros = validarSolicitacao(f);
    if (erros.length) throw new Error(erros[0].mensagem);
    const tipo = tiposExame().find(t => t.id === f.tipo_exame_id);
    if (!tipo) throw new Error('Tipo de exame não encontrado ou inativo.');
    const u = quem();
    const cfg = MOCK_DATA.CONFIG_HOSPITAL || {};
    const agora = agoraISO();
    const sol = {
        id: newId('exa'), protocolo: `EXA-${todayISO().replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        paciente_id: paciente.id, internacao_id: internacao ? internacao.id : '',
        localizacao: internacao ? { leito_id: internacao.leito_id, andar: internacao.andar, ala: internacao.ala, quarto: internacao.quarto } : null,
        tipo_exame_id: tipo.id, tipo_nome: tipo.nome, setor_destino: tipo.setor_destino, exige_autorizacao: Boolean(tipo.exige_autorizacao),
        prioridade: f.prioridade, prioridade_justificativa: String(f.prioridade_justificativa).trim(),
        prioridade_historico: [],
        procedimento_principal: { codigo: String(f.proc_codigo || '').trim(), nome: String(f.proc_nome).trim(), qtd: Number(f.proc_qtd) },
        procedimentos_secundarios: (f.secundarios || []).filter(p => String(p.nome || '').trim()).slice(0, MAX_PROCEDIMENTOS_SECUNDARIOS)
            .map(p => ({ codigo: String(p.codigo || '').trim(), nome: String(p.nome).trim(), qtd: Number(p.qtd) || 1 })),
        diagnostico_descricao: String(f.diagnostico_descricao).trim(), cid_principal: String(f.cid_principal).trim().toUpperCase(),
        cid_secundario: String(f.cid_secundario || '').trim().toUpperCase(), cid_causas: String(f.cid_causas || '').trim().toUpperCase(), observacoes: String(f.observacoes || '').trim(),
        solicitante: { nome: u.por_nome, username: u.por, tipo_doc: f.solic_tipo_doc, documento: onlyDigits(f.solic_documento), registro_conselho: String(f.solic_registro).trim() },
        data_solicitacao: todayISO(), estabelecimento_solicitante: { nome: cfg.nome || APP_INFO.hospital, cnes: cfg.cnes || '' },
        paciente_dados: dadosPacienteParaFormulario(paciente),
        status: tipo.exige_autorizacao ? 'PENDENTE_AUTORIZACAO' : 'SOLICITADO',
        historico: [{ status: tipo.exige_autorizacao ? 'PENDENTE_AUTORIZACAO' : 'SOLICITADO', em: agora, por: u.por_nome, motivo: 'Solicitação emitida' }],
        pendencias: [], agendamento: null, realizado: null, criado_em: agora, criado_por: u.por
    };
    await setDocH(COLH.SOLICITACOES, sol);
    await auditar({ entidade: 'solicitacao_exame', entidade_id: sol.id, acao: 'CRIAR', depois: { protocolo: sol.protocolo, exame: sol.tipo_nome, prioridade: sol.prioridade, paciente: paciente.id } });
    return sol;
}

const exigirCentral = (sol) => requirePermission(permissaoDoSetor(sol.setor_destino));
const buscarSol = async (id) => { const s = await getDocH(COLH.SOLICITACOES, id); if (!s) throw new Error('Solicitação não encontrada.'); return s; };

async function gravarStatusExame(sol, para, motivo, extras = {}) {
    if (!transicaoPermitida(sol.status, para)) throw new Error(`Não é possível passar de "${rotuloStatusExame(sol.status)}" para "${rotuloStatusExame(para)}".`);
    const u = quem();
    const novo = { ...sol, ...extras, status: para, historico: [...(sol.historico || []), { status: para, em: agoraISO(), por: u.por_nome, motivo: motivo || '' }] };
    await setDocH(COLH.SOLICITACOES, novo);
    await auditar({ entidade: 'solicitacao_exame', entidade_id: sol.id, acao: 'STATUS', antes: { status: sol.status }, depois: { status: para }, motivo: motivo || '' });
    return novo;
}

async function avancarExame(solId, para, motivo = '') {
    const sol = await buscarSol(solId);
    exigirCentral(sol);
    if (para === 'CANCELADO') return cancelarExame(solId, motivo);
    if (para === 'AGENDADO' || para === 'REALIZADO') throw new Error('Use as ações de agendar e de registrar a realização.');
    if (para === 'AGUARDANDO_TRIAGEM' && sol.exige_autorizacao && !autorizacaoVigente(sol.id) && sol.status !== 'SOLICITADO') throw new Error('Aguardando a autorização aprovada.');
    if (para === 'PENDENTE_AUTORIZACAO' && !sol.exige_autorizacao) throw new Error('Este tipo de exame não exige autorização.');
    return gravarStatusExame(sol, para, motivo);
}

async function cancelarExame(solId, motivo) {
    const sol = await buscarSol(solId);
    if (!hasPermission(permissaoDoSetor(sol.setor_destino)) && !hasPermission('exame_solicitar')) throw new Error('Acesso negado: seu perfil não pode cancelar este exame.');
    if (String(motivo || '').trim().length < 5) throw new Error('Informe o motivo do cancelamento (mínimo de 5 caracteres).');
    if (sol.agendamento && sol.agendamento.vaga_id) await db_ajustarVaga(sol.agendamento.vaga_id, -1);
    return gravarStatusExame(sol, 'CANCELADO', String(motivo).trim(), { agendamento: null });
}

/** Agenda (ou reagenda) numa vaga existente. Reservar e devolver vagas é atômico. */
async function agendarExame(solId, vagaId) {
    const sol = await buscarSol(solId);
    exigirCentral(sol);
    const vaga = MOCK_DATA.VAGAS_EXAME.find(v => v.id === vagaId) || await getDocH(COLH.VAGAS, vagaId);
    if (!vaga || vaga.setor !== sol.setor_destino) throw new Error('Escolha uma vaga do setor deste exame.');
    if (vaga.data < todayISO()) throw new Error('Não é possível agendar numa data passada.');
    const reagendando = sol.status === 'AGENDADO';
    if (!reagendando && !transicaoPermitida(sol.status, 'AGENDADO')) throw new Error(`Não é possível agendar um exame "${rotuloStatusExame(sol.status)}".`);
    const pode = podeAgendar(sol, vaga.data);
    if (!pode.ok) throw new Error(pode.motivo);
    if (reagendando && sol.agendamento && sol.agendamento.vaga_id === vagaId) throw new Error('O exame já está nesta vaga.');
    await db_ajustarVaga(vagaId, +1);
    try {
        if (reagendando && sol.agendamento && sol.agendamento.vaga_id) await db_ajustarVaga(sol.agendamento.vaga_id, -1);
    } catch (e) { /* a vaga antiga some do mapa de ocupação no próximo ajuste; o agendamento novo já está reservado */ }
    const u = quem();
    const agendamento = { vaga_id: vaga.id, data: vaga.data, hora: vaga.hora, por: u.por_nome, em: agoraISO() };
    if (reagendando) {
        const novo = { ...sol, agendamento, historico: [...sol.historico, { status: 'AGENDADO', em: agoraISO(), por: u.por_nome, motivo: `Reagendado para ${formatDateBR(vaga.data)} ${vaga.hora}` }] };
        await setDocH(COLH.SOLICITACOES, novo);
        await auditar({ entidade: 'solicitacao_exame', entidade_id: sol.id, acao: 'REAGENDAR', antes: sol.agendamento, depois: agendamento });
        return novo;
    }
    return gravarStatusExame(sol, 'AGENDADO', `Agendado para ${formatDateBR(vaga.data)} ${vaga.hora}`, { agendamento });
}

async function marcarReagendamento(solId, motivo) {
    const sol = await buscarSol(solId);
    exigirCentral(sol);
    if (String(motivo || '').trim().length < 5) throw new Error('Informe o motivo (mínimo de 5 caracteres).');
    if (sol.agendamento && sol.agendamento.vaga_id) await db_ajustarVaga(sol.agendamento.vaga_id, -1);
    return gravarStatusExame(sol, 'REAGENDAMENTO_NECESSARIO', String(motivo).trim(), { agendamento: null });
}

/** O exame só vira REALIZADO com confirmação explícita e o profissional que atendeu. */
async function registrarRealizacao(solId, { profissional, confirmado, resultado = '' }) {
    const sol = await buscarSol(solId);
    exigirCentral(sol);
    if (!confirmado) throw new Error('Confirme que o exame foi realizado.');
    if (String(profissional || '').trim().length < 3) throw new Error('Informe o profissional responsável pelo atendimento.');
    const u = quem();
    const novo = await gravarStatusExame(sol, 'REALIZADO', `Realizado por ${String(profissional).trim()}`, { realizado: { em: agoraISO(), por: u.por_nome, profissional: String(profissional).trim() } });
    const texto = String(resultado || '').trim();
    if (texto.length >= 5) {
        const internacao = MOCK_DATA.INTERNACOES.find(i => i.id === sol.internacao_id);
        if (internacao && internacao.status === 'ATIVA' && hasPermission('exame_resultado')) await registrarClinico({ internacao, tipo: 'RESULTADO', texto, solicitacao_id: sol.id });
    }
    return novo;
}

async function alterarPrioridade(solId, nova, justificativa) {
    requirePermission('exame_priorizar');
    const sol = await buscarSol(solId);
    if (statusEncerrado(sol.status)) throw new Error('Esta solicitação já foi encerrada.');
    if (!PRIORIDADES.some(p => p.id === nova)) throw new Error('Prioridade inválida.');
    if (nova === sol.prioridade) throw new Error('A solicitação já tem esta prioridade.');
    if (String(justificativa || '').trim().length < 5) throw new Error('Justifique a alteração de prioridade (mínimo de 5 caracteres).');
    const u = quem();
    const novoDoc = { ...sol, prioridade: nova, prioridade_justificativa: String(justificativa).trim(), prioridade_historico: [...(sol.prioridade_historico || []), { de: sol.prioridade, para: nova, em: agoraISO(), por: u.por_nome, justificativa: String(justificativa).trim() }] };
    await setDocH(COLH.SOLICITACOES, novoDoc);
    await auditar({ entidade: 'solicitacao_exame', entidade_id: sol.id, acao: 'PRIORIDADE', antes: { prioridade: sol.prioridade }, depois: { prioridade: nova }, motivo: String(justificativa).trim() });
    return novoDoc;
}

async function adicionarPendencia(solId, texto) {
    const sol = await buscarSol(solId);
    exigirCentral(sol);
    if (String(texto || '').trim().length < 5) throw new Error('Descreva a pendência (mínimo de 5 caracteres).');
    const u = quem();
    const novo = { ...sol, pendencias: [...(sol.pendencias || []), { texto: String(texto).trim(), em: agoraISO(), por: u.por_nome, resolvida: false }] };
    await setDocH(COLH.SOLICITACOES, novo);
    await auditar({ entidade: 'solicitacao_exame', entidade_id: sol.id, acao: 'PENDENCIA', depois: { texto: String(texto).trim() } });
    return novo;
}

async function resolverPendencia(solId, indice) {
    const sol = await buscarSol(solId);
    exigirCentral(sol);
    const pend = [...(sol.pendencias || [])];
    if (!pend[indice] || pend[indice].resolvida) throw new Error('Pendência não encontrada.');
    pend[indice] = { ...pend[indice], resolvida: true, resolvida_em: agoraISO(), resolvida_por: state.currentUser.name };
    const novo = { ...sol, pendencias: pend };
    await setDocH(COLH.SOLICITACOES, novo);
    await auditar({ entidade: 'solicitacao_exame', entidade_id: sol.id, acao: 'PENDENCIA_RESOLVIDA', depois: { texto: pend[indice].texto } });
    return novo;
}

// ============ Vagas ============

async function criarVaga({ setor, data, hora, capacidade, tipo_exame_id = '' }) {
    if (!SETORES_EXAME[setor]) throw new Error('Setor inválido.');
    requirePermission(permissaoDoSetor(setor));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data || '')) || data < todayISO()) throw new Error('Informe uma data de hoje em diante.');
    if (!/^\d{2}:\d{2}$/.test(String(hora || ''))) throw new Error('Informe o horário.');
    const cap = Number(capacidade);
    if (!Number.isInteger(cap) || cap < 1 || cap > 50) throw new Error('A capacidade deve ser de 1 a 50 vagas.');
    // id determinístico: duas pessoas criando a mesma vaga ao mesmo tempo nunca geram duplicata
    const idVaga = `vaga_${setor}_${data}_${hora.replace(':', '')}_${tipo_exame_id || 'todos'}`;
    if (await getDocH(COLH.VAGAS, idVaga)) throw new Error('Já existe uma vaga neste dia e horário.');
    const vaga = { id: idVaga, setor, data, hora, capacidade: cap, ocupadas: 0, tipo_exame_id, criado_por: state.currentUser.name, criado_em: agoraISO() };
    await setDocH(COLH.VAGAS, vaga);
    await auditar({ entidade: 'agenda_vaga', entidade_id: vaga.id, acao: 'CRIAR', depois: { setor, data, hora, capacidade: cap } });
    return vaga;
}

// ============ Autorização / APAC ============

async function registrarAutorizacao(solId, f) {
    requirePermission('autorizacao_gerenciar');
    const sol = await buscarSol(solId);
    if (!['APROVADA', 'NEGADA'].includes(f.decisao)) throw new Error('Informe a decisão: aprovada ou negada.');
    const erros = [];
    if (String(f.autorizador_nome || '').trim().length < 3) erros.push('Informe o nome do profissional autorizador.');
    if (String(f.orgao_emissor || '').trim().length < 2) erros.push('Informe o código do órgão emissor.');
    if (!['CNS', 'CPF'].includes(f.autorizador_tipo_doc)) erros.push('Informe o tipo de documento do autorizador.');
    const doc = onlyDigits(f.autorizador_documento);
    if (f.autorizador_tipo_doc === 'CPF' && !validateCPF(doc)) erros.push('CPF do autorizador inválido.');
    if (f.autorizador_tipo_doc === 'CNS' && doc.length !== 15) erros.push('CNS do autorizador deve ter 15 dígitos.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(f.data_autorizacao || ''))) erros.push('Informe a data da autorização.');
    else if (f.data_autorizacao > todayISO()) erros.push('A data da autorização não pode ser futura.');
    if (f.decisao === 'APROVADA') {
        if (String(f.numero_apac || '').trim().length < 3) erros.push('Informe o número da autorização/APAC.');
        if (!f.validade_inicio || !f.validade_fim) erros.push('Informe o período de validade da APAC.');
        else if (f.validade_fim < f.validade_inicio) erros.push('O fim da validade não pode ser antes do início.');
    } else if (String(f.motivo_negativa || '').trim().length < 5) erros.push('Informe o motivo da negativa.');
    if (!String(f.estab_executante_nome || '').trim() || String(f.estab_executante_cnes || '').trim() === '') erros.push('Informe o estabelecimento executante e o CNES.');
    if (String(f.autorizador_registro || '').trim().length < 3) erros.push('Informe o registro do autorizador no conselho.');
    if (erros.length) throw new Error(erros[0]);

    const anterior = autorizacaoDaSolicitacao(solId);
    const u = quem();
    const aut = {
        id: `aut_${solId}`, solicitacao_id: solId, paciente_id: sol.paciente_id, decisao: f.decisao,
        autorizador_nome: String(f.autorizador_nome).trim(), orgao_emissor: String(f.orgao_emissor).trim(), autorizador_tipo_doc: f.autorizador_tipo_doc, autorizador_documento: doc,
        autorizador_registro: String(f.autorizador_registro).trim(), data_autorizacao: f.data_autorizacao,
        numero_apac: f.decisao === 'APROVADA' ? String(f.numero_apac).trim() : '', validade_inicio: f.decisao === 'APROVADA' ? f.validade_inicio : '', validade_fim: f.decisao === 'APROVADA' ? f.validade_fim : '',
        motivo_negativa: f.decisao === 'NEGADA' ? String(f.motivo_negativa).trim() : '',
        estab_executante_nome: String(f.estab_executante_nome).trim(), estab_executante_cnes: String(f.estab_executante_cnes).trim(),
        registrado_por: u.por_nome, registrado_em: agoraISO(),
        historico: [...((anterior && anterior.historico) || []), { em: agoraISO(), por: u.por_nome, decisao: f.decisao, numero_apac: f.decisao === 'APROVADA' ? String(f.numero_apac).trim() : '' }]
    };
    await setDocH(COLH.AUTORIZACOES, aut);
    await auditar({ entidade: 'autorizacao', entidade_id: aut.id, acao: anterior ? 'EDITAR' : 'CRIAR', antes: anterior ? { decisao: anterior.decisao, numero_apac: anterior.numero_apac } : null, depois: { decisao: aut.decisao, numero_apac: aut.numero_apac, validade_fim: aut.validade_fim } });
    // Aprovada: libera a solicitação para a fila do setor (nunca aprova nem agenda sozinha)
    if (statusAutorizacao(aut) === 'APROVADA' && sol.status === 'PENDENTE_AUTORIZACAO') await gravarStatusExame(sol, 'AGUARDANDO_TRIAGEM', `Autorização ${aut.numero_apac} registrada`);
    return aut;
}

async function salvarConfigHospital({ nome, cnes }) {
    requirePermission('autorizacao_gerenciar');
    const c = onlyDigits(cnes);
    if (c && c.length !== 7) throw new Error('O CNES tem 7 dígitos.');
    await setDocH(COLH.CONFIG, { id: 'active', nome: String(nome || '').trim(), cnes: c, atualizado_por: state.currentUser.name, atualizado_em: agoraISO() });
    await auditar({ entidade: 'config_hospital', entidade_id: 'active', acao: 'EDITAR', depois: { nome: String(nome || '').trim(), cnes: c } });
}

// Tipos de exame padrão (TC, RNM, Biópsia, Ultrassonografia). Criados uma vez, com IDs fixos, pelo administrador.
// O código SIGTAP fica em branco de propósito: é preenchido por quem conhece a tabela oficial.
const TIPOS_EXAME_PADRAO = [
    { id: 'tipo_tc', nome: 'Tomografia Computadorizada (TC)', setor_destino: 'IMAGENOLOGIA', exige_autorizacao: true },
    { id: 'tipo_rnm', nome: 'Ressonância Magnética (RNM)', setor_destino: 'IMAGENOLOGIA', exige_autorizacao: true },
    { id: 'tipo_biopsia', nome: 'Biópsia', setor_destino: 'IMAGENOLOGIA', exige_autorizacao: true },
    { id: 'tipo_us', nome: 'Ultrassonografia', setor_destino: 'ULTRASSONOGRAFIA', exige_autorizacao: false }
];

async function garantirTiposExamePadrao() {
    if (!state.currentUser || state.currentUser.role !== 'ADMIN') return;
    const database = requireDb();
    for (const t of TIPOS_EXAME_PADRAO) {
        const ref = database.collection('cad_tipoexame').doc(t.id);
        if ((await ref.get()).exists) continue;
        const codigo = await db_cadProximoCodigo('tipoexame', 'EXM');
        await ref.set({ ...t, codigo, codigo_procedimento: '', nome_procedimento: '', observacoes: 'Tipo padrão. Informe o código do procedimento conforme a tabela oficial.', ativo: true, criado_em: agoraISO(), criado_por: state.currentUser.username, versao: 1 });
    }
}
