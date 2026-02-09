
// ==========================================
// SUPABASE CLIENT SETUP
// ==========================================

// NOTE: You must add the Supabase JS SDK to your index.html first:
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

const SUPABASE_URL = 'YOUR_SUPABASE_URL_HERE';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY_HERE';

let supabase = null;

function initSupabase() {
    // When using CDN, createClient is usually inside the 'supabase' object
    const clientCreator = window.supabase ? window.supabase.createClient : (typeof createClient !== 'undefined' ? createClient : null);

    if (!clientCreator) {
        console.warn('Supabase SDK not loaded. Check index.html');
        return;
    }

    if (SUPABASE_URL === 'YOUR_SUPABASE_URL_HERE') {
        console.warn('Supabase URL/Key not configured in supabase_client.js');
        return;
    }

    supabase = clientCreator(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('Supabase Client Initialized');
}

// Data Abstraction Layer (DAL) - Preparation
// These functions will eventually replace the direct MOCK_DATA manipulations

// Data Abstraction Layer (DAL)
// Mapping Frontend model to DB model

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

async function db_savePatient(patient) {
    if (!supabase) return;
    const dbPatient = {
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
        status: patient.status || 'INTERNADO'
    };
    const { error } = await supabase.from('patients').upsert([dbPatient], { onConflict: 'cartao_sus' });
    if (error) console.error('Error saving patient:', error);
}

async function db_saveLaudo(laudo) {
    if (!supabase) return;
    const dbLaudo = {
        patient_name: laudo.paciente,
        sus_card: laudo.cartao_sus,
        procedure_date: laudo.data,
        procedure_time: laudo.hora,
        sector: laudo.setor,
        data: laudo // Storing the full object in JSONB for safety
    };
    const { error } = await supabase.from('laudos').insert([dbLaudo]);
    if (error) console.error('Error saving laudo:', error);
}

async function db_syncAll() {
    await Promise.all([
        db_syncPatients(),
        db_syncLaudos()
    ]);
    render(); // Re-render UI after sync
}

// Auto-init if SDK is present
document.addEventListener('DOMContentLoaded', () => {
    // Explicitly check for SDK presence
    if (window.supabase || typeof createClient !== 'undefined') {
        initSupabase();
    }
});
