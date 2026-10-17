#!/usr/bin/env python3
"""Arma preview/planes.html: Planes en un solo archivo, en modo local
(sin Supabase), para probar el diseño sin tocar producción."""
import pathlib, re

root = pathlib.Path(__file__).resolve().parent.parent / "planes"
html = (root / "index.html").read_text(encoding="utf-8")
css = (root / "planes.css").read_text(encoding="utf-8")
html = html.replace('<link rel="stylesheet" href="planes.css">', "<style>\n" + css + "</style>")
# Sin Supabase, config ni service worker: modo local.
html = re.sub(r'<script src="https://cdn\.jsdelivr\.net/[^"]+"></script>\n?', "", html)
html = html.replace('<script src="../config.js"></script>', "")
html = re.sub(r'<script>\s*if\("serviceWorker".*?</script>\n?', "", html, flags=re.S)


# Todos los scripts propios de planes/ (planes.js, notas.js, aprender.js, …) van adentro.
def inline(m):
    f = root / m.group(1)
    if not f.exists():
        return m.group(0)
    return "<script>\n" + f.read_text(encoding="utf-8").replace("</script>", "<\\/script>") + "</script>"


html = re.sub(r'<script src="([\w.-]+\.js)"></script>', inline, html)
html = re.sub(r'<link rel="(manifest|icon|apple-touch-icon)"[^>]*>\n?', "", html)

out = root.parent / "preview" / "planes.html"
out.parent.mkdir(exist_ok=True)
out.write_text(html, encoding="utf-8")
print(out)
