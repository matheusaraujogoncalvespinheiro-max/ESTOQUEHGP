// Procedimentos: registro de procedimentos não realizados

function renderProcedimentosNaoRealizados() {
    return `
    <div class="space-y-8 max-w-6xl mx-auto">
        <!-- Título e Feedback -->
        <div class="flex flex-col gap-2">
            <h2 class="text-3xl font-black text-slate-900 tracking-tight">Procedimentos Não Realizados</h2>
            <p class="text-slate-500">Documentação de procedimentos agendados que não foram executados.</p>
        </div>

        <!-- Formulário de Registro -->
        <div class="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
            <div class="p-8">
                <form onsubmit="handleSaveProcedimentoNaoRealizado(event)" class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <label class="block text-sm font-bold text-slate-700 mb-2">Data *</label>
                        <input type="date" name="data" required class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 outline-none transition-all bg-slate-50" value="${new Date().toISOString().split('T')[0]}">
                    </div>
                    <div>
                        <label class="block text-sm font-bold text-slate-700 mb-2">Nº Cartão SUS *</label>
                        <input type="text" name="cartao_sus" required maxlength="15" oninput="handleSusLookup(this)" class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 outline-none transition-all bg-slate-50" placeholder="000 0000 0000 0000">
                    </div>
                    <div>
                        <label class="block text-sm font-bold text-slate-700 mb-2">Nome do Paciente</label>
                        <input type="text" name="nome_paciente" id="lookup_nome_paciente" readonly class="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-100 text-slate-500 outline-none cursor-not-allowed" placeholder="Busca automática pelo SUS...">
                    </div>
                    <div>
                        <label class="block text-sm font-bold text-slate-700 mb-2">Procedimento *</label>
                        <input type="text" name="procedimento" required class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 outline-none transition-all bg-slate-50" placeholder="Ex: Cateterismo">
                    </div>
                    <div>
                        <label class="block text-sm font-bold text-slate-700 mb-2">Exame que Seria Realizado</label>
                        <input type="text" name="exame_pretendido" class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 outline-none transition-all bg-slate-50" placeholder="Descreva o exame">
                    </div>
                    <div>
                        <label class="block text-sm font-bold text-slate-700 mb-2">Motiva da Não Execução *</label>
                        <input type="text" name="motivo" required class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 outline-none transition-all bg-slate-50" placeholder="Motivo técnico/clínico">
                    </div>
                    <div class="md:col-span-3">
                        <button type="submit" class="w-full md:w-auto px-8 py-4 bg-amber-600 text-white font-bold rounded-2xl hover:bg-amber-700 hover:shadow-lg hover:shadow-amber-200 transition-all flex items-center justify-center gap-2">
                            <i data-lucide="save" class="w-5 h-5"></i> Salvar Registro
                        </button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Histórico -->
        <div class="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
             <div class="p-8 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h3 class="text-xl font-bold text-slate-900">Histórico de Procedimentos Não Realizados</h3>
                <div class="relative w-full md:w-96">
                    <i data-lucide="search" class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"></i>
                    <input type="text"
                           placeholder="Buscar por Paciente ou Cartão SUS..."
                           class="w-full pl-12 pr-4 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 transition-all text-sm"
                           oninput="state.searchTerm = this.value; render()"
                           value="${state.searchTerm || ''}">
                </div>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full border-collapse text-left">
                    <thead>
                        <tr class="bg-slate-50/50 text-slate-500 text-[10px] uppercase font-bold tracking-widest border-b border-slate-100">
                            <th class="px-8 py-5">Data</th>
                            <th class="px-8 py-5">SUS</th>
                            <th class="px-8 py-5">Paciente</th>
                            <th class="px-8 py-5">Procedimento</th>
                            <th class="px-8 py-5">Exame</th>
                            <th class="px-8 py-5">Motivo</th>
                            <th class="px-8 py-5">Responsável</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-50">
                        ${renderProcedimentosNaoRealizadosRows()}
                    </tbody>
                </table>
            </div>
        </div>
    </div>`;
}

function handleSusLookup(input) {
    const sus = input.value.trim();
    const nomeInput = document.getElementById('lookup_nome_paciente');
    if (!nomeInput) return;

    if (sus.length >= 5) {
        const paciente = MOCK_DATA.PACIENTES.find(p => p.cartao_sus === sus) ||
            MOCK_DATA.PATIENTS_HISTORY.find(p => p.cartao_sus === sus);
        if (paciente) {
            nomeInput.value = paciente.nome;
            nomeInput.classList.remove('text-slate-500');
            nomeInput.classList.add('text-slate-900', 'font-bold');
        } else {
            nomeInput.value = "";
            nomeInput.classList.add('text-slate-500');
            nomeInput.classList.remove('text-slate-900', 'font-bold');
        }
    } else {
        nomeInput.value = "";
    }
}

function handleSaveProcedimentoNaoRealizado(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);
    const nomePaciente = document.getElementById('lookup_nome_paciente').value;

    if (!nomePaciente || nomePaciente === "Busca automática pelo SUS...") {
        showMsg("Paciente não encontrado! O Cartão SUS deve estar cadastrado no sistema.", "error");
        return;
    }

    const newItem = {
        id: Date.now(),
        data: formData.get('data'),
        cartao_sus: formData.get('cartao_sus'),
        nome_paciente: document.getElementById('lookup_nome_paciente').value || "Não identificado",
        procedimento: formData.get('procedimento'),
        exame_pretendido: formData.get('exame_pretendido'),
        motivo: formData.get('motivo'),
        enfermeiro_responsavel: state.currentUser.name || state.currentUser.username
    };

    if (!MOCK_DATA.PROCEDIMENTOS_NAO_REALIZADOS) MOCK_DATA.PROCEDIMENTOS_NAO_REALIZADOS = [];
    MOCK_DATA.PROCEDIMENTOS_NAO_REALIZADOS.unshift(newItem);

    saveToLocalStorage();
    if (typeof db_saveNotPerformed === 'function') db_saveNotPerformed(newItem);

    showMsg("Registro salvo com sucesso!", "success");
    form.reset();
    render();
}

function renderProcedimentosNaoRealizadosRows() {
    let data = MOCK_DATA.PROCEDIMENTOS_NAO_REALIZADOS || [];
    
    if (state.searchTerm) {
        const term = state.searchTerm.toLowerCase();
        data = data.filter(item => 
            (item.nome_paciente && item.nome_paciente.toLowerCase().includes(term)) ||
            (item.cartao_sus && item.cartao_sus.includes(term))
        );
    }

    if (data.length === 0) {
        return `<tr><td colspan="7" class="px-8 py-10 text-center text-slate-400 italic">Nenhum registro encontrado.</td></tr>`;
    }

    return data.map(item => `
        <tr class="hover:bg-slate-50 transition-colors">
            <td class="px-8 py-5">
                <div class="text-sm font-bold text-slate-900">${new Date(item.data).toLocaleDateString()}</div>
            </td>
            <td class="px-8 py-5">
                <span class="px-3 py-1 bg-amber-50 text-amber-700 rounded-full text-[10px] font-black tracking-tight">${item.cartao_sus}</span>
            </td>
            <td class="px-8 py-5 text-sm font-medium text-slate-600">${item.nome_paciente}</td>
            <td class="px-8 py-5 text-sm font-bold text-slate-700">${item.procedimento}</td>
            <td class="px-8 py-5 text-sm text-slate-600">${item.exame_pretendido || '-'}</td>
            <td class="px-8 py-5">
                <div class="max-w-xs truncate text-sm text-slate-500" title="${item.motivo}">${item.motivo}</div>
            </td>
            <td class="px-8 py-5">
                <div class="flex items-center gap-2">
                    <div class="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">
                        ${item.enfermeiro_responsavel.charAt(0)}
                    </div>
                    <span class="text-xs font-medium text-slate-500">${item.enfermeiro_responsavel}</span>
                </div>
            </td>
        </tr>
    `).join('');
}
