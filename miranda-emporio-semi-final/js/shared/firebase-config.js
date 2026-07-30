export const firebaseConfig = {
  apiKey: "PREENCHER",
  authDomain: "PREENCHER.firebaseapp.com",
  projectId: "PREENCHER",
  storageBucket: "PREENCHER.firebasestorage.app",
  messagingSenderId: "PREENCHER",
  appId: "PREENCHER"
};

export const firebaseConfigurado = !Object.values(firebaseConfig).some(
  (valor) => String(valor).includes("PREENCHER")
);
