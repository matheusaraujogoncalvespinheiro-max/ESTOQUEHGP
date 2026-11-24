// #5: perfis e permissões editáveis. Só dados fictícios.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function carregar() {
    const ctx = vm.createContext({ console, state: { currentUser: null }, WATCHER_FACTORIES: {}, onSnapshotData: () => () => {} });
    vm.runInContext(fs.readFileSync('assets/js/core/permissions.js', 'utf8'), ctx);
    vm.runInContext(fs.readFileSync('assets/js/core/permissoes-banco.js', 'utf8'), ctx);
    return ctx;
}
const run = (ctx, code) => vm.runInContext(code, ctx);

test('permissões editáveis (#5): sem documento no banco vale o padrão do código', () => {
    const c = carregar();
    run(c, "state.currentUser = { role: 'FUNC_RECEPCAO', username: 'r' }");
    assert.equal(run(c, "hasPermission('recepcao_acessar')"), true);
    assert.equal(run(c, "hasPermission('prontuario_ver')"), false);
});

test('permissões editáveis (#5): conceder e retirar mudam o resultado; ADMIN nunca muda', () => {
    const c = carregar();
    run(c, "permissoesBancoAplicar([{ id: 'FUNC_RECEPCAO', concede: ['prontuario_ver'], revoga: ['recepcao_editar'] }, { id: 'ADMIN', concede: [], revoga: ['prontuario_ver'] }])");
    run(c, "state.currentUser = { role: 'FUNC_RECEPCAO', username: 'r' }");
    assert.equal(run(c, "hasPermission('prontuario_ver')"), true);
    assert.equal(run(c, "hasPermission('recepcao_editar')"), false);
    assert.equal(run(c, "hasPermission('recepcao_acessar')"), true);
    run(c, "state.currentUser = { role: 'ADMIN', username: 'a' }");
    assert.equal(run(c, "hasPermission('prontuario_ver')"), true);
});

test('permissões editáveis (#5): o padrão do código é calculado sem o banco e o usuário logado é preservado', () => {
    const c = carregar();
    run(c, "permissoesBancoAplicar([{ id: 'FUNC_RECEPCAO', concede: ['prontuario_ver'], revoga: [] }]); state.currentUser = { role: 'MEDICO', username: 'm' }");
    assert.equal(run(c, "permissaoPadraoDe('FUNC_RECEPCAO', 'prontuario_ver')"), false);
    assert.equal(run(c, "state.currentUser.username"), 'm');
    assert.equal(run(c, "_semPermissoesBanco"), false);
});

test('permissões editáveis (#5): validação e diferença sobre o padrão', () => {
    const c = carregar();
    assert.throws(() => run(c, "validarPermissoesPerfil('ADMIN', [], [])"), /Administrador/);
    assert.throws(() => run(c, "validarPermissoesPerfil('PERFIL_X', [], [])"), /desconhecido/);
    assert.throws(() => run(c, "validarPermissoesPerfil('MEDICO', ['inventada'], [])"), /não pode ser editada/);
    assert.throws(() => run(c, "validarPermissoesPerfil('MEDICO', ['mapa_ver'], ['mapa_ver'])"), /ao mesmo tempo/);
    const d = run(c, "JSON.stringify(diferencaPermissoes(['prontuario_ver', 'mapa_ver'], (a) => a === 'mapa_ver' || a === 'recepcao_acessar'))");
    const r = JSON.parse(d);
    assert.deepEqual(r.concede, ['prontuario_ver']);
    assert.deepEqual(r.revoga, ['recepcao_acessar']);
});

test('perfis personalizados: id derivado do nome, nome repetido recusado, nasce sem permissão e a concessão vale', () => {
    const c = carregar();
    assert.equal(run(c, "idPerfilPersonalizado('Auditoria Interna')"), 'X_AUDITORIA_INTERNA');
    assert.throws(() => run(c, "validarPerfilPersonalizado('ab')"), /de 3 a 40/);
    assert.throws(() => run(c, "validarPerfilPersonalizado('Auditoria', ['X_AUDITORIA'])"), /Já existe/);
    run(c, "permissoesBancoAplicar([{ id: 'X_AUDITORIA', nome: 'Auditoria', personalizado: true, concede: ['obito_ver'], revoga: [] }, { id: 'X_FALSO', personalizado: false, concede: [], revoga: [] }])");
    assert.equal(run(c, "ASSIGNABLE_ROLES.includes('X_AUDITORIA')"), true);
    assert.equal(run(c, "ASSIGNABLE_ROLES.includes('X_FALSO')"), false);
    assert.equal(run(c, "getRoleLabel('X_AUDITORIA')"), 'Auditoria');
    run(c, "state.currentUser = { role: 'X_AUDITORIA', username: 'a' }");
    assert.equal(run(c, "hasPermission('obito_ver')"), true);
    assert.equal(run(c, "hasPermission('prontuario_ver')"), false);
    run(c, "permissoesBancoAplicar([])");
    assert.equal(run(c, "ASSIGNABLE_ROLES.includes('X_AUDITORIA')"), false);   // sumiu do banco, sai da lista
});
