import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

import { firebaseConfig, firebaseConfigurado } from "./firebase-config.js?v=6";

if (!firebaseConfigurado) {
  throw new Error("Firebase não configurado em js/shared/firebase-config.js.");
}

// Instância separada para o cliente.
// Isso impede que o login anônimo do QR Code encerre o login do administrador
// quando os dois forem testados no mesmo navegador.
const clientApp = initializeApp(firebaseConfig, "miranda-cliente");
const auth = getAuth(clientApp);
const db = getFirestore(clientApp);

await setPersistence(auth, browserLocalPersistence);

export { clientApp, auth, db, firebaseConfigurado };
