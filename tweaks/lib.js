// What the page runs on the phone, and how it reads the answers. Nothing here touches the page
// or the cable, so it can be checked on its own.

// A package name, as Android allows it. Anything else never reaches a shell line.
const PKG = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/;
export const isPackage = (s) => typeof s === "string" && PKG.test(s);

function pkg(p) {
  if (!isPackage(p)) throw new Error("not a package name: " + p);
  return p;
}

// A hostname for private DNS: letters, digits and hyphens in dot-separated labels.
const HOST = /^(?=.{1,253}$)([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;
export const isHostname = (s) => typeof s === "string" && HOST.test(s);

export const cmd = {
  disabled: () => "pm list packages -d",
  installed: (p) => `pm list packages ${pkg(p)}`,
  thirdParty: () => "pm list packages -3",
  hide: (p) => `pm disable-user --user 0 ${pkg(p)}`,
  unhide: (p) => `pm enable --user 0 ${pkg(p)}`,
  versions: () => "dumpsys package packages | grep -E '^  Package \\[|^    versionName='",
  linkHandler: () =>
    "cmd package resolve-activity --brief -a android.intent.action.VIEW " +
    "-c android.intent.category.BROWSABLE -d https://example.com",
  allowList: () => "dumpsys deviceidle whitelist",
  allow: (p) => `dumpsys deviceidle whitelist +${pkg(p)}`,
  disallow: (p) => `dumpsys deviceidle whitelist -${pkg(p)}`,
  roles: () => "dumpsys role",
  setRole: (role, p) => `cmd role add-role-holder ${ROLES[role].name} ${pkg(p)}`,
  animations: () => ANIMATION_KEYS.map((k) => `settings get global ${k}`).join("; "),
  setAnimations: (v) => ANIMATION_KEYS.map((k) => `settings put global ${k} ${v ? 1 : 0}`).join("; "),
  dns: () => "settings get global private_dns_mode; settings get global private_dns_specifier",
  dnsAutomatic: () => "settings delete global private_dns_mode",
  dnsOff: () => "settings put global private_dns_mode off",
  dnsHost: (h) => {
    if (!isHostname(h)) throw new Error("not a hostname: " + h);
    return `settings put global private_dns_specifier ${h}; settings put global private_dns_mode hostname`;
  },
  openDuraSpeed: () =>
    "am start -a android.settings.APPLICATION_DETAILS_SETTINGS -d package:com.mediatek.duraspeed",
  install: (remote) => `pm install -r ${remote}`,
  removeTemp: (remote) => `rm -f ${remote}`,
};

export const ANIMATION_KEYS = [
  "window_animation_scale",
  "transition_animation_scale",
  "animator_duration_scale",
];

// The four defaults, each with the queries that find the apps able to hold it. Android 12's
// `cmd role` can add a holder but has no way to read one; `dumpsys role` reads them.
export const ROLES = {
  sms: {
    name: "android.app.role.SMS",
    queries: [
      "cmd package query-activities --components -a android.intent.action.SENDTO -d smsto:1",
      "cmd package query-receivers --components -a android.provider.Telephony.SMS_DELIVER",
    ],
  },
  dialer: {
    name: "android.app.role.DIALER",
    queries: [
      "cmd package query-activities --components -a android.intent.action.DIAL -d tel:1",
      "cmd package query-services --components -a android.telecom.InCallService",
    ],
  },
  home: {
    name: "android.app.role.HOME",
    queries: [
      "cmd package query-activities --components -a android.intent.action.MAIN -c android.intent.category.HOME",
    ],
  },
  browser: {
    name: "android.app.role.BROWSER",
    queries: [
      "cmd package query-activities --components -a android.intent.action.VIEW " +
        "-c android.intent.category.BROWSABLE -d https://example.com",
    ],
  },
};

// Not offered as homes: Settings' "Phone is starting" screen and the setup wizard.
const NOT_HOMES = new Set(["com.android.settings", "com.mudita.onboarding"]);

// "package:com.x" lines, with or without " versionCode:N" after them.
export function parsePackages(text) {
  const out = new Set();
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^package:([^\s]+)/.exec(line.trim());
    if (m && isPackage(m[1])) out.add(m[1]);
  }
  return out;
}

// "com.x/.Cls" or "com.x/com.x.Cls" lines → the packages.
export function parseComponents(text) {
  const out = new Set();
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^([A-Za-z][\w.]*)\/[\w.$]+$/.exec(line.trim());
    if (m && isPackage(m[1])) out.add(m[1]);
  }
  return out;
}

// The packages every query returned: an app qualifies for a role only if it answers them all.
export function qualifying(role, outputs) {
  let set = null;
  for (const o of outputs) {
    const s = parseComponents(o);
    set = set === null ? s : new Set([...set].filter((p) => s.has(p)));
  }
  set = set || new Set();
  if (role === "home") for (const p of NOT_HOMES) set.delete(p);
  return [...set].sort();
}

// `dumpsys package packages` filtered to its Package [..] and versionName= lines. The first
// versionName after a package's line is its own; a later "Hidden system packages" copy is not.
export function parseVersions(text) {
  const out = new Map();
  let cur = null;
  for (const line of String(text).split(/\r?\n/)) {
    const p = /^\s*Package \[([^\]]+)\]/.exec(line);
    if (p) { cur = p[1]; continue; }
    const v = /^\s*versionName=(.*)$/.exec(line);
    if (v && cur && !out.has(cur)) out.set(cur, v[1].trim());
    if (v) cur = null;
  }
  return out;
}

// `dumpsys deviceidle whitelist`: "user,com.x,10123" lines can be changed here; "system" and
// "system-excidle" ones are the phone's own and cannot.
export function parseAllowList(text) {
  const user = new Set(), system = new Set();
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^(user|system|system-excidle),([^,\s]+),/.exec(line.trim());
    if (!m || !isPackage(m[2])) continue;
    (m[1] === "user" ? user : system).add(m[2]);
  }
  return { user, system };
}

// `dumpsys role`: "name=android.app.role.X" then, if anyone holds it, "holders=a,b". Only the
// first user (the phone's owner) is read.
export function parseRoles(text) {
  const out = new Map();
  let cur = null, users = 0;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (/^user_id=/.test(line) && ++users > 1) break;
    const n = /^name=(\S+)$/.exec(line);
    if (n) { cur = n[1]; out.set(cur, []); continue; }
    const h = /^holders=(.*)$/.exec(line);
    if (h && cur) out.set(cur, h[1].split(",").map((s) => s.trim()).filter(isPackage));
  }
  return out;
}

// `cmd package resolve-activity --brief`: the last line is the component links go to. With
// more than one browser and none chosen it is Android's chooser; with none, nothing.
export function parseLinkHandler(text) {
  const lines = String(text).trim().split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const last = lines[lines.length - 1] || "";
  if (/No activity found/i.test(text) || !last.includes("/")) return { kind: "none" };
  const p = last.split("/")[0];
  if (p === "android" || /ResolverActivity|ChooserActivity/.test(last)) return { kind: "ask" };
  return isPackage(p) ? { kind: "app", pkg: p } : { kind: "none" };
}

// Three lines from `settings get global`, "null" meaning never set (Android's default, 1).
export function parseAnimations(text) {
  const vals = String(text).trim().split(/\r?\n/).map((s) => s.trim());
  const nums = ANIMATION_KEYS.map((_, i) => {
    const v = vals[i];
    return v === undefined || v === "" || v === "null" ? 1 : Number(v);
  });
  const off = nums.every((n) => n === 0);
  const on = nums.every((n) => n !== 0 && !Number.isNaN(n));
  return { values: nums, state: off ? "off" : on ? "on" : "mixed" };
}

// private_dns_mode: null (never set) is Android's default, opportunistic.
export function parseDns(text) {
  const [mode = "null", host = "null"] = String(text).trim().split(/\r?\n/).map((s) => s.trim());
  const m = mode === "null" || mode === "" ? "opportunistic" : mode;
  return { mode: m, host: host === "null" ? "" : host };
}

// `pm install` ends with "Success" or a "Failure [REASON]" line.
export function installResult(text) {
  const t = String(text);
  if (/^Success\s*$/m.test(t)) return { ok: true };
  const m = /Failure \[([^\]]+)\]/.exec(t);
  const reason = m ? m[1] : t.trim().split(/\r?\n/).pop() || "no answer";
  return { ok: false, reason, code: reason.split(":")[0].trim() };
}

// "1.2.10" against "v1.2.9": is the release newer than what is installed?
export function isNewer(release, installed) {
  const a = String(release).replace(/^v/, "").split(/[.-]/).map((n) => parseInt(n, 10));
  const b = String(installed).split(/[.-]/).map((n) => parseInt(n, 10));
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = Number.isNaN(a[i]) || a[i] === undefined ? 0 : a[i];
    const y = Number.isNaN(b[i]) || b[i] === undefined ? 0 : b[i];
    if (x !== y) return x > y;
  }
  return false;
}
