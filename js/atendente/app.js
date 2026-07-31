import { auth, db } from "../shared/firebase.js?v=8";
import {
  dinheiro,
  gerarId,
  limparTexto,
  escapar,
  dataHora,
  debounce
} from "../shared/utils.js?v=8";
import {
  toast,
  confirmar,
  setButtonLoading,
  showLoading,
  hideLoading,
  formatFirebaseError
} from "../shared/ui.js?v=8";
import {
  onAuthStateChanged,
  signOut
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
  addDoc,
  serverTimestamp,
  limit
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const $ = (selector) => document.querySelector(selector);
const allowedProfiles = new Set(["administrador", "caixa", "atendimento"]);
const CACHE_KEY = "miranda_catalogo_atendente_v7";
const CACHE_TTL = 2 * 60 * 1000;

let staffUser = null;
let staffProfile = null;
let tables = [];
let activeAccounts = new Map();
let selectedTable = null;
let selectedAccount = null;
let customerName = "";
let products = [];
let categories = [];
let catalogVersion = 0;
let currentCategory = "";
let unsubscribeOrders = null;
const cart = new Map();

window.addEventListener("scroll", () => {
  $("#waiter-header").classList.toggle("scrolled", window.scrollY > 10);
}, { passive: true });

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    location.replace("./login.html");
    return;
  }

  try {
    const profileSnapshot = await getDoc(doc(db, "usuarios", user.uid));
    const profile = profileSnapshot.exists() ? profileSnapshot.data() : null;

    if (profile?.ativo !== true || !allowedProfiles.has(profile.perfil)) {
      await signOut(auth);
      location.replace("./login.html");
      return;
    }

    staffUser = user;
    staffProfile = profile;
    $("#staff-badge").textContent = profile.nome || "Atendente";
    $("#staff-badge").classList.add("online");
    await loadTables();
  } catch (error) {
    console.error(error);
    toast(formatFirebaseError(error), "error");
  }
});

$("#logout-button").addEventListener("click", async () => {
  const confirmed = await confirmar({
    titulo: "Sair do modo atendente",
    mensagem: "A conta deixará de ficar conectada neste aparelho.",
    confirmarTexto: "Sair"
  });
  if (!confirmed) return;
  await signOut(auth);
  location.replace("./login.html");
});

async function loadTables() {
  showLoading("Carregando mesas");
  try {
    const [tablesSnapshot, accountsSnapshot] = await Promise.all([
      getDocs(query(collection(db, "mesas"), where("ativa", "==", true))),
      getDocs(collection(db, "contas_ativas"))
    ]);

    tables = tablesSnapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .sort((a, b) => Number(a.numero) - Number(b.numero));

    activeAccounts = new Map(
      accountsSnapshot.docs.map((item) => [item.id, { id: item.id, ...item.data() }])
    );

    renderTableSelect();
  } catch (error) {
    console.error(error);
    toast(formatFirebaseError(error), "error");
    $("#table-select").innerHTML = `<option value="">Não foi possível carregar as mesas</option>`;
  } finally {
    hideLoading();
  }
}

function renderTableSelect() {
  const select = $("#table-select");
  const currentValue = select.value;

  select.innerHTML = `<option value="">Selecione a mesa</option>${tables.map((table) => {
    const account = activeAccounts.get(table.id);
    const status = account ? `Conta de ${account.responsavel}` : "Livre";
    return `<option value="${table.id}">Mesa ${String(table.numero).padStart(2, "0")} — ${escapar(status)}</option>`;
  }).join("")}`;

  if (tables.some((table) => table.id === currentValue)) select.value = currentValue;
  updateTablePreview();
}

$("#refresh-tables").addEventListener("click", async (event) => {
  setButtonLoading(event.currentTarget, true, "Atualizando");
  await loadTables();
  setButtonLoading(event.currentTarget, false);
  toast("Lista de mesas atualizada.", "success");
});

$("#table-select").addEventListener("change", updateTablePreview);

function updateTablePreview() {
  const token = $("#table-select").value;
  const preview = $("#selected-table-preview");
  const table = tables.find((item) => item.id === token);

  if (!table) {
    preview.classList.add("hidden");
    preview.innerHTML = "";
    return;
  }

  const account = activeAccounts.get(token);
  preview.classList.remove("hidden");
  preview.innerHTML = account
    ? `<strong>Mesa ${String(table.numero).padStart(2, "0")} com conta aberta.</strong><br>Responsável principal: ${escapar(account.responsavel)}. O novo pedido será incluído nesta conta.`
    : `<strong>Mesa ${String(table.numero).padStart(2, "0")} livre.</strong><br>Uma conta será aberta no nome informado acima.`;
}

$("#service-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = limparTexto($("#customer-name").value, 40);
  const tableToken = $("#table-select").value;
  const table = tables.find((item) => item.id === tableToken);

  if (name.length < 2) {
    toast("Digite o nome do cliente.", "warning");
    return;
  }
  if (!table) {
    toast("Selecione a mesa do cliente.", "warning");
    return;
  }

  const button = event.submitter;
  setButtonLoading(button, true, "Preparando atendimento");

  try {
    const currentTableSnapshot = await getDoc(doc(db, "mesas", tableToken));
    if (!currentTableSnapshot.exists() || currentTableSnapshot.data().ativa !== true) {
      throw new Error("MESA_INATIVA");
    }

    let accountSnapshot = await getDoc(doc(db, "contas_ativas", tableToken));
    let account;

    if (accountSnapshot.exists()) {
      account = { id: accountSnapshot.id, ...accountSnapshot.data() };
    } else {
      const newAccount = {
        mesaToken: tableToken,
        mesaNumero: table.numero,
        responsavel: name,
        responsavelUid: staffUser.uid,
        sessaoId: gerarId(`mesa${table.numero}`),
        status: "aberta",
        abertaEm: serverTimestamp(),
        abertaPorTipo: "atendente",
        abertaPorUid: staffUser.uid,
        abertaPorNome: staffProfile.nome || "Atendente"
      };

      try {
        await setDoc(doc(db, "contas_ativas", tableToken), newAccount);
        account = newAccount;
      } catch (createError) {
        accountSnapshot = await getDoc(doc(db, "contas_ativas", tableToken));
        if (!accountSnapshot.exists()) throw createError;
        account = { id: accountSnapshot.id, ...accountSnapshot.data() };
      }
    }

    selectedTable = table;
    selectedAccount = account;
    customerName = name;
    activeAccounts.set(tableToken, account);
    activateService();

    if (!products.length) await loadCatalog();
  } catch (error) {
    console.error(error);
    toast(
      error.message === "MESA_INATIVA"
        ? "Esta mesa foi desativada. Atualize a lista."
        : formatFirebaseError(error),
      "error"
    );
  } finally {
    setButtonLoading(button, false);
  }
});

function activateService() {
  $("#setup-service").classList.add("hidden");
  $("#active-service").classList.remove("hidden");
  $("#catalog-area").classList.remove("hidden");
  $("#open-cart").classList.remove("hidden");

  $("#active-customer").textContent = customerName;
  $("#active-table").textContent = `Mesa ${String(selectedTable.numero).padStart(2, "0")}`;
  $("#active-account").textContent = selectedAccount.responsavel;

  $("#cart-context-customer").textContent = `Cliente: ${customerName}`;
  $("#cart-context-table").textContent = `Mesa: ${String(selectedTable.numero).padStart(2, "0")}`;

  window.scrollTo({ top: $("#active-service").offsetTop - 90, behavior: "smooth" });
}

$("#change-service-button").addEventListener("click", async () => {
  if (cart.size) {
    const confirmed = await confirmar({
      titulo: "Trocar atendimento",
      mensagem: "O carrinho atual será apagado. Deseja continuar?",
      confirmarTexto: "Trocar",
      perigo: true
    });
    if (!confirmed) return;
  }

  resetService();
});

function resetService() {
  cart.clear();
  updateCart();
  customerName = "";
  selectedTable = null;
  selectedAccount = null;
  $("#customer-name").value = "";
  $("#table-select").value = "";
  updateTablePreview();

  $("#setup-service").classList.remove("hidden");
  $("#active-service").classList.add("hidden");
  $("#catalog-area").classList.add("hidden");
  $("#open-cart").classList.add("hidden");
  closeOrdersListener();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function readCatalogCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
  } catch {
    localStorage.removeItem(CACHE_KEY);
    return null;
  }
}

async function loadCatalog(force = false) {
  const cached = readCatalogCache();
  const now = Date.now();

  if (!force && cached?.checkedAt && now - cached.checkedAt < CACHE_TTL) {
    applyCatalog(cached);
    return;
  }

  try {
    let version = Number(cached?.versao || 0);

    try {
      const metaSnapshot = await getDoc(doc(db, "catalogo_meta", "principal"));
      version = metaSnapshot.exists() ? Number(metaSnapshot.data().versao || 0) : 0;
    } catch (error) {
      console.warn("Versão do catálogo indisponível:", error);
    }

    if (!force && cached?.produtos && cached?.categorias && Number(cached.versao || 0) === version) {
      cached.checkedAt = now;
      localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
      applyCatalog(cached);
      return;
    }

    const [categoriesSnapshot, productsSnapshot] = await Promise.all([
      getDocs(query(collection(db, "categorias"), where("ativa", "==", true))),
      getDocs(query(collection(db, "produtos"), where("ativo", "==", true)))
    ]);

    const payload = {
      versao: version,
      checkedAt: now,
      categorias: categoriesSnapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
      produtos: productsSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
    };

    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    applyCatalog(payload);
  } catch (error) {
    console.error(error);
    if (cached?.produtos && cached?.categorias) {
      applyCatalog(cached);
      toast("Usando o último cardápio salvo neste aparelho.", "warning");
    } else {
      $("#catalog-loading").classList.add("hidden");
      $("#products").classList.remove("hidden");
      $("#products").innerHTML = `<div class="empty-state" style="grid-column:1/-1"><strong>Não foi possível carregar o cardápio</strong><span>${escapar(formatFirebaseError(error))}</span></div>`;
    }
  }
}

function applyCatalog(payload) {
  catalogVersion = Number(payload.versao || 0);
  categories = (payload.categorias || [])
    .sort((a, b) => Number(a.ordem || 999) - Number(b.ordem || 999));

  const visibleCategories = new Set(categories.map((category) => category.id));

  products = (payload.produtos || [])
    .filter((product) => !product.categoriaId || visibleCategories.has(product.categoriaId))
    .sort((a, b) =>
      Number(a.ordem || 999) - Number(b.ordem || 999)
      || String(a.nome).localeCompare(String(b.nome), "pt-BR")
    );

  renderCategories();
  renderProducts();
  $("#catalog-loading").classList.add("hidden");
  $("#products").classList.remove("hidden");
}

function renderCategories() {
  $("#categories").innerHTML = [
    `<button class="chip active" data-category="" type="button">Todos</button>`,
    ...categories.map((category) =>
      `<button class="chip" data-category="${category.id}" type="button">${escapar(category.nome)}</button>`
    )
  ].join("");
}

function productImage(product) {
  if (!product.imagemUrl) {
    return `<div class="product-placeholder"><img src="../assets/img/logo-miranda.webp" alt=""><span>Sem imagem</span></div>`;
  }
  return `<img loading="lazy" src="${escapar(product.imagemUrl)}" alt="${escapar(product.nome)}" data-product-image>`;
}

function renderProducts(categoryFilter = currentCategory, search = $("#search").value.trim()) {
  const normalized = search.toLocaleLowerCase("pt-BR");

  const list = products.filter((product) =>
    (!categoryFilter || product.categoriaId === categoryFilter)
    && (!normalized || `${product.nome} ${product.descricao || ""}`.toLocaleLowerCase("pt-BR").includes(normalized))
  );

  $("#products").innerHTML = list.length ? list.map((product, index) => {
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
          <button class="btn ${soldOut ? "btn-secondary" : "btn-primary"} btn-sm btn-add" data-add="${product.id}" type="button" ${soldOut ? "disabled" : ""}>
            ${soldOut ? "Indisponível" : "Adicionar"}
          </button>
        </div>
      </div>
    </article>`;
  }).join("") : `<div class="empty-state" style="grid-column:1/-1"><strong>Nenhum produto encontrado</strong><span>Tente outra categoria ou busca.</span></div>`;

  document.querySelectorAll("[data-product-image]").forEach((image) => {
    if (image.complete) image.classList.add("loaded");
    else image.addEventListener("load", () => image.classList.add("loaded"), { once: true });
    image.addEventListener("error", () => {
      image.closest(".product-img").innerHTML = `<div class="product-placeholder"><img class="loaded" src="../assets/img/logo-miranda.webp" alt=""><span>Imagem indisponível</span></div>`;
    }, { once: true });
  });
}

$("#categories").addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;

  currentCategory = button.dataset.category;
  document.querySelectorAll("[data-category]").forEach((item) => item.classList.toggle("active", item === button));
  renderProducts();
});

const searchProducts = debounce(() => {
  const hasText = Boolean($("#search").value.trim());
  $("#clear-search").classList.toggle("hidden", !hasText);
  renderProducts();
}, 180);

$("#search").addEventListener("input", searchProducts);
$("#clear-search").addEventListener("click", () => {
  $("#search").value = "";
  $("#clear-search").classList.add("hidden");
  renderProducts();
});

$("#products").addEventListener("click", (event) => {
  const button = event.target.closest("[data-add]");
  if (!button) return;

  const product = products.find((item) => item.id === button.dataset.add);
  if (!product || product.disponivel === false) return;

  const current = cart.get(product.id) || { produto: product, quantidade: 0 };
  current.quantidade += 1;
  cart.set(product.id, current);
  updateCart();
  toast(`${product.nome} adicionado.`, "success", "Carrinho atualizado");
});

function updateCart() {
  const items = [...cart.values()];
  $("#cart-count").textContent = items.reduce((sum, item) => sum + item.quantidade, 0);

  $("#cart-items").innerHTML = items.length ? items.map((item) => `
    <div class="cart-item">
      <div>
        <strong>${escapar(item.produto.nome)}</strong><br>
        <small>${dinheiro(item.produto.preco)} cada</small>
      </div>
      <div class="qty">
        <button data-decrease="${item.produto.id}" type="button">−</button>
        <strong>${item.quantidade}</strong>
        <button data-increase="${item.produto.id}" type="button">+</button>
      </div>
    </div>
  `).join("") : `<div class="empty-state"><strong>Carrinho vazio</strong><span>Adicione produtos para registrar o pedido.</span></div>`;

  $("#cart-total").textContent = dinheiro(
    items.reduce((sum, item) => sum + item.quantidade * Number(item.produto.preco), 0)
  );
  $("#submit-order").disabled = items.length === 0;
}

$("#cart-items").addEventListener("click", (event) => {
  const increase = event.target.closest("[data-increase]");
  const decrease = event.target.closest("[data-decrease]");
  const id = increase?.dataset.increase || decrease?.dataset.decrease;
  if (!id) return;

  const item = cart.get(id);
  if (!item) return;

  item.quantidade += increase ? 1 : -1;
  if (item.quantidade <= 0) cart.delete(id);
  else cart.set(id, item);
  updateCart();
});

$("#open-cart").addEventListener("click", () => {
  updateCart();
  $("#cart-modal").classList.remove("hidden");
});

function closeModal(modal) {
  modal.classList.add("hidden");
  if (modal.id === "orders-modal") closeOrdersListener();
}

document.querySelectorAll("[data-close-modal]").forEach((button) => {
  button.addEventListener("click", () => closeModal(button.closest(".modal-backdrop")));
});

document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) closeModal(backdrop);
  });
});

$("#submit-order").addEventListener("click", async () => {
  const items = [...cart.values()];
  if (!items.length || !selectedTable || !selectedAccount) return;

  const button = $("#submit-order");
  setButtonLoading(button, true, "Enviando pedido");
  $("#order-error").textContent = "";

  try {
    const currentAccountSnapshot = await getDoc(doc(db, "contas_ativas", selectedTable.id));
    if (!currentAccountSnapshot.exists() || currentAccountSnapshot.data().sessaoId !== selectedAccount.sessaoId) {
      throw new Error("CONTA_ALTERADA");
    }

    let currentVersion = catalogVersion;
    try {
      const metaSnapshot = await getDoc(doc(db, "catalogo_meta", "principal"));
      currentVersion = metaSnapshot.exists() ? Number(metaSnapshot.data().versao || 0) : 0;
    } catch (error) {
      console.warn("Não foi possível validar a versão do catálogo:", error);
    }

    if (currentVersion !== catalogVersion) {
      await loadCatalog(true);
      const unavailable = items.filter((item) =>
        products.find((product) => product.id === item.produto.id)?.disponivel === false
      );

      if (unavailable.length) {
        unavailable.forEach((item) => cart.delete(item.produto.id));
        updateCart();
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
      mesaToken: selectedTable.id,
      mesaNumero: selectedTable.numero,
      sessaoId: selectedAccount.sessaoId,
      responsavelConta: selectedAccount.responsavel,
      solicitadoPor: customerName,
      clienteUid: staffUser.uid,
      origemPedido: "atendente",
      atendenteUid: staffUser.uid,
      atendenteNome: staffProfile.nome || "Atendente",
      itens: orderItems,
      total,
      observacao: limparTexto($("#order-note").value, 240),
      status: "novo",
      criadoEm: serverTimestamp(),
      statusImpressao: "pendente"
    });

    cart.clear();
    updateCart();
    $("#order-note").value = "";
    $("#cart-modal").classList.add("hidden");

    toast(
      `Pedido de ${customerName} enviado para a Mesa ${String(selectedTable.numero).padStart(2, "0")}.`,
      "success",
      "Pedido registrado"
    );
  } catch (error) {
    console.error(error);

    if (error.message === "CONTA_ALTERADA") {
      $("#order-error").textContent = "A conta desta mesa foi encerrada ou alterada. Troque o atendimento e selecione novamente.";
    } else if (error.message === "PRODUTO_ESGOTADO") {
      $("#order-error").textContent = "Um produto ficou esgotado e foi removido do carrinho.";
    } else {
      $("#order-error").textContent = formatFirebaseError(error);
    }
  } finally {
    setButtonLoading(button, false);
  }
});

const statusLabels = {
  novo: "Enviado",
  aceito: "Enviado",
  preparo: "Enviado",
  pronto: "Enviado",
  entregue: "Entregue",
  cancelado: "Cancelado"
};

$("#table-orders-button").addEventListener("click", () => {
  if (!selectedTable || !selectedAccount) return;

  $("#orders-modal").classList.remove("hidden");
  $("#table-orders-list").innerHTML = `<div class="empty-state"><div class="spinner"></div><strong>Carregando pedidos</strong></div>`;
  closeOrdersListener();

  const ordersQuery = query(
    collection(db, "pedidos"),
    where("mesaToken", "==", selectedTable.id),
    where("sessaoId", "==", selectedAccount.sessaoId),
    limit(100)
  );

  unsubscribeOrders = onSnapshot(ordersQuery, (snapshot) => {
    const orders = snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .sort((a, b) => (b.criadoEm?.toMillis?.() || 0) - (a.criadoEm?.toMillis?.() || 0));

    const validOrders = orders.filter((order) => order.status !== "cancelado");
    const total = validOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);

    $("#table-orders-list").innerHTML = orders.length
      ? `<div class="table-orders-summary card-soft">
          <div><small>Conta de ${escapar(selectedAccount.responsavel)}</small><strong>Mesa ${String(selectedTable.numero).padStart(2, "0")}</strong></div>
          <div><small>Total atual</small><strong>${dinheiro(total)}</strong></div>
        </div>
        ${orders.map((order) => {
          const date = dataHora(order.criadoEm);
          const delivered = order.status === "entregue";
          const canceled = order.status === "cancelado";

          return `<article class="status-card ${canceled ? "is-cancelled" : ""}">
            <div class="row-between">
              <strong>Pedido por ${escapar(order.solicitadoPor)}</strong>
              <span class="badge ${canceled ? "badge-danger" : delivered ? "badge-success" : "badge-warning"}">${escapar(statusLabels[order.status] || "Enviado")}</span>
            </div>
            <small class="muted">${date.data} às ${date.hora}${order.origemPedido === "atendente" ? ` · Atendente: ${escapar(order.atendenteNome || "")}` : ""}</small>
            <p>${order.itens.map((item) => `${item.quantidade}x ${escapar(item.nome)}`).join("<br>")}</p>
            <div class="row-between">
              <strong>${dinheiro(order.total)}</strong>
              ${!delivered && !canceled ? `<button class="btn btn-success btn-sm" data-deliver-order="${order.id}" type="button">Marcar entregue</button>` : ""}
            </div>
          </article>`;
        }).join("")}`
      : `<div class="empty-state"><strong>Nenhum pedido nesta mesa</strong></div>`;
  }, (error) => {
    console.error(error);
    $("#table-orders-list").innerHTML = `<div class="notice error">${escapar(formatFirebaseError(error))}</div>`;
  });
});

$("#table-orders-list").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-deliver-order]");
  if (!button) return;

  setButtonLoading(button, true, "Salvando");
  try {
    await updateDoc(doc(db, "pedidos", button.dataset.deliverOrder), {
      status: "entregue",
      entregueEm: serverTimestamp(),
      entreguePorFuncionarioUid: staffUser.uid,
      entreguePorFuncionarioNome: staffProfile.nome || "Atendente",
      atualizadoEm: serverTimestamp()
    });
    toast("Pedido marcado como entregue.", "success");
  } catch (error) {
    toast(formatFirebaseError(error), "error");
    setButtonLoading(button, false);
  }
});

function closeOrdersListener() {
  unsubscribeOrders?.();
  unsubscribeOrders = null;
}
