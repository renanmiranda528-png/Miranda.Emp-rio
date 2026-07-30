export const dinheiro = (valor = 0) =>
  Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const dataHora = (valor) => {
  const data = valor?.toDate ? valor.toDate() : new Date(valor || Date.now());
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

export const hojeInicio = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
