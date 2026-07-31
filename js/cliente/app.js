import { auth, db, firebaseConfigurado } from "../shared/firebase-client.js?v=7";
import { dinheiro, gerarId, limparTexto, escapar, dataHora, debounce } from "../shared/utils.js?v=7";
import { toast, setButtonLoading, formatFirebaseError } from "../shared/ui.js?v=7";
import {
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  addDoc,
  serverTimestamp,
  limit
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const $ = (selector) => document.querySelector(selector);
const params = new URLSearchParams(location.search);
const mesaNumeroUrl = params.get("mesa");
const mesaToken = params.get("token");
const CACHE_KEY = "miranda_catalogo_v5";
const CACHE_TTL = 2 * 60 * 1000;

let usuario = null;
let mesa = null;
let conta = null;
let clienteNome = "";
let produtos = [];
let categorias = [];
let configPublica = {};
let catalogoVersao = 0;
let categoriaAtual = "";
const carrinho = new Map();
let unsubscribeTableOrders = null;

const setupAlert = $("#setup-alert");
if (!firebaseConfigurado) {
  setupAlert.classList.remove("hidden");
  setupAlert.textContent = "Firebase ainda não configurado. Confira js/shared/firebase-config.js.";
  $("#identificacao").classList.add("hidden");
} else {
  iniciar();
}

window.addEventListener("scroll", () => {
  $("#client-header").classList.toggle("scrolled", window.scrollY > 12);
}, { passive: true });

async function iniciar() {
  if (!mesaToken || !mesaNumeroUrl) {
    falharMesa("Abra o cardápio lendo o QR Code disponível na mesa.");
    return;
  }

  try {
    const mesaSnap = await getDoc(doc(db, "mesas", mesaToken));
    if (!mesaSnap.exists() || mesaSnap.data().ativa !== true) {
      falharMesa("Esta mesa está desativada ou o QR Code não é mais válido.");
      return;
    }

    mesa = { id: mesaSnap.id, ...mesaSnap.data() };
    if (String(mesa.numero).padStart(2, "0") !== String(mesaNumeroUrl).padStart(2, "0")) {
      falharMesa("Os dados do QR Code não correspondem à mesa.");
      return;
    }

    $("#mesa-badge").textContent = `Mesa ${String(mesa.numero).padStart(2, "0")}`;
    $("#mesa-badge").classList.add("online");

    await signInAnonymously(auth);
    onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      usuario = user;
      await carregarConta();
    });
  } catch (error) {
    console.error(error);
    falharMesa("Não foi possível validar a mesa. Verifique sua conexão e tente novamente.");
  }
}

function falharMesa(message) {
  $("#mesa-badge").textContent = "QR inválido";
  $("#mesa-badge").classList.add("offline");
  $("#titulo-conta").textContent = "Não foi possível abrir o cardápio";
  $("#texto-conta").textContent = message;
  $("#form-nome").classList.add("hidden");
}

async function carregarConta() {
  try {
    const contaSnap = await getDoc(doc(db, "contas_ativas", mesaToken));
    conta = contaSnap.exists() ? { id: contaSnap.id, ...contaSnap.data() } : null;

    const key = conta ? `miranda_cliente_${mesaToken}_${conta.sessaoId}` : null;
    const saved = key ? JSON.parse(localStorage.getItem(key) || "null") : null;

    if (conta) {
      $("#titulo-conta").textContent = `Conta aberta em nome de ${conta.responsavel}`;
      $("#texto-conta").textContent = saved?.nome
        ? `Olá, ${saved.nome}. Seus próximos pedidos serão incluídos nesta mesma conta.`
        : "Informe seu nome. Seu pedido será identificado, mas continuará dentro desta conta.";
    } else {
      $("#titulo-conta").textContent = `Mesa ${String(mesa.numero).padStart(2, "0")} livre`;
      $("#texto-conta").textContent = "Informe seu nome para abrir a conta desta mesa.";
    }

    if (saved?.nome) {
      clienteNome = saved.nome;
      await liberarCardapio();
    } else {
      $("#form-nome").classList.remove("hidden");
    }
  } catch (error) {
    console.error(error);
    falharMesa("Não foi possível consultar a conta desta mesa.");
  }
}

$("#form-nome").addEventListener("submit", async (event) => {
  event.preventDefault();
  const nome = limparTexto($("#nome").value, 40);
  if (nome.length < 2) {
    toast("Digite um nome com pelo menos 2 caracteres.", "warning");
    return;
  }

  const button = event.submitter;
  setButtonLoading(button, true, "Entrando na mesa");
  try {
    if (!conta) {
      const novaConta = {
        mesaToken,
        mesaNumero: mesa.numero,
        responsavel: nome,
        responsavelUid: usuario.uid,
        sessaoId: gerarId(`mesa${mesa.numero}`),
        status: "aberta",
        abertaEm: serverTimestamp()
      };
      try {
        await setDoc(doc(db, "contas_ativas", mesaToken), novaConta);
        conta = novaConta;
      } catch (createError) {
        // Se outra pessoa abriu a mesma mesa no mesmo instante, entra na conta recém-criada.
        const currentAccount = await getDoc(doc(db, "contas_ativas", mesaToken));
        if (!currentAccount.exists()) throw createError;
        conta = { id: currentAccount.id, ...currentAccount.data() };
      }
    }

    clienteNome = nome;
    localStorage.setItem(`miranda_cliente_${mesaToken}_${conta.sessaoId}`, JSON.stringify({ nome }));
    $("#form-nome").classList.add("hidden");
    $("#titulo-conta").textContent = `Conta aberta em nome de ${conta.responsavel}`;
    $("#texto-conta").textContent = `Olá, ${nome}. Seus pedidos serão incluídos nesta conta.`;
    await liberarCardapio();
  } catch (error) {
    console.error(error);
    toast(formatFirebaseError(error), "error");
  } finally {
    setButtonLoading(button, false);
  }
});

async function liberarCardapio() {
  $("#area-cardapio").classList.remove("hidden");
  $("#abrir-carrinho").classList.remove("hidden");
  await carregarCatalogoOtimizado();
}

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
  } catch {
    localStorage.removeItem(CACHE_KEY);
    return null;
  }
}

async function carregarCatalogoOtimizado(force = false) {
  const cached = readCache();
  const now = Date.now();

  if (!force && cached?.checkedAt && now - cached.checkedAt < CACHE_TTL) {
    aplicarCatalogo(cached);
    return;
  }

  try {
    let version = 0;
    let metaAvailable = true;
    try {
      const metaSnap = await getDoc(doc(db, "catalogo_meta", "principal"));
      version = metaSnap.exists() ? Number(metaSnap.data().versao || 0) : 0;
    } catch (metaError) {
      // Compatibilidade temporária caso o código seja publicado antes das novas regras.
      console.warn("Controle de versão do catálogo indisponível:", metaError);
      metaAvailable = false;
      version = Number(cached?.versao || 0);
    }

    if (metaAvailable && !force && cached && Number(cached.versao || 0) === version && cached.produtos && cached.categorias) {
      cached.checkedAt = now;
      localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
      aplicarCatalogo(cached);
      return;
    }

    const [categoriesSnap, productsSnap, configSnap] = await Promise.all([
      getDocs(query(collection(db, "categorias"), where("ativa", "==", true))),
      getDocs(query(collection(db, "produtos"), where("ativo", "==", true))),
      getDoc(doc(db, "configuracoes", "publico"))
    ]);

    const payload = {
      versao: version,
      checkedAt: now,
      categorias: categoriesSnap.docs.map((item) => ({ id: item.id, ...item.data() })),
      produtos: productsSnap.docs.map((item) => ({ id: item.id, ...item.data() })),
      configuracoes: configSnap.exists() ? configSnap.data() : {}
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    aplicarCatalogo(payload);
  } catch (error) {
    console.error("Erro ao carregar cardápio:", error);
    if (cached?.produtos && cached?.categorias) {
      aplicarCatalogo(cached);
      toast("Exibindo o último cardápio salvo porque a conexão falhou.", "warning");
    } else {
      $("#catalogo-loading").classList.add("hidden");
      $("#produtos").classList.remove("hidden");
      $("#produtos").innerHTML = `<div class="empty-state"><strong>Não foi possível carregar o cardápio</strong><span>${escapar(formatFirebaseError(error))}</span></div>`;
    }
  }
}

function aplicarCatalogo(payload) {
  catalogoVersao = Number(payload.versao || 0);
  categorias = (payload.categorias || []).sort((a, b) => Number(a.ordem || 999) - Number(b.ordem || 999));
  const categoriasVisiveis = new Set(categorias.map((categoria) => categoria.id));
  produtos = (payload.produtos || [])
    .filter((produto) => !produto.categoriaId || categoriasVisiveis.has(produto.categoriaId))
    .sort((a, b) => Number(a.ordem || 999) - Number(b.ordem || 999) || String(a.nome).localeCompare(String(b.nome), "pt-BR"));
  configPublica = payload.configuracoes || {};
  if (configPublica.mensagem) $("#mensagem-hero").textContent = configPublica.mensagem;
  renderCategorias();
  renderProdutos();
  $("#catalogo-loading").classList.add("hidden");
  $("#produtos").classList.remove("hidden");
}

function renderCategorias() {
  $("#categorias").innerHTML = [
    `<button class="chip active" data-cat="" type="button">Todos</button>`,
    ...categorias.map((category) => `<button class="chip" data-cat="${category.id}" type="button">${escapar(category.nome)}</button>`)
  ].join("");
}

function productImage(product) {
  if (!product.imagemUrl) {
    return `<div class="product-placeholder"><img src="./assets/img/logo-miranda.webp" alt=""><span>Sem imagem</span></div>`;
  }
  return `<img loading="lazy" src="${escapar(product.imagemUrl)}" alt="${escapar(product.nome)}" data-product-image>`;
}

function renderProdutos(categoryFilter = categoriaAtual, search = $("#busca").value.trim()) {
  const normalized = search.toLocaleLowerCase("pt-BR");
  const list = produtos.filter((product) =>
    (!categoryFilter || product.categoriaId === categoryFilter) &&
    (!normalized || `${product.nome} ${product.descricao || ""}`.toLocaleLowerCase("pt-BR").includes(normalized))
  );

  if (!list.length) {
    $("#produtos").innerHTML = `<div class="empty-state" style="grid-column:1/-1"><strong>Nenhum produto encontrado</strong><span>Tente outra categoria ou termo de busca.</span></div>`;
    return;
  }

  $("#produtos").innerHTML = list.map((product, index) => {
    const soldOut = product.disponivel === false;
    return `<article class="product card ${soldOut ? "sold-out" : ""}" style="animation-delay:${Math.min(index * 25, 180)}ms">
      <div class="product-img">
        ${productImage(product)}
        ${soldOut ? `<div class="sold-out-overlay"><span>Esgotado</span></div>` : ""}
      </div>
      <div class="product-body">
        <h3 class="product-title">${escapar(product.nome)}</h3>
        <p class="product-description">${escapar(product.descricao || "")}</p>
        <div class="product-footer">
          <p class="product-price ${soldOut ? "sold" : ""}">${soldOut ? "ESGOTADO" : dinheiro(product.preco)}</p>
          <button class="btn ${soldOut ? "btn-secondary" : "btn-primary"} btn-sm btn-add" data-add="${product.id}" type="button" ${soldOut ? "disabled" : ""}>${soldOut ? "Indisponível" : "Adicionar"}</button>
        </div>
      </div>
    </article>`;
  }).join("");

  document.querySelectorAll("[data-product-image]").forEach((image) => {
    if (image.complete) image.classList.add("loaded");
    else image.addEventListener("load", () => image.classList.add("loaded"), { once: true });
    image.addEventListener("error", () => {
      image.closest(".product-img").innerHTML = `<div class="product-placeholder"><img class="loaded" src="./assets/img/logo-miranda.webp" alt=""><span>Imagem indisponível</span></div>`;
    }, { once: true });
  });
}

$("#categorias").addEventListener("click", (event) => {
  const button = event.target.closest("[data-cat]");
  if (!button) return;
  categoriaAtual = button.dataset.cat;
  document.querySelectorAll(".chip").forEach((item) => item.classList.toggle("active", item === button));
  renderProdutos();
});

const searchProducts = debounce(() => {
  const hasText = Boolean($("#busca").value.trim());
  $("#limpar-busca").classList.toggle("hidden", !hasText);
  renderProdutos();
}, 180);
$("#busca").addEventListener("input", searchProducts);
$("#limpar-busca").addEventListener("click", () => {
  $("#busca").value = "";
  $("#limpar-busca").classList.add("hidden");
  renderProdutos();
});

$("#produtos").addEventListener("click", (event) => {
  const button = event.target.closest("[data-add]");
  if (!button) return;
  const product = produtos.find((item) => item.id === button.dataset.add);
  if (!product || product.disponivel === false) return;
  const current = carrinho.get(product.id) || { produto: product, quantidade: 0 };
  current.quantidade += 1;
  carrinho.set(product.id, current);
  atualizarCarrinho();
  toast(`${product.nome} foi adicionado ao carrinho.`, "success", "Produto adicionado");
});

function atualizarCarrinho() {
  const items = [...carrinho.values()];
  $("#qtd-carrinho").textContent = items.reduce((sum, item) => sum + item.quantidade, 0);
  $("#itens-carrinho").innerHTML = items.length ? items.map((item) => `
    <div class="cart-item">
      <div><strong>${escapar(item.produto.nome)}</strong><br><small>${dinheiro(item.produto.preco)} cada</small></div>
      <div class="qty"><button data-dec="${item.produto.id}" type="button">−</button><strong>${item.quantidade}</strong><button data-inc="${item.produto.id}" type="button">+</button></div>
    </div>`).join("") : `<div class="empty-state"><strong>Seu carrinho está vazio</strong><span>Adicione produtos para fazer o pedido.</span></div>`;
  $("#total-carrinho").textContent = dinheiro(items.reduce((sum, item) => sum + item.quantidade * Number(item.produto.preco), 0));
  $("#enviar-pedido").disabled = items.length === 0;
}

$("#itens-carrinho").addEventListener("click", (event) => {
  const increment = event.target.closest("[data-inc]");
  const decrement = event.target.closest("[data-dec]");
  const id = increment?.dataset.inc || decrement?.dataset.dec;
  if (!id) return;
  const item = carrinho.get(id);
  if (!item) return;
  item.quantidade += increment ? 1 : -1;
  if (item.quantidade <= 0) carrinho.delete(id);
  else carrinho.set(id, item);
  atualizarCarrinho();
});

$("#abrir-carrinho").addEventListener("click", () => {
  atualizarCarrinho();
  $("#modal-carrinho").classList.remove("hidden");
});
function closeClientModal(backdrop) {
  backdrop.classList.add("hidden");
  if (backdrop.id === "modal-pedidos" && unsubscribeTableOrders) {
    unsubscribeTableOrders();
    unsubscribeTableOrders = null;
  }
}
document.querySelectorAll("[data-fechar]").forEach((button) => button.addEventListener("click", () => closeClientModal(button.closest(".modal-backdrop"))));
document.querySelectorAll(".modal-backdrop").forEach((backdrop) => backdrop.addEventListener("click", (event) => {
  if (event.target === backdrop) closeClientModal(backdrop);
}));

$("#enviar-pedido").addEventListener("click", async () => {
  const items = [...carrinho.values()];
  if (!items.length) return;
  const button = $("#enviar-pedido");
  setButtonLoading(button, true, "Enviando pedido");
  $("#erro-pedido").textContent = "";

  try {
    const accountNow = await getDoc(doc(db, "contas_ativas", mesaToken));
    if (!accountNow.exists() || accountNow.data().sessaoId !== conta.sessaoId) throw new Error("CONTA_ENCERRADA");

    let currentVersion = catalogoVersao;
    try {
      const metaNow = await getDoc(doc(db, "catalogo_meta", "principal"));
      currentVersion = metaNow.exists() ? Number(metaNow.data().versao || 0) : 0;
    } catch (metaError) {
      console.warn("Não foi possível validar a versão do catálogo:", metaError);
    }
    if (currentVersion !== catalogoVersao) {
      await carregarCatalogoOtimizado(true);
      const unavailable = items.filter((item) => produtos.find((product) => product.id === item.produto.id)?.disponivel === false);
      if (unavailable.length) {
        unavailable.forEach((item) => carrinho.delete(item.produto.id));
        atualizarCarrinho();
        throw new Error("PRODUTO_ESGOTADO");
      }
    }

    const orderItems = items.map((item) => ({
      produtoId: item.produto.id,
      nome: item.produto.nome,
      quantidade: item.quantidade,
      precoUnitario: Number(item.produto.preco),
      subtotal: Number(item.produto.preco) * item.quantidade
    }));
    const total = orderItems.reduce((sum, item) => sum + item.subtotal, 0);

    await addDoc(collection(db, "pedidos"), {
      mesaToken,
      mesaNumero: mesa.numero,
      sessaoId: conta.sessaoId,
      responsavelConta: conta.responsavel,
      solicitadoPor: clienteNome,
      clienteUid: usuario.uid,
      itens: orderItems,
      total,
      observacao: limparTexto($("#observacao").value, 240),
      status: "novo",
      criadoEm: serverTimestamp(),
      statusImpressao: "pendente"
    });

    carrinho.clear();
    atualizarCarrinho();
    $("#observacao").value = "";
    $("#modal-carrinho").classList.add("hidden");
    toast("O pedido chegou à Central e será atendido em breve.", "success", "Pedido enviado");
  } catch (error) {
    console.error(error);
    if (error.message === "CONTA_ENCERRADA") {
      $("#erro-pedido").textContent = "A conta desta mesa foi encerrada. Leia novamente o QR Code.";
    } else if (error.message === "PRODUTO_ESGOTADO") {
      $("#erro-pedido").textContent = "Um produto acabou de ficar esgotado e foi removido do carrinho.";
    } else {
      $("#erro-pedido").textContent = formatFirebaseError(error);
    }
  } finally {
    setButtonLoading(button, false);
  }
});

const clientStatusLabels = {
  novo: "Enviado",
  aceito: "Enviado",
  preparo: "Enviado",
  pronto: "Enviado",
  entregue: "Entregue",
  cancelado: "Cancelado"
};

function renderTableOrders(orders) {
  const list = $("#lista-meus-pedidos");
  const activeOrders = orders.filter((order) => order.status !== "cancelado");
  const total = activeOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);

  list.innerHTML = orders.length ? `<div class="table-orders-summary card-soft">
      <div><small>Conta de ${escapar(conta.responsavel)}</small><strong>Mesa ${String(mesa.numero).padStart(2, "0")}</strong></div>
      <div><small>Total atual</small><strong>${dinheiro(total)}</strong></div>
    </div>${orders.map((order) => {
      const date = dataHora(order.criadoEm);
      const delivered = order.status === "entregue";
      const canceled = order.status === "cancelado";
      return `<article class="status-card ${canceled ? "is-cancelled" : ""}">
        <div class="row-between"><strong>Pedido por ${escapar(order.solicitadoPor)}</strong><span class="badge ${canceled ? "badge-danger" : delivered ? "badge-success" : "badge-warning"}">${escapar(clientStatusLabels[order.status] || "Enviado")}</span></div>
        <small class="muted">${date.data} às ${date.hora}</small>
        <p>${order.itens.map((item) => `${item.quantidade}x ${escapar(item.nome)}`).join("<br>")}</p>
        <div class="row-between"><strong>${dinheiro(order.total)}</strong>${!delivered && !canceled ? `<button class="btn btn-success btn-sm" data-client-deliver="${order.id}" type="button">Marcar entregue</button>` : ""}</div>
      </article>`;
    }).join("")}` : `<div class="empty-state"><strong>Nenhum pedido nesta mesa</strong><span>Todos os pedidos da conta atual aparecerão aqui, independentemente do celular usado.</span></div>`;
}

$("#meus-pedidos").addEventListener("click", () => {
  $("#modal-pedidos").classList.remove("hidden");
  const list = $("#lista-meus-pedidos");
  list.innerHTML = `<div class="empty-state"><div class="spinner"></div><strong>Carregando os pedidos da mesa</strong></div>`;
  if (unsubscribeTableOrders) unsubscribeTableOrders();

  const tableOrdersQuery = query(
    collection(db, "pedidos"),
    where("mesaToken", "==", mesaToken),
    where("sessaoId", "==", conta.sessaoId),
    limit(100)
  );

  unsubscribeTableOrders = onSnapshot(tableOrdersQuery, (snapshot) => {
    const orders = snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .sort((a, b) => (b.criadoEm?.toMillis?.() || 0) - (a.criadoEm?.toMillis?.() || 0));
    renderTableOrders(orders);
  }, (error) => {
    console.error(error);
    list.innerHTML = `<div class="notice error">Não foi possível carregar os pedidos desta mesa.<br><small>${escapar(formatFirebaseError(error))}</small></div>`;
  });
});

$("#lista-meus-pedidos").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-client-deliver]");
  if (!button) return;
  setButtonLoading(button, true, "Salvando");
  try {
    await updateDoc(doc(db, "pedidos", button.dataset.clientDeliver), {
      status: "entregue",
      entregueEm: serverTimestamp(),
      entreguePorClienteUid: usuario.uid,
      atualizadoEm: serverTimestamp()
    });
    toast("Pedido marcado como entregue.", "success");
  } catch (error) {
    toast(formatFirebaseError(error), "error");
    setButtonLoading(button, false);
  }
});
