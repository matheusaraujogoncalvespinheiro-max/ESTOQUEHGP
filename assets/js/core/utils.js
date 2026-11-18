// Utilitários compartilhados

/** Escapa um valor para uso seguro em conteúdo ou atributos HTML. */
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** Texto sem acentos e em minúsculas, para comparações e buscas. */
function normalizeText(text) {
    return String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Atalho para document.getElementById. */
const byId = (id) => document.getElementById(id);
