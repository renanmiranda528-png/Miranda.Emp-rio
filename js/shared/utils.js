export const dinheiro = (valor = 0) =>
  Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const dataHora = (valor) => {
  let data;
  if (valor?.toDate) data = valor.toDate();
  else if (valor instanceof Date) data = valor;
  else if (valor) data = new Date(valor);
  else data = new Date();
  if (Number.isNaN(data.getTime())) data = new Date();
  return {
    data: data.toLocaleDateString("pt-BR"),
    hora: data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  };
};

export const gerarId = (prefixo = "id") =>
  `${prefixo}_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;

export const limparTexto = (texto, limite = 120) =>
  String(texto || "").trim().replace(/\s+/g, " ").slice(0, limite);

export const escapar = (texto = "") =>
  String(texto).replace(/[&<>"']/g, (caractere) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[caractere]));

export const slugify = (text = "") => String(text)
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const debounce = (fn, wait = 250) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
};
