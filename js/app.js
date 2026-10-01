const App = (() => {
  const content = () => document.getElementById("app-content");
  const state = { filtro: "vivo", busqueda: "", vista: "cuadricula" };
  let camadaFilas = [];
  let fotoPendiente = null;
  let importPendiente = null;
  let pickerRegistry = {};
  let activePickerTarget = null;

  // ---------- Helpers ----------

  function toast(msg) {
    let t = document.getElementById("toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "toast";
      t.className = "toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  function esc(str) {
    if (str === undefined || str === null) return "";
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function initials(nombre, placa) {
    const src = (nombre || placa || "?").trim();
    const parts = src.split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return src.slice(0, 2).toUpperCase();
  }

  function formatFechaCorta(iso) {
    if (!iso) return "";
    const d = new Date(iso + "T00:00:00");
    if (isNaN(d)) return iso;
    return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
  }

  // Fechas en hora LOCAL. toISOString() da la fecha en UTC: en Perú, desde
  // las 19:00 ya es "mañana" y las fotos y pendientes salían con un día de más.
  function ymdLocal(d) {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function hoyLocal() {
    return ymdLocal(new Date());
  }

  // fechaCaptura puede venir como "2026-09-20T12:00:00" (hora local, galería)
  // o como ISO en UTC con "Z" (cámara, versiones anteriores): ambas se leen bien.
  function fechaDeFoto(iso) {
    const d = new Date(iso);
    return isNaN(d) ? String(iso || "").slice(0, 10) : ymdLocal(d);
  }

  function diasHasta(ymd) {
    const objetivo = new Date(ymd + "T00:00:00");
    const hoy = new Date(hoyLocal() + "T00:00:00");
    return Math.round((objetivo - hoy) / 86400000);
  }

  function calcEdadTexto(nacISO, capISO) {
    if (!nacISO) return null;
    const nac = new Date(nacISO + "T00:00:00");
    const cap = new Date(capISO);
    if (isNaN(nac) || isNaN(cap)) return null;
    let days = Math.round((cap - nac) / 86400000);
    if (days < 0) days = 0;
    if (days <= 3) return "Recién nacido";
    if (days < 14) return days + " días";
    if (days < 60) {
      const weeks = Math.round(days / 7);
      return weeks + (weeks === 1 ? " semana" : " semanas");
    }
    if (days < 365) {
      const months = Math.round(days / 30.44);
      return months + (months === 1 ? " mes" : " meses");
    }
    const years = Math.floor(days / 365.25);
    const remDays = days - years * 365.25;
    const months = Math.round(remDays / 30.44);
    if (months <= 0) return years + (years === 1 ? " año" : " años");
    return years + (years === 1 ? " año " : " años ") + months + (months === 1 ? " mes" : " meses");
  }

  function estadoLabel(estado) {
    return { vivo: "Vivo", vendido: "Vendido", fallecido: "Fallecido", otro: "Otro" }[estado] || "Vivo";
  }

  function fotoMasReciente(ejemplar) {
    const fotos = (ejemplar && ejemplar.fotos) || [];
    if (!fotos.length) return null;
    return fotos.slice().sort((a, b) => new Date(b.fechaCaptura) - new Date(a.fechaCaptura))[0].dataUrl;
  }

  function miniAvatarHtml(ejemplar, sizeClass) {
    const foto = fotoMasReciente(ejemplar);
    const cls = sizeClass || "";
    if (foto) return `<img class="mini-avatar ${cls}" src="${foto}" alt="">`;
    return `<div class="mini-avatar mini-avatar-fallback ${cls}">${initials(ejemplar.nombre, ejemplar.placa)}</div>`;
  }

  function reproductorLabel(ejemplar) {
    if (!ejemplar || !ejemplar.reproductor) return null;
    if (ejemplar.sexo === "M") return "Padrillo";
    if (ejemplar.sexo === "H") return "Madrilla";
    return null;
  }

  function navigate(hash) {
    window.location.hash = hash;
  }

  const TEMAS = {
    calido: { nombre: "Cálido", themeColor: "#2B1A10" },
    claro: { nombre: "Claro", themeColor: "#E9603F" },
    oscuro: { nombre: "Oscuro", themeColor: "#1C1712" },
  };

  function temaActual() {
    let t;
    try { t = localStorage.getItem("gallosTorresTheme"); } catch (e) { t = null; }
    return TEMAS[t] ? t : "claro";
  }

  function setTheme(nombre) {
    if (!TEMAS[nombre]) return;
    try { localStorage.setItem("gallosTorresTheme", nombre); } catch (e) {}
    document.documentElement.dataset.theme = nombre;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", TEMAS[nombre].themeColor);
    if ((window.location.hash || "").startsWith("#/ajustes")) renderAjustes();
  }

  function compressImage(file, maxWidth = 900, quality = 0.72) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          canvas.getContext("2d").drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ---------- Modal ----------

  function openModal(html) {
    let backdrop = document.getElementById("modal-backdrop");
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.id = "modal-backdrop";
      backdrop.className = "modal-backdrop";
      document.body.appendChild(backdrop);
    }
    backdrop.innerHTML = `<div id="modal-box" class="modal-box">${html}</div>`;
    backdrop.classList.add("open");
    backdrop.onclick = (e) => { if (e.target === backdrop) closeModal(); };
  }

  function closeModal() {
    const backdrop = document.getElementById("modal-backdrop");
    if (backdrop) backdrop.classList.remove("open");
    fotoPendiente = null;
    activePickerTarget = null;
    importPendiente = null;
  }

  // ---------- Selector modal (padre / madre / ejemplar relacionado) ----------

  function pickerFieldHtml(hiddenId, candidatoActual, placeholder) {
    const label = candidatoActual ? `${esc(candidatoActual.nombre || "Sin nombre")} · #${esc(candidatoActual.placa)}` : placeholder;
    const avatar = candidatoActual ? miniAvatarHtml(candidatoActual) : `<div class="mini-avatar mini-avatar-empty"></div>`;
    return `
      <input type="hidden" id="${hiddenId}" value="${candidatoActual ? candidatoActual.id : ""}">
      <button type="button" class="picker-trigger" data-action="abrir-picker" data-target="${hiddenId}">
        <span class="picker-avatar" id="${hiddenId}-avatar">${avatar}</span>
        <span class="picker-label" id="${hiddenId}-label">${label}</span>
        <span class="arrow">›</span>
      </button>`;
  }

  function registrarPicker(hiddenId, candidatos, opts = {}) {
    pickerRegistry[hiddenId] = {
      candidatos,
      allowNone: opts.allowNone !== false,
      placeholder: opts.placeholder || "— Ninguno —",
      titulo: opts.titulo || "Elegir",
    };
  }

  function abrirPicker(hiddenId) {
    const reg = pickerRegistry[hiddenId];
    if (!reg) return;
    activePickerTarget = hiddenId;
    openModal(`
      <p class="section-label">${esc(reg.titulo)}</p>
      <input class="search-input" id="picker-search" placeholder="Buscar por nombre, placa o color de placa">
      <div class="picker-list" id="picker-results"></div>
    `);
    renderPickerResults("");
    const input = document.getElementById("picker-search");
    input.addEventListener("input", (ev) => renderPickerResults(ev.target.value));
    input.focus();
  }

  function renderPickerResults(query) {
    const reg = pickerRegistry[activePickerTarget];
    const results = document.getElementById("picker-results");
    if (!reg || !results) return;
    const q = query.trim().toLowerCase();
    const filtered = (!q ? reg.candidatos.slice() : reg.candidatos.filter((c) =>
      (c.nombre || "").toLowerCase().includes(q) ||
      (c.placa || "").toLowerCase().includes(q) ||
      (c.colorPlaca || "").toLowerCase().includes(q)
    ));
    filtered.sort((a, b) => {
      const ra = a.reproductor ? 0 : 1;
      const rb = b.reproductor ? 0 : 1;
      if (ra !== rb) return ra - rb;
      return (a.placa || "").localeCompare(b.placa || "");
    });
    const noneItem = reg.allowNone
      ? `<button type="button" class="picker-item" data-action="elegir-picker" data-target="${activePickerTarget}" data-id="">
          <span class="mini-avatar mini-avatar-empty"></span>
          <span>${esc(reg.placeholder)}</span>
        </button>` : "";
    const itemsHtml = filtered.map((c) => {
      const repro = reproductorLabel(c);
      const detalle = repro
        ? `<span class="picker-tag">${repro}</span>`
        : (c.colorPlaca ? `<span class="picker-sub">(placa ${esc(c.colorPlaca)})</span>` : "");
      return `
      <button type="button" class="picker-item ${repro ? "picker-item-repro" : ""}" data-action="elegir-picker" data-target="${activePickerTarget}" data-id="${c.id}">
        ${miniAvatarHtml(c)}
        <span>${esc(c.nombre || "Sin nombre")} · #${esc(c.placa)} ${detalle}</span>
      </button>`;
    }).join("");
    results.innerHTML = noneItem + (itemsHtml || (reg.allowNone ? "" : `<p class="hint">Sin resultados</p>`));
  }

  function elegirPicker(hiddenId, id) {
    const reg = pickerRegistry[hiddenId];
    if (!reg) return;
    const cand = id ? reg.candidatos.find((c) => c.id === id) : null;
    document.getElementById(hiddenId).value = cand ? cand.id : "";
    document.getElementById(`${hiddenId}-label`).textContent = cand ? `${cand.nombre || "Sin nombre"} · #${cand.placa}` : reg.placeholder;
    document.getElementById(`${hiddenId}-avatar`).innerHTML = cand ? miniAvatarHtml(cand) : `<div class="mini-avatar mini-avatar-empty"></div>`;
    closeModal();
  }

  // ---------- Render: shell ----------

  function renderShell(innerHtml, opts = {}) {
    const { title, showBack, backHref, activeNav, bodyClass } = opts;
    document.getElementById("topbar-title").textContent = title || "Criaderos Hermanos Torres";
    const backBtn = document.getElementById("back-btn");
    backBtn.style.visibility = showBack ? "visible" : "hidden";
    backBtn.onclick = () => navigate(backHref || "#/inicio");
    content().innerHTML = innerHtml;
    document.body.className = bodyClass || "bg-inicio";
    document.querySelectorAll(".bottom-nav button").forEach((b) => {
      b.classList.toggle("active", b.dataset.nav === activeNav);
    });
  }

  // ---------- Screen: Inicio ----------

  function filtrarListaInicio(all) {
    let list = all;
    if (state.filtro !== "todos") list = list.filter((e) => (e.estado || "vivo") === state.filtro);
    if (state.busqueda.trim()) {
      const q = state.busqueda.trim().toLowerCase();
      list = list.filter((e) =>
        (e.placa || "").toLowerCase().includes(q) ||
        (e.nombre || "").toLowerCase().includes(q) ||
        (e.color || "").toLowerCase().includes(q) ||
        (e.colorPlaca || "").toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => (a.placa || "").localeCompare(b.placa || ""));
    return list;
  }

  function listItemHtml(e) {
    const estado = e.estado || "vivo";
    const dimmed = estado === "fallecido" || estado === "vendido";
    const foto = fotoMasReciente(e);
    const avatarHtml = foto
      ? `<img class="avatar avatar-photo" src="${foto}" alt="">`
      : `<div class="avatar ${estado === "fallecido" ? "fallecido" : ""}">${initials(e.nombre, e.placa)}</div>`;
    return `
      <div class="list-item ${dimmed ? "dimmed" : ""}" data-action="ficha" data-id="${e.id}">
        ${avatarHtml}
        <div class="info">
          <p class="name">${esc(e.nombre || "Sin nombre")} · #${esc(e.placa)}${reproductorLabel(e) ? ` <span class="repro-badge">${reproductorLabel(e)}</span>` : ""}</p>
          <p class="meta">${esc(e.color || "Color sin registrar")}${e.sexo ? " · " + (e.sexo === "M" ? "macho" : "hembra") : ""}</p>
        </div>
        <span class="badge-estado badge-${estado}">${estadoLabel(estado)}</span>
      </div>`;
  }

  function gridCardHtml(e) {
    const estado = e.estado || "vivo";
    const dimmed = estado === "fallecido" || estado === "vendido";
    const foto = fotoMasReciente(e);
    const fotoHtml = foto
      ? `<img src="${foto}" alt="">`
      : `<div class="grid-photo-fallback">${initials(e.nombre, e.placa)}</div>`;
    return `
      <div class="grid-card ${dimmed ? "dimmed" : ""}" data-action="ficha" data-id="${e.id}">
        <div class="grid-photo">${fotoHtml}<span class="badge-estado badge-${estado} grid-badge">${estadoLabel(estado)}</span>${reproductorLabel(e) ? `<span class="repro-badge grid-repro">${reproductorLabel(e)}</span>` : ""}</div>
        <p class="name">${esc(e.nombre || "Sin nombre")} · #${esc(e.placa)}</p>
        <p class="meta">${esc(e.colorPlaca ? "Placa " + e.colorPlaca : (e.color || "Sin color registrado"))}</p>
      </div>`;
  }

  function renderListaResultados(list, all) {
    const cont = document.getElementById("lista-resultados");
    if (!cont) return;
    if (!list.length) {
      cont.className = "";
      const iconoVacio = `<img class="empty-illustration" src="icons/vacio.png" alt="" onerror="this.style.display='none'">`;
      cont.innerHTML = `<div class="empty-state">${iconoVacio}<h2>${all.length === 0 ? "Aún no hay ejemplares" : "Nada por aquí"}</h2><p>${all.length === 0 ? "Registra tu primer gallo o gallina para empezar." : "Prueba otro filtro o búsqueda."}</p></div>`;
      return;
    }
    if (state.vista === "cuadricula") {
      cont.className = "grid-cards";
      cont.innerHTML = list.map(gridCardHtml).join("");
    } else {
      cont.className = "";
      cont.innerHTML = list.map(listItemHtml).join("");
    }
  }

  async function renderInicio() {
    const all = await DB.getAllEjemplares();
    const list = filtrarListaInicio(all);

    const vivos = all.filter((e) => (e.estado || "vivo") === "vivo").length;
    const machos = all.filter((e) => (e.estado || "vivo") === "vivo" && e.sexo === "M").length;
    const hembras = all.filter((e) => (e.estado || "vivo") === "vivo" && e.sexo === "H").length;

    renderShell(`
      <div class="screen">
        <h2 class="sr-only">Lista de ejemplares del criadero</h2>
        <div class="stats-row">
          <div class="stat-card stat-vivos">
            <span class="stat-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 8.6a5.5 5.5 0 0 0-9.3-3 5.5 5.5 0 1 0-8 7.6l7.2 7.4a1.1 1.1 0 0 0 1.6 0l7.2-7.4a5.5 5.5 0 0 0 1.3-4.6z"/></svg></span>
            <div class="value">${vivos}</div><div class="label">Vivos</div>
          </div>
          <div class="stat-card stat-machos">
            <span class="stat-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="14" r="5.5"/><path d="M15 9l5-5m0 0h-4m4 0v4"/></svg></span>
            <div class="value">${machos}</div><div class="label">Machos</div>
          </div>
          <div class="stat-card stat-hembras">
            <span class="stat-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="9" r="5.5"/><path d="M12 14.5V22m-3.5-3h7"/></svg></span>
            <div class="value">${hembras}</div><div class="label">Hembras</div>
          </div>
        </div>
        <div class="search-row">
          <input id="search-input" class="search-input" placeholder="Buscar por placa, nombre o color" value="${esc(state.busqueda)}">
          <div class="view-toggle" role="group" aria-label="Cambiar vista">
            <button class="${state.vista === "lista" ? "active" : ""}" data-action="vista" data-vista="lista" aria-label="Vista de lista">☰</button>
            <button class="${state.vista === "cuadricula" ? "active" : ""}" data-action="vista" data-vista="cuadricula" aria-label="Vista de cuadrícula">⊞</button>
          </div>
        </div>
        <div class="filter-chips">
          <span class="chip ${state.filtro === "todos" ? "active" : ""}" data-action="filtro" data-filter="todos">Todos</span>
          <span class="chip ${state.filtro === "vivo" ? "active" : ""}" data-action="filtro" data-filter="vivo">Vivos</span>
          <span class="chip ${state.filtro === "vendido" ? "active" : ""}" data-action="filtro" data-filter="vendido">Vendidos</span>
          <span class="chip ${state.filtro === "fallecido" ? "active" : ""}" data-action="filtro" data-filter="fallecido">Fallecidos</span>
        </div>
        <div id="lista-resultados"></div>
      </div>
      <button class="fab" data-action="nuevo" aria-label="Nuevo ejemplar">+</button>
    `, { title: "Criaderos Hermanos Torres", showBack: false, activeNav: "inicio", bodyClass: "bg-inicio" });

    renderListaResultados(list, all);

    document.getElementById("search-input").addEventListener("input", async (ev) => {
      state.busqueda = ev.target.value;
      const freshAll = await DB.getAllEjemplares();
      renderListaResultados(filtrarListaInicio(freshAll), freshAll);
    });
  }

  // ---------- Screen: Ficha ----------

  async function renderFicha(id) {
    const e = await DB.getEjemplar(id);
    if (!e) { navigate("#/inicio"); return; }
    const padre = e.padreId ? await DB.getEjemplar(e.padreId) : null;
    const madre = e.madreId ? await DB.getEjemplar(e.madreId) : null;
    const hijos = await DB.getHijos(id);
    const fotos = (e.fotos || []).slice().sort((a, b) => new Date(a.fechaCaptura) - new Date(b.fechaCaptura));

    const photoGrid = `
      <div class="photo-grid">
        ${fotos.slice(0, 3).map((f) => `<div class="photo-thumb" data-action="editar-foto" data-id="${e.id}" data-foto-id="${f.id}"><img src="${f.dataUrl}" alt=""></div>`).join("")}
        <button class="photo-add" data-action="agregar-foto-menu" data-id="${e.id}" aria-label="Agregar foto">+</button>
      </div>`;

    const timelineHtml = fotos.length
      ? fotos.map((f) => {
          const edad = calcEdadTexto(e.fechaNacimiento, f.fechaCaptura);
          return `
          <div class="timeline-item" data-action="editar-foto" data-id="${e.id}" data-foto-id="${f.id}">
            <img class="timeline-thumb" src="${f.dataUrl}" alt="">
            <div>
              <p class="timeline-age">${edad || "Foto"}</p>
              <p class="timeline-date">${formatFechaCorta(fechaDeFoto(f.fechaCaptura))}</p>
            </div>
            <span class="edit-hint">✎</span>
          </div>`;
        }).join("")
      : `<p style="font-size:13px;color:var(--ink-600);margin:0;">Aún no hay fotos.</p>`;

    const sinFechaAviso = !e.fechaNacimiento && fotos.length
      ? `<p class="hint" style="margin-top:8px;">Agrega la fecha de nacimiento para calcular la edad en cada foto.</p>` : "";

    const estado = e.estado || "vivo";
    const heroFoto = fotoMasReciente(e);
    const heroHtml = heroFoto
      ? `<img src="${heroFoto}" alt="">`
      : `<div class="ficha-hero-fallback">${initials(e.nombre, e.placa)}</div>`;

    const edadActual = e.fechaNacimiento ? calcEdadTexto(e.fechaNacimiento, new Date().toISOString()) : null;
    const sexoTexto = e.sexo === "M" ? "Macho" : e.sexo === "H" ? "Hembra" : "Sin especificar";
    const icoCal = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="3"/><path d="M3 9h18M8 2.5v4M16 2.5v4"/></svg>`;
    const icoSexo = e.sexo === "H"
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="9" r="5"/><path d="M12 14v7m-3.5-3.5h7"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="14" r="5"/><path d="M15 9l5-5m0 0h-4m4 0v4"/></svg>`;
    const icoPlaca = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2a2 2 0 0 1-.6-1.4V5a2 2 0 0 1 2-2h6.9a2 2 0 0 1 1.5.6l7.4 7.4a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.3" fill="currentColor" stroke="none"/></svg>`;
    const icoPluma = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 4C10 5 6 10 4.5 16.5 4 18.5 3.5 20 3.5 20"/><path d="M20 4c-1 8-5 11-11 12M20 4l-9 3M20 4l-3 9"/></svg>`;
    const icoCresta = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20c0-6 3-10 8-10s8 4 8 10"/><path d="M8 10 6 4m6 6-1-7m5 7 2-5"/></svg>`;

    const dataBox = (ico, tono, label, valor, extra) => `
      <div class="data-box">
        <span class="data-ico ${tono}">${ico}</span>
        <div class="data-txt">
          <p class="data-label">${label}</p>
          <p class="data-value">${valor}${extra || ""}</p>
        </div>
      </div>`;
    const reproBadge = reproductorLabel(e) ? ` <span class="repro-badge">${reproductorLabel(e)}</span>` : "";
    const dataBoxes = `
      <div class="data-boxes">
        ${dataBox(icoSexo, "t-coral", "Sexo", sexoTexto, reproBadge)}
        ${dataBox(icoCal, "t-blue", "Edad", edadActual || "—", e.fechaNacimiento ? `<span class="data-sub">${formatFechaCorta(e.fechaNacimiento)}</span>` : "")}
        ${dataBox(icoPlaca, "t-peach", "Color de placa", esc(e.colorPlaca) || "—")}
        ${dataBox(icoPluma, "t-coral", "Plumaje", esc(e.color) || "—")}
        ${e.cresta ? dataBox(icoCresta, "t-peach", "Cresta", esc(e.cresta)) : ""}
      </div>`;

    renderShell(`
      <div class="ficha-hero">
        ${heroHtml}
        <span class="badge-estado badge-${estado} hero-estado">${estadoLabel(estado)}</span>
      </div>
      <div class="screen ficha-screen">
        <div class="card ficha-sheet">
          <div class="ficha-head">
            <div>
              <h2>${esc(e.nombre || "Sin nombre")}</h2>
              <p class="ficha-placa">Placa #${esc(e.placa)} · ${fotos.length} foto${fotos.length === 1 ? "" : "s"}</p>
            </div>
          </div>
          ${dataBoxes}
          <div class="parents-row">
            <div class="link-row" data-action="${padre ? "ficha" : ""}" data-id="${padre ? padre.id : ""}">
              <span><b>Padre:</b> ${padre ? esc(padre.nombre || "") + " #" + esc(padre.placa) : "Origen desconocido"}</span>
              ${padre ? '<span class="arrow">›</span>' : ""}
            </div>
            <div class="link-row" data-action="${madre ? "ficha" : ""}" data-id="${madre ? madre.id : ""}">
              <span><b>Madre:</b> ${madre ? esc(madre.nombre || "") + " #" + esc(madre.placa) : "Origen desconocido"}</span>
              ${madre ? '<span class="arrow">›</span>' : ""}
            </div>
          </div>
          ${e.notas ? `<div class="ficha-notas"><p class="section-label">Observaciones</p><p style="font-size:13px;margin:0;">${esc(e.notas)}</p></div>` : ""}
          <div class="btn-row" style="margin-top:14px;">
            <button class="btn" data-action="arbol" data-id="${e.id}">Ver árbol</button>
            <button class="btn" data-action="descendencia" data-id="${e.id}">Ver crías (${hijos.length})</button>
          </div>
        </div>

        <p class="section-label">Línea de crecimiento</p>
        <div class="card">
          ${photoGrid}
          ${timelineHtml}
          ${sinFechaAviso}
        </div>

        <div class="btn-row">
          <button class="btn btn-primary" data-action="editar" data-id="${e.id}">Editar datos</button>
          <button class="btn" data-action="cambiar-estado" data-id="${e.id}">Cambiar estado</button>
        </div>

        <input type="file" accept="image/*" capture="environment" id="camera-input" style="display:none;">
        <input type="file" accept="image/*" id="gallery-input" style="display:none;">
      </div>
    `, { title: "Ficha del ejemplar", showBack: true, backHref: "#/inicio", bodyClass: "bg-ficha" });

    document.getElementById("camera-input").addEventListener("change", (ev) => handleFotoUpload(ev, e.id, "camara"));
    document.getElementById("gallery-input").addEventListener("change", (ev) => handleFotoUpload(ev, e.id, "galeria"));
  }

  async function handleFotoUpload(ev, ejemplarId, origen) {
    const file = ev.target.files[0];
    if (!file) return;
    const e = await DB.getEjemplar(ejemplarId);
    if (!e.fotos) e.fotos = [];
    if (e.fotos.length >= 8) {
      toast("Máximo 8 fotos por ejemplar");
      ev.target.value = "";
      return;
    }
    toast("Procesando foto…");
    let dataUrl;
    try {
      dataUrl = await compressImage(file);
    } catch (err) {
      toast("No se pudo procesar la foto");
      ev.target.value = "";
      return;
    }
    ev.target.value = "";
    if (origen === "galeria") {
      abrirConfirmarFechaFoto(ejemplarId, dataUrl);
    } else {
      await guardarFotoConFecha(ejemplarId, dataUrl, new Date().toISOString());
      toast("Foto agregada");
      renderFicha(ejemplarId);
    }
  }

  async function guardarFotoConFecha(ejemplarId, dataUrl, fechaISO) {
    const e = await DB.getEjemplar(ejemplarId);
    if (!e.fotos) e.fotos = [];
    e.fotos.push({ id: DB.uuid(), dataUrl, fechaCaptura: fechaISO });
    await DB.saveEjemplar(e);
  }

  function abrirMenuFoto(id) {
    openModal(`
      <p class="section-label">Agregar foto</p>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <button class="btn" data-action="disparar-camara">Tomar foto</button>
        <button class="btn" data-action="disparar-galeria">Elegir de galería</button>
      </div>
      <p class="hint" style="margin-top:10px;">Máximo 8 fotos por ejemplar.</p>
    `);
  }

  function abrirConfirmarFechaFoto(ejemplarId, dataUrl) {
    fotoPendiente = { ejemplarId, dataUrl };
    const hoy = hoyLocal();
    openModal(`
      <p class="section-label">¿Cuándo se tomó esta foto?</p>
      <img src="${dataUrl}" style="width:100%;border-radius:10px;margin-bottom:12px;display:block;">
      <div class="field">
        <label>Fecha de la foto</label>
        <input type="date" id="nueva-foto-fecha" value="${hoy}" max="${hoy}">
      </div>
      <button class="btn btn-primary" data-action="confirmar-fecha-nueva-foto">Guardar foto</button>
      <p class="hint" style="margin-top:8px;">Si la foto es de la galería y fue tomada antes, cambia la fecha para que la edad calculada sea correcta.</p>
    `);
  }

  async function confirmarFechaNuevaFoto() {
    if (!fotoPendiente) return;
    const { ejemplarId, dataUrl } = fotoPendiente;
    const fecha = document.getElementById("nueva-foto-fecha").value;
    if (!fecha) { toast("Elige una fecha"); return; }
    if (fecha > hoyLocal()) { toast("La fecha de la foto no puede ser futura"); return; }
    fotoPendiente = null;
    await guardarFotoConFecha(ejemplarId, dataUrl, fecha + "T12:00:00");
    closeModal();
    toast("Foto agregada");
    renderFicha(ejemplarId);
  }

  async function abrirEditarFoto(ejemplarId, fotoId) {
    const e = await DB.getEjemplar(ejemplarId);
    const foto = (e.fotos || []).find((f) => f.id === fotoId);
    if (!foto) return;
    const hoy = hoyLocal();
    openModal(`
      <img src="${foto.dataUrl}" style="width:100%;border-radius:10px;margin-bottom:12px;display:block;">
      <div class="field">
        <label>Fecha de la foto</label>
        <input type="date" id="foto-fecha-edit" value="${fechaDeFoto(foto.fechaCaptura)}" max="${hoy}">
      </div>
      <button class="btn btn-primary" data-action="guardar-fecha-foto" data-id="${ejemplarId}" data-foto-id="${fotoId}">Guardar fecha</button>
      <button class="btn" style="margin-top:8px;" data-action="cerrar-modal">Cerrar</button>
    `);
  }

  async function guardarFechaFoto(ejemplarId, fotoId) {
    const fecha = document.getElementById("foto-fecha-edit").value;
    if (!fecha) { toast("Elige una fecha"); return; }
    if (fecha > hoyLocal()) { toast("La fecha de la foto no puede ser futura"); return; }
    const e = await DB.getEjemplar(ejemplarId);
    const foto = (e.fotos || []).find((f) => f.id === fotoId);
    if (!foto) return;
    foto.fechaCaptura = fecha + "T12:00:00";
    await DB.saveEjemplar(e);
    closeModal();
    toast("Fecha actualizada");
    renderFicha(ejemplarId);
  }

  // ---------- Screen: Cambiar estado ----------

  async function abrirCambiarEstado(id) {
    const e = await DB.getEjemplar(id);
    openModal(`
      <p class="section-label">Cambiar estado</p>
      <div class="field">
        <label>Estado</label>
        <select id="estado-select">
          <option value="vivo" ${(!e.estado || e.estado === "vivo") ? "selected" : ""}>Vivo</option>
          <option value="vendido" ${e.estado === "vendido" ? "selected" : ""}>Vendido</option>
          <option value="fallecido" ${e.estado === "fallecido" ? "selected" : ""}>Fallecido</option>
          <option value="otro" ${e.estado === "otro" ? "selected" : ""}>Otro</option>
        </select>
      </div>
      <div class="field">
        <label>Fecha</label>
        <input type="date" id="estado-fecha" value="${e.estadoFecha || ""}" max="${hoyLocal()}">
      </div>
      <div class="field">
        <label>Nota (opcional)</label>
        <input type="text" id="estado-nota" placeholder="Ej. vendido a Don Pepe, no sobrevivió" value="${esc(e.estadoNota || "")}">
      </div>
      <button class="btn btn-primary" data-action="guardar-estado" data-id="${e.id}">Guardar</button>
    `);
  }

  async function guardarEstado(id) {
    const e = await DB.getEjemplar(id);
    const estadoFecha = document.getElementById("estado-fecha").value || null;
    if (estadoFecha && estadoFecha > hoyLocal()) { toast("La fecha no puede ser futura"); return; }
    e.estado = document.getElementById("estado-select").value;
    e.estadoFecha = estadoFecha;
    e.estadoNota = document.getElementById("estado-nota").value.trim();
    await DB.saveEjemplar(e);
    closeModal();
    toast("Estado actualizado");
    renderFicha(id);
  }

  // ---------- Screen: Nuevo / Editar ejemplar ----------

  async function renderForm(id) {
    const editing = !!id;
    const e = editing ? await DB.getEjemplar(id) : { sexo: "", padreId: "", madreId: "", estado: "vivo" };
    if (editing && !e) { navigate("#/inicio"); return; }
    const all = await DB.getAllEjemplares();
    const descendientesIds = editing
      ? new Set((await getDescendenciaCompleta(id)).map((d) => d.ejemplar.id))
      : new Set();
    const candidatosPadre = all.filter((c) => c.id !== id && c.sexo !== "H" && !descendientesIds.has(c.id));
    const candidatosMadre = all.filter((c) => c.id !== id && c.sexo !== "M" && !descendientesIds.has(c.id));
    const hijos = editing ? await DB.getHijos(id) : [];

    registrarPicker("f-padre", candidatosPadre, { allowNone: true, placeholder: "— Origen desconocido —", titulo: "Elegir padre" });
    registrarPicker("f-madre", candidatosMadre, { allowNone: true, placeholder: "— Origen desconocido —", titulo: "Elegir madre" });
    const padreActual = e.padreId ? candidatosPadre.find((c) => c.id === e.padreId) : null;
    const madreActual = e.madreId ? candidatosMadre.find((c) => c.id === e.madreId) : null;

    renderShell(`
      <div class="screen">
        <div class="card">
          <div class="field">
            <label>N° de placa *</label>
            <input id="f-placa" value="${esc(e.placa || "")}" placeholder="Ej. 0231">
          </div>
          <div class="field">
            <label>Nombre / referencia</label>
            <input id="f-nombre" value="${esc(e.nombre || "")}" placeholder="Ej. Gallo Colorado">
          </div>
          <div class="field-row">
            <div class="field">
              <label>Fecha de nacimiento</label>
              <input type="date" id="f-fecha" value="${e.fechaNacimiento || ""}" max="${hoyLocal()}">
            </div>
            <div class="field">
              <label>Sexo</label>
              <select id="f-sexo">
                <option value="" ${!e.sexo ? "selected" : ""}>Sin especificar</option>
                <option value="M" ${e.sexo === "M" ? "selected" : ""}>Macho</option>
                <option value="H" ${e.sexo === "H" ? "selected" : ""}>Hembra</option>
              </select>
            </div>
          </div>
          <label class="toggle-field" id="f-reproductor-field" style="${e.sexo ? "" : "display:none;"}">
            <input type="checkbox" id="f-reproductor" ${e.reproductor ? "checked" : ""}>
            <span class="toggle-switch" aria-hidden="true"></span>
            <span class="toggle-text" id="f-reproductor-label">${e.sexo === "H" ? "Es madrilla (reproductora)" : "Es padrillo (reproductor)"}</span>
          </label>
          <div class="field-row">
            <div class="field">
              <label>Color / plumaje</label>
              <input id="f-color" value="${esc(e.color || "")}">
            </div>
            <div class="field">
              <label>Tipo de cresta</label>
              <input id="f-cresta" value="${esc(e.cresta || "")}">
            </div>
          </div>
          <div class="field">
            <label>Color de placa</label>
            <input id="f-colorplaca" value="${esc(e.colorPlaca || "")}" placeholder="Ej. Rojo, Azul, Amarillo">
          </div>
          <div class="field">
            <label>Padre</label>
            ${pickerFieldHtml("f-padre", padreActual, "— Origen desconocido —")}
          </div>
          <div class="field">
            <label>Madre</label>
            ${pickerFieldHtml("f-madre", madreActual, "— Origen desconocido —")}
          </div>
          <div class="field">
            <label>Observaciones</label>
            <textarea id="f-notas" rows="3">${esc(e.notas || "")}</textarea>
          </div>
          <button class="btn btn-primary" data-action="guardar-ejemplar" data-id="${id || ""}">Guardar</button>
        </div>
        ${editing ? `
        <div class="card">
          ${hijos.length
            ? `<p class="hint">Este ejemplar tiene ${hijos.length} cría(s) registradas, por eso no se puede eliminar. Si ya no está, usa "Cambiar estado" en su ficha.</p>`
            : `<button class="btn btn-danger" data-action="eliminar-ejemplar" data-id="${id}">Eliminar registro (solo por error de tipeo)</button>`}
        </div>` : ""}
      </div>
    `, { title: editing ? "Editar ejemplar" : "Nuevo ejemplar", showBack: true, backHref: editing ? `#/ficha/${id}` : "#/inicio", bodyClass: "bg-form" });

    const sexoSel = document.getElementById("f-sexo");
    sexoSel.addEventListener("change", () => {
      const campo = document.getElementById("f-reproductor-field");
      const label = document.getElementById("f-reproductor-label");
      if (!sexoSel.value) {
        campo.style.display = "none";
        document.getElementById("f-reproductor").checked = false;
      } else {
        campo.style.display = "";
        label.textContent = sexoSel.value === "H" ? "Es madrilla (reproductora)" : "Es padrillo (reproductor)";
      }
    });
  }

  async function guardarEjemplar(id) {
    const placa = document.getElementById("f-placa").value.trim();
    if (!placa) { toast("La placa es obligatoria"); return; }
    const fechaNac = document.getElementById("f-fecha").value || null;
    if (fechaNac && fechaNac > hoyLocal()) { toast("La fecha de nacimiento no puede ser futura"); return; }
    const e = id ? await DB.getEjemplar(id) : {};
    e.placa = placa;
    e.nombre = document.getElementById("f-nombre").value.trim();
    e.fechaNacimiento = fechaNac;
    e.sexo = document.getElementById("f-sexo").value || null;
    e.reproductor = e.sexo ? document.getElementById("f-reproductor").checked : false;
    e.color = document.getElementById("f-color").value.trim();
    e.colorPlaca = document.getElementById("f-colorplaca").value.trim();
    e.cresta = document.getElementById("f-cresta").value.trim();
    e.padreId = document.getElementById("f-padre").value || null;
    e.madreId = document.getElementById("f-madre").value || null;
    e.notas = document.getElementById("f-notas").value.trim();
    if (!e.estado) e.estado = "vivo";
    if (!e.fotos) e.fotos = [];
    try {
      const saved = await DB.saveEjemplar(e);
      toast("Guardado");
      navigate(`#/ficha/${saved.id}`);
    } catch (err) {
      if (err.message === "PLACA_DUPLICADA") {
        toast("Ya existe un ejemplar con esa placa");
      } else {
        toast("No se pudo guardar");
      }
    }
  }

  function eliminarEjemplar(id) {
    openModal(`
      <p class="section-label">Eliminar registro</p>
      <p style="font-size:14px;color:var(--ink-600);margin:0 0 14px;">Esta acción no se puede deshacer. ¿Seguro que quieres eliminar este ejemplar?</p>
      <button class="btn btn-danger" data-action="confirmar-eliminar" data-id="${id}">Sí, eliminar</button>
      <button class="btn" style="margin-top:8px;" data-action="cerrar-modal">Cancelar</button>
    `);
  }

  async function confirmarEliminar(id) {
    await DB.deleteEjemplar(id);
    closeModal();
    toast("Registro eliminado");
    navigate("#/inicio");
  }

  // ---------- Screen: Registrar camada ----------

  function nuevaFilaCria() {
    return { id: DB.uuid(), placa: "", color: "", colorPlaca: "", cresta: "", sexo: "" };
  }

  async function renderCamada() {
    if (camadaFilas.length === 0) camadaFilas = [nuevaFilaCria(), nuevaFilaCria()];
    const all = await DB.getAllEjemplares();
    const padres = all.filter((c) => c.sexo !== "H");
    const madres = all.filter((c) => c.sexo !== "M");
    registrarPicker("c-padre", padres, { allowNone: true, placeholder: "Seleccionar", titulo: "Elegir padre" });
    registrarPicker("c-madre", madres, { allowNone: true, placeholder: "Seleccionar", titulo: "Elegir madre" });

    renderShell(`
      <div class="screen">
        <div class="card">
          <p class="section-label">Datos de la camada</p>
          <div class="field-row">
            <div class="field">
              <label>Padre *</label>
              ${pickerFieldHtml("c-padre", null, "Seleccionar")}
            </div>
            <div class="field">
              <label>Madre *</label>
              ${pickerFieldHtml("c-madre", null, "Seleccionar")}
            </div>
          </div>
          <div class="field">
            <label>Fecha de nacimiento de la camada *</label>
            <input type="date" id="c-fecha" max="${hoyLocal()}">
          </div>
        </div>
        <div class="card">
          <p class="section-label">Crías</p>
          <div id="filas-crias">
            ${camadaFilas.map((f, i) => `
              <div class="cria-row">
                <div class="field"><label>Placa</label><input class="cria-placa" data-idx="${i}" value="${esc(f.placa)}"></div>
                <div class="field"><label>Color de placa</label><input class="cria-colorplaca" data-idx="${i}" value="${esc(f.colorPlaca)}"></div>
                <div class="field"><label>Color</label><input class="cria-color" data-idx="${i}" value="${esc(f.color)}"></div>
                <div class="field"><label>Sexo</label><select class="cria-sexo" data-idx="${i}"><option value="" ${!f.sexo?"selected":""}>—</option><option value="M" ${f.sexo==="M"?"selected":""}>M</option><option value="H" ${f.sexo==="H"?"selected":""}>H</option></select></div>
                <button class="btn-ghost cria-quitar" data-action="quitar-fila-cria" data-idx="${i}" aria-label="Quitar fila">×</button>
              </div>`).join("")}
          </div>
          <button class="btn" data-action="agregar-fila-cria">+ Agregar cría</button>
        </div>
        <button class="btn btn-primary" data-action="guardar-camada">Guardar camada</button>
      </div>
    `, { title: "Registrar camada", showBack: false, activeNav: "camada", bodyClass: "bg-camada" });
  }

  function sincronizarFilasDesdeDOM() {
    document.querySelectorAll(".cria-placa").forEach((inp) => { camadaFilas[+inp.dataset.idx].placa = inp.value.trim(); });
    document.querySelectorAll(".cria-colorplaca").forEach((inp) => { camadaFilas[+inp.dataset.idx].colorPlaca = inp.value.trim(); });
    document.querySelectorAll(".cria-color").forEach((inp) => { camadaFilas[+inp.dataset.idx].color = inp.value.trim(); });
    document.querySelectorAll(".cria-sexo").forEach((sel) => { camadaFilas[+sel.dataset.idx].sexo = sel.value; });
  }

  function agregarFilaCria() {
    sincronizarFilasDesdeDOM();
    camadaFilas.push(nuevaFilaCria());
    renderCamada();
  }

  function quitarFilaCria(idx) {
    sincronizarFilasDesdeDOM();
    camadaFilas.splice(idx, 1);
    if (camadaFilas.length === 0) camadaFilas.push(nuevaFilaCria());
    renderCamada();
  }

  async function guardarCamada() {
    const padreId = document.getElementById("c-padre").value;
    const madreId = document.getElementById("c-madre").value;
    const fecha = document.getElementById("c-fecha").value;
    if (!padreId || !madreId || !fecha) { toast("Completa padre, madre y fecha"); return; }
    if (fecha > hoyLocal()) { toast("La fecha de nacimiento no puede ser futura"); return; }
    sincronizarFilasDesdeDOM();
    const filasValidas = camadaFilas.filter((f) => f.placa);
    if (filasValidas.length === 0) { toast("Agrega al menos una cría con placa"); return; }

    const placasVistas = new Set();
    for (const f of filasValidas) {
      if (placasVistas.has(f.placa)) { toast(`La placa #${f.placa} está repetida en esta camada`); return; }
      placasVistas.add(f.placa);
    }
    for (const f of filasValidas) {
      const existing = await DB.findByPlaca(f.placa);
      if (existing) { toast(`La placa #${f.placa} ya existe`); return; }
    }
    const camadaId = DB.uuid();
    try {
      for (const f of filasValidas) {
        await DB.saveEjemplar({
          placa: f.placa, nombre: "", color: f.color, colorPlaca: f.colorPlaca, cresta: f.cresta, sexo: f.sexo || null,
          fechaNacimiento: fecha, padreId, madreId, camadaId, estado: "vivo", fotos: [], notas: "",
        });
      }
    } catch (err) {
      toast("No se pudo guardar la camada completa, revisa los registros ya creados en Inicio");
      navigate("#/inicio");
      return;
    }
    camadaFilas = [];
    toast(`${filasValidas.length} cría(s) registradas`);
    navigate("#/inicio");
  }

  // ---------- Screen: Árbol ancestros ----------

  async function getDescendenciaCompleta(rootId) {
    const resultado = [];
    let frontier = [rootId];
    const visitados = new Set([rootId]);
    let gen = 1;
    while (frontier.length && gen <= 12) {
      const next = [];
      for (const pid of frontier) {
        const hijos = await DB.getHijos(pid);
        for (const h of hijos) {
          if (visitados.has(h.id)) continue;
          visitados.add(h.id);
          resultado.push({ ejemplar: h, generacion: gen });
          next.push(h.id);
        }
      }
      frontier = next;
      gen++;
    }
    return resultado;
  }

  function etiquetaGeneracion(gen) {
    if (gen === 1) return "Hijos";
    if (gen === 2) return "Nietos";
    if (gen === 3) return "Bisnietos";
    return `Generación ${gen}`;
  }

  const ARBOL_COL_W = 90;
  const ARBOL_ROW_H = 118;
  const ARBOL_FRAME_W = 76;
  const ARBOL_FRAME_H = 92;
  const ARBOL_PAD = 24;
  let arbolFoco = null;

  async function buildFamilyGraph(rootId, maxNodes = 150) {
    const nodes = new Map();
    const queue = [rootId];
    const seen = new Set([rootId]);
    while (queue.length && nodes.size < maxNodes) {
      const nid = queue.shift();
      const ej = await DB.getEjemplar(nid);
      if (!ej) continue;
      nodes.set(nid, ej);
      const vecinos = [];
      if (ej.padreId) vecinos.push(ej.padreId);
      if (ej.madreId) vecinos.push(ej.madreId);
      (await DB.getHijos(nid)).forEach((h) => vecinos.push(h.id));
      vecinos.forEach((v) => { if (!seen.has(v)) { seen.add(v); queue.push(v); } });
    }
    return nodes;
  }

  function hijosDeGrafo(nodes, id) {
    const out = [];
    nodes.forEach((ej, otroId) => { if (ej.padreId === id || ej.madreId === id) out.push(otroId); });
    return out;
  }

  function asignarGeneraciones(nodes, rootId) {
    const gen = new Map([[rootId, 0]]);
    const queue = [rootId];
    while (queue.length) {
      const nid = queue.shift();
      const ej = nodes.get(nid);
      const g = gen.get(nid);
      const marcar = (otroId, otroGen) => {
        if (!otroId || !nodes.has(otroId) || gen.has(otroId)) return;
        gen.set(otroId, otroGen);
        queue.push(otroId);
      };
      marcar(ej.padreId, g - 1);
      marcar(ej.madreId, g - 1);
      hijosDeGrafo(nodes, nid).forEach((hId) => marcar(hId, g + 1));
    }
    return gen;
  }

  function calcularLayoutArbol(nodes, gen) {
    const filas = new Map();
    gen.forEach((g, nid) => { if (!filas.has(g)) filas.set(g, []); filas.get(g).push(nid); });
    const generaciones = [...filas.keys()].sort((a, b) => a - b);
    const orden = new Map();
    generaciones.forEach((g) => {
      const fila = filas.get(g).sort((a, b) => (nodes.get(a).placa || "").localeCompare(nodes.get(b).placa || ""));
      fila.forEach((nid, i) => orden.set(nid, i));
      filas.set(g, fila);
    });

    const padresDe = (nid) => {
      const ej = nodes.get(nid);
      return [ej.padreId, ej.madreId].filter((p) => p && nodes.has(p));
    };
    const reordenarFila = (g, refsFn) => {
      const fila = filas.get(g).map((nid) => {
        const refs = refsFn(nid).map((r) => orden.get(r)).filter((v) => v !== undefined);
        const b = refs.length ? refs.reduce((a, c) => a + c, 0) / refs.length : orden.get(nid);
        return { nid, b };
      });
      fila.sort((a, b) => a.b - b.b);
      fila.forEach((item, i) => orden.set(item.nid, i));
      filas.set(g, fila.map((item) => item.nid));
    };

    for (let pasada = 0; pasada < 4; pasada++) {
      generaciones.forEach((g) => reordenarFila(g, padresDe));
      for (let i = generaciones.length - 1; i >= 0; i--) {
        reordenarFila(generaciones[i], (nid) => hijosDeGrafo(nodes, nid));
      }
    }

    const genMin = generaciones[0];
    const pos = new Map();
    let maxCols = 1;
    generaciones.forEach((g) => {
      const fila = filas.get(g);
      maxCols = Math.max(maxCols, fila.length);
      fila.forEach((nid, col) => pos.set(nid, { x: col * ARBOL_COL_W, y: (g - genMin) * ARBOL_ROW_H }));
    });
    return { pos, anchoTotal: maxCols * ARBOL_COL_W, altoTotal: generaciones.length * ARBOL_ROW_H };
  }

  function lineaArbolPath(x1, y1, x2, y2) {
    const midY = y1 + (y2 - y1) / 2;
    return `M${x1},${y1} V${midY} H${x2} V${y2}`;
  }

  function famFrameHtmlAbs(ejemplar, x, y, esRaiz) {
    const foto = fotoMasReciente(ejemplar);
    const fotoHtml = foto
      ? `<img src="${foto}" alt="">`
      : `<div class="fam-photo-fallback">${initials(ejemplar.nombre, ejemplar.placa)}</div>`;
    const clases = ["fam-frame"];
    if (esRaiz) clases.push("fam-frame-root");
    if (ejemplar.sexo === "M") clases.push("fam-frame-macho");
    if (ejemplar.sexo === "H") clases.push("fam-frame-hembra");
    return `
      <div class="${clases.join(" ")}" data-action="foco-arbol" data-id="${ejemplar.id}" style="left:${x}px;top:${y}px;">
        ${esRaiz ? '<span class="fam-root-badge" aria-hidden="true">★</span>' : ""}
        <div class="fam-photo">${fotoHtml}</div>
        <p class="fam-name">${esc(ejemplar.nombre || "Sin nombre")}</p>
        <p class="fam-placa">#${esc(ejemplar.placa)}</p>
        <span class="fam-goto" data-action="ficha" data-id="${ejemplar.id}">Ver ficha ›</span>
      </div>`;
  }

  function limpiarFocoArbol() {
    const cont = document.getElementById("graph-tree");
    if (!cont) return;
    arbolFoco = null;
    cont.classList.remove("tree-focus-on");
    cont.querySelectorAll(".tree-line-active").forEach((p) => p.classList.remove("tree-line-active"));
    cont.querySelectorAll(".tree-node-active, .tree-node-related").forEach((f) => f.classList.remove("tree-node-active", "tree-node-related"));
  }

  function alternarFocoArbol(nodeId) {
    const cont = document.getElementById("graph-tree");
    if (!cont) return;
    if (arbolFoco === nodeId) { limpiarFocoArbol(); return; }
    arbolFoco = nodeId;
    const relacionados = new Set([nodeId]);
    cont.querySelectorAll(".tree-line").forEach((path) => {
      const { padre, hijo } = path.dataset;
      const relevante = padre === nodeId || hijo === nodeId;
      path.classList.toggle("tree-line-active", relevante);
      if (relevante) { relacionados.add(padre); relacionados.add(hijo); }
    });
    cont.querySelectorAll(".fam-frame").forEach((frame) => {
      const fid = frame.dataset.id;
      frame.classList.toggle("tree-node-active", fid === nodeId);
      frame.classList.toggle("tree-node-related", fid !== nodeId && relacionados.has(fid));
    });
    cont.classList.add("tree-focus-on");
  }

  async function renderArbol(id) {
    const e = await DB.getEjemplar(id);
    if (!e) { navigate("#/inicio"); return; }
    arbolFoco = null;
    const nodes = await buildFamilyGraph(id);
    const gen = asignarGeneraciones(nodes, id);
    const { pos, anchoTotal, altoTotal } = calcularLayoutArbol(nodes, gen);

    const svgW = anchoTotal + ARBOL_PAD * 2;
    const svgH = altoTotal + ARBOL_PAD * 2;

    let lineasSvg = "";
    let nodosHtml = "";
    nodes.forEach((ej, nid) => {
      const p = pos.get(nid);
      const px = p.x + ARBOL_PAD, py = p.y + ARBOL_PAD;
      nodosHtml += famFrameHtmlAbs(ej, px, py, nid === id);
      [ej.padreId, ej.madreId].forEach((parentId) => {
        if (parentId && nodes.has(parentId) && pos.has(parentId)) {
          const pp = pos.get(parentId);
          const x1 = pp.x + ARBOL_PAD + ARBOL_FRAME_W / 2, y1 = pp.y + ARBOL_PAD + ARBOL_FRAME_H;
          const x2 = px + ARBOL_FRAME_W / 2, y2 = py;
          lineasSvg += `<path class="tree-line" data-padre="${parentId}" data-hijo="${nid}" d="${lineaArbolPath(x1, y1, x2, y2)}" />`;
        }
      });
    });

    renderShell(`
      <div class="screen">
        <h2 class="sr-only">Árbol genealógico de ${esc(e.nombre || e.placa)}</h2>
        <p class="hint" style="margin:0 0 8px;">Toca un gallo para resaltar a sus padres e hijos. Toca "Ver ficha" para abrir su registro.</p>
        <div class="graph-tree-wrap" data-action="limpiar-foco-arbol">
          <div class="graph-tree" id="graph-tree" style="width:${svgW}px;height:${svgH}px;">
            <svg class="graph-lines" width="${svgW}" height="${svgH}">${lineasSvg}</svg>
            ${nodosHtml}
          </div>
        </div>
      </div>
    `, { title: "Árbol genealógico", showBack: true, backHref: `#/ficha/${id}`, bodyClass: "bg-arbol" });
  }

  // ---------- Screen: Descendencia ----------

  async function renderDescendencia(id) {
    const e = await DB.getEjemplar(id);
    if (!e) { navigate("#/inicio"); return; }
    const descendencia = await getDescendenciaCompleta(id);
    const hijosCount = descendencia.filter((d) => d.generacion === 1).length;
    const restoCount = descendencia.length - hijosCount;

    const filaHtml = (f) => {
      const est = f.ejemplar.estado || "vivo";
      const esHijo = f.generacion === 1;
      return `
      <div class="desc-row ${esHijo ? "" : "child-of"}" data-action="ficha" data-id="${f.ejemplar.id}">
        ${miniAvatarHtml(f.ejemplar, "desc-photo")}
        <div class="dot dot-${est}"></div>
        <span style="flex:1;font-size:13px;">${esc(f.ejemplar.nombre || "Sin nombre")} · #${esc(f.ejemplar.placa)}${!esHijo ? ` <span style="color:var(--ink-400);font-size:11px;">(${etiquetaGeneracion(f.generacion).toLowerCase()})</span>` : ""}</span>
        ${est === "fallecido" ? '<span style="font-size:10px;color:var(--red-600);">fallecido</span>' : ""}
      </div>`;
    };

    renderShell(`
      <div class="screen">
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <p class="section-label" style="margin:0;">Descendencia</p>
            <span style="font-size:11px;color:var(--ink-600);">${hijosCount} cría(s) directa(s)${restoCount ? " · " + restoCount + " más" : ""}</span>
          </div>
          <div style="display:flex;justify-content:center;margin-bottom:12px;">
            <div class="tree-node c-main" style="border:2px solid var(--gold-600); padding:8px 18px;">
              ${miniAvatarHtml(e, "tree-photo")}
              <p class="t">${esc(e.nombre || "Sin nombre")}</p>
              <p class="ts">#${esc(e.placa)}</p>
            </div>
          </div>
          ${descendencia.length ? descendencia.map(filaHtml).join("") : `<p style="font-size:13px;color:var(--ink-600);">Aún no tiene crías registradas.</p>`}
        </div>
      </div>
    `, { title: "Descendencia", showBack: true, backHref: `#/ficha/${id}`, bodyClass: "bg-ficha" });
  }

  // ---------- Screen: Pendientes ----------

  async function renderPendientes() {
    const all = await DB.getAllPendientes();
    all.sort((a, b) => {
      if (a.completado !== b.completado) return a.completado ? 1 : -1;
      if (!a.fecha) return 1;
      if (!b.fecha) return -1;
      return new Date(a.fecha) - new Date(b.fecha);
    });
    const itemHtml = (p) => {
      let urgente = false;
      let subtext = p.fecha ? formatFechaCorta(p.fecha) : "Sin fecha";
      if (p.fecha && !p.completado) {
        const diff = diasHasta(p.fecha);
        if (diff <= 7) { urgente = true; subtext = diff < 0 ? "Venció" : diff === 0 ? "Es hoy" : `En ${diff} día(s)`; }
      }
      const icon = p.tipo === "vacuna" ? "&#9679;" : p.tipo === "foto" ? "&#9678;" : "&#9670;";
      return `
      <div class="pendiente-item">
        <div class="pendiente-icon ${urgente ? "urgente" : ""}">${icon}</div>
        <div style="flex:1;${p.completado ? "opacity:0.5;text-decoration:line-through;" : ""}">
          <p class="title">${esc(p.texto)}</p>
          <p class="sub ${urgente ? "urgente" : ""}">${p.completado ? "Completado" : subtext}</p>
        </div>
        <button class="pendiente-check" data-action="completar-pendiente" data-id="${p.id}" aria-label="Marcar completado">${p.completado ? "↺" : "✓"}</button>
      </div>`;
    };

    renderShell(`
      <div class="screen">
        <div class="card">
          <p class="section-label">Pendientes</p>
          ${all.length ? all.map(itemHtml).join("") : `<p style="font-size:13px;color:var(--ink-600);">No tienes pendientes registrados.</p>`}
          <button class="btn" style="margin-top:12px;" data-action="agregar-pendiente-form">+ Agregar pendiente</button>
        </div>
      </div>
    `, { title: "Pendientes", showBack: false, activeNav: "pendientes", bodyClass: "bg-pendientes" });
  }

  async function abrirFormPendiente() {
    const all = await DB.getAllEjemplares();
    openModal(`
      <p class="section-label">Nuevo pendiente</p>
      <div class="field">
        <label>Descripción</label>
        <input id="p-texto" placeholder="Ej. Vacuna de Gallo Colorado">
      </div>
      <div class="field-row">
        <div class="field">
          <label>Tipo</label>
          <select id="p-tipo">
            <option value="vacuna">Vacuna / salud</option>
            <option value="foto">Foto de seguimiento</option>
            <option value="otro">Otro</option>
          </select>
        </div>
        <div class="field">
          <label>Fecha</label>
          <input type="date" id="p-fecha">
        </div>
      </div>
      <div class="field">
        <label>Ejemplar relacionado (opcional)</label>
        <select id="p-ejemplar"><option value="">— Ninguno —</option>${all.map((e) => `<option value="${e.id}">${esc(e.nombre || "")} · #${esc(e.placa)}</option>`).join("")}</select>
      </div>
      <button class="btn btn-primary" data-action="guardar-pendiente">Guardar</button>
    `);
  }

  async function guardarPendiente() {
    const texto = document.getElementById("p-texto").value.trim();
    if (!texto) { toast("Escribe una descripción"); return; }
    await DB.savePendiente({
      texto, tipo: document.getElementById("p-tipo").value,
      fecha: document.getElementById("p-fecha").value || null,
      ejemplarId: document.getElementById("p-ejemplar").value || null,
      completado: false,
    });
    closeModal();
    toast("Pendiente guardado");
    renderPendientes();
  }

  async function completarPendiente(id) {
    const all = await DB.getAllPendientes();
    const p = all.find((x) => x.id === id);
    if (!p) return;
    p.completado = !p.completado;
    await DB.savePendiente(p);
    renderPendientes();
  }

  // ---------- Screen: Ajustes / Exportar ----------

  async function renderAjustes() {
    const all = await DB.getAllEjemplares();
    const tema = temaActual();
    const opcionTema = (clave) => `
      <button class="tema-opt ${tema === clave ? "active" : ""}" data-action="tema" data-tema="${clave}">
        <span class="tema-swatch tema-swatch-${clave}"></span>
        <span>${TEMAS[clave].nombre}</span>
      </button>`;
    renderShell(`
      <div class="screen">
        <div class="card">
          <p class="section-label">Apariencia</p>
          <p style="font-size:13px;color:var(--ink-600);margin:0 0 10px;">Elige el estilo de la app. Se guarda en este celular.</p>
          <div class="tema-selector">
            ${opcionTema("calido")}
            ${opcionTema("claro")}
            ${opcionTema("oscuro")}
          </div>
        </div>
        <div class="card">
          <p class="section-label">Respaldo de datos</p>
          <p style="font-size:13px;color:var(--ink-600);">Tienes ${all.length} ejemplar(es) registrados. Guarda un respaldo cada tanto (sobre todo antes de cambiar de celular) o compártelo para pasarlo a otro teléfono.</p>
          <button class="btn btn-primary" data-action="compartir" style="margin-top:10px;">Compartir respaldo (WhatsApp…)</button>
          <button class="btn" data-action="exportar" style="margin-top:8px;">Descargar respaldo (.json)</button>
          <p class="hint" style="margin-top:8px;">El archivo lleva la fecha y hora en su nombre, así sabes cuál es el más reciente.</p>
        </div>
        <div class="card">
          <p class="section-label">Restaurar respaldo</p>
          <p style="font-size:13px;color:var(--ink-600);">Selecciona un archivo .json exportado antes.</p>
          <input type="file" accept="application/json" id="import-input" style="display:none;">
          <button class="btn" style="margin-top:10px;" data-action="importar-file">Elegir archivo</button>
        </div>
        <div class="card" style="text-align:center;">
          <img src="icons/mascota.png" alt="" class="acerca-mascota" onerror="this.style.display='none'">
          <p class="section-label">Acerca de</p>
          <p style="font-size:13px;color:var(--ink-600);margin:0;">Criaderos Hermanos Torres · Registro genealógico local. Todos los datos y fotos se guardan únicamente en este celular.</p>
        </div>
      </div>
    `, { title: "Ajustes", showBack: false, activeNav: "ajustes", bodyClass: "bg-ajustes" });

    document.getElementById("import-input").addEventListener("change", handleImport);
  }

  function nombreRespaldo() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    const fecha = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    const hora = `${p(d.getHours())}${p(d.getMinutes())}`;
    return `respaldo-criadero-torres-${fecha}_${hora}.json`;
  }

  async function exportarDatos() {
    const data = await DB.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreRespaldo();
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Respaldo descargado");
  }

  async function compartirRespaldo() {
    const data = await DB.exportAll();
    const nombre = nombreRespaldo();
    const contenido = JSON.stringify(data, null, 2);
    try {
      const file = new File([contenido], nombre, { type: "application/json" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "Respaldo criadero",
          text: "Respaldo de Criaderos Hermanos Torres",
        });
        return;
      }
    } catch (err) {
      if (err && err.name === "AbortError") return; // el usuario cerró la hoja de compartir
    }
    // Fallback: no se puede compartir archivo → descargar
    await exportarDatos();
    toast("Tu dispositivo no permite compartir el archivo; se descargó para enviarlo a mano");
  }

  // ---------- Validación del respaldo (el archivo viene de fuera: WhatsApp, descargas…) ----------

  const ID_SEGURO = /^[A-Za-z0-9_-]{1,64}$/;
  const FECHA_YMD = /^\d{4}-\d{2}-\d{2}$/;
  const esIdOpcional = (v) => v === null || v === undefined || v === "" || (typeof v === "string" && ID_SEGURO.test(v));
  const esFechaOpcional = (v) => v === null || v === undefined || v === "" || (typeof v === "string" && FECHA_YMD.test(v));

  function problemaEnEjemplar(e, i) {
    const n = `Ejemplar ${i + 1}`;
    if (!e || typeof e !== "object") return `${n}: no es un registro válido`;
    if (typeof e.id !== "string" || !ID_SEGURO.test(e.id)) return `${n}: le falta el identificador`;
    if (typeof e.placa !== "string" || !e.placa.trim()) return `${n}: le falta la placa`;
    if (!esIdOpcional(e.padreId) || !esIdOpcional(e.madreId)) return `${n} (#${e.placa}): padre o madre inválidos`;
    if (!esFechaOpcional(e.fechaNacimiento) || !esFechaOpcional(e.estadoFecha)) return `${n} (#${e.placa}): fecha inválida`;
    if (e.fotos !== undefined && !Array.isArray(e.fotos)) return `${n} (#${e.placa}): fotos inválidas`;
    const fotoMala = (e.fotos || []).some((f) => !f || typeof f.id !== "string" || !ID_SEGURO.test(f.id) ||
      typeof f.dataUrl !== "string" || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(f.dataUrl) ||
      typeof f.fechaCaptura !== "string" || isNaN(new Date(f.fechaCaptura)));
    if (fotoMala) return `${n} (#${e.placa}): tiene una foto dañada`;
    return null;
  }

  function validarRespaldo(data) {
    if (!data || typeof data !== "object" || !Array.isArray(data.ejemplares)) return "El archivo no es un respaldo de esta app";
    if (data.pendientes !== undefined && !Array.isArray(data.pendientes)) return "La lista de pendientes está dañada";
    for (let i = 0; i < data.ejemplares.length; i++) {
      const problema = problemaEnEjemplar(data.ejemplares[i], i);
      if (problema) return problema;
    }
    const placas = new Set();
    for (const e of data.ejemplares) {
      if (placas.has(e.placa)) return `La placa #${e.placa} está repetida en el archivo`;
      placas.add(e.placa);
    }
    const pendienteMalo = (data.pendientes || []).some((p) => !p || typeof p.id !== "string" || !ID_SEGURO.test(p.id) ||
      typeof p.texto !== "string" || !esFechaOpcional(p.fecha) || !esIdOpcional(p.ejemplarId));
    if (pendienteMalo) return "Hay un pendiente dañado en el archivo";
    return null;
  }

  async function handleImport(ev) {
    const file = ev.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      let data;
      try { data = JSON.parse(text); } catch (e) { data = null; }
      const problema = validarRespaldo(data);
      if (problema) {
        toast(`No se restauró nada: ${problema}`);
        ev.target.value = "";
        return;
      }
      importPendiente = data;
      const cuantos = (data.ejemplares || []).length;
      openModal(`
        <p class="section-label">Restaurar respaldo</p>
        <p style="font-size:14px;color:var(--ink-600);margin:0 0 14px;">El archivo tiene ${cuantos} ejemplar(es). ¿Cómo quieres restaurarlo?</p>
        <button class="btn btn-primary" data-action="importar-modo" data-modo="combinar">Combinar con lo que tengo</button>
        <p class="hint" style="margin:4px 0 12px;">Agrega los del archivo sin borrar tus registros actuales.</p>
        <button class="btn btn-danger" data-action="importar-modo" data-modo="reemplazar">Reemplazar todo</button>
        <p class="hint" style="margin:4px 0 12px;">Borra tus datos actuales y deja solo los del archivo.</p>
        <button class="btn" data-action="cerrar-modal">Cancelar</button>
      `);
    } catch (err) {
      toast("No se pudo leer el archivo");
    }
    ev.target.value = "";
  }

  async function ejecutarImport(modo) {
    if (!importPendiente) return;
    const data = importPendiente;
    importPendiente = null;
    try {
      await DB.importAll(data, modo);
      closeModal();
      toast("Datos restaurados");
      navigate("#/inicio");
    } catch (err) {
      console.error(err);
      closeModal();
      toast(err && err.name === "ConstraintError"
        ? "No se restauró nada: el respaldo trae placas que ya usas en otros ejemplares"
        : "No se pudo restaurar el respaldo; tus datos siguen como estaban");
    }
  }

  // ---------- Router ----------

  async function router() {
    const hash = window.location.hash || "#/inicio";
    const [, route, param] = hash.split("/");
    closeModal();
    try {
      switch (route) {
        case "inicio": return renderInicio();
        case "ficha": return renderFicha(param);
        case "nuevo": return renderForm();
        case "editar": return renderForm(param);
        case "camada": return renderCamada();
        case "arbol": return renderArbol(param);
        case "descendencia": return renderDescendencia(param);
        case "pendientes": return renderPendientes();
        case "ajustes": return renderAjustes();
        default: return renderInicio();
      }
    } catch (err) {
      console.error(err);
      toast("Ocurrió un error, vuelve a intentar");
    }
  }

  // ---------- Global click delegation ----------

  function initDelegation() {
    document.body.addEventListener("click", (e) => {
      const target = e.target.closest("[data-action]");
      if (!target) return;
      const action = target.dataset.action;
      const id = target.dataset.id;
      let resultado;
      try {
        switch (action) {
          case "ficha": if (id) navigate(`#/ficha/${id}`); break;
          case "editar": navigate(`#/editar/${id}`); break;
          case "nuevo": navigate("#/nuevo"); break;
          case "camada": navigate("#/camada"); break;
          case "arbol": if (id) navigate(`#/arbol/${id}`); break;
          case "descendencia": if (id) navigate(`#/descendencia/${id}`); break;
          case "pendientes": navigate("#/pendientes"); break;
          case "ajustes": navigate("#/ajustes"); break;
          case "filtro":
            state.filtro = target.dataset.filter;
            resultado = renderInicio();
            break;
          case "vista":
            state.vista = target.dataset.vista;
            resultado = renderInicio();
            break;
          case "guardar-ejemplar": resultado = guardarEjemplar(id || null); break;
          case "eliminar-ejemplar": eliminarEjemplar(id); break;
          case "confirmar-eliminar": resultado = confirmarEliminar(id); break;
          case "importar-modo": resultado = ejecutarImport(target.dataset.modo); break;
          case "cambiar-estado": resultado = abrirCambiarEstado(id); break;
          case "guardar-estado": resultado = guardarEstado(id); break;
          case "agregar-foto-menu": abrirMenuFoto(id); break;
          case "disparar-camara": closeModal(); document.getElementById("camera-input").click(); break;
          case "disparar-galeria": closeModal(); document.getElementById("gallery-input").click(); break;
          case "editar-foto": resultado = abrirEditarFoto(id, target.dataset.fotoId); break;
          case "confirmar-fecha-nueva-foto": resultado = confirmarFechaNuevaFoto(); break;
          case "guardar-fecha-foto": resultado = guardarFechaFoto(id, target.dataset.fotoId); break;
          case "cerrar-modal": closeModal(); break;
          case "abrir-picker": resultado = abrirPicker(target.dataset.target); break;
          case "elegir-picker": elegirPicker(target.dataset.target, target.dataset.id); break;
          case "foco-arbol": alternarFocoArbol(id); break;
          case "limpiar-foco-arbol": limpiarFocoArbol(); break;
          case "agregar-fila-cria": resultado = agregarFilaCria(); break;
          case "quitar-fila-cria": resultado = quitarFilaCria(+target.dataset.idx); break;
          case "guardar-camada": resultado = guardarCamada(); break;
          case "agregar-pendiente-form": resultado = abrirFormPendiente(); break;
          case "guardar-pendiente": resultado = guardarPendiente(); break;
          case "completar-pendiente": resultado = completarPendiente(id); break;
          case "exportar": resultado = exportarDatos(); break;
          case "compartir": resultado = compartirRespaldo(); break;
          case "importar-file": document.getElementById("import-input").click(); break;
          case "tema": setTheme(target.dataset.tema); break;
        }
      } catch (err) {
        console.error(err);
        toast("Ocurrió un error, vuelve a intentar");
        return;
      }
      if (resultado && typeof resultado.catch === "function") {
        resultado.catch((err) => {
          console.error(err);
          toast("Ocurrió un error, vuelve a intentar");
        });
      }
    });
  }

  function init() {
    initDelegation();
    window.addEventListener("hashchange", router);
    router();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }
  }

  return { init };
})();

document.addEventListener("DOMContentLoaded", App.init);
