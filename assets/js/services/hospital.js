// Regras da assistência hospitalar: leitos, internações, prontuário digital, solicitações de exame (Imagenologia), agenda, autorizações e transporte NIR.
// As telas só chamam estas funções (que validam permissão e regras); quem grava é services/db-hospital.js.

// ============ Leitos ============

const STATUS_LEITO = {
    LIVRE: { rotulo: 'Livre', cor: '#16a34a', fundo: '#dcfce7' },
    OCUPADO: { rotulo: 'Ocupado', cor: '#dc2626', fundo: '#fee2e2' },
    HIGIENIZACAO: { rotulo: 'Em higienização', cor: '#d97706', fundo: '#fef3c7' },
    BLOQUEADO: { rotulo: 'Bloqueado', cor: '#475569', fundo: '#e2e8f0' }
};
const rotuloStatusLeito = (s) => (STATUS_LEITO[s] || { rotulo: s || '—' }).rotulo;

const estadoLeito = (id) => (MOCK_DATA.LEITOS_ESTADO && MOCK_DATA.LEITOS_ESTADO[id]) || { id, status: 'LIVRE' };
const internacaoAtivaDoLeito = (leitoId) => (MOCK_DATA.INTERNACOES || []).find(i => i.status === 'ATIVA' && i.leito_id === leitoId) || null;
const internacaoAtivaDoPaciente = (pacienteId) => (MOCK_DATA.INTERNACOES || []).find(i => i.status === 'ATIVA' && i.paciente_id === pacienteId) || null;
const internacoesDoPaciente = (pacienteId) => (MOCK_DATA.INTERNACOES || []).filter(i => i.paciente_id === pacienteId).sort((a, b) => String(b.data_hora_internacao).localeCompare(String(a.data_hora_internacao)));

function indicadoresLeitos(leitos = estruturaHospital()) {
    const c = { total: leitos.length, LIVRE: 0, OCUPADO: 0, HIGIENIZACAO: 0, BLOQUEADO: 0 };
    leitos.forEach(l => { c[estadoLeito(l.id).status] = (c[estadoLeito(l.id).status] || 0) + 1; });
    c.taxa = c.total ? Math.round((c.OCUPADO / c.total) * 100) : 0;
    return c;
}

const agoraISO = () => new Date().toISOString();
const quem = () => ({
    por: (state.currentUser && state.currentUser.username) || 'sistema',
    por_nome: (state.currentUser && state.currentUser.name) || 'Sistema'
});

async function auditarLeito(leitoId, acao, antes, depois, motivo = '') {
    if (typeof auditar === 'function') await auditar({ entidade: 'leito', entidade_id: leitoId, acao, antes, depois, motivo });
}

/** Interna o paciente no leito. Valida leito livre e paciente sem internação ativa (de forma atômica no banco). */
async function internarPaciente({ paciente, leito_id, setor_origem }) {
    requirePermission('internacao_gerenciar');
    const leito = leitoPorId(leito_id);
    if (!leito) throw new Error('Leito inválido: escolha um leito da estrutura do hospital.');
    if (!paciente || !paciente.id) throw new Error('Selecione o paciente.');
    if (paciente.ativo === false) throw new Error('Este cadastro de paciente está inativo.');
    if (!String(setor_origem || '').trim()) throw new Error('Informe o setor de origem.');
    if (estadoLeito(leito.id).status !== 'LIVRE') throw new Error(`O leito ${leito.rotulo} não está livre (${rotuloStatusLeito(estadoLeito(leito.id).status)}).`);
    if (internacaoAtivaDoPaciente(paciente.id)) throw new Error('Este paciente já possui uma internação ativa.');

    const agora = agoraISO();
    const u = quem();
    const internacao = {
        id: newId('int'), paciente_id: paciente.id, paciente_nome: paciente.nome, prontuario: paciente.prontuario || '',
        leito_id: leito.id, andar: leito.andar, ala: leito.ala, quarto: leito.quarto,
        data_hora_internacao: agora, registrado_por: u.por, registrado_por_nome: u.por_nome, setor_origem: String(setor_origem).trim(),
        status: 'ATIVA', data_hora_alta: '', alta_por: ''
    };
    const leitoNovo = { id: leito.id, status: 'OCUPADO', internacao_id: internacao.id, paciente_id: paciente.id, desde: agora, atualizado_por: u.por, atualizado_por_nome: u.por_nome, motivo: '' };
    await db_internarAtomico({ internacao, leitoNovo });
    await auditarLeito(leito.id, 'OCUPAR', { status: 'LIVRE' }, { status: 'OCUPADO', internacao: internacao.id, prontuario: internacao.prontuario });
    if (typeof auditar === 'function') await auditar({ entidade: 'internacao', entidade_id: internacao.id, acao: 'CRIAR', depois: { paciente_id: paciente.id, leito: leito.rotulo, setor_origem: internacao.setor_origem } });
    return internacao;
}

/** Alta: encerra a internação e coloca o leito em higienização (nunca direto para livre). */
async function darAltaInternacao(internacaoId) {
    requirePermission('internacao_gerenciar');
    const atual = MOCK_DATA.INTERNACOES.find(i => i.id === internacaoId) || await getDocH(COLH.INTERNACOES, internacaoId);
    if (!atual || atual.status !== 'ATIVA') throw new Error('Esta internação não está ativa.');
    const agora = agoraISO();
    const u = quem();
    const internacao = { ...atual, status: 'ALTA', data_hora_alta: agora, alta_por: u.por, alta_por_nome: u.por_nome };
    const leitoNovo = { id: atual.leito_id, status: 'HIGIENIZACAO', internacao_id: '', paciente_id: '', desde: agora, atualizado_por: u.por, atualizado_por_nome: u.por_nome, motivo: 'Alta do paciente' };
    await db_altaAtomica({ internacao, leitoNovo });
    await auditarLeito(atual.leito_id, 'ALTA_HIGIENIZACAO', { status: 'OCUPADO' }, { status: 'HIGIENIZACAO' });
    if (typeof auditar === 'function') await auditar({ entidade: 'internacao', entidade_id: atual.id, acao: 'ALTA', antes: { status: 'ATIVA' }, depois: { status: 'ALTA' } });
    return internacao;
}

/** Transfere o paciente internado para outro leito LIVRE; o leito antigo vai para higienização e a trajetória fica na internação. */
async function transferirLeito(internacaoId, novoLeitoId, motivo) {
    requirePermission('internacao_gerenciar');
    const atual = MOCK_DATA.INTERNACOES.find(i => i.id === internacaoId) || await getDocH(COLH.INTERNACOES, internacaoId);
    if (!atual || atual.status !== 'ATIVA') throw new Error('Esta internação não está ativa.');
    const novo = leitoPorId(novoLeitoId);
    if (!novo) throw new Error('Escolha um leito da estrutura do hospital.');
    if (novo.id === atual.leito_id) throw new Error('O paciente já está neste leito.');
    if (String(motivo || '').trim().length < 5) throw new Error('Informe o motivo da transferência (mínimo de 5 caracteres).');
    if (estadoLeito(novo.id).status !== 'LIVRE') throw new Error(`O leito ${novo.rotulo} não está livre (${rotuloStatusLeito(estadoLeito(novo.id).status)}).`);
    const agora = agoraISO(); const u = quem();
    const internacao = { ...atual, leito_id: novo.id, andar: novo.andar, ala: novo.ala, quarto: novo.quarto,
        historico_leitos: [...(atual.historico_leitos || [{ leito_id: atual.leito_id, desde: atual.data_hora_internacao }]), { leito_id: novo.id, desde: agora, de: atual.leito_id, por: u.por_nome, motivo: String(motivo).trim() }] };
    const base = { atualizado_por: u.por, atualizado_por_nome: u.por_nome, desde: agora };
    await db_transferirAtomico({
        internacao,
        leitoOrigemNovo: { id: atual.leito_id, status: 'HIGIENIZACAO', internacao_id: '', paciente_id: '', motivo: 'Transferência do paciente', ...base },
        leitoDestinoNovo: { id: novo.id, status: 'OCUPADO', internacao_id: atual.id, paciente_id: atual.paciente_id, motivo: '', ...base }
    });
    await auditarLeito(atual.leito_id, 'TRANSFERENCIA_SAIDA', { status: 'OCUPADO' }, { status: 'HIGIENIZACAO', destino: novo.id }, String(motivo).trim());
    await auditarLeito(novo.id, 'TRANSFERENCIA_ENTRADA', { status: 'LIVRE' }, { status: 'OCUPADO', origem: atual.leito_id, internacao: atual.id }, String(motivo).trim());
    if (typeof auditar === 'function') await auditar({ entidade: 'internacao', entidade_id: atual.id, acao: 'TRANSFERIR', antes: { leito: atual.leito_id }, depois: { leito: novo.id }, motivo: String(motivo).trim() });
    return internacao;
}

async function concluirHigienizacao(leitoId) {
    requirePermission('leito_gerenciar');
    const agora = agoraISO(); const u = quem();
    await db_mudarLeito(leitoId, ['HIGIENIZACAO'], { id: leitoId, status: 'LIVRE', internacao_id: '', paciente_id: '', desde: agora, atualizado_por: u.por, atualizado_por_nome: u.por_nome, motivo: '', liberado_em: agora, liberado_por: u.por_nome });
    await auditarLeito(leitoId, 'LIBERAR', { status: 'HIGIENIZACAO' }, { status: 'LIVRE', liberado_por: u.por_nome });
}

async function bloquearLeito(leitoId, motivo) {
    requirePermission('leito_gerenciar');
    if (String(motivo || '').trim().length < 5) throw new Error('Informe o motivo do bloqueio (mínimo de 5 caracteres).');
    if (!leitoPorId(leitoId)) throw new Error('Leito inválido.');
    const agora = agoraISO(); const u = quem();
    const antes = estadoLeito(leitoId).status;
    await db_mudarLeito(leitoId, ['LIVRE', 'HIGIENIZACAO'], { id: leitoId, status: 'BLOQUEADO', internacao_id: '', paciente_id: '', desde: agora, atualizado_por: u.por, atualizado_por_nome: u.por_nome, motivo: String(motivo).trim() });
    await auditarLeito(leitoId, 'BLOQUEAR', { status: antes }, { status: 'BLOQUEADO' }, String(motivo).trim());
}

async function desbloquearLeito(leitoId) {
    requirePermission('leito_gerenciar');
    const agora = agoraISO(); const u = quem();
    await db_mudarLeito(leitoId, ['BLOQUEADO'], { id: leitoId, status: 'LIVRE', internacao_id: '', paciente_id: '', desde: agora, atualizado_por: u.por, atualizado_por_nome: u.por_nome, motivo: '', liberado_em: agora, liberado_por: u.por_nome });
    await auditarLeito(leitoId, 'DESBLOQUEAR', { status: 'BLOQUEADO' }, { status: 'LIVRE', liberado_por: u.por_nome });
}

// ============ Prontuário: registros clínicos (somente acrescentam; nada é editado ou apagado) ============

const CID10_FORMATO = /^[A-Z][0-9]{2}(\.[0-9A-Z]{1,2})?$/;
/** Valida só o FORMATO do CID-10 (ex.: I10, J18.9). Não há lista embutida: o código vem de quem diagnostica. */
const validarCid10 = (cid) => CID10_FORMATO.test(String(cid || '').trim().toUpperCase());

const TIPOS_CLINICOS = {
    EVOLUCAO: { rotulo: 'Evolução Médica', permissao: 'prontuario_evoluir', cor: '#0284c7' },
    EVOLUCAO_ENFERMAGEM: { rotulo: 'Evolução de Enfermagem', permissao: 'prontuario_evoluir', cor: '#0d9488' },
    SINAIS_VITAIS: { rotulo: 'Sinais Vitais', permissao: 'prontuario_evoluir', cor: '#16a34a' },
    PRESCRICAO: { rotulo: 'Prescrição Médica', permissao: 'prescrever', cor: '#7c3aed' },
    DIAGNOSTICO: { rotulo: 'Diagnóstico (CID-10)', permissao: 'diagnosticar', cor: '#d97706' },
    RESULTADO: { rotulo: 'Resultado / Laudo de Exame', permissao: 'exame_resultado', cor: '#2563eb' },
    PREPARO_EXAME: { rotulo: 'Preparo de Exame (Enfermagem)', permissao: 'prontuario_evoluir', cor: '#059669' },
    FARMACIA_PISO: { rotulo: 'Farmácia (Distribuição p/ Piso)', permissao: 'prontuario_ver', cor: '#0891b2' },
    TRANSPORTE_NIR: { rotulo: 'Movimentação / Transporte (NIR)', permissao: 'transporte_ver', cor: '#ea580c' }
};

/** Prescrição por item: medicamento, dose, via, frequência e duração. Gera também o texto corrido para leitura e impressão. */
function validarItensPrescricao(itens) {
    const lista = (itens || []).filter(i => String(i.medicamento || '').trim() || String(i.dose || '').trim());
    if (!lista.length) throw new Error('Inclua ao menos um item na prescrição.');
    return lista.map((i, n) => {
        const item = { medicamento: String(i.medicamento || '').trim(), dose: String(i.dose || '').trim(), via: String(i.via || '').trim(), frequencia: String(i.frequencia || '').trim(), duracao: String(i.duracao || '').trim(), observacao: String(i.observacao || '').trim() };
        if (item.medicamento.length < 2) throw new Error(`Item ${n + 1}: informe o medicamento ou a conduta.`);
        if (!item.dose) throw new Error(`Item ${n + 1}: informe a dose.`);
        if (!item.frequencia) throw new Error(`Item ${n + 1}: informe a frequência.`);
        return item;
    });
}
const textoDoItemPrescricao = (i) => [i.medicamento, i.dose, i.via, i.frequencia, i.duracao && `por ${i.duracao}`, i.observacao && `(${i.observacao})`].filter(Boolean).join(' · ');

/** Valida e formata aferição de Sinais Vitais pela Enfermagem. */
function validarSinaisVitais(sinais = {}) {
    const pa = String(sinais.pa || '').trim();
    const fc = String(sinais.fc || '').trim();
    const fr = String(sinais.fr || '').trim();
    const temp = String(sinais.temp || '').trim();
    const spo2 = String(sinais.spo2 || '').trim();
    const hgt = String(sinais.hgt || '').trim();
    const dor = String(sinais.dor || '').trim();
    if (!pa && !fc && !temp && !spo2) {
        throw new Error('Informe ao menos Pressão Arterial (PA), Frequência Cardíaca (FC), Temperatura ou SpO2.');
    }
    return {
        pa: pa ? (pa.includes('mmHg') ? pa : `${pa} mmHg`) : '',
        fc: fc ? (fc.includes('bpm') ? fc : `${fc} bpm`) : '',
        fr: fr ? (fr.includes('irpm') ? fr : `${fr} irpm`) : '',
        temp: temp ? (temp.includes('°') ? temp : `${temp} °C`) : '',
        spo2: spo2 ? (spo2.includes('%') ? spo2 : `${spo2}%`) : '',
        hgt: hgt ? (hgt.includes('mg') ? hgt : `${hgt} mg/dL`) : '',
        dor: dor ? (dor.includes('/') ? dor : `${dor}/10`) : ''
    };
}

function textoSinaisVitais(s, obs = '') {
    const partes = [
        s.pa && `PA: ${s.pa}`,
        s.fc && `FC: ${s.fc}`,
        s.fr && `FR: ${s.fr}`,
        s.temp && `Temp: ${s.temp}`,
        s.spo2 && `SpO2: ${s.spo2}`,
        s.hgt && `HGT: ${s.hgt}`,
        s.dor && `Dor (EVA): ${s.dor}`
    ].filter(Boolean);
    return partes.join(' · ') + (String(obs || '').trim() ? ` — ${String(obs).trim()}` : '');
}

async function registrarClinico({ internacao, paciente_id = '', tipo, texto, itens = null, sinais = null, cid = '', complementa_id = '', solicitacao_id = '', transporte_id = '', registro_conselho = '' }) {
    const cfg = TIPOS_CLINICOS[tipo];
    if (!cfg) throw new Error('Tipo de registro inválido.');
    if (tipo !== 'TRANSPORTE_NIR' && tipo !== 'FARMACIA_PISO') requirePermission(cfg.permissao);
    const pacId = (internacao && internacao.paciente_id) || paciente_id;
    if (!internacao || internacao.status !== 'ATIVA') {
        if (tipo !== 'TRANSPORTE_NIR' && tipo !== 'RESULTADO' && tipo !== 'FARMACIA_PISO') {
            throw new Error('O registro clínico exige uma internação ativa do paciente.');
        }
    }
    if (tipo === 'PRESCRICAO' && itens) { itens = validarItensPrescricao(itens); texto = itens.map(textoDoItemPrescricao).join('\n'); }
    if (tipo === 'SINAIS_VITAIS' && sinais) { sinais = validarSinaisVitais(sinais); texto = textoSinaisVitais(sinais, texto); }
    if (String(texto || '').trim().length < 5) throw new Error('Escreva o registro (mínimo de 5 caracteres).');
    if (tipo === 'DIAGNOSTICO') {
        if (!validarCid10(cid)) throw new Error('Informe o CID-10 no formato correto (ex.: I10 ou J18.9).');
        cid = String(cid).trim().toUpperCase();
    }
    const u = quem();
    const reg = {
        id: newId('clin'), paciente_id: pacId, internacao_id: internacao ? internacao.id : '', tipo,
        texto: String(texto).trim(), itens: itens || [], sinais: sinais || null, cid,
        complementa_id, solicitacao_id, transporte_id,
        autor: u.por, autor_nome: u.por_nome, perfil: (state.currentUser && state.currentUser.role) || 'ADMIN',
        registro_conselho: String(registro_conselho || '').trim(),
        em: agoraISO(), assinado: true
    };
    await setDocH(COLH.REGISTROS, reg);
    if (tipo === 'PRESCRICAO' && Array.isArray(itens) && itens.length && internacao) {
        const lObj = leitoPorId(internacao.leito_id) || { rotulo: internacao.leito_id };
        for (const it of itens) {
            const disp = {
                id: newId('far'),
                codigo: `FAR-${todayISO().replace(/-/g, '')}-${String((MOCK_DATA.FARMACIA_DISPENSACOES || []).length + 1).padStart(4, '0')}`,
                prescricao_id: reg.id,
                paciente_id: internacao.paciente_id,
                paciente_nome: internacao.paciente_nome,
                prontuario: internacao.prontuario || '',
                internacao_id: internacao.id,
                piso_andar: String(internacao.andar || '1'),
                piso_rotulo: `${internacao.andar || '1'}º Andar (Piso ${internacao.andar || '1'})`,
                ala_setor: internacao.ala || 'Unidade de Internação',
                leito_id: internacao.leito_id,
                leito_rotulo: lObj.rotulo,
                medicamento: it.medicamento,
                dose: it.dose,
                via: it.via || '—',
                frequencia: it.frequencia,
                lote: '',
                quantidade: it.duracao || 'Dose prescrita (24h)',
                prescrito_por: u.por_nome,
                prescrito_em: reg.em,
                status: 'AGUARDANDO_RETIRADA',
                retirada: null,
                administracao: null
            };
            await setDocH(COLH.FARMACIA, disp);
        }
    }
    if (typeof auditar === 'function') await auditar({ entidade: 'prontuario', entidade_id: pacId, acao: complementa_id ? 'COMPLEMENTAR' : 'REGISTRAR', depois: { tipo, registro: reg.id, internacao: reg.internacao_id } });
    return reg;
}

/** Atualiza as alergias em destaque no cabeçalho do Prontuário do paciente e audita a alteração. */
async function atualizarAlergiasPaciente(pacienteId, alergiasTexto) {
    if (!hasPermission('alergia_gerenciar') && !hasPermission('prontuario_evoluir')) {
        throw new Error('Acesso negado: seu perfil não pode alterar o registro de alergias.');
    }
    const pac = await db_getPaciente(pacienteId);
    if (!pac) throw new Error('Paciente não encontrado.');
    const texto = String(alergiasTexto || '').trim() || 'Nega alergias medicamentosas conhecidas';
    const antes = pac.alergias || '';
    const atualizado = { ...pac, alergias: texto, atualizado_em: agoraISO(), atualizado_por: quem().por };
    await db_savePaciente(atualizado);
    if (state.prontuario && state.prontuario.pacienteId === pacienteId) {
        state.prontuario.paciente = atualizado;
    }
    if (typeof auditar === 'function') {
        await auditar({ entidade: 'paciente', entidade_id: pacienteId, acao: 'ALERGIAS', antes: { alergias: antes }, depois: { alergias: texto } });
    }
    return atualizado;
}

/** Abre o prontuário de um paciente cadastrado (uma vez só; reabrir devolve o mesmo). Fica na auditoria. */
async function abrirProntuario(paciente) {
    requirePermission('prontuario_ver');
    if (!paciente || !paciente.id) throw new Error('Selecione o paciente.');
    if (paciente.ativo === false) throw new Error('Este cadastro de paciente está inativo.');
    const existente = MOCK_DATA.PRONTUARIOS.find(p => p.id === paciente.id) || await getDocH(COLH.PRONTUARIOS, paciente.id);
    if (existente) return existente;
    const u = quem();
    const reg = { id: paciente.id, paciente_id: paciente.id, nome: paciente.nome, prontuario: paciente.prontuario || '', aberto_em: agoraISO(), aberto_por: u.por_nome };
    await setDocH(COLH.PRONTUARIOS, reg);
    if (typeof auditar === 'function') await auditar({ entidade: 'prontuario', entidade_id: paciente.id, acao: 'ABRIR_PRONTUARIO', depois: { prontuario: reg.prontuario } });
    return reg;
}

/** Consulta de prontuários: união dos prontuários abertos com os pacientes que já tiveram internação. */
function listaProntuarios(abertos, internacoes) {
    const mapa = new Map();
    const get = (id, nome, prontuario) => {
        if (!mapa.has(id)) {
            const pCache = (MOCK_DATA.PACIENTES_SEED_MAP && MOCK_DATA.PACIENTES_SEED_MAP[id])
                || ((typeof CAD_DATA !== 'undefined' && Array.isArray(CAD_DATA.paciente)) ? CAD_DATA.paciente.find(x => x.id === id) : null);
            mapa.set(id, {
                paciente_id: id,
                nome: nome || (pCache && pCache.nome) || '',
                prontuario: prontuario || (pCache && pCache.prontuario) || '',
                cpf: (pCache && pCache.cpf) || '',
                alergias: (pCache && pCache.alergias) || '',
                internacoes: 0,
                ativa: null,
                ultima: '',
                aberto_em: ''
            });
        }
        return mapa.get(id);
    };
    (abertos || []).forEach(a => { const r = get(a.paciente_id, a.nome, a.prontuario); r.aberto_em = a.aberto_em; });
    (internacoes || []).forEach(i => {
        const r = get(i.paciente_id, i.paciente_nome, i.prontuario);
        r.internacoes++;
        if (i.status === 'ATIVA') r.ativa = i;
        if (String(i.data_hora_internacao) > r.ultima) r.ultima = i.data_hora_internacao;
    });
    return [...mapa.values()].sort((a, b) => String(b.ultima || b.aberto_em).localeCompare(String(a.ultima || a.aberto_em)));
}

// ============ Tipos de exame, status e prioridade ============

const PRIORIDADES = [{ id: 'URGENTE', rotulo: 'Urgente' }, { id: 'ELETIVO', rotulo: 'Eletivo' }];
const SETORES_EXAME = { IMAGENOLOGIA: 'Imagenologia', ULTRASSONOGRAFIA: 'Ultrassonografia' };

const SALAS_IMAGENOLOGIA = [
    'Sala 01 - Tomógrafo Multislice 64 Canais',
    'Sala 02 - Raio-X Digital (Radiografia)',
    'Sala 03 - Ressonância Magnética 1.5T',
    'Sala 04 - Ultrassonografia / Doppler',
    'Exame no Leito (Equipamento Portátil)'
];

const STATUS_EXAME = {
    SOLICITADO: 'Solicitado',
    AGUARDANDO_TRIAGEM: 'Aguardando triagem',
    EM_AVALIACAO: 'Em avaliação',
    AGUARDANDO_AGENDAMENTO: 'Aguardando agendamento',
    AGENDADO: 'Agendado',
    EM_ATENDIMENTO: 'Em realização',
    REALIZADO: 'Disponível / Laudo liberado',
    CANCELADO: 'Cancelado',
    REAGENDAMENTO_NECESSARIO: 'Reagendamento necessário',
    PENDENTE_AUTORIZACAO: 'Pendente de autorização'
};
const rotuloStatusExame = (s) => STATUS_EXAME[s] || s;

/** Mudanças de status permitidas. REALIZADO e CANCELADO encerram o fluxo. */
const TRANSICOES_EXAME = {
    SOLICITADO: ['AGUARDANDO_TRIAGEM', 'PENDENTE_AUTORIZACAO', 'AGENDADO', 'CANCELADO'],
    PENDENTE_AUTORIZACAO: ['AGUARDANDO_TRIAGEM', 'CANCELADO'],
    AGUARDANDO_TRIAGEM: ['EM_AVALIACAO', 'AGENDADO', 'CANCELADO'],
    EM_AVALIACAO: ['AGUARDANDO_AGENDAMENTO', 'PENDENTE_AUTORIZACAO', 'AGENDADO', 'CANCELADO'],
    AGUARDANDO_AGENDAMENTO: ['AGENDADO', 'CANCELADO'],
    AGENDADO: ['EM_ATENDIMENTO', 'REAGENDAMENTO_NECESSARIO', 'CANCELADO'],
    REAGENDAMENTO_NECESSARIO: ['AGENDADO', 'CANCELADO'],
    EM_ATENDIMENTO: ['REALIZADO', 'REAGENDAMENTO_NECESSARIO', 'CANCELADO'],
    REALIZADO: [], CANCELADO: []
};
const transicaoPermitida = (de, para) => (TRANSICOES_EXAME[de] || []).includes(para);
const statusEncerrado = (s) => s === 'REALIZADO' || s === 'CANCELADO';

function tiposExame() {
    const cad = typeof cadRowsOf === 'function' ? cadRowsOf('tipoexame').filter(t => t.ativo !== false) : [];
    if (cad.length) return cad;
    if (typeof CAD_DATA !== 'undefined' && Array.isArray(CAD_DATA.tipoexame) && CAD_DATA.tipoexame.length) {
        return CAD_DATA.tipoexame.filter(t => t.ativo !== false);
    }
    return TIPOS_EXAME_PADRAO;
}
const permissaoDoSetor = (setor) => (setor === 'ULTRASSONOGRAFIA' ? 'ultrassom_gerenciar' : 'imagem_gerenciar');

// ============ Autorizações (APAC) ============

const STATUS_AUTORIZACAO = { PENDENTE: 'Pendente', APROVADA: 'Aprovada', NEGADA: 'Negada', VENCIDA: 'Vencida' };

/** Situação REAL da autorização: só é aprovada com número, data e validade; vence quando passa da validade. */
function statusAutorizacao(aut, hoje = todayISO()) {
    if (!aut) return 'PENDENTE';
    if (aut.decisao === 'NEGADA') return 'NEGADA';
    if (aut.decisao !== 'APROVADA' || !String(aut.numero_apac || '').trim() || !aut.data_autorizacao || !aut.validade_fim) return 'PENDENTE';
    return aut.validade_fim < hoje ? 'VENCIDA' : 'APROVADA';
}
const autorizacaoDaSolicitacao = (solId) => (MOCK_DATA.AUTORIZACOES || []).find(a => a.solicitacao_id === solId) || null;
const autorizacaoVigente = (solId) => statusAutorizacao(autorizacaoDaSolicitacao(solId)) === 'APROVADA';

/** Um exame que exige autorização só pode ser agendado com autorização aprovada e dentro da validade. */
function podeAgendar(sol, dataAgendamento) {
    if (!sol.exige_autorizacao) return { ok: true };
    const aut = autorizacaoDaSolicitacao(sol.id);
    if (statusAutorizacao(aut) !== 'APROVADA') return { ok: false, motivo: 'Este exame exige autorização aprovada e dentro da validade antes de ser agendado.' };
    if (dataAgendamento && dataAgendamento > aut.validade_fim) return { ok: false, motivo: `A data do agendamento passa da validade da autorização (${formatDateBR(aut.validade_fim)}).` };
    return { ok: true };
}

// ============ Solicitação de exame ============

const MAX_PROCEDIMENTOS_SECUNDARIOS = 5; // como no formulário oficial de referência

function validarSolicitacao(f) {
    const erros = [];
    if (!f.tipo_exame_id) erros.push({ campo: 'tipo_exame_id', mensagem: 'Selecione o tipo de exame.' });
    if (!PRIORIDADES.some(p => p.id === f.prioridade)) erros.push({ campo: 'prioridade', mensagem: 'Informe a prioridade clínica.' });
    if (String(f.prioridade_justificativa || '').trim().length < 5) erros.push({ campo: 'prioridade_justificativa', mensagem: 'Justifique a prioridade escolhida (mínimo de 5 caracteres).' });
    if (!String(f.proc_nome || '').trim()) erros.push({ campo: 'proc_nome', mensagem: 'Informe o nome do procedimento principal.' });
    if (!(Number(f.proc_qtd) >= 1)) erros.push({ campo: 'proc_qtd', mensagem: 'Informe a quantidade (mínimo 1).' });
    if (String(f.diagnostico_descricao || '').trim().length < 5) erros.push({ campo: 'diagnostico_descricao', mensagem: 'Descreva o diagnóstico (justificativa clínica).' });
    if (!validarCid10(f.cid_principal)) erros.push({ campo: 'cid_principal', mensagem: 'Informe o CID-10 principal no formato correto (ex.: I10).' });
    ['cid_secundario', 'cid_causas'].forEach(c => { if (String(f[c] || '').trim() && !validarCid10(f[c])) erros.push({ campo: c, mensagem: 'CID-10 em formato inválido.' }); });
    if (!['CNS', 'CPF'].includes(f.solic_tipo_doc)) erros.push({ campo: 'solic_tipo_doc', mensagem: 'Informe o tipo de documento do solicitante (CNS ou CPF).' });
    const doc = onlyDigits(f.solic_documento);
    if (f.solic_tipo_doc === 'CPF' && !validateCPF(doc)) erros.push({ campo: 'solic_documento', mensagem: 'CPF do solicitante inválido.' });
    if (f.solic_tipo_doc === 'CNS' && doc.length !== 15) erros.push({ campo: 'solic_documento', mensagem: 'CNS do solicitante deve ter 15 dígitos.' });
    if (String(f.solic_registro || '').trim().length < 3) erros.push({ campo: 'solic_registro', mensagem: 'Informe o registro no conselho profissional.' });
    if (!f.confere) erros.push({ campo: 'confere', mensagem: 'Confirme que conferiu os dados do paciente.' });
    return erros;
}

/** Dados do paciente no momento da emissão (o formulário oficial é um documento datado). O vínculo é sempre o paciente_id. */
function dadosPacienteParaFormulario(paciente) {
    const mun = typeof cadNomeMunicipio === 'function' && paciente.municipio_id ? cadNomeMunicipio(paciente.municipio_id) : '';
    return {
        nome: paciente.nome || '', sexo: paciente.sexo || '', prontuario: paciente.prontuario || '', cns: paciente.cns || '', cpf: paciente.cpf || '',
        data_nascimento: paciente.data_nascimento || '', raca_cor: paciente.raca_cor || '', etnia: paciente.etnia || '', nome_mae: paciente.nome_mae || '',
        telefone: paciente.telefone || paciente.celular || '', responsavel_nome: paciente.responsavel_nome || '', responsavel_telefone: paciente.responsavel_telefone || '',
        endereco: [paciente.logradouro, paciente.numero, paciente.complemento, paciente.bairro].filter(Boolean).join(', '),
        municipio: mun.split('/')[0] || '', codigo_ibge: paciente.municipio_id || '', uf: paciente.uf || '', cep: paciente.cep || ''
    };
}

async function emitirSolicitacaoExame(paciente, internacao, f) {
    requirePermission('exame_solicitar');
    const erros = validarSolicitacao(f);
    if (erros.length) throw new Error(erros[0].mensagem);
    const tipo = tiposExame().find(t => t.id === f.tipo_exame_id);
    if (!tipo) throw new Error('Tipo de exame não encontrado ou inativo.');
    const u = quem();
    const cfg = MOCK_DATA.CONFIG_HOSPITAL || {};
    const agora = agoraISO();
    const exigeAut = Boolean(f.exige_autorizacao !== undefined ? f.exige_autorizacao : tipo.exige_autorizacao);
    const stInicial = exigeAut ? 'PENDENTE_AUTORIZACAO' : 'SOLICITADO';
    const sol = {
        id: newId('exa'), protocolo: `EXA-${todayISO().replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        paciente_id: paciente.id, internacao_id: internacao ? internacao.id : '',
        localizacao: internacao ? { leito_id: internacao.leito_id, andar: internacao.andar, ala: internacao.ala, quarto: internacao.quarto } : null,
        tipo_exame_id: tipo.id, tipo_nome: tipo.nome, setor_destino: tipo.setor_destino, exige_autorizacao: exigeAut,
        prioridade: f.prioridade, prioridade_justificativa: String(f.prioridade_justificativa).trim(),
        prioridade_historico: [],
        contraste: Boolean(f.contraste),
        detalhe_contraste: String(f.detalhe_contraste || (f.contraste ? 'Com contraste' : 'Sem contraste')).trim(),
        procedimento_principal: { codigo: String(f.proc_codigo || '').trim(), nome: String(f.proc_nome).trim(), qtd: Number(f.proc_qtd) },
        procedimentos_secundarios: (f.secundarios || []).filter(p => String(p.nome || '').trim()).slice(0, MAX_PROCEDIMENTOS_SECUNDARIOS)
            .map(p => ({ codigo: String(p.codigo || '').trim(), nome: String(p.nome).trim(), qtd: Number(p.qtd) || 1 })),
        diagnostico_descricao: String(f.diagnostico_descricao).trim(), cid_principal: String(f.cid_principal).trim().toUpperCase(),
        cid_secundario: String(f.cid_secundario || '').trim().toUpperCase(), cid_causas: String(f.cid_causas || '').trim().toUpperCase(), observacoes: String(f.observacoes || '').trim(),
        solicitante: { nome: u.por_nome, username: u.por, tipo_doc: f.solic_tipo_doc, documento: onlyDigits(f.solic_documento), registro_conselho: String(f.solic_registro).trim() },
        data_solicitacao: todayISO(), estabelecimento_solicitante: { nome: cfg.nome || (typeof APP_INFO !== 'undefined' ? APP_INFO.hospital : 'HGP'), cnes: cfg.cnes || '' },
        paciente_dados: dadosPacienteParaFormulario(paciente),
        status: stInicial,
        historico: [{ status: stInicial, em: agora, por: u.por_nome, motivo: 'Solicitação emitida no prontuário eletrônico' }],
        pendencias: [], agendamento: null, preparo_enfermagem: null, realizado: null, criado_em: agora, criado_por: u.por
    };
    await setDocH(COLH.SOLICITACOES, sol);
    if (typeof auditar === 'function') await auditar({ entidade: 'solicitacao_exame', entidade_id: sol.id, acao: 'CRIAR', depois: { protocolo: sol.protocolo, exame: sol.tipo_nome, prioridade: sol.prioridade, paciente: paciente.id } });
    return sol;
}

const exigirCentral = (sol) => requirePermission(permissaoDoSetor(sol.setor_destino));
const buscarSol = async (id) => { const s = await getDocH(COLH.SOLICITACOES, id); if (!s) throw new Error('Solicitação não encontrada.'); return s; };

async function gravarStatusExame(sol, para, motivo, extras = {}) {
    if (!transicaoPermitida(sol.status, para)) throw new Error(`Não é possível passar de "${rotuloStatusExame(sol.status)}" para "${rotuloStatusExame(para)}".`);
    const u = quem();
    const novo = { ...sol, ...extras, status: para, historico: [...(sol.historico || []), { status: para, em: agoraISO(), por: u.por_nome, motivo: motivo || '' }] };
    await setDocH(COLH.SOLICITACOES, novo);
    if (typeof auditar === 'function') await auditar({ entidade: 'solicitacao_exame', entidade_id: sol.id, acao: 'STATUS', antes: { status: sol.status }, depois: { status: para }, motivo: motivo || '' });
    return novo;
}

async function avancarExame(solId, para, motivo = '') {
    const sol = await buscarSol(solId);
    exigirCentral(sol);
    if (para === 'CANCELADO') return cancelarExame(solId, motivo);
    if (para === 'AGENDADO' || para === 'REALIZADO') throw new Error('Use as ações de agendar e de registrar a realização.');
    if (para === 'AGUARDANDO_TRIAGEM' && sol.exige_autorizacao && !autorizacaoVigente(sol.id) && sol.status !== 'SOLICITADO') throw new Error('Aguardando a autorização aprovada.');
    if (para === 'PENDENTE_AUTORIZACAO' && !sol.exige_autorizacao) throw new Error('Este tipo de exame não exige autorização.');
    return gravarStatusExame(sol, para, motivo);
}

async function cancelarExame(solId, motivo) {
    const sol = await buscarSol(solId);
    if (!hasPermission(permissaoDoSetor(sol.setor_destino)) && !hasPermission('exame_solicitar')) throw new Error('Acesso negado: seu perfil não pode cancelar este exame.');
    if (String(motivo || '').trim().length < 5) throw new Error('Informe o motivo do cancelamento (mínimo de 5 caracteres).');
    if (sol.agendamento && sol.agendamento.vaga_id) await db_ajustarVaga(sol.agendamento.vaga_id, -1);
    return gravarStatusExame(sol, 'CANCELADO', String(motivo).trim(), { agendamento: null });
}

/** Agenda (ou reagenda) numa vaga existente, com opção de informar Sala/Equipamento e Observações de Preparo. */
async function agendarExame(solId, vagaId, extras = {}) {
    const sol = await buscarSol(solId);
    exigirCentral(sol);
    const vaga = MOCK_DATA.VAGAS_EXAME.find(v => v.id === vagaId) || await getDocH(COLH.VAGAS, vagaId);
    if (!vaga || vaga.setor !== sol.setor_destino) throw new Error('Escolha uma vaga do setor deste exame.');
    if (vaga.data < todayISO()) throw new Error('Não é possível agendar numa data passada.');
    const reagendando = sol.status === 'AGENDADO';
    if (!reagendando && !transicaoPermitida(sol.status, 'AGENDADO')) throw new Error(`Não é possível agendar um exame "${rotuloStatusExame(sol.status)}".`);
    const pode = podeAgendar(sol, vaga.data);
    if (!pode.ok) throw new Error(pode.motivo);
    if (reagendando && sol.agendamento && sol.agendamento.vaga_id === vagaId && !extras.sala && !extras.preparo) throw new Error('O exame já está nesta vaga.');
    if (!reagendando || !sol.agendamento || sol.agendamento.vaga_id !== vagaId) {
        await db_ajustarVaga(vagaId, +1);
        try {
            if (reagendando && sol.agendamento && sol.agendamento.vaga_id) await db_ajustarVaga(sol.agendamento.vaga_id, -1);
        } catch (e) { /* vaga antiga ajustada */ }
    }
    const u = quem();
    const sala = String(extras.sala || vaga.sala || SALAS_IMAGENOLOGIA[0]).trim();
    const preparo = String(extras.preparo || (sol.agendamento && sol.agendamento.preparo) || '').trim();
    const agendamento = { vaga_id: vaga.id, data: vaga.data, hora: vaga.hora, sala, preparo, por: u.por_nome, em: agoraISO() };
    const resumo = `${formatDateBR(vaga.data)} às ${vaga.hora}${sala ? ' · ' + sala : ''}${preparo ? ' (Preparo: ' + preparo + ')' : ''}`;
    if (typeof createNotification === 'function') {
        createNotification('EXAME_AGENDADO', `Exame ${sol.tipo_nome} de ${sol.paciente_dados.nome} agendado para ${resumo}.`, sol.setor_destino);
    }
    if (reagendando) {
        const novo = { ...sol, agendamento, historico: [...sol.historico, { status: 'AGENDADO', em: agoraISO(), por: u.por_nome, motivo: `Reagendado para ${resumo}` }] };
        await setDocH(COLH.SOLICITACOES, novo);
        if (typeof auditar === 'function') await auditar({ entidade: 'solicitacao_exame', entidade_id: sol.id, acao: 'REAGENDAR', antes: sol.agendamento, depois: agendamento });
        return novo;
    }
    return gravarStatusExame(sol, 'AGENDADO', `Agendado para ${resumo}`, { agendamento });
}

/**
 * Agendamento direto na Agenda da Imagenologia: permite selecionar uma vaga existente OU definir Data, Horário,
 * Sala/Equipamento e Observações de Preparo diretamente (criando/vinculando a vaga automaticamente).
 */
async function agendarExameDireto(solId, { vaga_id = '', data = '', hora = '', sala = '', preparo = '' }) {
    const sol = await buscarSol(solId);
    exigirCentral(sol);
    let targetVagaId = vaga_id;
    if (!targetVagaId) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data || '')) || data < todayISO()) throw new Error('Informe uma data válida para o agendamento (hoje em diante).');
        if (!/^\d{2}:\d{2}$/.test(String(hora || ''))) throw new Error('Informe o horário do exame.');
        if (!String(sala || '').trim()) throw new Error('Informe a Sala / Equipamento do exame.');
        const idVaga = `vaga_${sol.setor_destino}_${data}_${hora.replace(':', '')}_${sol.tipo_exame_id || 'todos'}`;
        let vagaExistente = MOCK_DATA.VAGAS_EXAME.find(v => v.id === idVaga) || await getDocH(COLH.VAGAS, idVaga);
        if (!vagaExistente) {
            vagaExistente = { id: idVaga, setor: sol.setor_destino, data, hora, sala: String(sala).trim(), capacidade: 5, ocupadas: 0, tipo_exame_id: sol.tipo_exame_id, criado_por: quem().por_nome, criado_em: agoraISO() };
            await setDocH(COLH.VAGAS, vagaExistente);
        }
        targetVagaId = vagaExistente.id;
    }
    return agendarExame(solId, targetVagaId, { sala, preparo });
}

/** Enfermagem checa o preparo do paciente para o exame agendado (jejum, acesso venoso, alergia verificada). */
async function registrarPreparoExame(solId, { jejum = false, acesso_venoso = false, alergia_verificada = false, observacoes = '' }) {
    if (!hasPermission('preparo_exame_checar') && !hasPermission('prontuario_evoluir')) {
        throw new Error('Acesso negado: apenas Enfermagem ou Médico pode checar o preparo do exame.');
    }
    const sol = await buscarSol(solId);
    const u = quem();
    const agora = agoraISO();
    const preparo_enfermagem = {
        checado: Boolean(jejum || acesso_venoso || alergia_verificada),
        jejum: Boolean(jejum),
        acesso_venoso: Boolean(acesso_venoso),
        alergia_verificada: Boolean(alergia_verificada),
        observacoes: String(observacoes || '').trim(),
        por: u.por_nome,
        em: agora
    };
    const itensOk = [
        jejum && 'Jejum confirmado',
        acesso_venoso && 'Acesso venoso pérvio',
        alergia_verificada && 'Alergia/contraste verificado'
    ].filter(Boolean).join(', ') || 'Preparo atualizado';
    const novo = {
        ...sol,
        preparo_enfermagem,
        historico: [...(sol.historico || []), { status: sol.status, em: agora, por: u.por_nome, motivo: `Preparo de enfermagem: ${itensOk}${observacoes ? ' (' + observacoes + ')' : ''}` }]
    };
    await setDocH(COLH.SOLICITACOES, novo);
    const internacao = internacaoAtivaDoPaciente(sol.paciente_id);
    if (internacao) {
        await registrarClinico({
            internacao,
            tipo: 'PREPARO_EXAME',
            solicitacao_id: sol.id,
            texto: `Checklist de Preparo (${sol.tipo_nome} - ${sol.protocolo}): ${itensOk}.${observacoes ? ' Obs.: ' + String(observacoes).trim() : ''}`
        });
    }
    return novo;
}

async function marcarReagendamento(solId, motivo) {
    const sol = await buscarSol(solId);
    exigirCentral(sol);
    if (String(motivo || '').trim().length < 5) throw new Error('Informe o motivo (mínimo de 5 caracteres).');
    if (sol.agendamento && sol.agendamento.vaga_id) await db_ajustarVaga(sol.agendamento.vaga_id, -1);
    return gravarStatusExame(sol, 'REAGENDAMENTO_NECESSARIO', String(motivo).trim(), { agendamento: null });
}

/** O exame só vira REALIZADO (Disponível / Laudo Liberado) com confirmação explícita e o profissional que atendeu. */
async function registrarRealizacao(solId, { profissional, confirmado, resultado = '' }) {
    const sol = await buscarSol(solId);
    exigirCentral(sol);
    if (!confirmado) throw new Error('Confirme que o exame foi realizado.');
    if (String(profissional || '').trim().length < 3) throw new Error('Informe o profissional responsável pelo atendimento.');
    const u = quem();
    const texto = String(resultado || '').trim();
    const realizadoObj = {
        em: agoraISO(),
        por: u.por_nome,
        profissional: String(profissional).trim(),
        laudo: texto || 'Exame realizado e imagens disponibilizadas no PACS/Prontuário.'
    };
    const novo = await gravarStatusExame(sol, 'REALIZADO', `Realizado e laudo liberado por ${String(profissional).trim()}`, { realizado: realizadoObj });
    if (texto.length >= 5) {
        const internacao = MOCK_DATA.INTERNACOES.find(i => i.id === sol.internacao_id) || internacaoAtivaDoPaciente(sol.paciente_id);
        if (hasPermission('exame_resultado')) {
            await registrarClinico({
                internacao,
                paciente_id: sol.paciente_id,
                tipo: 'RESULTADO',
                texto: `[${sol.tipo_nome} · ${sol.protocolo}] ${texto}`,
                solicitacao_id: sol.id
            });
        }
    }
    if (typeof createNotification === 'function') {
        createNotification('LAUDO_LIBERADO', `Laudo disponível: ${sol.tipo_nome} do paciente ${sol.paciente_dados.nome}.`, sol.setor_destino);
    }
    return novo;
}

async function alterarPrioridade(solId, nova, justificativa) {
    requirePermission('exame_priorizar');
    const sol = await buscarSol(solId);
    if (statusEncerrado(sol.status)) throw new Error('Esta solicitação já foi encerrada.');
    if (!PRIORIDADES.some(p => p.id === nova)) throw new Error('Prioridade inválida.');
    if (nova === sol.prioridade) throw new Error('A solicitação já tem esta prioridade.');
    if (String(justificativa || '').trim().length < 5) throw new Error('Justifique a alteração de prioridade (mínimo de 5 caracteres).');
    const u = quem();
    const novoDoc = { ...sol, prioridade: nova, prioridade_justificativa: String(justificativa).trim(), prioridade_historico: [...(sol.prioridade_historico || []), { de: sol.prioridade, para: nova, em: agoraISO(), por: u.por_nome, justificativa: String(justificativa).trim() }] };
    await setDocH(COLH.SOLICITACOES, novoDoc);
    if (typeof auditar === 'function') await auditar({ entidade: 'solicitacao_exame', entidade_id: sol.id, acao: 'PRIORIDADE', antes: { prioridade: sol.prioridade }, depois: { prioridade: nova }, motivo: String(justificativa).trim() });
    return novoDoc;
}

async function adicionarPendencia(solId, texto) {
    const sol = await buscarSol(solId);
    exigirCentral(sol);
    if (String(texto || '').trim().length < 5) throw new Error('Descreva a pendência (mínimo de 5 caracteres).');
    const u = quem();
    const novo = { ...sol, pendencias: [...(sol.pendencias || []), { texto: String(texto).trim(), em: agoraISO(), por: u.por_nome, resolvida: false }] };
    await setDocH(COLH.SOLICITACOES, novo);
    if (typeof auditar === 'function') await auditar({ entidade: 'solicitacao_exame', entidade_id: sol.id, acao: 'PENDENCIA', depois: { texto: String(texto).trim() } });
    return novo;
}

async function resolverPendencia(solId, indice) {
    const sol = await buscarSol(solId);
    exigirCentral(sol);
    const pend = [...(sol.pendencias || [])];
    if (!pend[indice] || pend[indice].resolvida) throw new Error('Pendência não encontrada.');
    pend[indice] = { ...pend[indice], resolvida: true, resolvida_em: agoraISO(), resolvida_por: quem().por_nome };
    const novo = { ...sol, pendencias: pend };
    await setDocH(COLH.SOLICITACOES, novo);
    if (typeof auditar === 'function') await auditar({ entidade: 'solicitacao_exame', entidade_id: sol.id, acao: 'PENDENCIA_RESOLVIDA', depois: { texto: pend[indice].texto } });
    return novo;
}

// ============ Vagas ============

async function criarVaga({ setor, data, hora, capacidade, tipo_exame_id = '', sala = '' }) {
    if (!SETORES_EXAME[setor]) throw new Error('Setor inválido.');
    requirePermission(permissaoDoSetor(setor));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data || '')) || data < todayISO()) throw new Error('Informe uma data de hoje em diante.');
    if (!/^\d{2}:\d{2}$/.test(String(hora || ''))) throw new Error('Informe o horário.');
    const cap = Number(capacidade);
    if (!Number.isInteger(cap) || cap < 1 || cap > 50) throw new Error('A capacidade deve ser de 1 a 50 vagas.');
    const idVaga = `vaga_${setor}_${data}_${hora.replace(':', '')}_${tipo_exame_id || 'todos'}`;
    if (await getDocH(COLH.VAGAS, idVaga)) throw new Error('Já existe uma vaga neste dia e horário.');
    const vaga = { id: idVaga, setor, data, hora, sala: String(sala || '').trim(), capacidade: cap, ocupadas: 0, tipo_exame_id, criado_por: quem().por_nome, criado_em: agoraISO() };
    await setDocH(COLH.VAGAS, vaga);
    if (typeof auditar === 'function') await auditar({ entidade: 'agenda_vaga', entidade_id: vaga.id, acao: 'CRIAR', depois: { setor, data, hora, capacidade: cap } });
    return vaga;
}

// ============ Autorização / APAC ============

async function registrarAutorizacao(solId, f) {
    requirePermission('autorizacao_gerenciar');
    const sol = await buscarSol(solId);
    if (!['APROVADA', 'NEGADA'].includes(f.decisao)) throw new Error('Informe a decisão: aprovada ou negada.');
    const erros = [];
    if (String(f.autorizador_nome || '').trim().length < 3) erros.push('Informe o nome do profissional autorizador.');
    if (String(f.orgao_emissor || '').trim().length < 2) erros.push('Informe o código do órgão emissor.');
    if (!['CNS', 'CPF'].includes(f.autorizador_tipo_doc)) erros.push('Informe o tipo de documento do autorizador.');
    const doc = onlyDigits(f.autorizador_documento);
    if (f.autorizador_tipo_doc === 'CPF' && !validateCPF(doc)) erros.push('CPF do autorizador inválido.');
    if (f.autorizador_tipo_doc === 'CNS' && doc.length !== 15) erros.push('CNS do autorizador deve ter 15 dígitos.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(f.data_autorizacao || ''))) erros.push('Informe a data da autorização.');
    else if (f.data_autorizacao > todayISO()) erros.push('A data da autorização não pode ser futura.');
    if (f.decisao === 'APROVADA') {
        if (String(f.numero_apac || '').trim().length < 3) erros.push('Informe o número da autorização/APAC.');
        if (!f.validade_inicio || !f.validade_fim) erros.push('Informe o período de validade da APAC.');
        else if (f.validade_fim < f.validade_inicio) erros.push('O fim da validade não pode ser antes do início.');
    } else if (String(f.motivo_negativa || '').trim().length < 5) erros.push('Informe o motivo da negativa.');
    if (!String(f.estab_executante_nome || '').trim() || String(f.estab_executante_cnes || '').trim() === '') erros.push('Informe o estabelecimento executante e o CNES.');
    if (String(f.autorizador_registro || '').trim().length < 3) erros.push('Informe o registro do autorizador no conselho.');
    if (erros.length) throw new Error(erros[0]);

    const anterior = autorizacaoDaSolicitacao(solId);
    const u = quem();
    const aut = {
        id: `aut_${solId}`, solicitacao_id: solId, paciente_id: sol.paciente_id, decisao: f.decisao,
        autorizador_nome: String(f.autorizador_nome).trim(), orgao_emissor: String(f.orgao_emissor).trim(), autorizador_tipo_doc: f.autorizador_tipo_doc, autorizador_documento: doc,
        autorizador_registro: String(f.autorizador_registro).trim(), data_autorizacao: f.data_autorizacao,
        numero_apac: f.decisao === 'APROVADA' ? String(f.numero_apac).trim() : '', validade_inicio: f.decisao === 'APROVADA' ? f.validade_inicio : '', validade_fim: f.decisao === 'APROVADA' ? f.validade_fim : '',
        motivo_negativa: f.decisao === 'NEGADA' ? String(f.motivo_negativa).trim() : '',
        estab_executante_nome: String(f.estab_executante_nome).trim(), estab_executante_cnes: String(f.estab_executante_cnes).trim(),
        registrado_por: u.por_nome, registrado_em: agoraISO(),
        historico: [...((anterior && anterior.historico) || []), { em: agoraISO(), por: u.por_nome, decisao: f.decisao, numero_apac: f.decisao === 'APROVADA' ? String(f.numero_apac).trim() : '' }]
    };
    await setDocH(COLH.AUTORIZACOES, aut);
    if (typeof auditar === 'function') await auditar({ entidade: 'autorizacao', entidade_id: aut.id, acao: anterior ? 'EDITAR' : 'CRIAR', antes: anterior ? { decisao: anterior.decisao, numero_apac: anterior.numero_apac } : null, depois: { decisao: aut.decisao, numero_apac: aut.numero_apac, validade_fim: aut.validade_fim } });
    // Aprovada: libera a solicitação para a fila do setor (nunca aprova nem agenda sozinha)
    if (statusAutorizacao(aut) === 'APROVADA' && sol.status === 'PENDENTE_AUTORIZACAO') await gravarStatusExame(sol, 'AGUARDANDO_TRIAGEM', `Autorização ${aut.numero_apac} registrada`);
    return aut;
}

async function salvarConfigHospital({ nome, cnes }) {
    requirePermission('autorizacao_gerenciar');
    const c = onlyDigits(cnes);
    if (c && c.length !== 7) throw new Error('O CNES tem 7 dígitos.');
    await setDocH(COLH.CONFIG, { id: 'active', nome: String(nome || '').trim(), cnes: c, atualizado_por: quem().por_nome, atualizado_em: agoraISO() });
    if (typeof auditar === 'function') await auditar({ entidade: 'config_hospital', entidade_id: 'active', acao: 'EDITAR', depois: { nome: String(nome || '').trim(), cnes: c } });
}

// Tipos de exame padrão (TC, Raio-X, RNM, Biópsia, Ultrassonografia). Criados uma vez, com IDs fixos, pelo administrador.
const TIPOS_EXAME_PADRAO = [
    { id: 'tipo_tc', nome: 'Tomografia Computadorizada (TC)', setor_destino: 'IMAGENOLOGIA', exige_autorizacao: true },
    { id: 'tipo_rx', nome: 'Raio-X Digital (Radiografia)', setor_destino: 'IMAGENOLOGIA', exige_autorizacao: false },
    { id: 'tipo_rnm', nome: 'Ressonância Magnética (RNM)', setor_destino: 'IMAGENOLOGIA', exige_autorizacao: true },
    { id: 'tipo_biopsia', nome: 'Biópsia Guiada por Imagem', setor_destino: 'IMAGENOLOGIA', exige_autorizacao: true },
    { id: 'tipo_us', nome: 'Ultrassonografia', setor_destino: 'ULTRASSONOGRAFIA', exige_autorizacao: false }
];

async function garantirTiposExamePadrao() {
    if (!state.currentUser || state.currentUser.role !== 'ADMIN') return;
    if (typeof db === 'undefined' || !db) return;
    const database = requireDb();
    for (const t of TIPOS_EXAME_PADRAO) {
        const ref = database.collection('cad_tipoexame').doc(t.id);
        if ((await ref.get()).exists) continue;
        const codigo = await db_cadProximoCodigo('tipoexame', 'EXM');
        await ref.set({ ...t, codigo, codigo_procedimento: '', nome_procedimento: '', observacoes: 'Tipo padrão. Informe o código do procedimento conforme a tabela oficial.', ativo: true, criado_em: agoraISO(), criado_por: state.currentUser.username, versao: 1 });
    }
}

// ============================================================ MÓDULO 3: DOIS SETORES INTEGRADOS — NIR (REGULAÇÃO E DOCUMENTAÇÃO) & SETOR DE TRANSPORTE

const TIPOS_TRANSPORTE_NIR = [
    { id: 'PACIENTE', rotulo: 'Paciente' },
    { id: 'INSUMO', rotulo: 'Medicamento / Insumo' }
];

const PRIORIDADES_TRANSPORTE_NIR = [
    { id: 'ELETIVA', rotulo: 'Eletiva (Normal)', badge: 'at-badge--outros' },
    { id: 'URGENTE', rotulo: 'Urgente', badge: 'at-badge--urgente' },
    { id: 'EMERGENCIA', rotulo: 'Emergência (Imediata)', badge: 'at-badge--emergencia' }
];

const MEIOS_TRANSPORTE_NIR = [
    { id: 'MACA', rotulo: 'Maca' },
    { id: 'CADEIRA_RODAS', rotulo: 'Cadeira de Rodas' },
    { id: 'AMBULANCIA_BASICA', rotulo: 'Ambulância Básica (USB)' },
    { id: 'AMBULANCIA_UTI', rotulo: 'Ambulância UTI Móvel (USA)' },
    { id: 'MALOTE_TERMICO', rotulo: 'Carrinho / Malote Térmico (Insumos)' }
];

const SUPORTES_TRANSPORTE_NIR = [
    { id: 'OXIGENIO', rotulo: 'Oxigênio (Cilindro O2)' },
    { id: 'MONITOR', rotulo: 'Monitor Multiparamétrico' },
    { id: 'ACOMPANHANTE_MEDICO', rotulo: 'Acompanhante Médico' },
    { id: 'BOMBA_INFUSAO', rotulo: 'Bomba de Infusão Contínua' }
];

/** Documentos que o NIR organiza, confere e encaminha obrigatoriamente ao Setor de Transporte. */
const DOCUMENTOS_NIR_OPCOES = [
    { id: 'FICHA_REGULACAO_NIR', rotulo: 'Ficha de Regulação e Autorização do NIR Assinada' },
    { id: 'RESUMO_CLINICO', rotulo: 'Resumo Clínico / Prontuário / Evolução Atualizada' },
    { id: 'GUIA_EXAME_APAC', rotulo: 'Guia de Solicitação Médica / Pedido de Exame ou APAC' },
    { id: 'VAGA_CONFIRMADA', rotulo: 'Confirmação de Vaga / Sala no Setor de Destino' },
    { id: 'TERMO_TRANSFERENCIA', rotulo: 'Termo de Consentimento / Guia de Remessa de Insumo' }
];

const DESTINOS_TRANSPORTE_NIR = [
    'Imagenologia - Sala 01 (Tomografia)',
    'Imagenologia - Sala 02 (Raio-X Digital)',
    'Imagenologia - Sala 03 (Ressonância Magnética)',
    'Ultrassonografia - Sala 04',
    'Centro Cirúrgico',
    'Hemodinâmica - Sala 01',
    'UTI Adulto',
    'Pronto Socorro / Emergência',
    'Clínica Médica (3º Andar)',
    'Farmácia Central / Estoque OPME',
    'Portaria / Alta Hospitalar',
    'Transferência Externa'
];

const STATUS_TRANSPORTE_NIR = {
    AGUARDANDO_NIR: { rotulo: 'Em Organização / Documentação no NIR', setor: 'NIR', cor: '#7c3aed', fundo: '#f3e8ff', badge: 'at-badge--outros' },
    SOLICITADO_NIR: { rotulo: 'Doc. Encaminhada pelo NIR (Aguardando Transporte)', setor: 'TRANSPORTE', cor: '#d97706', fundo: '#fef3c7', badge: 'at-badge--urgente' },
    EQUIPE_DESIGNADA: { rotulo: 'Equipe Designada (Setor de Transporte)', setor: 'TRANSPORTE', cor: '#0284c7', fundo: '#e0f2fe', badge: 'at-badge--outros' },
    EM_TRANSITO: { rotulo: 'Em Trânsito (Setor de Transporte)', setor: 'TRANSPORTE', cor: '#ea580c', fundo: '#ffedd5', badge: 'at-badge--emergencia' },
    CONCLUIDO: { rotulo: 'Concluído (Entregue pelo Transporte)', setor: 'TRANSPORTE', cor: '#16a34a', fundo: '#dcfce7', badge: 'at-badge--ok' },
    CANCELADO: { rotulo: 'Cancelado', setor: 'NIR', cor: '#64748b', fundo: '#f1f5f9', badge: 'at-badge--off' }
};

const TRANSICOES_TRANSPORTE_NIR = {
    AGUARDANDO_NIR: ['SOLICITADO_NIR', 'CANCELADO'],
    SOLICITADO_NIR: ['EQUIPE_DESIGNADA', 'CANCELADO'],
    EQUIPE_DESIGNADA: ['EM_TRANSITO', 'CANCELADO'],
    EM_TRANSITO: ['CONCLUIDO', 'CANCELADO'],
    CONCLUIDO: [],
    CANCELADO: []
};

const rotuloStatusTransporteNIR = (s) => (STATUS_TRANSPORTE_NIR[s] || { rotulo: s || '—' }).rotulo;
const rotuloMeioTransporteNIR = (id) => (MEIOS_TRANSPORTE_NIR.find(m => m.id === id) || { rotulo: id || '—' }).rotulo;
const rotuloPrioridadeTransporteNIR = (id) => (PRIORIDADES_TRANSPORTE_NIR.find(p => p.id === id) || { rotulo: id || '—' }).rotulo;
const rotuloDocumentoNIR = (id) => (DOCUMENTOS_NIR_OPCOES.find(d => d.id === id) || { rotulo: id || '—' }).rotulo;
const transicaoTransportePermitida = (de, para) => (TRANSICOES_TRANSPORTE_NIR[de] || []).includes(para);

/**
 * Retorna a demanda de transporte que está EM_TRANSITO para o paciente informado (se houver).
 * Usado pelo Mapa de Leitos e pelo Cabeçalho do Prontuário para exibir o selo "Em Transporte (Destino: X)".
 */
function transporteAtivoDoPaciente(pacienteId) {
    if (!pacienteId) return null;
    return (MOCK_DATA.TRANSPORTES_NIR || []).find(t =>
        t.tipo === 'PACIENTE' && t.paciente_id === pacienteId && t.status === 'EM_TRANSITO'
    ) || null;
}

/** Retorna a última demanda vinculada a um exame agendado. */
function transporteDoExame(solId) {
    if (!solId) return null;
    return (MOCK_DATA.TRANSPORTES_NIR || []).find(t =>
        t.solicitacao_exame_id === solId && t.status !== 'CANCELADO'
    ) || null;
}

function validarDemandaTransporteNIR(f) {
    const erros = [];
    if (!['PACIENTE', 'INSUMO'].includes(f.tipo)) erros.push({ campo: 'tipo', mensagem: 'Selecione o tipo de transporte (Paciente ou Medicamento/Insumo).' });
    if (!PRIORIDADES_TRANSPORTE_NIR.some(p => p.id === f.prioridade)) erros.push({ campo: 'prioridade', mensagem: 'Selecione a prioridade da demanda.' });
    if (!String(f.setor_destino || '').trim()) erros.push({ campo: 'setor_destino', mensagem: 'Informe o destino da viagem.' });
    if (String(f.motivo || '').trim().length < 3) erros.push({ campo: 'motivo', mensagem: 'Informe o motivo da viagem.' });

    if (f.tipo === 'PACIENTE') {
        if (!f.paciente_id) erros.push({ campo: 'paciente_id', mensagem: 'Selecione obrigatoriamente um paciente cadastrado/internado.' });
        if (!MEIOS_TRANSPORTE_NIR.some(m => m.id === f.meio_transporte)) erros.push({ campo: 'meio_transporte', mensagem: 'Selecione o meio de transporte.' });
    } else if (f.tipo === 'INSUMO') {
        if (String(f.insumo_descricao || '').trim().length < 3) erros.push({ campo: 'insumo_descricao', mensagem: 'Informe o item/lote ou descrição do medicamento/insumo.' });
        if (!String(f.setor_origem || '').trim()) erros.push({ campo: 'setor_origem', mensagem: 'Informe o setor de origem do insumo.' });
    }
    return erros;
}

/**
 * Cria uma demanda no NIR (para Paciente ou Medicamento/Insumo).
 * - Se for criada por um setor solicitante (Médico/Enfermagem/Imagenologia) sem documentação NIR anexada (`encaminhar_agora === false`),
 *   entra como `AGUARDANDO_NIR` para o setor NIR organizar e encaminhar a documentação necessária ao Setor de Transporte.
 * - Se for criada pelo próprio NIR já com a documentação conferida (`encaminhar_agora !== false`), já encaminha a documentação
 *   para o Setor de Transporte (`SOLICITADO_NIR`).
 */
async function criarDemandaTransporteNIR(f) {
    requirePermission('transporte_solicitar');
    const erros = validarDemandaTransporteNIR(f);
    if (erros.length) throw new Error(erros[0].mensagem);

    const u = quem();
    const agora = agoraISO();
    const hoje = todayISO().replace(/-/g, '');
    const seq = String((MOCK_DATA.TRANSPORTES_NIR || []).length + 1).padStart(4, '0');
    const protocolo = `NIR-${hoje}-${seq}`;

    let dadosPaciente = {};
    if (f.tipo === 'PACIENTE') {
        const pac = await db_getPaciente(f.paciente_id);
        const ativa = internacaoAtivaDoPaciente(f.paciente_id);
        const leitoObj = ativa ? leitoPorId(ativa.leito_id) : (f.leito_origem_id ? leitoPorId(f.leito_origem_id) : null);
        const origemAuto = ativa
            ? `${ativa.andar}º Andar · ${ativa.ala} · Leito ${leitoObj ? leitoObj.rotulo : ativa.leito_id}`
            : (String(f.setor_origem || 'Recepção / Ambulatório').trim());
        dadosPaciente = {
            paciente_id: f.paciente_id,
            paciente_nome: (pac && pac.nome) || f.paciente_nome || 'Paciente',
            prontuario: (pac && pac.prontuario) || (ativa && ativa.prontuario) || f.prontuario || '',
            internacao_id: ativa ? ativa.id : '',
            leito_origem_id: ativa ? ativa.leito_id : (f.leito_origem_id || ''),
            setor_origem: origemAuto,
            meio_transporte: f.meio_transporte,
            suporte: Array.isArray(f.suporte) ? f.suporte : []
        };
    } else {
        dadosPaciente = {
            insumo_descricao: String(f.insumo_descricao).trim(),
            insumo_lote: String(f.insumo_lote || '').trim(),
            insumo_qtd: Number(f.insumo_qtd) || 1,
            setor_origem: String(f.setor_origem).trim(),
            meio_transporte: f.meio_transporte || 'MALOTE_TERMICO',
            suporte: []
        };
    }

    const podeRegularNIR = hasPermission('nir_gerenciar');
    const jaEncaminha = f.encaminhar_agora !== undefined ? Boolean(f.encaminhar_agora && podeRegularNIR) : podeRegularNIR;
    const docsLista = Array.isArray(f.documentos_nir) && f.documentos_nir.length
        ? f.documentos_nir
        : (f.tipo === 'PACIENTE'
            ? ['FICHA_REGULACAO_NIR', 'RESUMO_CLINICO', 'GUIA_EXAME_APAC', 'VAGA_CONFIRMADA']
            : ['FICHA_REGULACAO_NIR', 'TERMO_TRANSFERENCIA']);
    const guiaNum = String(f.numero_guia_nir || `DOC-NIR-${hoje}-${seq}`).trim();

    const documentacao_nir = jaEncaminha
        ? {
            encaminhada: true,
            numero_guia: guiaNum,
            documentos: docsLista,
            observacoes: String(f.observacoes_nir || 'Documentação conferida, organizada pelo NIR e encaminhada ao Setor de Transporte.').trim(),
            organizado_por: u.por_nome,
            encaminhado_em: agora
        }
        : {
            encaminhada: false,
            numero_guia: '',
            documentos: docsLista,
            observacoes: String(f.observacoes_nir || 'Aguardando conferência e encaminhamento documental pelo NIR.').trim(),
            organizado_por: '',
            encaminhado_em: ''
        };

    const statusInicial = jaEncaminha ? 'SOLICITADO_NIR' : 'AGUARDANDO_NIR';

    const demanda = {
        id: newId('nir'),
        protocolo,
        tipo: f.tipo,
        prioridade: f.prioridade,
        ...dadosPaciente,
        setor_destino: String(f.setor_destino).trim(),
        motivo: String(f.motivo).trim(),
        solicitacao_exame_id: f.solicitacao_exame_id || '',
        solicitante_nome: String(f.solicitante_nome || u.por_nome).trim(),
        documentacao_nir,
        status: statusInicial,
        equipe: null,
        criado_em: agora,
        criado_por: u.por,
        historico: [
            {
                status: statusInicial,
                em: agora,
                por: u.por_nome,
                detalhe: jaEncaminha
                    ? `NIR organizou e encaminhou a documentação (${guiaNum}) para o Setor de Transporte`
                    : `Demanda enviada ao NIR para organização e encaminhamento da documentação necessária`
            }
        ]
    };

    await setDocH(COLH.TRANSPORTES, demanda);

    if (f.solicitacao_exame_id) {
        const sol = await getDocH(COLH.SOLICITACOES, f.solicitacao_exame_id);
        if (sol) {
            await setDocH(COLH.SOLICITACOES, {
                ...sol,
                transporte_nir_id: demanda.id,
                historico: [...(sol.historico || []), { status: sol.status, em: agora, por: u.por_nome, motivo: `Encaminhado ao NIR (${demanda.protocolo})` }]
            });
        }
    }

    if (typeof auditar === 'function') {
        await auditar({ entidade: 'transporte_nir', entidade_id: demanda.id, acao: 'CRIAR', depois: { protocolo: demanda.protocolo, tipo: demanda.tipo, status: statusInicial, destino: demanda.setor_destino } });
    }
    return demanda;
}

/**
 * SETOR 1 (NIR): Organiza a demanda, confere/anexa a documentação necessária e encaminha formalmente ao Setor de Transporte.
 */
async function encaminharDocumentacaoNIR(id, { numero_guia_nir = '', documentos = [], observacoes_nir = '', meio_transporte = '', prioridade = '', suporte = null } = {}) {
    requirePermission('nir_gerenciar');
    const atual = await getDocH(COLH.TRANSPORTES, id);
    if (!atual) throw new Error('Demanda do NIR não encontrada.');
    if (['CONCLUIDO', 'CANCELADO'].includes(atual.status)) throw new Error('Esta demanda já foi encerrada.');
    const docsValidos = (Array.isArray(documentos) ? documentos : []).filter(Boolean);
    if (!docsValidos.length) throw new Error('Selecione ao menos um documento conferido pelo NIR para encaminhar ao Setor de Transporte.');
    const guia = String(numero_guia_nir || (atual.documentacao_nir && atual.documentacao_nir.numero_guia) || `DOC-${atual.protocolo}`).trim();
    if (guia.length < 3) throw new Error('Informe o número da Guia / Protocolo Documental do NIR.');

    const u = quem();
    const agora = agoraISO();
    const documentacao_nir = {
        encaminhada: true,
        numero_guia: guia,
        documentos: docsValidos,
        observacoes: String(observacoes_nir || 'Documentação conferida e encaminhada ao Setor de Transporte.').trim(),
        organizado_por: u.por_nome,
        encaminhado_em: agora
    };

    const novoStatus = atual.status === 'AGUARDANDO_NIR' ? 'SOLICITADO_NIR' : atual.status;
    const novo = {
        ...atual,
        prioridade: prioridade || atual.prioridade,
        meio_transporte: meio_transporte || atual.meio_transporte,
        suporte: Array.isArray(suporte) ? suporte : atual.suporte,
        documentacao_nir,
        status: novoStatus,
        historico: [
            ...(atual.historico || []),
            {
                status: novoStatus,
                em: agora,
                por: `${u.por_nome} (NIR)`,
                detalhe: `Documentação organizada e encaminhada ao Setor de Transporte · Guia: ${guia} (${docsValidos.map(rotuloDocumentoNIR).join(', ')})`
            }
        ]
    };
    await setDocH(COLH.TRANSPORTES, novo);
    if (typeof auditar === 'function') {
        await auditar({ entidade: 'transporte_nir', entidade_id: id, acao: 'ENCAMINHAR_DOCUMENTACAO_NIR', depois: documentacao_nir });
    }
    return novo;
}

/**
 * SETOR 2 (SETOR DE TRANSPORTE): Etapa 1 — Designar equipe (motorista/maqueiro e veículo/maca).
 * Exige que o NIR já tenha encaminhado a documentação (`SOLICITADO_NIR`).
 */
async function designarEquipeTransporteNIR(id, { motorista_maqueiro, veiculo_maca }) {
    requirePermission('transporte_gerenciar');
    const atual = await getDocH(COLH.TRANSPORTES, id);
    if (!atual) throw new Error('Demanda de transporte não encontrada.');
    if (atual.status === 'AGUARDANDO_NIR' || (atual.documentacao_nir && atual.documentacao_nir.encaminhada === false)) {
        throw new Error('Aguardando o setor NIR organizar e encaminhar a documentação necessária antes de designar a equipe de transporte.');
    }
    if (!transicaoTransportePermitida(atual.status, 'EQUIPE_DESIGNADA')) {
        throw new Error(`Não é possível designar equipe para uma demanda "${rotuloStatusTransporteNIR(atual.status)}".`);
    }
    if (String(motorista_maqueiro || '').trim().length < 3) throw new Error('Informe o nome do motorista ou maqueiro responsável.');
    if (String(veiculo_maca || '').trim().length < 2) throw new Error('Informe a identificação do veículo, maca ou cadeira.');

    const u = quem();
    const agora = agoraISO();
    const equipe = {
        motorista_maqueiro: String(motorista_maqueiro).trim(),
        veiculo_maca: String(veiculo_maca).trim(),
        designado_em: agora,
        designado_por: u.por_nome
    };
    const novo = {
        ...atual,
        status: 'EQUIPE_DESIGNADA',
        equipe,
        historico: [...(atual.historico || []), { status: 'EQUIPE_DESIGNADA', em: agora, por: `${u.por_nome} (Transporte)`, detalhe: `Equipe de Transporte designada: ${equipe.motorista_maqueiro} · ${equipe.veiculo_maca}` }]
    };
    await setDocH(COLH.TRANSPORTES, novo);
    if (typeof auditar === 'function') await auditar({ entidade: 'transporte_nir', entidade_id: id, acao: 'DESIGNAR_EQUIPE', depois: equipe });
    return novo;
}

/** SETOR 2 (SETOR DE TRANSPORTE): Etapa 2 — Iniciar trânsito (ativa o selo "Em Transporte" no Mapa de Leitos e no Prontuário). */
async function iniciarTransitoNIR(id) {
    requirePermission('transporte_gerenciar');
    const atual = await getDocH(COLH.TRANSPORTES, id);
    if (!atual) throw new Error('Demanda de transporte não encontrada.');
    if (!transicaoTransportePermitida(atual.status, 'EM_TRANSITO')) {
        throw new Error(`Não é possível iniciar trânsito a partir de "${rotuloStatusTransporteNIR(atual.status)}".`);
    }
    const u = quem();
    const agora = agoraISO();
    const novo = {
        ...atual,
        status: 'EM_TRANSITO',
        inicio_transito_em: agora,
        historico: [...(atual.historico || []), { status: 'EM_TRANSITO', em: agora, por: `${u.por_nome} (Transporte)`, detalhe: `Setor de Transporte iniciou o deslocamento: ${atual.setor_origem} → ${atual.setor_destino}` }]
    };
    await setDocH(COLH.TRANSPORTES, novo);
    if (typeof auditar === 'function') await auditar({ entidade: 'transporte_nir', entidade_id: id, acao: 'INICIAR_TRANSITO', depois: { status: 'EM_TRANSITO', destino: atual.setor_destino } });
    return novo;
}

/**
 * SETOR 2 (SETOR DE TRANSPORTE): Etapa 3 — Concluir transporte no destino.
 * Se for transporte de PACIENTE, grava automaticamente na linha do tempo do Prontuário Digital do paciente!
 */
async function concluirTransporteNIR(id, { recebido_por = '', observacoes = '' } = {}) {
    requirePermission('transporte_gerenciar');
    const atual = await getDocH(COLH.TRANSPORTES, id);
    if (!atual) throw new Error('Demanda de transporte não encontrada.');
    if (!transicaoTransportePermitida(atual.status, 'CONCLUIDO')) {
        throw new Error(`Não é possível concluir uma viagem com status "${rotuloStatusTransporteNIR(atual.status)}".`);
    }
    const u = quem();
    const agora = agoraISO();
    const det = [recebido_por && `Recebido por: ${String(recebido_por).trim()}`, observacoes && String(observacoes).trim()].filter(Boolean).join(' · ') || 'Entregue no destino pelo Setor de Transporte';
    const novo = {
        ...atual,
        status: 'CONCLUIDO',
        concluido_em: agora,
        concluido_por: u.por_nome,
        recebido_por: String(recebido_por || '').trim(),
        observacoes_conclusao: String(observacoes || '').trim(),
        historico: [...(atual.historico || []), { status: 'CONCLUIDO', em: agora, por: `${u.por_nome} (Transporte)`, detalhe: det }]
    };
    await setDocH(COLH.TRANSPORTES, novo);

    // Integração Cruzada: registrar automaticamente uma entrada na linha do tempo do Prontuário Digital do paciente
    if (atual.tipo === 'PACIENTE' && atual.paciente_id) {
        const internacao = internacaoAtivaDoPaciente(atual.paciente_id) || (atual.internacao_id ? MOCK_DATA.INTERNACOES.find(i => i.id === atual.internacao_id) : null);
        const leitoRot = atual.leito_origem_id ? ((leitoPorId(atual.leito_origem_id) || { rotulo: atual.leito_origem_id }).rotulo) : atual.setor_origem;
        const eqInfo = atual.equipe ? ` · Equipe de Transporte: ${atual.equipe.motorista_maqueiro} (${atual.equipe.veiculo_maca})` : '';
        const guiaInfo = atual.documentacao_nir && atual.documentacao_nir.numero_guia ? ` · Doc. NIR: ${atual.documentacao_nir.numero_guia}` : '';
        const textoTimeline = `Transporte concluído via NIR (${atual.protocolo}${guiaInfo}): Leito ${leitoRot} (${atual.setor_origem}) → ${atual.setor_destino} - Motivo: ${atual.motivo}${eqInfo}${recebido_por ? ' · Recebido por: ' + String(recebido_por).trim() : ''}.`;
        await registrarClinico({
            internacao,
            paciente_id: atual.paciente_id,
            tipo: 'TRANSPORTE_NIR',
            transporte_id: atual.id,
            texto: textoTimeline
        });
    }

    if (typeof auditar === 'function') await auditar({ entidade: 'transporte_nir', entidade_id: id, acao: 'CONCLUIR', depois: { status: 'CONCLUIDO', concluido_em: agora } });
    return novo;
}

/** Cancelar demanda (pelo NIR ou Setor de Transporte, com justificativa obrigatória). */
async function cancelarTransporteNIR(id, motivo) {
    if (!hasPermission('transporte_gerenciar') && !hasPermission('nir_gerenciar') && !hasPermission('transporte_solicitar')) {
        throw new Error('Acesso negado: seu perfil não pode cancelar demandas.');
    }
    const atual = await getDocH(COLH.TRANSPORTES, id);
    if (!atual) throw new Error('Demanda de transporte não encontrada.');
    if (!transicaoTransportePermitida(atual.status, 'CANCELADO')) {
        throw new Error(`Não é possível cancelar uma demanda "${rotuloStatusTransporteNIR(atual.status)}".`);
    }
    if (String(motivo || '').trim().length < 5) {
        throw new Error('Informe a justificativa do cancelamento (mínimo de 5 caracteres).');
    }
    const u = quem();
    const agora = agoraISO();
    const novo = {
        ...atual,
        status: 'CANCELADO',
        motivo_cancelamento: String(motivo).trim(),
        cancelado_em: agora,
        cancelado_por: u.por_nome,
        historico: [...(atual.historico || []), { status: 'CANCELADO', em: agora, por: u.por_nome, detalhe: `Cancelado: ${String(motivo).trim()}` }]
    };
    await setDocH(COLH.TRANSPORTES, novo);
    if (typeof auditar === 'function') await auditar({ entidade: 'transporte_nir', entidade_id: id, acao: 'CANCELAR', motivo: String(motivo).trim() });
    return novo;
}

// ============================================================ ABA FARMÁCIA DO PRONTUÁRIO: DISTRIBUIÇÃO PARA OS PISOS & QUEM PEGOU O QUÊ

const STATUS_FARMACIA_PISO = {
    AGUARDANDO_RETIRADA: { rotulo: 'Na Farmácia (Aguardando Retirada p/ o Piso)', cor: '#d97706', fundo: '#fef3c7', badge: 'at-badge--urgente' },
    DISTRIBUIDO_PISO: { rotulo: 'Retirado / Distribuído para o Piso', cor: '#0284c7', fundo: '#e0f2fe', badge: 'at-badge--outros' },
    ADMINISTRADO: { rotulo: 'Administrado no Paciente (Leito)', cor: '#16a34a', fundo: '#dcfce7', badge: 'at-badge--ok' }
};

const PROFISSIONAIS_RETIRADA_PISOS = [
    { nome: 'Téc. Enf. Juliana Martins', cargo: 'Técnica de Enfermagem (2º Piso - Neuro)', doc: 'COREN-TO 224510 · Mat. FN-1042', piso: '2' },
    { nome: 'Enfermeiro Teste', cargo: 'Enfermeiro Plantonista (2º Piso - Neuro)', doc: 'COREN-TO 118920 · Mat. FN-1015', piso: '2' },
    { nome: 'Enf. Marcos Paulo Ribeiro', cargo: 'Enfermeiro Assistencial (3º Piso - Clínica Médica)', doc: 'COREN-TO 145800 · Mat. FN-2088', piso: '3' },
    { nome: 'Téc. Enf. Camila Souza', cargo: 'Técnica de Enfermagem (3º Piso - Cardio/Nefro)', doc: 'COREN-TO 310442 · Mat. FN-2104', piso: '3' },
    { nome: 'Téc. Enf. Rafael Gomes', cargo: 'Técnico de Enfermagem (1º Piso - Pediatria)', doc: 'COREN-TO 198221 · Mat. FN-0891', piso: '1' },
    { nome: 'Téc. Enf. Fernanda Lima', cargo: 'Técnica de Enfermagem (4º Piso - Cirúrgica)', doc: 'COREN-TO 275119 · Mat. FN-3012', piso: '4' }
];

const rotuloStatusFarmacia = (s) => (STATUS_FARMACIA_PISO[s] || { rotulo: s || '—' }).rotulo;

function dispensacoesDoPaciente(pacienteId) {
    return (MOCK_DATA.FARMACIA_DISPENSACOES || [])
        .filter(f => f.paciente_id === pacienteId)
        .sort((a, b) => String(b.prescrito_em || '').localeCompare(String(a.prescrito_em || '')));
}

/**
 * Cria um novo registro de medicamento a ser distribuído para um Piso/Ala/Leito (e opcionalmente já registra quem pegou na Farmácia).
 */
async function criarDispensacaoFarmaciaPiso(f) {
    if (!hasPermission('prontuario_ver') && !hasPermission('prescrever')) {
        throw new Error('Acesso negado para registrar distribuição de medicamentos.');
    }
    const med = String(f.medicamento || '').trim();
    const dose = String(f.dose || '').trim();
    const qtd = String(f.quantidade || '').trim();
    if (med.length < 2) throw new Error('Informe o nome do medicamento.');
    if (!dose) throw new Error('Informe a apresentação ou dose do medicamento.');
    if (!qtd) throw new Error('Informe a quantidade a ser distribuída para o piso.');
    if (!f.paciente_id) throw new Error('Selecione o paciente / leito de destino no piso.');

    const pac = await db_getPaciente(f.paciente_id);
    const ativa = internacaoAtivaDoPaciente(f.paciente_id);
    const andar = String((ativa && ativa.andar) || f.piso_andar || '1');
    const ala = (ativa && ativa.ala) || f.ala_setor || 'Unidade de Internação';
    const leitoId = (ativa && ativa.leito_id) || f.leito_id || '';
    const leitoRot = leitoId ? ((leitoPorId(leitoId) || { rotulo: leitoId }).rotulo) : 'Sem leito';

    const u = quem();
    const agora = agoraISO();
    const hoje = todayISO().replace(/-/g, '');
    const seq = String((MOCK_DATA.FARMACIA_DISPENSACOES || []).length + 1).padStart(4, '0');

    let status = 'AGUARDANDO_RETIRADA';
    let retirada = null;

    if (f.ja_retirado) {
        const qNome = String(f.quem_pegou_nome || '').trim();
        const qCargo = String(f.quem_pegou_cargo || '').trim();
        const qDoc = String(f.quem_pegou_documento || '').trim();
        if (qNome.length < 3) throw new Error('Informe o nome completo do profissional que pegou o medicamento.');
        if (qCargo.length < 2) throw new Error('Informe o cargo/setor de quem pegou o medicamento.');
        if (qDoc.length < 3) throw new Error('Informe a matrícula ou registro (COREN/CPF) de quem pegou.');
        status = 'DISTRIBUIDO_PISO';
        retirada = {
            quem_pegou_nome: qNome,
            quem_pegou_cargo: qCargo,
            quem_pegou_documento: qDoc,
            dispensado_por: String(f.dispensado_por || u.por_nome).trim(),
            retirado_em: agora,
            observacao: String(f.observacao || '').trim()
        };
    }

    const reg = {
        id: newId('far'),
        codigo: `FAR-${hoje}-${seq}`,
        paciente_id: f.paciente_id,
        paciente_nome: (pac && pac.nome) || (ativa && ativa.paciente_nome) || 'Paciente',
        prontuario: (pac && pac.prontuario) || (ativa && ativa.prontuario) || '',
        internacao_id: ativa ? ativa.id : '',
        piso_andar: andar,
        piso_rotulo: `${andar}º Andar (Piso ${andar})`,
        ala_setor: ala,
        leito_id: leitoId,
        leito_rotulo: leitoRot,
        medicamento: med,
        dose,
        via: String(f.via || 'VO').trim(),
        frequencia: String(f.frequencia || 'Conforme prescrição').trim(),
        lote: String(f.lote || '').trim(),
        quantidade: qtd,
        prescrito_por: u.por_nome,
        prescrito_em: agora,
        status,
        retirada,
        administracao: null
    };

    await setDocH(COLH.FARMACIA, reg);

    if (retirada) {
        await registrarClinico({
            internacao: ativa,
            paciente_id: reg.paciente_id,
            tipo: 'FARMACIA_PISO',
            texto: `Farmácia — Distribuição para o ${reg.piso_rotulo} (${reg.ala_setor} · Leito ${reg.leito_rotulo}): ${reg.medicamento} ${reg.dose} (Qtd: ${reg.quantidade}${reg.lote ? ' · Lote: ' + reg.lote : ''}) — QUEM PEGOU: ${retirada.quem_pegou_nome} (${retirada.quem_pegou_cargo} · ${retirada.quem_pegou_documento}) · Dispensado por: ${retirada.dispensado_por}.`
        });
    }

    if (typeof auditar === 'function') {
        await auditar({ entidade: 'farmacia_piso', entidade_id: reg.id, acao: 'CRIAR', depois: { codigo: reg.codigo, medicamento: reg.medicamento, piso: reg.piso_rotulo, status: reg.status } });
    }
    return reg;
}

/**
 * Registra QUEM PEGOU o medicamento na Farmácia para levar ao Piso / Posto de Enfermagem / Leito.
 * Grava também na linha do tempo do Prontuário Digital do paciente.
 */
async function registrarRetiradaFarmaciaPiso(id, { quem_pegou_nome, quem_pegou_cargo, quem_pegou_documento, dispensado_por = '', lote = '', observacao = '' }) {
    if (!hasPermission('prontuario_ver') && !hasPermission('prontuario_evoluir')) {
        throw new Error('Acesso negado para registrar retirada de medicamento na Farmácia.');
    }
    const atual = await getDocH(COLH.FARMACIA, id);
    if (!atual) throw new Error('Registro de dispensação não encontrado.');
    const qNome = String(quem_pegou_nome || '').trim();
    const qCargo = String(quem_pegou_cargo || '').trim();
    const qDoc = String(quem_pegou_documento || '').trim();
    if (qNome.length < 3) throw new Error('Informe o nome completo de quem pegou o medicamento.');
    if (qCargo.length < 2) throw new Error('Informe a função / setor de quem pegou o medicamento.');
    if (qDoc.length < 3) throw new Error('Informe a matrícula ou conselho (COREN/CPF) de quem pegou.');

    const u = quem();
    const agora = agoraISO();
    const retirada = {
        quem_pegou_nome: qNome,
        quem_pegou_cargo: qCargo,
        quem_pegou_documento: qDoc,
        dispensado_por: String(dispensado_por || u.por_nome).trim(),
        retirado_em: agora,
        observacao: String(observacao || '').trim()
    };

    const novoLote = String(lote || atual.lote || '').trim();
    const novo = {
        ...atual,
        lote: novoLote,
        status: 'DISTRIBUIDO_PISO',
        retirada
    };
    await setDocH(COLH.FARMACIA, novo);

    const ativa = internacaoAtivaDoPaciente(atual.paciente_id);
    await registrarClinico({
        internacao: ativa,
        paciente_id: atual.paciente_id,
        tipo: 'FARMACIA_PISO',
        texto: `Farmácia — Medicamento Distribuído para o ${atual.piso_rotulo} (${atual.ala_setor} · Leito ${atual.leito_rotulo}): ${atual.medicamento} ${atual.dose} (Qtd: ${atual.quantidade}${novoLote ? ' · Lote: ' + novoLote : ''}) — QUEM PEGOU: ${retirada.quem_pegou_nome} (${retirada.quem_pegou_cargo} · ${retirada.quem_pegou_documento}) · Entregue pela Farmácia por: ${retirada.dispensado_por}.${retirada.observacao ? ' Obs.: ' + retirada.observacao : ''}`
    });

    if (typeof auditar === 'function') {
        await auditar({ entidade: 'farmacia_piso', entidade_id: id, acao: 'RETIRADA_PISO', depois: retirada });
    }
    return novo;
}

/** Confirma a administração do medicamento retirado diretamente no paciente no leito. */
async function confirmarAdministracaoFarmaciaLeito(id, { administrado_por = '', observacao = '' } = {}) {
    if (!hasPermission('prontuario_evoluir')) {
        throw new Error('Acesso negado: apenas Enfermagem ou Médico confirma a administração no leito.');
    }
    const atual = await getDocH(COLH.FARMACIA, id);
    if (!atual) throw new Error('Registro de medicamento não encontrado.');
    if (atual.status === 'AGUARDANDO_RETIRADA') {
        throw new Error('Registre primeiro quem pegou o medicamento na Farmácia antes de checar a administração no leito.');
    }
    const u = quem();
    const agora = agoraISO();
    const administracao = {
        administrado_por: String(administrado_por || u.por_nome).trim(),
        administrado_em: agora,
        observacao: String(observacao || '').trim()
    };
    const novo = { ...atual, status: 'ADMINISTRADO', administracao };
    await setDocH(COLH.FARMACIA, novo);

    const ativa = internacaoAtivaDoPaciente(atual.paciente_id);
    await registrarClinico({
        internacao: ativa,
        paciente_id: atual.paciente_id,
        tipo: 'FARMACIA_PISO',
        texto: `Checagem Beira-Leito (${atual.piso_rotulo} · Leito ${atual.leito_rotulo}): Medicamento ${atual.medicamento} (${atual.dose}, via ${atual.via}) ADMINISTRADO por ${administracao.administrado_por} (Retirado na Farmácia por ${atual.retirada ? atual.retirada.quem_pegou_nome : '—'}).${administracao.observacao ? ' Obs.: ' + administracao.observacao : ''}`
    });
    return novo;
}
