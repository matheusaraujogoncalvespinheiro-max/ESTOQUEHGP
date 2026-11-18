// Notificações

function addNotification(type, message, barcode = null) {
    const notification = {
        id: Date.now(),
        type: type,
        message: message,
        barcode: barcode,
        date: new Date().toISOString(),
        read: false
    };

    NOTIFICATIONS.unshift(notification);
    saveToLocalStorage();
    if (typeof db_saveNotification === 'function') db_saveNotification(notification);

    if (state.isAuthenticated && state.currentUser.role !== 'FUNC_ENFERMAGEM' && state.currentUser.role !== 'CHEFE_HEMODINAMICA') {
        updateNotificationBadge();
    }
}

function checkLowStockNotifications() {
    if (state.currentUser && (state.currentUser.role === 'FUNC_ENFERMAGEM' || state.currentUser.role === 'CHEFE_HEMODINAMICA')) {
        return;
    }

    const allItems = [...MOCK_DATA.OPME, ...MOCK_DATA.HEMODINAMICA, ...MOCK_DATA.OPME];
    const lowStockItems = allItems.filter(item => item.qtd <= item.min);

    lowStockItems.forEach(item => {
        const exists = NOTIFICATIONS.find(n =>
            n.barcode === item.barcode &&
            n.type === 'low_stock' &&
            !n.read
        );

        if (!exists) {
            addNotification(
                'low_stock',
                `Estoque baixo: ${item.material} (${item.qtd}/${item.min})`,
                item.barcode
            );
        }
    });
}

function markNotificationAsRead(id) {
    const notification = NOTIFICATIONS.find(n => n.id === id);
    if (notification) {
        notification.read = true;
        saveToLocalStorage();
        updateNotificationBadge();
    }
}

function markAllNotificationsAsRead() {
    NOTIFICATIONS.forEach(n => n.read = true);
    saveToLocalStorage();
    updateNotificationBadge();
    render();
}

function getUnreadNotificationsCount() {
    if (state.currentUser && (state.currentUser.role === 'FUNC_ENFERMAGEM' || state.currentUser.role === 'CHEFE_HEMODINAMICA')) {
        return 0;
    }
    return NOTIFICATIONS.filter(n => !n.read).length;
}

function updateNotificationBadge() {
    if (state.currentUser && (state.currentUser.role === 'FUNC_ENFERMAGEM' || state.currentUser.role === 'CHEFE_HEMODINAMICA')) {
        const badge = document.getElementById('notification-badge');
        if (badge) {
            badge.classList.add('hidden');
        }
        return;
    }

    const badge = document.getElementById('notification-badge');
    if (badge) {
        const count = getUnreadNotificationsCount();
        badge.textContent = count > 0 ? count : '';
        badge.classList.toggle('hidden', count === 0);
    }
}

function renderNotifications() {
    const unreadCount = getUnreadNotificationsCount();
    const role = state.currentUser.role;

    if (role === 'FUNC_ENFERMAGEM' || role === 'CHEFE_HEMODINAMICA') {
        return `
    <div class="max-w-3xl mx-auto" >
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
            <i data-lucide="bell-off" class="w-16 h-16 text-slate-300 mx-auto mb-6"></i>
            <h3 class="text-2xl font-bold text-slate-900 mb-4">Sem Notificações</h3>
            <p class="text-slate-600 mb-6">${role === 'FUNC_ENFERMAGEM' ? 'Funcionários de enfermagem' : 'Chefes de Hemodinâmica'} não recebem notificações de estoque.</p>
            <p class="text-slate-500 text-sm">As notificações estão disponíveis apenas para o pessoal do almoxarifado.</p>
        </div>
        </div> `;
    }

    return `
    <div class="space-y-6" >
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-2xl font-bold text-slate-900">Notificações</h2>
                ${unreadCount > 0 ? `
                <button onclick="markAllNotificationsAsRead()" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-colors">
                    Marcar todas como lidas
                </button>
                ` : ''}
            </div>

            ${NOTIFICATIONS.length === 0 ? `
            <div class="bg-slate-50 rounded-2xl p-12 text-center">
                <i data-lucide="bell-off" class="w-12 h-12 text-slate-300 mx-auto mb-4"></i>
                <h3 class="text-lg font-bold text-slate-500 mb-2">Nenhuma notificação</h3>
                <p class="text-slate-400">Todas as notificações aparecerão aqui</p>
            </div>
            ` : `
            <div class="space-y-4">
                ${NOTIFICATIONS.map(notification => `
                <div class="p-4 rounded-xl border ${notification.read ? 'bg-slate-50 border-slate-200' : 'bg-blue-50 border-blue-200'}">
                    <div class="flex justify-between items-start">
                        <div class="flex items-start gap-3">
                            <div class="w-8 h-8 rounded-full ${notification.type === 'low_stock' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'} flex items-center justify-center">
                                <i data-lucide="${notification.type === 'low_stock' ? 'alert-triangle' : 'info'}" class="w-4 h-4"></i>
                            </div>
                            <div>
                                <p class="font-medium">${notification.message}</p>
                                <p class="text-sm text-slate-500 mt-1">
                                    ${new Date(notification.date).toLocaleDateString('pt-PT')} às 
                                    ${new Date(notification.date).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                                </p>
                            </div>
                        </div>
                        ${!notification.read ? `
                        <button onclick="markNotificationAsRead(${notification.id})" class="text-blue-600 hover:text-blue-800">
                            <i data-lucide="check" class="w-4 h-4"></i>
                        </button>
                        ` : ''}
                    </div>
                </div>
                `).join('')}
            </div>
            `}
        </div>
    </div> `;
}

window.markNotificationAsRead = markNotificationAsRead;

window.markAllNotificationsAsRead = markAllNotificationsAsRead;
