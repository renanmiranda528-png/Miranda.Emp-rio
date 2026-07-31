# V8 — Visual limpo e contraste dos menus

## Alterações visuais

- Removido o banner grande do Cardápio do Atendente.
- Removido o banner grande do cardápio público.
- Removidos subtítulos decorativos repetidos nas telas operacionais.
- Mantidos os títulos necessários para identificar cada função.
- Reduzido o espaço vazio no topo das páginas.

## Correção dos menus de seleção

Todos os elementos `select`, `option` e `optgroup` agora usam:

- fundo escuro;
- letras claras;
- opção selecionada com fundo vermelho;
- esquema de cores escuro explícito para Chrome no Windows.

Isso corrige o problema em que a lista abria com fundo branco e letras brancas.

## Funcionalidade preservada

Não foram alterados:

- Firebase;
- pedidos;
- contas;
- mesas;
- impressão automática;
- relatórios;
- regras do Firestore;
- cardápio do atendente;
- APK/WebView.

O APK continua carregando o endereço publicado no GitHub e recebe esta atualização automaticamente.
