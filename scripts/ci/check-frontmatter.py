#!/usr/bin/env python3
"""Parse the YAML frontmatter of every SKILL.md and agent file. `claude plugin validate` does not check skill frontmatter."""
import glob, re, sys
import yaml

bad = 0
for f in sorted(glob.glob('skills/*/SKILL.md') + glob.glob('agents/*.md')):
    text = open(f, encoding='utf-8').read()
    m = re.match(r'^---\n(.*?)\n---\n', text, re.S)
    if not m:
        print('FAIL', f, 'no frontmatter'); bad += 1; continue
    try:
        d = yaml.safe_load(m.group(1))
    except Exception as e:
        print('FAIL', f, e); bad += 1; continue
    if not isinstance(d, dict) or not d.get('name') or not d.get('description'):
        print('FAIL', f, 'name and description are required'); bad += 1; continue
    if len(str(d['description'])) > 1536:
        print('FAIL', f, 'description longer than 1,536 characters'); bad += 1; continue
    words = len(text.split())
    print('OK  ', f, f'({words} words)')
sys.exit(1 if bad else 0)
