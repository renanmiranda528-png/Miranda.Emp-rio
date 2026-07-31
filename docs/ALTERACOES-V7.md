# V7 — Cardápio do atendente

A V7 adiciona uma versão própria do cardápio para a equipe da Miranda.

## Acesso

- Login: `/atendente/login.html`
- Cardápio: `/atendente/index.html`

O usuário precisa estar ativo na coleção `usuarios` e ter um destes perfis:

- `administrador`
- `caixa`
- `atendimento`

## Fluxo

1. O atendente entra com e-mail e senha.
2. Informa o nome do cliente.
3. Seleciona a mesa.
4. Se a mesa estiver livre, abre uma conta no nome informado.
5. Se já houver uma conta, o pedido entra nela.
6. Pesquisa produtos e adiciona ao carrinho.
7. Envia o pedido.
8. O pedido recebe `statusImpressao: pendente` e é impresso pelo Agente Miranda.
9. Quando o cliente ler o QR Code, verá o mesmo pedido nos pedidos da mesa.

## Dados adicionais do pedido

Pedidos feitos pelo atendente possuem:

- `origemPedido: "atendente"`
- `atendenteUid`
- `atendenteNome`
- `solicitadoPor`: nome do cliente atendido

## Leituras do Firebase

O cardápio do atendente reutiliza o cache do catálogo:

- produtos e categorias ficam em cache por 2 minutos;
- depois é consultado apenas o documento de versão;
- produtos só são baixados novamente quando o catálogo muda;
- mesas e contas são carregadas ao abrir ou ao tocar em Atualizar mesas;
- antes de enviar, apenas a conta escolhida é validada novamente.
