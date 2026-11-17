#!/usr/bin/env python3
"""Repair route files: for every `export const M = route(` call, locate the
arrow-body end with a string-aware brace scanner, then ensure the call is
properly closed: `})` / `}, {opts})` followed by removal of orphan `}` or `()`
left by the earlier broken transformation."""
import re, pathlib

API = pathlib.Path('/home/z/my-project/src/app/api')
FILES = [p for p in API.rglob('route.ts')] + ([API / 'route.ts'] if (API / 'route.ts').exists() else [])


def skip_string(text, i):
    q = text[i]
    i += 1
    while i < len(text):
        c = text[i]
        if c == '\\':
            i += 2
            continue
        if q == '`' and text[i:i+2] == '${':
            # template interpolation: skip balanced braces
            depth = 1
            i += 2
            while i < len(text) and depth:
                if text[i] == '{':
                    depth += 1
                elif text[i] == '}':
                    depth -= 1
                elif text[i] in '\'"`':
                    i = skip_string(text, i)
                    continue
                i += 1
            continue
        if c == q:
            return i + 1
        i += 1
    return i


def match_brace(text, i):
    """text[i] == '{' → index after matching '}' (string-aware)."""
    depth = 0
    while i < len(text):
        c = text[i]
        if c in '\'"`':
            i = skip_string(text, i)
            continue
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    return len(text)


def repair(text):
    out = []
    pos = 0
    pattern = re.compile(r'export const (GET|POST|PATCH|PUT|DELETE) = route\(')
    for m in pattern.finditer(text):
        start = m.start()
        # copy everything before this block (from previous end)
        out.append(text[pos:start])
        i = m.end()  # just after 'route('
        # find '=> {' arrow body start
        arrow = text.find('=> {', i)
        if arrow == -1:
            pos = start
            break
        body_open = arrow + 3  # at '{'
        body_close = match_brace(text, body_open)
        # after body close: optional options object
        j = body_close
        while j < len(text) and text[j] in ' \n\t':
            j += 1
        call_end = None
        if j < len(text) and text[j] == ',':
            # options object follows
            k = j + 1
            while k < len(text) and text[k] in ' \n\t':
                k += 1
            if k < len(text) and text[k] == '{':
                k = match_brace(text, k)
                while k < len(text) and text[k] in ' \n\t':
                    k += 1
                if k < len(text) and text[k] == ')':
                    call_end = k + 1
                else:
                    call_end = k  # need to insert ')'
            else:
                call_end = j
        elif j < len(text) and text[j] == ')':
            call_end = j + 1
        else:
            call_end = body_close  # insert ')' right after body close
        segment = text[start:call_end]
        if call_end <= len(text) and (call_end == len(text) or text[call_end] != ')'):
            pass
        # ensure call ends with ')'
        if not segment.rstrip().endswith(')'):
            segment = segment.rstrip() + ')'
            call_end_text = segment
        else:
            call_end_text = segment
        out.append(call_end_text)
        # skip junk after call: whitespace + optional '()' + optional orphan '}' line
        k = call_end
        while k < len(text) and text[k] in ' \n\t':
            k += 1
        if text[k:k+2] == '()':
            k += 2
            while k < len(text) and text[k] in ' \n\t':
                k += 1
        # orphan wrapper close: a line that is exactly '}' possibly indented, followed by newline
        m2 = re.match(r'\}\s*\n', text[k:])
        if m2 and text[k:k+1] == '}':
            # only consume if the NEXT non-space content after it is not another method
            rest = text[k+len(m2.group(0)):]
            nxt = re.match(r'\s*(export const (GET|POST|PATCH|PUT|DELETE)|const |[A-Za-z])', rest)
            if nxt and nxt.group(1).startswith('export const'):
                k += len(m2.group(0))  # orphan between methods: consume
            elif not nxt:
                k += len(m2.group(0))  # orphan at EOF: consume
        pos = k
    out.append(text[pos:])
    return ''.join(out)


changed = 0
for path in FILES:
    text = path.read_text()
    if 'export const' in text and '= route(' in text:
        new = repair(text)
        if new != text:
            path.write_text(new)
            changed += 1
print(f'repaired={changed}')
