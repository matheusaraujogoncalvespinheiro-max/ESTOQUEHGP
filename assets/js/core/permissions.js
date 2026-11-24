// Permissões por perfil

// Etapa 9: quem pode pedir transporte. O transporte de PACIENTE exige um perfil assistencial; o de material, também os setores de apoio.
const PERFIS_TRANSPORTE_PACIENTE = ['MEDICO', 'FUNC_ENFERMAGEM', 'FUNC_RECEPCAO', 'FUNC_EMERGENCIA', 'FUNC_CENTRO_CIRURGICO', 'FUNC_HEMODINAMICA', 'CHEFE_HEMODINAMICA', 'FUNC_IMAGENOLOGIA', 'FUNC_ULTRASSOM'];
const PERFIS_SOLICITAM_TRANSPORTE = [...PERFIS_TRANSPORTE_PACIENTE, 'CHEFE_OPME', 'FUNC_OPME', 'CHEFE_FARMACIA', 'FUNC_FARMACIA', 'FUNC_NUTRICAO', 'FUNC_HEMOTERAPIA'];

function hasPermission(action, setor = null) {
    if (!state.currentUser) return false;

    const role = state.currentUser.role;

    // O administrador tem acesso a todas as telas e operações.
    if (role === 'ADMIN') return true;

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
        return false;
    }

    if (role === 'CHEFE_HEMODINAMICA') {
        if (action === 'register') return false;
        if (action === 'update_stock') return false;
        if (action === 'transfer') return true;
        if (action === 'view_history') return true;
        if (action === 'view_patients') return true;
        if (action === 'create_laudo' && setor === 'HEMODINAMICA') return true;
        if (action === 'view_laudos') return true;
        return ['atendimento_procedimentos', 'painel_chamada', 'patrimonio_ver'].includes(action);
    }

    if (role === 'FUNC_HEMODINAMICA') {
        if (action === 'update_stock' && (setor === 'HEMODINAMICA' || setor === null)) return true;
        if (action === 'transfer' && (setor === 'HEMODINAMICA' || setor === 'OPME')) return true;
        if (action === 'view_history') return true;
        if (action === 'create_laudo' && setor === 'HEMODINAMICA') return true;
        if (action === 'view_laudos') return true;
        return ['atendimento_procedimentos', 'painel_chamada'].includes(action);
    }

    if (role === 'FUNC_OPME') {
        if (action === 'update_stock' && setor === 'OPME') return true;
        if (action === 'transfer' && (setor === 'OPME' || setor === null)) return true;
        if (action === 'view_history') return true;
        if (action === 'create_laudo' && setor === 'OPME') return true;
        if (action === 'view_laudos') return true;
        return false;
    }

    if (role === 'FUNC_CENTRO_CIRURGICO') {
        if (action === 'update_stock' && setor === 'CENTRO_CIRURGICO') return true;
        if (action === 'transfer' && setor === 'CENTRO_CIRURGICO') return true;
        if (action === 'view_history') return true;
        if (action === 'create_laudo' && setor === 'CENTRO_CIRURGICO') return true;
        if (action === 'view_laudos') return true;
        if (action === 'manage_salas') return true;
        // Etapa 8: cirurgias (agenda, equipe, checklist, tempos e RPA) e fila de procedimentos
        return ['cirurgia_ver', 'cirurgia_gerenciar', 'cirurgia_registrar', 'atendimento_procedimentos', 'painel_chamada'].includes(action);
    }

    if (role === 'FUNC_ENFERMAGEM') {
        if (action === 'register_patient') return true;
        if (action === 'view_patients') return true;
        if (action === 'manage_patient_status') return true; // NEW: Allow nurse to manage status
        if (action === 'transfer') return false;
        if (action === 'view_history') return false;
        if (action === 'view_notifications') return false;
        if (action === 'create_laudo') return false;
        if (action === 'view_laudos') return false;
        // Enfermagem (Etapa 6): o perfil é um só (enfermeiro e técnico não são distinguidos): ver docs/pendencias.md
        return ['mapa_ver', 'internacao_gerenciar', 'leito_gerenciar', 'fila_leito', 'prontuario_ver', 'prontuario_evoluir', 'pacientes_consultar', 'triagem_clinica', 'painel_chamada', 'enfermagem_ver', 'enfermagem_registrar', 'prescrever_cuidados', 'farmacia_requisicao',
            // Etapa 8: agenda ambulatorial (consulta), fila de procedimentos, cirurgia (checklist e RPA), UTI, dieta e transfusão
            'agenda_ambulatorial_ver', 'atendimento_procedimentos', 'cirurgia_ver', 'cirurgia_registrar', 'uti_ver', 'uti_registrar', 'dieta_ver', 'hemoterapia_ver', 'hemoterapia_transfundir',
            // Etapa 9: óbito (comunicação à família e liberação do corpo; a constatação é do médico)
            'obito_ver', 'obito_acompanhar'].includes(action);
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
        return ['recepcao_acessar', 'recepcao_editar', 'pacientes_consultar', 'mapa_ver', 'internacao_gerenciar', 'fila_leito', 'painel_chamada', 'documento_comparecimento', 'agenda_ambulatorial_ver', 'agenda_ambulatorial_gerenciar'].includes(action);
    }

    if (role === 'FUNC_EMERGENCIA') {
        // Edita apenas as próprias ocorrências, em até 24 h (regra em canEditOcorrencia)
        // Classificar o risco é do enfermeiro classificador (triagem_classificar: mesma regra de PERFIS_CLASSIFICADORES)
        return ['emergencia_acessar', 'emergencia_registrar', 'emergencia_editar_proprio', 'pacientes_consultar', 'nsp_gerenciar', 'triagem_clinica', 'triagem_classificar', 'painel_chamada'].includes(action);
    }

    if (role === 'COORD_TRIAGEM') {
        return ['triagem_ver'].includes(action);
    }

    // ---- Assistência: leitos, prontuário, exames e autorizações ----
    if (role === 'MEDICO') {
        return ['mapa_ver', 'prontuario_ver', 'prontuario_evoluir', 'prescrever', 'diagnosticar', 'exame_solicitar', 'exame_priorizar', 'pacientes_consultar', 'autorizacao_ver', 'atendimento_medico', 'painel_chamada', 'documento_emitir', 'documento_comparecimento', 'enfermagem_ver', 'prescrever_cuidados',
            'agenda_ambulatorial_ver', 'cirurgia_ver', 'uti_ver', 'dieta_ver', 'dieta_prescrever', 'hemoterapia_ver', 'hemoterapia_solicitar',
            // Etapa 9: óbito (o médico constata e registra; informa o nº da Declaração de Óbito)
            'obito_ver', 'obito_registrar', 'obito_acompanhar'].includes(action);
    }

    if (role === 'FUNC_IMAGENOLOGIA') {
        return ['imagem_gerenciar', 'exame_resultado', 'autorizacao_ver', 'atendimento_exames', 'painel_chamada'].includes(action);
    }

    if (role === 'FUNC_ULTRASSOM') {
        return ['ultrassom_gerenciar', 'exame_resultado', 'autorizacao_ver', 'atendimento_exames', 'painel_chamada'].includes(action);
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

    if (role === 'DIRETORIA') {
        return ['direcao_ver', 'qualidade_ver', 'ensino_ver', 'ouvidoria_ver'].includes(action);
    }

    return false;
}

function getRoleLabel(role) {
    const labels = {
        "ADMIN": "Administrador Geral",
        "CHEFE_OPME": "Chefe OPME",
        "CHEFE_HEMODINAMICA": "Chefe Hemodinâmica",
        "FUNC_HEMODINAMICA": "Funcionário Hemodinâmica",
        "FUNC_OPME": "Funcionário OPME",
        "FUNC_CENTRO_CIRURGICO": "Funcionário Centro Cirúrgico",
        "FUNC_ENFERMAGEM": "Funcionário Enfermagem",
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
        "FUNC_TRANSPORTE": "Funcionário Transporte",
        "FUNC_LAVANDERIA": "Funcionário Lavanderia e Rouparia",
        "FUNC_VOLUNTARIADO": "Coordenação de Voluntariado",
        "FUNC_OUVIDORIA": "Ouvidoria",
        "FUNC_QUALIDADE": "Qualidade e Segurança do Paciente",
        "FUNC_ENSINO": "Ensino e Pesquisa",
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
    'FUNC_ENFERMAGEM', 'CHEFE_PORTARIA', 'FUNC_PORTARIA', 'FUNC_RECEPCAO', 'FUNC_EMERGENCIA', 'COORD_TRIAGEM',
    'MEDICO', 'FUNC_IMAGENOLOGIA', 'FUNC_ULTRASSOM', 'AUTORIZADOR', 'FUNC_HIGIENIZACAO', 'CHEFE_FARMACIA', 'FUNC_FARMACIA', 'FUNC_NUTRICAO', 'FUNC_HEMOTERAPIA',
    'FUNC_MANUTENCAO', 'FUNC_TRANSPORTE', 'FUNC_LAVANDERIA', 'FUNC_VOLUNTARIADO', 'FUNC_OUVIDORIA', 'FUNC_QUALIDADE', 'FUNC_ENSINO', 'DIRETORIA'
];

/** Lança erro se o usuário logado não tiver a permissão (validação nos serviços, não só na tela). */
function requirePermission(action, setor = null) {
    if (!hasPermission(action, setor)) throw new Error('Acesso negado: seu perfil não tem permissão para esta operação.');
}
