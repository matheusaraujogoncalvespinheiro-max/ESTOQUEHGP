// Pacientes: registro, altas e status

function validateCartaoSUS(cartao) {
    const numeros = cartao.replace(/\D/g, '');

    if (numeros.length !== 15) {
        return { valid: false, message: "Cartão SUS deve ter exatamente 15 dígitos numéricos" };
    }

    if (!/^\d{15}$/.test(numeros)) {
        return { valid: false, message: "Cartão SUS deve conter apenas números" };
    }

    return { valid: true, value: numeros };
}

function handleRegisterPatient(e) {
    e.preventDefault();
    const form = e.target;

    const cartaoSUS = form.cartao_sus.value;
    const cartaoValidado = validateCartaoSUS(cartaoSUS);
    if (!cartaoValidado.valid) {
        showMsg(cartaoValidado.message, "error");
        form.cartao_sus.focus();
        return;
    }

    // Check if patient is already hospitalized (duplicate check)
    const pacienteExistente = MOCK_DATA.PACIENTES.find(p => p.cartao_sus === cartaoValidado.value);
    if (pacienteExistente) {
        showMsg("Paciente já se encontra internado!", "error");
        return;
    }

    const dataNascimento = new Date(form.data_nascimento.value);
    const anoNascimento = dataNascimento.getFullYear();
    if (anoNascimento < 1900) {
        showMsg("Data de nascimento inválida! O ano deve ser 1900 ou superior.", "error");
        form.data_nascimento.focus();
        return;
    }

    const hoje = new Date();
    let idade = hoje.getFullYear() - dataNascimento.getFullYear();
    const m = hoje.getMonth() - dataNascimento.getMonth();
    if (m < 0 || (m === 0 && hoje.getDate() < dataNascimento.getDate())) {
        idade--;
    }

    const novoPaciente = {
        id: Date.now(),
        nome: form.nome_paciente.value.toUpperCase(),
        nome_mae: form.nome_mae.value.toUpperCase(),
        cartao_sus: cartaoValidado.value,
        data_entrada: new Date().toISOString().split('T')[0],
        hora_admitido: new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
        idade: idade,
        data_nascimento: form.data_nascimento.value,
        sexo: form.sexo.value,
        acompanhante: form.acompanhante.checked,
        status: 'INTERNADO',
        data_registro: new Date().toISOString()
    };

    MOCK_DATA.PACIENTES.unshift(novoPaciente);
    saveToLocalStorage();
    if (typeof db_savePatient === "function") db_savePatient(novoPaciente);
    showMsg("Paciente registrado com sucesso!");
    form.reset();

    // Force clear all inputs to ensure "balloons" are clean
    Array.from(form.elements).forEach(element => {
        if (['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName)) {
            element.value = '';
        }
    });

    const idadeInput = document.getElementById('idadeCalculada');
    if (idadeInput) {
        idadeInput.value = '';
    }
}

function prepareDischarge(id) {
    const patient = MOCK_DATA.PACIENTES.find(p => p.id === Number(id));
    state.selectedDischargePatient = patient;
    state.activeModule = 'DISCHARGE';
    state.currentPage = 1;
    render();
}

function filterPacientes(data) {
    if (!state.searchTerm) return data;

    const term = state.searchTerm.toLowerCase();
    return data.filter(paciente =>
        paciente.nome.toLowerCase().includes(term) ||
        paciente.cartao_sus.includes(term) ||
        paciente.leito.toLowerCase().includes(term) ||
        (paciente.exame_realizado && paciente.exame_realizado.toLowerCase().includes(term))
    );
}

function renderEnfermagem() {
    return `
    <div class="space-y-8">
        <!-- Formulário de Registro de Paciente -->
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 class="text-2xl font-bold text-slate-900 mb-6">Registrar Novo Paciente</h2>

            <form onsubmit="handleRegisterPatient(event)" class="space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Nome do Paciente *</label>
            <input type="text" name="nome_paciente" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Cartão SUS *</label>
            <input type="text" name="cartao_sus" required maxlength="15" pattern="\\d*" title="Apenas números, 15 dígitos" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="15 dígitos numéricos" oninput="this.value = this.value.replace(/\\D/g, '').slice(0, 15)">
            <p class="text-xs text-slate-500 mt-1">Apenas números, 15 dígitos</p>
            </div>
            
            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Nome da Mãe *</label>
            <input type="text" name="nome_mae" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            </div>

            <div class="flex items-center gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
            <input type="checkbox" name="acompanhante" id="acompanhante" class="w-6 h-6 rounded-md border-slate-300 text-pink-600 focus:ring-pink-500">
            <label for="acompanhante" class="text-sm font-bold text-slate-700 cursor-pointer select-none">Tem Acompanhante?</label>
            </div>
            </div>

            

            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Data de Nascimento *</label>
            <input type="date" name="data_nascimento" required min="1900-01-01" max="${new Date().toISOString().split('T')[0]}" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" onchange="calculateAge(this)">
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Sexo *</label>
            <select name="sexo" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            <option value="">Selecione</option>
            <option value="MASCULINO">Masculino</option>
            <option value="FEMININO">Feminino</option>
            </select>
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Idade</label>
            <input type="text" id="idadeCalculada" readonly class="w-full px-4 py-3 bg-slate-100 border border-slate-200 rounded-xl outline-none" placeholder="Calculado automaticamente">
            </div>
            </div>

            



            <div class="pt-4">
            <button type="submit" class="w-full bg-pink-600 hover:bg-pink-700 text-white font-bold py-4 rounded-xl shadow-lg transition-all active:scale-95">
            Registrar Paciente
            </button>
            </div>
            </form>
        </div>
    </div>`;
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

function renderPacientesRegistrados() {
    // Redirecionar para o módulo de status que é mais completo (Internados + Altas)
    return renderStatusPacientes();
}

function calculateAge(input) {
    const dataNascimento = new Date(input.value);
    if (isNaN(dataNascimento.getTime())) return;

    const hoje = new Date();
    let idade = hoje.getFullYear() - dataNascimento.getFullYear();
    const m = hoje.getMonth() - dataNascimento.getMonth();
    if (m < 0 || (m === 0 && hoje.getDate() < dataNascimento.getDate())) {
        idade--;
    }

    const idadeInput = document.getElementById('idadeCalculada');
    if (idadeInput) {
        idadeInput.value = `${idade} anos`;
    }
}

window.calculateAge = calculateAge;

window.handleRegisterPatient = handleRegisterPatient;

window.handleDischargePatient = handleDischargePatient;

function renderStatusPacientes() {
    // Filter data - ONLY Internados
    let data = MOCK_DATA.PACIENTES;

    // Apply search filter
    if (state.searchTerm) {
        const term = state.searchTerm.toLowerCase();
        data = data.filter(p =>
            p.nome.toLowerCase().includes(term) ||
            p.cartao_sus.includes(term) ||
            (p.exame_realizado && p.exame_realizado.toLowerCase().includes(term))
        );
    }

    // Sort by registration date (newest first)
    data.sort((a, b) => {
        const dateA = a.data_registro || '';
        const dateB = b.data_registro || '';
        return b.id - a.id;
    });

    const totalPages = Math.ceil(data.length / state.itemsPerPage);
    const paginatedData = data.slice((state.currentPage - 1) * state.itemsPerPage, state.currentPage * state.itemsPerPage);

    return `
        <div class="max-w-6xl mx-auto space-y-6">
            <div class="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div>
                    <h2 class="text-xl font-bold text-slate-800">Status dos Pacientes</h2>
                    <p class="text-sm text-slate-500">Gerenciamento de Pacientes Internados</p>
                </div>
                <div class="bg-amber-50 text-amber-700 px-4 py-2 rounded-lg font-bold">
                    Internados: ${data.length}
                </div>
            </div>

            <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                ${data.length === 0 ? `
            <div class="text-center py-12">
                <div class="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i data-lucide="users" class="w-8 h-8 text-slate-400"></i>
                </div>
                <h3 class="font-bold text-slate-700">Nenhum paciente internado</h3>
                <p class="text-slate-500 text-sm">Registre novos pacientes para acompanhamento.</p>
            </div>
            ` : `
            <div class="overflow-x-auto">
                <table class="w-full text-left">
                    <thead class="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th class="px-6 py-4 text-sm font-bold text-slate-600">Paciente</th>
                            <th class="px-6 py-4 text-sm font-bold text-slate-600">Entrada</th>
                            <th class="px-6 py-4 text-sm font-bold text-slate-600">Procedimento</th>
                            <th class="px-6 py-4 text-sm font-bold text-slate-600">Status Atual</th>
                            <th class="px-6 py-4 text-sm font-bold text-slate-600 text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${paginatedData.map(p => `
                        <tr class="hover:bg-slate-50 transition-colors">
                            <td class="px-6 py-4">
                                <div class="font-bold text-slate-900">${p.nome}</div>
                                <div class="text-xs text-slate-500">SUS: ${p.cartao_sus}</div>
                                <div class="text-xs text-slate-500">DN: ${p.data_nascimento}</div>
                            </td>
                            <td class="px-6 py-4">
                                <div class="text-sm text-slate-700">${p.data_entrada || p.data_registro}</div>
                            </td>
                            <td class="px-6 py-4">
                                <span class="px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-bold">
                                    ${p.exame_realizado || p.procedimento || 'N/A'}
                                </span>
                            </td>
                            <td class="px-6 py-4">
                                <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
                                     <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Internado
                                </span>
                            </td>
                            <td class="px-6 py-4 text-right">
                                ${state.currentUser.role !== 'CHEFE_HEMODINAMICA' ? `
                                <button onclick="prepareDischarge('${p.id}')" class="px-3 py-1.5 bg-orange-100 text-orange-700 hover:bg-orange-200 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1" title="Ir para Alta">
                                    <i data-lucide="arrow-right-circle" class="w-3 h-3"></i> Dar Alta
                                </button>
                                ` : ''}
                            </td>
                        </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            
            <!-- Paginação -->
            ${totalPages > 1 ? `
            <div class="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
                <button onclick="changePage(-1)" ${state.currentPage === 1 ? 'disabled' : ''} class="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed">
                    <i data-lucide="chevron-left" class="w-4 h-4 text-slate-600"></i>
                </button>
                <div class="text-sm text-slate-600 font-medium">
                    Página ${state.currentPage} de ${totalPages}
                </div>
                <button onclick="changePage(1)" ${state.currentPage === totalPages ? 'disabled' : ''} class="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed">
                    <i data-lucide="chevron-right" class="w-4 h-4 text-slate-600"></i>
                </button>
            </div>
            ` : ''}
            `}
            </div>
        </div>
        `;
}

function handlePatientDischarge(id) {
    try {
        if (!confirm('Tem certeza que deseja dar alta para este paciente? Ele será movido para o histórico.')) {
            return;
        }

        const numericId = Number(id);
        const index = MOCK_DATA.PACIENTES.findIndex(p => p.id === numericId);

        if (index === -1) {
            showMsg("Erro: Paciente não encontrado.", "error");
            return;
        }

        const paciente = MOCK_DATA.PACIENTES[index];

        // Add metadata for discharge
        paciente.data_alta = new Date().toISOString();
        paciente.status = 'ALTA';
        paciente.usuario_alta = state.currentUser.name;

        // Move to History
        if (!MOCK_DATA.PATIENTS_HISTORY) MOCK_DATA.PATIENTS_HISTORY = [];
        MOCK_DATA.PATIENTS_HISTORY.unshift(paciente);

        // Remove from Active
        MOCK_DATA.PACIENTES.splice(index, 1);

        saveToLocalStorage();

        // Render update IMMEDIATELY
        render();

        // Async operations after UI update
        if (typeof db_savePatient === 'function') {
            // We don't await this to keep UI responsive
            db_savePatient(paciente).catch(err => console.error("Error saving to DB:", err));
        }

        showMsg(`Paciente ${paciente.nome} teve alta registrada com sucesso!`);
    } catch (error) {
        console.error("Erro ao dar alta:", error);
        showMsg("Erro ao processar alta: " + error.message, "error");
    }
}

function renderHistoricoAltas() {
    const data = MOCK_DATA.PATIENTS_HISTORY || [];

    // Apply search filter
    let filteredData = data;
    if (state.searchTerm) {
        const term = state.searchTerm.toLowerCase();
        filteredData = data.filter(p =>
            p.nome.toLowerCase().includes(term) ||
            p.cartao_sus.includes(term) ||
            (p.exame_realizado && p.exame_realizado.toLowerCase().includes(term))
        );
    }

    // Sort by discharge date (newest first)
    filteredData.sort((a, b) => {
        const dateA = a.data_alta || a.data_registro || '';
        const dateB = b.data_alta || b.data_registro || '';
        return new Date(dateB) - new Date(dateA);
    });

    const totalPages = Math.ceil(filteredData.length / state.itemsPerPage);
    const paginatedData = filteredData.slice((state.currentPage - 1) * state.itemsPerPage, state.currentPage * state.itemsPerPage);

    return `
        <div class="max-w-6xl mx-auto space-y-6">
            <div class="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div>
                    <h2 class="text-xl font-bold text-slate-800">Histórico de Altas</h2>
                    <p class="text-sm text-slate-500">Registro de pacientes que receberam alta</p>
                </div>
                <div class="bg-indigo-50 text-indigo-700 px-4 py-2 rounded-lg font-bold">
                    Total: ${data.length}
                </div>
            </div>

            <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                ${data.length === 0 ? `
            <div class="text-center py-12">
                <div class="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i data-lucide="clipboard-list" class="w-8 h-8 text-slate-400"></i>
                </div>
                <h3 class="font-bold text-slate-700">Nenhum registro encontrado</h3>
                <p class="text-slate-500 text-sm">Nenhum paciente recebeu alta ainda.</p>
            </div>
            ` : `
            <div class="overflow-x-auto">
                <table class="w-full text-left">
                    <thead class="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th class="px-6 py-4 text-sm font-bold text-slate-600">Paciente</th>
                            <th class="px-6 py-4 text-sm font-bold text-slate-600">Entrada</th>
                            <th class="px-6 py-4 text-sm font-bold text-slate-600">Alta</th>
                            <th class="px-6 py-4 text-sm font-bold text-slate-600">Procedimento</th>
                            <th class="px-6 py-4 text-sm font-bold text-slate-600">Responsável Alta</th>
                            <th class="px-6 py-4 text-sm font-bold text-slate-600 text-right">Status</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${paginatedData.map(p => `
                        <tr class="hover:bg-slate-50 transition-colors">
                            <td class="px-6 py-4">
                                <div class="font-bold text-slate-900">${p.nome}</div>
                                <div class="text-xs text-slate-500">SUS: ${p.cartao_sus}</div>
                            </td>
                            <td class="px-6 py-4">
                                <div class="text-sm text-slate-700">${p.data_entrada || p.data_registro}</div>
                            </td>
                            <td class="px-6 py-4">
                                <div class="text-sm font-bold text-slate-900">${p.data_alta ? new Date(p.data_alta).toLocaleDateString('pt-PT') : 'N/A'}</div>
                                <div class="text-xs text-slate-500">${p.data_alta ? new Date(p.data_alta).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }) : ''}</div>
                            </td>
                            <td class="px-6 py-4">
                                <span class="px-2 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold border border-blue-100">
                                    ${p.exame_realizado || p.procedimento || 'N/A'}
                                </span>
                            </td>
                            <td class="px-6 py-4">
                                <div class="text-sm text-slate-700">${p.usuario_alta || 'N/A'}</div>
                            </td>
                            <td class="px-6 py-4 text-right flex justify-end gap-3 items-center">
                                <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600">
                                    <span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span> Alta
                                </span>
                                <button onclick="printDischarge(${p.id})" class="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors" title="Imprimir Comprovante de Alta">
                                    <i data-lucide="printer" class="w-4 h-4"></i>
                                </button>
                            </td>
                        </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>

            <!-- Paginação -->
            ${totalPages > 1 ? `
            <div class="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
                <button onclick="changePage(-1)" ${state.currentPage === 1 ? 'disabled' : ''} class="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed">
                    <i data-lucide="chevron-left" class="w-4 h-4 text-slate-600"></i>
                </button>
                <div class="text-sm text-slate-600 font-medium">
                    Página ${state.currentPage} de ${totalPages}
                </div>
                <button onclick="changePage(1)" ${state.currentPage === totalPages ? 'disabled' : ''} class="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed">
                    <i data-lucide="chevron-right" class="w-4 h-4 text-slate-600"></i>
                </button>
            </div>
            ` : ''}
            `}
            </div>
        </div >
        `;
}

function printDischarge(id) {
    const p = MOCK_DATA.PATIENTS_HISTORY.find(pat => pat.id === id);
    if (!p) return;

    const html = `
        <html>
        <head>
            <title>Comprovante de Alta - ${p.nome}</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; font-size: 14px; }
                h2 { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 30px; text-transform: uppercase; }
                .info-group { margin-bottom: 15px; }
                .label { font-weight: bold; width: 250px; display: inline-block; }
                .signature { margin-top: 80px; text-align: center; }
                .signature-line { border-top: 1px solid #000; display: inline-block; width: 400px; margin-bottom: 10px; }
                .print-button { margin-bottom: 20px; display: block; text-align: center; }
                @media print { .no-print { display: none; } }
            </style>
        </head>
        <body>
            <div class="no-print print-button">
                <button onclick="window.print()" style="padding: 10px 20px; font-size: 16px; font-weight: bold; cursor: pointer;">Imprimir</button>
            </div>
            
            <h2>Comprovante de Alta Médica</h2>
            
            <div class="info-group">
                <span class="label">Paciente:</span> ${p.nome}
            </div>
            <div class="info-group">
                <span class="label">Cartão SUS:</span> ${p.cartao_sus || 'N/A'}
            </div>
            <div class="info-group">
                <span class="label">Data de Entrada no Sistema:</span> ${p.data_entrada || p.data_registro || 'N/A'}
            </div>
            <div class="info-group">
                <span class="label">Data e Hora da Alta:</span> ${p.data_alta ? new Date(p.data_alta).toLocaleString('pt-BR') : 'N/A'}
            </div>
            <div class="info-group">
                <span class="label">Exame / Agendamento:</span> ${p.exame || p.exame_a_realizar || 'N/A'}
            </div>
            <div class="info-group">
                <span class="label">Exame Realizado:</span> ${p.exame_realizado || p.procedimento || 'N/A'}
            </div>
            <div class="info-group">
                <span class="label">Enfermeiro(a) Responsável:</span> ${p.usuario_alta || p.enfermeiro_alta || 'N/A'}
            </div>

            <div class="signature">
                <div class="signature-line"></div>
                <div>Assinatura do Profissional Responsável</div>
            </div>
        </body>
        </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(html);
    printWindow.document.close();
}
