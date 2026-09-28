#!/usr/bin/env python3
"""Arma preview/libro-de-gastos.html: la app en un solo archivo, en modo local
(sin Supabase, con datos de ejemplo), para revisar diseño sin tocar producción."""
import pathlib, re

root = pathlib.Path(__file__).resolve().parent.parent
html = (root / "index.html").read_text(encoding="utf-8")
css = (root / "styles.css").read_text(encoding="utf-8")
js = (root / "app.js").read_text(encoding="utf-8")

html = html.replace('<link rel="stylesheet" href="styles.css">', "<style>\n" + css + "</style>")
# Sin Supabase ni archivos externos de la app: modo local.
html = re.sub(r'<script src="https://cdn\.jsdelivr\.net/[^"]+"></script>\n?', "", html)
html = html.replace('<script src="config.js"></script>',
                    '<script>window.APP_CONFIG = {supabaseUrl: "", supabaseAnonKey: ""};</script>')
html = html.replace('<script src="app.js"></script>', "<script>\n" + js.replace("</script>", "<\\/script>") + "</script>")
html = re.sub(r'<link rel="(manifest|icon|apple-touch-icon)"[^>]*>\n?', "", html)

out = root / "preview" / "libro-de-gastos.html"
out.parent.mkdir(exist_ok=True)
out.write_text(html, encoding="utf-8")
print(out)
