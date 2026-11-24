# Segurança do Firebase e dos dados

## Onde estão as regras do Firebase?

O projeto **não tinha** arquivo de regras. As regras publicadas ficam no console do Firebase (Firestore › Regras, projeto `erp-hospitalar`) e não estão no repositório,
então não é possível saber daqui quais estão valendo. Como o sistema acessa o banco direto do navegador e **não usa Firebase Auth**, é provável que estejam abertas
(modo de teste ou equivalente): nesse caso, qualquer pessoa com a configuração do app (que é pública no código) consegue ler e gravar.

Foram criados, mas **não publicados**:

- `firestore.rules`: regras por perfil para todas as coleções, incluindo as clínicas (registros do prontuário só podem ser criados, nunca alterados ou apagados; auditoria só leitura para o administrador).
- `firebase.json`: aponta para o arquivo de regras (para `firebase deploy --only firestore:rules`).

**Não publique `firestore.rules` antes da migração abaixo.** Ele exige `request.auth` com as claims `role` e `username`; hoje o login é feito pelo cadastro de usuários do próprio sistema,
então publicar bloquearia o sistema inteiro. As regras também **não foram testadas no emulador**: revise e teste antes.

## O que já foi feito no aplicativo

- **Senhas com hash**: PBKDF2-SHA256 com sal aleatório (`core/senha.js`). Contas antigas (texto) são convertidas no primeiro login correto e o texto é apagado do banco.
  O cadastro de usuários e "Trocar minha senha" já gravam só hash. Fora de `https`/`localhost` o navegador não oferece criptografia, e o sistema continua no modo antigo.
- O usuário logado em memória nunca carrega campos de senha.
- Permissões por perfil, log de acesso a dados pessoais e auditoria de alterações.
- **Backup completo** (Backup › Exportar banco completo, só administrador): baixa todas as coleções sem senhas.
- As contas de desenvolvimento com senha `1234` estão no código-fonte (`core/state.js`). Troque as senhas de todos os usuários reais e remova esses padrões antes de produção.

## Migração para Firebase Auth (necessária para as regras valerem)

1. Ativar **Authentication › E-mail/senha** no console.
2. Criar um usuário no Firebase Auth para cada registro de `app_users` (e-mail técnico, por exemplo `usuario@hgp.local`) e gravar as claims `role` e `username` com o Admin SDK (script único ou Cloud Function).
3. Trocar o login do aplicativo por `signInWithEmailAndPassword` (em `core/auth.js`) e carregar o perfil das claims; remover os campos de senha de `app_users`.
4. Publicar `firestore.rules` primeiro no emulador, depois em produção, com o sistema já usando o Auth.
5. Restringir a chave de API do Firebase por domínio no Google Cloud.

## Retenção e recuperação

- Nada é apagado fisicamente (inativação), e o prontuário não tem edição nem exclusão no aplicativo; as regras acima passam a garantir isso no banco.
- Prontuário: guarda mínima de 20 anos (Lei 13.787/2018); confirme com o jurídico a regra para prontuário digital.
- Faça o backup completo periodicamente e guarde fora do computador de uso. A **restauração** é manual (importação por script a partir do JSON) e deve ser feita com acompanhamento técnico.
