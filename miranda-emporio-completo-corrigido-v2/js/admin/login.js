import { auth, db, firebaseConfigurado } from "../shared/firebase.js";
import { signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const alertBox=document.querySelector("#setup-alert");
if(!firebaseConfigurado){
  alertBox.classList.remove("hidden");
  alertBox.textContent="Configure o Firebase em js/shared/firebase-config.js antes de usar o login.";
  document.querySelector("#login-form").querySelector("button").disabled=true;
}
document.querySelector("#login-form").addEventListener("submit",async e=>{
  e.preventDefault(); const erro=document.querySelector("#erro"); erro.textContent="";
  const btn=e.submitter;btn.disabled=true;
  try{
    const cred=await signInWithEmailAndPassword(auth,document.querySelector("#email").value.trim(),document.querySelector("#senha").value);
    const perfil=await getDoc(doc(db,"usuarios",cred.user.uid));
    if(!perfil.exists()||!perfil.data().ativo){await signOut(auth);throw new Error("SEM_PERMISSAO")}
    location.href="./index.html";
  }catch(err){
    console.error(err);erro.textContent=err.message==="SEM_PERMISSAO"?"Usuário sem permissão administrativa.":"E-mail ou senha inválidos.";
  }finally{btn.disabled=false}
});
