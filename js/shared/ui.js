const ensureToastContainer = () => {
  let container = document.querySelector("#toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.className = "toast-container";
    container.setAttribute("aria-live", "polite");
    document.body.appendChild(container);
  }
  return container;
};

export function toast(message, type = "success", title = "") {
  const container = ensureToastContainer();
  const icons = { success: "✓", error: "!", warning: "⚠", info: "i" };
  const titles = { success: "Tudo certo", error: "Algo deu errado", warning: "Atenção", info: "Informação" };
  const element = document.createElement("div");
  element.className = `toast ${type}`;
  element.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <div><div class="toast-title">${escapeHtml(title || titles[type] || titles.info)}</div><div class="toast-message">${escapeHtml(message)}</div></div>
    <button class="toast-close" type="button" aria-label="Fechar">×</button>`;
  container.appendChild(element);
  const remove = () => {
    if (!element.isConnected) return;
    element.classList.add("leaving");
    setTimeout(() => element.remove(), 220);
  };
  element.querySelector(".toast-close").addEventListener("click", remove);
  setTimeout(remove, type === "error" ? 6500 : 4200);
  return element;
}

export function confirmar({
  titulo = "Confirmar ação",
  mensagem = "Deseja continuar?",
  confirmarTexto = "Confirmar",
  cancelarTexto = "Cancelar",
  perigo = false
} = {}) {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <section class="modal card" style="width:min(480px,100%)">
        <p class="eyebrow">Confirmação</p>
        <h2>${escapeHtml(titulo)}</h2>
        <p class="muted" style="line-height:1.55">${escapeHtml(mensagem)}</p>
        <div class="modal-actions">
          <button data-cancelar class="btn btn-secondary" type="button">${escapeHtml(cancelarTexto)}</button>
          <button data-confirmar class="btn ${perigo ? "btn-danger" : "btn-primary"}" type="button">${escapeHtml(confirmarTexto)}</button>
        </div>
      </section>`;
    document.body.appendChild(backdrop);
    let finished = false;
    const onKey = (event) => {
      if (event.key === "Escape") finish(false);
    };
    const finish = (value) => {
      if (finished) return;
      finished = true;
      document.removeEventListener("keydown", onKey);
      backdrop.remove();
      resolve(value);
    };
    backdrop.querySelector("[data-cancelar]").addEventListener("click", () => finish(false));
    backdrop.querySelector("[data-confirmar]").addEventListener("click", () => finish(true));
    backdrop.addEventListener("click", (event) => { if (event.target === backdrop) finish(false); });
    document.addEventListener("keydown", onKey);
  });
}

export function setButtonLoading(button, loading, label = "Aguarde...") {
  if (!button) return;
  if (loading) {
    button.dataset.originalText = button.textContent;
    button.classList.add("is-loading");
    button.disabled = true;
    button.setAttribute("aria-label", label);
  } else {
    button.classList.remove("is-loading");
    button.disabled = false;
    button.removeAttribute("aria-label");
    if (button.dataset.originalText) button.textContent = button.dataset.originalText;
  }
}

export function showLoading(message = "Carregando...") {
  let overlay = document.querySelector("#global-loading");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "global-loading";
    overlay.className = "loading-overlay";
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `<div class="loading-box"><div class="spinner"></div><span>${escapeHtml(message)}</span></div>`;
  overlay.classList.remove("hidden");
}

export function hideLoading() {
  document.querySelector("#global-loading")?.classList.add("hidden");
}

export function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));
}

export function formatFirebaseError(error) {
  const code = error?.code || "";
  const known = {
    "permission-denied": "Você não tem permissão para realizar esta ação.",
    "unavailable": "O Firebase está temporariamente indisponível. Verifique a internet.",
    "failed-precondition": "Falta uma configuração ou índice no Firebase.",
    "auth/invalid-credential": "E-mail ou senha inválidos.",
    "auth/network-request-failed": "Não foi possível conectar ao Firebase.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde um pouco e tente novamente."
  };
  return known[code] || error?.message || "Ocorreu um erro inesperado.";
}
