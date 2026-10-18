#!/usr/bin/env python3
"""Arma preview/finanzas.html: la vista de Finanzas en un solo archivo, en modo local
(sin Supabase, con datos de ejemplo), para revisar diseño sin tocar producción."""
import pathlib, re

root = pathlib.Path(__file__).resolve().parent.parent
d = root / "finanzas"
html = (d / "index.html").read_text(encoding="utf-8")
css = (d / "finanzas.css").read_text(encoding="utf-8")
js = (d / "finanzas.js").read_text(encoding="utf-8")

html = html.replace('<link rel="stylesheet" href="finanzas.css">', "<style>\n" + css + "</style>")
html = re.sub(r'<script src="https://cdn\.jsdelivr\.net/[^"]+"></script>\n?', "", html)
html = html.replace('<script src="../config.js"></script>',
                    '<script>window.APP_CONFIG = {supabaseUrl: "", supabaseAnonKey: ""};</script>')
html = html.replace('<script src="finanzas.js"></script>', "<script>\n" + js.replace("</script>", "<\\/script>") + "</script>")
html = re.sub(r'<link rel="icon"[^>]*>\n?', "", html)

out = root / "preview" / "finanzas.html"
out.parent.mkdir(exist_ok=True)
out.write_text(html, encoding="utf-8")
print(out)
