import { auth, db, firebaseConfigurado } from "../shared/firebase.js";
import { dinheiro, gerarId, limparTexto, escapar, dataHora } from "../shared/utils.js";
import {
  signInAnonymously, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  doc, getDoc, setDoc, collection, getDocs, query, where, orderBy,
  addDoc, serverTimestamp, limit
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const mesaNumeroUrl = params.get("mesa");
const mesaToken = params.get("token");

let usuario = null, mesa = null, conta = null, clienteNome = "";
let produtos = [], categorias = [], carrinho = new Map();

const setupAlert = $("#setup-alert");
if (!firebaseConfigurado) {
  setupAlert.classList.remove("hidden");
  setupAlert.textContent = "Firebase ainda não configurado. Abra js/shared/firebase-config.js e insira as credenciais do projeto.";
  $("#identificacao").classList.add("hidden");
}

if (firebaseConfigurado) iniciar();

async function iniciar() {
  if (!mesaToken || !mesaNumeroUrl) return falharMesa("QR Code inválido ou incompleto.");

  try {
    const mesaSnap = await getDoc(doc(db, "mesas", mesaToken));
    if (!mesaSnap.exists() || !mesaSnap.data().ativa) return falharMesa("Esta mesa está desativada.");
    mesa = { id: mesaSnap.id, ...mesaSnap.data() };
    if (String(mesa.numero).padStart(2, "0") !== String(mesaNumeroUrl).padStart(2, "0")) {
      return falharMesa("Os dados do QR Code não correspondem à mesa.");
    }
    $("#mesa-badge").textContent = `Mesa ${String(mesa.numero).padStart(2, "0")}`;

    await signInAnonymously(auth);
    onAuthStateChanged(auth, async (u) => {
      if (!u) return;
      usuario = u;
      await carregarConta();
    });
  } catch (e) {
    console.error(e);
    falharMesa("Não foi possível validar a mesa. Verifique a internet.");
  }
}

function falharMesa(msg) {
  $("#mesa-badge").textContent = "QR inválido";
  $("#titulo-conta").textContent = "Não foi possível abrir o cardápio";
  $("#texto-conta").textContent = msg;
}

async function carregarConta() {
  const contaSnap = await getDoc(doc(db, "contas_ativas", mesaToken));
  conta = contaSnap.exists() ? { id: contaSnap.id, ...contaSnap.data() } : null;

  const chave = `miranda_${mesaToken}_${conta?.sessaoId || "nova"}`;
  const salvo = JSON.parse(localStorage.getItem(chave) || "null");

  if (conta) {
    $("#titulo-conta").textContent = `Conta aberta em nome de ${conta.responsavel}`;
    $("#texto-conta").textContent = salvo?.nome
      ? `Olá, ${salvo.nome}. Seus próximos pedidos serão incluídos nesta conta.`
      : "Informe seu nome. Seu pedido será incluído nesta conta, sem abrir outra.";
  } else {
    $("#titulo-conta").textContent = `Mesa ${String(mesa.numero).padStart(2, "0")} livre`;
    $("#texto-conta").textContent = "Informe seu nome para abrir a conta desta mesa.";
  }

  if (salvo?.nome) {
    clienteNome = salvo.nome;
    liberarCardapio();
  } else {
    $("#form-nome").classList.remove("hidden");
  }
}

$("#form-nome").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const nome = limparTexto($("#nome").value, 40);
  if (nome.length < 2) return;

  const botao = ev.submitter;
  botao.disabled = true;
  try {
    if (!conta) {
      const nova = {
        mesaToken,
        mesaNumero: mesa.numero,
        responsavel: nome,
        responsavelUid: usuario.uid,
        sessaoId: gerarId(`mesa${mesa.numero}`),
        status: "aberta",
        abertaEm: serverTimestamp()
      };
      await setDoc(doc(db, "contas_ativas", mesaToken), nova);
      conta = nova;
    }
    clienteNome = nome;
    localStorage.setItem(`miranda_${mesaToken}_${conta.sessaoId}`, JSON.stringify({ nome }));
    $("#form-nome").classList.add("hidden");
    $("#titulo-conta").textContent = `Conta aberta em nome de ${conta.responsavel}`;
    $("#texto-conta").textContent = `Olá, ${nome}. Seus pedidos serão incluídos nesta conta.`;
    await liberarCardapio();
  } catch (e) {
    console.error(e);
    $("#texto-conta").textContent = "Outra pessoa pode ter aberto a conta agora. Atualize a página.";
  } finally { botao.disabled = false; }
});

async function liberarCardapio() {
  $("#area-cardapio").classList.remove("hidden");
  $("#abrir-carrinho").classList.remove("hidden");
  await Promise.all([carregarCategorias(), carregarProdutos()]);
  renderCategorias();
  renderProdutos();
}

async function carregarCategorias() {
  const snap = await getDocs(query(collection(db, "categorias"), orderBy("ordem")));
  categorias = snap.docs.map(d => ({ id:d.id, ...d.data() })).filter(c => c.ativa !== false);
}

async function carregarProdutos() {
  const snap = await getDocs(query(collection(db, "produtos"), where("ativo","==",true)));
  produtos = snap.docs.map(d => ({ id:d.id, ...d.data() }));
}

function renderCategorias() {
  $("#categorias").innerHTML = [
    `<button class="chip active" data-cat="">Todos</button>`,
    ...categorias.map(c => `<button class="chip" data-cat="${c.id}">${escapar(c.nome)}</button>`)
  ].join("");
}

function renderProdutos(filtroCat = "", busca = "") {
  const lista = produtos.filter(p =>
    (!filtroCat || p.categoriaId === filtroCat) &&
    (!busca || p.nome.toLowerCase().includes(busca.toLowerCase()))
  );
  $("#produtos").innerHTML = lista.length ? lista.map(p => `
    <article class="product card">
      <div class="product-img">${p.imagemUrl ? `<img src="${escapar(p.imagemUrl)}" alt="${escapar(p.nome)}">` : "Sem imagem"}</div>
      <div class="product-body">
        <h3>${escapar(p.nome)}</h3>
        <p class="muted">${escapar(p.descricao || "")}</p>
        <p class="product-price">${dinheiro(p.preco)}</p>
        <button class="btn btn-primary" data-add="${p.id}">Adicionar</button>
      </div>
    </article>`).join("") : `<p class="muted">Nenhum produto encontrado.</p>`;
}

let catAtual = "";
$("#categorias").addEventListener("click", e => {
  const b = e.target.closest("[data-cat]"); if (!b) return;
  catAtual = b.dataset.cat;
  document.querySelectorAll(".chip").forEach(x => x.classList.toggle("active", x === b));
  renderProdutos(catAtual, $("#busca").value);
});
$("#busca").addEventListener("input", e => renderProdutos(catAtual, e.target.value));
$("#produtos").addEventListener("click", e => {
  const b = e.target.closest("[data-add]"); if (!b) return;
  const p = produtos.find(x => x.id === b.dataset.add); if (!p) return;
  const atual = carrinho.get(p.id) || { produto:p, quantidade:0 };
  atual.quantidade++;
  carrinho.set(p.id, atual); atualizarCarrinho();
});

function atualizarCarrinho() {
  const itens = [...carrinho.values()];
  $("#qtd-carrinho").textContent = itens.reduce((s,i)=>s+i.quantidade,0);
  $("#itens-carrinho").innerHTML = itens.length ? itens.map(i => `
    <div class="cart-item">
      <div><strong>${escapar(i.produto.nome)}</strong><br><small>${dinheiro(i.produto.preco)} cada</small></div>
      <div class="qty"><button data-dec="${i.produto.id}">−</button><strong>${i.quantidade}</strong><button data-inc="${i.produto.id}">+</button></div>
    </div>`).join("") : `<p class="muted">Seu carrinho está vazio.</p>`;
  $("#total-carrinho").textContent = dinheiro(itens.reduce((s,i)=>s+i.quantidade*Number(i.produto.preco),0));
}

$("#itens-carrinho").addEventListener("click", e => {
  const inc=e.target.closest("[data-inc]"), dec=e.target.closest("[data-dec]");
  const id=inc?.dataset.inc || dec?.dataset.dec; if(!id) return;
  const item=carrinho.get(id); if(!item) return;
  item.quantidade += inc ? 1 : -1;
  if(item.quantidade<=0)carrinho.delete(id); else carrinho.set(id,item);
  atualizarCarrinho();
});

$("#abrir-carrinho").onclick=()=>{$("#modal-carrinho").classList.remove("hidden");atualizarCarrinho()};
document.querySelectorAll("[data-fechar]").forEach(b=>b.onclick=()=>b.closest(".modal-backdrop").classList.add("hidden"));

$("#enviar-pedido").addEventListener("click", async () => {
  const itens=[...carrinho.values()];
  if(!itens.length) return;
  const btn=$("#enviar-pedido"); btn.disabled=true; $("#erro-pedido").textContent="";
  try {
    const contaAtual=await getDoc(doc(db,"contas_ativas",mesaToken));
    if(!contaAtual.exists() || contaAtual.data().sessaoId!==conta.sessaoId) throw new Error("CONTA_ENCERRADA");
    const itensPedido=itens.map(i=>({
      produtoId:i.produto.id,nome:i.produto.nome,quantidade:i.quantidade,
      precoUnitario:Number(i.produto.preco),subtotal:Number(i.produto.preco)*i.quantidade
    }));
    const total=itensPedido.reduce((s,i)=>s+i.subtotal,0);
    await addDoc(collection(db,"pedidos"),{
      mesaToken,mesaNumero:mesa.numero,sessaoId:conta.sessaoId,
      responsavelConta:conta.responsavel,solicitadoPor:clienteNome,clienteUid:usuario.uid,
      itens:itensPedido,total,observacao:limparTexto($("#observacao").value,240),
      status:"novo",criadoEm:serverTimestamp(),statusImpressao:"pendente"
    });
    carrinho.clear(); atualizarCarrinho(); $("#observacao").value="";
    $("#modal-carrinho").classList.add("hidden");
    alert("Pedido enviado para a central.");
  } catch(e) {
    console.error(e);
    $("#erro-pedido").textContent=e.message==="CONTA_ENCERRADA" ? "A conta foi encerrada. Leia novamente o QR Code." : "Não foi possível enviar o pedido.";
  } finally {btn.disabled=false}
});

$("#meus-pedidos").addEventListener("click", async()=>{
  $("#modal-pedidos").classList.remove("hidden");
  const lista=$("#lista-meus-pedidos"); lista.innerHTML="Carregando...";
  const snap=await getDocs(query(collection(db,"pedidos"),where("clienteUid","==",usuario.uid),orderBy("criadoEm","desc"),limit(30)));
  lista.innerHTML=snap.empty ? `<p class="muted">Nenhum pedido neste celular.</p>` : snap.docs.map(d=>{
    const p=d.data(), dh=dataHora(p.criadoEm);
    return `<article class="status-card"><div class="row-between"><strong>Mesa ${String(p.mesaNumero).padStart(2,"0")}</strong><span class="badge">${escapar(p.status)}</span></div><small>${dh.data} às ${dh.hora}</small><p>${p.itens.map(i=>`${i.quantidade}x ${escapar(i.nome)}`).join("<br>")}</p><strong>${dinheiro(p.total)}</strong></article>`
  }).join("");
});
