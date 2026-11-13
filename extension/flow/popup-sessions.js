/* Contas do ClipGringa no painel do ícone: salvar, trocar e entrar com outra conta. */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  function send(msg) {
    return new Promise(function (res) {
      chrome.runtime.sendMessage(msg, function (r) { void chrome.runtime.lastError; res(r || { ok: false, error: "Sem resposta da extensão." }); });
    });
  }
  function err(t) { $("s-msg").textContent = t || ""; }

  function render() {
    send({ type: "clipgringa-session-list" }).then(function (res) {
      var list = $("s-list");
      list.textContent = "";
      var names = (res && res.sessions) || [];
      if (!names.length) {
        var e = document.createElement("li");
        e.className = "s-empty";
        e.textContent = "Nenhuma conta salva. Entre no ClipGringa e salve abaixo.";
        list.appendChild(e);
        return;
      }
      names.forEach(function (name) {
        var li = document.createElement("li");
        var on = name === res.active;
        if (on) li.className = "on";
        var n = document.createElement("span");
        n.className = "s-name"; n.textContent = name; li.appendChild(n);
        if (on) {
          var now = document.createElement("span"); now.className = "s-now"; now.textContent = "Em uso"; li.appendChild(now);
        } else {
          var use = document.createElement("button"); use.textContent = "Usar";
          use.onclick = function () {
            err("");
            send({ type: "clipgringa-session-switch", name: name }).then(function (r) { if (!r.ok) return err(r.error); window.close(); });
          };
          li.appendChild(use);
        }
        var del = document.createElement("button");
        del.className = "s-del"; del.textContent = "Remover"; del.setAttribute("aria-label", "Remover " + name);
        del.onclick = function () {
          if (!confirm("Tirar " + name + " da lista? A conta no ClipGringa continua existindo.")) return;
          send({ type: "clipgringa-session-delete", name: name }).then(render);
        };
        li.appendChild(del);
        list.appendChild(li);
      });
    });
  }

  $("s-save").onclick = function () {
    err("");
    send({ type: "clipgringa-session-save", name: $("s-name").value }).then(function (r) {
      if (!r.ok) return err(r.error);
      $("s-name").value = ""; render();
    });
  };
  $("s-name").addEventListener("keydown", function (e) { if (e.key === "Enter") $("s-save").click(); });
  $("s-new").onclick = function () {
    err("");
    send({ type: "clipgringa-session-new" }).then(function (r) { if (!r.ok) return err(r.error); window.close(); });
  };
  render();
})();
