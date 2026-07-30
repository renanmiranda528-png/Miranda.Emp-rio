import { auth, db } from "../shared/firebase.js";
import { dinheiro, dataHora, escapar, limparTexto, gerarId } from "../shared/utils.js";
import { onAuthStateChanged, signOut, createUserWithEmailAndPassword, getAuth } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  doc,getDoc,setDoc,addDoc,updateDoc,deleteDoc,collection,getDocs,query,where,orderBy,
  onSnapshot,serverTimestamp,writeBatch,limit,Timestamp
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const $=s=>document.querySelector(s);
let usuario=null,perfil=null,unsubscribe=null,tabAtual="pedidos";
const conteudo=$("#conteudo"), modal=$("#modal-admin"), modalBody=$("#modal-admin-conteudo");

onAuthStateChanged(auth, async (u) => {
  try {
    if (!u) {
      location.replace("./login.html");
      return;
    }

    $("#conexao").textContent = "Validando acesso...";

    const snap = await getDoc(doc(db, "usuarios", u.uid));
    if (!snap.exists() || snap.data().ativo !== true) {
      await signOut(auth);
      location.replace("./login.html");
      return;
    }

    usuario = u;
    perfil = snap.data();
    $("#usuario-logado").textContent = `${perfil.nome} · ${perfil.perfil}`;
    $("#conexao").textContent = navigator.onLine ? "Conectado" : "Sem conexão";

    aplicarPermissoes();
    abrirTab("pedidos");
  } catch (erro) {
    console.error("Falha ao iniciar a central:", erro);
    $("#conexao").textContent = "Erro de conexão";
    conteudo.innerHTML = `
      <section class="notice">
        <strong>Não foi possível iniciar a Central.</strong><br>
        ${escapar(erro?.message || "Erro desconhecido.")}
        <br><br>Confira o Firebase, as regras e os domínios autorizados.
      </section>`;
  }
});

function aplicarPermissoes(){
  if(perfil.perfil!=="administrador"){
    document.querySelectorAll('[data-tab="usuarios"],[data-tab="configuracoes"]').forEach(x=>x.remove());
  }
  if(perfil.perfil==="atendimento"){
    document.querySelectorAll('[data-tab="historico"],[data-tab="cardapio"],[data-tab="qrcodes"]').forEach(x=>x.remove());
  }
}
$("#sair").onclick=async()=>{await signOut(auth);location.href="./login.html"};
window.addEventListener("online",()=>$("#conexao").textContent="Conectado");
window.addEventListener("offline",()=>$("#conexao").textContent="Sem conexão");
$("#conexao").textContent=navigator.onLine?"Conectado":"Sem conexão";

document.querySelector("nav").addEventListener("click",e=>{
  const a=e.target.closest("[data-tab]");if(!a)return;e.preventDefault();
  document.querySelectorAll("nav a").forEach(x=>x.classList.toggle("active",x===a));abrirTab(a.dataset.tab);
});

function abrirTab(tab){
  if(unsubscribe){unsubscribe();unsubscribe=null}
  tabAtual=tab;$("#titulo-pagina").textContent=({pedidos:"Pedidos",mesas:"Mesas e contas",cardapio:"Cardápio",historico:"Histórico",qrcodes:"Mesas e QR Codes",usuarios:"Usuários",configuracoes:"Configurações"})[tab];
  ({pedidos,mesas,cardapio,historico,qrcodes,usuarios,configuracoes})[tab]();
}
function abrirModal(html){modalBody.innerHTML=html;modal.classList.remove("hidden")}
function fecharModal(){modal.classList.add("hidden");modalBody.innerHTML=""}
modal.addEventListener("click",e=>{if(e.target===modal||e.target.closest("[data-close]"))fecharModal()});

function pedidos(){
  conteudo.innerHTML=`<section class="stats">
    <article class="stat card"><span>Novos</span><strong id="s-novo">0</strong></article>
    <article class="stat card"><span>Em preparo</span><strong id="s-preparo">0</strong></article>
    <article class="stat card"><span>Prontos</span><strong id="s-pronto">0</strong></article>
    <article class="stat card"><span>Mesas abertas</span><strong id="s-mesas">0</strong></article></section>
    <section class="board">
      ${["novo","aceito","preparo","pronto"].map(s=>`<div class="column card"><h3>${{novo:"Novos",aceito:"Aceitos",preparo:"Em preparo",pronto:"Prontos"}[s]}</h3><div id="col-${s}" class="order-list"></div></div>`).join("")}
    </section>`;
  const q=query(collection(db,"pedidos"),where("status","in",["novo","aceito","preparo","pronto"]),orderBy("criadoEm","desc"),limit(100));
  unsubscribe=onSnapshot(q,async snap=>{
    const ps=snap.docs.map(d=>({id:d.id,...d.data()}));
    ["novo","aceito","preparo","pronto"].forEach(s=>{
      const arr=ps.filter(p=>p.status===s);$(`#col-${s}`).innerHTML=arr.length?arr.map(cardPedido).join(""):`<p class="muted">Nenhum.</p>`;
    });
    $("#s-novo").textContent=ps.filter(p=>p.status==="novo").length;
    $("#s-preparo").textContent=ps.filter(p=>p.status==="preparo").length;
    $("#s-pronto").textContent=ps.filter(p=>p.status==="pronto").length;
    const contas=await getDocs(collection(db,"contas_ativas"));$("#s-mesas").textContent=contas.size;
  },console.error);
  conteudo.onclick=acaoPedido;
}
function cardPedido(p){
  const dh=dataHora(p.criadoEm);
  const prox={novo:["Aceitar","aceito"],aceito:["Iniciar preparo","preparo"],preparo:["Marcar pronto","pronto"],pronto:["Entregue","entregue"]}[p.status];
  return `<article class="order-card ${p.status==="novo"?"new":""}">
    <div class="row-between"><strong>Mesa ${String(p.mesaNumero).padStart(2,"0")}</strong><span class="badge">${dh.hora}</span></div>
    <small>${dh.data} · Conta: ${escapar(p.responsavelConta)}</small>
    <p><strong>Pedido por ${escapar(p.solicitadoPor)}</strong></p>
    <div class="order-items">${p.itens.map(i=>`${i.quantidade}x ${escapar(i.nome)} — ${dinheiro(i.subtotal)}`).join("<br>")}</div>
    ${p.observacao?`<p><small>Obs.: ${escapar(p.observacao)}</small></p>`:""}
    <strong>${dinheiro(p.total)}</strong>
    <div class="actions"><button class="btn btn-primary" data-status="${p.id}|${prox[1]}">${prox[0]}</button>
    <button class="btn btn-secondary" data-print="${p.id}">Imprimir</button>
    ${p.status==="novo"?`<button class="btn btn-danger" data-status="${p.id}|cancelado">Recusar</button>`:""}</div>
  </article>`;
}
async function acaoPedido(e){
  const s=e.target.closest("[data-status]"),pr=e.target.closest("[data-print]");
  if(s){const[id,status]=s.dataset.status.split("|");s.disabled=true;await updateDoc(doc(db,"pedidos",id),{status,atualizadoEm:serverTimestamp(),atualizadoPor:usuario.uid});}
  if(pr){const snap=await getDoc(doc(db,"pedidos",pr.dataset.print));imprimirPedido(snap.data(),snap.id)}
}
function imprimirPedido(p,id){
  const dh=dataHora(p.criadoEm);
  const w=open("","_blank","width=420,height=700");
  w.document.write(`<html><head><title>Pedido ${id}</title><style>body{font-family:monospace;width:72mm;margin:8mm auto;color:#000}h2,p{text-align:center}.line{border-top:1px dashed #000;margin:8px 0}.item{display:flex;justify-content:space-between}</style></head><body>
  <h2>MIRANDA<br><small>EMPÓRIO DE BEBIDAS</small></h2><div class="line"></div>
  <b>NOVO PEDIDO</b><br>Mesa: ${p.mesaNumero}<br>Conta: ${escapar(p.responsavelConta)}<br>Solicitado por: ${escapar(p.solicitadoPor)}<br>Data: ${dh.data}<br>Horário: ${dh.hora}
  <div class="line"></div>${p.itens.map(i=>`<div class="item"><span>${i.quantidade}x ${escapar(i.nome)}</span><span>${dinheiro(i.subtotal)}</span></div>`).join("")}
  ${p.observacao?`<div class="line"></div>OBS: ${escapar(p.observacao)}`:""}<div class="line"></div><b>TOTAL DO PEDIDO: ${dinheiro(p.total)}</b><p>CONTA ABERTA</p>
  <script>onload=()=>print()</script></body></html>`);w.document.close();
}

async function mesas(){
  const [ms,cs]=await Promise.all([getDocs(query(collection(db,"mesas"),orderBy("numero"))),getDocs(collection(db,"contas_ativas"))]);
  const contas=new Map(cs.docs.map(d=>[d.id,{id:d.id,...d.data()}]));
  conteudo.innerHTML=`<section class="table-grid">${ms.docs.map(d=>{
    const m={id:d.id,...d.data()},c=contas.get(m.id);
    return `<article class="table-row card"><div><strong>Mesa ${String(m.numero).padStart(2,"0")}</strong><br><small>${c?`Conta de ${escapar(c.responsavel)}`:"Livre"}</small></div><div>${c?dataHora(c.abertaEm).hora:"—"}</div><div><span class="badge">${c?"Aberta":"Livre"}</span></div><div>${c?`<button class="btn btn-primary" data-conta="${m.id}">Ver conta</button>`:""}</div></article>`
  }).join("")}</section>`;
  conteudo.onclick=e=>{const b=e.target.closest("[data-conta]");if(b)abrirConta(b.dataset.conta)};
}
async function abrirConta(token){
  const [cSnap,pSnap]=await Promise.all([getDoc(doc(db,"contas_ativas",token)),getDocs(query(collection(db,"pedidos"),where("mesaToken","==",token)))]);
  if(!cSnap.exists())return alert("Conta já encerrada.");
  const c=cSnap.data(), pedidos=pSnap.docs.map(d=>({id:d.id,...d.data()})).filter(p=>p.sessaoId===c.sessaoId&&p.status!=="cancelado");
  const total=pedidos.reduce((s,p)=>s+Number(p.total||0),0);
  abrirModal(`<div class="row-between"><div><p class="eyebrow">MESA ${String(c.mesaNumero).padStart(2,"0")}</p><h2>Conta de ${escapar(c.responsavel)}</h2></div><button data-close class="btn btn-secondary">Fechar</button></div>
  <div class="status-list">${pedidos.map(p=>`<div class="status-card"><strong>${escapar(p.solicitadoPor)}</strong> · ${dataHora(p.criadoEm).data} às ${dataHora(p.criadoEm).hora}<br>${p.itens.map(i=>`${i.quantidade}x ${escapar(i.nome)}`).join("<br>")}<br><b>${dinheiro(p.total)}</b></div>`).join("")}</div>
  <hr><div class="row-between"><h3>Total</h3><h3>${dinheiro(total)}</h3></div>
  ${perfil.perfil!=="atendimento"?`<button id="receber" class="btn btn-success">Receber e fechar conta</button>`:""}`);
  $("#receber")?.addEventListener("click",()=>modalPagamento(token,c,pedidos,total));
}
function modalPagamento(token,c,pedidos,total){
  abrirModal(`<button data-close class="btn btn-secondary">Voltar</button><h2>Receber conta</h2><p>Mesa ${c.mesaNumero} · ${escapar(c.responsavel)}</p><h3>${dinheiro(total)}</h3>
  <form id="form-pag" class="form-grid"><label>Forma de pagamento<select id="forma"><option>Pix</option><option>Dinheiro</option><option>Débito</option><option>Crédito</option><option>Dividido</option></select></label>
  <label id="detalhe-wrap" class="hidden">Detalhes do pagamento dividido<textarea id="detalhe" placeholder="Ex.: Pix R$ 50,00 + Crédito R$ 76,50"></textarea></label>
  <button class="btn btn-success">Confirmar pagamento e fechar</button></form>`);
  $("#forma").onchange=e=>$("#detalhe-wrap").classList.toggle("hidden",e.target.value!=="Dividido");
  $("#form-pag").onsubmit=async e=>{
    e.preventDefault();const b=e.submitter;b.disabled=true;
    if(!confirm(`Confirma o recebimento de ${dinheiro(total)}?`)){b.disabled=false;return}
    const histId=gerarId("conta");
    const batch=writeBatch(db);
    batch.set(doc(db,"historico_contas",histId),{...c,total,formaPagamento:$("#forma").value,detalhesPagamento:limparTexto($("#detalhe")?.value,200),status:"paga",fechadaEm:serverTimestamp(),fechadaPor:usuario.uid,pedidos});
    pedidos.forEach(p=>batch.update(doc(db,"pedidos",p.id),{statusPagamento:"pago",contaHistoricoId:histId}));
    batch.delete(doc(db,"contas_ativas",token));
    await batch.commit();fecharModal();mesas();
  };
}

async function cardapio(){
  const [ps,cs]=await Promise.all([getDocs(collection(db,"produtos")),getDocs(query(collection(db,"categorias"),orderBy("ordem")))]);
  const cats=cs.docs.map(d=>({id:d.id,...d.data()})), prod=ps.docs.map(d=>({id:d.id,...d.data()}));
  conteudo.innerHTML=`<div class="tabs"><button class="btn btn-primary" id="novo-prod">Novo produto</button><button class="btn btn-secondary" id="nova-cat">Nova categoria</button></div>
  <section class="table-grid">${prod.map(p=>`<article class="table-row card"><div><strong>${escapar(p.nome)}</strong><br><small>${escapar(cats.find(c=>c.id===p.categoriaId)?.nome||"Sem categoria")}</small></div><div>${dinheiro(p.preco)}</div><div><span class="badge">${p.ativo?"Disponível":"Indisponível"}</span></div><button class="btn btn-secondary" data-edit-prod="${p.id}">Editar</button></article>`).join("")}</section>`;
  $("#novo-prod").onclick=()=>formProduto(null,cats);$("#nova-cat").onclick=()=>formCategoria();
  conteudo.onclick=async e=>{const b=e.target.closest("[data-edit-prod]");if(b){const p=prod.find(x=>x.id===b.dataset.editProd);formProduto(p,cats)}};
}
function formProduto(p,cats){
  abrirModal(`<button data-close class="btn btn-secondary">Fechar</button><h2>${p?"Editar":"Novo"} produto</h2>
  <form id="fp" class="form-grid"><label>Nome<input id="pn" value="${escapar(p?.nome||"")}" required></label><label>Descrição<input id="pd" value="${escapar(p?.descricao||"")}"></label>
  <label>Preço<input id="pp" type="number" min="0" step=".01" value="${p?.preco||""}" required></label><label>Categoria<select id="pc">${cats.map(c=>`<option value="${c.id}" ${p?.categoriaId===c.id?"selected":""}>${escapar(c.nome)}</option>`).join("")}</select></label>
  <label>URL da imagem<input id="pi" value="${escapar(p?.imagemUrl||"")}"></label><label><input id="pa" type="checkbox" ${p?.ativo!==false?"checked":""}> Disponível</label><button class="btn btn-primary">Salvar</button></form>`);
  $("#fp").onsubmit=async e=>{e.preventDefault();const data={nome:limparTexto($("#pn").value,80),descricao:limparTexto($("#pd").value,180),preco:Number($("#pp").value),categoriaId:$("#pc").value,imagemUrl:$("#pi").value.trim(),ativo:$("#pa").checked,atualizadoEm:serverTimestamp()};p?await updateDoc(doc(db,"produtos",p.id),data):await addDoc(collection(db,"produtos"),{...data,criadoEm:serverTimestamp()});fecharModal();cardapio()};
}
function formCategoria(){
  abrirModal(`<button data-close class="btn btn-secondary">Fechar</button><h2>Nova categoria</h2><form id="fc" class="form-grid"><label>Nome<input id="cn" required></label><label>Ordem<input id="co" type="number" value="1"></label><button class="btn btn-primary">Salvar</button></form>`);
  $("#fc").onsubmit=async e=>{e.preventDefault();await addDoc(collection(db,"categorias"),{nome:limparTexto($("#cn").value,60),ordem:Number($("#co").value),ativa:true});fecharModal();cardapio()};
}

async function historico(){
  const snap=await getDocs(query(collection(db,"historico_contas"),orderBy("fechadaEm","desc"),limit(100)));
  conteudo.innerHTML=`<section class="table-grid">${snap.docs.map(d=>{const c=d.data(),dh=dataHora(c.fechadaEm);return `<article class="table-row card"><div><strong>Mesa ${String(c.mesaNumero).padStart(2,"0")} · ${escapar(c.responsavel)}</strong><br><small>${dh.data} às ${dh.hora}</small></div><div>${dinheiro(c.total)}</div><div>${escapar(c.formaPagamento)}</div><button class="btn btn-secondary" data-hist="${d.id}">Detalhes</button></article>`}).join("")||"<p>Nenhuma conta fechada.</p>"}</section>`;
}
async function qrcodes(){
  const snap = await getDocs(query(collection(db, "mesas"), orderBy("numero")));
  const baseCardapio = new URL("../", window.location.href);

  const cards = snap.docs.map((documento) => {
    const mesa = { id: documento.id, ...documento.data() };
    const destino = new URL(baseCardapio.href);
    destino.searchParams.set("mesa", String(mesa.numero).padStart(2, "0"));
    destino.searchParams.set("token", mesa.id);
    const url = destino.href;

    return `<article class="table-row card">
      <div>
        <strong>Mesa ${String(mesa.numero).padStart(2, "0")}</strong><br>
        <small>${mesa.ativa ? "QR ativo" : "Desativada"}</small>
      </div>
      <div style="overflow:hidden;text-overflow:ellipsis">${escapar(url)}</div>
      <div>
        <img alt="QR Mesa ${mesa.numero}" width="96" height="96"
          src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(url)}">
      </div>
      <button class="btn btn-secondary" data-copy="${encodeURIComponent(url)}">Copiar link</button>
    </article>`;
  }).join("");

  conteudo.innerHTML = `
    <button id="nova-mesa" class="btn btn-primary">Nova mesa</button>
    <section class="table-grid section">${cards || '<p class="muted">Nenhuma mesa cadastrada.</p>'}</section>`;

  $("#nova-mesa").onclick = () => {
    abrirModal(`<button data-close class="btn btn-secondary">Fechar</button>
      <h2>Nova mesa</h2>
      <form id="fm" class="form-grid">
        <label>Número<input id="mn" type="number" min="1" required></label>
        <button class="btn btn-primary">Criar mesa e QR</button>
      </form>`);

    $("#fm").onsubmit = async (evento) => {
      evento.preventDefault();
      const botao = evento.submitter;
      botao.disabled = true;
      try {
        const token = crypto.randomUUID().replaceAll("-", "").slice(0, 20);
        await setDoc(doc(db, "mesas", token), {
          numero: Number($("#mn").value),
          ativa: true,
          criadaEm: serverTimestamp()
        });
        fecharModal();
        await qrcodes();
      } catch (erro) {
        console.error(erro);
        alert("Não foi possível criar a mesa.");
        botao.disabled = false;
      }
    };
  };

  conteudo.onclick = (evento) => {
    const botao = evento.target.closest("[data-copy]");
    if (!botao) return;
    navigator.clipboard.writeText(decodeURIComponent(botao.dataset.copy));
    botao.textContent = "Link copiado";
    setTimeout(() => { botao.textContent = "Copiar link"; }, 1400);
  };
}
async function usuarios(){
  const snap=await getDocs(collection(db,"usuarios"));
  conteudo.innerHTML=`<div class="notice">Para criar o primeiro administrador, siga o arquivo docs/CONFIGURAR_FIREBASE.md. A criação de novos logins pelo painel exige uma segunda instância do Firebase Auth; nesta versão, cadastre o login no Console e depois crie o perfil aqui.</div>
  <button id="novo-user" class="btn btn-primary section">Cadastrar perfil de usuário</button><section class="table-grid section">${snap.docs.map(d=>{const u=d.data();return `<article class="table-row card"><div><strong>${escapar(u.nome)}</strong><br><small>${escapar(u.email||d.id)}</small></div><div>${u.perfil}</div><div>${u.ativo?"Ativo":"Inativo"}</div><span></span></article>`}).join("")}</section>`;
  $("#novo-user").onclick=()=>abrirModal(`<button data-close class="btn btn-secondary">Fechar</button><h2>Cadastrar perfil</h2><p class="muted">Informe o UID copiado do Firebase Authentication.</p><form id="fu" class="form-grid"><label>UID<input id="uid" required></label><label>Nome<input id="un" required></label><label>E-mail<input id="ue" type="email"></label><label>Perfil<select id="up"><option value="atendimento">Atendimento</option><option value="caixa">Caixa</option><option value="administrador">Administrador</option></select></label><button class="btn btn-primary">Salvar</button></form>`);
  modalBody.addEventListener("submit",async e=>{if(e.target.id!=="fu")return;e.preventDefault();await setDoc(doc(db,"usuarios",$("#uid").value.trim()),{nome:limparTexto($("#un").value,60),email:$("#ue").value.trim(),perfil:$("#up").value,ativo:true});fecharModal();usuarios()},{once:true});
}
async function configuracoes(){
  const snap=await getDoc(doc(db,"configuracoes","publico"));const c=snap.exists()?snap.data():{};
  conteudo.innerHTML=`<section class="section-card card"><form id="cfg" class="form-grid"><label>Nome da loja<input id="loja" value="${escapar(c.nomeLoja||"Miranda Empório de Bebidas")}"></label><label>WhatsApp<input id="zap" value="${escapar(c.whatsapp||"")}"></label><label>Mensagem do topo<textarea id="msg">${escapar(c.mensagem||"")}</textarea></label><button class="btn btn-primary">Salvar configurações</button></form></section>`;
  $("#cfg").onsubmit=async e=>{e.preventDefault();await setDoc(doc(db,"configuracoes","publico"),{nomeLoja:limparTexto($("#loja").value,80),whatsapp:limparTexto($("#zap").value,20),mensagem:limparTexto($("#msg").value,240)},{merge:true});alert("Configurações salvas.")};
}
