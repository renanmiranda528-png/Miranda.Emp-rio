# Alterações V5

## Design e experiência

- Logo oficial no cardápio, login, Central e impressão manual.
- Layout mais sofisticado em vermelho, preto e dourado.
- Skeletons de carregamento e animações de entrada.
- Botões com estado de carregamento.
- Toasts e confirmações internas; mensagens nativas do navegador foram removidas.
- Modal adaptado para celular.
- Central com menu lateral móvel.

## Estoque e catálogo

- Campo `disponivel`: desmarcado exibe o produto como ESGOTADO.
- Campo `ativo`: desmarcado oculta o produto.
- Exclusão definitiva de produto.
- Edição, ocultação e exclusão de categoria.
- Categoria só pode ser excluída quando estiver vazia.

## Firebase

- Cache local do catálogo.
- Documento de versão `catalogo_meta/principal`.
- Listener de pedidos separado do listener de contas.
- Histórico limitado.
- Consultas sem índices compostos obrigatórios.
