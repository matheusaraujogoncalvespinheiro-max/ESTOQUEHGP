// Mapa de agendamentos de hemodinâmica

function renderMapa() {
    const today = new Date().toISOString().split('T')[0];
    const maxDate = new Date();
    maxDate.setFullYear(maxDate.getFullYear() + 2);
    const maxDateStr = maxDate.toISOString().split('T')[0];

    const schedule = (MOCK_DATA.MAPA_SCHEDULE || []).sort((a, b) => {
        const dateA = new Date(a.date + 'T' + a.time);
        const dateB = new Date(b.date + 'T' + b.time);
        return dateA - dateB;
    });

    // Filter based on search term (stored in state or global variable)
    const searchTerm = (window.mapSearchTerm || '').toLowerCase();

    // Group by Date for display
    const groupedSchedule = {};
    schedule.forEach(item => {
        // Filter logic
        if (searchTerm) {
            const matchName = item.patientName.toLowerCase().includes(searchTerm);
            const matchSus = (item.cartaoSus || '').includes(searchTerm);
            const matchDate = new Date(item.date).toLocaleDateString('pt-PT').includes(searchTerm);
            if (!matchName && !matchSus && !matchDate) return;
        }

        if (!groupedSchedule[item.date]) groupedSchedule[item.date] = [];
        groupedSchedule[item.date].push(item);
    });

    const sortedDates = Object.keys(groupedSchedule).sort();

    return `
        <div class="max-w-6xl mx-auto space-y-6">
            <div class="flex flex-col md:flex-row justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200 gap-4">
                <div>
                    <h2 class="text-xl font-bold text-slate-800">Mapa de Agendamentos</h2>
                    <p class="text-sm text-slate-500">Agendamentos da OPME</p>
                </div>
                
                <div class="flex items-center gap-4 w-full md:w-auto">
                    <div class="relative flex-1 md:w-64">
                         <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"></i>
                         <input 
                            type="text" 
                            placeholder="Buscar por nome, data ou SUS..." 
                            value="${window.mapSearchTerm || ''}"
                            oninput="handleMapSearch(this.value)"
                            class="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                        >
                    </div>
                
                    <button onclick="generateMapaPDF()" class="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-xl transition-all whitespace-nowrap">
                        <i data-lucide="printer" class="w-4 h-4"></i>
                        Imprimir Tudo
                    </button>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <!-- Form Card -->
                ${state.currentUser.role !== 'FUNC_ENFERMAGEM' ? `
                <div class="lg:col-span-1">
                    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sticky top-6">
                        <h3 class="font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <i data-lucide="plus-circle" class="w-5 h-5 text-blue-600"></i>
                            Novo Agendamento
                        </h3>
                        <form onsubmit="handleCreateSchedule(event)" class="space-y-4">
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Data</label>
                                <input type="date" name="date" required min="${today}" max="${maxDateStr}" class="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Horário</label>
                                <input type="time" name="time" required class="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Paciente</label>
                                <input type="text" name="patientName" required placeholder="Nome completo" class="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none">
                            </div>
                             <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Cartão SUS</label>
                                <input type="text" name="cartaoSus" required maxlength="15" minlength="15" pattern="\\d{15}" title="O Cartão SUS deve ter exatamente 15 dígitos" placeholder="Número do cartão (15 dígitos)" class="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Origem</label>
                                <input type="text" name="origin" required placeholder="Ex: UTI, PS, Enfermaria" class="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none">
                            </div>
                            <div class="flex items-center gap-2">
                                <input type="checkbox" id="isPediatric" name="isPediatric" class="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 border-gray-300">
                                    <label for="isPediatric" class="text-sm font-medium text-slate-700">Paciente Pediátrico</label>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Procedimento</label>
                                <input type="text" name="procedure" required placeholder="Ex: Angioplastia" class="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Médico Responsável</label>
                                <input type="text" name="doctor" required placeholder="Dr. Nome" class="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none">
                            </div>
                            <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-500/30">
                                Agendar
                            </button>
                        </form>
                    </div>
                </div>
                ` : ''}

                <!-- List Card -->
                <div class="lg:col-span-${state.currentUser.role !== 'FUNC_ENFERMAGEM' ? '2' : '3'} space-y-6">
                    ${sortedDates.length === 0 ? `
                    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
                        <div class="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <i data-lucide="calendar-x" class="w-8 h-8 text-slate-400"></i>
                        </div>
                        <h3 class="font-bold text-slate-700">Sem agendamentos</h3>
                        <p class="text-slate-500 text-sm">Utilize o formulário para adicionar.</p>
                    </div>
                    ` : sortedDates.map(date => `
                    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <div class="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                             <div class="flex items-center gap-4">
                                <h3 class="font-bold text-slate-700 flex items-center gap-2">
                                    <i data-lucide="calendar" class="w-4 h-4 text-slate-500"></i>
                                    ${new Date(date + 'T00:00:00').toLocaleDateString('pt-PT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                                </h3>
                                <button onclick="generateMapaPDF('${date}')" class="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Imprimir este dia">
                                    <i data-lucide="printer" class="w-4 h-4"></i>
                                </button>
                             </div>
                             <span class="text-xs font-bold bg-slate-200 text-slate-600 px-2 py-1 rounded-lg">${groupedSchedule[date].length} agendamentos</span>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="w-full text-left">
                                <tbody class="divide-y divide-slate-100">
                                    ${groupedSchedule[date].map(item => `
                                    <tr class="hover:bg-slate-50 transition-colors">
                                        <td class="px-6 py-4 w-24">
                                            <div class="font-bold text-slate-900 text-lg">${item.time}</div>
                                        </td>
                                        <td class="px-6 py-4">
                                            <div class="font-medium text-slate-900 flex items-center gap-2">
                                                ${item.patientName}
                                                ${item.isPediatric ? '<span class="px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 text-xs font-bold">Pediatria</span>' : ''}
                                            </div>
                                            <div class="flex items-center gap-2 mt-1">
                                                 ${item.cartaoSus ? `<span class="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold border border-blue-200" title="Cartão SUS">SUS: ${item.cartaoSus}</span>` : ''}
                                                <div class="text-xs text-slate-500">Dr. ${item.doctor} • Origem: ${item.origin || 'N/I'}</div>
                                            </div>
                                        </td>
                                        <td class="px-6 py-4">
                                            <span class="px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold border border-blue-100">
                                                ${item.procedure}
                                            </span>
                                        </td>
                                        ${state.currentUser.role !== 'FUNC_ENFERMAGEM' ? `
                                        <td class="px-6 py-4 text-right">
                                            <button onclick="handleDeleteSchedule(${item.id})" class="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Remover">
                                                <i data-lucide="trash-2" class="w-4 h-4"></i>
                                            </button>
                                        </td>
                                        ` : ''}
                                    </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    `).join('')}
                </div>
            </div>
        </div>
        `;
}

function handleCreateSchedule(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);

    const newSchedule = {
        id: Date.now(),
        date: formData.get('date'),
        time: formData.get('time'),
        patientName: formData.get('patientName'),
        cartaoSus: formData.get('cartaoSus'),
        origin: formData.get('origin'),
        isPediatric: formData.get('isPediatric') === 'on',
        procedure: formData.get('procedure'),
        doctor: formData.get('doctor'),
        status: 'SCHEDULED'
    };

    if (!MOCK_DATA.MAPA_SCHEDULE) MOCK_DATA.MAPA_SCHEDULE = [];
    MOCK_DATA.MAPA_SCHEDULE.push(newSchedule);

    saveToLocalStorage();
    if (typeof db_saveSchedule === 'function') db_saveSchedule(newSchedule);
    showMsg("Agendamento criado com sucesso!");
    form.reset();
    render();
}

function handleDeleteSchedule(id) {
    if (confirm('Tem certeza que deseja remover este agendamento?')) {
        MOCK_DATA.MAPA_SCHEDULE = MOCK_DATA.MAPA_SCHEDULE.filter(item => item.id !== id);
        saveToLocalStorage();
        if (typeof db_deleteSchedule === 'function') db_deleteSchedule(id);
        showMsg("Agendamento removido.");
        render();
    }
}

function handleMapSearch(term) {
    window.mapSearchTerm = term;
    render(); // Re-render to apply filter
    // restore focus is handled by keeping the input value in the template
    setTimeout(() => {
        const input = document.querySelector('input[placeholder="Buscar por nome, data ou SUS..."]');
        if (input) {
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
        }
    }, 0);
}

function generateMapaPDF(targetDate = null) {
    let schedule = (MOCK_DATA.MAPA_SCHEDULE || []).sort((a, b) => {
        const dateA = new Date(a.date + 'T' + a.time);
        const dateB = new Date(b.date + 'T' + b.time);
        return dateA - dateB;
    });

    if (targetDate) {
        schedule = schedule.filter(item => item.date === targetDate);
    }

    if (schedule.length === 0) {
        showMsg("Não há agendamentos para imprimir", "error");
        return;
    }

    const groupedSchedule = {};
    schedule.forEach(item => {
        if (!groupedSchedule[item.date]) groupedSchedule[item.date] = [];
        groupedSchedule[item.date].push(item);
    });

    const sortedDates = Object.keys(groupedSchedule).sort();

    // Generate grouped content
    let contentHtml = '';
    sortedDates.forEach(date => {
        contentHtml += `
        <div class="date-header">
            ${new Date(date + 'T00:00:00').toLocaleDateString('pt-PT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
        </div>
        <table style="width: 100%;">
            <thead>
                <tr>
                    <th style="width: 15%">Horário</th>
                    <th style="width: 35%">Paciente</th>
                    <th style="width: 15%">Origem</th>
                    <th style="width: 20%">Procedimento</th>
                    <th style="width: 15%">Médico</th>
                </tr>
            </thead>
            <tbody>
                ${groupedSchedule[date].map(item => `
                    <tr style="${item.isPediatric ? 'background-color: #fce7f3;' : ''}">
                        <td style="font-weight: bold; font-size: 14px;">
                            ${item.time}
                        </td>
                        <td>
                            ${item.patientName}
                            ${item.isPediatric ? '<span style="color: #be185d; font-weight: bold; font-size: 11px; margin-left: 5px;">(PEDIATRIA)</span>' : ''}
                            ${item.cartaoSus ? `<br><span style="font-size: 10px; color: #666; background: #e0f2fe; padding: 2px 5px; border-radius: 4px;">SUS: ${item.cartaoSus}</span>` : ''}
                        </td>
                        <td>${item.origin || '-'}</td>
                        <td>${item.procedure}</td>
                        <td>${item.doctor}</td>
                    </tr>
                    `).join('')}
            </tbody>
        </table>
    `;
    });

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
            <head>
                <title>Mapa de Agendamentos - OPME</title>
                <style>
                    body {font-family: Arial, sans-serif; padding: 20px; }
                    h1 {text-align: center; color: #333; margin-bottom: 20px; }
                    table {width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 20px;}
                    th, td {border: 1px solid #ddd; padding: 10px; text-align: left; }
                    th {background-color: #f8f9fa; font-weight: bold; }
                    tr:nth-child(even) {background-color: #f9f9f9; }
                    .date-header {background-color: #334155; color: white; font-weight: bold; padding: 10px 15px; margin-top: 30px; border-radius: 6px; font-size: 14px; text-transform: uppercase;}
                    @media print {
                        button {display: none; }
                        body { -webkit-print-color-adjust: exact; }
                }
                </style>
            </head>
            <body>
                <div style="text-align: right; margin-bottom: 20px;">
                    <button onclick="window.print()" style="padding: 10px 20px; cursor: pointer;">Imprimir</button>
                </div>

                <div style="display: flex; align-items: center; justify-content: center; gap: 15px; margin-bottom: 30px;">
                    <img src="assets/img/logo_estado.png" style="height: 60px;">
                        <div style="text-align: center;">
                            <h2 style="margin: 0;">Hospital Geral de Palmas</h2>
                            <p style="margin: 5px 0; color: #666;">Mapa Cirúrgico - OPME</p>
                        </div>
                </div>

                ${contentHtml}

                <div style="margin-top: 40px; text-align: center; font-size: 12px; color: #999;">
                    Gerado em ${new Date().toLocaleString('pt-PT')} por ${state.currentUser.name}
                </div>
            </body>
        </html>
        `);
    printWindow.document.close();
}

window.handleCreateSchedule = handleCreateSchedule;

window.handleDeleteSchedule = handleDeleteSchedule;

window.generateMapaPDF = generateMapaPDF;

window.handleMapSearch = handleMapSearch;
