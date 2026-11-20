#!/usr/bin/env python3
"""Writes apps.json, the list of the house's apps that Home's "Your apps" page reads from
https://wanderthe.dev/apps.json.

    _tools/apps-manifest.py            # write apps.json at the top of this repository
    _tools/apps-manifest.py --dry-run  # print it instead
    _tools/apps-manifest.py --staged FILE   # releases staged but not out yet (see below)

For each app in the list below (the core set and the extras from Home's MAKEOVER-PLAN.md, "The
package") and each app Home hands its Nextcloud account to (IoriAccount.CALLERS in Home's
source, read from its main branch), it:
  - finds the app's card on index.html (name, repository, first sentence as the summary),
  - asks GitHub for the repository's latest release (`gh release view`) and skips the app when
    that release has no APK,
  - downloads the APK (`gh release download`) and reads from it the package, version, minimum
    Android, its SHA-256 and size, and the SHA-256 of its signing certificate (aapt2, apksigner).

An APK signed by more than one certificate, or by another certificate than the one Home pins for
it, is left out with a warning: Home would refuse it anyway. The APK link is the release's own
(the tag in the address), so the SHA-256 stays true when a newer release comes out; run this
again after each release.

--staged FILE is for writing the list before a batch of releases goes out, so the site and the
releases can go live together. FILE is JSON, kept out of this repository:

    {"apps": [{"repo": "garo", "tag": "v0.8.28", "apk": "/path/to/the/staged/garo.apk",
               "versionName": "0.8.28", "versionCode": 53, "sha256": "...", "certSha256": "...",
               "size": 3722052}, ...]}

For each app named there, the staged APK on disk is read instead of the latest release (the same
checks: one certificate, Home's pin, the size), it must agree with every value the file gives, and
its link is the one the release will have: .../<repo>/releases/download/<tag>/<repo>.apk, the
same form as the published ones. Every other app is as published. Once the releases are out, run
it again without --staged: the result must be the same file (git diff apps.json shows nothing).

Downloads are kept out of the repository (in ~/.cache/apps-manifest), and what was read from
each one is remembered by its address, size and upload time, so a second run downloads only
what changed. Needs gh signed in, and the Android SDK's build-tools.
"""
import glob, hashlib, html, json, os, re, subprocess, sys, tempfile

OWNER = "wanderwildwood"
SITE = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
OUT = os.path.join(SITE, "apps.json")
PROJECTS = os.environ.get("PROJECTS", "/opt/projects")
# Home's pins are read from its repository at this branch (git show), whatever is checked out.
HOME_REPO = os.environ.get("HOME_REPO", f"{PROJECTS}/iori")
HOME_REF = os.environ.get("HOME_REF", "main")
CACHE = os.path.expanduser(os.environ.get("APPS_MANIFEST_CACHE", "~/.cache/apps-manifest"))
SDK = os.path.expanduser(os.environ.get("ANDROID_HOME", "~/Android/Sdk"))
# Home skips an entry over this size (IoriAppsManifest.MAX_SIZE).
MAX_SIZE = 200 * 1024 * 1024

# The package (MAKEOVER-PLAN.md): the core set, ticked in Home, in the plan's order.
CORE = ["Handset", "Messaging", "Connections", "Datebook", "Memo", "Mail", "Pictures", "Lens",
        "Cabinet", "Passwords", "Time", "Glance", "Sky", "Music Box", "Feeds", "Dictionary",
        "Translate"]
# The extras, offered unticked.
EXTRAS = ["Recipes", "Shelf", "Audio Reader", "Dream Log", "Medicine", "Cycle", "Practice",
          "Whereabouts", "Topo", "Detour", "Field Kit", "Wallet", "Remote", "Car Check", "Tuner",
          "Typewriter", "Birding", "Mushroom Journal", "Star Chart", "Level", "Speedometer",
          "Abacus", "Go", "Solitaire", "I Ching", "Tarot", "Hum", "Mesh", "Bitcoin"]
# Where the plan's name is not the one on the site.
ALIASES = {"Mail": "Mailbox"}


def warn(msg):
    print(f"  ! {msg}", file=sys.stderr)


def tool(name):
    found = sorted(glob.glob(f"{SDK}/build-tools/*/{name}"),
                   key=lambda p: [int(x) if x.isdigit() else 0 for x in p.split("/")[-2].split(".")])
    if not found:
        sys.exit(f"no {name} under {SDK}/build-tools")
    return found[-1]


def cards():
    """index.html's app cards: shown name -> (repository, summary)."""
    text = open(os.path.join(SITE, "index.html"), encoding="utf-8").read()
    out = {}
    for m in re.finditer(r'<div class="app" id="([^"]+)">(.*?)</div>', text, re.S):
        repo, body = m.group(1), m.group(2)
        name = re.search(r"<h4>(.*?)<", body, re.S)
        en = re.search(r'<p class="en">(.*?)</p>', body, re.S)
        if not name:
            continue
        summary = ""
        if en:
            words = " ".join(html.unescape(re.sub(r"<[^>]+>", "", en.group(1))).split())
            summary = re.split(r"(?<=[.!?])\s", words, maxsplit=1)[0]
        out[html.unescape(name.group(1)).strip()] = (repo, summary)
    return out


def application_id(repo):
    """The applicationId in /opt/projects/<repo>'s app build file, if there is one."""
    for f in glob.glob(f"{PROJECTS}/{repo}/app/build.gradle*"):
        m = re.search(r'applicationId\s*=?\s*"([^"]+)"', open(f, encoding="utf-8").read())
        if m:
            return m.group(1)
    return None


def home_file(path):
    return subprocess.run(["git", "-C", HOME_REPO, "show", f"{HOME_REF}:app/src/iori/{path}"],
                          capture_output=True, text=True, check=True).stdout


def home_pins():
    """Package -> certificate SHA-256 that Home pins: assets/iori_apps.json and IoriAccount.CALLERS."""
    pins, callers = {}, []
    try:
        for a in json.loads(home_file("assets/iori_apps.json"))["apps"]:
            pins[a["package"]] = a["cert"].lower()
    except (subprocess.CalledProcessError, ValueError, KeyError) as e:
        warn(f"Home's app list not read ({e}); no pins checked from it")
    try:
        src = home_file("java/com/wanderwildwood/iori/IoriAccount.kt")
        block = src.split("val CALLERS = mapOf(", 1)[1].split(")", 1)[0]
        for pkg, cert in re.findall(r'"([\w.]+)"\s+to\s+"([0-9a-f]{64})"', block):
            callers.append(pkg)
            if pins.setdefault(pkg, cert) != cert:
                warn(f"{pkg}: iori_apps.json and IoriAccount.CALLERS pin different certificates")
    except (subprocess.CalledProcessError, IndexError) as e:
        warn(f"Home's account list not read ({e})")
    return pins, callers


def latest_apk(repo):
    """(tag, asset) for the repository's latest release APK, or None."""
    r = subprocess.run(["gh", "release", "view", "--repo", f"{OWNER}/{repo}", "--json", "tagName,assets"],
                       capture_output=True, text=True)
    if r.returncode != 0:
        return None
    rel = json.loads(r.stdout)
    apks = [a for a in rel["assets"] if a["name"].endswith(".apk") and "debug" not in a["name"].lower()]
    for pick in (lambda a: a["name"] == f"{repo}.apk", lambda a: a["name"].startswith(f"{repo}-"), lambda a: True):
        hits = [a for a in apks if pick(a)]
        if hits:
            return rel["tagName"], hits[0]
    return None


def read_file(apk):
    """What Home's list says of an APK on disk."""
    sha = hashlib.sha256(open(apk, "rb").read()).hexdigest()
    size = os.path.getsize(apk)
    badging = subprocess.run([tool("aapt2"), "dump", "badging", apk], capture_output=True, text=True, check=True).stdout
    pkg = re.search(r"package: name='([^']+)' versionCode='(\d+)' versionName='([^']*)'", badging)
    min_sdk = re.search(r"(?:minSdkVersion|sdkVersion):'(\d+)'", badging)
    signers = subprocess.run([tool("apksigner"), "verify", "--print-certs", apk], capture_output=True, text=True)
    certs = sorted(set(re.findall(r"certificate SHA-256 digest: ([0-9a-f]{64})", signers.stdout)))
    return {
        "package": pkg.group(1) if pkg else None,
        "versionCode": int(pkg.group(2)) if pkg else 0,
        "versionName": pkg.group(3) if pkg else "",
        "minSdk": int(min_sdk.group(1)) if min_sdk else 1,
        "sha256": sha,
        "size": size,
        "certs": certs if signers.returncode == 0 else [],
    }


def read_apk(repo, tag, asset, memo):
    key = f'{asset["url"]} {asset["size"]} {asset.get("updatedAt", "")}'
    if key in memo:
        return memo[key]
    with tempfile.TemporaryDirectory(dir=CACHE) as d:
        subprocess.run(["gh", "release", "download", tag, "--repo", f"{OWNER}/{repo}",
                        "--pattern", asset["name"], "--dir", d], check=True, capture_output=True)
        facts = read_file(os.path.join(d, asset["name"]))
    memo[key] = facts
    return facts


def staged(path):
    """repo -> its staged release, from --staged FILE."""
    out = {}
    for s in json.load(open(path, encoding="utf-8"))["apps"]:
        if not re.fullmatch(r"[A-Za-z0-9_.-]+", s["repo"]) or not re.fullmatch(r"v[0-9][0-9A-Za-z.+-]*", s["tag"]):
            sys.exit(f"--staged: bad repo or tag in {s}")
        out[s["repo"]] = s
    return out


def read_staged(s):
    """(tag, asset, facts) for a staged APK; exits when the APK is not what the staged file says."""
    f = read_file(s["apk"])
    for k in ("versionName", "versionCode", "sha256", "size"):
        if k in s and s[k] != f[k]:
            sys.exit(f"--staged {s['repo']}: {k} is {f[k]!r} in {s['apk']}, the staged file says {s[k]!r}")
    if "certSha256" in s and f["certs"] != [s["certSha256"]]:
        sys.exit(f"--staged {s['repo']}: signed by {f['certs']}, the staged file says {s['certSha256']}")
    name = f"{s['repo']}.apk"
    asset = {"name": name, "url": f"https://github.com/{OWNER}/{s['repo']}/releases/download/{s['tag']}/{name}"}
    return s["tag"], asset, f


def main():
    os.makedirs(CACHE, exist_ok=True)
    memo_file = os.path.join(CACHE, "read.json")
    memo = json.load(open(memo_file)) if os.path.exists(memo_file) else {}
    site = cards()
    by_repo = {repo: (name, summary) for name, (repo, summary) in site.items()}
    pins, callers = home_pins()
    stage = {}
    if "--staged" in sys.argv:
        i = sys.argv.index("--staged")
        if i + 1 >= len(sys.argv):
            sys.exit("--staged needs a file")
        stage = staged(sys.argv[i + 1])
    staged_repos, written = set(stage), set()

    wanted = [(n, True) for n in CORE] + [(n, False) for n in EXTRAS]
    rows = []  # (shown name, repo, summary, core)
    for plan_name, core in wanted:
        name = ALIASES.get(plan_name, plan_name)
        if name not in site:
            warn(f"{plan_name}: no card on index.html, left out")
            continue
        rows.append((name, site[name][0], site[name][1], core))
    # The apps Home hands its Nextcloud account to, found by their package in /opt/projects/<repo>.
    have = {r[1] for r in rows}
    for pkg in callers:
        repo = next((r for r in by_repo if application_id(r) == pkg), None) or pkg.rsplit(".", 1)[-1]
        if repo in have:
            continue
        if repo not in by_repo:
            warn(f"{pkg}: on Home's account list but no card on index.html, left out")
            continue
        rows.append((by_repo[repo][0], repo, by_repo[repo][1], False))
        have.add(repo)

    apps = []
    for name, repo, summary, core in rows:
        print(f"{name} ({repo})" + (" staged" if repo in stage else ""), file=sys.stderr)
        if repo in stage:
            tag, asset, f = read_staged(stage.pop(repo))
        else:
            found = latest_apk(repo)
            if not found:
                warn("no APK in the latest release, left out")
                continue
            tag, asset = found
            try:
                f = read_apk(repo, tag, asset, memo)
            except subprocess.CalledProcessError as e:
                warn(f"could not read {asset['name']}: {e}")
                continue
            finally:
                json.dump(memo, open(memo_file, "w"), indent=1)
        if not f["package"]:
            warn(f"{asset['name']}: aapt2 could not read it, left out")
            continue
        source_id = application_id(repo)
        if source_id and source_id != f["package"]:
            warn(f"{asset['name']} is {f['package']}, the source says {source_id}")
        if len(f["certs"]) != 1:
            warn(f"{asset['name']}: signed by {len(f['certs'])} certificates, not one; left out")
            continue
        cert = f["certs"][0]
        if f["package"] in pins and pins[f["package"]] != cert:
            warn(f"{asset['name']}: certificate {cert} is not the one Home pins, left out")
            continue
        if f["size"] > MAX_SIZE:
            warn(f"{asset['name']}: {f['size']} bytes, over Home's limit; left out")
            continue
        apps.append({
            "package": f["package"],
            "name": name,
            "summary": summary,
            "core": core,
            "versionName": f["versionName"],
            "versionCode": f["versionCode"],
            "apk": asset["url"],
            "sha256": f["sha256"],
            "certSha256": cert,
            "minSdk": f["minSdk"],
            "size": f["size"],
        })
        written.add(repo)
        if not asset["url"].startswith("https://"):
            sys.exit(f"{asset['url']}: not https")

    if staged_repos - written - set(stage):
        sys.exit(f"--staged: left out of the list: {', '.join(sorted(staged_repos - written - set(stage)))}")
    if stage:
        warn(f"staged but not on the list (no card, or not one of Home's apps): {', '.join(sorted(stage))}")
    text = json.dumps({"version": 1, "apps": apps}, indent=1, ensure_ascii=False) + "\n"
    if "--dry-run" in sys.argv:
        print(text)
    else:
        open(OUT, "w", encoding="utf-8").write(text)
        print(f"wrote {OUT}: {len(apps)} apps", file=sys.stderr)


if __name__ == "__main__":
    main()
