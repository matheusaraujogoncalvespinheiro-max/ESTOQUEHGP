// Pacientes: dar alta

function prepareDischarge(id) {
    const patient = MOCK_DATA.PACIENTES.find(p => p.id === Number(id));
    state.selectedDischargePatient = patient;
    state.activeModule = 'DISCHARGE';
    state.currentPage = 1;
    render();
}

function handleDischargePatient(e) {
    e.preventDefault();
    console.log("handleDischargePatient triggered");
    const formData = new FormData(e.target);
    const dischargeData = Object.fromEntries(formData.entries());

    const numericId = Number(dischargeData.patient_id);
    const index = MOCK_DATA.PACIENTES.findIndex(p => p.id === numericId);

    if (index === -1) {
        showMsg("Erro: Paciente não encontrado.", "error");
        return;
    }

    const patient = MOCK_DATA.PACIENTES[index];

    // Update patient with discharge data
    Object.assign(patient, {
        ...dischargeData,
        data_alta: new Date().toISOString(),
        status: 'ALTA',
        usuario_alta: state.currentUser.name
    });

    // Move to History
    if (!MOCK_DATA.PATIENTS_HISTORY) MOCK_DATA.PATIENTS_HISTORY = [];
    MOCK_DATA.PATIENTS_HISTORY.unshift(patient);

    // Remove from Active
    MOCK_DATA.PACIENTES.splice(index, 1);

    saveToLocalStorage();

    // Render update IMMEDIATELY
    state.activeModule = 'STATUS_PACIENTES'; // Redirect back to list
    render();

    // Async operations
    if (typeof db_savePatient === 'function') {
        db_savePatient(patient).catch(err => console.error("Error saving to DB:", err));
    }

    showMsg(`Alta de ${patient.nome} realizada com sucesso!`);
    state.selectedDischargePatient = null;
}

function searchPatientForDischarge(sus) {
    // Clean input
    const cleanSUS = sus.replace(/\D/g, '').slice(0, 15);
    
    if (cleanSUS.length === 15) {
        const patient = MOCK_DATA.PACIENTES.find(p => p.cartao_sus === cleanSUS);
        if (patient) {
            state.selectedDischargePatient = patient;
            render();
        } else {
            // Optional: show a message if fully typed but not found
            // but usually we just wait for the right number
        }
    } else {
        // If user is erasing, and it was found, we might want to clear it
        if (state.selectedDischargePatient && cleanSUS.length < 15) {
            state.selectedDischargePatient = null;
            render();
        }
    }
}

function renderDischargeForm() {
    const activePatients = MOCK_DATA.PACIENTES.filter(p => !p.data_saida).sort((a, b) => a.nome.localeCompare(b.nome));

    return `
    <div class="space-y-8">
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 class="text-2xl font-bold text-slate-900 mb-6">Dar Alta ao Paciente</h2>

            <form onsubmit="handleDischargePatient(event)" class="space-y-6">
            
            <div class="bg-slate-50 p-6 rounded-2xl border border-slate-200">
                <label class="block text-sm font-medium text-slate-700 mb-2">Buscar Paciente por Cartão SUS*</label>
                <div class="relative">
                    <i data-lucide="search" class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"></i>
                    <input type="text" 
                           placeholder="Digite os 15 dígitos do Cartão SUS..."
                           class="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                           maxlength="15"
                           oninput="searchPatientForDischarge(this.value)"
                           value="${state.selectedDischargePatient ? state.selectedDischargePatient.cartao_sus : ''}"
                           ${state.selectedDischargePatient ? 'disabled' : ''}>
                    
                    ${state.selectedDischargePatient ? `
                    <button type="button" 
                            onclick="state.selectedDischargePatient = null; render()"
                            class="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold transition-all">
                        Limpar Busca
                    </button>
                    ` : ''}
                </div>

                ${state.selectedDischargePatient ? `
                <div class="mt-4 p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-4 animate-in fade-in slide-in-from-top-2">
                    <div class="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600">
                        <i data-lucide="user-check" class="w-6 h-6"></i>
                    </div>
                    <div>
                        <p class="text-xs text-emerald-600 font-bold uppercase tracking-wider">Paciente Identificado</p>
                        <h3 class="text-lg font-bold text-slate-900">${state.selectedDischargePatient.nome}</h3>
                        <p class="text-sm text-slate-500">Cartão SUS: ${state.selectedDischargePatient.cartao_sus}</p>
                    </div>
                    <input type="hidden" name="patient_id" value="${state.selectedDischargePatient.id}">
                </div>
                ` : `
                <p class="mt-2 text-xs text-slate-500 italic">O sistema puxará as informações automaticamente ao preencher o Cartão SUS.</p>
                `}
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Exame Realizado *</label>
            <select name="exame_realizado" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" onchange="toggleOutroExame(this)">
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

            <div id="outroExameContainer" class="hidden">
            <label class="block text-sm font-medium text-slate-700 mb-2">Descreva o outro exame *</label>
            <input type="text" name="outro_exame" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="Descreva o exame realizado">
            </div>
            
            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Procedimento *</label>
            <select name="procedimento" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            <option value="">Selecione</option>
            <option value="ELETIVA">Eletiva</option>
            <option value="INTERNADO">Internado</option>
            <option value="EMERGENCIA">Emergência</option>
            </select>
            </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Destino *</label>
            <input type="text" name="destino" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="Ex: OPME">
            </div>
            
            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Data de Saída *</label>
            <input type="date" name="data_saida" required max="${new Date().toISOString().split('T')[0]}" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Hora Saída *</label>
            <input type="time" name="hora_saida" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Hora Início Procedimento *</label>
            <input type="time" name="hora_inicio_procedimento" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Hora Término Procedimento *</label>
            <input type="time" name="hora_termino_procedimento" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Enfermeiro de Admissão *</label>
            <input type="text" name="enfermeiro_admissao" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="Nome do enfermeiro">
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Enfermeiro que Deu Alta *</label>
            <input type="text" name="enfermeiro_alta" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="Nome do enfermeiro">
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Leito *</label>
            <input type="text" name="leito" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="Número do leito">
            </div>
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Técnico de Enfermagem *</label>
            <input type="text" name="tecnico_enfermagem" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="Nome do técnico">
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Médico Responsável *</label>
            <input type="text" name="medico_responsavel" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="Nome do médico">
            </div>

            <div class="pt-4">
            <button type="submit" class="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-4 rounded-xl shadow-lg transition-all active:scale-95">
            Dar Alta
            </button>
            </div>
            </form>
        </div>
    </div>`;
}

// Expor funções usadas em atributos onclick/oninput do HTML
window.handleDischargePatient = handleDischargePatient;
