# ESTOQUEHGP

Sistema web de gestão de estoque do Hospital Geral de Palmas: OPME, Hemodinâmica,
Centro Cirúrgico, pacientes, laudos, salas, transferências e portaria (visitantes).

Aplicação estática (HTML + JavaScript puro) com banco de dados Firebase Firestore.
Não há etapa de build: os scripts são carregados direto pelo `index.html`, em ordem.

## Executar localmente

```powershell
python -m http.server 8080
```

Abra http://localhost:8080 (ou use `npm start`).

## Estrutura

```
index.html                 Página única; carrega estilos e scripts na ordem correta
assets/
  img/                     Logos do hospital e do governo
  css/
    base.css               Fonte, login, animações e impressão
    layout.css             Tokens do tema, menu lateral, cabeçalho, faixa de título e conteúdo
    components.css         Marca, chip do hospital, menu do usuário, janelas (modal), botões e campos
    responsive.css         Padronização dos campos/textos das telas e ajustes para celular
    dark.css               Modo escuro (tokens e remapeamento das cores do Tailwind)
  js/
    core/                  Base do sistema
      utils.js             escapeHtml, normalizeText, byId
      icons.js             Ícones SVG do cabeçalho e das janelas
      state.js             Estado global e dados em memória
      permissions.js       Permissões por perfil (hasPermission, getRoleLabel)
      auth.js              Login, logout e logout por inatividade
      ui.js                Mensagens, títulos e filtros
      router.js            render(), navegação e roteamento por módulo
      backup.js            Exportar/importar backup
      offline.js           Aviso de modo offline
    services/              Regras de negócio e acesso a dados (sem tela)
      firebase.js          Configuração do Firebase e camada de dados (db_*)
      estoque.js           Produtos, lotes e baixas de estoque
      notificacoes.js      Criação de notificações e contagem de não lidas
      pacientes.js         Validações de paciente (cartão SUS)
      portaria.js          Horários, leitos e foto padrão da portaria
      transferencias.js    Relatório (PDF) de transferência
      camera.js            Câmera do navegador
    data/                  Configurações editáveis
      app-info.js          Nome, hospital, versão e logo
      support.js           Contatos e horários da janela de Suporte
      menu.js              Árvore do menu lateral (só dados: ordem, categorias, telas, acesso)
    shell/                 Estrutura da página autenticada
      menu.js              Motor do menu: ordena por `ordem`, filtra por acesso, registra as telas
      layout.js            Menu lateral, cabeçalho, faixa de título
      sidebar.js           Abrir/fechar menu e acordeão
      search.js            Pesquisa de telas do cabeçalho
      theme.js             Tema claro/escuro
      usermenu.js          Menu do usuário
      dialogs.js           Janelas: Suporte, Atalhos de teclado e Sobre
      account.js           Janelas: Meu Perfil e Trocar minha senha
      shortcuts.js         Atalhos de teclado
    pages/                 Uma tela por arquivo, agrupadas por área
      login.js · dashboard.js · membros.js · backup.js · notificacoes.js
      estoque/             consulta · cadastro · adicionar · correcao
      pacientes/           registrar · registrados · status · alta · historico-altas
      procedimentos/       agendar · nao-realizados · mapa
      laudos/              criar · historico
      transferencias/      transferir · solicitar · minhas-solicitacoes · confirmacao ·
                           aprovar · receber · historico
      salas/               salas · historico
      portaria/            controle-acesso · configuracoes
    app.js                 Inicialização (carregado por último)
docs/
  mcp_supabase_guide.md    Guia de uso do MCP do Supabase
```

## Cabeçalho

Botão do menu, nome da aplicação, pesquisa de telas (`Ctrl+K` ou `/`), modo escuro,
suporte, chip do hospital e menu do usuário (Meu Perfil, Notificações, Configurações,
Atalhos de teclado, Sobre o sistema, Trocar minha senha e Sair).

Atalhos: `Alt+M` menu, `Alt+I` início, `Alt+U` menu do usuário, `Esc` fecha.

Para trocar os contatos do Suporte, edite só `assets/js/data/support.js`
(os números e e-mail atuais são fictícios).

## Perfis

`ADMIN`, `CHEFE_OPME`, `CHEFE_HEMODINAMICA`, `FUNC_HEMODINAMICA`, `FUNC_OPME`,
`FUNC_CENTRO_CIRURGICO`, `FUNC_ENFERMAGEM`, `CHEFE_PORTARIA`, `FUNC_PORTARIA`.
As permissões ficam em `assets/js/core/permissions.js` e o menu de cada perfil em
`assets/js/data/menu.js`. A tela só esconde ações por perfil; a proteção real
depende das regras de segurança do Firestore.

## Como adicionar uma nova página

1. Crie `assets/js/pages/<area>/minha-tela.js` com a função `renderMinhaTela()` e os handlers
   da tela. Regras reaproveitáveis por mais de uma tela vão em `assets/js/services/`.
2. Inclua o `<script>` em `index.html`, no grupo da área.
3. Registre o módulo no `switch` de `renderContent()` (`core/router.js`) e o título em
   `getModuleTitle()` (`core/ui.js`).
4. Adicione o item ao menu em `data/menu.js` (categoria, `ordem`, `module` e `access`). Item sem tela
   ainda fica com `soon: true`: aparece desabilitado, com o selo "Em breve", só para administradores.

## Observações de segurança (pendentes)

- Os usuários e senhas iniciais estão no código (`core/state.js`) e as senhas são
  gravadas em texto puro em `app_users`. O ideal é migrar para Firebase Authentication.
- Configurar as regras de segurança do Firestore.
- O Tailwind via CDN é indicado apenas para desenvolvimento; para produção, compilar o CSS.
