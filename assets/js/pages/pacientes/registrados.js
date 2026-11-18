// Pacientes: lista de pacientes registrados

function filterPacientes(data) {
    if (!state.searchTerm) return data;

    const term = state.searchTerm.toLowerCase();
    return data.filter(paciente =>
        paciente.nome.toLowerCase().includes(term) ||
        paciente.cartao_sus.includes(term) ||
        paciente.leito.toLowerCase().includes(term) ||
        (paciente.exame_realizado && paciente.exame_realizado.toLowerCase().includes(term))
    );
}

function renderPacientesRegistrados() {
    // Redirecionar para o módulo de status que é mais completo (Internados + Altas)
    return renderStatusPacientes();
}
