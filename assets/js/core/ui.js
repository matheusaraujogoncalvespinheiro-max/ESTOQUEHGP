// Mensagens, títulos e filtros de interface

function showMsg(text, type = 'success') {
    state.msg = { text, type };

    // Tenta atualizar diretamente o container de mensagens
    const container = document.getElementById('global-toast-container');
    if (container) {
        container.innerHTML = `
            <div class="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-2xl shadow-xl flex items-center gap-3 slide-in ${type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'} font-bold pointer-events-auto">
                <i data-lucide="${type === 'error' ? 'x-circle' : 'check-circle'}"></i>
                ${text}
            </div>
        `;
        lucide.createIcons();
    } else {
        render();
    }

    setTimeout(() => {
        state.msg = { text: '', type: '' };
        const containerCheck = document.getElementById('global-toast-container');
        if (containerCheck) {
            containerCheck.innerHTML = '';
        } else {
            render();
        }
    }, 3000);
}

function getModuleTitle() {
    if (state.activeModule === 'RELATORIOS') return 'Relatórios';
    if (state.activeModule === 'CAD') { const d = state.cad && CAD_DEFS[state.cad.key]; return d ? `Cadastro de ${d.label}` : 'Cadastro'; }
    const titles = {
        'DASHBOARD': 'Dashboard Principal',
        'OPME': 'Estoque OPME',
        'HEMODINAMICA': 'Estoque Hemodinâmica',
        'CENTRO_CIRURGICO': 'Estoque Centro Cirúrgico',
        'SALAS': 'Salas de Procedimento',
        'HISTORICO_SALAS': 'Histórico de Salas',
        'ENFERMAGEM': 'Registro de Pacientes',
        'PACIENTES_REGISTRADOS': 'Pacientes Registrados',
        'REGISTER': 'Cadastro de Produtos',
        'ADD_EXISTING': 'Adicionar Produtos Existentes',
        'TRANSFER': 'Transferência de Materiais',
        'HISTORY': 'Histórico de Transferências',
        'MEMBERS': 'Gerenciamento de Membros',
        'BACKUP': 'Backup e Restauração',
        'NOTIFICATIONS': 'Notificações',
        'LAUDO': 'Criar Laudo',
        'HISTORICO_LAUDOS': 'Histórico de Laudos',
        'MAPA': 'Mapa',
        'DISCHARGE': 'Dar Alta ao Paciente',
        'STATUS_PACIENTES': 'Status dos Pacientes',
        'HISTORICO_ALTAS': 'Histórico de Altas',
        'TRANSFER_CONFIRMATION': 'Confirmação de Transferência',
        'APPROVE_TRANSFER': 'Aprovar Envio de Transferência',
        'RECEIVE_TRANSFER': 'Receber Transferência',
        'MY_REQUESTS': 'Minhas Solicitações',
        'REQUEST': 'Solicitar Material',
        'PROCEDIMENTOS_NAO_REALIZADOS': 'Procedimentos Não Realizados',
        'PROCEDIMENTOS': 'Agendar Procedimentos',
        'CORRECAO': 'Correção de Estoque OPME',
        'PORTARIA_PAINEL': 'Portaria - Controle de Acesso',
        'PORTARIA_CONFIG': 'Portaria - Configurações',
        'RECEPCAO': 'Recepção',
        'EMERGENCIA': 'Emergência',
        'TRIAGEM': 'Gestão das Triagens',
        'TRIAGEM_GESTAO': 'Gerenciar Equipes de Triagem',
        'MAPA_LEITOS': 'Mapa de Ocupação Hospitalar',
        'INTERNACOES': 'Internações',
        'PRONTUARIO': 'Prontuário Eletrônico',
        'IMAGEM': 'Central de Imagenologia',
        'ULTRASSOM': 'Ultrassonografia',
        'AUTORIZACOES': 'Controle de Autorizações'
    };
    return titles[state.activeModule] || 'Módulo Desconhecido';
}

function changePage(delta) {
    state.currentPage += delta;
    render();
}

function filterData(data) {
    if (!state.searchTerm) return data;

    const term = state.searchTerm.toLowerCase();
    return data.filter(item =>
        item.material.toLowerCase().includes(term) ||
        item.barcode.includes(term) ||
        item.descricao.toLowerCase().includes(term) ||
        (item.marca && item.marca.toLowerCase().includes(term)) ||
        (item.empresa && item.empresa.toLowerCase().includes(term))
    );
}

window.changePage = changePage;
