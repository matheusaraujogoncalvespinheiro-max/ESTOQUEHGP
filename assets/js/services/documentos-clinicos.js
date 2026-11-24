// Documentos clínicos impressos (Etapa 4): receita, atestado, encaminhamento e declaração de comparecimento.
//
// O QUE É: o profissional digita o conteúdo, o sistema valida, numera e GUARDA o documento exatamente como foi emitido
// (coleção `documentos_clinicos`, só acrescenta: não há edição nem exclusão) e gera a folha para imprimir/PDF com o cabeçalho
// do hospital, os dados do paciente, o profissional e o campo de assinatura. Reimprimir não cria outro documento, mas
// fica registrado na auditoria.
//
// O QUE NÃO É: o sistema não sugere diagnóstico, medicamento, dose nem dias de afastamento: tudo vem de quem emite. A folha
// impressa vale com a assinatura e o carimbo do profissional; este módulo NÃO faz assinatura digital com certificado
// (ICP-Brasil) e NÃO cobre receitas de medicamentos controlados (receituário especial), que têm numeração e talonário próprios.

const COL_DOCUMENTOS = 'documentos_clinicos';

const TIPOS_DOCUMENTO = {
    RECEITA: { rotulo: 'Receita', permissao: 'documento_emitir', exige_conselho: true },
    ATESTADO: { rotulo: 'Atestado', permissao: 'documento_emitir', exige_conselho: true },
    ENCAMINHAMENTO: { rotulo: 'Encaminhamento', permissao: 'documento_emitir', exige_conselho: true },
    COMPARECIMENTO: { rotulo: 'Declaração de comparecimento', permissao: 'documento_comparecimento', exige_conselho: false }
};

// ============ Regras puras (testáveis) ============

const DATA_ISO_DOC = /^\d{4}-\d{2}-\d{2}$/;
const HORA_DOC = /^([01]\d|2[0-3]):[0-5]\d$/;
const dataValidaDoc = (v) => DATA_ISO_DOC.test(String(v || '')) && !Number.isNaN(Date.parse(`${v}T12:00:00`)) && new Date(`${v}T12:00:00`).toISOString().slice(0, 10) === v;
const dataDoc = (iso) => (dataValidaDoc(iso) ? String(iso).split('-').reverse().join('/') : String(iso || ''));

/** Valida o conteúdo digitado conforme o tipo e devolve só os campos do tipo, já limpos. `hoje`: AAAA-MM-DD. */
function validarDocumento(tipo, form, { hoje } = {}) {
    if (!TIPOS_DOCUMENTO[tipo]) throw new Error('Tipo de documento inválido.');
    const texto = (v, min, max, rotulo) => {
        const t = String(v || '').trim();
        if (t.length < min) throw new Error(min > 1 ? `${rotulo}: mínimo de ${min} caracteres.` : `${rotulo}: preencha o campo.`);
        if (t.length > max) throw new Error(`${rotulo}: no máximo ${max} caracteres.`);
        return t;
    };
    if (tipo === 'RECEITA') {
        const itens = validarItensPrescricao(form.itens);
        return { itens, orientacoes: texto(form.orientacoes, 0, 1000, 'Orientações') };
    }
    if (tipo === 'ATESTADO') {
        const dias = Number(form.dias);
        if (!Number.isInteger(dias) || dias < 1 || dias > 365) throw new Error('Informe os dias de afastamento (número inteiro de 1 a 365).');
        const inicio = String(form.inicio || '').trim();
        if (!dataValidaDoc(inicio)) throw new Error('Informe a data de início do afastamento.');
        const cid = String(form.cid || '').trim().toUpperCase();
        const autorizado = Boolean(form.cid_autorizado);
        if (cid) {
            if (!validarCid10(cid)) throw new Error('CID-10 em formato inválido (ex.: J11 ou J18.9).');
            if (!autorizado) throw new Error('O CID só pode constar no atestado com a autorização do paciente ou do responsável. Marque a autorização ou apague o CID.');
        }
        return { dias, inicio, observacao: texto(form.observacao, 0, 500, 'Observação'), cid: cid && autorizado ? cid : '', cid_autorizado: Boolean(cid && autorizado) };
    }
    if (tipo === 'ENCAMINHAMENTO') {
        const cid = String(form.cid || '').trim().toUpperCase();
        if (cid && !validarCid10(cid)) throw new Error('CID-10 em formato inválido (ex.: J11 ou J18.9).');
        return { destino: texto(form.destino, 3, 120, 'Encaminhar para (especialidade ou serviço)'), motivo: texto(form.motivo, 10, 2000, 'Motivo e resumo clínico'), cid };
    }
    // COMPARECIMENTO
    const data = String(form.data || '').trim();
    if (!dataValidaDoc(data)) throw new Error('Informe a data do comparecimento.');
    if (hoje && data > hoje) throw new Error('A data do comparecimento não pode ser futura.');
    if (!HORA_DOC.test(String(form.hora_chegada || ''))) throw new Error('Informe a hora de chegada (HH:MM).');
    if (!HORA_DOC.test(String(form.hora_saida || ''))) throw new Error('Informe a hora de saída (HH:MM).');
    if (form.hora_saida < form.hora_chegada) throw new Error('A hora de saída não pode ser anterior à de chegada.');
    const declarante = form.declarante === 'ACOMPANHANTE' ? 'ACOMPANHANTE' : 'PACIENTE';
    return {
        data, hora_chegada: form.hora_chegada, hora_saida: form.hora_saida, declarante,
        acompanhante_nome: declarante === 'ACOMPANHANTE' ? texto(form.acompanhante_nome, 3, 120, 'Nome do acompanhante') : '',
        finalidade: texto(form.finalidade, 3, 120, 'Finalidade')
    };
}

/** Texto do documento (título, itens e parágrafos) a partir do conteúdo validado. É guardado junto com o documento. */
function corpoDoDocumento(tipo, c, ctx) {
    const nome = (ctx.paciente && ctx.paciente.nome) || '';
    if (tipo === 'RECEITA') {
        return { titulo: 'RECEITA', itens: c.itens.map(textoDoItemPrescricao), paragrafos: c.orientacoes ? [`Orientações: ${c.orientacoes}`] : [] };
    }
    if (tipo === 'ATESTADO') {
        const quando = ctx.data_atendimento ? ` em ${dataDoc(ctx.data_atendimento)}` : '';
        const p = [`Atesto, para os devidos fins, que ${nome} foi atendido(a) nesta unidade${quando}, necessitando de afastamento de suas atividades por ${c.dias} dia(s), a contar de ${dataDoc(c.inicio)}.`];
        if (c.observacao) p.push(c.observacao);
        if (c.cid) p.push(`CID-10: ${c.cid} (informado com a autorização do paciente ou do responsável).`);
        return { titulo: 'ATESTADO', itens: [], paragrafos: p };
    }
    if (tipo === 'ENCAMINHAMENTO') {
        const p = [`Encaminho o(a) paciente ${nome} para: ${c.destino}.`, `Motivo e resumo clínico: ${c.motivo}`];
        if (c.cid) p.push(`CID-10: ${c.cid}`);
        return { titulo: 'ENCAMINHAMENTO', itens: [], paragrafos: p };
    }
    const periodo = `em ${dataDoc(c.data)}, das ${c.hora_chegada} às ${c.hora_saida}`;
    const p = c.declarante === 'ACOMPANHANTE'
        ? [`Declaro que ${c.acompanhante_nome}, acompanhante do(a) paciente ${nome}, esteve nesta unidade ${periodo}, para ${c.finalidade}.`]
        : [`Declaro que ${nome} compareceu a esta unidade ${periodo}, para ${c.finalidade}.`];
    return { titulo: 'DECLARAÇÃO DE COMPARECIMENTO', itens: [], paragrafos: p };
}

/** Monta o documento a guardar. `paciente` é o cadastro; guardamos só o necessário para a folha. */
function montarDocumento({ tipo, conteudo, paciente, atendimento = null, user, agora, numero, id, estabelecimento = {}, registro_conselho = '' }) {
    const dadosPaciente = { nome: paciente.nome || '', prontuario: paciente.prontuario || '', cns: paciente.cns || '', data_nascimento: paciente.data_nascimento || '' };
    const dataAtendimento = atendimento && atendimento.dia ? atendimento.dia : '';
    return {
        id, numero, tipo, tipo_rotulo: TIPOS_DOCUMENTO[tipo].rotulo,
        paciente_id: paciente.id, paciente_dados: dadosPaciente,
        atendimento_id: atendimento ? atendimento.id : '', atendimento_senha: atendimento ? atendimento.senha : '',
        conteudo, corpo: corpoDoDocumento(tipo, conteudo, { paciente: dadosPaciente, data_atendimento: dataAtendimento }),
        estabelecimento: { nome: estabelecimento.nome || '', cnes: estabelecimento.cnes || '' },
        emitido_em: agora, emitido_por: user.username, emitido_por_nome: user.name, perfil: user.role, registro_conselho: String(registro_conselho || '').trim()
    };
}

// ============ Gravação (Firestore) ============

/** Valida, numera e guarda o documento. Devolve o documento gravado. */
async function emitirDocumento(tipo, form, { paciente, atendimento = null } = {}) {
    const cfg = TIPOS_DOCUMENTO[tipo];
    if (!cfg) throw new Error('Tipo de documento inválido.');
    requirePermission(cfg.permissao);
    if (!paciente || !paciente.id) throw new Error('Selecione o paciente.');
    if (paciente.ativo === false) throw new Error('Este cadastro de paciente está inativo.');
    const conteudo = validarDocumento(tipo, form, { hoje: todayISO() });
    const registro = String(form.registro_conselho || '').trim();
    if (cfg.exige_conselho && registro.length < 3) throw new Error('Informe o seu registro no conselho profissional (ex.: CRM) para assinar o documento.');
    const agora = new Date().toISOString();
    const hospital = MOCK_DATA.CONFIG_HOSPITAL || {};
    const doc = montarDocumento({
        tipo, conteudo, paciente, atendimento, user: state.currentUser, agora, id: newId('doc'),
        numero: `DOC-${todayISO().replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        estabelecimento: { nome: hospital.nome || (typeof APP_INFO !== 'undefined' ? APP_INFO.hospital : ''), cnes: hospital.cnes || '' }, registro_conselho: registro
    });
    await setDocH(COL_DOCUMENTOS, doc);
    await auditar({ entidade: 'documento_clinico', entidade_id: doc.id, acao: 'EMITIR', depois: { numero: doc.numero, tipo, paciente: paciente.id, atendimento: doc.atendimento_id } });
    return doc;
}
