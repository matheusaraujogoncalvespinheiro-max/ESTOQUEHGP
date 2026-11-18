// Auditoria e utilitários de gravação compartilhados pela Recepção, Emergência e Gestão das Triagens.

/** Remove valores undefined (o Firestore não aceita) copiando o objeto. */
const cleanForDb = (obj) => JSON.parse(JSON.stringify(obj ?? null));

/**
 * Registra uma alteração: quem, quando, o quê, valores antes/depois e o motivo.
 * entidade: paciente | atendimento | ocorrencia | funcionario | composicao | integrante
 */
async function auditar({ entidade, entidade_id, acao, antes = null, depois = null, motivo = '', competencia = null }) {
    const user = state.currentUser;
    return db_addAuditoria(cleanForDb({
        entidade,
        entidade_id: String(entidade_id),
        acao,
        antes,
        depois,
        motivo,
        competencia,
        usuario: user.username,
        usuario_nome: user.name,
        perfil: user.role,
        data_hora: new Date().toISOString()
    }));
}

/** Compara dois objetos e devolve só os campos que mudaram: { campos, antes, depois }. */
function diffCampos(antes, depois, campos) {
    const out = { campos: [], antes: {}, depois: {} };
    campos.forEach(campo => {
        const a = antes[campo] ?? '';
        const d = depois[campo] ?? '';
        if (String(a) !== String(d)) {
            out.campos.push(campo);
            out.antes[campo] = a;
            out.depois[campo] = d;
        }
    });
    return out;
}

const nowISO = () => new Date().toISOString();
const wordsCount = (text) => String(text ?? '').trim().split(/\s+/).filter(Boolean).length;

