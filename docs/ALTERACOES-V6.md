# Alterações V6

- Removidas as etapas Aceito, Em preparo e Pronto da operação.
- Todo pedido novo entra diretamente como Enviado/Aguardando entrega.
- A futura impressão automática será feita pelo Agente Miranda monitorando `statusImpressao: pendente`.
- Funcionários podem marcar como entregue ou cancelar qualquer pedido antes do fechamento.
- A conta pode ser paga sem marcar todos os pedidos como entregues.
- Meus pedidos passou a mostrar todos os pedidos da sessão atual da mesa, em qualquer celular.
- Clientes da mesa também podem marcar um pedido como entregue.
- Nova aba Relatórios com semana/mês, gráfico/texto e geração de TXT local.
- O TXT é criado no dispositivo e não é enviado ao Firebase.
- Relatórios consultam apenas as contas pagas do período selecionado, com limite de 500 documentos.
