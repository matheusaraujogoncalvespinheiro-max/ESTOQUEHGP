// Permissões por perfil

function hasPermission(action, setor = null) {
    if (!state.currentUser) return false;

    const role = state.currentUser.role;

    // O administrador tem acesso a todas as telas e operações.
    if (role === 'ADMIN') return true;

    if (role === 'CHEFE_OPME') {
        if (action === 'register' && (setor === 'OPME' || setor === 'HEMODINAMICA' || setor === 'CENTRO_CIRURGICO')) return true;
        if (action === 'update_stock' && (setor === 'OPME' || setor === 'HEMODINAMICA' || setor === 'CENTRO_CIRURGICO')) return true;
        if (action === 'transfer') return true;
        if (action === 'view_history') return true;
        if (action === 'register_patient') return false;
        if (action === 'view_patients') return false;
        if (action === 'view_laudos') return true;
        if (action === 'manage_members') return true;
        return ['transporte_ver', 'transporte_solicitar'].includes(action);
    }

    if (role === 'CHEFE_HEMODINAMICA') {
        if (action === 'register') return false;
        if (action === 'update_stock') return false;
        if (action === 'transfer') return true;
        if (action === 'view_history') return true;
        if (action === 'view_patients') return true;
        if (action === 'create_laudo' && setor === 'HEMODINAMICA') return true;
        if (action === 'view_laudos') return true;
        return ['transporte_ver', 'transporte_solicitar'].includes(action);
    }

    if (role === 'FUNC_HEMODINAMICA') {
        if (action === 'update_stock' && (setor === 'HEMODINAMICA' || setor === null)) return true;
        if (action === 'transfer' && (setor === 'HEMODINAMICA' || setor === 'OPME')) return true;
        if (action === 'view_history') return true;
        if (action === 'create_laudo' && setor === 'HEMODINAMICA') return true;
        if (action === 'view_laudos') return true;
        return ['transporte_ver'].includes(action);
    }

    if (role === 'FUNC_OPME') {
        if (action === 'update_stock' && setor === 'OPME') return true;
        if (action === 'transfer' && (setor === 'OPME' || setor === null)) return true;
        if (action === 'view_history') return true;
        if (action === 'create_laudo' && setor === 'OPME') return true;
        if (action === 'view_laudos') return true;
        return ['transporte_ver'].includes(action);
    }

    if (role === 'FUNC_CENTRO_CIRURGICO') {
        if (action === 'update_stock' && setor === 'CENTRO_CIRURGICO') return true;
        if (action === 'transfer' && setor === 'CENTRO_CIRURGICO') return true;
        if (action === 'view_history') return true;
        if (action === 'create_laudo' && setor === 'CENTRO_CIRURGICO') return true;
        if (action === 'view_laudos') return true;
        if (action === 'manage_salas') return true;
        return ['transporte_ver'].includes(action);
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
        return [
            'mapa_ver', 'internacao_gerenciar', 'leito_gerenciar', 'prontuario_ver', 'prontuario_evoluir',
            'evolucao_enfermagem', 'sinais_vitais_registrar', 'preparo_exame_checar', 'alergia_gerenciar',
            'pacientes_consultar', 'transporte_ver', 'transporte_solicitar'
        ].includes(action);
    }

    if (role === 'CHEFE_PORTARIA') {
        if (action === 'manage_portaria_config') return true;
        if (action === 'view_portaria_logs') return true;
        return action === 'mapa_ver';
    }

    if (role === 'FUNC_PORTARIA') {
        if (action === 'register_portaria_access') return true;
        if (action === 'view_portaria_logs') return true;
        return action === 'mapa_ver';
    }

    // ---- Recepção, Emergência e Gestão das Triagens ----
    // O Administrador tem tudo (retorno no início da função). Os demais perfis só recebem o que está listado.
    if (role === 'FUNC_RECEPCAO') {
        return ['recepcao_acessar', 'recepcao_editar', 'pacientes_consultar', 'mapa_ver', 'internacao_gerenciar', 'transporte_ver'].includes(action);
    }

    if (role === 'FUNC_EMERGENCIA') {
        // Edita apenas as próprias ocorrências, em até 24 h (regra em canEditOcorrencia)
        return ['emergencia_acessar', 'emergencia_registrar', 'emergencia_editar_proprio', 'pacientes_consultar', 'nsp_gerenciar'].includes(action);
    }

    if (role === 'COORD_TRIAGEM') {
        return ['triagem_ver'].includes(action);
    }

    // ---- Assistência: leitos, prontuário, exames, autorizações e transporte NIR ----
    if (role === 'MEDICO') {
        return [
            'mapa_ver', 'prontuario_ver', 'prontuario_evoluir', 'evolucao_medica', 'prescrever', 'diagnosticar',
            'alergia_gerenciar', 'exame_solicitar', 'exame_priorizar', 'pacientes_consultar', 'autorizacao_ver',
            'transporte_ver', 'transporte_solicitar'
        ].includes(action);
    }

    if (role === 'FUNC_IMAGENOLOGIA') {
        return ['imagem_gerenciar', 'exame_resultado', 'autorizacao_ver', 'transporte_ver', 'transporte_solicitar', 'prontuario_ver', 'mapa_ver'].includes(action);
    }

    if (role === 'FUNC_ULTRASSOM') {
        return ['ultrassom_gerenciar', 'exame_resultado', 'autorizacao_ver', 'transporte_ver', 'transporte_solicitar', 'prontuario_ver', 'mapa_ver'].includes(action);
    }

    if (role === 'AUTORIZADOR') {
        return ['autorizacao_gerenciar', 'autorizacao_ver'].includes(action);
    }

    if (role === 'FUNC_HIGIENIZACAO') {
        return ['mapa_ver', 'leito_gerenciar'].includes(action);
    }

    if (role === 'FUNC_NIR') {
        return ['mapa_ver', 'internacao_gerenciar', 'leito_gerenciar', 'prontuario_ver', 'pacientes_consultar', 'transporte_ver', 'transporte_solicitar', 'transporte_gerenciar'].includes(action);
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
        "FUNC_NIR": "Regulador / Transporte (NIR)"
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
    'MEDICO', 'FUNC_IMAGENOLOGIA', 'FUNC_ULTRASSOM', 'AUTORIZADOR', 'FUNC_HIGIENIZACAO', 'FUNC_NIR'
];

/** Lança erro se o usuário logado não tiver a permissão (validação nos serviços, não só na tela). */
function requirePermission(action, setor = null) {
    if (!hasPermission(action, setor)) throw new Error('Acesso negado: seu perfil não tem permissão para esta operação.');
}
