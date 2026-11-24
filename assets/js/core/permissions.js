// Permissões por perfil

// Etapa 9: quem pode pedir transporte. O transporte de PACIENTE exige um perfil assistencial; o de material, também os setores de apoio.
const PERFIS_TRANSPORTE_PACIENTE = ['MEDICO', 'FUNC_ENFERMAGEM', 'FUNC_RECEPCAO', 'FUNC_EMERGENCIA', 'FUNC_CENTRO_CIRURGICO', 'FUNC_HEMODINAMICA', 'CHEFE_HEMODINAMICA', 'FUNC_IMAGENOLOGIA', 'FUNC_ULTRASSOM'];
const PERFIS_SOLICITAM_TRANSPORTE = [...PERFIS_TRANSPORTE_PACIENTE, 'CHEFE_OPME', 'FUNC_OPME', 'CHEFE_FARMACIA', 'FUNC_FARMACIA', 'FUNC_NUTRICAO', 'FUNC_HEMOTERAPIA'];

function hasPermission(action, setor = null) {
    if (!state.currentUser) return false;

    const role = state.currentUser.role;

    // O administrador tem acesso a todas as telas e operações.
    if (role === 'ADMIN') return true;

    // Perfis e Permissões editáveis (#5): o que o Administrador concedeu ou retirou no banco vale sobre o padrão do código.
    if (typeof permissaoBancoDe === 'function') {
        const o = permissaoBancoDe(role, action);
        if (o === 'revoga') return false;
        if (o === 'concede') return true;
    }

    // Apoio e infraestrutura (Etapa 9): ações abertas a vários perfis (as demais ficam no bloco de cada perfil)
    if (action === 'manutencao_solicitar') return true;   // qualquer usuário logado abre um chamado de manutenção
    if (action === 'transporte_solicitar') return PERFIS_SOLICITAM_TRANSPORTE.includes(role);
    if (action === 'transporte_solicitar_paciente') return PERFIS_TRANSPORTE_PACIENTE.includes(role);
    if (action === 'transporte_ver') return PERFIS_SOLICITAM_TRANSPORTE.includes(role) || role === 'FUNC_TRANSPORTE';

    if (role === 'CHEFE_OPME') {
        if (action === 'register' && (setor === 'OPME' || setor === 'HEMODINAMICA' || setor === 'CENTRO_CIRURGICO')) return true;
        if (action === 'update_stock' && (setor === 'OPME' || setor === 'HEMODINAMICA' || setor === 'CENTRO_CIRURGICO')) return true;
        if (action === 'transfer') return true;
        if (action === 'view_history') return true;
        if (action === 'register_patient') return false;
        if (action === 'view_patients') return false;
        if (action === 'view_laudos') return true;
        if (action === 'manage_members') return true;
        return ['nir_ver', 'transporte_ver', 'transporte_solicitar'].includes(action);
    }

    if (role === 'CHEFE_HEMODINAMICA') {
        if (action === 'register') return false;
        if (action === 'update_stock') return false;
        if (action === 'transfer') return true;
        if (action === 'view_history') return true;
        if (action === 'view_patients') return true;
        if (action === 'create_laudo' && setor === 'HEMODINAMICA') return true;
        if (action === 'view_laudos') return true;
        return [
            'atendimento_procedimentos', 'painel_chamada', 'patrimonio_ver', 'nir_ver', 'transporte_ver', 'transporte_solicitar'
        ].includes(action);
    }

    if (role === 'FUNC_HEMODINAMICA') {
        if (action === 'update_stock' && (setor === 'HEMODINAMICA' || setor === null)) return true;
        if (action === 'transfer' && (setor === 'HEMODINAMICA' || setor === 'OPME')) return true;
        if (action === 'view_history') return true;
        if (action === 'create_laudo' && setor === 'HEMODINAMICA') return true;
        if (action === 'view_laudos') return true;
        return [
            'atendimento_procedimentos', 'painel_chamada', 'nir_ver', 'transporte_ver'
        ].includes(action);
    }

    if (role === 'FUNC_OPME') {
        if (action === 'update_stock' && setor === 'OPME') return true;
        if (action === 'transfer' && (setor === 'OPME' || setor === null)) return true;
        if (action === 'view_history') return true;
        if (action === 'create_laudo' && setor === 'OPME') return true;
        if (action === 'view_laudos') return true;
        return ['nir_ver', 'transporte_ver'].includes(action);
    }

    if (role === 'FUNC_CENTRO_CIRURGICO') {
        if (action === 'update_stock' && setor === 'CENTRO_CIRURGICO') return true;
        if (action === 'transfer' && setor === 'CENTRO_CIRURGICO') return true;
        if (action === 'view_history') return true;
        if (action === 'create_laudo' && setor === 'CENTRO_CIRURGICO') return true;
        if (action === 'view_laudos') return true;
        if (action === 'manage_salas') return true;
        return [
            'cirurgia_ver', 'cirurgia_gerenciar', 'cirurgia_registrar', 'atendimento_procedimentos', 'painel_chamada', 'nir_ver', 'transporte_ver'
        ].includes(action);
    }

    if (role === 'FUNC_ENFERMAGEM') {
        if (action === 'register_patient') return true;
        if (action === 'view_patients') return true;
        if (action === 'manage_patient_status') return true;
        if (action === 'transfer') return false;
        if (action === 'view_history') return false;
        if (action === 'view_notifications') return false;
        if (action === 'create_laudo') return false;
        if (action === 'view_laudos') return false;
        // Enfermagem: união das permissões das duas linhas de desenvolvimento (Etapa 6 + evolução/sinais vitais/checagem)
        return [
            'mapa_ver', 'internacao_gerenciar', 'leito_gerenciar', 'fila_leito', 'prontuario_ver', 'prontuario_evoluir', 'pacientes_consultar',
            'triagem_clinica', 'painel_chamada', 'enfermagem_ver', 'enfermagem_registrar', 'prescrever_cuidados', 'farmacia_requisicao',
            'agenda_ambulatorial_ver', 'atendimento_procedimentos', 'cirurgia_ver', 'cirurgia_registrar', 'uti_ver', 'uti_registrar', 'dieta_ver',
            'hemoterapia_ver', 'hemoterapia_transfundir', 'obito_ver', 'obito_acompanhar', 'laboratorio_ver', 'evolucao_enfermagem', 'sinais_vitais_registrar',
            'preparo_exame_checar', 'alergia_gerenciar', 'risco_assistencial_gerenciar', 'prescricao_checar', 'farmacia_retirar', 'auditoria_ver', 'nir_ver',
            'transporte_ver', 'transporte_solicitar'
        ].includes(action);
    }

    // ---- Farmácia (Etapa 7): estoque do setor FARMACIA, prescrições para a farmácia e dispensação ----
    if (role === 'CHEFE_FARMACIA') {
        if (['register', 'update_stock', 'transfer'].includes(action)) return setor === 'FARMACIA';
        return ['farmacia_ver', 'farmacia_dispensar', 'farmacia_gerenciar', 'farmacia_requisicao'].includes(action);
    }

    if (role === 'FUNC_FARMACIA') {
        if (['update_stock', 'transfer'].includes(action)) return setor === 'FARMACIA';
        return ['farmacia_ver', 'farmacia_dispensar', 'farmacia_requisicao'].includes(action);
    }

    if (role === 'TECNICO_ENFERMAGEM') {
        return [
            'mapa_ver', 'prontuario_ver', 'prontuario_evoluir', 'evolucao_enfermagem',
            'sinais_vitais_registrar', 'preparo_exame_checar', 'prescricao_checar',
            'farmacia_retirar', 'pacientes_consultar', 'nir_ver', 'transporte_ver'
        ].includes(action);
    }

    if (role === 'FARMACEUTICO') {
        return [
            'mapa_ver', 'prontuario_ver', 'farmacia_dispensar', 'farmacia_retirar',
            'pacientes_consultar', 'view_history', 'nir_ver', 'transporte_ver', 'transporte_solicitar'
        ].includes(action);
    }

    if (role === 'CHEFE_PORTARIA') {
        if (action === 'manage_portaria_config') return true;
        if (action === 'view_portaria_logs') return true;
        return ['mapa_ver', 'voluntariado_ver', 'voluntariado_presenca'].includes(action);   // Etapa 9: a Portaria registra entrada e saída de voluntários
    }

    if (role === 'FUNC_PORTARIA') {
        if (action === 'register_portaria_access') return true;
        if (action === 'view_portaria_logs') return true;
        return ['mapa_ver', 'voluntariado_ver', 'voluntariado_presenca'].includes(action);
    }

    // ---- Recepção, Emergência e Gestão das Triagens ----
    // O Administrador tem tudo (retorno no início da função). Os demais perfis só recebem o que está listado.
    if (role === 'FUNC_RECEPCAO') {
        return [
            'recepcao_acessar', 'recepcao_editar', 'pacientes_consultar', 'mapa_ver', 'internacao_gerenciar', 'fila_leito', 'painel_chamada',
            'documento_comparecimento', 'agenda_ambulatorial_ver', 'agenda_ambulatorial_gerenciar', 'nir_ver', 'transporte_ver'
        ].includes(action);
    }

    if (role === 'FUNC_EMERGENCIA') {
        // Edita apenas as próprias ocorrências, em até 24 h (regra em canEditOcorrencia)
        // Classificar o risco é do enfermeiro classificador (triagem_classificar: mesma regra de PERFIS_CLASSIFICADORES)
        return ['emergencia_acessar', 'emergencia_registrar', 'emergencia_editar_proprio', 'pacientes_consultar', 'nsp_gerenciar', 'triagem_clinica', 'triagem_classificar', 'painel_chamada'].includes(action);
    }

    if (role === 'COORD_TRIAGEM') {
        return ['triagem_ver'].includes(action);
    }

    // ---- Assistência: leitos, prontuário, exames, autorizações, NIR e Setor de Transporte ----
    if (role === 'MEDICO') {
        // Médico: união (Etapas 8–9, laboratório, evolução médica, alergias/riscos, NIR/transporte)
        return [
            'mapa_ver', 'prontuario_ver', 'prontuario_evoluir', 'prescrever', 'diagnosticar', 'exame_solicitar', 'exame_priorizar', 'pacientes_consultar',
            'autorizacao_ver', 'atendimento_medico', 'painel_chamada', 'documento_emitir', 'documento_comparecimento', 'enfermagem_ver', 'prescrever_cuidados',
            'agenda_ambulatorial_ver', 'cirurgia_ver', 'uti_ver', 'dieta_ver', 'dieta_prescrever', 'hemoterapia_ver', 'hemoterapia_solicitar', 'obito_ver',
            'obito_registrar', 'obito_acompanhar', 'laboratorio_ver', 'laboratorio_solicitar', 'evolucao_medica', 'alergia_gerenciar',
            'risco_assistencial_gerenciar', 'prescricao_checar', 'auditoria_ver', 'interoperabilidade_exportar', 'nir_ver', 'transporte_ver',
            'transporte_solicitar'
        ].includes(action);
    }

    if (role === 'FUNC_IMAGENOLOGIA') {
        return [
            'imagem_gerenciar', 'exame_resultado', 'autorizacao_ver', 'atendimento_exames', 'painel_chamada', 'nir_ver', 'transporte_ver',
            'transporte_solicitar', 'prontuario_ver', 'mapa_ver'
        ].includes(action);
    }

    if (role === 'FUNC_ULTRASSOM') {
        return [
            'ultrassom_gerenciar', 'exame_resultado', 'autorizacao_ver', 'atendimento_exames', 'painel_chamada', 'nir_ver', 'transporte_ver',
            'transporte_solicitar', 'prontuario_ver', 'mapa_ver'
        ].includes(action);
    }

    if (role === 'AUTORIZADOR') {
        return ['autorizacao_gerenciar', 'autorizacao_ver'].includes(action);
    }

    if (role === 'FUNC_HIGIENIZACAO') {
        return ['mapa_ver', 'leito_gerenciar', 'rouparia_ver', 'rouparia_registrar', 'residuos_ver', 'residuos_registrar'].includes(action);   // Etapa 9
    }

    // ---- Nutrição e Hemoterapia (Etapa 8) ----
    if (role === 'FUNC_NUTRICAO') {
        return ['dieta_ver', 'dieta_prescrever', 'dieta_gerenciar', 'pacientes_consultar'].includes(action);
    }

    if (role === 'FUNC_HEMOTERAPIA') {
        return ['hemoterapia_ver', 'hemoterapia_agencia', 'pacientes_consultar'].includes(action);
    }

    // ---- Apoio e infraestrutura (Etapa 9) ----
    // O perfil é um só por área (chefia e equipe não são distinguidas): ver docs/pendencias.md
    if (role === 'FUNC_MANUTENCAO') {
        return ['manutencao_ver_todas', 'manutencao_executar', 'manutencao_gerenciar', 'patrimonio_ver'].includes(action);
    }

    if (role === 'FUNC_TRANSPORTE') {
        return ['transporte_executar', 'transporte_ver_todos'].includes(action);
    }

    if (role === 'FUNC_LAVANDERIA') {
        return ['rouparia_ver', 'rouparia_registrar'].includes(action);
    }

    if (role === 'FUNC_VOLUNTARIADO') {
        return ['voluntariado_ver', 'voluntariado_gerenciar', 'voluntariado_presenca'].includes(action);
    }

    // ---- Gestão (Etapa 10): ouvidoria, qualidade, ensino e pesquisa, direção ----
    // A Direção só consulta: vê indicadores, a qualidade, o ensino e a lista da ouvidoria (sem a identidade de quem se manifestou).
    if (role === 'FUNC_OUVIDORIA') {
        return ['ouvidoria_ver', 'ouvidoria_gerenciar', 'ouvidoria_ver_identidade'].includes(action);
    }

    if (role === 'FUNC_QUALIDADE') {
        return ['qualidade_ver', 'qualidade_gerenciar'].includes(action);
    }

    if (role === 'FUNC_ENSINO') {
        return ['ensino_ver', 'ensino_gerenciar'].includes(action);
    }

    if (role === 'FUNC_LABORATORIO') {
        return ['laboratorio_ver', 'laboratorio_executar'].includes(action);
    }

    if (role === 'DIRETORIA') {
        return ['direcao_ver', 'qualidade_ver', 'ensino_ver', 'ouvidoria_ver', 'config_gerenciar'].includes(action);
    }

    // Setor 1: NIR (Núcleo Interno de Regulação) — organiza a demanda, confere e encaminha a documentação necessária ao Transporte
    if (role === 'FUNC_NIR') {
        return [
            'mapa_ver', 'internacao_gerenciar', 'leito_gerenciar', 'prontuario_ver', 'pacientes_consultar',
            'nir_ver', 'nir_gerenciar', 'transporte_ver', 'transporte_solicitar'
        ].includes(action);
    }

    // Setor 2: Setor de Transporte — recebe a demanda já documentada pelo NIR, designa equipe (maqueiro/motorista) e executa o transporte
    if (role === 'FUNC_TRANSPORTE') {
        return ['mapa_ver', 'nir_ver', 'transporte_ver', 'transporte_gerenciar'].includes(action);
    }

    return false;
}

function getRoleLabel(role) {
    if (typeof PERFIS_PERSONALIZADOS !== 'undefined' && PERFIS_PERSONALIZADOS[role]) return PERFIS_PERSONALIZADOS[role];
    const labels = {
        "ADMIN": "Administrador Geral",
        "CHEFE_OPME": "Chefe OPME",
        "CHEFE_HEMODINAMICA": "Chefe Hemodinâmica",
        "FUNC_HEMODINAMICA": "Funcionário Hemodinâmica",
        "FUNC_OPME": "Funcionário OPME",
        "FUNC_CENTRO_CIRURGICO": "Funcionário Centro Cirúrgico",
        "FUNC_ENFERMAGEM": "Enfermeiro(a) Assistencial",
        "TECNICO_ENFERMAGEM": "Técnico(a) de Enfermagem",
        "FARMACEUTICO": "Farmacêutico(a) Hospitalar",
        "CHEFE_PORTARIA": "Chefe Portaria",
        "FUNC_PORTARIA": "Funcionário Portaria",
        "FUNC_RECEPCAO": "Funcionário Recepção",
        "FUNC_EMERGENCIA": "Funcionário Emergência",
        "COORD_TRIAGEM": "Coordenador de Triagem",
        "MEDICO": "Médico(a)",
        "FUNC_IMAGENOLOGIA": "Funcionário Imagenologia",
        "FUNC_ULTRASSOM": "Funcionário Ultrassonografia",
        "AUTORIZADOR": "Autorizador (Regulação)",
        "FUNC_HIGIENIZACAO": "Funcionário Higienização",
        "CHEFE_FARMACIA": "Chefe Farmácia",
        "FUNC_FARMACIA": "Funcionário Farmácia",
        "FUNC_NUTRICAO": "Funcionário Nutrição",
        "FUNC_HEMOTERAPIA": "Funcionário Hemoterapia",
        "FUNC_MANUTENCAO": "Funcionário Manutenção e Engenharia Clínica",
        "FUNC_NIR": "Regulador do NIR (Regulação e Documentação)",
        "FUNC_TRANSPORTE": "Setor de Transporte (Maqueiros / Frota)",
        "FUNC_LAVANDERIA": "Funcionário Lavanderia e Rouparia",
        "FUNC_VOLUNTARIADO": "Coordenação de Voluntariado",
        "FUNC_OUVIDORIA": "Ouvidoria",
        "FUNC_QUALIDADE": "Qualidade e Segurança do Paciente",
        "FUNC_ENSINO": "Ensino e Pesquisa",
        "FUNC_LABORATORIO": "Funcionário Laboratório",
        "DIRETORIA": "Direção (consulta)"
    };
    return labels[role] || "Colaborador";
}

// ---------- Regras de acesso reutilizáveis (usadas pela árvore do menu em data/menu.js) ----------
// Cada função devolve um teste `() => boolean`, avaliado para o usuário logado.

/** Libera só para os perfis informados. */
const byRole = (...roles) => () => Boolean(state.currentUser) && roles.includes(state.currentUser.role);

/** Libera para todos os perfis, menos os informados. */
const exceptRoles = (...roles) => () => Boolean(state.currentUser) && !roles.includes(state.currentUser.role);

/** Libera conforme hasPermission(action, setor). */
const byPermission = (action, setor = null) => () => hasPermission(action, setor);

/** Libera se qualquer um dos testes liberar. */
const anyOf = (...checks) => () => checks.some(check => check());

/** Perfis que podem ser atribuídos a um usuário (usado nas telas de membros). */
const ASSIGNABLE_ROLES = [
    'ADMIN', 'CHEFE_OPME', 'CHEFE_HEMODINAMICA', 'FUNC_HEMODINAMICA', 'FUNC_OPME', 'FUNC_CENTRO_CIRURGICO',
    'FUNC_ENFERMAGEM', 'TECNICO_ENFERMAGEM', 'FARMACEUTICO', 'CHEFE_PORTARIA', 'FUNC_PORTARIA', 'FUNC_RECEPCAO', 'FUNC_EMERGENCIA', 'COORD_TRIAGEM',
    'MEDICO', 'FUNC_IMAGENOLOGIA', 'FUNC_ULTRASSOM', 'AUTORIZADOR', 'FUNC_HIGIENIZACAO', 'CHEFE_FARMACIA', 'FUNC_FARMACIA', 'FUNC_NUTRICAO', 'FUNC_HEMOTERAPIA',
    'FUNC_MANUTENCAO', 'FUNC_NIR', 'FUNC_TRANSPORTE', 'FUNC_LAVANDERIA', 'FUNC_VOLUNTARIADO', 'FUNC_OUVIDORIA', 'FUNC_QUALIDADE', 'FUNC_ENSINO', 'FUNC_LABORATORIO', 'DIRETORIA'
];

/** Matriz RBAC granular exigida pela norma SBIS/CFM e LGPD para exibição e auditoria. */
const MATRIZ_RBAC_ASSISTENCIAL = [
    { perfil: 'MEDICO', rotulo: 'Médico(a)', escopo: 'Evolução médica, prescrição eletrônica (medicamentos/dietas), diagnóstico CID-10/CID-11, solicitação de exames, alergias e riscos.' },
    { perfil: 'FUNC_ENFERMAGEM', rotulo: 'Enfermeiro(a)', escopo: 'Evolução de enfermagem, sinais vitais, escalas de risco (Morse/Braden), checagem beira-leito de prescrição, preparo de exames e gestão de leitos.' },
    { perfil: 'TECNICO_ENFERMAGEM', rotulo: 'Técnico(a) de Enfermagem', escopo: 'Aferição de sinais vitais, anotação de enfermagem, checagem de administração sob supervisão e retirada rastreada na farmácia.' },
    { perfil: 'FARMACEUTICO', rotulo: 'Farmacêutico(a)', escopo: 'Validação e dispensação farmacêutica por piso/leito, controle de lotes e registro nominal de quem retirou cada medicamento.' },
    { perfil: 'FUNC_IMAGENOLOGIA', rotulo: 'Equipe Imagenologia', escopo: 'Agendamento na sala/equipamento, execução com metadados DICOM/PACS e liberação de laudos assinados.' },
    { perfil: 'FUNC_NIR', rotulo: 'Regulador NIR', escopo: 'Regulação de leitos/viagens, conferência de documentação clínica/APAC e encaminhamento ao Setor de Transporte.' },
    { perfil: 'FUNC_TRANSPORTE', rotulo: 'Setor de Transporte', escopo: 'Designação de maqueiro/motorista/ambulância, início e conclusão de trânsito com registro automático no PEP.' },
    { perfil: 'FUNC_RECEPCAO', rotulo: 'Equipe Administrativa / Recepção', escopo: 'Cadastro único de pacientes (CPF + CNS) e admissão administrativa, sem acesso a evoluções clínicas restritas.' }
];

/** Lança erro se o usuário logado não tiver a permissão (validação nos serviços, não só na tela). */
function requirePermission(action, setor = null) {
    if (!hasPermission(action, setor)) throw new Error('Acesso negado: seu perfil não tem permissão para esta operação.');
}
