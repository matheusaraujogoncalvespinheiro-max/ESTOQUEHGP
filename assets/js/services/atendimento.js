// Regras de negócio da Recepção e da Emergência: validação, duplicidade, cadastro, edição controlada e auditoria.
// As telas só chamam estas funções (que validam permissão e dados) e mostram o resultado; quem grava é
// services/db-atendimento.js.

// ============ Recepção: pacientes ============

/** Valida o cadastro rápido (Cadastro Único vinculado ao CPF e ao CNS). Devolve a lista de erros: [{ campo, mensagem }]. */
function validatePacienteForm(form) {
    const erros = [];
    const nome = String(form.nome ?? '').trim();
    const prontuario = String(form.prontuario ?? '').trim();
    const cpf = onlyDigits(form.cpf);
    const cns = onlyDigits(form.cns);
    const telefone = onlyDigits(form.telefone);

    if (wordsCount(nome) < 2 || nome.length < 5) erros.push({ campo: 'nome', mensagem: 'Informe o nome completo do paciente.' });
    if (!prontuario && !cpf && !cns) erros.push({ campo: 'prontuario', mensagem: 'Informe o CPF, o Cartão SUS (CNS) ou o número do prontuário.' });
    if (cpf && !validateCPF(cpf)) erros.push({ campo: 'cpf', mensagem: 'CPF inválido. Confira os 11 dígitos.' });
    if (cns && cns.length !== 15) erros.push({ campo: 'cns', mensagem: 'Cartão Nacional de Saúde (CNS) deve ter 15 dígitos.' });
    if (!validateBirthDate(form.data_nascimento)) erros.push({ campo: 'data_nascimento', mensagem: 'Informe uma data de nascimento válida (não pode ser futura).' });
    if (telefone && !validatePhone(telefone)) erros.push({ campo: 'telefone', mensagem: 'Telefone inválido. Use DDD + número.' });
    return erros;
}

/** Dados do paciente prontos para gravar (CPF, CNS e telefone só com dígitos; nome_busca para pesquisa). */
function buildPacientePayload(form) {
    const nome = String(form.nome ?? '').trim().replace(/\s+/g, ' ');
    return {
        nome,
        nome_busca: searchKey(nome),
        nome_palavras: searchKey(nome).split(' ').filter(w => w.length >= 2),
        prontuario: String(form.prontuario ?? '').trim(),
        cpf: onlyDigits(form.cpf),
        cns: onlyDigits(form.cns),
        data_nascimento: form.data_nascimento,
        telefone: onlyDigits(form.telefone)
    };
}

/**
 * Cadastro Único de Pacientes (Anti-Duplicidade por CPF, Cartão Nacional de Saúde - CNS e Nº Prontuário).
 * Verifica tanto em memória (cache/seed) quanto no banco Firestore.
 * Devolve [{ paciente, motivos: [...], bloqueia }]; `bloqueia` = CPF, CNS ou prontuário idênticos (não pode cadastrar duplicado).
 */
async function findDuplicatePacientes(payload, excludeId = null) {
    const found = new Map();
    const add = (list, motivo, bloqueia) => (list || []).forEach(p => {
        if (!p || p.id === excludeId || p.ativo === false) return;
        const entry = found.get(p.id) || { paciente: p, motivos: [], bloqueia: false };
        if (!entry.motivos.includes(motivo)) entry.motivos.push(motivo);
        entry.bloqueia = entry.bloqueia || bloqueia;
        found.set(p.id, entry);
    });

    const cpfLimpo = onlyDigits(payload.cpf);
    const cnsLimpo = onlyDigits(payload.cns);
    const prontLimpo = String(payload.prontuario || '').trim();

    // 1. Verificação síncrona no cache local / seed
    const locais = [
        ...Object.values((typeof MOCK_DATA !== 'undefined' && MOCK_DATA.PACIENTES_SEED_MAP) || {}),
        ...((typeof CAD_DATA !== 'undefined' && Array.isArray(CAD_DATA.paciente)) ? CAD_DATA.paciente : [])
    ];
    if (cpfLimpo) add(locais.filter(p => onlyDigits(p.cpf) === cpfLimpo), 'CPF idêntico (Cadastro Único)', true);
    if (cnsLimpo) add(locais.filter(p => onlyDigits(p.cns) === cnsLimpo), 'Cartão SUS (CNS) idêntico (Cadastro Único)', true);
    if (prontLimpo) add(locais.filter(p => String(p.prontuario || '').trim() === prontLimpo), 'Prontuário idêntico', true);

    // 2. Verificação no banco Firestore (quando conectado)
    if (typeof _temBanco === 'function' ? _temBanco() : (typeof db !== 'undefined' && db)) {
        try {
            if (cpfLimpo) add(await db_findPacientesByField('cpf', cpfLimpo), 'CPF idêntico (Cadastro Único)', true);
            if (cnsLimpo) add(await db_findPacientesByField('cns', cnsLimpo), 'Cartão SUS (CNS) idêntico (Cadastro Único)', true);
            if (prontLimpo) add(await db_findPacientesByField('prontuario', prontLimpo), 'Prontuário idêntico', true);
            if (payload.nome_busca) {
                const byName = (await db_findPacientesByNamePrefix(payload.nome_busca)).filter(p => p.nome_busca === payload.nome_busca);
                add(byName.filter(p => p.data_nascimento === payload.data_nascimento), 'Mesmo nome e data de nascimento', false);
                add(byName.filter(p => p.data_nascimento !== payload.data_nascimento), 'Mesmo nome (nascimento diferente)', false);
            }
        } catch (e) { /* usa resultado em memória quando offline */ }
    }

    return [...found.values()];
}

/** Cria o registro de atendimento (visita à recepção) de um paciente já cadastrado. */
async function registrarAtendimento(paciente, observacoes = '') {
    requirePermission('recepcao_acessar');
    const user = state.currentUser;
    const agora = nowISO();
    const registro = {
        id: newId('rec'),
        paciente_id: paciente.id,
        nome_paciente: paciente.nome,
        prontuario: paciente.prontuario || '',
        data_hora_atendimento: agora,
        observacoes: String(observacoes ?? '').trim(),
        criado_em: agora,
        criado_por: user.username,
        criado_por_nome: user.name
    };
    await db_saveRegistroRecepcao(registro);
    await auditar({ entidade: 'atendimento', entidade_id: registro.id, acao: 'CRIAR', depois: { paciente_id: paciente.id, nome: paciente.nome } });
    return registro;
}

/** Cadastra o paciente (Cadastro Único com bloqueio de duplicidade por CPF, CNS e Prontuário) e já registra o primeiro atendimento. */
async function cadastrarPaciente(form) {
    requirePermission('recepcao_acessar');
    const erros = validatePacienteForm(form);
    if (erros.length) throw new Error(erros[0].mensagem);

    const payload = buildPacientePayload(form);
    const duplicados = (await findDuplicatePacientes(payload)).filter(d => d.bloqueia);
    if (duplicados.length) {
        throw new Error(`Cadastro Único: já existe paciente com ${duplicados[0].motivos.join(' / ')} (${duplicados[0].paciente.nome}).`);
    }

    const user = state.currentUser;
    const agora = nowISO();
    const paciente = {
        id: newId('pac'),
        ...payload,
        ativo: true,
        criado_em: agora,
        criado_por: user.username,
        criado_por_nome: user.name,
        atualizado_em: agora,
        atualizado_por: user.username
    };
    await db_savePaciente(paciente);
    await auditar({ entidade: 'paciente', entidade_id: paciente.id, acao: 'CRIAR', depois: { nome: paciente.nome, prontuario: paciente.prontuario, cpf: paciente.cpf, cns: paciente.cns } });
    const registro = await registrarAtendimento(paciente, form.observacoes);
    return { paciente, registro };
}

const CAMPOS_PACIENTE = ['nome', 'prontuario', 'cpf', 'cns', 'data_nascimento', 'telefone'];

/** Edita a identificação do paciente (exige permissão de edição) e registra o que mudou. */
async function atualizarPaciente(id, form) {
    requirePermission('recepcao_editar');
    const erros = validatePacienteForm(form);
    if (erros.length) throw new Error(erros[0].mensagem);

    const atual = await db_getPaciente(id);
    if (!atual) throw new Error('Paciente não encontrado.');
    const payload = buildPacientePayload(form);

    const duplicados = (await findDuplicatePacientes(payload, id)).filter(d => d.bloqueia);
    if (duplicados.length) throw new Error(`Já existe outro paciente com ${duplicados[0].motivos.join(' / ').toLowerCase()}: ${duplicados[0].paciente.nome}.`);

    const diff = diffCampos(atual, payload, CAMPOS_PACIENTE);
    if (!diff.campos.length) throw new Error('Nenhuma informação foi alterada.');

    const user = state.currentUser;
    const atualizado = { ...payload, atualizado_em: nowISO(), atualizado_por: user.username };
    await db_savePaciente({ id, ...atualizado });
    await auditar({ entidade: 'paciente', entidade_id: id, acao: 'EDITAR', antes: diff.antes, depois: diff.depois });
    return { ...atual, ...atualizado };
}

/** Pesquisa por nome (início), prontuário ou CPF. Só devolve pacientes ativos. */
async function buscarPacientes(term) {
    requirePermission('pacientes_consultar');
    const texto = String(term ?? '').trim();
    if (texto.length < 2) return [];
    const digits = onlyDigits(texto);
    const chave = searchKey(texto);
    const results = new Map();
    const add = (list) => (list || []).forEach(p => { if (p && p.ativo !== false) results.set(p.id, p); });

    // Busca em memória (pacientes de seed e cache do cadastro)
    const locais = [
        ...Object.values(MOCK_DATA.PACIENTES_SEED_MAP || {}),
        ...((typeof CAD_DATA !== 'undefined' && Array.isArray(CAD_DATA.paciente)) ? CAD_DATA.paciente : [])
    ];
    add(locais.filter(p =>
        (digits && (String(p.cpf || '') === digits || String(p.cns || '') === digits || String(p.prontuario || '').includes(digits)))
        || searchKey(`${p.nome || ''} ${p.prontuario || ''} ${p.cpf || ''} ${p.cns || ''}`).includes(chave)
    ));

    try {
        if (digits.length === 11) add(await db_findPacientesByField('cpf', digits));
        if (digits.length === 15) add(await db_findPacientesByField('cns', digits));
        add(await db_findPacientesByField('prontuario', texto));
        if (digits && digits !== texto) add(await db_findPacientesByField('prontuario', digits));
        if (!/^[\d.\-\s]+$/.test(texto)) {
            add(await db_findPacientesByNamePrefix(chave));
            // Também acha pelo sobrenome ou qualquer palavra inteira do nome: todas as palavras digitadas devem aparecer no nome
            const palavras = chave.split(' ').filter(w => w.length >= 3);
            if (palavras.length) {
                const maior = [...palavras].sort((a, b) => b.length - a.length)[0];
                const candidatos = await db_findPacientesByWord(maior);
                add(candidatos.filter(p => palavras.every(w => String(p.nome_busca).includes(w))));
            }
        }
    } catch (e) { /* banco offline: retorna os resultados em memória */ }
    return [...results.values()];
}

// ============ Emergência: ocorrências ============

const CLASSIFICACOES_OCORRENCIA = [
    { id: 'URGENTE', rotulo: 'Urgente' },
    { id: 'EMERGENCIA', rotulo: 'Emergência' },
    { id: 'OUTROS', rotulo: 'Outros' }
];
const rotuloClassificacao = (id) => (CLASSIFICACOES_OCORRENCIA.find(c => c.id === id) || { rotulo: id || '—' }).rotulo;

const SETORES_ORIGEM = [
    'Pronto Socorro', 'Recepção', 'Triagem', 'Enfermaria', 'UTI', 'Centro Cirúrgico', 'Hemodinâmica',
    'Ambulatório', 'Portaria', 'Farmácia / Estoque', 'Outro'
];

const SEXOS = [{ id: 'F', rotulo: 'Feminino' }, { id: 'M', rotulo: 'Masculino' }, { id: 'O', rotulo: 'Outro' }, { id: 'N', rotulo: 'Não informado' }];

/** Valida o registro de ocorrência. Devolve [{ campo, mensagem }]. */
function validateOcorrenciaForm(form) {
    const erros = [];
    const req = (campo, mensagem, min = 1) => { if (String(form[campo] ?? '').trim().length < min) erros.push({ campo, mensagem }); };

    req('paciente_nome', 'Informe o nome do paciente (ou "Não identificado").', 3);
    req('o_que_aconteceu', 'Descreva resumidamente o que aconteceu.', 3);
    req('descricao', 'Descreva o incidente (mínimo de 10 caracteres).', 10);
    req('local', 'Informe o local onde aconteceu.', 2);
    req('setor_origem', 'Informe o setor de origem.');
    if (form.risco_manchester && !nivelRisco(form.risco_manchester)) erros.push({ campo: 'risco_manchester', mensagem: 'Nível de risco inválido.' });
    if (form.risco_manchester && !PERFIS_CLASSIFICADORES.includes(state.currentUser && state.currentUser.role)) erros.push({ campo: 'risco_manchester', mensagem: 'Somente o profissional habilitado (enfermagem/administrador) classifica o risco.' });
    if (!CLASSIFICACOES_OCORRENCIA.some(c => c.id === form.classificacao)) erros.push({ campo: 'classificacao', mensagem: 'Selecione a classificação da ocorrência.' });

    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(form.data_ocorrencia ?? ''))) erros.push({ campo: 'data_ocorrencia', mensagem: 'Informe a data da ocorrência.' });
    else if (form.data_ocorrencia > todayISO()) erros.push({ campo: 'data_ocorrencia', mensagem: 'A data da ocorrência não pode ser futura.' });
    if (!/^\d{2}:\d{2}$/.test(String(form.hora_ocorrencia ?? ''))) erros.push({ campo: 'hora_ocorrencia', mensagem: 'Informe a hora exata do incidente.' });
    else if (form.data_ocorrencia === todayISO() && form.hora_ocorrencia > nowTime()) erros.push({ campo: 'hora_ocorrencia', mensagem: 'A hora da ocorrência não pode ser futura.' });

    const cpf = onlyDigits(form.cpf);
    if (cpf && !validateCPF(cpf)) erros.push({ campo: 'cpf', mensagem: 'CPF inválido.' });
    if (form.data_nascimento && !validateBirthDate(form.data_nascimento)) erros.push({ campo: 'data_nascimento', mensagem: 'Data de nascimento inválida.' });
    if (String(form.idade ?? '').trim() !== '') {
        const idade = Number(form.idade);
        if (!Number.isInteger(idade) || idade < 0 || idade > 130) erros.push({ campo: 'idade', mensagem: 'Idade inválida.' });
    }
    return erros;
}

const CAMPOS_OCORRENCIA = ['paciente_nome', 'prontuario', 'cpf', 'data_nascimento', 'idade', 'sexo', 'o_que_aconteceu', 'descricao', 'local',
    'data_ocorrencia', 'hora_ocorrencia', 'setor_origem', 'classificacao', 'risco_manchester', 'complementares'];

function buildOcorrenciaPayload(form) {
    const nome = String(form.paciente_nome ?? '').trim().replace(/\s+/g, ' ');
    return {
        paciente_id: form.paciente_id || '',
        paciente_nome: nome,
        paciente_nome_busca: searchKey(nome),
        prontuario: String(form.prontuario ?? '').trim(),
        cpf: onlyDigits(form.cpf),
        data_nascimento: form.data_nascimento || '',
        idade: String(form.idade ?? '').trim(),
        sexo: form.sexo || '',
        o_que_aconteceu: String(form.o_que_aconteceu ?? '').trim(),
        descricao: String(form.descricao ?? '').trim(),
        local: String(form.local ?? '').trim(),
        data_ocorrencia: form.data_ocorrencia,
        hora_ocorrencia: form.hora_ocorrencia,
        setor_origem: form.setor_origem,
        classificacao: form.classificacao,
        risco_manchester: form.risco_manchester || '',
        complementares: String(form.complementares ?? '').trim()
    };
}

/** Número de protocolo legível: EMG-AAAAMMDD-HHMMSS-XXXX */
function gerarProtocolo(date = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    const dia = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
    const hora = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
    return `EMG-${dia}-${hora}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

async function registrarOcorrencia(form) {
    requirePermission('emergencia_registrar');
    const erros = validateOcorrenciaForm(form);
    if (erros.length) throw new Error(erros[0].mensagem);

    const user = state.currentUser;
    const agora = new Date();
    const ocorrencia = {
        id: newId('oco'),
        protocolo: gerarProtocolo(agora),
        ...buildOcorrenciaPayload(form),
        status: 'REGISTRADA',
        nsp_status: 'AVALIAR', nsp_protocolo: '', nsp_observacao: '', nsp_data: '', nsp_por: '',
        versao: 1,
        registrado_em: agora.toISOString(),
        registrado_por: user.username,
        profissional_responsavel: user.name,
        perfil_registro: user.role,
        atendido_em: '',
        atendido_por: '',
        atualizado_em: '',
        atualizado_por: ''
    };
    await db_saveOcorrencia(ocorrencia);
    await auditar({ entidade: 'ocorrencia', entidade_id: ocorrencia.id, acao: 'CRIAR', depois: { protocolo: ocorrencia.protocolo, classificacao: ocorrencia.classificacao } });
    return ocorrencia;
}

/** Quem pode editar: o Administrador sempre; o funcionário da Emergência só as próprias, em até 24 h. */
function canEditOcorrencia(ocorrencia) {
    if (!state.currentUser) return false;
    if (state.currentUser.role === 'ADMIN') return true;
    if (!hasPermission('emergencia_editar_proprio')) return false;
    const idade = Date.now() - new Date(ocorrencia.registrado_em).getTime();
    return ocorrencia.registrado_por === state.currentUser.username && idade <= 24 * 60 * 60 * 1000;
}

/** Edição controlada: exige permissão, motivo e registra data/hora, usuário e o que mudou. */
async function atualizarOcorrencia(id, form, motivo) {
    const atual = await db_getOcorrencia(id);
    if (!atual) throw new Error('Ocorrência não encontrada.');
    if (!canEditOcorrencia(atual)) throw new Error('Acesso negado: você não pode editar esta ocorrência.');
    if (String(motivo ?? '').trim().length < 5) throw new Error('Informe o motivo da alteração (mínimo de 5 caracteres).');

    const erros = validateOcorrenciaForm(form);
    if (erros.length) throw new Error(erros[0].mensagem);

    const payload = buildOcorrenciaPayload({ ...form, paciente_id: atual.paciente_id });
    const diff = diffCampos(atual, payload, CAMPOS_OCORRENCIA);
    if (!diff.campos.length) throw new Error('Nenhuma informação foi alterada.');

    const user = state.currentUser;
    const mudanca = {
        ...payload,
        status: 'EDITADA',
        versao: (atual.versao || 1) + 1,
        atualizado_em: nowISO(),
        atualizado_por: user.username,
        atualizado_por_nome: user.name
    };
    await db_saveOcorrencia({ id, ...mudanca });
    await auditar({ entidade: 'ocorrencia', entidade_id: id, acao: 'EDITAR', antes: diff.antes, depois: diff.depois, motivo: String(motivo).trim() });
    return { ...atual, ...mudanca };
}

// ---- Núcleo de Segurança do Paciente (NSP): toda ocorrência precisa ser avaliada; evento adverso é notificado ----
const STATUS_NSP = {
    AVALIAR: 'A avaliar pelo NSP',
    NOTIFICADA: 'Notificada',
    NAO_E_EVENTO: 'Não é evento adverso'
};

/** Registra a avaliação do NSP. Notificada exige protocolo e data; "não é evento" exige justificativa. Fica na auditoria. */
async function registrarAvaliacaoNsp(id, { status, protocolo = '', data = '', observacao = '' }) {
    requirePermission('nsp_gerenciar');
    if (!['NOTIFICADA', 'NAO_E_EVENTO'].includes(status)) throw new Error('Escolha o resultado da avaliação.');
    if (status === 'NOTIFICADA') {
        if (String(protocolo).trim().length < 3) throw new Error('Informe o protocolo da notificação (ex.: número no Notivisa).');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data)) || data > todayISO()) throw new Error('Informe a data da notificação (não pode ser futura).');
    } else if (String(observacao).trim().length < 5) throw new Error('Justifique por que não é evento adverso (mínimo de 5 caracteres).');
    const atual = await db_getOcorrencia(id);
    if (!atual) throw new Error('Ocorrência não encontrada.');
    const user = state.currentUser;
    const mudanca = { nsp_status: status, nsp_protocolo: status === 'NOTIFICADA' ? String(protocolo).trim() : '', nsp_data: status === 'NOTIFICADA' ? data : '', nsp_observacao: String(observacao || '').trim(), nsp_por: user.name };
    await db_saveOcorrencia({ id, ...mudanca });
    await auditar({ entidade: 'ocorrencia', entidade_id: id, acao: 'AVALIAR_NSP', antes: { nsp_status: atual.nsp_status || 'AVALIAR' }, depois: { nsp_status: status, nsp_protocolo: mudanca.nsp_protocolo }, motivo: mudanca.nsp_observacao });
    return { ...atual, ...mudanca };
}

/** Marca que o paciente classificado já foi atendido (encerra a contagem do tempo-alvo). Fica na auditoria. */
async function marcarOcorrenciaAtendida(id) {
    requirePermission('emergencia_registrar');
    const atual = await db_getOcorrencia(id);
    if (!atual) throw new Error('Ocorrência não encontrada.');
    if (atual.atendido_em) throw new Error('Esta ocorrência já está marcada como atendida.');
    const user = state.currentUser;
    const mudanca = { atendido_em: nowISO(), atendido_por: user.username };
    await db_saveOcorrencia({ id, ...mudanca });
    await auditar({ entidade: 'ocorrencia', entidade_id: id, acao: 'ATENDER', depois: mudanca });
    return { ...atual, ...mudanca };
}

/** Pesquisa ocorrências por nome (início), prontuário ou protocolo; junta o que está carregado com a busca no banco. */
async function buscarOcorrencias(term) {
    requirePermission('emergencia_acessar');
    const texto = String(term ?? '').trim();
    if (texto.length < 2) return [];
    const key = searchKey(texto);
    const results = new Map();
    MOCK_DATA.OCORRENCIAS_EMERGENCIA
        .filter(o => o.paciente_nome_busca?.includes(key) || String(o.prontuario).toLowerCase() === texto.toLowerCase() || String(o.protocolo).toLowerCase() === texto.toLowerCase())
        .forEach(o => results.set(o.id, o));
    const remote = await Promise.all([
        db_findOcorrenciasByField('prontuario', texto),
        db_findOcorrenciasByField('protocolo', texto.toUpperCase()),
        /^[\d.\-\s]+$/.test(texto) ? Promise.resolve([]) : db_findOcorrenciasByNamePrefix(key)
    ]);
    remote.flat().forEach(o => results.set(o.id, o));
    return [...results.values()].sort((a, b) => String(b.registrado_em).localeCompare(String(a.registrado_em)));
}
