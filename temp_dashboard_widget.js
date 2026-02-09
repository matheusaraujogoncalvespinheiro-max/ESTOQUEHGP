// PENDING REQUESTS WIDGET
// Show if there are requests targeting MY sector with status 'PENDING'
let pendingRequestsWidget = '';
const myRole = state.currentUser.role;
let mySetor = '';

// Who approves? The Provider (fromSetor).
// If I am CHEFE_HEMO, I approve requests where fromSetor = HEMO.
if (myRole === 'CHEFE_HEMO' || myRole === 'FUNC_HEMO') mySetor = 'HEMO';
else if (myRole === 'CHEFE_HEMO_ADM' || myRole === 'FUNC_HEMO_ADM') mySetor = 'HEMO_ADM';
else if (myRole === 'FUNC_OPME') mySetor = 'OPME';
else if (myRole === 'ADMIN') mySetor = 'HEMO'; // Admin sees HEMO requests? Or all? Let's say HEMO.

const pendingRequests = (MOCK_DATA.REQUESTS || []).filter(r => r.fromSetor === mySetor && r.status === 'PENDING');

if (pendingRequests.length > 0) {
    pendingRequestsWidget = `
        <div class="mb-8 bg-orange-50 border border-orange-200 rounded-2xl p-6">
            <div class="flex items-center gap-3 mb-4">
                <i data-lucide="alert-circle" class="w-6 h-6 text-orange-600"></i>
                <h3 class="text-lg font-bold text-orange-800">Solicitações Pendentes (${pendingRequests.length})</h3>
            </div>
            
            <div class="space-y-3">
                ${pendingRequests.map(req => `
                <div class="bg-white p-4 rounded-xl border border-orange-100 flex justify-between items-center shadow-sm">
                    <div>
                        <div class="font-bold text-slate-800">${req.barcode}</div>
                        <div class="text-sm text-slate-500">
                             Solicitado por: <span class="font-medium text-slate-700">${req.fromSetor === 'HEMO' ? 'Hemodinâmica' : req.fromSetor === 'HEMO_ADM' ? 'Hemo Adm.' : 'Centro Cirúrgico'} -> ${req.toSetor === 'HEMO' ? 'Hemodinâmica' : req.toSetor === 'HEMO_ADM' ? 'Hemo Adm.' : 'Centro Cirúrgico'}</span>
                             <!-- Wait, requester is toSetor. I should show who asked. -->
                             Solicitado por: <span class="font-medium text-slate-700">${req.toSetor === 'HEMO' ? 'Hemodinâmica' : req.toSetor === 'HEMO_ADM' ? 'Hemo Adm.' : 'Centro Cirúrgico'}</span>
                        </div>
                        <div class="text-sm text-slate-500">Quantidade: <span class="font-bold text-slate-900">${req.quantity}</span></div>
                        <div class="text-xs text-slate-400 mt-1">${new Date(req.date).toLocaleString()}</div>
                    </div>
                    <div class="flex items-center gap-2">
                        <button onclick="handleRequestResponse(${req.id}, 'APPROVE')" class="p-2 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors" title="Aprovar">
                            <i data-lucide="check" class="w-5 h-5"></i>
                        </button>
                        <button onclick="handleRequestResponse(${req.id}, 'REJECT')" class="p-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors" title="Rejeitar">
                            <i data-lucide="x" class="w-5 h-5"></i>
                        </button>
                    </div>
                </div>
                `).join('')}
            </div>
        </div>
        `;
}
