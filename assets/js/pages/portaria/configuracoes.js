// Portaria: horários e configurações

function renderPortariaConfig() {
    const config = MOCK_DATA.PORTARIA_CONFIG || {
        visiting_hours_start: '14:00',
        visiting_hours_end: '16:00',
        entry_hours_start: '07:00',
        entry_hours_end: '22:00'
    };

    const today = new Date().toISOString().split('T')[0];
    const todayVisits = (MOCK_DATA.PORTARIA_VISITS || []).filter(v => v.hora_entrada.startsWith(today));
    const activeVisitsCount = todayVisits.filter(v => v.status === 'DENTRO').length;
    const totalVisitsCount = todayVisits.length;

    return `
    <div class="space-y-6 fade-in">
        <div class="flex justify-between items-center bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div>
                <h1 class="text-2xl font-bold text-slate-900">Configurações da Portaria</h1>
                <p class="text-slate-500 text-sm">Defina os horários permitidos de visitas e entrada de acompanhantes.</p>
            </div>
            <div class="flex gap-4">
                <div class="p-4 bg-emerald-50 text-emerald-700 rounded-xl text-center border border-emerald-100">
                    <div class="text-2xl font-bold text-emerald-800">${activeVisitsCount}</div>
                    <div class="text-xs font-semibold text-emerald-600">Ativos Agora</div>
                </div>
                <div class="p-4 bg-blue-50 text-blue-700 rounded-xl text-center border border-blue-100">
                    <div class="text-2xl font-bold text-blue-800">${totalVisitsCount}</div>
                    <div class="text-xs font-semibold text-blue-600">Total Hoje</div>
                </div>
            </div>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <form id="portaria-config-form" onsubmit="handleSavePortariaConfig(event)" class="space-y-6">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div class="p-6 bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
                        <div class="flex items-center gap-3 text-indigo-700 font-bold">
                            <i data-lucide="users" class="w-5 h-5 text-indigo-600"></i>
                            <span>Horário de Visitas</span>
                        </div>
                        <p class="text-xs text-slate-500">Janela de horário em que visitas sociais são permitidas no hospital.</p>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-xs font-semibold text-slate-600 mb-1">Início</label>
                                <input type="time" name="visiting_hours_start" value="${config.visiting_hours_start}" required class="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
                            </div>
                            <div>
                                <label class="block text-xs font-semibold text-slate-600 mb-1">Fim</label>
                                <input type="time" name="visiting_hours_end" value="${config.visiting_hours_end}" required class="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
                            </div>
                        </div>
                    </div>

                    <div class="p-6 bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
                        <div class="flex items-center gap-3 text-cyan-700 font-bold">
                            <i data-lucide="log-in" class="w-5 h-5 text-cyan-600"></i>
                            <span>Horário Geral de Entrada</span>
                        </div>
                        <p class="text-xs text-slate-500">Horário máximo permitido para entrada de acompanhantes e fornecedores.</p>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-xs font-semibold text-slate-600 mb-1">Início</label>
                                <input type="time" name="entry_hours_start" value="${config.entry_hours_start}" required class="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
                            </div>
                            <div>
                                <label class="block text-xs font-semibold text-slate-600 mb-1">Fim</label>
                                <input type="time" name="entry_hours_end" value="${config.entry_hours_end}" required class="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
                            </div>
                        </div>
                    </div>
                </div>

                <div class="pt-4 flex justify-end">
                    <button type="submit" class="px-6 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg transition-all active:scale-95 flex items-center gap-2">
                        <i data-lucide="save" class="w-5 h-5"></i>
                        Salvar Configurações
                    </button>
                </div>
            </form>
        </div>
    </div>
    `;
}

function handleSavePortariaConfig(event) {
    event.preventDefault();
    const form = event.target;
    const config = {
        visiting_hours_start: form.visiting_hours_start.value,
        visiting_hours_end: form.visiting_hours_end.value,
        entry_hours_start: form.entry_hours_start.value,
        entry_hours_end: form.entry_hours_end.value
    };

    MOCK_DATA.PORTARIA_CONFIG = config;
    if (typeof db_savePortariaConfig === 'function') {
        db_savePortariaConfig(config);
    }
    showMsg("Configurações salvas com sucesso!");
    render();
}

// Expor funções usadas em atributos onclick/oninput do HTML
// Expose variables and functions to window
window.renderPortariaConfig = renderPortariaConfig;
window.handleSavePortariaConfig = handleSavePortariaConfig;
