// ==========================================
// SUPABASE CLIENT SETUP - SISHGP
// ==========================================

const SUPABASE_URL = 'https://pzgpytackchnvwsymdaf.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_36duPanNlpnaZc16Wa4Xzg_gYyJ-0K7';

let supabase = null;

async function initSupabase() {
    const clientCreator = window.supabase ? window.supabase.createClient : (typeof createClient !== 'undefined' ? createClient : null);

    if (!clientCreator) {
        console.warn('Supabase SDK not loaded. Check index.html');
        return;
    }

    if (SUPABASE_URL === 'YOUR_SUPABASE_URL_HERE' || !SUPABASE_URL) {
        console.warn('Supabase URL/Key not configured in supabase_client.js');
        return;
    }

    supabase = clientCreator(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('Supabase Client Initialized');

    // Initial Sync
    await db_syncAll();

    // Setup Real-time Subscriptions
    db_setupSubscriptions();
}

// ==========================================
// REAL-TIME SUBSCRIPTIONS
// ==========================================

function db_setupSubscriptions() {
    if (!supabase) return;

    const tables = [
        'patients',
        'products',
        'product_batches',
        'laudos',
        'mapa_schedule',
        'notifications',
        'app_users'
    ];

    tables.forEach(table => {
        supabase
            .channel(`public:${table}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: table }, async (payload) => {
                console.log(`Change detected on ${table}:`, payload);

                // Refresh data based on table
                if (table === 'patients') await db_syncPatients();
                else if (table === 'products' || table === 'product_batches') await db_syncProducts();
                else if (table === 'laudos') await db_syncLaudos();
                else if (table === 'mapa_schedule') await db_syncMapa();
                else if (table === 'notifications') await db_syncNotifications();
                else if (table === 'app_users') await db_syncMembers();

                // Re-render UI
                if (typeof render === 'function') render();
            })
            .subscribe();
    });
}

// ==========================================
// DATA ABSTRACTION LAYER (DAL)
// ==========================================

// 1. Sync Patients
async function db_syncPatients() {
    if (!supabase) return;
    try {
        const { data, error } = await supabase.from('patients').select('*');
        if (error) throw error;
        if (data) {
            MOCK_DATA.PACIENTES = data.filter(p => p.status === 'INTERNADO');
            MOCK_DATA.PATIENTS_HISTORY = data.filter(p => p.status === 'ALTA');
        }
    } catch (err) {
        console.error('Error syncing patients:', err);
    }
}

// 2. Sync Products and Batches
async function db_syncProducts() {
    if (!supabase) return;
    try {
        // Fetch products
        const { data: products, error: prodError } = await supabase.from('products').select('*');
        if (prodError) throw prodError;

        // Fetch batches
        const { data: batches, error: batchError } = await supabase.from('product_batches').select('*');
        if (batchError) throw batchError;

        if (products) {
            // Reset local data sectors
            MOCK_DATA.HEMO = [];
            MOCK_DATA.HEMO_ADM = [];
            MOCK_DATA.OPME = [];

            products.forEach(p => {
                const productBatches = batches ? batches.filter(b => b.product_id === p.id) : [];
                const totalQty = productBatches.reduce((sum, b) => sum + b.quantity, 0);

                const appProduct = {
                    id: p.id,
                    barcode: p.barcode,
                    material: p.material,
                    descricao: p.descricao,
                    empresa: p.empresa,
                    marca: p.marca,
                    min: p.min_quantity,
                    qtd: totalQty,
                    lotes: productBatches.map(b => ({
                        id: b.id,
                        lote: b.lote_code,
                        validade: b.validade,
                        quantidade: b.quantity,
                        data_entrada: b.data_entrada
                    }))
                };

                // Add main lote/validade info from the first batch
                if (appProduct.lotes.length > 0) {
                    appProduct.lote = appProduct.lotes[0].lote;
                    appProduct.validade = appProduct.lotes[0].validade;
                }

                if (MOCK_DATA[p.sector]) MOCK_DATA[p.sector].push(appProduct);
            });
        }
    } catch (err) {
        console.error('Error syncing products:', err);
    }
}

// Save Laudo
async function db_saveLaudo(laudo) {
    if (!supabase) return;
    try {
        const { error } = await supabase.from('laudos').insert({
            patient_name: laudo.patientName,
            patient_id: laudo.patientId,
            cartao_sus: laudo.cartaoSus,
            tipo_laudo: laudo.tipoLaudo,
            outro_laudo: laudo.outroLaudo,
            procedimento: laudo.procedimento || laudo.examType,
            observacoes: laudo.observacoes || laudo.notes,
            data_laudo: laudo.date,
            hora_laudo: laudo.time,
            setor: laudo.setor,
            usuario_responsavel: laudo.usuario_responsavel,
            itens_opme: laudo.itensOPME || [],
            baixas_realizadas: laudo.baixas_realizadas || []
        });
        if (error) throw error;
    } catch (err) {
        console.error('Error saving laudo:', err);
    }
}

// Save Product
async function db_saveProduct(product, sector) {
    if (!supabase) return null;
    try {
        const { data, error } = await supabase.from('products').upsert({
            barcode: product.barcode,
            material: product.material,
            descricao: product.descricao,
            empresa: product.empresa,
            marca: product.marca,
            min_quantity: product.min,
            sector: sector
        }, { onConflict: 'barcode, sector' }).select();

        if (error) throw error;
        return data ? data[0] : null;
    } catch (err) {
        console.error('Error saving product:', err);
        return null;
    }
}

// Save Batch
async function db_saveBatch(productId, batch) {
    if (!supabase) return;
    try {
        const { error } = await supabase.from('product_batches').upsert({
            product_id: productId,
            lote_code: batch.lote || batch.lote_code,
            validade: batch.validade,
            quantity: batch.quantidade || batch.quantity,
            data_entrada: batch.data_entrada || new Date().toISOString().split('T')[0]
        }, { onConflict: 'product_id, lote_code' });

        if (error) throw error;
    } catch (err) {
        console.error('Error saving batch:', err);
    }
}

// 4. Sync Mapa
async function db_syncMapa() {
    if (!supabase) return;
    try {
        const { data, error } = await supabase.from('mapa_schedule').select('*').order('date', { ascending: true });
        if (error) throw error;
        if (data) MOCK_DATA.MAPA_SCHEDULE = data;
    } catch (err) {
        console.error('Error syncing mapa:', err);
    }
}

// 5. Sync Notifications
async function db_syncNotifications() {
    if (!supabase) return;
    try {
        const { data, error } = await supabase.from('notifications').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        if (data) MOCK_DATA.NOTIFICATIONS = data;
    } catch (err) {
        console.error('Error syncing notifications:', err);
    }
}

// 6. Sync History
async function db_syncHistory() {
    if (!supabase) return;
    try {
        const { data: entryData, error: entryError } = await supabase.from('product_entry_history').select('*').order('created_at', { ascending: false });
        const { data: transferData, error: transferError } = await supabase.from('stock_transfer_history').select('*').order('created_at', { ascending: false });

        if (entryError) throw entryError;
        if (transferError) throw transferError;

        if (entryData) MOCK_DATA.PRODUCT_HISTORY = entryData;
        if (transferData) MOCK_DATA.TRANSFER_HISTORY = transferData;
    } catch (err) {
        console.error('Error syncing history:', err);
    }
}

// 7. Sync Members (Users)
async function db_syncMembers() {
    if (!supabase) return;
    try {
        const { data, error } = await supabase.from('app_users').select('*');
        if (error) throw error;
        if (data) {
            data.forEach(user => {
                USERS_DB[user.username] = {
                    password: user.password,
                    role: user.role,
                    name: user.name
                };
            });
        }
    } catch (err) {
        console.error('Error syncing members:', err);
    }
}

// --- SAVE FUNCTIONS ---

// Save Patient
async function db_savePatient(patient) {
    if (!supabase) return;
    try {
        const { error } = await supabase.from('patients').upsert({
            nome: patient.nome,
            cartao_sus: patient.cartao_sus,
            data_nascimento: patient.data_nascimento,
            sexo: patient.sexo,
            data_entrada: patient.data_entrada,
            hora_admitido: patient.hora_admitido,
            origem: patient.origem,
            destino: patient.destino,
            leito: patient.leito,
            procedimento: patient.procedimento,
            exame_realizado: patient.exame_realizado,
            outro_exame: patient.outro_exame,
            medico: patient.medico,
            enfermeiro_admissao: patient.enfermeiro_admissao,
            tecnico_enfermagem: patient.tecnico_enfermagem,
            status: patient.status || 'INTERNADO',
            data_alta: patient.data_alta,
            usuario_alta: patient.usuario_alta
        }, { onConflict: 'cartao_sus' });
        if (error) throw error;
    } catch (err) {
        console.error('Error saving patient:', err);
    }
}

// Save Schedule
async function db_saveSchedule(item) {
    if (!supabase) return;
    try {
        const { error } = await supabase.from('mapa_schedule').upsert({
            date: item.date,
            time: item.time,
            patient_name: item.patientName,
            cartao_sus: item.cartaoSus,
            origin: item.origin,
            is_pediatric: item.isPediatric,
            procedure: item.procedure,
            doctor: item.doctor,
            status: item.status
        });
        if (error) throw error;
    } catch (err) {
        console.error('Error saving schedule:', err);
    }
}

// Save History (Entry)
async function db_saveProductHistory(item) {
    if (!supabase) return;
    try {
        const { error } = await supabase.from('product_entry_history').insert({
            date: item.date,
            time: item.time,
            user_name: item.user,
            action: item.action,
            sector: item.sector,
            barcode: item.barcode,
            product_desc: item.product,
            quantity: item.qty,
            batch_code: item.lote
        });
        if (error) throw error;
    } catch (err) {
        console.error('Error saving entry history:', err);
    }
}

// Save History (Transfer)
async function db_saveTransferHistory(item) {
    if (!supabase) return;
    try {
        const { error } = await supabase.from('stock_transfer_history').insert({
            date: item.date,
            time: item.time,
            user_name: item.user_name,
            user_username: item.user_username,
            material: item.material,
            barcode: item.barcode,
            quantity: item.quantity,
            origin_sector: item.origin,
            destination_sector: item.destination,
            batches_info: item.batches
        });
        if (error) throw error;
    } catch (err) {
        console.error('Error saving transfer history:', err);
    }
}

// Save Notification
async function db_saveNotification(notif) {
    if (!supabase) return;
    try {
        const { error } = await supabase.from('notifications').insert({
            type: notif.type,
            message: notif.message,
            barcode: notif.barcode,
            is_read: notif.isRead
        });
        if (error) throw error;
    } catch (err) {
        console.error('Error saving notification:', err);
    }
}

// Save/Update Member
async function db_saveMember(username, user) {
    if (!supabase) return;
    try {
        const { error } = await supabase.from('app_users').upsert({
            username: username,
            password: user.password,
            role: user.role,
            name: user.name
        }, { onConflict: 'username' });
        if (error) throw error;
    } catch (err) {
        console.error('Error saving member:', err);
    }
}

// Delete Schedule
async function db_deleteSchedule(id) {
    if (!supabase) return;
    try {
        const { error } = await supabase.from('mapa_schedule').delete().eq('id', id);
        if (error) throw error;
    } catch (err) {
        console.error('Error deleting schedule:', err);
    }
}

// Delete Member
async function db_deleteMember(username) {
    if (!supabase) return;
    try {
        const { error } = await supabase.from('app_users').delete().eq('username', username);
        if (error) throw error;
    } catch (err) {
        console.error('Error deleting member:', err);
    }
}

// Global Sync
async function db_syncAll() {
    if (!supabase) return;
    await Promise.all([
        db_syncPatients(),
        db_syncProducts(),
        db_syncLaudos(),
        db_syncMapa(),
        db_syncNotifications(),
        db_syncHistory(),
        db_syncMembers()
    ]);
    if (typeof render === 'function') render();
}

// Initializer
document.addEventListener('DOMContentLoaded', () => {
    initSupabase();
});
