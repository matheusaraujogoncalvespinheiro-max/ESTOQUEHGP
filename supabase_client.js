// ==========================================
// SUPABASE CLIENT SETUP - SISHGP
// ==========================================

const SUPABASE_URL = 'https://pzgpytackchnvwsymdaf.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_36duPanNlpnaZc16Wa4Xzg_gYyJ-0K7';

let supabase = null;

function initSupabase() {
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

// 3. Sync Laudos
async function db_syncLaudos() {
    if (!supabase) return;
    try {
        const { data, error } = await supabase.from('laudos').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        if (data) MOCK_DATA.LAUDOS = data;
    } catch (err) {
        console.error('Error syncing laudos:', err);
    }
}

// 4. Save Patient
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

// Global Sync
async function db_syncAll() {
    if (!supabase) return;
    await Promise.all([
        db_syncPatients(),
        db_syncProducts(),
        db_syncLaudos()
    ]);
    if (typeof render === 'function') render();
}

// Initializer
document.addEventListener('DOMContentLoaded', () => {
    initSupabase();
});
