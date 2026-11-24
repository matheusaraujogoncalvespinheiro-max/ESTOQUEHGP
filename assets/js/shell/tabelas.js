// Tabelas de consulta (.cd-tablewrap): quando as colunas não cabem no espaço da tela, a tabela vira uma lista de cartões
// (classe is-cards no contêiner) em vez de rolar na horizontal. A decisão é medida a cada desenho da tela e a cada
// mudança de tamanho da janela, então vale para qualquer cadastro, mesmo com muitas colunas.
// Roda direto no observador (antes de a tela ser pintada), sem depender de animação de quadro.
(function () {
    function ajustar() {
        document.querySelectorAll('.cd-tablewrap').forEach((contentor) => {
            contentor.classList.remove('is-cards');
            if (contentor.scrollWidth > contentor.clientWidth + 1) contentor.classList.add('is-cards');
        });
    }

    new MutationObserver(ajustar).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', ajustar);
    ajustar();
})();
