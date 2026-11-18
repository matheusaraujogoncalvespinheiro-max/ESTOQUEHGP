// Regras de notificações: criação, estoque baixo e contagem

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
