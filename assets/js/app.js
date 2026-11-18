// Inicialização da aplicação (executa por último)

// Carregar dados salvos
loadFromLocalStorage();

// Verificar notificações de estoque baixo
setTimeout(() => {
    if (state.currentUser && state.currentUser.role !== 'FUNC_ENFERMAGEM' && state.currentUser.role !== 'CHEFE_HEMODINAMICA') {
        checkLowStockNotifications();
    }
}, 1000);

// Recarregar a página não desconecta: restaura a sessão guardada (se houver)
initSession();

// Inicializar renderização
render();
