import { auth, db } from "../shared/firebase.js?v=5";
import { dinheiro, dataHora, escapar, limparTexto, gerarId, debounce } from "../shared/utils.js?v=5";
import { toast, confirmar, setButtonLoading, formatFirebaseError } from "../shared/ui.js?v=5";
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  limit,
  increment
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const $ = (selector) => document.querySelector(selector);
const content = $("#conteudo");
const modal = $("#modal-admin");
const modalBody = $("#modal-admin-conteudo");
const sidebar = $("#sidebar");
const sidebarOverlay = $("#sidebar-overlay");
let user = null;
let profile = null;
let activeTab = "pedidos";
let unsubscribers = [];
let catalogState = { produtos: [], categorias: [], view: "produtos", search: "" };

const pageTitles = {
  pedidos: "Pedidos",
  mesas: "Mesas e contas",
  cardapio: "Cardápio",
  historico: "Histórico",
  qrcodes: "Mesas e QR Codes",
  usuarios: "Usuários",
  configuracoes: "Configurações"
};

onAuthStateChanged(auth, async (currentUser) => {
  try {
    if (!currentUser) {
      location.replace("./login.html");
      return;
    }

    updateConnection("Validando acesso", false);
    const profileSnap = await getDoc(doc(db, "usuarios", currentUser.uid));
    if (!profileSnap.exists() || profileSnap.data().ativo !== true) {
      await signOut(auth);
      location.replace("./login.html");
      return;
    }

    user = currentUser;
    profile = profileSnap.data();
    $("#usuario-logado").textContent = profile.nome || currentUser.email || "Usuário";
    $("#perfil-logado").textContent = profile.perfil;
    applyPermissions();
    updateConnection(navigator.onLine ? "Conectado" : "Sem conexão", navigator.onLine);
    openTab("pedidos");
  } catch (error) {
    console.error(error);
    updateConnection("Erro de conexão", false);
    renderError("Não foi possível iniciar a Central", formatFirebaseError(error));
  }
});

function applyPermissions() {
  if (profile.perfil !== "administrador") {
    document.querySelectorAll('[data-tab="usuarios"], [data-tab="configuracoes"]').forEach((item) => item.remove());
  }
  if (profile.perfil === "atendimento") {
    document.querySelectorAll('[data-tab="historico"], [data-tab="cardapio"], [data-tab="qrcodes"]').forEach((item) => item.remove());
  }
}

function updateConnection(text, online) {
  const element = $("#conexao");
  element.textContent = text;
  element.classList.toggle("online", Boolean(online));
  element.classList.toggle("offline", !online);
}

window.addEventListener("online", () => updateConnection("Conectado", true));
window.addEventListener("offline", () => updateConnection("Sem conexão", false));
window.addEventListener("scroll", () => $("#admin-header").classList.toggle("scrolled", window.scrollY > 8), { passive: true });

$("#sair").addEventListener("click", async () => {
  const confirmed = await confirmar({ titulo: "Sair da Central", mensagem: "Você precisará informar e-mail e senha para entrar novamente.", confirmarTexto: "Sair" });
  if (!confirmed) return;
  await signOut(auth);
  location.replace("./login.html");
});

function openMobileMenu() {
  sidebar.classList.add("open");
  sidebarOverlay.classList.add("show");
}
function closeMobileMenu() {
  sidebar.classList.remove("open");
  sidebarOverlay.classList.remove("show");
}
$("#menu-mobile").addEventListener("click", openMobileMenu);
sidebarOverlay.addEventListener("click", closeMobileMenu);

$("nav").addEventListener("click", (event) => {
  const link = event.target.closest("[data-tab]");
  if (!link) return;
  event.preventDefault();
  document.querySelectorAll("nav a").forEach((item) => item.classList.toggle("active", item === link));
  openTab(link.dataset.tab);
  closeMobileMenu();
});

function clearListeners() {
  unsubscribers.forEach((unsubscribe) => unsubscribe?.());
  unsubscribers = [];
}

async function openTab(tab) {
  clearListeners();
  content.onclick = null;
  content.onchange = null;
  activeTab = tab;
  $("#titulo-pagina").textContent = pageTitles[tab] || "Central";
  renderLoading();
  try {
    await ({ pedidos, mesas, cardapio, historico, qrcodes, usuarios, configuracoes })[tab]();
  } catch (error) {
    console.error(`Erro na aba ${tab}:`, error);
    renderError(`Não foi possível carregar ${pageTitles[tab] || "esta área"}`, formatFirebaseError(error));
  }
}

function renderLoading(message = "Carregando informações") {
  content.innerHTML = `<section class="stats"><article class="stat card skeleton"></article><article class="stat card skeleton"></article><article class="stat card skeleton"></article><article class="stat card skeleton"></article></section><section class="empty-state"><div class="spinner"></div><strong>${escapar(message)}</strong><span>Aguarde alguns instantes.</span></section>`;
}

function renderError(title, message) {
  content.innerHTML = `<section class="notice error page-enter"><strong>${escapar(title)}</strong><br>${escapar(message)}</section>`;
}

function openModal(html) {
  modalBody.innerHTML = html;
  modal.classList.remove("hidden");
  modalBody.scrollTop = 0;
}
function closeModal() {
  modal.classList.add("hidden");
  modalBody.innerHTML = "";
}
modal.addEventListener("click", (event) => {
  if (event.target === modal || event.target.closest("[data-close]")) closeModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !modal.classList.contains("hidden")) closeModal();
});

/* PEDIDOS */
async function pedidos() {
  content.innerHTML = `<div class="page-enter">
    <section class="stats">
      <article class="stat card"><span>Pedidos novos</span><strong id="s-novo">0</strong><small>Aguardando aceite</small></article>
      <article class="stat card"><span>Em preparo</span><strong id="s-preparo">0</strong><small>Na cozinha ou balcão</small></article>
      <article class="stat card"><span>Prontos</span><strong id="s-pronto">0</strong><small>Aguardando entrega</small></article>
      <article class="stat card"><span>Mesas abertas</span><strong id="s-mesas">0</strong><small>Contas em andamento</small></article>
    </section>
    <section class="board">
      ${["novo", "aceito", "preparo", "pronto"].map((status) => `<div class="column card"><div class="column-header"><h3>${{ novo: "Novos", aceito: "Aceitos", preparo: "Em preparo", pronto: "Prontos" }[status]}</h3><span id="count-${status}" class="column-count">0</span></div><div id="col-${status}" class="order-list"><div class="empty-state"><div class="spinner"></div></div></div></div>`).join("")}
    </section>
  </div>`;

  const orderQuery = query(collection(db, "pedidos"), where("status", "in", ["novo", "aceito", "preparo", "pronto"]), limit(100));
  const ordersUnsubscribe = onSnapshot(orderQuery, (snapshot) => {
    const orders = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => (a.criadoEm?.toMillis?.() || 0) - (b.criadoEm?.toMillis?.() || 0));
    ["novo", "aceito", "preparo", "pronto"].forEach((status) => {
      const filtered = orders.filter((order) => order.status === status);
      $(`#count-${status}`).textContent = filtered.length;
      $(`#col-${status}`).innerHTML = filtered.length ? filtered.map(orderCard).join("") : `<div class="empty-state"><strong>Nenhum pedido</strong><span>Os pedidos desta etapa aparecerão aqui.</span></div>`;
    });
    $("#s-novo").textContent = orders.filter((order) => order.status === "novo").length;
    $("#s-preparo").textContent = orders.filter((order) => order.status === "preparo").length;
    $("#s-pronto").textContent = orders.filter((order) => order.status === "pronto").length;
  }, (error) => {
    console.error(error);
    toast(formatFirebaseError(error), "error", "Pedidos indisponíveis");
    ["novo", "aceito", "preparo", "pronto"].forEach((status) => {
      $(`#col-${status}`).innerHTML = `<div class="notice error">Não foi possível carregar os pedidos.</div>`;
    });
  });

  const accountsUnsubscribe = onSnapshot(collection(db, "contas_ativas"), (snapshot) => {
    $("#s-mesas").textContent = snapshot.size;
  }, (error) => {
    console.error(error);
    $("#s-mesas").textContent = "!";
  });

  unsubscribers.push(ordersUnsubscribe, accountsUnsubscribe);
  content.onclick = handleOrderAction;
}

function orderCard(order) {
  const date = dataHora(order.criadoEm);
  const next = {
    novo: ["Aceitar", "aceito"],
    aceito: ["Iniciar preparo", "preparo"],
    preparo: ["Marcar como pronto", "pronto"],
    pronto: ["Marcar entregue", "entregue"]
  }[order.status];
  return `<article class="order-card ${order.status === "novo" ? "new" : ""}">
    <div class="row-between"><strong>Mesa ${String(order.mesaNumero).padStart(2, "0")}</strong><span class="badge">${date.hora}</span></div>
    <div class="order-meta">${date.data} · Conta de ${escapar(order.responsavelConta)}</div>
    <p class="order-person"><strong>Pedido por ${escapar(order.solicitadoPor)}</strong></p>
    <div class="order-items">${order.itens.map((item) => `<div class="row-between"><span>${item.quantidade}x ${escapar(item.nome)}</span><span>${dinheiro(item.subtotal)}</span></div>`).join("")}</div>
    ${order.observacao ? `<div class="order-note"><strong>Observação:</strong> ${escapar(order.observacao)}</div>` : ""}
    <strong class="order-total">${dinheiro(order.total)}</strong>
    <div class="actions">
      <button class="btn btn-primary btn-sm" data-status="${order.id}|${next[1]}" type="button">${next[0]}</button>
      <button class="btn btn-secondary btn-sm" data-print="${order.id}" type="button">Imprimir</button>
      ${order.status === "novo" ? `<button class="btn btn-ghost btn-sm" data-reject="${order.id}" type="button">Recusar</button>` : ""}
    </div>
  </article>`;
}

async function handleOrderAction(event) {
  const statusButton = event.target.closest("[data-status]");
  const printButton = event.target.closest("[data-print]");
  const rejectButton = event.target.closest("[data-reject]");

  if (statusButton) {
    const [id, status] = statusButton.dataset.status.split("|");
    setButtonLoading(statusButton, true);
    try {
      await updateDoc(doc(db, "pedidos", id), { status, atualizadoEm: serverTimestamp(), atualizadoPor: user.uid });
      toast("Status do pedido atualizado.", "success");
    } catch (error) {
      toast(formatFirebaseError(error), "error");
      setButtonLoading(statusButton, false);
    }
  }

  if (rejectButton) {
    const confirmed = await confirmar({ titulo: "Recusar pedido", mensagem: "O cliente verá este pedido como cancelado. Deseja continuar?", confirmarTexto: "Recusar", perigo: true });
    if (!confirmed) return;
    setButtonLoading(rejectButton, true);
    try {
      await updateDoc(doc(db, "pedidos", rejectButton.dataset.reject), { status: "cancelado", atualizadoEm: serverTimestamp(), atualizadoPor: user.uid });
      toast("Pedido recusado.", "warning");
    } catch (error) {
      toast(formatFirebaseError(error), "error");
      setButtonLoading(rejectButton, false);
    }
  }

  if (printButton) {
    setButtonLoading(printButton, true);
    try {
      const snapshot = await getDoc(doc(db, "pedidos", printButton.dataset.print));
      if (!snapshot.exists()) throw new Error("Pedido não encontrado.");
      printOrder(snapshot.data(), snapshot.id);
    } catch (error) {
      toast(formatFirebaseError(error), "error");
    } finally {
      setButtonLoading(printButton, false);
    }
  }
}

function printOrder(order, id) {
  const date = dataHora(order.criadoEm);
  const logo = new URL("../assets/img/logo-miranda.webp", location.href).href;
  const windowPrint = open("", "_blank", "width=430,height=720");
  if (!windowPrint) {
    toast("O navegador bloqueou a janela de impressão. Permita pop-ups somente para imprimir.", "warning");
    return;
  }
  windowPrint.document.write(`<html><head><title>Pedido ${id}</title><style>body{font-family:Arial,monospace;width:72mm;margin:7mm auto;color:#000;font-size:12px}.logo{display:block;width:48mm;margin:0 auto 4mm;filter:grayscale(1)}h2,p{text-align:center;margin:4px}.line{border-top:1px dashed #000;margin:8px 0}.item{display:flex;justify-content:space-between;gap:8px}.total{font-size:15px}</style></head><body>
  <img class="logo" src="${logo}"><div class="line"></div><b>NOVO PEDIDO — ${id.slice(-6).toUpperCase()}</b><br>Mesa: ${order.mesaNumero}<br>Conta: ${escapar(order.responsavelConta)}<br>Solicitado por: ${escapar(order.solicitadoPor)}<br>Data: ${date.data}<br>Horário: ${date.hora}
  <div class="line"></div>${order.itens.map((item) => `<div class="item"><span>${item.quantidade}x ${escapar(item.nome)}</span><span>${dinheiro(item.subtotal)}</span></div>`).join("")}
  ${order.observacao ? `<div class="line"></div><b>OBS:</b> ${escapar(order.observacao)}` : ""}<div class="line"></div><b class="total">TOTAL DO PEDIDO: ${dinheiro(order.total)}</b><p>CONTA ABERTA</p><script>onload=()=>setTimeout(()=>print(),250)<\/script></body></html>`);
  windowPrint.document.close();
}

/* MESAS E CONTAS */
async function mesas() {
  const [tablesSnap, accountsSnap] = await Promise.all([
    getDocs(query(collection(db, "mesas"), orderBy("numero"))),
    getDocs(collection(db, "contas_ativas"))
  ]);
  const accounts = new Map(accountsSnap.docs.map((item) => [item.id, { id: item.id, ...item.data() }]));
  const tables = tablesSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
  content.innerHTML = `<div class="page-enter"><div class="section-toolbar"><div><p class="eyebrow">Visão do salão</p><h2>Mesas</h2></div><span class="badge">${accounts.size} conta(s) aberta(s)</span></div><section class="data-list">${tables.length ? tables.map((table) => tableRow(table, accounts.get(table.id))).join("") : `<div class="empty-state"><strong>Nenhuma mesa cadastrada</strong><span>Crie as mesas na área de QR Codes.</span></div>`}</section></div>`;
  content.onclick = (event) => {
    const button = event.target.closest("[data-account]");
    if (button) openAccount(button.dataset.account);
  };
}

function tableRow(table, account) {
  const opened = account ? dataHora(account.abertaEm) : null;
  return `<article class="data-row card">
    <div class="data-title"><strong>Mesa ${String(table.numero).padStart(2, "0")}</strong><small>${account ? `Conta de ${escapar(account.responsavel)}` : "Mesa livre"}</small></div>
    <div>${account ? `<span class="badge badge-warning">Aberta às ${opened.hora}</span>` : `<span class="badge badge-success">Livre</span>`}</div>
    <div><span class="badge ${table.ativa ? "badge-success" : "badge-danger"}">${table.ativa ? "QR ativo" : "QR desativado"}</span></div>
    <div class="data-actions">${account ? `<button class="btn btn-primary btn-sm" data-account="${table.id}" type="button">Ver conta</button>` : ""}</div>
  </article>`;
}

async function openAccount(token) {
  openModal(`<div class="empty-state"><div class="spinner"></div><strong>Carregando a conta</strong></div>`);
  try {
    const accountSnap = await getDoc(doc(db, "contas_ativas", token));
    if (!accountSnap.exists()) {
      closeModal();
      toast("Esta conta já foi encerrada.", "warning");
      return;
    }
    const account = accountSnap.data();
    const ordersSnap = await getDocs(query(collection(db, "pedidos"), where("sessaoId", "==", account.sessaoId)));
    const orders = ordersSnap.docs.map((item) => ({ id: item.id, ...item.data() })).filter((order) => order.status !== "cancelado").sort((a, b) => (a.criadoEm?.toMillis?.() || 0) - (b.criadoEm?.toMillis?.() || 0));
    const total = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const date = dataHora(account.abertaEm);

    openModal(`<div class="account-detail-head"><div><p class="eyebrow">Mesa ${String(account.mesaNumero).padStart(2, "0")}</p><h2>Conta de ${escapar(account.responsavel)}</h2><p class="muted">Aberta em ${date.data} às ${date.hora}</p></div><div class="account-total"><small>Total atual</small><strong>${dinheiro(total)}</strong></div></div>
      <div class="status-list">${orders.length ? orders.map((order) => `<article class="status-card"><div class="row-between"><strong>${escapar(order.solicitadoPor)}</strong><span class="badge">${escapar(order.status)}</span></div><small class="muted">${dataHora(order.criadoEm).data} às ${dataHora(order.criadoEm).hora}</small><p>${order.itens.map((item) => `${item.quantidade}x ${escapar(item.nome)}`).join("<br>")}</p><strong>${dinheiro(order.total)}</strong></article>`).join("") : `<div class="empty-state"><strong>Nenhum pedido nesta conta</strong></div>`}</div>
      <div class="modal-actions"><button data-close class="btn btn-secondary" type="button">Fechar</button>${profile.perfil !== "atendimento" ? `<button id="receive-account" class="btn btn-success" type="button" ${orders.length ? "" : "disabled"}>Receber e fechar conta</button>` : ""}</div>`);

    $("#receive-account")?.addEventListener("click", () => paymentModal(token, account, orders, total));
  } catch (error) {
    openModal(`<div class="notice error">${escapar(formatFirebaseError(error))}</div><div class="modal-actions"><button data-close class="btn btn-secondary">Fechar</button></div>`);
  }
}

function paymentModal(token, account, orders, total) {
  openModal(`<p class="eyebrow">Fechamento</p><h2>Receber conta</h2><p class="muted">Mesa ${String(account.mesaNumero).padStart(2, "0")} · ${escapar(account.responsavel)}</p><h3 style="font-size:2rem;color:var(--gold)">${dinheiro(total)}</h3>
    <form id="payment-form" class="form-grid">
      <label>Forma de pagamento<select id="payment-method"><option value="Pix">Pix</option><option value="Dinheiro">Dinheiro</option><option value="Débito">Débito</option><option value="Crédito">Crédito</option><option value="Dividido">Pagamento dividido</option></select></label>
      <div id="split-payment" class="form-grid hidden">
        <p class="form-help">Preencha somente as formas utilizadas. A soma precisa ser igual ao total da conta.</p>
        <div class="form-row"><label>Pix<input data-split="Pix" type="number" min="0" step="0.01" value="0"></label><label>Dinheiro<input data-split="Dinheiro" type="number" min="0" step="0.01" value="0"></label></div>
        <div class="form-row"><label>Débito<input data-split="Débito" type="number" min="0" step="0.01" value="0"></label><label>Crédito<input data-split="Crédito" type="number" min="0" step="0.01" value="0"></label></div>
        <div class="row-between"><span class="muted">Soma informada</span><strong id="split-total">${dinheiro(0)}</strong></div>
      </div>
      <div class="modal-actions"><button data-close class="btn btn-secondary" type="button">Voltar</button><button class="btn btn-success" type="submit">Confirmar pagamento</button></div>
    </form>`);

  const method = $("#payment-method");
  const updateSplitTotal = () => {
    const sum = [...document.querySelectorAll("[data-split]")].reduce((value, input) => value + Number(input.value || 0), 0);
    $("#split-total").textContent = dinheiro(sum);
    $("#split-total").style.color = Math.abs(sum - total) < .01 ? "var(--success)" : "var(--danger)";
  };
  method.addEventListener("change", () => $("#split-payment").classList.toggle("hidden", method.value !== "Dividido"));
  document.querySelectorAll("[data-split]").forEach((input) => input.addEventListener("input", updateSplitTotal));

  $("#payment-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    let payments;
    if (method.value === "Dividido") {
      payments = [...document.querySelectorAll("[data-split]")].map((input) => ({ forma: input.dataset.split, valor: Number(input.value || 0) })).filter((item) => item.valor > 0);
      const sum = payments.reduce((value, item) => value + item.valor, 0);
      if (Math.abs(sum - total) >= .01) {
        toast(`A soma deve ser exatamente ${dinheiro(total)}.`, "warning", "Valor incorreto");
        return;
      }
    } else {
      payments = [{ forma: method.value, valor: total }];
    }

    const confirmed = await confirmar({ titulo: "Confirmar recebimento", mensagem: `Confirma que recebeu ${dinheiro(total)} da Mesa ${String(account.mesaNumero).padStart(2, "0")}?`, confirmarTexto: "Receber e fechar" });
    if (!confirmed) return;

    const button = event.submitter;
    setButtonLoading(button, true);
    try {
      const historyId = gerarId("conta");
      const batch = writeBatch(db);
      batch.set(doc(db, "historico_contas", historyId), {
        ...account,
        total,
        formaPagamento: method.value,
        pagamentos: payments,
        status: "paga",
        fechadaEm: serverTimestamp(),
        fechadaPor: user.uid,
        pedidos: orders
      });
      orders.forEach((order) => batch.update(doc(db, "pedidos", order.id), { statusPagamento: "pago", contaHistoricoId: historyId }));
      batch.delete(doc(db, "contas_ativas", token));
      await batch.commit();
      closeModal();
      toast("Pagamento registrado e mesa liberada.", "success", "Conta fechada");
      if (activeTab === "mesas") mesas();
    } catch (error) {
      toast(formatFirebaseError(error), "error");
      setButtonLoading(button, false);
    }
  });
}

/* CARDÁPIO */
async function cardapio() {
  const [productsSnap, categoriesSnap] = await Promise.all([
    getDocs(collection(db, "produtos")),
    getDocs(query(collection(db, "categorias"), orderBy("ordem")))
  ]);
  catalogState.produtos = productsSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
  catalogState.categorias = categoriesSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
  catalogState.view = "produtos";
  renderCatalogAdmin();
}

function renderCatalogAdmin() {
  content.innerHTML = `<div class="page-enter">
    <div class="section-toolbar">
      <div class="tabs"><button class="tab-button ${catalogState.view === "produtos" ? "active" : ""}" data-catalog-view="produtos">Produtos</button><button class="tab-button ${catalogState.view === "categorias" ? "active" : ""}" data-catalog-view="categorias">Categorias</button></div>
      <div class="section-toolbar-right"><div class="search-admin"><input id="catalog-search" placeholder="Buscar ${catalogState.view === "produtos" ? "produto" : "categoria"}..." value="${escapar(catalogState.search)}"></div><button id="new-catalog-item" class="btn btn-primary" type="button">${catalogState.view === "produtos" ? "Novo produto" : "Nova categoria"}</button></div>
    </div>
    <div id="catalog-list"></div>
  </div>`;
  renderCatalogList();

  content.querySelectorAll("[data-catalog-view]").forEach((button) => button.addEventListener("click", () => {
    catalogState.view = button.dataset.catalogView;
    catalogState.search = "";
    renderCatalogAdmin();
  }));
  $("#new-catalog-item").addEventListener("click", () => catalogState.view === "produtos" ? productForm() : categoryForm());
  $("#catalog-search").addEventListener("input", debounce((event) => {
    catalogState.search = event.target.value;
    renderCatalogList();
  }, 160));
  $("#catalog-list").addEventListener("click", handleCatalogAction);
  $("#catalog-list").addEventListener("change", handleCatalogChange);
}

function renderCatalogList() {
  const target = $("#catalog-list");
  const search = catalogState.search.trim().toLocaleLowerCase("pt-BR");
  if (catalogState.view === "produtos") {
    const products = [...catalogState.produtos].sort((a, b) => Number(a.ordem || 999) - Number(b.ordem || 999) || String(a.nome).localeCompare(String(b.nome), "pt-BR")).filter((product) => !search || `${product.nome} ${product.descricao || ""}`.toLocaleLowerCase("pt-BR").includes(search));
    target.innerHTML = `<section class="data-list">${products.length ? products.map(productAdminRow).join("") : `<div class="empty-state"><strong>Nenhum produto encontrado</strong></div>`}</section>`;
  } else {
    const categories = [...catalogState.categorias].sort((a, b) => Number(a.ordem || 999) - Number(b.ordem || 999)).filter((category) => !search || category.nome.toLocaleLowerCase("pt-BR").includes(search));
    target.innerHTML = `<section class="data-list">${categories.length ? categories.map(categoryAdminRow).join("") : `<div class="empty-state"><strong>Nenhuma categoria encontrada</strong></div>`}</section>`;
  }
}

function productAdminRow(product) {
  const category = catalogState.categorias.find((item) => item.id === product.categoriaId);
  const available = product.disponivel !== false;
  return `<article class="data-row card">
    <div class="product-admin-name"><img class="product-admin-thumb" src="${escapar(product.imagemUrl || "../assets/img/logo-miranda.webp")}" alt=""><div class="data-title"><strong>${escapar(product.nome)}</strong><small>${escapar(category?.nome || "Sem categoria")} · ${product.ativo !== false ? "Exibido" : "Oculto"}</small></div></div>
    <div><strong>${dinheiro(product.preco)}</strong></div>
    <label class="stock-toggle" title="Desmarque para mostrar como esgotado"><input type="checkbox" data-stock="${product.id}" ${available ? "checked" : ""}><span class="mini-switch"></span><span>${available ? "Em estoque" : "Esgotado"}</span></label>
    <div class="data-actions"><button class="btn btn-secondary btn-sm" data-edit-product="${product.id}" type="button">Editar</button><button class="btn btn-secondary btn-sm" data-toggle-product="${product.id}" type="button">${product.ativo !== false ? "Ocultar" : "Exibir"}</button><button class="btn btn-ghost btn-sm" data-delete-product="${product.id}" type="button">Excluir</button></div>
  </article>`;
}

function categoryAdminRow(category) {
  const productCount = catalogState.produtos.filter((product) => product.categoriaId === category.id).length;
  return `<article class="data-row card">
    <div class="data-title"><strong>${escapar(category.nome)}</strong><small>${productCount} produto(s) · Ordem ${Number(category.ordem || 0)}</small></div>
    <div><span class="badge ${category.ativa !== false ? "badge-success" : "badge-danger"}">${category.ativa !== false ? "Visível" : "Oculta"}</span></div>
    <div class="muted">${productCount ? "Possui produtos" : "Vazia"}</div>
    <div class="data-actions"><button class="btn btn-secondary btn-sm" data-edit-category="${category.id}" type="button">Editar</button><button class="btn btn-secondary btn-sm" data-toggle-category="${category.id}" type="button">${category.ativa !== false ? "Ocultar" : "Exibir"}</button><button class="btn btn-ghost btn-sm" data-delete-category="${category.id}" type="button">Excluir</button></div>
  </article>`;
}

async function handleCatalogChange(event) {
  const input = event.target.closest("[data-stock]");
  if (!input) return;
  const product = catalogState.produtos.find((item) => item.id === input.dataset.stock);
  if (!product) return;
  input.disabled = true;
  try {
    await updateCatalogDocument(doc(db, "produtos", product.id), { disponivel: input.checked, atualizadoEm: serverTimestamp() });
    product.disponivel = input.checked;
    renderCatalogList();
    toast(input.checked ? "Produto marcado como disponível." : "O produto agora aparece como ESGOTADO no cardápio.", input.checked ? "success" : "warning");
  } catch (error) {
    input.checked = !input.checked;
    input.disabled = false;
    toast(formatFirebaseError(error), "error");
  }
}

async function handleCatalogAction(event) {
  const editProduct = event.target.closest("[data-edit-product]");
  const toggleProduct = event.target.closest("[data-toggle-product]");
  const deleteProduct = event.target.closest("[data-delete-product]");
  const editCategory = event.target.closest("[data-edit-category]");
  const toggleCategory = event.target.closest("[data-toggle-category]");
  const deleteCategory = event.target.closest("[data-delete-category]");

  if (editProduct) productForm(catalogState.produtos.find((item) => item.id === editProduct.dataset.editProduct));
  if (editCategory) categoryForm(catalogState.categorias.find((item) => item.id === editCategory.dataset.editCategory));

  if (toggleProduct) {
    const product = catalogState.produtos.find((item) => item.id === toggleProduct.dataset.toggleProduct);
    setButtonLoading(toggleProduct, true);
    try {
      const active = product.ativo === false;
      await updateCatalogDocument(doc(db, "produtos", product.id), { ativo: active, atualizadoEm: serverTimestamp() });
      product.ativo = active;
      renderCatalogList();
      toast(active ? "Produto exibido no cardápio." : "Produto ocultado do cardápio.", "success");
    } catch (error) { toast(formatFirebaseError(error), "error"); setButtonLoading(toggleProduct, false); }
  }

  if (deleteProduct) {
    const product = catalogState.produtos.find((item) => item.id === deleteProduct.dataset.deleteProduct);
    const confirmed = await confirmar({ titulo: "Excluir produto", mensagem: `Excluir definitivamente “${product.nome}”? Esta ação não altera pedidos antigos.`, confirmarTexto: "Excluir produto", perigo: true });
    if (!confirmed) return;
    setButtonLoading(deleteProduct, true);
    try {
      await deleteCatalogDocument(doc(db, "produtos", product.id));
      catalogState.produtos = catalogState.produtos.filter((item) => item.id !== product.id);
      renderCatalogList();
      toast("Produto excluído.", "success");
    } catch (error) { toast(formatFirebaseError(error), "error"); setButtonLoading(deleteProduct, false); }
  }

  if (toggleCategory) {
    const category = catalogState.categorias.find((item) => item.id === toggleCategory.dataset.toggleCategory);
    setButtonLoading(toggleCategory, true);
    try {
      const active = category.ativa === false;
      await updateCatalogDocument(doc(db, "categorias", category.id), { ativa: active, atualizadoEm: serverTimestamp() });
      category.ativa = active;
      renderCatalogList();
      toast(active ? "Categoria exibida no cardápio." : "Categoria e seus produtos foram ocultados do cardápio.", "success");
    } catch (error) { toast(formatFirebaseError(error), "error"); setButtonLoading(toggleCategory, false); }
  }

  if (deleteCategory) {
    const category = catalogState.categorias.find((item) => item.id === deleteCategory.dataset.deleteCategory);
    const count = catalogState.produtos.filter((product) => product.categoriaId === category.id).length;
    if (count) {
      toast(`Esta categoria possui ${count} produto(s). Mova ou exclua esses produtos primeiro.`, "warning", "Categoria em uso");
      return;
    }
    const confirmed = await confirmar({ titulo: "Excluir categoria", mensagem: `Excluir definitivamente a categoria “${category.nome}”?`, confirmarTexto: "Excluir categoria", perigo: true });
    if (!confirmed) return;
    setButtonLoading(deleteCategory, true);
    try {
      await deleteCatalogDocument(doc(db, "categorias", category.id));
      catalogState.categorias = catalogState.categorias.filter((item) => item.id !== category.id);
      renderCatalogList();
      toast("Categoria excluída.", "success");
    } catch (error) { toast(formatFirebaseError(error), "error"); setButtonLoading(deleteCategory, false); }
  }
}

function productForm(product = null) {
  if (!catalogState.categorias.length) {
    toast("Crie pelo menos uma categoria antes de cadastrar produtos.", "warning");
    return;
  }
  openModal(`<div class="row-between"><div><p class="eyebrow">Cardápio</p><h2>${product ? "Editar produto" : "Novo produto"}</h2></div><button data-close class="btn btn-secondary btn-icon" type="button">×</button></div>
    <form id="product-form" class="form-grid">
      <div class="form-row"><label>Nome<input id="product-name" value="${escapar(product?.nome || "")}" maxlength="80" required></label><label>Preço<input id="product-price" type="number" min="0" step="0.01" value="${product?.preco ?? ""}" required></label></div>
      <label>Descrição<textarea id="product-description" maxlength="180" placeholder="Volume, sabor ou detalhes do produto">${escapar(product?.descricao || "")}</textarea></label>
      <div class="form-row"><label>Categoria<select id="product-category">${catalogState.categorias.map((category) => `<option value="${category.id}" ${product?.categoriaId === category.id ? "selected" : ""}>${escapar(category.nome)}</option>`).join("")}</select></label><label>Ordem de exibição<input id="product-order" type="number" min="0" value="${Number(product?.ordem || 100)}"></label></div>
      <label>URL da imagem<input id="product-image" type="url" value="${escapar(product?.imagemUrl || "")}" placeholder="https://..."><span class="form-help">Use uma imagem pública. O sistema não usa Firebase Storage para economizar.</span></label>
      <label class="switch-row"><span><strong>Disponível em estoque</strong><span class="form-help">Desmarcado: o produto continua aparecendo, mas com destaque ESGOTADO.</span></span><input id="product-stock" type="checkbox" ${product?.disponivel !== false ? "checked" : ""}><span class="switch"></span></label>
      <label class="switch-row"><span><strong>Exibir no cardápio</strong><span class="form-help">Desmarcado: o produto fica oculto para os clientes.</span></span><input id="product-active" type="checkbox" ${product?.ativo !== false ? "checked" : ""}><span class="switch"></span></label>
      <div class="modal-actions"><button data-close class="btn btn-secondary" type="button">Cancelar</button><button class="btn btn-primary" type="submit">Salvar produto</button></div>
    </form>`);

  $("#product-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.submitter;
    setButtonLoading(button, true);
    const data = {
      nome: limparTexto($("#product-name").value, 80),
      descricao: limparTexto($("#product-description").value, 180),
      preco: Number($("#product-price").value),
      categoriaId: $("#product-category").value,
      ordem: Number($("#product-order").value || 100),
      imagemUrl: $("#product-image").value.trim(),
      disponivel: $("#product-stock").checked,
      ativo: $("#product-active").checked,
      atualizadoEm: serverTimestamp()
    };
    try {
      if (product) {
        await updateCatalogDocument(doc(db, "produtos", product.id), data);
        Object.assign(product, data);
      } else {
        const newRef = doc(collection(db, "produtos"));
        await createCatalogDocument(newRef, { ...data, criadoEm: serverTimestamp() });
        catalogState.produtos.push({ id: newRef.id, ...data });
      }
      closeModal();
      renderCatalogList();
      toast("Produto salvo com sucesso.", "success");
    } catch (error) {
      toast(formatFirebaseError(error), "error");
      setButtonLoading(button, false);
    }
  });
}

function categoryForm(category = null) {
  openModal(`<div class="row-between"><div><p class="eyebrow">Cardápio</p><h2>${category ? "Editar categoria" : "Nova categoria"}</h2></div><button data-close class="btn btn-secondary btn-icon" type="button">×</button></div>
    <form id="category-form" class="form-grid"><label>Nome<input id="category-name" value="${escapar(category?.nome || "")}" maxlength="60" required></label><label>Ordem de exibição<input id="category-order" type="number" min="0" value="${Number(category?.ordem || 1)}"></label><label class="switch-row"><span><strong>Exibir categoria</strong><span class="form-help">Ao ocultar, os produtos desta categoria também deixam de aparecer.</span></span><input id="category-active" type="checkbox" ${category?.ativa !== false ? "checked" : ""}><span class="switch"></span></label><div class="modal-actions"><button data-close class="btn btn-secondary" type="button">Cancelar</button><button class="btn btn-primary" type="submit">Salvar categoria</button></div></form>`);
  $("#category-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.submitter;
    setButtonLoading(button, true);
    const data = { nome: limparTexto($("#category-name").value, 60), ordem: Number($("#category-order").value || 1), ativa: $("#category-active").checked, atualizadoEm: serverTimestamp() };
    try {
      if (category) {
        await updateCatalogDocument(doc(db, "categorias", category.id), data);
        Object.assign(category, data);
      } else {
        const newRef = doc(collection(db, "categorias"));
        await createCatalogDocument(newRef, { ...data, criadaEm: serverTimestamp() });
        catalogState.categorias.push({ id: newRef.id, ...data });
      }
      closeModal();
      renderCatalogList();
      toast("Categoria salva com sucesso.", "success");
    } catch (error) { toast(formatFirebaseError(error), "error"); setButtonLoading(button, false); }
  });
}

function addCatalogVersion(batch) {
  batch.set(doc(db, "catalogo_meta", "principal"), { versao: increment(1), atualizadoEm: serverTimestamp() }, { merge: true });
}
async function updateCatalogDocument(reference, data) {
  const batch = writeBatch(db);
  batch.update(reference, data);
  addCatalogVersion(batch);
  await batch.commit();
}
async function createCatalogDocument(reference, data) {
  const batch = writeBatch(db);
  batch.set(reference, data);
  addCatalogVersion(batch);
  await batch.commit();
}
async function deleteCatalogDocument(reference) {
  const batch = writeBatch(db);
  batch.delete(reference);
  addCatalogVersion(batch);
  await batch.commit();
}

/* HISTÓRICO */
async function historico() {
  const snapshot = await getDocs(query(collection(db, "historico_contas"), orderBy("fechadaEm", "desc"), limit(50)));
  const accounts = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  content.innerHTML = `<div class="page-enter"><div class="section-toolbar"><div><p class="eyebrow">Últimas contas</p><h2>Histórico</h2></div><span class="badge">Máximo de 50 contas por consulta</span></div><section class="data-list">${accounts.length ? accounts.map((account) => { const date = dataHora(account.fechadaEm); return `<article class="data-row card"><div class="data-title"><strong>Mesa ${String(account.mesaNumero).padStart(2, "0")} · ${escapar(account.responsavel)}</strong><small>${date.data} às ${date.hora}</small></div><div><strong>${dinheiro(account.total)}</strong></div><div><span class="badge">${escapar(account.formaPagamento || "—")}</span></div><div class="data-actions"><button class="btn btn-secondary btn-sm" data-history="${account.id}" type="button">Detalhes</button></div></article>`; }).join("") : `<div class="empty-state"><strong>Nenhuma conta fechada</strong></div>`}</section></div>`;
  content.onclick = (event) => {
    const button = event.target.closest("[data-history]");
    if (!button) return;
    const account = accounts.find((item) => item.id === button.dataset.history);
    historyDetails(account);
  };
}

function historyDetails(account) {
  const date = dataHora(account.fechadaEm);
  openModal(`<div class="row-between"><div><p class="eyebrow">Conta paga</p><h2>Mesa ${String(account.mesaNumero).padStart(2, "0")} · ${escapar(account.responsavel)}</h2></div><button data-close class="btn btn-secondary btn-icon">×</button></div><p class="muted">Fechada em ${date.data} às ${date.hora}</p><div class="status-list">${(account.pedidos || []).map((order) => `<article class="status-card"><strong>${escapar(order.solicitadoPor)}</strong><p>${order.itens.map((item) => `${item.quantidade}x ${escapar(item.nome)}`).join("<br>")}</p><strong>${dinheiro(order.total)}</strong></article>`).join("")}</div><div class="row-between cart-total"><strong>Total pago</strong><strong style="color:var(--gold)">${dinheiro(account.total)}</strong></div><p class="muted">${(account.pagamentos || []).map((item) => `${escapar(item.forma)}: ${dinheiro(item.valor)}`).join(" · ") || escapar(account.formaPagamento || "")}</p><div class="modal-actions"><button data-close class="btn btn-secondary">Fechar</button></div>`);
}

/* QR CODES */
async function qrcodes() {
  const [tablesSnap, accountsSnap] = await Promise.all([getDocs(query(collection(db, "mesas"), orderBy("numero"))), getDocs(collection(db, "contas_ativas"))]);
  let tables = tablesSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
  const openAccounts = new Set(accountsSnap.docs.map((item) => item.id));
  const render = () => {
    const baseMenu = new URL("../", window.location.href);
    content.innerHTML = `<div class="page-enter"><div class="section-toolbar"><div><p class="eyebrow">Links permanentes</p><h2>Mesas e QR Codes</h2></div><button id="new-table" class="btn btn-primary" type="button">Nova mesa</button></div><section class="data-list">${tables.length ? tables.map((table) => { const destination = new URL(baseMenu.href); destination.searchParams.set("mesa", String(table.numero).padStart(2, "0")); destination.searchParams.set("token", table.id); const url = destination.href; return `<article class="data-row card"><div class="data-title"><strong>Mesa ${String(table.numero).padStart(2, "0")}</strong><small>${table.ativa ? "QR ativo" : "QR desativado"}${openAccounts.has(table.id) ? " · Conta aberta" : ""}</small><div class="qr-url">${escapar(url)}</div></div><div><img class="qr-preview" alt="QR da Mesa ${table.numero}" src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}"></div><div><span class="badge ${table.ativa ? "badge-success" : "badge-danger"}">${table.ativa ? "Ativa" : "Desativada"}</span></div><div class="data-actions"><button class="btn btn-secondary btn-sm" data-copy-url="${encodeURIComponent(url)}">Copiar link</button><button class="btn btn-secondary btn-sm" data-toggle-table="${table.id}">${table.ativa ? "Desativar" : "Ativar"}</button><button class="btn btn-ghost btn-sm" data-delete-table="${table.id}">Excluir</button></div></article>`; }).join("") : `<div class="empty-state"><strong>Nenhuma mesa cadastrada</strong></div>`}</section></div>`;
    $("#new-table").addEventListener("click", tableForm);
  };
  render();

  content.onclick = async (event) => {
    const copy = event.target.closest("[data-copy-url]");
    const toggle = event.target.closest("[data-toggle-table]");
    const remove = event.target.closest("[data-delete-table]");
    if (copy) {
      await navigator.clipboard.writeText(decodeURIComponent(copy.dataset.copyUrl));
      toast("Link permanente da mesa copiado.", "success");
    }
    if (toggle) {
      const table = tables.find((item) => item.id === toggle.dataset.toggleTable);
      setButtonLoading(toggle, true);
      try {
        await updateDoc(doc(db, "mesas", table.id), { ativa: !table.ativa, atualizadaEm: serverTimestamp() });
        table.ativa = !table.ativa;
        render();
        toast(table.ativa ? "Mesa ativada." : "Mesa desativada.", "success");
      } catch (error) { toast(formatFirebaseError(error), "error"); setButtonLoading(toggle, false); }
    }
    if (remove) {
      const table = tables.find((item) => item.id === remove.dataset.deleteTable);
      if (openAccounts.has(table.id)) { toast("Feche a conta desta mesa antes de excluí-la.", "warning"); return; }
      const confirmed = await confirmar({ titulo: "Excluir mesa", mensagem: `Excluir a Mesa ${String(table.numero).padStart(2, "0")} e invalidar seu QR Code?`, confirmarTexto: "Excluir mesa", perigo: true });
      if (!confirmed) return;
      const batch = writeBatch(db); batch.delete(doc(db, "mesas", table.id));
      try { await batch.commit(); tables = tables.filter((item) => item.id !== table.id); render(); toast("Mesa excluída.", "success"); } catch (error) { toast(formatFirebaseError(error), "error"); }
    }
  };

  function tableForm() {
    openModal(`<div class="row-between"><div><p class="eyebrow">QR Code</p><h2>Nova mesa</h2></div><button data-close class="btn btn-secondary btn-icon">×</button></div><form id="table-form" class="form-grid"><label>Número da mesa<input id="table-number" type="number" min="1" required></label><div class="modal-actions"><button data-close class="btn btn-secondary" type="button">Cancelar</button><button class="btn btn-primary" type="submit">Criar mesa e QR</button></div></form>`);
    $("#table-form").addEventListener("submit", async (event) => {
      event.preventDefault(); const button = event.submitter; setButtonLoading(button, true);
      const number = Number($("#table-number").value);
      if (tables.some((table) => Number(table.numero) === number)) { toast("Já existe uma mesa com esse número.", "warning"); setButtonLoading(button, false); return; }
      try {
        const token = crypto.randomUUID().replaceAll("-", "").slice(0, 20);
        const data = { numero: number, ativa: true, criadaEm: serverTimestamp() };
        await setDoc(doc(db, "mesas", token), data);
        tables.push({ id: token, ...data }); tables.sort((a, b) => Number(a.numero) - Number(b.numero)); closeModal(); render(); toast("Mesa e QR Code criados.", "success");
      } catch (error) { toast(formatFirebaseError(error), "error"); setButtonLoading(button, false); }
    });
  }
}

/* USUÁRIOS */
async function usuarios() {
  let users = (await getDocs(collection(db, "usuarios"))).docs.map((item) => ({ id: item.id, ...item.data() }));
  const render = () => {
    content.innerHTML = `<div class="page-enter"><div class="notice">Crie primeiro o login em Authentication → Usuários. Depois cadastre aqui o perfil usando o UID.</div><div class="section-toolbar section"><div><p class="eyebrow">Equipe</p><h2>Usuários autorizados</h2></div><button id="new-user" class="btn btn-primary">Cadastrar perfil</button></div><section class="data-list">${users.map((item) => `<article class="data-row card"><div class="data-title"><strong>${escapar(item.nome)}</strong><small>${escapar(item.email || item.id)}</small></div><div><span class="badge">${escapar(item.perfil)}</span></div><div><span class="badge ${item.ativo ? "badge-success" : "badge-danger"}">${item.ativo ? "Ativo" : "Inativo"}</span></div><div class="data-actions"><button class="btn btn-secondary btn-sm" data-toggle-user="${item.id}">${item.ativo ? "Desativar" : "Ativar"}</button></div></article>`).join("")}</section></div>`;
    $("#new-user").addEventListener("click", userForm);
  };
  render();
  content.onclick = async (event) => {
    const button = event.target.closest("[data-toggle-user]"); if (!button) return;
    const item = users.find((entry) => entry.id === button.dataset.toggleUser);
    if (item.id === user.uid && item.ativo) { toast("Você não pode desativar seu próprio acesso.", "warning"); return; }
    setButtonLoading(button, true);
    try { await updateDoc(doc(db, "usuarios", item.id), { ativo: !item.ativo }); item.ativo = !item.ativo; render(); toast("Acesso atualizado.", "success"); } catch (error) { toast(formatFirebaseError(error), "error"); setButtonLoading(button, false); }
  };
  function userForm() {
    openModal(`<div class="row-between"><div><p class="eyebrow">Equipe</p><h2>Cadastrar perfil</h2></div><button data-close class="btn btn-secondary btn-icon">×</button></div><form id="user-form" class="form-grid"><label>UID do Authentication<input id="user-uid" required></label><label>Nome<input id="user-name" required></label><label>E-mail<input id="user-email" type="email"></label><label>Perfil<select id="user-profile"><option value="atendimento">Atendimento</option><option value="caixa">Caixa</option><option value="administrador">Administrador</option></select></label><div class="modal-actions"><button data-close class="btn btn-secondary" type="button">Cancelar</button><button class="btn btn-primary" type="submit">Salvar perfil</button></div></form>`);
    $("#user-form").addEventListener("submit", async (event) => {
      event.preventDefault(); const button = event.submitter; setButtonLoading(button, true);
      const id = $("#user-uid").value.trim(); const data = { nome: limparTexto($("#user-name").value, 60), email: $("#user-email").value.trim(), perfil: $("#user-profile").value, ativo: true };
      try { await setDoc(doc(db, "usuarios", id), data); users.push({ id, ...data }); closeModal(); render(); toast("Perfil cadastrado.", "success"); } catch (error) { toast(formatFirebaseError(error), "error"); setButtonLoading(button, false); }
    });
  }
}

/* CONFIGURAÇÕES */
async function configuracoes() {
  const snapshot = await getDoc(doc(db, "configuracoes", "publico"));
  const settings = snapshot.exists() ? snapshot.data() : {};
  content.innerHTML = `<div class="page-enter"><section class="section-card card" style="max-width:760px"><p class="eyebrow">Informações públicas</p><h2>Configurações do cardápio</h2><form id="settings-form" class="form-grid"><label>Nome da loja<input id="store-name" value="${escapar(settings.nomeLoja || "Miranda Empório de Bebidas")}"></label><label>WhatsApp<input id="store-whatsapp" value="${escapar(settings.whatsapp || "")}" placeholder="5516999999999"></label><label>Mensagem do topo<textarea id="store-message" maxlength="240">${escapar(settings.mensagem || "Bebidas, espetinhos e porções. Peça quantas vezes quiser e pague somente ao fechar a conta no caixa.")}</textarea></label><button class="btn btn-primary" type="submit">Salvar configurações</button></form></section></div>`;
  $("#settings-form").addEventListener("submit", async (event) => {
    event.preventDefault(); const button = event.submitter; setButtonLoading(button, true);
    const data = { nomeLoja: limparTexto($("#store-name").value, 80), whatsapp: limparTexto($("#store-whatsapp").value, 20), mensagem: limparTexto($("#store-message").value, 240), atualizadoEm: serverTimestamp() };
    try {
      const batch = writeBatch(db); batch.set(doc(db, "configuracoes", "publico"), data, { merge: true }); addCatalogVersion(batch); await batch.commit();
      toast("Configurações salvas. O cache do cardápio será atualizado.", "success");
    } catch (error) { toast(formatFirebaseError(error), "error"); }
    finally { setButtonLoading(button, false); }
  });
}
