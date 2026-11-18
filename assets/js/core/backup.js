// Exportação e importação de backup

// Exportar dados
function exportData() {
    const data = {
        mockData: MOCK_DATA,
        transferHistory: TRANSFER_HISTORY,
        users: USERS_DB,
        notifications: NOTIFICATIONS,
        exportDate: new Date().toISOString(),
        version: '1.0'
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hgp-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showMsg('Dados exportados com sucesso!');
}

// Importar dados
function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = JSON.parse(e.target.result);

            if (!confirm('Esta ação substituirá todos os dados atuais. Deseja continuar?')) {
                return;
            }

            if (data.mockData) MOCK_DATA = data.mockData;
            if (data.transferHistory) TRANSFER_HISTORY = data.transferHistory;
            if (data.users) Object.assign(USERS_DB, data.users);
            if (data.notifications) NOTIFICATIONS = data.notifications;

            saveToLocalStorage();
            render();
            showMsg('Dados importados com sucesso!');

            // Resetar input de arquivo
            event.target.value = '';
        } catch (error) {
            showMsg('Erro ao importar dados: formato inválido', 'error');
        }
    };
    reader.readAsText(file);
}

window.exportData = exportData;

window.importData = importData;
