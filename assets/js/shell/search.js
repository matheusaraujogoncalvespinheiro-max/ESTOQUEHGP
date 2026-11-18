// Pesquisa de telas do cabeçalho (só as telas que o perfil pode abrir)

let searchHits = [];
let searchActive = -1;

function searchLeaves(text) {
    const termos = normalizeText(text).split(/\s+/).filter(Boolean);
    if (!termos.length) return [];
    const seen = new Set();
    return leafRegistry
        .filter(l => {
            const key = l.label + '|' + l.trail.join('/');
            if (seen.has(key)) return false;
            seen.add(key);
            const tudo = `${normalizeText(l.label)} ${normalizeText(l.trail.join(' '))}`;
            return termos.every(t => tudo.includes(t));
        })
        .sort((a, b) => {
            const pa = normalizeText(a.label).startsWith(normalizeText(text)) ? 0 : 1;
            const pb = normalizeText(b.label).startsWith(normalizeText(text)) ? 0 : 1;
            return pa - pb || a.label.localeCompare(b.label, 'pt-BR');
        })
        .slice(0, 8);
}

function paintSearch() {
    const ul = byId('pesquisaResultados');
    const campo = byId('pesquisaTela');
    if (!ul) return;
    ul.querySelectorAll('[role="option"]').forEach((li, i) => {
        li.classList.toggle('is-ativo', i === searchActive);
        li.setAttribute('aria-selected', String(i === searchActive));
    });
    if (campo && searchActive >= 0) campo.setAttribute('aria-activedescendant', `pesq-${searchActive}`);
}

function closeHeaderSearch() {
    const ul = byId('pesquisaResultados');
    if (ul) ul.hidden = true;
    byId('pesquisaTela')?.setAttribute('aria-expanded', 'false');
    searchActive = -1;
}

function headerSearch(value) {
    const ul = byId('pesquisaResultados');
    if (!ul) return;
    const texto = String(value).trim();
    if (!texto) {
        ul.innerHTML = '';
        searchHits = [];
        closeHeaderSearch();
        return;
    }
    searchHits = searchLeaves(texto);
    ul.innerHTML = searchHits.length
        ? searchHits.map((l, i) => `<li role="option" id="pesq-${i}" onmousedown="event.preventDefault(); openSearchHit(${l.id})"><span class="pesq__nome">${escapeHtml(l.label)}</span><span class="pesq__caminho">${escapeHtml(l.trail.join(' › '))}</span></li>`).join('')
        : `<li class="pesq__vazio">Nenhuma tela encontrada para “${escapeHtml(texto)}”.</li>`;
    ul.hidden = false;
    byId('pesquisaTela')?.setAttribute('aria-expanded', 'true');
    searchActive = searchHits.length ? 0 : -1;
    paintSearch();
}

function openSearchHit(id) {
    const campo = byId('pesquisaTela');
    if (campo) campo.value = '';
    closeHeaderSearch();
    runMenuLeaf(id);
}

function headerSearchKey(event) {
    if (event.key === 'Escape') {
        event.target.value = '';
        headerSearch('');
        return;
    }
    if (!searchHits.length) return;
    if (event.key === 'ArrowDown') {
        event.preventDefault();
        searchActive = (searchActive + 1) % searchHits.length;
        paintSearch();
    } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        searchActive = (searchActive - 1 + searchHits.length) % searchHits.length;
        paintSearch();
    } else if (event.key === 'Enter') {
        event.preventDefault();
        openSearchHit(searchHits[Math.max(searchActive, 0)].id);
    }
}
