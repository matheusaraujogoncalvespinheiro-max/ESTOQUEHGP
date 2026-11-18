// Procedimentos: agendar procedimento

// Procedimentos: agendamento e não realizados

function searchPatientForProcedimento(cartaoSus) {
    const cleanCartao = cartaoSus.replace(/\D/g, '');
    if (cleanCartao.length === 15) {
        const patient = MOCK_DATA.PACIENTES.find(p => p.cartao_sus.replace(/\D/g, '') === cleanCartao && !p.data_saida);
        if (patient) {
            state.selectedProcedimentoPatient = patient;
            showMsg("Paciente identificado com sucesso!", "success");
        } else {
            state.selectedProcedimentoPatient = null;
            showMsg("Paciente não encontrado no sistema ou já possui alta.", "error");
        }
        render();
    } else if (cleanCartao.length > 0 && cleanCartao.length < 15) {
        state.selectedProcedimentoPatient = null;
    }
}

function handleAgendarProcedimento(e) {
    e.preventDefault();
    if (!state.selectedProcedimentoPatient) {
        showMsg("Selecione um paciente identificando o Cartão SUS", "error");
        return;
    }

    const formData = new FormData(e.target);
    const exame = formData.get('exame_realizar');
    const exameFinal = exame === 'OUTROS' ? formData.get('outro_exame') : exame;
    const procedimento = formData.get('procedimento');

    if (exame === 'OUTROS' && !exameFinal) {
        showMsg("Descreva qual o outro exame a realizar", "error");
        return;
    }

    const newItem = {
        id: Date.now(),
        pacienteId: state.selectedProcedimentoPatient.id,
        pacienteNome: state.selectedProcedimentoPatient.nome,
        cartaoSus: state.selectedProcedimentoPatient.cartao_sus,
        exame: exameFinal,
        procedimento: procedimento,
        data: new Date().toISOString()
    };

    if (!MOCK_DATA.PROCEDIMENTOS_AGENDADOS) MOCK_DATA.PROCEDIMENTOS_AGENDADOS = [];
    MOCK_DATA.PROCEDIMENTOS_AGENDADOS.unshift(newItem);

    showMsg("Procedimento agendado com sucesso!", "success");
    state.selectedProcedimentoPatient = null;
    e.target.reset();
    saveToFirebase('MOCK_DATA', MOCK_DATA);
    render();
}

function renderProcedimentosForm() {
    if (!MOCK_DATA.PROCEDIMENTOS_AGENDADOS) MOCK_DATA.PROCEDIMENTOS_AGENDADOS = [];
    const agendados = MOCK_DATA.PROCEDIMENTOS_AGENDADOS;

    return `
    <div class="space-y-8 max-w-5xl mx-auto">
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 class="text-2xl font-bold text-slate-900 mb-6">Agendar Novo Procedimento</h2>

            <form onsubmit="handleAgendarProcedimento(event)" class="space-y-6">
            
            <div class="bg-slate-50 p-6 rounded-2xl border border-slate-200">
                <label class="block text-sm font-medium text-slate-700 mb-2">Buscar Paciente por Cartão SUS*</label>
                <div class="relative">
                    <i data-lucide="search" class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"></i>
                    <input type="text" 
                           placeholder="Digite os 15 dígitos do Cartão SUS..."
                           class="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono"
                           maxlength="15"
                           oninput="searchPatientForProcedimento(this.value)"
                           value="${state.selectedProcedimentoPatient ? state.selectedProcedimentoPatient.cartao_sus : ''}"
                           ${state.selectedProcedimentoPatient ? 'disabled' : ''}>
                    
                    ${state.selectedProcedimentoPatient ? `
                    <button type="button" 
                            onclick="state.selectedProcedimentoPatient = null; render()"
                            class="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold transition-all">
                        Limpar Busca
                    </button>
                    ` : ''}
                </div>

                ${state.selectedProcedimentoPatient ? `
                <div class="mt-4 p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-4 animate-in fade-in slide-in-from-top-2">
                    <div class="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600">
                        <i data-lucide="user-check" class="w-6 h-6"></i>
                    </div>
                    <div>
                        <p class="text-xs text-emerald-600 font-bold uppercase tracking-wider">Paciente Selecionado</p>
                        <h3 class="text-lg font-bold text-slate-900">${state.selectedProcedimentoPatient.nome}</h3>
                    </div>
                </div>
                ` : `
                <p class="mt-2 text-xs text-slate-500 italic">O sistema preencherá as informações automaticamente ao reconhecer o Cartão SUS.</p>
                `}
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label class="block text-sm font-medium text-slate-700 mb-2">Exame a Realizar *</label>
                    <select name="exame_realizar" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" onchange="toggleOutroExame(this)">
                        <option value="">Selecione o exame</option>
                        <option value="CAT+ANGIO">CAT+ANGIO</option>
                        <option value="ABLAÇÃO">ABLAÇÃO</option>
                        <option value="ACESSO DÍALISE">ACESSO DÍALISE</option>
                        <option value="ANGIO+ARTERIO ENDOVASCULAR">ANGIO+ARTERIO ENDOVASCULAR</option>
                        <option value="ANGIOPLASTIA">ANGIOPLASTIA</option>
                        <option value="APLICAÇÃO DE SPINRAZA">APLICAÇÃO DE SPINRAZA</option>
                        <option value="ARTERIOGRAFIA CELEBRAL">ARTERIOGRAFIA CELEBRAL</option>
                        <option value="ARTERIOGRAFIA ENDOVASCULAR">ARTERIOGRAFIA ENDOVASCULAR</option>
                        <option value="CARDIOVERSÃO">CARDIOVERSÃO</option>
                        <option value="CATETERISMO">CATETERISMO</option>
                        <option value="CATETERISMO+OPCA">CATETERISMO+OPCA</option>
                        <option value="CATETERISMO+VALVULOPLASTIA PULMONAR">CATETERISMO+VALVULOPLASTIA PULMONAR</option>
                        <option value="CPRE">CPRE</option>
                        <option value="DILATAÇÃO ESOFÁGICA">DILATAÇÃO ESOFÁGICA</option>
                        <option value="DRENAGEM DE HEMATOMA">DRENAGEM DE HEMATOMA</option>
                        <option value="DUODENOSCOPIA">DUODENOSCOPIA</option>
                        <option value="EMBOLIZAÇÃO CELEBRAL">EMBOLIZAÇÃO CELEBRAL</option>
                        <option value="EMBOLIZAÇÃO VASCULAR">EMBOLIZAÇÃO VASCULAR</option>
                        <option value="ENDOPRÓTESE VASCULAR">ENDOPRÓTESE VASCULAR</option>
                        <option value="ESCOPIA">ESCOPIA</option>
                        <option value="ESTUDO ELETROFIDIOLOGICO">ESTUDO ELETROFIDIOLOGICO</option>
                        <option value="FLEBOGRAFIA">FLEBOGRAFIA</option>
                        <option value="IMAGEM MCP">IMAGEM MCP</option>
                        <option value="IMPLANTE CDI">IMPLANTE CDI</option>
                        <option value="IMPLANTE CDL/PERMICATH">IMPLANTE CDL/PERMICATH</option>
                        <option value="IMPLANTE FVC">IMPLANTE FVC</option>
                        <option value="IMPLANTE MCP PROVISÓRIO">IMPLANTE MCP PROVISÓRIO</option>
                        <option value="LINFOGRAFIA">LINFOGRAFIA</option>
                        <option value="MCP">MCP</option>
                        <option value="OCLUSÃO PERCUTANEA">OCLUSÃO PERCUTANEA</option>
                        <option value="OPCA">OPCA</option>
                        <option value="PLASTIA DE LOJA">PLASTIA DE LOJA</option>
                        <option value="PUNSÃO">PUNSÃO</option>
                        <option value="REP PERMICATH">REP PERMICATH</option>
                        <option value="REP DE ELETRODO MCP">REP DE ELETRODO MCP</option>
                        <option value="RETIRADA DE CATETER">RETIRADA DE CATETER</option>
                        <option value="RETIRADA DE FIO GUIA">RETIRADA DE FIO GUIA</option>
                        <option value="RETIRADA DE GERADOR">RETIRADA DE GERADOR</option>
                        <option value="RETIRADA SISTEMA MCP">RETIRADA SISTEMA MCP</option>
                        <option value="REVISÃO MCP">REVISÃO MCP</option>
                        <option value="TENTATIVA IMP">TENTATIVA IMP</option>
                        <option value="TROCA ELETRODO MCP">TROCA ELETRODO MCP</option>
                        <option value="TROCA GERADOR CDI">TROCA GERADOR CDI</option>
                        <option value="TROCA GERADOR MCP">TROCA GERADOR MCP</option>
                        <option value="UPGRADE DE CDI">UPGRADE DE CDI</option>
                        <option value="OUTROS">OUTROS</option>
                    </select>
                </div>

                <div id="outroExameContainer" class="hidden md:col-span-2">
                    <label class="block text-sm font-medium text-slate-700 mb-2">Descreva o outro exame *</label>
                    <input type="text" name="outro_exame" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="Descreva o exame a realizar">
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-slate-700 mb-2">Tipo de Procedimento *</label>
                    <select name="procedimento" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
                        <option value="">Selecione</option>
                        <option value="ELETIVA">Eletiva</option>
                        <option value="INTERNADO">Internado</option>
                        <option value="EMERGENCIA">Emergência</option>
                    </select>
                </div>
            </div>

            <div class="pt-4 border-t border-slate-200 flex justify-end">
                <button type="submit" class="px-8 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-600/30 transition-all active:scale-95 flex items-center justify-center gap-2">
                    <i data-lucide="check" class="w-5 h-5"></i> Registrar Procedimento
                </button>
            </div>
            </form>
        </div>

        ${agendados.length > 0 ? `
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h3 class="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                <i data-lucide="list" class="w-5 h-5 text-blue-500"></i> Procedimentos Agendados / Em Fila
            </h3>
            
            <div class="overflow-x-auto">
                <table class="w-full text-sm text-left">
                    <thead class="bg-slate-50 text-slate-500 font-bold uppercase text-xs tracking-wider">
                        <tr>
                            <th class="px-4 py-3 rounded-l-lg">Paciente</th>
                            <th class="px-4 py-3">Exame a Realizar</th>
                            <th class="px-4 py-3">Tipo</th>
                            <th class="px-4 py-3 rounded-r-lg">Data Registro</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${agendados.map(item => `
                        <tr class="hover:bg-slate-50 transition-colors">
                            <td class="px-4 py-4">
                                <div class="font-bold text-slate-900">${item.pacienteNome}</div>
                                <div class="text-xs text-slate-500 font-mono">${item.cartaoSus}</div>
                            </td>
                            <td class="px-4 py-4 font-bold text-slate-700">${item.exame}</td>
                            <td class="px-4 py-4">
                                <span class="px-2 py-1 rounded-lg text-xs font-bold ${item.procedimento === 'EMERGENCIA' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'}">${item.procedimento}</span>
                            </td>
                            <td class="px-4 py-4 text-slate-500 text-xs">${new Date(item.data).toLocaleString('pt-BR')}</td>
                        </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
        ` : ''}
    </div>
    `;
}
