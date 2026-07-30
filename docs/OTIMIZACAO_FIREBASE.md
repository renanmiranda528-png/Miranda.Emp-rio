# Otimização de uso do Firestore

## Cardápio público

- O navegador salva produtos, categorias e configurações em `localStorage`.
- Durante 2 minutos, reaberturas no mesmo navegador usam o cache sem consultar o catálogo.
- Depois disso, o sistema lê somente `catalogo_meta/principal`.
- Produtos e categorias são lidos novamente apenas quando a versão mudou.
- Ao enviar um pedido, a versão é conferida para impedir pedido de produto que acabou de ficar esgotado.

## Central

- Pedidos ativos: um listener limitado a 100 documentos.
- Contas abertas: listener separado. Uma mudança em pedido não relê todas as contas.
- Conta individual: consulta somente os pedidos da sessão atual.
- Histórico: máximo de 50 contas por abertura da tela.
- Produtos e categorias: uma leitura ao entrar na área; alterações seguintes atualizam a tela localmente.

## Estimativa simples

Em uma visita normal com catálogo já salvo:

- 0 leituras se o cache foi verificado há menos de 2 minutos;
- 1 leitura da versão depois do prazo;
- leitura completa do catálogo somente quando houve alteração.

Cada novo pedido normalmente gera:

- 1 leitura para validar a conta;
- 1 leitura da versão do catálogo;
- 1 gravação do pedido.
