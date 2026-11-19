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
      validators.js        CPF, telefone, datas, máscaras e newId
      regras.js            Regras hospitalares puras: Manchester, validade e FEFO
      icons.js             Ícones SVG do cabeçalho e das janelas
      state.js             Estado global e dados em memória
      permissions.js       Permissões por perfil (hasPermission, getRoleLabel)
      auth.js              Login, logout e logout por inatividade
      session.js           Sessão persistente: recarregar a página não desconecta
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
      db-atendimento.js    Firestore da Recepção, Emergência e Triagens (escutas só para quem tem acesso)
      auditoria.js         Auditoria e utilitários de gravação
      atendimento.js       Regras da Recepção e da Emergência
      triagem.js           Regras da Gestão das Triagens (equipes, meses, funcionários)
    data/                  Configurações editáveis
      app-info.js          Nome, hospital, versão e logo
      support.js           Contatos e horários da janela de Suporte
      menu.js              Árvore do menu lateral, até 4 níveis (só dados: ordem, categorias, agrupadores, telas, acesso)
    shell/                 Estrutura da página autenticada
      menu.js              Motor do menu: ordena por `ordem`, filtra por acesso, registra as telas e valida o acesso por módulo (`canOpenModule`)
      layout.js            Menu lateral, cabeçalho, faixa de título
      sidebar.js           Abrir/fechar menu e acordeão
      search.js            Pesquisa de telas do cabeçalho
      theme.js             Tema claro/escuro
      usermenu.js          Menu do usuário
      dialogs.js           Janelas: Suporte, Atalhos de teclado e Sobre
      account.js           Janelas: Meu Perfil e Trocar minha senha
      shortcuts.js         Atalhos de teclado
      immersive.js         Telas imersivas (Recepção/Emergência), botão HOME e preservação do que foi digitado
      components.js        Campos, erros e confirmação reutilizáveis das telas de atendimento
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
      recepcao/ · emergencia/ · triagem/   (dashboard · gestao)
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

## Recepção, Emergência e Gestão das Triagens

Três módulos de atendimento no mesmo sistema. Veja [docs/atendimento.md](docs/atendimento.md) (telas, perfis,
coleções, regras e LGPD). Novos perfis: Funcionário Recepção, Funcionário Emergência e Coordenador de Triagem.

Regras de negócio hospitalares aplicadas (Manchester, FEFO, bloqueio de lote vencido, log de acesso): [docs/regras-de-negocio.md](docs/regras-de-negocio.md).

## Padrão do banco de dados (Firestore)

Toda tela segue o mesmo caminho, definido em `assets/js/services/firebase.js`:

1. **Leitura:** cada coleção tem um `db_sync*()` que hidrata `MOCK_DATA.*` e um listener em tempo real em
   `db_setupSubscriptions()`; a tela só lê `MOCK_DATA`.
2. **Escrita:** a tela altera o dado em memória, chama `saveToLocalStorage()` e grava com `db_save*()` /
   `db_delete*()`. Nunca acessa `db.collection(...)` direto nas telas.
3. **Convenções:** campos em `snake_case`; id do documento = chave natural (ex.: `cartao_sus`,
   `barcode_setor`) ou `String(id)`; `set(..., { merge: true })`; funções com `if (!db) return` e `try/catch`.

Coleções: `patients`, `products`, `product_batches`, `laudos`, `mapa_schedule`, `notifications`, `app_users`,
`material_requests`, `procedimentos_nao_realizados`, `procedimentos_agendados`, `salas`, `salas_history`,
`stock_transfer_history`, `product_entry_history`, `portaria_visits`, `portaria_config`.

Para uma tela nova que grava dados: crie a coleção com `db_sync<Nome>` + `db_save<Nome>`, registre o listener em
`db_setupSubscriptions()` e o sync em `db_syncAll()`.

## Sessão

Recarregar a página (F5) não desconecta: `core/session.js` guarda em `sessionStorage` só o usuário, a tela
aberta e a hora da última atividade (nunca a senha). Ao recarregar, o usuário é conferido de novo nos
cadastros do banco e o sistema volta para a mesma tela. A sessão vale só na aba aberta (fechar a aba
desconecta), expira com os mesmos 10 minutos de inatividade do login e é apagada no logout.

## Perfis

`ADMIN`, `CHEFE_OPME`, `CHEFE_HEMODINAMICA`, `FUNC_HEMODINAMICA`, `FUNC_OPME`,
`FUNC_CENTRO_CIRURGICO`, `FUNC_ENFERMAGEM`, `CHEFE_PORTARIA`, `FUNC_PORTARIA`, `FUNC_RECEPCAO`,
`FUNC_EMERGENCIA`, `COORD_TRIAGEM`.
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

## Testes

```powershell
npm test
```

Cobrem as validações (CPF, telefone, datas) e as regras puras da Gestão das Triagens.

## Observações de segurança (pendentes)

- Os usuários e senhas iniciais estão no código (`core/state.js`) e as senhas são
  gravadas em texto puro em `app_users`. O ideal é migrar para Firebase Authentication.
- Configurar as regras de segurança do Firestore.
- O Tailwind via CDN é indicado apenas para desenvolvimento; para produção, compilar o CSS.

Menu Cadastro (consulta e cadastro separados para as 17 opções): [docs/cadastros.md](docs/cadastros.md).

Assistência hospitalar (leitos, internação, prontuário, exames e autorizações): [docs/assistencia.md](docs/assistencia.md).

Telas operacionais (movimentações, compras, consignado, financeiro e parâmetros): [docs/operacoes.md](docs/operacoes.md).

Fiscal (NF-e, NFS-e, entrada de mercadoria, inventário) e cancelamento de operação: [docs/fiscal.md](docs/fiscal.md).
