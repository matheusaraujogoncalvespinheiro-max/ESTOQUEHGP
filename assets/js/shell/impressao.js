// Impressão da tela atual: botão "Imprimir" da barra de título, disponível em todas as telas que não têm uma impressão própria
// (consultas de cadastro, relatórios e a lista de prontuários já imprimem seus dados em formato de relatório).
// Mostra a pré-visualização (cadImprimirHtml) com o conteúdo da tela, sem botões, e o usuário escolhe a impressora.

/** Módulos que já têm o próprio botão de impressão (para não duplicar). */
function telaTemImpressaoPropria() {
    const m = state.activeModule;
    if (m === 'RELATORIOS') return true;
    if (m === 'CAD') return Boolean(state.cad) && state.cad.mode === 'list';
    if (m === 'PRONTUARIO') return !(state.prontuario && state.prontuario.pacienteId);
    return false;
}

function imprimirTelaAtual() {
    const original = document.querySelector('main.shell__content, main.imm-main');
    if (!original) return showMsg('Não há conteúdo para imprimir nesta tela.', 'error');
    const clone = original.cloneNode(true);

    // Campos viram texto (o clone não carrega o que foi digitado) e controles interativos saem da impressão
    const campos = [...original.querySelectorAll('input, select, textarea')];
    const clonados = [...clone.querySelectorAll('input, select, textarea')];
    campos.forEach((el, i) => {
        const alvo = clonados[i];
        if (!alvo || el.type === 'hidden' || el.type === 'file') { alvo && alvo.remove(); return; }
        let texto = el.value;
        if (el.tagName === 'SELECT') texto = el.selectedOptions[0] ? el.selectedOptions[0].textContent.trim() : '';
        if (el.type === 'checkbox' || el.type === 'radio') texto = el.checked ? '☑' : '☐';
        if (el.type === 'password') texto = '';
        const span = document.createElement('span');
        span.className = 'imp-valor';
        span.textContent = texto;
        alvo.replaceWith(span);
    });
    // Botões de ação saem; botões que são conteúdo (leitos do mapa, abas, seletores) viram texto
    const ACOES = ['at-btn', 'btn', 'cd-ico', 'cd-plus', 'cd-back', 'cd-searchbtn', 'cd-opt__info', 'pagebar__imprimir', 'imm-home', 'cd-combo__opt'];
    clone.querySelectorAll('button').forEach(b => {
        if (ACOES.some(c => b.classList.contains(c))) { b.remove(); return; }
        const span = document.createElement('span');
        span.className = b.className;
        span.innerHTML = b.innerHTML;
        b.replaceWith(span);
    });
    clone.querySelectorAll('video, canvas, svg, [data-lucide], .no-print, .cd-combo__pop, #global-toast-container').forEach(n => n.remove());

    const estilos = [...document.querySelectorAll('link[rel="stylesheet"], style')].map(n => n.outerHTML).join('\n');
    const titulo = getModuleTitle();
    cadImprimirHtml(`<!doctype html><html lang="pt-BR" data-tema="claro"><head><meta charset="utf-8"><base href="${escapeHtml(location.href)}"><title>${escapeHtml(titulo)}</title>
        ${estilos}
        <style>
            @page { size: A4 landscape; margin: 10mm; }
            html, body { background: #fff !important; color: #111 !important; }
            body { padding: 0; margin: 0; }
            main.shell__content, .shell__content { padding: 0 !important; margin: 0 !important; max-width: none !important; width: 100% !important; }
            .imp-cab { margin: 0 0 10px; padding-bottom: 6px; border-bottom: 2px solid #111; font-family: Arial, sans-serif; }
            .imp-cab h1 { margin: 0; font-size: 17px; } .imp-cab p { margin: 2px 0 0; font-size: 11px; color: #444; }
            .imp-valor { font-weight: 600; }
            .fade-in, .slide-in { animation: none !important; }
            table { page-break-inside: auto; } tr { page-break-inside: avoid; } thead { display: table-header-group; }
            * { box-shadow: none !important; }
        </style></head><body>
        <div class="imp-cab"><h1>${escapeHtml(APP_INFO.hospital)}</h1><p>${escapeHtml(titulo)} · emitido em ${escapeHtml(formatDateTimeBR(new Date().toISOString()))} por ${escapeHtml(state.currentUser.name)}</p></div>
        ${clone.outerHTML}</body></html>`, `Imprimir: ${titulo}`);
}
