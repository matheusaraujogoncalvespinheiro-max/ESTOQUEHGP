// Pacientes: registro de novo paciente

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

// Expor funções usadas em atributos onclick/oninput do HTML
window.calculateAge = calculateAge;
window.handleRegisterPatient = handleRegisterPatient;
