export const firebaseConfig = {
  apiKey: "AIzaSyCKKkiAN8cV_VeWrDl4ja4FB6XcH-Xiqm8",
  authDomain: "emporio-aff6d.firebaseapp.com",
  projectId: "emporio-aff6d",
  storageBucket: "emporio-aff6d.firebasestorage.app",
  messagingSenderId: "437784709468",
  appId: "1:437784709468:web:bd4c0e7438a21c5f5cd999"
};

export const firebaseConfigurado = Object.values(firebaseConfig).every(
  (valor) => Boolean(valor) && !String(valor).includes("PREENCHER")
);
