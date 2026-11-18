// Permissões por perfil

function hasPermission(action, setor = null) {
    if (!state.currentUser) return false;

    const role = state.currentUser.role;

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
        return false;
    }

    if (role === 'FUNC_HEMODINAMICA') {
        if (action === 'update_stock' && (setor === 'HEMODINAMICA' || setor === null)) return true;
        if (action === 'transfer' && (setor === 'HEMODINAMICA' || setor === 'OPME')) return true;
        if (action === 'view_history') return true;
        if (action === 'create_laudo' && setor === 'HEMODINAMICA') return true;
        if (action === 'view_laudos') return true;
        return false;
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
        return false;
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
        return false;
    }

    if (role === 'CHEFE_PORTARIA') {
        if (action === 'manage_portaria_config') return true;
        if (action === 'view_portaria_logs') return true;
        return false;
    }

    if (role === 'FUNC_PORTARIA') {
        if (action === 'register_portaria_access') return true;
        if (action === 'view_portaria_logs') return true;
        return false;
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
        "FUNC_PORTARIA": "Funcionário Portaria"
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
