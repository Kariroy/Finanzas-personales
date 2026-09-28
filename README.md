# Finanzas personales — Libro de Gastos

App web de una sola página para anotar gastos personales y compartidos, pensada para usar desde el celular.

## Qué hace

- **Inicio**: cargar un gasto (fecha, cantidad, descripción, categoría) y ver los gastos de hoy.
- **Gastos compartidos** estilo Splitwise: quién pagó y cómo se divide (a partes iguales o 100% de una persona).
- **Grupos**: saldo pendiente entre las personas del grupo, registrar pagos para liquidar, y gráfico por categoría filtrable por mes o día.
- **Individual**: lo que te costó a vos cada categoría (incluye tu parte de los gastos compartidos).
- Editar y eliminar gastos, modo claro/oscuro automático.

## Cómo usarla

No necesita instalación ni servidor: abrí `index.html` en el navegador.

Para usarla desde el celular podés publicarla con GitHub Pages
(Settings → Pages → Deploy from a branch → `main` / root).

## Datos

Por ahora los datos se guardan solo en el navegador (`localStorage`, clave `libro-gastos:v1`).
Si borrás los datos del sitio o cambiás de dispositivo, se pierden. La primera vez se cargan
datos de ejemplo, que se pueden reiniciar desde ⚙ Configuración.

## Próximos pasos

- Sincronizar entre dispositivos y personas (por ejemplo con Supabase).
- Exportar/importar datos.
