# Miranda Empório de Bebidas — V6

Sistema completo do cardápio digital e da Central Administrativa.

## Fluxo de pedidos

- O cliente envia o pedido e ele aparece imediatamente na Central como **Enviado**.
- Não existem mais as etapas Aceito, Em preparo e Pronto.
- O pedido pode ser marcado como **Entregue**, mas isso é opcional para fechar a conta.
- O administrador pode cancelar pedidos antes do fechamento, inclusive depois de marcados como entregues.
- Pedidos cancelados são retirados do total da conta.
- O futuro Agente de Impressão Miranda monitorará pedidos com `statusImpressao: pendente` e imprimirá automaticamente.

## Pedidos da mesa

A área que antes se chamava Meus pedidos agora mostra todos os pedidos da sessão atual da mesa. Isso funciona em qualquer celular que leia o mesmo QR Code enquanto a conta estiver aberta. Clientes também podem marcar um pedido como entregue.

## Relatórios

A Central possui a aba **Relatórios** com:

- semana atual ou mês atual;
- faturamento recebido;
- quantidade de contas e pedidos;
- ticket médio;
- produtos mais pedidos;
- visualização em gráfico ou texto;
- geração de arquivo TXT no dispositivo.

O arquivo TXT não é salvo no Firebase.

## Publicação

Extraia o ZIP e envie todo o conteúdo para a raiz do repositório GitHub Pages, substituindo os arquivos antigos.

Depois publique também o arquivo `firestore.rules` em:

`Firebase Console → Firestore Database → Regras`

Sem as regras V6, celulares diferentes da mesma mesa não conseguirão ver e atualizar os pedidos compartilhados.
