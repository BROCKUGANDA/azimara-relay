#!/usr/bin/env python3
"""Transform route files: drop the zero-arg invocation `)()` on route() calls
and convert `export function METHOD(request) { return route(...) }` into
`export const METHOD = route(...)` so Next passes the Request correctly."""
import re, pathlib

API = pathlib.Path('/home/z/my-project/src/app/api')
changed = 0

for path in list(API.rglob('route.ts')) + [API / 'route.ts']:
    if not path.exists():
        continue
    text = path.read_text()
    orig = text

    # 1) `  return route(` -> `  return route(` stays; instead we handle endings.
    # Case A: `    })()\n  }` or `  })()\n}` — remove the zero-arg call.
    text = re.sub(r'\}\)\(\)', '})', text)
    # Case B: after removal, the wrapper is `return route(...)\n}` — convert:
    # `export function GET(request: Request) {\n  return route(` -> `export const GET = route(`
    def method_repl(m):
        return f'export const {m.group(1)} = route('
    text = re.sub(r'export function (GET|POST|PATCH|PUT|DELETE)\((?:request: Request)?\) \{\s*return route\(', method_repl, text)
    # Remove the now-redundant closing `  }` of the wrapper function when the
    # route call is the only statement: pattern `)\n  }\n` directly after our
    # conversion — detect by balancing is hard; instead handle the common shape:
    # `  })\n}` at top-level following `export const ... = route(`.
    text = re.sub(r'(export const (?:GET|POST|PATCH|PUT|DELETE) = route\((?:.|\n)*?\}\))\n  \}', r'\1', text)
    if text != orig:
        path.write_text(text)
        changed += 1

print(f'changed={changed}')
