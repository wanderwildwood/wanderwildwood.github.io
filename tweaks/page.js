import {
  Adb, AdbDaemonTransport, AdbDaemonWebUsbDeviceManager, AdbDaemonWebUsbDevice, AdbWebCredentialStore,
} from "./adb.js";
import * as L from "./lib.js";
import { APPS, STOCK, NAMES } from "./apps.js";

const SHELL_BROWSER = "org.chromium.webview_shell";
const DURASPEED = "com.mediatek.duraspeed";
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const sec = (id) => document.getElementById(id);
const nameOf = (p) => NAMES[p] || p;

let adb = null;

// ---- small page helpers ------------------------------------------------------------------

function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids) if (k) e.append(k);
  return e;
}

function say(section, text, bad = false) {
  const o = $("[data-out]", section);
  if (!o) return;
  o.textContent = text || "";
  o.hidden = !text;
  o.classList.toggle("bad", bad);
}

function setState(section, text, on = false) {
  const s = $("[data-state]", section);
  s.textContent = text;
  s.classList.toggle("on", on);
}

function setStatus(text) { $("#status").textContent = text; }

// Every button that changes something is off while not connected and while a change is running.
let running = false;
function lockAll(lock) {
  running = lock;
  for (const b of $$("main button.act, main input, main select")) {
    if (b.id === "connect-btn") continue;
    b.disabled = lock || !adb || b.dataset.never === "1";
  }
}

async function sh(command) {
  const sp = adb.subprocess.shellProtocol;
  if (sp && sp.isSupported) {
    const r = await sp.spawnWaitText(command);
    return { out: (r.stdout || "") + (r.stderr || ""), code: r.exitCode };
  }
  return { out: await adb.subprocess.noneProtocol.spawnWaitText(command), code: 0 };
}

// Run a change: lock the page, run it, show what the phone said if it was unhappy, re-read.
async function change(section, commands, after, check = () => true) {
  if (!adb || running) return;
  lockAll(true);
  say(section, "");
  try {
    for (const c of [].concat(commands)) {
      const r = await sh(c);
      if (r.code !== 0 || !check(r.out)) {
        say(section, `The phone answered:\n${r.out.trim() || "exit " + r.code}\n(from: ${c})`, true);
        break;
      }
    }
  } catch (e) {
    say(section, "That didn't go through: " + (e && e.message ? e.message : e), true);
  }
  try { await after(); } catch (e) { say(section, "Couldn't read it back: " + e.message, true); }
  lockAll(false);
}

// ---- 1. hidden browser -------------------------------------------------------------------

async function readBrowser() {
  const s = sec("browser"), b = $("[data-act]", s);
  const there = L.parsePackages((await sh(L.cmd.installed(SHELL_BROWSER))).out).has(SHELL_BROWSER);
  if (!there) {
    setState(s, "This phone has no hidden browser.");
    b.hidden = true; b.dataset.never = "1";
    return;
  }
  b.hidden = false; b.dataset.never = "";
  const off = L.parsePackages((await sh(L.cmd.disabled())).out).has(SHELL_BROWSER);
  const link = L.parseLinkHandler((await sh(L.cmd.linkHandler())).out);
  const where = link.kind === "app" ? `Web links open in ${nameOf(link.pkg)}.`
    : link.kind === "ask" ? "Web links ask which browser to use."
    : "Web links open nothing: no browser is installed.";
  setState(s, (off ? "Switched off. " : "Switched on. ") + where, !off);
  b.textContent = off ? "Switch it back on" : "Switch it off";
  b.onclick = () => change(s, off ? L.cmd.unhide(SHELL_BROWSER) : L.cmd.hide(SHELL_BROWSER), readBrowser);
}

// ---- 2. installing -----------------------------------------------------------------------

let versions = new Map();
const latest = new Map();   // repo -> tag, from GitHub's API, which does allow other sites

function renderApps() {
  const s = sec("install"), list = $("[data-list]", s);
  list.replaceChildren(...APPS.map((a) => {
    const v = versions.get(a.pkg);
    const tag = latest.get(a.repo);
    let state = adb ? (v ? `${v} installed` : "Not installed") : "";
    if (v && tag && L.isNewer(tag, v)) state += `; ${tag.replace(/^v/, "").replace(/-.*/, "")} is out`;
    return el("li", {},
      el("span", { class: "who" },
        el("span", { class: "name", text: a.name }),
        el("span", { class: "line", text: a.line })),
      el("span", { class: "state" + (v ? " on" : ""), text: state }),
      el("a", {
        href: `https://github.com/wanderwildwood/${a.repo}/releases/latest/download/${a.asset}`,
        text: v ? "Download update" : "Download",
      }));
  }));
}

async function readVersions() {
  versions = L.parseVersions((await sh(L.cmd.versions())).out);
  renderApps();
  // The newest release of every app, not only those installed, so the requests say nothing
  // about the phone. One API call each, kept for this visit.
  for (const a of APPS) {
    if (latest.has(a.repo)) continue;
    let tag = null;
    try { tag = sessionStorage.getItem("tag:" + a.repo); } catch (e) {}
    if (!tag) {
      try {
        const r = await fetch(`https://api.github.com/repos/wanderwildwood/${a.repo}/releases/latest`);
        if (!r.ok) break;   // out of the hourly allowance; versions still show
        tag = (await r.json()).tag_name;
        try { sessionStorage.setItem("tag:" + a.repo, tag); } catch (e) {}
      } catch (e) { break; }
    }
    if (tag) latest.set(a.repo, tag);
  }
  renderApps();
}

const INSTALL_WHY = {
  INSTALL_FAILED_UPDATE_INCOMPATIBLE:
    "A copy signed by someone else is already installed. Uninstalling it first would delete its data.",
  INSTALL_FAILED_VERSION_DOWNGRADE: "A newer version is already installed.",
  INSTALL_PARSE_FAILED_NOT_APK: "That file isn't an Android app.",
  INSTALL_FAILED_INSUFFICIENT_STORAGE: "The phone is out of space.",
  INSTALL_FAILED_OLDER_SDK: "The app needs a newer Android than this phone has.",
};

async function installFile(file) {
  const s = sec("install"), box = $("[data-drop]", s);
  if (!adb || running) return;
  if (!/\.apk$/i.test(file.name)) { say(box, "That isn't an .apk file.", true); return; }
  lockAll(true);
  const remote = `/data/local/tmp/tweaks-${Date.now()}.apk`;
  say(box, `Copying ${file.name} to the phone…`);
  try {
    const sync = await adb.sync();
    try {
      await sync.write({ filename: remote, file: file.stream(), permission: 0o644 });
    } finally { await sync.dispose(); }
    say(box, `Installing ${file.name}…`);
    const r = await sh(L.cmd.install(remote));
    const res = L.installResult(r.out);
    if (res.ok) say(box, `${file.name} is installed.`);
    else say(box, (`Android refused ${file.name}. ${INSTALL_WHY[res.code] || ""}`.trim() + `\n${res.reason}`), true);
  } catch (e) {
    say(box, "That didn't go through: " + (e && e.message ? e.message : e), true);
  }
  try { await sh(L.cmd.removeTemp(remote)); } catch (e) {}
  try { await readVersions(); } catch (e) {}
  lockAll(false);
}

function wireDrop() {
  const box = $("#install [data-drop]"), input = $("[data-file]", box);
  input.addEventListener("change", () => { if (input.files[0]) installFile(input.files[0]); input.value = ""; });
  box.addEventListener("dragover", (e) => { e.preventDefault(); box.classList.add("over"); });
  box.addEventListener("dragleave", () => box.classList.remove("over"));
  box.addEventListener("drop", (e) => {
    e.preventDefault(); box.classList.remove("over");
    const f = e.dataTransfer.files[0];
    if (!adb) { say(box, "Connect the phone first.", true); return; }
    if (f) installFile(f);
  });
}

// ---- 3. background -----------------------------------------------------------------------

async function readBackground() {
  const s = sec("background"), list = $("[data-list]", s);
  const apps = [...L.parsePackages((await sh(L.cmd.thirdParty())).out)];
  const allowed = L.parseAllowList((await sh(L.cmd.allowList())).out);
  apps.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  if (!apps.length) { list.replaceChildren(el("li", { class: "empty", text: "No apps of your own are installed." })); return; }
  list.replaceChildren(...apps.map((p) => {
    const on = allowed.user.has(p) || allowed.system.has(p);
    const fixed = allowed.system.has(p) && !allowed.user.has(p);
    const b = el("button", {
      type: "button", class: "act", text: on ? "Hold back again" : "Let it run",
      onclick: () => change(s, on ? L.cmd.disallow(p) : L.cmd.allow(p), readBackground),
    });
    if (fixed) { b.hidden = true; b.dataset.never = "1"; }
    return el("li", {},
      el("span", { class: "who" },
        el("span", { class: "name", text: nameOf(p) }),
        NAMES[p] ? el("span", { class: "pkg", text: p }) : null),
      el("span", { class: "state" + (on ? " on" : ""), text: fixed ? "Let through by the phone" : on ? "Let through" : "Held back" }),
      b);
  }));
  const dura = L.parsePackages((await sh(L.cmd.installed(DURASPEED))).out).has(DURASPEED);
  const db = $("[data-dura]", s);
  db.dataset.never = dura ? "" : "1";
  db.hidden = !dura;
  db.onclick = () => change(s, L.cmd.openDuraSpeed(), async () => {
    say(s, "DuraSpeed's App info is open on the phone: press Open, then switch the app on.");
  }, (out) => !/Error/i.test(out));
}

// ---- 4. defaults -------------------------------------------------------------------------

const ROLE_LABEL = { sms: "Texting", dialer: "Phone calls", home: "Home screen", browser: "Web links" };
const before = {};   // role -> holder when the page first read it, to make going back easy

async function readDefaults() {
  const s = sec("defaults"), list = $("[data-list]", s);
  const holders = L.parseRoles((await sh(L.cmd.roles())).out);
  const rows = [];
  for (const [key, role] of Object.entries(L.ROLES)) {
    const outs = [];
    for (const q of role.queries) outs.push((await sh(q)).out);
    const can = L.qualifying(key, outs);
    const now = (holders.get(role.name) || [])[0] || "";
    if (!(key in before)) before[key] = now;
    const pick = el("select", { "aria-label": ROLE_LABEL[key] },
      ...can.map((p) => el("option", { value: p, text: nameOf(p), selected: p === now })));
    const set = el("button", {
      type: "button", class: "act", text: "Use this",
      onclick: () => change(s, L.cmd.setRole(key, pick.value), readDefaults),
    });
    if (!can.length) { pick.hidden = set.hidden = true; pick.dataset.never = set.dataset.never = "1"; }
    const was = before[key] && before[key] !== now ? `It was ${nameOf(before[key])}.` : "";
    rows.push(el("li", {},
      el("span", { class: "who" },
        el("span", { class: "name", text: ROLE_LABEL[key] }),
        el("span", { class: "line", text: (now ? `Now ${nameOf(now)}.` : "None chosen.") + (was ? " " + was : "") })),
      can.length ? pick : el("span", { class: "state", text: "No app here can do this." }),
      set));
  }
  list.replaceChildren(...rows);
  return holders;
}

// ---- 5. stock apps -----------------------------------------------------------------------

async function readStock() {
  const s = sec("stock"), list = $("[data-list]", s);
  const all = L.parsePackages((await sh("pm list packages com.mudita")).out);
  const off = L.parsePackages((await sh(L.cmd.disabled())).out);
  const holders = L.parseRoles((await sh(L.cmd.roles())).out);
  const items = STOCK.filter((a) => all.has(a.pkg));
  if (!items.length) { list.replaceChildren(el("li", { class: "empty", text: "None of Mudita's apps are on this phone." })); return; }
  list.replaceChildren(...items.map((a) => {
    const hidden = off.has(a.pkg);
    const held = a.gate && (holders.get(L.ROLES[a.gate].name) || []).includes(a.pkg);
    const b = el("button", {
      type: "button", class: "act", text: hidden ? "Bring back" : "Hide",
      onclick: () => change(s, hidden ? L.cmd.unhide(a.pkg) : L.cmd.hide(a.pkg), readStock),
    });
    if (held && !hidden) b.dataset.never = "1";
    else b.dataset.never = "";
    return el("li", {},
      el("span", { class: "who" }, el("span", { class: "name", text: a.name })),
      el("span", { class: "state" + (hidden ? "" : " on"), text: hidden ? "Hidden" : "Shown" }),
      b,
      a.note ? el("span", { class: "note", text: a.note }) : null);
  }));
}

// ---- 6. animations -----------------------------------------------------------------------

async function readAnimations() {
  const s = sec("animations"), b = $("[data-act]", s);
  const a = L.parseAnimations((await sh(L.cmd.animations())).out);
  setState(s, a.state === "off" ? "Off." : a.state === "on" ? "On." : `Partly off (${a.values.join(", ")}).`, a.state !== "off");
  b.textContent = a.state === "off" ? "Turn them back on" : "Turn them off";
  b.onclick = () => change(s, L.cmd.setAnimations(a.state === "off"), readAnimations);
}

// ---- 9. private DNS ----------------------------------------------------------------------

async function readDns() {
  const s = sec("dns");
  const d = L.parseDns((await sh(L.cmd.dns())).out);
  setState(s, d.mode === "opportunistic" ? "Automatic: encrypted when the network's own server allows it."
    : d.mode === "off" ? "Off."
    : d.mode === "hostname" ? `Using ${d.host || "a server with no name set"}.` : d.mode, d.mode === "hostname");
  const host = $("[data-host]", s);
  if (d.host && !host.value) host.value = d.host;
}

function wireDns() {
  const s = sec("dns");
  $("[data-dns=auto]", s).onclick = () => change(s, L.cmd.dnsAutomatic(), readDns);
  $("[data-dns=off]", s).onclick = () => change(s, L.cmd.dnsOff(), readDns);
  $("[data-dns=host]", s).onclick = () => {
    const h = $("[data-host]", s).value.trim();
    if (!L.isHostname(h)) { say(s, "That isn't a hostname, such as dns.quad9.net.", true); return; }
    change(s, L.cmd.dnsHost(h), readDns);
  };
}

// ---- connecting --------------------------------------------------------------------------

async function readAll() {
  const steps = [readBrowser, readVersions, readBackground, readDefaults, readStock, readAnimations, readDns];
  for (const f of steps) {
    try { await f(); } catch (e) { console.error(e); }
  }
}

function placeholders() {
  renderApps();
  for (const id of ["defaults", "stock", "background"]) {
    $(`#${id} [data-list]`).replaceChildren(el("li", { class: "empty", text: "Connect to see what is on the phone." }));
  }
  for (const id of ["browser", "animations", "dns"]) setState(sec(id), "—");
}

function disconnected() {
  adb = null;
  setStatus("Not connected.");
  $("#connect-btn").textContent = "Connect";
  placeholders();
  lockAll(false);
}

async function connect() {
  const btn = $("#connect-btn");
  if (adb) { try { await adb.close(); } catch (e) {} disconnected(); return; }
  const manager = AdbDaemonWebUsbDeviceManager.BROWSER;
  let device;
  try { device = await manager.requestDevice(); } catch (e) { setStatus("No phone chosen."); return; }
  if (!device) { setStatus("No phone chosen."); return; }
  btn.disabled = true;
  setStatus("Allow USB debugging on the phone's screen if it asks…");
  try {
    let connection;
    try { connection = await device.connect(); }
    catch (e) {
      if (e instanceof AdbDaemonWebUsbDevice.DeviceBusyError) {
        setStatus("Something on this computer already holds the phone, usually adb. Run adb kill-server and press Connect again.");
      } else setStatus("Couldn't open the phone: " + (e && e.message ? e.message : e));
      return;
    }
    const transport = await AdbDaemonTransport.authenticate({
      serial: device.serial, connection, credentialStore: new AdbWebCredentialStore("wanderthe.dev"),
    });
    adb = new Adb(transport);
    transport.disconnected.then(disconnected, disconnected);
    const model = (await sh("getprop ro.product.model")).out.trim();
    const sdk = parseInt((await sh("getprop ro.build.version.sdk")).out, 10);
    setStatus(`Connected to ${model || "the phone"}.` +
      (sdk === 31 ? "" : " This page was made for the Kompakt's Android 12; on this phone some of it may not apply."));
    btn.textContent = "Disconnect";
    lockAll(true);
    await readAll();
    lockAll(false);
  } catch (e) {
    adb = null;
    setStatus("Couldn't connect: " + (e && e.message ? e.message : e));
  } finally {
    btn.disabled = false;
  }
}

// ---- start -------------------------------------------------------------------------------

placeholders();
wireDrop();
wireDns();
lockAll(false);
if (!("usb" in navigator) || !AdbDaemonWebUsbDeviceManager.BROWSER) {
  $("#nousb").hidden = false;
  $("#connect-btn").disabled = true;
  setStatus("Can't connect from this browser.");
} else {
  $("#connect-btn").addEventListener("click", connect);
}
