#!/usr/bin/env python3
"""Rewrite the app names in mktweaks/apps.js from the master list of apps.

    python3 _tools/make-tweaks-names.py path/to/apps.tsv

apps.tsv (kept outside this repository) has one row an app, tab-separated, with
the columns `package` and `name` among others. The Kompakt tweaks page only needs package ->
name, to label the background list, so that is all that is written, between the two marker
lines in apps.js. Everything else in that file is left as it is. After a rename or a new app,
run this again and commit apps.js.
"""
import csv, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
if len(sys.argv) != 2: sys.exit(__doc__)
TSV = sys.argv[1]
JS = os.path.join(HERE, '..', 'mktweaks', 'apps.js')
SKIP = {'com.wanderwildwood.chizu'}          # (Atlas: not released yet)

rows = [l for l in open(TSV, encoding='utf-8') if l.strip() and not l.startswith('#')]
apps = sorted(((r['package'], r['name']) for r in csv.DictReader(rows, delimiter='\t') if r['package'] not in SKIP),
              key=lambda a: a[1].lower())
assert apps and all(p and n for p, n in apps), 'a row without a package or a name'
body = ''.join('  [%s, %s],\n' % (repr(p).replace("'", '"'), '"' + n.replace('\\', '\\\\').replace('"', '\\"') + '"') for p, n in apps)
s = open(JS, encoding='utf-8').read()
a, b = '// BEGIN app names (written by _tools/make-tweaks-names.py)\n', '// END app names\n'
assert s.count(a) == 1 and s.count(b) == 1, 'the marker lines are not in apps.js'
s = s[:s.index(a) + len(a)] + 'export const APPS = [\n' + body + '];\n' + s[s.index(b):]
open(JS, 'w', encoding='utf-8').write(s)
print(len(apps), 'apps written to', os.path.normpath(JS))
