// Prueba de punta a punta de la PWA a 390x844 (móvil) con playwright-core.
// Uso:  1) servir la carpeta:  npx serve -l 5181 .   (o python -m http.server 5181)
//       2) npm install && npm run prueba   (o: node pruebas/e2e.mjs http://127.0.0.1:5181/)
// Necesita Google Chrome instalado (usa channel "chrome"; cambia a "msedge" si hace falta).
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] || "http://127.0.0.1:5181/";
const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, "salida");
fs.mkdirSync(OUT, { recursive: true });
const CANAL = process.env.CANAL || "chrome";

const resultados = [];
const ok = (nombre, cond, detalle = "") => {
  resultados.push({ nombre, ok: !!cond, detalle });
  console.log(`${cond ? "PASA" : "FALLA"}  ${nombre}${detalle ? "  — " + detalle : ""}`);
};

const browser = await chromium.launch({ channel: CANAL });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  locale: "es-PE", timezoneId: "America/Lima", acceptDownloads: true,
});
await context.addInitScript(() => {
  if (navigator.storage && navigator.storage.persist) {
    const orig = navigator.storage.persist.bind(navigator.storage);
    navigator.storage.persist = () => { window.__persistPedido = true; return orig(); };
  }
});
const page = await context.newPage();
const consola = [];
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") consola.push(`[${m.type()}] ${m.text()}`); });
page.on("pageerror", (e) => consola.push(`[pageerror] ${e.message}`));
// Fijamos la hora a las 20:30 de Lima: es cuando la fecha UTC ya es "mañana".
await page.clock.setFixedTime(new Date("2026-10-01T20:30:00-05:00"));

const tap = async (sel) => { await page.locator(sel).first().click(); await page.waitForTimeout(250); };
const fill = (sel, v) => page.locator(sel).first().fill(v);
const elegir = async (target, texto) => {
  await tap(`[data-action="abrir-picker"][data-target="${target}"]`);
  await page.locator(`#picker-results .picker-item`, { hasText: texto }).first().click();
  await page.waitForTimeout(250);
};
const nuevoEjemplar = async (d) => {
  await page.goto(BASE + "#/nuevo"); await page.waitForTimeout(400);
  await fill("#f-placa", d.placa); await fill("#f-nombre", d.nombre || "");
  if (d.fecha) await fill("#f-fecha", d.fecha);
  if (d.sexo) await page.selectOption("#f-sexo", d.sexo);
  if (d.repro) await page.locator("#f-reproductor-field").click();
  if (d.color) await fill("#f-color", d.color);
  if (d.colorPlaca) await fill("#f-colorplaca", d.colorPlaca);
  if (d.padre) await elegir("f-padre", d.padre);
  if (d.madre) await elegir("f-madre", d.madre);
  await tap('[data-action="guardar-ejemplar"]');
  await page.waitForTimeout(400);
};

await page.goto(BASE);
await page.waitForSelector(".stats-row");
await page.evaluate(() => navigator.serviceWorker.ready);
ok("Carga inicial muestra Inicio", await page.locator(".empty-state").count() === 1);

// 1. Ejemplares
await nuevoEjemplar({ placa: "101", nombre: "Colorado", sexo: "M", repro: true, fecha: "2024-03-10", color: "Colorado", colorPlaca: "Rojo" });
ok("Crear ejemplar lleva a su ficha", page.url().includes("#/ficha/"), page.url());
await nuevoEjemplar({ placa: "102", nombre: "Pinta", sexo: "H", repro: true, fecha: "2024-05-02", color: "Giro", colorPlaca: "Azul" });
await nuevoEjemplar({ placa: "101", nombre: "Duplicado" });
ok("Placa duplicada se rechaza", page.url().includes("#/nuevo"), await page.locator("#toast").textContent());

// 2. Validación: padre y madre iguales (ejemplar sin sexo)
await nuevoEjemplar({ placa: "103", nombre: "Sin sexo" });
await page.goto(BASE + "#/nuevo"); await page.waitForTimeout(300);
await fill("#f-placa", "104");
await elegir("f-padre", "#103"); await elegir("f-madre", "#103");
await tap('[data-action="guardar-ejemplar"]');
ok("No deja guardar con el mismo ejemplar como padre y madre", page.url().includes("#/nuevo"), await page.locator("#toast").textContent());

// 3. Camada: se eligen padres y fecha y luego se agrega una fila
await page.goto(BASE); await page.waitForTimeout(400);
const antesCamada = await page.evaluate(async () => (await DB.getAllEjemplares()).length);
await page.goto(BASE + "#/camada"); await page.waitForTimeout(400);
await elegir("c-padre", "#101"); await elegir("c-madre", "#102");
await fill("#c-fecha", "2026-08-15");
await page.locator(".cria-placa").nth(0).fill("201");
await tap('[data-action="agregar-fila-cria"]');
const padreTrasFila = await page.locator("#c-padre").inputValue();
const fechaTrasFila = await page.locator("#c-fecha").inputValue();
ok("Agregar fila de cría conserva padre y fecha", padreTrasFila && fechaTrasFila, `padre="${padreTrasFila}" fecha="${fechaTrasFila}"`);
if (!padreTrasFila) { await elegir("c-padre", "#101"); await elegir("c-madre", "#102"); }
if (!fechaTrasFila) await fill("#c-fecha", "2026-08-15");
await page.locator(".cria-placa").nth(1).fill("202");
await page.locator(".cria-placa").nth(2).fill("203");
await page.locator(".cria-sexo").nth(0).selectOption("M");
await page.locator(".cria-sexo").nth(1).selectOption("H");
await page.locator(".cria-colorplaca").nth(0).fill("Verde");
await tap('[data-action="guardar-camada"]');
await page.waitForTimeout(500);
const total = await page.evaluate(async () => (await DB.getAllEjemplares()).length);
const crias = await page.evaluate(async () => (await DB.getAllEjemplares()).filter((e) => e.camadaId).length);
ok("Camada registra 3 crías con padre, madre y fecha", total - antesCamada === 3 && crias === 3, `antes=${antesCamada} despues=${total}`);
await page.screenshot({ path: path.join(OUT, "01-inicio.png") });

// 4. Árbol desde una cría
await page.locator("#lista-resultados [data-action='ficha']", { hasText: "#201" }).first().click();
await page.waitForTimeout(400);
await tap('[data-action="arbol"]');
await page.waitForTimeout(400);
const nodos = await page.locator(".fam-frame").count();
const lineas = await page.locator(".tree-line").count();
ok("Árbol muestra la familia (5 nodos, 6 líneas)", nodos === 5 && lineas === 6, `nodos=${nodos} lineas=${lineas}`);
await page.screenshot({ path: path.join(OUT, "02-arbol.png") });

// 5. Foto desde galería en la ficha del padre
await page.goto(BASE); await page.waitForTimeout(300);
await page.locator("#lista-resultados [data-action='ficha']", { hasText: "#101" }).first().click();
await page.waitForTimeout(400);
const fichaUrl = page.url();
await tap('[data-action="agregar-foto-menu"]');
const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.locator('[data-action="disparar-galeria"]').click()]);
await chooser.setFiles(path.join(DIR, "foto-prueba.jpg"));
await page.waitForSelector("#nueva-foto-fecha", { timeout: 5000 });
const fechaDefecto = await page.locator("#nueva-foto-fecha").inputValue();
ok("La fecha propuesta para la foto es la de hoy en Lima (2026-10-01)", fechaDefecto === "2026-10-01", `propuesta=${fechaDefecto}`);
await fill("#nueva-foto-fecha", "2026-09-20");
await tap('[data-action="confirmar-fecha-nueva-foto"]');
await page.waitForTimeout(600);
const fotos = await page.locator(".timeline-item").count();
const tamano = await page.evaluate(async () => { const all = await DB.getAllEjemplares(); const e = all.find((x) => x.placa === "101"); return e.fotos[0] ? e.fotos[0].dataUrl.length : 0; });
ok("La foto se guarda comprimida en la ficha", fotos === 1 && tamano > 0 && tamano < 200000, `fotos=${fotos} dataUrl=${Math.round(tamano / 1024)} KB`);
await page.screenshot({ path: path.join(OUT, "03-ficha.png") });
const desborde = await page.evaluate(() => { const card = document.querySelector(".ficha-sheet").getBoundingClientRect(); return [...document.querySelectorAll(".data-box")].map((b) => Math.round(b.getBoundingClientRect().right - card.right)); });
ok("Las cajas de datos de la ficha no se salen de la tarjeta", desborde.every((d) => d <= 0), `exceso px=${desborde.join(",")}`);
// ¿Se puede borrar una foto? (con el tope de 8 sin borrar, la ficha se bloquea)
await page.locator(".timeline-item").first().click(); await page.waitForTimeout(300);
ok("El modal de la foto permite eliminarla", await page.locator('[data-action="eliminar-foto"]').count() > 0);
await page.keyboard.press("Escape"); await page.waitForTimeout(200);
const modalAbierto = await page.locator("#modal-backdrop.open").count();
ok("Escape cierra el modal", modalAbierto === 0);
if (modalAbierto) await page.evaluate(() => document.getElementById("modal-backdrop").classList.remove("open"));

// 6. Marcar como fallecido
await page.goto(BASE); await page.waitForTimeout(300);
await page.locator("#lista-resultados [data-action='ficha']", { hasText: "#203" }).first().click();
await page.waitForTimeout(400);
await tap('[data-action="cambiar-estado"]');
await page.selectOption("#estado-select", "fallecido");
await tap('[data-action="guardar-estado"]');
await page.waitForTimeout(400);
ok("Ficha muestra estado Fallecido", (await page.locator(".hero-estado").textContent()).includes("Fallecido"));
await page.goto(BASE); await page.waitForTimeout(400);
const totalEj = await page.evaluate(async () => (await DB.getAllEjemplares()).length);
const vivos = await page.locator("#lista-resultados [data-action='ficha']").count();
await tap('.chip[data-filter="fallecido"]');
const fallecidos = await page.locator("#lista-resultados [data-action='ficha']").count();
ok("Fallecido no desaparece: sale del filtro Vivos y aparece en Fallecidos", vivos === totalEj - 1 && fallecidos === 1, `vivos=${vivos} fallecidos=${fallecidos}`);
await tap('.chip[data-filter="vivo"]');

// 7. Pendientes: uno para hoy a las 20:30
await page.goto(BASE + "#/pendientes"); await page.waitForTimeout(300);
await tap('[data-action="agregar-pendiente-form"]');
await fill("#p-texto", "Vacuna triple de la camada");
await fill("#p-fecha", "2026-10-01");
await tap('[data-action="guardar-pendiente"]');
await page.waitForTimeout(400);
const sub = await page.locator(".pendiente-item .sub").first().textContent();
ok("Un pendiente con fecha de hoy dice «Es hoy»", sub.trim() === "Es hoy", `dice="${sub.trim()}"`);
await page.screenshot({ path: path.join(OUT, "04-pendientes.png") });

// 8. Respaldo
await page.goto(BASE + "#/ajustes"); await page.waitForTimeout(400);
const [descarga] = await Promise.all([page.waitForEvent("download"), page.locator('[data-action="exportar"]').click()]);
const rutaResp = path.join(OUT, descarga.suggestedFilename());
await descarga.saveAs(rutaResp);
const resp = JSON.parse(fs.readFileSync(rutaResp, "utf8"));
ok("El respaldo descargado tiene todos los ejemplares y el pendiente", resp.ejemplares.length === totalEj && resp.pendientes.length === 1, `${descarga.suggestedFilename()} ejemplares=${resp.ejemplares.length}/${totalEj}`);
// Importar un archivo inválido
const malo = path.join(OUT, "malo.json");
fs.writeFileSync(malo, JSON.stringify({ ejemplares: [{ placa: "999" }] }));
const [ch2] = await Promise.all([page.waitForEvent("filechooser"), page.locator('[data-action="importar-file"]').click()]);
await ch2.setFiles(malo); await page.waitForTimeout(400);
let rechazado = (await page.locator("#modal-backdrop.open").count()) === 0;
if (!rechazado) { await tap('[data-action="importar-modo"][data-modo="reemplazar"]'); await page.waitForTimeout(600); }
const trasMalo = await page.evaluate(async () => (await DB.getAllEjemplares()).length);
ok("Un respaldo con registros sin id no borra los datos actuales", trasMalo === totalEj, `rechazado-al-leer=${rechazado} ejemplares-tras-importar=${trasMalo}`);
const modalTrasError = await page.locator("#modal-backdrop.open").count();
ok("Si la restauración falla, el modal se cierra", modalTrasError === 0);
await page.goto(BASE + "#/inicio"); await page.waitForTimeout(300);
await page.goto(BASE + "#/ajustes"); await page.waitForTimeout(400);
// Restaurar el bueno con «Reemplazar todo»
const [ch3] = await Promise.all([page.waitForEvent("filechooser"), page.locator('[data-action="importar-file"]').click()]);
await ch3.setFiles(rutaResp); await page.waitForTimeout(400);
await tap('[data-action="importar-modo"][data-modo="reemplazar"]');
await page.waitForTimeout(800);
const trasBueno = await page.evaluate(async () => (await DB.getAllEjemplares()).length);
ok("Restaurar el respaldo bueno deja todos los ejemplares", trasBueno === totalEj, `ejemplares=${trasBueno}`);

// 9. Recarga y persistencia
await page.reload(); await page.waitForSelector(".stats-row"); await page.waitForTimeout(400);
const tarjetasTrasRecarga = await page.locator("#lista-resultados [data-action='ficha']").count();
ok("Tras recargar siguen los datos", tarjetasTrasRecarga === totalEj - 1, `vivos visibles=${tarjetasTrasRecarga}`);
const persist = await page.evaluate(async () => ({ pedido: !!window.__persistPedido, concedido: await navigator.storage.persisted() }));
ok("Se pidió almacenamiento persistente", persist.pedido || persist.concedido, JSON.stringify(persist));

// 10. Offline con el service worker
const controlado = await page.evaluate(() => !!navigator.serviceWorker.controller);
await context.setOffline(true);
await page.reload(); await page.waitForTimeout(1200);
const offlineOk = await page.locator(".stats-row").count();
const tarjetasOffline = await page.locator("#lista-resultados [data-action='ficha']").count();
ok("Sin conexión la app abre y muestra los datos", controlado && offlineOk === 1 && tarjetasOffline === totalEj - 1, `controlado=${controlado} tarjetas=${tarjetasOffline}`);
const imgVacia = await page.evaluate(async () => { const r = await caches.match("./icons/vacio.png") || await caches.match("icons/vacio.png"); return !!r; });
ok("Sin conexión las ilustraciones están en caché", imgVacia);
await page.goto(BASE + "#/ajustes"); await page.waitForTimeout(800);
const mascota = await page.evaluate(() => { const i = document.querySelector(".acerca-mascota"); return i && i.complete && i.naturalWidth > 0 && i.style.display !== "none"; });
ok("Sin conexión se ve la mascota en Ajustes", mascota);
await context.setOffline(false);

// 11. Accesibilidad básica
await page.goto(BASE); await page.waitForTimeout(400);
const a11y = await page.evaluate(() => {
  const vp = document.querySelector('meta[name="viewport"]').content;
  const chipsFocus = [...document.querySelectorAll(".chip")].every((c) => c.tabIndex >= 0);
  const tarjetasFocus = [...document.querySelectorAll("#lista-resultados [data-action='ficha']")].every((c) => c.tabIndex >= 0);
  const buscador = document.getElementById("search-input");
  const buscadorLabel = !!(buscador.getAttribute("aria-label") || buscador.labels?.length);
  return { zoom: !/maximum-scale=1|user-scalable=no/.test(vp), chipsFocus, tarjetasFocus, buscadorLabel };
});
ok("El zoom del navegador no está bloqueado", a11y.zoom);
ok("Los filtros y las tarjetas se alcanzan con teclado", a11y.chipsFocus && a11y.tarjetasFocus, JSON.stringify(a11y));
ok("El buscador tiene nombre accesible", a11y.buscadorLabel);
await page.locator("#lista-resultados [data-action='ficha']").first().focus();
await page.keyboard.press("Enter"); await page.waitForTimeout(400);
ok("Enter sobre una tarjeta abre la ficha", page.url().includes("#/ficha/"), page.url());
await page.goto(BASE + "#/nuevo"); await page.waitForTimeout(300);
const labels = await page.evaluate(() => [...document.querySelectorAll(".field label")].filter((l) => !l.control).map((l) => l.textContent.trim()));
ok("Las etiquetas del formulario están asociadas a su campo", labels.length === 0, labels.join(", "));

ok("Sin errores de consola", consola.length === 0, consola.slice(0, 6).join(" | "));
fs.writeFileSync(path.join(OUT, "resultados.json"), JSON.stringify({ resultados, consola }, null, 2));
const fallos = resultados.filter((r) => !r.ok).length;
console.log(`\n${resultados.length - fallos}/${resultados.length} pasan`);
await browser.close();
process.exitCode = resultados.some((r) => !r.ok) ? 1 : 0;
