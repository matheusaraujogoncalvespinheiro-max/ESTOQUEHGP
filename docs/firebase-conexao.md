# Conexão com o Firebase `erp-hospitalar` e login pelo Firebase Auth

## O que está feito
- `assets/js/services/firebase.js` aponta para o projeto **erp-hospitalar** (única configuração; não sobrou credencial do projeto antigo).
- Login por **Firebase Authentication (e-mail e senha)**: `assets/js/core/auth-firebase.js`. A senha é guardada e conferida só pelo Firebase; não há senha nem hash em `app_users`.
- O **perfil** fica em `app_users/<usuário>` (`role`, `name`, `ativo`, `setor`, `email`, `auth_email`). O usuário é a parte do e-mail antes do `@`.
  O acesso só vale se `auth_email` for igual ao e-mail da conta, o usuário estiver ativo e o documento existir.
- Nada é lido do banco antes do login (`iniciarSincronizacao()` roda depois de entrar; `pararSincronizacao()` no logout). A sessão vale só na aba.
- Os usuários de demonstração com senha no código deixam de existir no modo Firebase (`AUTH_FIREBASE = true`). Para os testes automatizados o modo antigo continua disponível (`false`).
- Cadastro de usuário (administrador): cria a conta no Auth (segunda instância do app, sem derrubar o administrador) e o documento em `app_users`.
- Trocar a própria senha e a conferência de senha na "correção de estoque" usam o Auth.
- `firestore.rules`: o perfil agora vem de `app_users` (sem claims e sem Cloud Functions). **Correção achada no teste:** a regra final `match /{col}/{id}` permitia apagar documentos de QUALQUER coleção a quem tem perfil de estoque; agora só `products`, `product_batches` e `mapa_schedule`.
- `storage.rules`: tudo fechado (o sistema ainda não envia arquivos). `firebase.json` e `.firebaserc` apontam para o projeto.
- `tests-emulador/regras.test.js`: 20 testes de acesso permitido e negado no emulador (anônimo, administrador, perfil comum, usuário inativo, conta com o mesmo começo de e-mail em outro domínio, auto-promoção, exclusão).

## O que você precisa fazer no Console (não dá para fazer pelo código)
1. **Authentication › Sign-in method:** ativar *E-mail/senha* (já existe a conta de teste do administrador).
2. **Firestore › Dados:** criar o documento `app_users/admin` com os campos
   `username` = `admin`, `role` = `ADMIN`, `name` = nome do administrador, `ativo` = `true`, `auth_email` = o e-mail da conta de teste no Auth. Sem esse documento ninguém entra.
3. **Publicar as regras** (depois do passo 2, senão o sistema fica trancado): `firebase deploy --only firestore:rules` ou colar o conteúdo de `firestore.rules` em Firestore › Regras. **Plano gratuito (Spark): o Storage não está disponível, então só `firestore.rules` é publicada.** `storage.rules` fica no projeto, sem uso, para o dia em que o plano mudar.
   - Anexos (#31): guardados no Firestore (arquivos de até 700 KB, coleção `anexos_conteudo`), sem Storage.
   - Leitos (#39): depois de publicar as regras, entre como Administrador, abra o Mapa de Ocupação e use **Gravar leitos no banco** (uma vez).
   - Permissões (#5), Painéis de TV (#23), Listas de Apoio (#67) e Exames de Laboratório (#29) são configurados dentro do sistema pelo Administrador.
4. Entrar no sistema com o e-mail completo da conta de teste.
5. Para cada usuário que já existia: o administrador cria de novo em Cadastro › Usuário (as senhas antigas não migram: ficavam em hash/texto no banco). Os documentos antigos em `app_users` com `password`/`password_hash` devem ser conferidos e esses campos removidos pelo Console.

## Como testar as regras
```
npm i --no-save firebase-tools @firebase/rules-unit-testing
npx firebase emulators:exec --only firestore --project erp-teste "node tests-emulador/regras.test.js"
```
(precisa de Java 11+). Usa dados fictícios; não toca o projeto real.

## Limites conhecidos
- Redefinir a senha de OUTRA pessoa não é possível pelo sistema (exige Admin SDK): o próprio usuário usa "Trocar minha senha" ou o administrador redefine no Console. Não há e-mail de recuperação para os endereços internos `@hgp.app`.
- Sem as regras publicadas, o projeto continua bloqueando tudo (erro 403), o que é seguro, mas o sistema não funciona.
- Qualquer pessoa consegue criar uma conta no Firebase Auth enquanto o cadastro por e-mail estiver ativo, mas sem documento em `app_users` ela não lê nem grava nada. Desativar novos cadastros exige o Identity Platform/Admin.

## Administrador raiz
`admin@admin.com` é tratado como ADMIN com todas as permissões, **mesmo sem documento em `app_users`**: no sistema (`AUTH_ADMIN_RAIZ` em `core/auth-firebase.js`) e nas regras (`adminRaiz()`). Ao entrar, o sistema grava/repara `app_users/admin`. Se essa conta for apagada do Firebase Auth, recrie-a antes de qualquer outra com o mesmo e-mail, ou remova a exceção.
