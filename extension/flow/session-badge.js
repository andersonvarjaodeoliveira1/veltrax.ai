// Selo "ClipGringa: <conta>" no canto superior direito do ClipGringa, quando há uma conta salva em uso.
// Atualiza na hora quando o background avisa que a conta mudou (salvar, trocar, remover, entrar com outra).
// Só mostra o selo: não mexe na página nem na ponte (site.js).
(() => {
  if (window.__clipgringaSessionBadge) return; // já injetado (reinstalação sem F5)
  window.__clipgringaSessionBadge = true;

  const ID = "clipgringa-session-badge";

  function render(active) {
    let tag = document.getElementById(ID);
    if (!active) { if (tag) tag.remove(); return; }
    if (!tag) {
      tag = document.createElement("div");
      tag.id = ID;
      tag.title = "Conta salva em uso. Clique para esconder até recarregar.";
      Object.assign(tag.style, {
        position: "fixed", top: "64px", right: "16px", zIndex: "2147483647", // abaixo da barra de cima (56 px)
        maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        padding: "6px 10px", borderRadius: "6px", background: "#232325", color: "#EDEDED",
        boxShadow: "0 0 0 1px rgba(237,237,237,.14)",
        font: "500 12.5px/1.2 'Google Sans Flex', system-ui, sans-serif", cursor: "pointer", userSelect: "none"
      });
      tag.addEventListener("click", () => { tag.style.display = "none"; });
      document.documentElement.appendChild(tag);
    }
    tag.textContent = "ClipGringa: " + active;
    tag.style.display = "";
  }

  // Estado ao abrir a página.
  try {
    chrome.runtime.sendMessage({ type: "clipgringa-session-active" }, (res) => {
      void chrome.runtime.lastError;
      render(res && res.ok ? res.active : null);
    });
  } catch (_e) { /* extensão recarregada */ }

  // Aviso do background quando a conta muda.
  try {
    chrome.runtime.onMessage.addListener((msg, sender) => {
      if (sender.id !== chrome.runtime.id || !msg || msg.type !== "clipgringa-session-changed") return false;
      render(msg.active || null);
      return false;
    });
  } catch (_e) { /* extensão recarregada */ }
})();
