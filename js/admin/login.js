import { auth, db, firebaseConfigurado } from "../shared/firebase.js?v=6";
import { toast, setButtonLoading, formatFirebaseError } from "../shared/ui.js?v=6";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const form = document.querySelector("#login-form");
const errorBox = document.querySelector("#erro");
const setupAlert = document.querySelector("#setup-alert");

if (!firebaseConfigurado) {
  setupAlert.classList.remove("hidden");
  setupAlert.textContent = "Configure o Firebase em js/shared/firebase-config.js antes de usar o login.";
  form.querySelector("button").disabled = true;
}

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  try {
    const profile = await getDoc(doc(db, "usuarios", user.uid));
    if (profile.exists() && profile.data().ativo === true) {
      location.replace("./index.html");
    }
  } catch (error) {
    console.error(error);
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorBox.textContent = "";
  const button = event.submitter;
  setButtonLoading(button, true, "Entrando na Central");

  try {
    const credential = await signInWithEmailAndPassword(
      auth,
      document.querySelector("#email").value.trim(),
      document.querySelector("#senha").value
    );
    const profile = await getDoc(doc(db, "usuarios", credential.user.uid));
    if (!profile.exists() || profile.data().ativo !== true) {
      await signOut(auth);
      throw new Error("SEM_PERMISSAO");
    }
    toast("Acesso autorizado. Abrindo a Central...", "success");
    location.replace("./index.html");
  } catch (error) {
    console.error(error);
    errorBox.textContent = error.message === "SEM_PERMISSAO"
      ? "Este login não possui um perfil administrativo ativo."
      : formatFirebaseError(error);
    setButtonLoading(button, false);
  }
});
