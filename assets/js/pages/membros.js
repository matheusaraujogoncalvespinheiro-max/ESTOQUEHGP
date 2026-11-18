// Gerenciamento de membros (usuários e perfis)

// Gerenciamento de membros

function handleAddMember(e) {
    e.preventDefault();
    const form = e.target;
    const username = form.username.value.toLowerCase();
    const password = form.password.value;
    const name = form.name.value;
    const role = form.role.value;

    if (USERS_DB[username]) {
        showMsg("Erro: Nome de utilizador já existe!", "error");
        return;
    }

    USERS_DB[username] = {
        password: password,
        role: role,
        name: name
    };

    saveToLocalStorage();
    if (typeof db_saveMember === 'function') db_saveMember(username, USERS_DB[username]);
    showMsg("Membro " + name + " adicionado com sucesso!");
    form.reset();
}

function handleRemoveMember(username) {
    if (confirm("Tem certeza que deseja remover o usuário \"" + username + "\"?")) {
        delete USERS_DB[username];
        if (typeof db_deleteMember === 'function') db_deleteMember(username);
        saveToLocalStorage();
        if (typeof db_deleteMember === 'function') db_deleteMember(username);
        showMsg("Usuário \"" + username + "\" removido com sucesso!");
        render();
    }
}

function handleEditMember(username) {
    const user = USERS_DB[username];
    if (!user) return;

    const newName = prompt("Digite o novo nome completo:", user.name);
    if (newName === null) return;

    const newRole = prompt("Digite o novo tipo de usuário (" + ASSIGNABLE_ROLES.join(", ") + "):", user.role);
    if (newRole === null) return;

    if (!ASSIGNABLE_ROLES.includes(newRole)) {
        alert("Tipo de usuário inválido!");
        return;
    }

    const changePassword = confirm("Deseja alterar a senha deste usuário?");
    if (changePassword) {
        const newPassword = prompt("Digite a nova senha:");
        if (newPassword === null) {
            // Cancelou
        } else if (newPassword.trim() !== "") {
            user.password = newPassword.trim();
        } else {
            alert("A senha não pode ser vazia. Mantendo a senha anterior.");
        }
    }

    user.name = newName;
    user.role = newRole;
    saveToLocalStorage();
    if (typeof db_saveMember === 'function') db_saveMember(username, user);
    
    showMsg("Usuário \"" + username + "\" atualizado com sucesso!");
    render();
}

function renderMembers() {
    const users = Object.entries(USERS_DB);

    return `
    <div class="space-y-6" >
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 class="text-2xl font-bold text-slate-900 mb-6">Adicionar Novo Membro</h2>

            <form onsubmit="handleAddMember(event)" class="space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Nome Completo *</label>
            <input type="text" name="name" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Nome de Usuário *</label>
            <input type="text" name="username" oninput="this.value = this.value.replace(/[^a-zA-Z0-9]/g, '')" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Senha *</label>
            <input type="password" name="password" oninput="this.value = this.value.replace(/[^a-zA-Z0-9]/g, '')" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Tipo de Usuário *</label>
            <select name="role" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            <option value="">Selecione um tipo</option>
            <option value="ADMIN">Administrador Geral</option>
            <option value="CHEFE_OPME">Chefe OPME</option>
            <option value="CHEFE_HEMODINAMICA">Chefe Hemodinâmica</option>
            <option value="FUNC_HEMODINAMICA">Funcionário Hemodinâmica</option>
            <option value="FUNC_OPME">Funcionário OPME</option>
            <option value="FUNC_CENTRO_CIRURGICO">Funcionário Centro Cirúrgico</option>
            <option value="FUNC_ENFERMAGEM">Funcionário Enfermagem</option>
            <option value="CHEFE_PORTARIA">Chefe Portaria</option>
            <option value="FUNC_PORTARIA">Funcionário Portaria</option>
            <option value="FUNC_RECEPCAO">Funcionário Recepção</option>
            <option value="FUNC_EMERGENCIA">Funcionário Emergência</option>
            <option value="COORD_TRIAGEM">Coordenador de Triagem</option>
            </select>
            </div>
            </div>

            <div class="pt-4">
            <button type="submit" class="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-4 rounded-xl shadow-lg transition-all active:scale-95">
            Adicionar Membro
            </button>
            </div>
            </form>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div class="px-6 py-4 border-b border-slate-200">
            <h3 class="text-lg font-bold text-slate-900">Membros Registrados (${users.length})</h3>
            </div>

            <div class="divide-y divide-slate-100">
            ${users.map(([username, user]) => `
            <div class="px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 transition-colors">
            <div class="flex items-center gap-4 min-w-0">
            <div class="w-12 h-12 shrink-0 bg-blue-500/20 rounded-xl flex items-center justify-center font-bold text-blue-400 border border-blue-500/30">
            ${user.name[0]}
            </div>
            <div class="min-w-0">
            <div class="font-bold text-slate-900 break-words">${user.name}</div>
            <div class="text-sm text-slate-500 break-all">${username}</div>
            </div>
            </div>

            <div class="flex items-center justify-between sm:justify-end gap-3 pl-16 sm:pl-0">
            <span class="bg-slate-100 text-slate-800 text-xs font-bold px-3 py-1 rounded-full">
            ${getRoleLabel(user.role)}
            </span>

            ${(state.currentUser.role === 'ADMIN' || state.currentUser.role === 'CHEFE_OPME') && username !== 'admin' ? `
            <div class="flex gap-2">
            <button onclick="handleEditMember('${username}')" class="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
            <i data-lucide="edit" class="w-4 h-4 text-slate-600"></i>
            </button>
            <button onclick="handleRemoveMember('${username}')" class="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 flex items-center justify-center transition-colors">
            <i data-lucide="trash-2" class="w-4 h-4 text-red-600"></i>
            </button>
            </div>
            ` : ''}
            </div>
            </div>
            `).join('')}
            </div>
        </div>
    </div> `;
}

// Expor funções usadas em atributos onclick/oninput do HTML
window.handleAddMember = handleAddMember;
window.handleEditMember = handleEditMember;
window.handleRemoveMember = handleRemoveMember;
