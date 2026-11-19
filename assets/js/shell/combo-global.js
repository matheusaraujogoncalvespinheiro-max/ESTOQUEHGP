// Combobox padronizado em TODAS as telas: todo <select> comum vira o mesmo componente visual do cadastro
// (botão + lista com cantos arredondados, item escolhido em destaque, busca quando há muitas opções).
// O <select> original continua no HTML, escondido, e é ele que guarda o valor: ao escolher um item, o valor é
// gravado nele e o evento "change" é disparado, então onchange/oninput e leitura por getElementById seguem iguais.
// Para manter o <select> nativo em algum lugar, use o atributo data-native.

(function () {
    const SEL = 'select:not([multiple]):not([data-native])';
    let seq = 0;

    function rotuloAtual(sel) {
        const o = sel.options[sel.selectedIndex];
        return o ? { texto: o.textContent.trim(), vazio: o.value === '' } : { texto: 'Selecione', vazio: true };
    }

    function pintaBotao(sel, combo) {
        const { texto, vazio } = rotuloAtual(sel);
        const btn = combo.querySelector('.cd-combo__btn');
        const t = combo.querySelector('.cd-combo__txt');
        if (t.textContent !== texto) t.textContent = texto;
        t.classList.toggle('is-ph', vazio);
        if (btn.disabled !== sel.disabled) btn.disabled = sel.disabled;
    }

    function enhance(sel) {
        if (sel.size > 1 || sel.closest('.cd-combo')) return;
        const id = sel.dataset.cdx;
        const jaTem = id && sel.nextElementSibling && sel.nextElementSibling.dataset && sel.nextElementSibling.dataset.cdxFor === id;
        if (jaTem) { pintaBotao(sel, sel.nextElementSibling); return; }

        const novoId = 'cdx' + (++seq);
        const r = sel.getBoundingClientRect();
        const pai = sel.parentElement ? sel.parentElement.getBoundingClientRect().width : 0;
        const combo = document.createElement('div');
        combo.className = 'cd-combo cdx';
        combo.dataset.fn = '__cdxEscolher';
        combo.dataset.arg = novoId;
        combo.dataset.cdxFor = novoId;
        combo.innerHTML = `<button type="button" class="cd-combo__btn" aria-haspopup="listbox" aria-expanded="false"><span class="cd-combo__txt"></span>${lucideIcon('chevron-down', 'w-4 h-4')}</button><div class="cd-combo__pop" role="listbox"></div>`;
        // Mantém a altura e a largura que o campo tinha, para não bagunçar o alinhamento da tela
        const emCampo = Boolean(sel.closest('.at-field, .cd-cell, .erp-campo, .hs-field, .cd-filter'));
        if (r.height > 0) { const b = combo.querySelector('.cd-combo__btn'); b.style.height = r.height + 'px'; b.style.minHeight = r.height + 'px'; }
        if (!emCampo && r.width > 0 && pai > 0 && r.width < pai * 0.95) { combo.style.width = r.width + 'px'; combo.style.maxWidth = '100%'; }
        const btn = combo.querySelector('.cd-combo__btn');
        if (sel.id) btn.dataset.forSelect = sel.id;
        const rot = sel.closest('label');
        if (!rot && sel.getAttribute('aria-label')) btn.setAttribute('aria-label', sel.getAttribute('aria-label'));
        if (sel.classList.contains('is-invalid')) btn.classList.add('is-invalid');

        sel.dataset.cdx = novoId;
        sel.classList.add('cdx-native');
        sel.tabIndex = -1;
        sel.setAttribute('aria-hidden', 'true');
        sel.insertAdjacentElement('afterend', combo);
        pintaBotao(sel, combo);
    }

    function varrer(raiz) {
        (raiz || document).querySelectorAll(SEL).forEach(enhance);
    }

    function montarLista(combo) {
        const sel = document.querySelector(`select[data-cdx="${combo.dataset.cdxFor}"]`);
        if (!sel) return;
        const pop = combo.querySelector('.cd-combo__pop');
        const atual = sel.value;
        const muitos = sel.options.length > 8;
        let html = muitos ? '<input type="search" class="cd-combo__q" placeholder="Pesquisar..." autocomplete="off" aria-label="Pesquisar na lista">' : '';
        html += '<div class="cd-combo__items">';
        const opt = (o) => `<button type="button" role="option" class="cd-combo__opt ${o.value === atual ? 'is-sel' : ''}" data-v="${escapeHtml(o.value)}" aria-selected="${o.value === atual}" ${o.disabled ? 'disabled' : ''}><span>${escapeHtml(o.textContent.trim())}</span>${o.value === atual && o.value !== '' ? lucideIcon('check', 'w-4 h-4') : ''}</button>`;
        [...sel.children].forEach(n => {
            if (n.tagName === 'OPTGROUP') {
                html += `<div class="cdx-grupo">${escapeHtml(n.label)}</div>${[...n.children].map(opt).join('')}`;
            } else html += opt(n);
        });
        pop.innerHTML = html + '</div>';
    }

    function posicionar(combo) {
        const btn = combo.querySelector('.cd-combo__btn');
        const pop = combo.querySelector('.cd-combo__pop');
        const r = btn.getBoundingClientRect();
        const abaixo = window.innerHeight - r.bottom;
        const altoLista = Math.min(pop.scrollHeight, 330);
        const sobe = abaixo < altoLista + 16 && r.top > abaixo;
        pop.style.left = r.left + 'px';
        pop.style.width = Math.max(r.width, 200) + 'px';
        if (sobe) { pop.style.top = 'auto'; pop.style.bottom = (window.innerHeight - r.top + 6) + 'px'; }
        else { pop.style.bottom = 'auto'; pop.style.top = (r.bottom + 6) + 'px'; }
        const itens = pop.querySelector('.cd-combo__items');
        if (itens) itens.style.maxHeight = Math.max(140, Math.min(260, (sobe ? r.top : abaixo) - 90)) + 'px';
    }

    // Chamado pelo motor do combobox (cadastros/engine.js) ao escolher um item: fn(arg, valor)
    window.__cdxEscolher = function (id, valor) {
        const sel = document.querySelector(`select[data-cdx="${id}"]`);
        if (!sel) return;
        const mudou = sel.value !== valor;
        sel.value = valor;
        pintaBotao(sel, sel.nextElementSibling);
        if (mudou) {
            sel.dispatchEvent(new Event('input', { bubbles: true }));
            sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
        sel.nextElementSibling && sel.nextElementSibling.querySelector('.cd-combo__btn') && sel.nextElementSibling.querySelector('.cd-combo__btn').focus();
    };

    // Depois do motor (que abre/fecha a lista), monta os itens a partir do <select> e posiciona a lista
    document.addEventListener('click', (e) => {
        const btn = e.target.closest && e.target.closest('.cdx .cd-combo__btn');
        if (!btn) return;
        const combo = btn.closest('.cd-combo');
        if (!combo.classList.contains('is-open')) return;
        montarLista(combo);
        combo.classList.remove('is-up');
        posicionar(combo);
        const q = combo.querySelector('.cd-combo__q');
        if (q) q.focus();
        else { const o = combo.querySelector('.cd-combo__opt.is-sel') || combo.querySelector('.cd-combo__opt'); if (o) { o.focus(); o.scrollIntoView({ block: 'nearest' }); } }
        if (q) { const s = combo.querySelector('.cd-combo__opt.is-sel'); if (s) s.scrollIntoView({ block: 'nearest' }); }
    });

    // A lista é "fixa" na tela; ao rolar a página ou redimensionar, fecha
    const fechaAoRolar = (e) => {
        if (e.target && e.target.closest && e.target.closest('.cd-combo__pop')) return;
        if (document.querySelector('.cdx.is-open')) cadComboFechar();
    };
    window.addEventListener('scroll', fechaAoRolar, true);
    window.addEventListener('resize', fechaAoRolar);

    let agendado = false;
    function tratar() {
        agendado = false;
        varrer(document);
        obs.takeRecords();
    }
    const obs = new MutationObserver(() => { if (!agendado) { agendado = true; queueMicrotask(tratar); } });

    function iniciar() {
        varrer(document);
        obs.observe(document.body, { childList: true, subtree: true });
        // Valores trocados por código (select.value = ...) não geram mutação: sincroniza o texto do botão
        setInterval(() => {
            document.querySelectorAll('select[data-cdx]').forEach(sel => {
                const c = sel.nextElementSibling;
                if (c && c.dataset && c.dataset.cdxFor === sel.dataset.cdx) pintaBotao(sel, c);
            });
        }, 400);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
