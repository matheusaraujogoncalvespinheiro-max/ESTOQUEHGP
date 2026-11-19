// Backup e restauração

// Backup e restauração

function renderBackupTools() {
    return `
    <div class="space-y-6" >
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 class="text-2xl font-bold text-slate-900 mb-6">Backup e Restauração</h2>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="text-center p-6 border-2 border-dashed border-slate-200 rounded-2xl hover:border-blue-500 transition-colors">
                    <i data-lucide="download" class="w-12 h-12 text-blue-500 mx-auto mb-4"></i>
                    <h3 class="font-bold text-slate-900 mb-2">Exportar Dados</h3>
                    <p class="text-slate-500 text-sm mb-4">Faça backup de todos os dados do sistema</p>
                    <button onclick="exportData()" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl transition-all">
                        Exportar Tudo
                    </button>
                </div>
                
                <div class="text-center p-6 border-2 border-dashed border-slate-200 rounded-2xl hover:border-emerald-500 transition-colors">
                    <i data-lucide="upload" class="w-12 h-12 text-emerald-500 mx-auto mb-4"></i>
                    <h3 class="font-bold text-slate-900 mb-2">Importar Dados</h3>
                    <p class="text-slate-500 text-sm mb-4">Restaurar dados de um backup anterior</p>
                    <label class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-6 rounded-xl transition-all cursor-pointer block">
                        <input type="file" accept=".json" onchange="importData(event)" class="hidden">
                        Importar Backup
                    </label>
                </div>
            </div>
            
            ${state.currentUser && state.currentUser.role === 'ADMIN' ? `
            <div class="mt-6 text-center p-6 border-2 border-dashed border-slate-200 rounded-2xl hover:border-indigo-500 transition-colors">
                <i data-lucide="database-backup" class="w-12 h-12 text-indigo-500 mx-auto mb-4"></i>
                <h3 class="font-bold text-slate-900 mb-2">Backup completo do banco (Firestore)</h3>
                <p class="text-slate-500 text-sm mb-4">Baixa todas as coleções do banco, inclusive prontuário, internações, exames e auditoria. Senhas e hashes ficam de fora. Guarde o arquivo em local seguro: ele contém dados pessoais e clínicos.</p>
                <button onclick="exportarBancoCompleto()" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-xl transition-all">Exportar banco completo</button>
            </div>` : ''}

            <div class="mt-8 p-4 bg-slate-50 rounded-xl">
                <div class="flex items-center gap-3">
                    <i data-lucide="info" class="w-5 h-5 text-blue-500"></i>
                    <div class="text-sm text-slate-600">
                        <p class="font-bold mb-1">Informações Importantes:</p>
                        <p>• Faça backup regularmente para não perder dados</p>
                        <p>• A importação substituirá todos os dados atuais</p>
                        <p>• Mantenha os arquivos de backup em local seguro</p>
                    </div>
                </div>
            </div>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 class="text-2xl font-bold text-slate-900 mb-6">Estatísticas do Sistema</h2>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div class="p-4 bg-slate-50 rounded-xl text-center">
                    <div class="text-2xl font-bold text-slate-900">${MOCK_DATA.OPME.length + MOCK_DATA.HEMODINAMICA.length + MOCK_DATA.OPME.length}</div>
                    <div class="text-sm text-slate-500">Produtos</div>
                </div>
                <div class="p-4 bg-slate-50 rounded-xl text-center">
                    <div class="text-2xl font-bold text-slate-900">${TRANSFER_HISTORY.length}</div>
                    <div class="text-sm text-slate-500">Transferências</div>
                </div>
                <div class="p-4 bg-slate-50 rounded-xl text-center">
                    <div class="text-2xl font-bold text-slate-900">${MOCK_DATA.PACIENTES.length}</div>
                    <div class="text-sm text-slate-500">Pacientes</div>
                </div>
                <div class="p-4 bg-slate-50 rounded-xl text-center">
                    <div class="text-2xl font-bold text-slate-900">${MOCK_DATA.LAUDOS.length}</div>
                    <div class="text-sm text-slate-500">Laudos</div>
                </div>
            </div>
        </div>
    </div> `;
}

// Todas as coleções usadas pelo sistema (o backup completo percorre esta lista; cad_<entidade> vem de CAD_DEFS)
const COLECOES_BACKUP = [
    'products', 'product_batches', 'product_entry_history', 'stock_transfer_history', 'material_requests', 'laudos', 'patients', 'mapa_schedule',
    'procedimentos_agendados', 'procedimentos_nao_realizados', 'salas', 'salas_history', 'notifications', 'portaria_visits', 'portaria_config', 'app_users',
    'pacientes', 'registros_recepcao', 'ocorrencias_emergencia', 'funcionarios', 'equipes_triagem', 'composicoes_mensais', 'integrantes_equipes', 'historico_alteracoes',
    'leitos_estado', 'prontuarios_abertos', 'internacoes', 'internacao_ativa', 'registros_clinicos', 'solicitacoes_exame', 'autorizacoes', 'agenda_vagas', 'config_hospital', 'demandas_transporte', 'farmacia_dispensacoes', 'cad_contadores'
];

/** Exporta o banco inteiro em JSON (somente leitura: nada é alterado). Campos de senha nunca saem. */
async function exportarBancoCompleto() {
    try {
        requirePermission('auditoria_ver');
        const database = requireDb();
        const colecoes = [...COLECOES_BACKUP, ...Object.keys(CAD_DEFS).filter(k => !CAD_DEFS[k].store).map(k => `cad_${k}`)];
        showMsg('Gerando backup... aguarde.');
        const dados = {};
        for (const nome of colecoes) {
            const snap = await database.collection(nome).get();
            dados[nome] = snap.docs.map(d => {
                const { password, password_hash, password_salt, password_iter, ...resto } = d.data();
                return { id: d.id, ...resto };
            });
        }
        const total = Object.values(dados).reduce((n, l) => n + l.length, 0);
        const arquivo = { gerado_em: new Date().toISOString(), gerado_por: state.currentUser.username, versao_sistema: APP_INFO.versao, colecoes: dados };
        const blob = new Blob([JSON.stringify(arquivo)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `backup-hgp-${todayISO()}.json`;
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        await auditar({ entidade: 'backup', entidade_id: todayISO(), acao: 'EXPORTAR', depois: { colecoes: colecoes.length, documentos: total } });
        showMsg(`Backup gerado: ${total} registros em ${colecoes.length} coleções.`);
    } catch (err) { showMsg(err.message || 'Não foi possível gerar o backup.', 'error'); }
}
window.exportarBancoCompleto = exportarBancoCompleto;
