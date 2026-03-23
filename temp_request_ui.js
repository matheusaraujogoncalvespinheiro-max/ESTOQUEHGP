function renderRequestForm() {
    const role = state.currentUser.role;

    // Define options for 'Solicitar De' (Provider) based on current user role
    // Requester (Me) -> Provider (Target)
    let providerOptions = '<option value="">Selecione o setor para solicitar</option>';

    // Logic: Who can request from whom?
    // CHEFE_OPME (OPME) -> can request from OPME, HEMODINAMICA
    // CHEFE_HEMODINAMICA (Hemodinâmica) -> can request from OPME, OPME
    // FUNC_OPME (OPME) -> can request from OPME, HEMODINAMICA

    if (role === 'ADMIN') {
        providerOptions += `
            <option value="OPME">OPME</option>
            <option value="HEMODINAMICA">Hemodinâmicainistrativo</option>
            <option value="OPME">Centro Cirúrgico</option>
        `;
    } else if (role === 'CHEFE_OPME' || role === 'FUNC_OPME') {
        providerOptions += `
            <option value="HEMODINAMICA">Hemodinâmicainistrativo</option>
            <option value="OPME">Centro Cirúrgico</option>
        `;
    } else if (role === 'CHEFE_HEMODINAMICA' || role === 'FUNC_HEMODINAMICA') {
        providerOptions += `
            <option value="OPME">OPME</option>
            <option value="OPME">Centro Cirúrgico</option>
        `;
    } else if (role === 'FUNC_OPME') {
        providerOptions += `
            <option value="OPME">OPME</option>
            <option value="HEMODINAMICA">Hemodinâmicainistrativo</option>
        `;
    }

    return `
    <div class="max-w-3xl mx-auto">
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 class="text-2xl font-bold text-slate-900 mb-6">Solicitar Material</h2>
            
            <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-sm text-blue-800 flex items-start gap-3">
                <i data-lucide="info" class="w-5 h-5 shrink-0 mt-0.5"></i>
                <p>Use esta função para solicitar materiais de outros setores. O responsável do setor de destino deverá aprovar a solicitação para que o estoque seja transferido.</p>
            </div>

            <form onsubmit="handleRequestMaterial(event)" class="space-y-6">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label class="block text-sm font-medium text-slate-700 mb-2">Solicitar De (Origem) *</label>
                        <select name="targetSetor" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
                            ${providerOptions}
                        </select>
                    </div>

                    <div>
                         <label class="block text-sm font-medium text-slate-700 mb-2">Para (Meu Setor)</label>
                         <input type="text" value="${getRoleLabel(role)}" disabled class="w-full px-4 py-3 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 cursor-not-allowed">
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label class="block text-sm font-medium text-slate-700 mb-2">Código de Barras *</label>
                        <input type="text" name="barcodeRequest" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-slate-700 mb-2">Quantidade *</label>
                        <input type="number" name="qtdRequest" min="1" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
                    </div>
                </div>

                <div class="pt-4">
                    <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg transition-all active:scale-95">
                        Enviar Solicitação
                    </button>
                </div>
            </form>
        </div>
        
        <div class="mt-8 bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
             <h3 class="text-lg font-bold text-slate-900 mb-4">Minhas Solicitações Recentes</h3>
             ${renderMyRequestsTable()}
        </div>
    </div>`;
}

function renderMyRequestsTable() {
    // Filter requests made BY me (or my sector)
    const myRole = state.currentUser.role;
    let mySetor = '';

    // Determine my sector mapping
    if (myRole.includes('OPME')) mySetor = 'OPME';
    else if (myRole.includes('HEMODINAMICA')) mySetor = 'HEMODINAMICA';
    else if (myRole.includes('OPME')) mySetor = 'OPME';

    // If admin, show everything? Or nothing? Let's assume Admin acts as OPME for now or empty
    if (myRole === 'ADMIN') mySetor = 'OPME'; // Default for admin test

    const myRequests = MOCK_DATA.REQUESTS.filter(req => req.toSetor === mySetor).sort((a, b) => new Date(b.date) - new Date(a.date));

    if (myRequests.length === 0) {
        return '<p class="text-slate-500 text-sm">Nenhuma solicitação realizada.</p>';
    }

    return `
    <div class="overflow-x-auto">
        <table class="w-full text-sm text-left">
            <thead class="bg-slate-50 text-slate-500 font-bold">
                <tr>
                    <th class="px-4 py-3 rounded-l-lg">Data</th>
                    <th class="px-4 py-3">Item</th>
                    <th class="px-4 py-3">Origem</th>
                    <th class="px-4 py-3">Qtd</th>
                    <th class="px-4 py-3 rounded-r-lg">Status</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
                ${myRequests.slice(0, 5).map(req => `
                <tr>
                    <td class="px-4 py-3">${new Date(req.date).toLocaleDateString()}</td>
                    <td class="px-4 py-3 font-medium text-slate-900">${req.barcode}</td>
                    <td class="px-4 py-3">${req.fromSetor}</td>
                    <td class="px-4 py-3">${req.quantity}</td>
                    <td class="px-4 py-3">
                        <span class="px-2 py-1 rounded-full text-xs font-bold ${req.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' :
            req.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
                'bg-yellow-100 text-yellow-700'
        }">
                            ${req.status === 'APPROVED' ? 'Aprovado' : req.status === 'REJECTED' ? 'Rejeitado' : 'Pendente'}
                        </span>
                    </td>
                </tr>
                `).join('')}
            </tbody>
        </table>
    </div>
    `;
}

