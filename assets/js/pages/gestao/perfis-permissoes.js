// Tela Perfis e Permissões (#5): o Administrador marca o que cada perfil pode fazer. Ver core/permissoes-banco.js para o alcance.

const permPerfilState = { role: '', marcadas: null, salvando: false };

function renderPerfisPermissoes() {
    db_watch('permissoes');
    if (!state.currentUser || state.currentUser.role !== 'ADMIN') return '<div class="at-card at-empty">Acesso restrito ao Administrador.</div>';
    const perfis = ASSIGNABLE_ROLES.filter(r => r !== 'ADMIN');
    const st = permPerfilState;
    if (st.role && !perfis.includes(st.role)) st.role = '';
    let corpo = '<div class="at-card at-empty">Escolha um perfil para ver e alterar o que ele pode fazer.</div>';
    if (st.role) {
        if (!st.marcadas) st.marcadas = ACOES_EDITAVEIS.filter(a => permissaoPadraoDe(st.role, a) ? permissaoBancoDe(st.role, a) !== 'revoga' : permissaoBancoDe(st.role, a) === 'concede');
        const grupos = new Map();
        ACOES_EDITAVEIS.forEach(a => { const g = a.split('_')[0]; if (!grupos.has(g)) grupos.set(g, []); grupos.get(g).push(a); });
        const nome = (a) => a.replace(/_/g, ' ');
        corpo = `<section class="at-card">
            <p class="at-hint">${lucideIcon('info', 'w-4 h-4')} Vale nas telas e menus, e no banco só onde as regras já leem estas permissões (registros do prontuário e leitos). Em outras áreas, liberar uma tela não libera a gravação no banco. <strong>Alterado</strong> marca o que difere do padrão do sistema.</p>
            <div class="pp-grupos">${[...grupos.entries()].map(([g, acoes]) => `<fieldset class="pp-grupo"><legend>${escapeHtml(g)}</legend>${acoes.map(a => {
                const padrao = permissaoPadraoDe(st.role, a);
                const alterado = st.marcadas.includes(a) !== padrao;
                return `<label class="pp-acao"><input type="checkbox" ${st.marcadas.includes(a) ? 'checked' : ''} onchange="permPerfilMarcar('${a}', this.checked)"><span>${escapeHtml(nome(a))}</span>${alterado ? '<em class="pp-alt">Alterado</em>' : ''}</label>`;
            }).join('')}</fieldset>`).join('')}</div>
            <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" onclick="permPerfilRestaurar()">Voltar ao padrão do sistema</button><button type="button" class="at-btn at-btn--primary" onclick="permPerfilSalvar()" ${st.salvando ? 'disabled' : ''}>Salvar permissões</button></div>
        </section>`;
    }
    return `<div class="at-stack tone-teal">
        <section class="at-card"><h3 class="at-card__title">${lucideIcon('shield-check', 'w-5 h-5')} Perfis e Permissões</h3>
            <label class="at-field"><span class="at-label">Perfil</span><select class="at-input" onchange="permPerfilEscolher(this.value)"><option value="">-- Escolha --</option>${perfis.map(r => `<option value="${r}" ${r === st.role ? 'selected' : ''}>${escapeHtml(getRoleLabel(r))}</option>`).join('')}</select></label>
        </section>${corpo}</div>`;
}

function permPerfilEscolher(role) { permPerfilState.role = role; permPerfilState.marcadas = null; render(); }
function permPerfilMarcar(acao, ligado) {
    const m = permPerfilState.marcadas || [];
    permPerfilState.marcadas = ligado ? [...new Set([...m, acao])] : m.filter(x => x !== acao);
    render();
}
function permPerfilRestaurar() {
    permPerfilState.marcadas = ACOES_EDITAVEIS.filter(a => permissaoPadraoDe(permPerfilState.role, a));
    render();
}
async function permPerfilSalvar() {
    const st = permPerfilState;
    st.salvando = true;
    try {
        const r = await salvarPermissoesPerfil(st.role, st.marcadas || []);
        showMsg(`Permissões de ${getRoleLabel(st.role)} salvas: ${r.concede.length} concedidas a mais, ${r.revoga.length} retiradas.`);
        st.marcadas = null;
    } catch (err) { showMsg(err.message, 'error'); }
    st.salvando = false; render();
}
