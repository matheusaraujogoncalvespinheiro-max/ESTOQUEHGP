// Regras de negócio da Recepção e da Emergência: validação, duplicidade, cadastro, edição controlada e auditoria.
// As telas só chamam estas funções (que validam permissão e dados) e mostram o resultado; quem grava é
// services/db-atendimento.js.

// ============ Recepção: pacientes ============

/** Valida o cadastro rápido. Devolve a lista de erros: [{ campo, mensagem }]. */
function validatePacienteForm(form) {
    const erros = [];
    const nome = String(form.nome ?? '').trim();
    const prontuario = String(form.prontuario ?? '').trim();
    const cpf = onlyDigits(form.cpf);
    const telefone = onlyDigits(form.telefone);

    if (wordsCount(nome) < 2 || nome.length < 5) erros.push({ campo: 'nome', mensagem: 'Informe o nome completo do paciente.' });
    if (!prontuario && !cpf) erros.push({ campo: 'prontuario', mensagem: 'Informe o número de identificação/prontuário ou o CPF.' });
    if (cpf && !validateCPF(cpf)) erros.push({ campo: 'cpf', mensagem: 'CPF inválido. Confira os 11 dígitos.' });
    if (!validateBirthDate(form.data_nascimento)) erros.push({ campo: 'data_nascimento', mensagem: 'Informe uma data de nascimento válida (não pode ser futura).' });
    if (telefone && !validatePhone(telefone)) erros.push({ campo: 'telefone', mensagem: 'Telefone inválido. Use DDD + número.' });
    return erros;
}

/** Dados do paciente prontos para gravar (CPF e telefone só com dígitos; nome_busca para pesquisa). */
function buildPacientePayload(form) {
    const nome = String(form.nome ?? '').trim().replace(/\s+/g, ' ');
    return {
        nome,
        nome_busca: searchKey(nome),
        nome_palavras: searchKey(nome).split(' ').filter(w => w.length >= 2),
        prontuario: String(form.prontuario ?? '').trim(),
        cpf: onlyDigits(form.cpf),
        data_nascimento: form.data_nascimento,
        telefone: onlyDigits(form.telefone)
    };
}

/**
 * Procura cadastros que podem ser do mesmo paciente.
 * Devolve [{ paciente, motivos: [...], bloqueia }]; `bloqueia` = CPF ou prontuário idênticos (não pode cadastrar de novo).
 */
async function findDuplicatePacientes(payload, excludeId = null) {
    const found = new Map();
    const add = (list, motivo, bloqueia) => list.forEach(p => {
        if (p.id === excludeId || p.ativo === false) return;
        const entry = found.get(p.id) || { paciente: p, motivos: [], bloqueia: false };
        if (!entry.motivos.includes(motivo)) entry.motivos.push(motivo);
        entry.bloqueia = entry.bloqueia || bloqueia;
        found.set(p.id, entry);
    });

    if (payload.cpf) add(await db_findPacientesByField('cpf', payload.cpf), 'CPF idêntico', true);
    if (payload.prontuario) add(await db_findPacientesByField('prontuario', payload.prontuario), 'Prontuário idêntico', true);

    const byName = (await db_findPacientesByNamePrefix(payload.nome_busca)).filter(p => p.nome_busca === payload.nome_busca);
    add(byName.filter(p => p.data_nascimento === payload.data_nascimento), 'Mesmo nome e data de nascimento', false);
    add(byName.filter(p => p.data_nascimento !== payload.data_nascimento), 'Mesmo nome (nascimento diferente)', false);

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

/** Cadastra o paciente e já registra o primeiro atendimento. */
async function cadastrarPaciente(form) {
    requirePermission('recepcao_acessar');
    const erros = validatePacienteForm(form);
    if (erros.length) throw new Error(erros[0].mensagem);

    const user = state.currentUser;
    const agora = nowISO();
    const paciente = {
        id: newId('pac'),
        ...buildPacientePayload(form),
        ativo: true,
        criado_em: agora,
        criado_por: user.username,
        criado_por_nome: user.name,
        atualizado_em: agora,
        atualizado_por: user.username
    };
    await db_savePaciente(paciente);
    await auditar({ entidade: 'paciente', entidade_id: paciente.id, acao: 'CRIAR', depois: { nome: paciente.nome, prontuario: paciente.prontuario } });
    const registro = await registrarAtendimento(paciente, form.observacoes);
    return { paciente, registro };
}

const CAMPOS_PACIENTE = ['nome', 'prontuario', 'cpf', 'data_nascimento', 'telefone'];

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
    const results = new Map();
    const add = (list) => list.forEach(p => { if (p.ativo !== false) results.set(p.id, p); });

    if (digits.length === 11) add(await db_findPacientesByField('cpf', digits));
    add(await db_findPacientesByField('prontuario', texto));
    if (digits && digits !== texto) add(await db_findPacientesByField('prontuario', digits));
    if (!/^[\d.\-\s]+$/.test(texto)) {
        const chave = searchKey(texto);
        add(await db_findPacientesByNamePrefix(chave));
        // Também acha pelo sobrenome ou qualquer palavra inteira do nome: todas as palavras digitadas devem aparecer no nome
        const palavras = chave.split(' ').filter(w => w.length >= 3);
        if (palavras.length) {
            const maior = [...palavras].sort((a, b) => b.length - a.length)[0];
            const candidatos = await db_findPacientesByWord(maior);
            add(candidatos.filter(p => palavras.every(w => String(p.nome_busca).includes(w))));
        }
    }
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
