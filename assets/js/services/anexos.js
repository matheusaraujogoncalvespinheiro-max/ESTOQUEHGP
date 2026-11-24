// Anexos do prontuário (pendência #31): PDF e imagem (JPEG ou PNG) enviados ao Firebase Storage.
//
// O QUE É: o profissional anexa um arquivo ao paciente (exame externo, laudo digitalizado, termo assinado). O arquivo vai para o Storage em
// anexos/<paciente>/<id>_<nome> e o registro (quem, quando, tipo, tamanho, descrição) fica em `anexos_clinicos`. Os dois só são CRIADOS:
// não há substituição nem exclusão (um anexo enviado por engano é explicado em evolução, não apagado).
// O QUE NÃO É: não lê o conteúdo do arquivo, não faz antivírus nem OCR, não converte formato e não guarda versões. O limite é de 10 MB.
// Pré-requisito no Console do Firebase: ativar o Storage e publicar storage.rules (docs/firebase-conexao.md).

const ANEXO_LIMITE_BYTES = 10 * 1024 * 1024;
const ANEXO_TIPOS = { 'application/pdf': 'PDF', 'image/jpeg': 'Imagem JPEG', 'image/png': 'Imagem PNG' };
const COL_ANEXOS = 'anexos_clinicos';

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
    if (arquivo.size > ANEXO_LIMITE_BYTES) throw new Error('O arquivo passa de 10 MB.');
    const d = String(descricao || '').trim();
    if (d.length < 3 || d.length > 120) throw new Error('Descrição: de 3 a 120 caracteres.');
    return { nome: nomeSeguroAnexo(arquivo.name), tipo: arquivo.type, tamanho: arquivo.size, descricao: d };
}

/** Envia o arquivo ao Storage e grava o registro. Se o registro falhar, avisa que o arquivo já foi enviado. */
async function enviarAnexo(pacienteId, arquivo, descricao) {
    requirePermission('prontuario_evoluir');
    if (!pacienteId) throw new Error('Abra o prontuário do paciente.');
    const v = validarAnexo(arquivo, descricao);
    if (typeof firebase === 'undefined' || !firebase.storage) throw new Error('O Firebase Storage não está carregado. Recarregue a página.');
    const user = state.currentUser; const id = newId('anx'); const agora = nowISO();
    const caminho = `anexos/${pacienteId}/${id}_${v.nome}`;
    try {
        await firebase.storage().ref(caminho).put(arquivo, { contentType: v.tipo, customMetadata: { paciente_id: pacienteId, enviado_por: user.username } });
    } catch (err) {
        throw new Error(err && err.code === 'storage/unauthorized' ? 'O Storage recusou o envio. O Firebase Storage exige plano pago: no plano gratuito os anexos não funcionam. Se o plano já permite, confira se o Storage foi ativado e as regras publicadas.' : `Não foi possível enviar o arquivo: ${(err && err.message) || err}`);
    }
    const reg = { id, paciente_id: pacienteId, nome: v.nome, tipo: v.tipo, tipo_rotulo: ANEXO_TIPOS[v.tipo], tamanho: v.tamanho, descricao: v.descricao, caminho, enviado_em: agora, enviado_por: user.username, enviado_por_nome: user.name, autor: user.username };
    try { await requireDb().collection(COL_ANEXOS).doc(id).set(reg); }
    catch (err) { throw new Error(`O arquivo foi enviado, mas o registro não foi gravado (${(err && err.message) || err}). Avise o administrador antes de enviar de novo.`); }
    await auditar({ entidade: 'anexo', entidade_id: id, acao: 'ANEXAR', depois: { paciente_id: pacienteId, nome: v.nome, tamanho: v.tamanho } });
    return reg;
}

/** Endereço temporário para abrir o arquivo (exige estar logado e ter acesso pelas regras do Storage). */
const urlDoAnexo = (anexo) => firebase.storage().ref(anexo.caminho).getDownloadURL();

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
