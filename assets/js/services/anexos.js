// Anexos do prontuário (pendência #31): PDF e imagem (JPEG ou PNG) PEQUENOS, guardados no próprio Firestore (o plano gratuito não tem Storage).
//
// O QUE É: o profissional anexa um arquivo ao paciente (exame externo, laudo digitalizado, termo assinado). O conteúdo (base64) vai para `anexos_conteudo`
// (id = id do anexo) e o registro (quem, quando, tipo, tamanho, descrição) fica em `anexos_clinicos`. Os dois só são CRIADOS:
// não há substituição nem exclusão (um anexo enviado por engano é explicado em evolução, não apagado).
// O QUE NÃO É: não lê o conteúdo do arquivo, não faz antivírus nem OCR, não converte formato e não guarda versões. O limite é de 700 KB por arquivo (cabe no documento do Firestore).
// Para arquivos maiores seria preciso o Storage (plano pago): fica como evolução.

const ANEXO_LIMITE_BYTES = 700 * 1024;
const ANEXO_TIPOS = { 'application/pdf': 'PDF', 'image/jpeg': 'Imagem JPEG', 'image/png': 'Imagem PNG' };
const COL_ANEXOS = 'anexos_clinicos';
const COL_ANEXOS_CONTEUDO = 'anexos_conteudo';

/** Nome seguro para o caminho do arquivo (sem acento, espaço nem barra). */
function nomeSeguroAnexo(nome) {
    const base = String(nome || 'arquivo').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._]+/, '').slice(-80);
    return base || 'arquivo';
}

/** Valida arquivo e descrição (puro). Devolve { nome, tipo, tamanho, descricao }. */
function validarAnexo(arquivo, descricao = '') {
    if (!arquivo) throw new Error('Escolha o arquivo.');
    if (!Object.prototype.hasOwnProperty.call(ANEXO_TIPOS, arquivo.type)) throw new Error('Tipo de arquivo não aceito. Envie PDF, JPEG ou PNG.');
    if (!(arquivo.size > 0)) throw new Error('O arquivo está vazio.');
    if (arquivo.size > ANEXO_LIMITE_BYTES) throw new Error('O arquivo passa de 700 KB. Reduza ou comprima o arquivo (arquivos grandes exigem o Storage, de plano pago).');
    const d = String(descricao || '').trim();
    if (d.length < 3 || d.length > 120) throw new Error('Descrição: de 3 a 120 caracteres.');
    return { nome: nomeSeguroAnexo(arquivo.name), tipo: arquivo.type, tamanho: arquivo.size, descricao: d };
}

/** Lê o arquivo como texto base64 (sem o prefixo do data URL). */
function lerArquivoBase64(arquivo) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1] || '');
        r.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
        r.readAsDataURL(arquivo);
    });
}

/** Envia o arquivo: conteúdo em `anexos_conteudo` (base64) e o registro em `anexos_clinicos`. Se o registro falhar, o conteúdo fica órfão e sem acesso pela lista. */
async function enviarAnexo(pacienteId, arquivo, descricao) {
    requirePermission('prontuario_evoluir');
    if (!pacienteId) throw new Error('Abra o prontuário do paciente.');
    const v = validarAnexo(arquivo, descricao);
    const user = state.currentUser; const id = newId('anx'); const agora = nowISO();
    const base64 = await lerArquivoBase64(arquivo);
    try { await requireDb().collection(COL_ANEXOS_CONTEUDO).doc(id).set({ id, paciente_id: pacienteId, base64, tipo: v.tipo, autor: user.username, enviado_em: agora }); }
    catch (err) { throw new Error(`Não foi possível enviar o arquivo: ${(err && err.message) || err}`); }
    const reg = { id, paciente_id: pacienteId, nome: v.nome, tipo: v.tipo, tipo_rotulo: ANEXO_TIPOS[v.tipo], tamanho: v.tamanho, descricao: v.descricao, enviado_em: agora, enviado_por: user.username, enviado_por_nome: user.name, autor: user.username, armazenamento: 'firestore' };
    try { await requireDb().collection(COL_ANEXOS).doc(id).set(reg); }
    catch (err) { throw new Error(`O arquivo foi enviado, mas o registro não foi gravado (${(err && err.message) || err}). Avise o administrador antes de enviar de novo.`); }
    await auditar({ entidade: 'anexo', entidade_id: id, acao: 'ANEXAR', depois: { paciente_id: pacienteId, nome: v.nome, tamanho: v.tamanho } });
    return reg;
}

/** Endereço (blob) para abrir o arquivo: lê o conteúdo sob demanda, só de quem tem acesso ao prontuário. */
async function urlDoAnexo(anexo) {
    const snap = await requireDb().collection(COL_ANEXOS_CONTEUDO).doc(anexo.id).get();
    if (!snap.exists) throw new Error('O conteúdo deste anexo não foi encontrado.');
    const d = snap.data();
    const bin = atob(d.base64); const bytes = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
    return URL.createObjectURL(new Blob([bytes], { type: d.tipo || anexo.tipo }));
}

MOCK_DATA.ANEXOS_CLINICOS = { paciente_id: null, items: [] };
/** Anexos de UM paciente (troca a escuta quando o prontuário aberto muda). */
function db_watchAnexos(pacienteId) {
    if (MOCK_DATA.ANEXOS_CLINICOS.paciente_id !== pacienteId) {
        MOCK_DATA.ANEXOS_CLINICOS = { paciente_id: pacienteId, items: [] };
        if (watchers.anexos) { watchers.anexos(); delete watchers.anexos; }
    }
    watchersWanted.add('anexos');
    if (watchers.anexos || typeof db === 'undefined' || !db || !pacienteId) return;
    watchers.anexos = onSnapshotData(db.collection(COL_ANEXOS).where('paciente_id', '==', pacienteId), (items) => { MOCK_DATA.ANEXOS_CLINICOS = { paciente_id: pacienteId, items }; });
}

if (typeof module !== 'undefined' && module.exports) module.exports = { validarAnexo, nomeSeguroAnexo, ANEXO_LIMITE_BYTES };
