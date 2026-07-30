# Miranda Empório de Bebidas — V5 Design e Otimização

Sistema completo para GitHub Pages + Firebase, sem o agente instalável de impressão automática.

## Principais melhorias da V5

- Novo design profissional no cardápio e na Central;
- Logo oficial da Miranda em todas as áreas;
- Central totalmente responsiva no celular, com menu lateral móvel;
- Animações, skeletons e indicadores de carregamento;
- Mensagens internas por toast e confirmação em modal;
- Nenhum `alert()` ou `confirm()` do navegador;
- Checkbox de estoque para mostrar produto como **ESGOTADO**;
- Produto esgotado permanece visível, com sobreposição na imagem e preço substituído por ESGOTADO;
- Opção separada para ocultar o produto do cardápio;
- Edição, exclusão e ativação/desativação de produtos e categorias;
- Exclusão de categoria bloqueada enquanto houver produtos vinculados;
- Cache inteligente do cardápio para reduzir leituras do Firestore;
- Documento `catalogo_meta/principal` usado como controle de versão;
- Central escuta pedidos e contas em listeners separados, evitando reler todas as contas a cada pedido;
- Consulta de conta usa somente a sessão atual;
- Histórico limitado a 50 contas por carregamento;
- Impressão manual continua disponível com logo, data e horário.

## Como publicar

1. Extraia o ZIP.
2. Envie **todo o conteúdo interno** para a raiz do repositório GitHub.
3. Substitua os arquivos existentes.
4. Publique as regras atualizadas do arquivo `firestore.rules` no Firebase Console.
5. Aguarde o GitHub Pages concluir e use `Ctrl + F5`.

## Importante sobre estoque

- **Disponível em estoque marcado:** produto normal e botão Adicionar.
- **Disponível em estoque desmarcado:** produto continua visível com destaque ESGOTADO.
- **Exibir no cardápio desmarcado:** produto fica oculto para os clientes.

## Otimização de leituras

O cardápio salva categorias, produtos e configuração pública no navegador. Durante 2 minutos, novas aberturas no mesmo navegador podem usar zero leituras de catálogo. Depois disso, o sistema consulta apenas o documento de versão; os produtos são baixados novamente somente quando houve uma alteração administrativa.
