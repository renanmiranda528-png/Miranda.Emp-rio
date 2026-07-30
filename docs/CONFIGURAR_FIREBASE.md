# Configuração do Firebase

## 1. Criar o projeto

1. Entre no Firebase Console.
2. Crie um projeto chamado, por exemplo, `miranda-emporio`.
3. Adicione um aplicativo Web.
4. Copie as credenciais para `js/shared/firebase-config.js`.

## 2. Authentication

Ative:

- Authentication
- Sign-in method
- E-mail/senha
- Anônimo

O acesso anônimo é usado silenciosamente pelos clientes do QR Code. Eles não veem tela de login.

## 3. Firestore

Crie o Cloud Firestore em modo de produção.

Depois publique:

- `firestore.rules`
- `firestore.indexes.json`

Usando Firebase CLI:

```bash
firebase login
firebase use --add
firebase deploy --only firestore
```

## 4. Primeiro administrador

1. Em Authentication, crie um usuário com e-mail e senha.
2. Copie o UID desse usuário.
3. No Firestore, crie a coleção `usuarios`.
4. Crie um documento cujo ID seja exatamente o UID.
5. Campos:

```json
{
  "nome": "Administrador",
  "email": "seuemail@exemplo.com",
  "perfil": "administrador",
  "ativo": true
}
```

## 5. Dados iniciais

Entre na Central Administrativa e cadastre:

1. Categorias;
2. Produtos;
3. Mesas e QR Codes;
4. Outros perfis de funcionários.

## 6. GitHub Pages

O sistema usa módulos JavaScript. Publique em um servidor HTTP, como GitHub Pages ou Firebase Hosting. Abrir os arquivos diretamente com `file://` pode impedir os módulos.

## Observação importante

Sem Cloud Functions, o cliente envia os preços exibidos no cardápio. A Central deve revisar pedidos incomuns antes de aceitá-los. O sistema foi projetado para funcionar no plano gratuito e evitar backend pago.
