const fs = require('fs');

let content = fs.readFileSync('java.js', 'utf8');

// 1. handleRegisterPatient - Remove if (supabase) and make it unconditional
content = content.replace(/if\s*\(supabase\)\s*db_savePatient\((.*?)\);/g, 'if (typeof db_savePatient === "function") db_savePatient($1);');

// 2. processarLaudo - same for supabase
content = content.replace(/if\s*\(supabase\)\s*db_saveLaudo\((.*?)\);/g, 'if (typeof db_saveLaudo === "function") db_saveLaudo($1);');

// 3. handleDischargePatient (Line 1681 & 3263)
content = content.replace(/paciente\.status\s*=\s*'ALTA';\s*paciente\.data_alta\s*=\s*new Date\(\)\.toISOString\(\);\s*if\s*\(!MOCK_DATA\.PATIENTS_HISTORY\)(\s*MOCK_DATA\.PATIENTS_HISTORY\s*=\s*\[\];)?\s*MOCK_DATA\.PATIENTS_HISTORY\.unshift\(paciente\);/g, `paciente.status = 'ALTA';\n        paciente.data_alta = new Date().toISOString();\n        if (!MOCK_DATA.PATIENTS_HISTORY) MOCK_DATA.PATIENTS_HISTORY = [];\n        MOCK_DATA.PATIENTS_HISTORY.unshift(paciente);\n        if (typeof db_savePatient === 'function') db_savePatient(paciente);`);

// 4. handleTransfer
content = content.replace(/TRANSFER_HISTORY\.unshift\(itemHistorico\);/g, `TRANSFER_HISTORY.unshift(itemHistorico);\n        if (typeof db_saveTransferHistory === 'function') db_saveTransferHistory(itemHistorico);\n        if (typeof db_saveProduct === 'function') db_saveProduct(produtoOrigem, setorOrigem);\n        if (typeof db_saveProduct === 'function') db_saveProduct(produtoDestino, setorDestino);`);

// 5. handleCreateSchedule
content = content.replace(/MOCK_DATA\.MAPA_SCHEDULE\.push\(novoItem\);/g, `MOCK_DATA.MAPA_SCHEDULE.push(novoItem);\n    if (typeof db_saveSchedule === 'function') db_saveSchedule(novoItem);`);

// 6. handleDeleteSchedule
content = content.replace(/MOCK_DATA\.MAPA_SCHEDULE\.splice\(index,\s*1\);/g, `const idToDelete = MOCK_DATA.MAPA_SCHEDULE[index].id;\n        MOCK_DATA.MAPA_SCHEDULE.splice(index, 1);\n        if (typeof db_deleteSchedule === 'function' && idToDelete) db_deleteSchedule(idToDelete);`);

// 7. updateQuantity
content = content.replace(/loteExistente\.quantidade\s*\+=\s*diff;\s*produtoExistente\.qtd\s*\+=\s*diff;/g, `loteExistente.quantidade += diff;\n        produtoExistente.qtd += diff;\n        if (typeof db_saveProduct === 'function') db_saveProduct(produtoExistente, setor).then(p => { if (p && typeof db_saveBatch === 'function') db_saveBatch(p.id, loteExistente); });`);

// 8. handleAddMember / handleEditMember
content = content.replace(/USERS_DB\[username\]\s*=\s*{\s*password:\s*senha,\s*role:\s*nivel,\s*name:\s*nome\s*};/g, `USERS_DB[username] = {\n        password: senha,\n        role: nivel,\n        name: nome\n    };\n    if (typeof db_saveMember === 'function') db_saveMember(username, USERS_DB[username]);`);

content = content.replace(/USERS_DB\[usernameEdit\]\s*=\s*{\s*password:\s*senhaEdit,\s*role:\s*nivelEdit,\s*name:\s*nomeEdit\s*};/g, `USERS_DB[usernameEdit] = {\n        password: senhaEdit,\n        role: nivelEdit,\n        name: nomeEdit\n    };\n    if (typeof db_saveMember === 'function') db_saveMember(usernameEdit, USERS_DB[usernameEdit]);`);

// 9. handleRemoveMember
content = content.replace(/delete\s*USERS_DB\[username\];/g, `delete USERS_DB[username];\n    if (typeof db_deleteMember === 'function') db_deleteMember(username);`);

// 10. addNotification
content = content.replace(/NOTIFICATIONS\.unshift\(notificacao\);/g, `NOTIFICATIONS.unshift(notificacao);\n    if (typeof db_saveNotification === 'function') db_saveNotification(notificacao);`);

// 11. handleSaveProcedimentoNaoRealizado
content = content.replace(/MOCK_DATA\.PROCEDIMENTOS_NAO_REALIZADOS\.unshift\(novoProcedimento\);/g, `MOCK_DATA.PROCEDIMENTOS_NAO_REALIZADOS.unshift(novoProcedimento);\n    if (typeof db_saveNotPerformed === 'function') db_saveNotPerformed(novoProcedimento);`);

// 12. handleRequestMaterial (java.js / temp versions)
content = content.replace(/MOCK_DATA\.REQUESTS\.unshift\(novoPedido\);/g, `MOCK_DATA.REQUESTS.unshift(novoPedido);\n    if (typeof db_saveRequest === 'function') db_saveRequest(novoPedido);`);

fs.writeFileSync('java.js', content, 'utf8');
console.log('java.js patched successfully.');
