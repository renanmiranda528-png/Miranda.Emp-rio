# Configuração Firebase — Miranda V5

## Métodos de login

Ative no Authentication:

- Anônimo, para os clientes do QR Code;
- E-mail/senha, para funcionários e administradores.

## Regras

Abra `Firestore Database > Regras`, substitua pelo conteúdo de `firestore.rules` e publique.

A V5 adiciona a coleção pública de controle de cache:

```text
catalogo_meta/principal
```

Ela será criada automaticamente na primeira alteração feita em produto, categoria ou configuração.

## Estrutura principal

- `produtos`: campo `ativo` controla se aparece; campo `disponivel` controla estoque/esgotado.
- `categorias`: campo `ativa` controla a visibilidade.
- `catalogo_meta/principal`: versão do catálogo.
- `mesas`: QR Codes fixos.
- `contas_ativas`: uma conta por mesa.
- `pedidos`: pedidos individuais vinculados à sessão da mesa.
- `historico_contas`: contas pagas.
- `usuarios`: permissões administrativas.
