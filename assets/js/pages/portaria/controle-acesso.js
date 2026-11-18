// Portaria: controle de acesso de visitantes e acompanhantes

function renderPortariaPainel() {
    if (!state.activePortariaSetor) {
        state.activePortariaSetor = 'Pronto Socorro Adulto';
    }

    const { currentTime, isVisitOpen, isEntryOpen, config } = checkPortariaHours();

    const visits = MOCK_DATA.PORTARIA_VISITS || [];
    const activeVisits = visits.filter(v => v.status === 'DENTRO' && v.setor === state.activePortariaSetor);
    
    const searchVal = (state.portariaSearchTerm || '').toLowerCase().trim();
    const filteredHistory = visits.filter(v => {
        const matchesSearch = v.nome.toLowerCase().includes(searchVal) || 
                              v.documento.toLowerCase().includes(searchVal) || 
                              (v.destino || '').toLowerCase().includes(searchVal);
        return matchesSearch;
    }).slice(0, 50);

    return `
    <div class="space-y-6 fade-in">
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
                <h1 class="text-2xl font-bold text-slate-900">Controle de Acesso - Portaria</h1>
                <p class="text-slate-500 text-sm">Registro de entradas e saídas de visitantes e acompanhantes.</p>
            </div>
            
            <div class="flex flex-wrap gap-3 items-center">
                <div class="bg-slate-100 p-1 rounded-xl flex gap-1 border border-slate-200">
                    <button onclick="setPortariaSetor('Pronto Socorro Adulto')" class="px-4 py-2 text-xs font-bold rounded-lg transition-all ${state.activePortariaSetor === 'Pronto Socorro Adulto' ? 'bg-white text-slate-900 shadow' : 'text-slate-500 hover:text-slate-800'}">
                        PS Adulto
                    </button>
                    <button onclick="setPortariaSetor('Pronto Socorro Pediatrico')" class="px-4 py-2 text-xs font-bold rounded-lg transition-all ${state.activePortariaSetor === 'Pronto Socorro Pediatrico' ? 'bg-white text-slate-900 shadow' : 'text-slate-500 hover:text-slate-800'}">
                        PS Pediátrico
                    </button>
                </div>

                <div class="px-4 py-2 rounded-xl border flex items-center gap-2 ${isEntryOpen ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-700'}">
                    <div class="w-2 h-2 rounded-full bg-current animate-pulse"></div>
                    <span class="text-xs font-bold uppercase tracking-wider text-[10px]">Entrada: ${isEntryOpen ? 'Aberta' : 'Fechada'}</span>
                </div>

                <div class="px-4 py-2 rounded-xl border flex items-center gap-2 ${isVisitOpen ? 'bg-cyan-50 border-cyan-100 text-cyan-700' : 'bg-amber-50 border-amber-100 text-amber-700'}">
                    <i data-lucide="users" class="w-4 h-4"></i>
                    <span class="text-xs font-bold uppercase tracking-wider text-[10px]">Visitas: ${isVisitOpen ? 'Liberadas' : 'Bloqueadas'} (${config.visiting_hours_start} - ${config.visiting_hours_end})</span>
                </div>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6 lg:col-span-1 border border-slate-200">
                <h3 class="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
                    <i data-lucide="user-plus" class="text-blue-500 w-5 h-5"></i>
                    Registrar Entrada
                </h3>

                <form id="portaria-entry-form" onsubmit="handleRegisterPortariaVisit(event)" class="space-y-4">
                    <div>
                        <label class="block text-xs font-semibold text-slate-600 mb-1">Nome Completo *</label>
                        <input type="text" name="nome" required placeholder="Nome do visitante/acompanhante" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm">
                    </div>

                    <div>
                        <label class="block text-xs font-semibold text-slate-600 mb-1">CPF (11 dígitos, apenas números) *</label>
                        <input type="text" name="documento" required placeholder="Digite o CPF (apenas números)" oninput="handleCPFInput(this)" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm">
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-semibold text-slate-600 mb-1">Tipo de Acesso *</label>
                            <select name="tipo" onchange="toggleVisitHoursCheck(this.value)" class="w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm">
                                <option value="Visita">Visita</option>
                                <option value="Acompanhante">Acompanhante</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-semibold text-slate-600 mb-1">Piso (Andar) *</label>
                            <select id="piso-select" onchange="handlePisoChange(this.value)" class="w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm">
                                <option value="Outro">Outro / Pronto Socorro</option>
                                <option value="1">1º Piso</option>
                                <option value="2">2º Piso</option>
                                <option value="3">3º Piso</option>
                                <option value="4">4º Piso</option>
                            </select>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div id="container-leito-select" class="col-span-2 hidden">
                            <label class="block text-xs font-semibold text-slate-600 mb-1">Leito/Quarto *</label>
                            <select id="leito-select" onchange="handleLeitoSelectChange(this.value)" class="w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm">
                                <!-- Populado dinamicamente -->
                            </select>
                        </div>
                        <div id="container-destino-custom" class="col-span-2">
                            <label class="block text-xs font-semibold text-slate-600 mb-1">Destino Customizado *</label>
                            <input type="text" id="destino-custom-input" placeholder="Ex: Box A / Administração" oninput="handleCustomDestInput(this.value)" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm">
                        </div>
                        <div class="relative col-span-2">
                            <label class="block text-xs font-semibold text-slate-600 mb-1">Nome do Paciente (Opcional)</label>
                            <input type="text" id="paciente-nome-input" placeholder="Nome do paciente" oninput="autocompletePaciente(this.value)" autocomplete="off" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm">
                            <div id="paciente-autocomplete-list" class="absolute bg-white border border-slate-200 rounded-xl shadow-lg mt-1 max-h-40 overflow-y-auto hidden z-50 text-xs w-full"></div>
                        </div>
                    </div>

                    <div class="space-y-2">
                        <label class="block text-xs font-semibold text-slate-600">Comprovação de Entrada (Foto)</label>
                        
                        <div class="relative w-full aspect-[4/3] bg-slate-900 rounded-2xl overflow-hidden flex items-center justify-center border border-slate-200 group">
                            <video id="webcam-preview" autoplay playsinline class="w-full h-full object-cover hidden"></video>
                            
                            <img id="photo-preview" src="${state.capturedPhoto || ''}" class="w-full h-full object-cover ${state.capturedPhoto ? '' : 'hidden'}">
                            
                            <canvas id="webcam-canvas" class="hidden"></canvas>
                            
                            <div id="webcam-placeholder" class="text-center p-4 text-slate-500 space-y-2 ${state.capturedPhoto ? 'hidden' : ''}">
                                <div class="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
                                    <i data-lucide="camera" class="w-6 h-6"></i>
                                </div>
                                <div class="text-xs">Câmera pronta para captura</div>
                            </div>
                        </div>

                        <div class="flex gap-2 justify-center">
                            <button type="button" id="btn-ligar-camera" onclick="iniciarCamera()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${state.capturedPhoto ? 'hidden' : ''}">
                                <i data-lucide="video" class="w-3.5 h-3.5"></i>
                                Iniciar Câmera
                            </button>
                            <button type="button" id="btn-tirar-foto" onclick="tirarFoto()" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 hidden">
                                <i data-lucide="aperture" class="w-3.5 h-3.5"></i>
                                Capturar Foto
                            </button>
                            <button type="button" id="btn-recapturar-foto" onclick="recapturarFoto()" class="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${state.capturedPhoto ? '' : 'hidden'}">
                                <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i>
                                Recapturar
                            </button>
                        </div>
                    </div>

                    <div class="pt-2">
                        <button type="submit" class="w-full py-4 bg-cyan-600 hover:bg-cyan-700 text-white font-bold rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 text-sm">
                            <i data-lucide="check" class="w-4 h-4"></i>
                            Confirmar Entrada
                        </button>
                    </div>
                </form>
            </div>

            <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6 lg:col-span-2 flex flex-col">
                <div class="flex justify-between items-center border-b border-slate-100 pb-3">
                    <h3 class="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <i data-lucide="eye" class="text-cyan-500 w-5 h-5"></i>
                        Pessoas no Hospital (${activeVisits.length})
                    </h3>
                    <span class="text-xs text-slate-400">Subsetor: ${state.activePortariaSetor}</span>
                </div>

                <div class="flex-1 overflow-x-auto min-h-[300px]">
                    ${activeVisits.length === 0 ? `
                    <div class="flex flex-col items-center justify-center h-full py-12 text-slate-400 space-y-3">
                        <i data-lucide="door-open" class="w-12 h-12 text-slate-300"></i>
                        <p class="text-sm font-semibold">Nenhum registro ativo neste subsetor no momento.</p>
                    </div>
                    ` : `
                    <table class="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr class="border-b border-slate-100 text-slate-500 uppercase tracking-widest text-[10px] font-bold bg-slate-50/50">
                                <th class="py-3 px-4">Foto</th>
                                <th class="py-3 px-4">Nome</th>
                                <th class="py-3 px-4">Documento</th>
                                <th class="py-3 px-4">Tipo</th>
                                <th class="py-3 px-4">Destino</th>
                                <th class="py-3 px-4">Entrada</th>
                                <th class="py-3 px-4 text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                            ${activeVisits.map(v => `
                            <tr class="hover:bg-slate-50 transition-colors">
                                <td class="py-3 px-4">
                                    <div class="w-10 h-10 rounded-lg overflow-hidden border border-slate-200 shadow-sm bg-slate-100 cursor-zoom-in" onclick="togglePhotoZoom('${v.foto}', '${v.nome}')">
                                        <img src="${fotoVisita(v.foto)}" class="w-full h-full object-cover">
                                    </div>
                                </td>
                                <td class="py-3 px-4 font-bold text-slate-800">${v.nome}</td>
                                <td class="py-3 px-4 text-slate-600 font-medium">${v.documento}</td>
                                <td class="py-3 px-4">
                                    <span class="px-2 py-1 rounded text-[10px] font-bold ${v.tipo === 'Acompanhante' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}">
                                        ${v.tipo}
                                    </span>
                                </td>
                                <td class="py-3 px-4 text-slate-700 font-semibold">${v.destino}</td>
                                <td class="py-3 px-4 text-slate-500 font-medium">
                                    ${new Date(v.hora_entrada).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                                    <div class="text-[10px] text-slate-400 mt-0.5">${new Date(v.hora_entrada).toLocaleDateString('pt-PT')}</div>
                                </td>
                                <td class="py-3 px-4 text-center">
                                    <button onclick="handlePortariaCheckout('${v.id}')" class="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm transition-all active:scale-95 flex items-center gap-1 mx-auto text-[10px]">
                                        <i data-lucide="log-out" class="w-3 h-3"></i>
                                        Registrar Saída
                                    </button>
                                </td>
                            </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    `}
                </div>
            </div>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-3">
                <h3 class="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <i data-lucide="history" class="text-slate-500 w-5 h-5"></i>
                    Histórico de Acessos Recentes
                </h3>
                
                <div class="flex items-center gap-2 max-w-sm w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                    <i data-lucide="search" class="w-4 h-4 text-slate-400"></i>
                    <input type="text" placeholder="Buscar por nome, documento..." value="${state.portariaSearchTerm || ''}" oninput="state.portariaSearchTerm=this.value; render()" class="bg-transparent outline-none border-none text-xs w-full text-slate-800">
                </div>
            </div>

            <div class="overflow-x-auto">
                ${filteredHistory.length === 0 ? `
                <div class="text-center py-8 text-slate-400 text-xs">Nenhum registro correspondente à busca.</div>
                ` : `
                <table class="w-full text-left text-xs border-collapse">
                    <thead>
                        <tr class="border-b border-slate-100 text-slate-500 uppercase tracking-widest text-[10px] font-bold bg-slate-50/50">
                            <th class="py-2.5 px-4">Foto</th>
                            <th class="py-2.5 px-4">Nome</th>
                            <th class="py-2.5 px-4">Documento</th>
                            <th class="py-2.5 px-4">Tipo</th>
                            <th class="py-2.5 px-4">Subsetor</th>
                            <th class="py-2.5 px-4">Destino</th>
                            <th class="py-2.5 px-4">Entrada</th>
                            <th class="py-2.5 px-4">Saída</th>
                            <th class="py-2.5 px-4">Status</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 text-slate-700">
                        ${filteredHistory.map(v => `
                        <tr class="hover:bg-slate-50/50">
                            <td class="py-2 px-4">
                                <div class="w-8 h-8 rounded overflow-hidden border border-slate-200 bg-slate-100 cursor-zoom-in" onclick="togglePhotoZoom('${v.foto}', '${v.nome}')">
                                    <img src="${fotoVisita(v.foto)}" class="w-full h-full object-cover">
                                </div>
                            </td>
                            <td class="py-2 px-4 font-bold text-slate-800">${v.nome}</td>
                            <td class="py-2 px-4 font-medium text-slate-500">${v.documento}</td>
                            <td class="py-2 px-4">
                                <span class="px-1.5 py-0.5 rounded text-[9px] font-bold ${v.tipo === 'Acompanhante' ? 'bg-purple-50 text-purple-700 border border-purple-100' : 'bg-blue-50 text-blue-700 border border-blue-100'}">
                                    ${v.tipo}
                                </span>
                            </td>
                            <td class="py-2 px-4 font-medium text-slate-600">${v.setor}</td>
                            <td class="py-2 px-4 font-semibold text-slate-800">${v.destino}</td>
                            <td class="py-2 px-4 text-slate-500 font-medium">
                                ${new Date(v.hora_entrada).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })}
                                <div class="text-[9px] text-slate-400 mt-0.5">Porteiro: ${v.porteiro_entrada || 'N/I'}</div>
                            </td>
                            <td class="py-2 px-4 text-slate-500 font-medium">
                                ${v.hora_saida ? new Date(v.hora_saida).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' }) : '-'}
                                <div class="text-[9px] text-slate-400 mt-0.5">Porteiro: ${v.porteiro_saida || '-'}</div>
                            </td>
                            <td class="py-2 px-4">
                                <span class="px-2 py-0.5 rounded-full text-[9px] font-bold ${v.status === 'DENTRO' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}">
                                    ${v.status === 'DENTRO' ? 'DENTRO' : 'SAIU'}
                                </span>
                            </td>
                        </tr>
                        `).join('')}
                    </tbody>
                </table>
                `}
            </div>
        </div>

        <div id="photo-zoom-modal" class="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4 hidden" onclick="this.classList.add('hidden')">
            <div class="bg-white rounded-3xl overflow-hidden max-w-lg w-full shadow-2xl relative border border-slate-100" onclick="event.stopPropagation()">
                <div class="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 id="photo-zoom-title" class="font-extrabold text-slate-900 text-lg">Visualização do Registro</h3>
                    <button onclick="document.getElementById('photo-zoom-modal').classList.add('hidden')" class="p-2 hover:bg-slate-200 rounded-lg text-slate-500 transition-all">
                        <i data-lucide="x" class="w-5 h-5"></i>
                    </button>
                </div>
                <div class="p-4 flex items-center justify-center bg-slate-900 aspect-[4/3]">
                    <img id="photo-zoom-img" src="" class="max-w-full max-h-full object-contain rounded-xl">
                </div>
            </div>
        </div>
    </div>
    `;
}

function autocompletePaciente(val) {
    const listDiv = document.getElementById('paciente-autocomplete-list');
    if (!listDiv) return;
    
    const value = val.toLowerCase().trim();
    if (!value || value.length < 2) {
        listDiv.innerHTML = '';
        listDiv.classList.add('hidden');
        return;
    }
    
    const activePatients = (MOCK_DATA.PACIENTES || []).filter(p => p.nome.toLowerCase().includes(value));
    if (activePatients.length === 0) {
        listDiv.innerHTML = '';
        listDiv.classList.add('hidden');
        return;
    }
    
    listDiv.innerHTML = activePatients.map(p => `
        <div onclick="selectAutocompletePaciente('${p.nome.replace(/'/g, "\\'")}', '${(p.leito || '').replace(/'/g, "\\'")}')" class="p-2 hover:bg-blue-50 cursor-pointer border-b border-slate-100 font-semibold text-slate-700">
            ${p.nome} ${p.leito ? `(Leito: ${p.leito})` : ''}
        </div>
    `).join('');
    listDiv.classList.remove('hidden');
}

function selectAutocompletePaciente(nome, leito) {
    const nameInput = document.getElementById('paciente-nome-input');
    const listDiv = document.getElementById('paciente-autocomplete-list');
    if (nameInput) {
        nameInput.value = nome;
    }
    
    if (leito) {
        const floorMatch = leito.match(/^([1-4])\d{2}[AB]$/);
        if (floorMatch) {
            const floor = floorMatch[1];
            const pisoSelect = document.getElementById('piso-select');
            if (pisoSelect) {
                pisoSelect.value = floor;
                handlePisoChange(floor);
                
                setTimeout(() => {
                    const leitoSelect = document.getElementById('leito-select');
                    if (leitoSelect) {
                        leitoSelect.value = leito;
                    }
                }, 50);
            }
        } else {
            const pisoSelect = document.getElementById('piso-select');
            if (pisoSelect) {
                pisoSelect.value = 'Outro';
                handlePisoChange('Outro');
            }
            setTimeout(() => {
                const customInput = document.getElementById('destino-custom-input');
                if (customInput) {
                    customInput.value = leito;
                }
            }, 50);
        }
    }
    
    if (listDiv) {
        listDiv.innerHTML = '';
        listDiv.classList.add('hidden');
    }
}

function toggleVisitHoursCheck(tipo) {
    if (tipo === 'Visita') {
        const { isVisitOpen, config } = checkPortariaHours();
        if (!isVisitOpen) {
            showMsg(`Atenção: Horário de visitas encerrado! (Horário: ${config.visiting_hours_start} - ${config.visiting_hours_end})`, "error");
        }
    }
}

function handlePortariaCheckout(visitId) {
    const visits = MOCK_DATA.PORTARIA_VISITS || [];
    const index = visits.findIndex(v => String(v.id) === String(visitId));
    if (index > -1) {
        visits[index].status = 'SAIU';
        visits[index].hora_saida = new Date().toISOString();
        visits[index].porteiro_saida = state.currentUser ? state.currentUser.name : "Porteiro";
        
        if (typeof db_savePortariaVisit === 'function') {
            db_savePortariaVisit(visits[index]);
        }
        showMsg("Saída registrada com sucesso!");
        render();
    }
}

function handleRegisterPortariaVisit(event) {
    event.preventDefault();
    const form = event.target;
    const tipo = form.tipo.value;
    const documento = form.documento.value;
    
    if (documento.length !== 11) {
        alert("O CPF deve ter exatamente 11 dígitos.");
        return;
    }
    
    if (tipo === 'Visita') {
        const { isVisitOpen } = checkPortariaHours();
        if (!isVisitOpen) {
            if (!confirm("Horário de visitas encerrado. Deseja registrar a entrada de qualquer forma?")) {
                return;
            }
        }
    }

    if (!state.capturedPhoto) {
        state.capturedPhoto = FOTO_PADRAO;
    }

    let destLoc = '';
    const piso = document.getElementById('piso-select').value;
    if (piso === 'Outro') {
        destLoc = document.getElementById('destino-custom-input').value.trim();
    } else {
        destLoc = document.getElementById('leito-select').value;
        if (!destLoc) {
            alert("Por favor, selecione o leito/quarto.");
            return;
        }
    }
    
    const pacienteNome = document.getElementById('paciente-nome-input').value.trim();
    const finalDestino = pacienteNome ? `${destLoc} (${pacienteNome})` : destLoc;

    const visit = {
        id: Date.now().toString(),
        nome: form.nome.value,
        documento: documento,
        tipo: tipo,
        setor: state.activePortariaSetor,
        destino: finalDestino,
        status: 'DENTRO',
        foto: state.capturedPhoto,
        hora_entrada: new Date().toISOString(),
        porteiro_entrada: state.currentUser ? state.currentUser.name : "Porteiro",
        created_at: new Date().toISOString()
    };

    if (!MOCK_DATA.PORTARIA_VISITS) MOCK_DATA.PORTARIA_VISITS = [];
    MOCK_DATA.PORTARIA_VISITS.unshift(visit);
    
    if (typeof db_savePortariaVisit === 'function') {
        db_savePortariaVisit(visit);
    }

    state.capturedPhoto = null;
    form.reset();
    
    const pisoSelect = document.getElementById('piso-select');
    if (pisoSelect) {
        pisoSelect.value = 'Outro';
        handlePisoChange('Outro');
    }
    const nameInput = document.getElementById('paciente-nome-input');
    if (nameInput) nameInput.value = '';
    
    showMsg("Entrada registrada com sucesso!");
    render();
}

function setPortariaSetor(setor) {
    state.activePortariaSetor = setor;
    state.capturedPhoto = null;
    pararCamera();
    render();
}

function togglePhotoZoom(photoBase64, name) {
    const modal = document.getElementById('photo-zoom-modal');
    const img = document.getElementById('photo-zoom-img');
    const title = document.getElementById('photo-zoom-title');
    if (modal && img && title) {
        img.src = fotoVisita(photoBase64);
        title.textContent = `Registro fotográfico: ${name}`;
        modal.classList.remove('hidden');
        lucide.createIcons();
    }
}

function handlePisoChange(piso) {
    const containerLeito = document.getElementById('container-leito-select');
    const containerCustom = document.getElementById('container-destino-custom');
    const leitoSelect = document.getElementById('leito-select');
    const customInput = document.getElementById('destino-custom-input');
    
    if (!containerLeito || !containerCustom) return;
    
    if (piso === 'Outro') {
        containerLeito.classList.add('hidden');
        containerCustom.classList.remove('hidden');
        if (leitoSelect) leitoSelect.required = false;
        if (customInput) customInput.required = true;
    } else {
        containerLeito.classList.remove('hidden');
        containerCustom.classList.add('hidden');
        if (customInput) {
            customInput.required = false;
            customInput.value = '';
        }
        if (leitoSelect) {
            leitoSelect.required = true;
            let options = '<option value="">Selecione...</option>';
            
            let wing1Label = '';
            let wing2Label = '';
            
            if (piso === '1') {
                wing1Label = 'Ala A/B (Pediatria)';
                wing2Label = ''; // Piso 1 has no Wing 2 based on description
            } else if (piso === '2') {
                wing1Label = 'Ala E/F (Neuro)';
                wing2Label = 'Ala G/H (Clínica Médica)';
            } else if (piso === '3') {
                wing1Label = 'Ala I/J (Ortopedia)';
                wing2Label = 'Ala K/L (Especialidades / Buco)';
            } else if (piso === '4') {
                wing1Label = 'Ala M/N (Oncologia / Nefrologia)';
                wing2Label = 'Ala O/P (Especialidades)';
            }
            
            // Wing 1 (Leitos 01 a 25)
            if (wing1Label) {
                options += `<optgroup label="${wing1Label} - Leitos 01 a 25">`;
                for (let i = 1; i <= 25; i++) {
                    const roomNum = `${piso}${String(i).padStart(2, '0')}A`;
                    const spec = getLeitoSpecialty(piso, i);
                    const display = spec ? `${roomNum} (${spec})` : roomNum;
                    options += `<option value="${roomNum}">${display}</option>`;
                }
                for (let i = 1; i <= 25; i++) {
                    const roomNum = `${piso}${String(i).padStart(2, '0')}B`;
                    const spec = getLeitoSpecialty(piso, i);
                    const display = spec ? `${roomNum} (${spec})` : roomNum;
                    options += `<option value="${roomNum}">${display}</option>`;
                }
                options += '</optgroup>';
            }
            
            // Wing 2 (Leitos 26 a 49)
            if (wing2Label) {
                options += `<optgroup label="${wing2Label} - Leitos 26 a 49">`;
                for (let i = 26; i <= 49; i++) {
                    const roomNum = `${piso}${String(i).padStart(2, '0')}A`;
                    const spec = getLeitoSpecialty(piso, i);
                    const display = spec ? `${roomNum} (${spec})` : roomNum;
                    options += `<option value="${roomNum}">${display}</option>`;
                }
                for (let i = 26; i <= 49; i++) {
                    const roomNum = `${piso}${String(i).padStart(2, '0')}B`;
                    const spec = getLeitoSpecialty(piso, i);
                    const display = spec ? `${roomNum} (${spec})` : roomNum;
                    options += `<option value="${roomNum}">${display}</option>`;
                }
                options += '</optgroup>';
            }
            
            leitoSelect.innerHTML = options;
        }
    }
}

function handleCPFInput(input) {
    let val = input.value.replace(/\D/g, '');
    if (val.length > 11) {
        val = val.slice(0, 11);
    }
    input.value = val;
    
    if (val.length === 11) {
        const visits = MOCK_DATA.PORTARIA_VISITS || [];
        const lastVisit = visits.find(v => v.documento === val);
        if (lastVisit) {
            const form = document.getElementById('portaria-entry-form');
            if (form) {
                form.nome.value = lastVisit.nome || '';
                form.tipo.value = lastVisit.tipo || 'Visita';
                
                showMsg(`✓ Cadastro de ${lastVisit.nome} preenchido automaticamente.`);
                
                if (lastVisit.foto) {
                    state.capturedPhoto = lastVisit.foto;
                    const previewImg = document.getElementById('photo-preview');
                    if (previewImg) {
                        previewImg.src = lastVisit.foto;
                        previewImg.classList.remove('hidden');
                    }
                    const placeholder = document.getElementById('webcam-placeholder');
                    if (placeholder) placeholder.classList.add('hidden');
                    const btnLigar = document.getElementById('btn-ligar-camera');
                    if (btnLigar) btnLigar.classList.add('hidden');
                    const btnRecap = document.getElementById('btn-recapturar-foto');
                    if (btnRecap) btnRecap.classList.remove('hidden');
                }
            }
        }
    }
}

function handleLeitoSelectChange(leitoValue) {
    const nameInput = document.getElementById('paciente-nome-input');
    if (!nameInput) return;
    
    if (!leitoValue) {
        nameInput.value = '';
        return;
    }
    
    const patient = (MOCK_DATA.PACIENTES || []).find(p => p.leito && p.leito.toUpperCase().trim() === leitoValue.toUpperCase().trim());
    if (patient) {
        nameInput.value = patient.nome;
        showMsg(`✓ Paciente ${patient.nome} encontrado no leito ${leitoValue}.`);
    } else {
        nameInput.value = '';
    }
}

function handleCustomDestInput(val) {
    const nameInput = document.getElementById('paciente-nome-input');
    if (!nameInput) return;
    const value = val.trim().toUpperCase();
    if (!value) return;
    
    const patient = (MOCK_DATA.PACIENTES || []).find(p => p.leito && p.leito.toUpperCase().trim() === value);
    if (patient) {
        nameInput.value = patient.nome;
    }
}

// Expor funções usadas em atributos onclick/oninput do HTML
window.renderPortariaPainel = renderPortariaPainel;
window.handleRegisterPortariaVisit = handleRegisterPortariaVisit;
window.handlePortariaCheckout = handlePortariaCheckout;
window.togglePhotoZoom = togglePhotoZoom;
window.setPortariaSetor = setPortariaSetor;
window.autocompletePaciente = autocompletePaciente;
window.selectAutocompletePaciente = selectAutocompletePaciente;
window.toggleVisitHoursCheck = toggleVisitHoursCheck;
window.handlePisoChange = handlePisoChange;
window.handleCPFInput = handleCPFInput;
window.handleLeitoSelectChange = handleLeitoSelectChange;
window.handleCustomDestInput = handleCustomDestInput;
