import { auth, db, firebaseConfigurado } from "../shared/firebase.js?v=8";
import { toast, setButtonLoading, formatFirebaseError } from "../shared/ui.js?v=8";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const form = document.querySelector("#login-form");
const errorBox = document.querySelector("#erro");
const setupAlert = document.querySelector("#setup-alert");
const allowedProfiles = new Set(["administrador", "caixa", "atendimento"]);

if (!firebaseConfigurado) {
  setupAlert.classList.remove("hidden");
  setupAlert.textContent = "O Firebase ainda não está configurado.";
  form.querySelector("button").disabled = true;
}

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  try {
    const profileSnapshot = await getDoc(doc(db, "usuarios", user.uid));
    const profile = profileSnapshot.exists() ? profileSnapshot.data() : null;
    if (profile?.ativo === true && allowedProfiles.has(profile.perfil)) {
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
  setButtonLoading(button, true, "Entrando");

  try {
    const credential = await signInWithEmailAndPassword(
      auth,
      document.querySelector("#email").value.trim(),
      document.querySelector("#senha").value
    );

    const profileSnapshot = await getDoc(doc(db, "usuarios", credential.user.uid));
    const profile = profileSnapshot.exists() ? profileSnapshot.data() : null;

    if (profile?.ativo !== true || !allowedProfiles.has(profile.perfil)) {
      await signOut(auth);
      throw new Error("SEM_PERMISSAO");
    }

    toast("Acesso autorizado.", "success");
    location.replace("./index.html");
  } catch (error) {
    console.error(error);
    errorBox.textContent = error.message === "SEM_PERMISSAO"
      ? "Este usuário não possui permissão de atendimento."
      : formatFirebaseError(error);
    setButtonLoading(button, false);
  }
});
