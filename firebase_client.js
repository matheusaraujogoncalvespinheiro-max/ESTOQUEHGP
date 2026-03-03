// ==========================================
// FIREBASE CLIENT SETUP - SISHGP
// ==========================================

const firebaseConfig = {
    apiKey: "AIzaSyB5wzFyr5GVDF5IWjZSBdk3lhqFen-_9eg",
    authDomain: "opme-389fb.firebaseapp.com",
    projectId: "opme-389fb",
    storageBucket: "opme-389fb.firebasestorage.app",
    messagingSenderId: "640694822403",
    appId: "1:640694822403:web:b755ec063a2716d8f85036",
    measurementId: "G-PW14E4S0ZY"
};

let db = null;
let subscriptions = [];

async function initFirebase() {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    db = firebase.firestore();
    console.log('Firebase Client Initialized');

    // Initial Sync
    await db_syncAll();

    // Setup Real-time Subscriptions
    db_setupSubscriptions();
}

// ==========================================
// REAL-TIME SUBSCRIPTIONS
// ==========================================

function db_setupSubscriptions() {
    if (!db) return;

    // Unsubscribe from any existing listeners to avoid duplicates
    subscriptions.forEach(unsub => unsub());
    subscriptions = [];

    const tables = [
        { name: 'patients', sync: db_syncPatients },
        { name: 'products', sync: db_syncProducts },
        { name: 'product_batches', sync: db_syncProducts },
        { name: 'laudos', sync: db_syncLaudos },
        { name: 'mapa_schedule', sync: db_syncMapa },
        { name: 'notifications', sync: db_syncNotifications },
        { name: 'app_users', sync: db_syncMembers },
        { name: 'material_requests', sync: db_syncRequests },
        { name: 'procedimentos_nao_realizados', sync: db_syncNotPerformed }
    ];

    tables.forEach(table => {
        const unsub = db.collection(table.name).onSnapshot(async (snapshot) => {
            console.log(`Change detected on ${table.name}`);

            // Re-sync specific table data
            if (table.sync) await table.sync();

            // Re-render UI
            if (typeof render === 'function') render();
        }, (error) => {
            console.error(`Error listening to ${table.name}:`, error);
        });
        subscriptions.push(unsub);
    });
}

// ==========================================
// DATA ABSTRACTION LAYER (DAL)
// ==========================================

// Helper to convert Firestore snapshot to array
function snapshotToArray(snapshot) {
    if (snapshot.empty) return [];
    return snapshot.docs.map(doc => {
        const data = doc.data();
        // Add id if not present, useful for relations
        if (!data.id) data.id = doc.id;
        return data;
    });
}

// 1. Sync Patients
async function db_syncPatients() {
    if (!db) return;
    try {
        const snapshot = await db.collection('patients').get();
        const data = snapshotToArray(snapshot);

        MOCK_DATA.PACIENTES = data.filter(p => p.status === 'INTERNADO');
        MOCK_DATA.PATIENTS_HISTORY = data.filter(p => p.status === 'ALTA');
    } catch (err) {
        console.error('Error syncing patients:', err);
    }
}

// 2. Sync Products and Batches
async function db_syncProducts() {
    if (!db) return;
    try {
        // Fetch products
        const productsSnap = await db.collection('products').get();
        const products = snapshotToArray(productsSnap);

        // Fetch batches
        const batchesSnap = await db.collection('product_batches').get();
        const batches = snapshotToArray(batchesSnap);

        // Reset local data sectors
        MOCK_DATA.OPME = [];
        MOCK_DATA.OPME_ADM = [];
        MOCK_DATA.OPME = [];

        products.forEach(p => {
            const productBatches = batches.filter(b => b.product_id === p.id);
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

            if (p.sector && MOCK_DATA[p.sector]) {
                MOCK_DATA[p.sector].push(appProduct);
            }
        });
    } catch (err) {
        console.error('Error syncing products:', err);
    }
}

async function db_syncLaudos() {
    if (!db) return;
    try {
        // If there's local data structure for laudos, populate it here.
        // The original code didn't do anything in db_syncLaudos explicitly,
        // but it was called in some places.
    } catch (err) {
        console.error('Error syncing laudos:', err);
    }
}


// Save Laudo
async function db_saveLaudo(laudo) {
    if (!db) return;
    try {
        await db.collection('laudos').add({
            patient_name: laudo.patientName || "",
            patient_id: laudo.patientId || "",
            cartao_sus: laudo.cartaoSus || "",
            tipo_laudo: laudo.tipoLaudo || "",
            outro_laudo: laudo.outroLaudo || "",
            procedimento: laudo.procedimento || laudo.examType || "",
            observacoes: laudo.observacoes || laudo.notes || "",
            data_laudo: laudo.date || "",
            hora_laudo: laudo.time || "",
            setor: laudo.setor || "",
            usuario_responsavel: laudo.usuario_responsavel || "",
            itens_opme: laudo.itensOPME || [],
            baixas_realizadas: laudo.baixas_realizadas || []
        });
    } catch (err) {
        console.error('Error saving laudo:', err);
    }
}

// Save Product
async function db_saveProduct(product, sector) {
    if (!db) return null;
    try {
        // Unique key for upsert: barcode + sector
        const docId = `${product.barcode}_${sector}`;
        const prodData = {
            id: docId,
            barcode: product.barcode,
            material: product.material || "",
            descricao: product.descricao || "",
            empresa: product.empresa || "",
            marca: product.marca || "",
            min_quantity: product.min || 0,
            sector: sector
        };

        await db.collection('products').doc(docId).set(prodData, { merge: true });
        return prodData;
    } catch (err) {
        console.error('Error saving product:', err);
        return null;
    }
}

// Save Batch
async function db_saveBatch(productId, batch) {
    if (!db) return;
    try {
        const loteCode = batch.lote || batch.lote_code;
        const docId = `${productId}_${loteCode}`;

        await db.collection('product_batches').doc(docId).set({
            id: docId,
            product_id: productId,
            lote_code: loteCode,
            validade: batch.validade,
            quantity: batch.quantidade || batch.quantity || 0,
            data_entrada: batch.data_entrada || new Date().toISOString().split('T')[0]
        }, { merge: true });
    } catch (err) {
        console.error('Error saving batch:', err);
    }
}

// 4. Sync Mapa
async function db_syncMapa() {
    if (!db) return;
    try {
        const snapshot = await db.collection('mapa_schedule').orderBy('date', 'asc').get();
        MOCK_DATA.MAPA_SCHEDULE = snapshotToArray(snapshot);
    } catch (err) {
        console.error('Error syncing mapa:', err);
    }
}

// 5. Sync Notifications
async function db_syncNotifications() {
    if (!db) return;
    try {
        // Sort in memory to avoid needing complex indexes setup immediately
        const snapshot = await db.collection('notifications').get();
        let data = snapshotToArray(snapshot);
        data.sort((a, b) => {
            const dA = new Date(a.created_at || 0).getTime();
            const dB = new Date(b.created_at || 0).getTime();
            return dB - dA; // descending
        });
        MOCK_DATA.NOTIFICATIONS = data;
    } catch (err) {
        console.error('Error syncing notifications:', err);
    }
}

// 6. Sync History
async function db_syncHistory() {
    if (!db) return;
    try {
        const entrySnap = await db.collection('product_entry_history').get();
        let entryData = snapshotToArray(entrySnap);
        entryData.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

        const transferSnap = await db.collection('stock_transfer_history').get();
        let transferData = snapshotToArray(transferSnap);
        transferData.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

        MOCK_DATA.PRODUCT_HISTORY = entryData;
        MOCK_DATA.TRANSFER_HISTORY = transferData;
    } catch (err) {
        console.error('Error syncing history:', err);
    }
}

// 7. Sync Members (Users)
async function db_syncMembers() {
    if (!db) return;
    try {
        const snapshot = await db.collection('app_users').get();
        const data = snapshotToArray(snapshot);

        data.forEach(user => {
            if (user.username) {
                USERS_DB[user.username] = {
                    password: user.password,
                    role: user.role,
                    name: user.name
                };
            }
        });
    } catch (err) {
        console.error('Error syncing members:', err);
    }
}

// 8. Sync Requests
async function db_syncRequests() {
    if (!db) return;
    try {
        const snapshot = await db.collection('material_requests').get();
        let data = snapshotToArray(snapshot);
        // Simple client side sort descending
        data.sort((a, b) => new Date(b.data || 0) - new Date(a.data || 0));

        MOCK_DATA.REQUESTS = data.map(req => ({
            id: req.id,
            date: req.data,
            fromSetor: req.origem,
            toSetor: req.destino,
            barcode: req.barcode || (req.itens && req.itens[0]?.barcode),
            quantity: req.quantity || (req.itens && req.itens[0]?.quantity),
            status: req.status,
            requester: req.solicitante
        }));
    } catch (err) {
        console.error('Error syncing requests:', err);
    }
}

// 9. Sync Procedimentos Não Realizados
async function db_syncNotPerformed() {
    if (!db) return;
    try {
        const snapshot = await db.collection('procedimentos_nao_realizados').get();
        let data = snapshotToArray(snapshot);
        data.sort((a, b) => new Date(b.data || 0) - new Date(a.data || 0));

        MOCK_DATA.PROCEDIMENTOS_NAO_REALIZADOS = data.map(item => ({
            id: item.id,
            data: item.data,
            cartao_sus: item.cartao_sus,
            procedimento: item.procedimento,
            nome_paciente: item.nome_paciente,
            exame_pretendido: item.exame_pretendido,
            motivo: item.motivo,
            enfermeiro_responsavel: item.enfermeiro_responsavel
        }));
    } catch (err) {
        console.error('Error syncing not performed procedures:', err);
    }
}

// --- SAVE FUNCTIONS ---

// Save Patient
async function db_savePatient(patient) {
    if (!db) return;
    try {
        if (!patient.cartao_sus) throw new Error("cartao_sus is required");
        const docId = patient.cartao_sus.toString();

        await db.collection('patients').doc(docId).set({
            nome: patient.nome || "",
            cartao_sus: patient.cartao_sus,
            data_nascimento: patient.data_nascimento || null,
            sexo: patient.sexo || "",
            data_entrada: patient.data_entrada || null,
            hora_admitido: patient.hora_admitido || null,
            origem: patient.origem || "",
            destino: patient.destino || "",
            leito: patient.leito || "",
            procedimento: patient.procedimento || "",
            exame_realizado: patient.exame_realizado || "",
            outro_exame: patient.outro_exame || "",
            medico: patient.medico || "",
            enfermeiro_admissao: patient.enfermeiro_admissao || "",
            tecnico_enfermagem: patient.tecnico_enfermagem || "",
            status: patient.status || 'INTERNADO',
            data_alta: patient.data_alta || null,
            usuario_alta: patient.usuario_alta || ""
        }, { merge: true });
    } catch (err) {
        console.error('Error saving patient:', err);
    }
}

// Save Schedule
async function db_saveSchedule(item) {
    if (!db) return;
    try {
        if (item.id) { // If it already has an ID, update it
            await db.collection('mapa_schedule').doc(item.id).set({
                date: item.date,
                time: item.time,
                patient_name: item.patientName,
                cartao_sus: item.cartaoSus,
                origin: item.origin,
                is_pediatric: item.isPediatric,
                procedure: item.procedure,
                doctor: item.doctor,
                status: item.status
            }, { merge: true });
        } else { // Create new document
            await db.collection('mapa_schedule').add({
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
        }
    } catch (err) {
        console.error('Error saving schedule:', err);
    }
}

// Save History (Entry)
async function db_saveProductHistory(item) {
    if (!db) return;
    try {
        await db.collection('product_entry_history').add({
            date: item.date,
            time: item.time,
            user_name: item.user,
            action: item.action,
            sector: item.sector,
            barcode: item.barcode,
            product_desc: item.product,
            quantity: item.qty,
            batch_code: item.lote,
            created_at: new Date().toISOString()
        });
    } catch (err) {
        console.error('Error saving entry history:', err);
    }
}

// Save History (Transfer)
async function db_saveTransferHistory(item) {
    if (!db) return;
    try {
        await db.collection('stock_transfer_history').add({
            date: item.date,
            time: item.time,
            user_name: item.user_name,
            user_username: item.user_username,
            material: item.material,
            barcode: item.barcode,
            quantity: item.quantity,
            origin_sector: item.origin,
            destination_sector: item.destination,
            batches_info: item.batches,
            created_at: new Date().toISOString()
        });
    } catch (err) {
        console.error('Error saving transfer history:', err);
    }
}

// Save Notification
async function db_saveNotification(notif) {
    if (!db) return;
    try {
        await db.collection('notifications').add({
            type: notif.type,
            message: notif.message,
            barcode: notif.barcode,
            is_read: notif.isRead,
            created_at: new Date().toISOString()
        });
    } catch (err) {
        console.error('Error saving notification:', err);
    }
}

// Save/Update Member
async function db_saveMember(username, user) {
    if (!db) return;
    try {
        await db.collection('app_users').doc(username).set({
            username: username,
            password: user.password,
            role: user.role,
            name: user.name
        }, { merge: true });
    } catch (err) {
        console.error('Error saving member:', err);
    }
}

// Delete Schedule
async function db_deleteSchedule(id) {
    if (!db) return;
    try {
        await db.collection('mapa_schedule').doc(id).delete();
    } catch (err) {
        console.error('Error deleting schedule:', err);
    }
}

// Save Request
async function db_saveNotPerformed(item) {
    if (!db) return;
    try {
        const id = item.app_id || item.id;
        const dataPayload = {
            data: item.data,
            cartao_sus: item.cartao_sus,
            procedimento: item.procedimento,
            nome_paciente: item.nome_paciente,
            exame_pretendido: item.exame_pretendido,
            motivo: item.motivo,
            enfermeiro_responsavel: item.enfermeiro_responsavel
        };

        if (id) {
            await db.collection('procedimentos_nao_realizados').doc(id).set(dataPayload, { merge: true });
        } else {
            await db.collection('procedimentos_nao_realizados').add(dataPayload);
        }
    } catch (err) {
        console.error('Error saving not performed procedure:', err);
    }
}

// Save Request (Material)
async function db_saveRequest(req) {
    if (!db) return;
    try {
        const id = req.app_id || req.id;
        const dataPayload = {
            data: req.date,
            solicitante: req.requester,
            origem: req.fromSetor,
            destino: req.toSetor,
            status: req.status,
            barcode: req.barcode,
            quantity: req.quantity,
            itens: [{ barcode: req.barcode, quantity: req.quantity }]
        };

        if (id) {
            await db.collection('material_requests').doc(id).set(dataPayload, { merge: true });
        } else {
            await db.collection('material_requests').add(dataPayload);
        }
    } catch (err) {
        console.error('Error saving request:', err);
    }
}

// Delete Member
async function db_deleteMember(username) {
    if (!db) return;
    try {
        await db.collection('app_users').doc(username).delete();
    } catch (err) {
        console.error('Error deleting member:', err);
    }
}

// Global Sync
async function db_syncAll() {
    if (!db) return;
    await Promise.all([
        db_syncPatients(),
        db_syncProducts(),
        db_syncLaudos(),
        db_syncMapa(),
        db_syncNotifications(),
        db_syncHistory(),
        db_syncMembers(),
        db_syncRequests(),
        db_syncNotPerformed()
    ]);
    if (typeof render === 'function') render();
}

// Initializer
document.addEventListener('DOMContentLoaded', () => {
    initFirebase();
});
