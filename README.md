# Finanzas personales — Libro de Gastos

App web para anotar gastos personales y compartidos, pensada para usar desde el celular.
Los datos se guardan en **Supabase** y la página se publica en **Cloudflare Pages**.

## Qué hace

- **Inicio**: cargar un gasto (fecha, cantidad, descripción, categoría) y ver los gastos de hoy.
- **Gastos compartidos** estilo Splitwise: quién pagó y cómo se divide (a partes iguales o 100% de una persona).
- **Grupos**: saldo pendiente entre las personas del grupo, registrar pagos para liquidar, y gráfico por categoría.
- **Individual**: lo que te costó a vos cada categoría (incluye tu parte de los gastos compartidos).
- Cuentas con email y contraseña. Tus gastos personales solo los ves vos; los del grupo, todo el grupo.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html`, `styles.css`, `app.js` | La app (HTML/CSS/JS puro, sin build). |
| `config.js` | URL y clave pública de Supabase. Vacío = modo local. |
| `supabase/1-tablas.sql`, `2-funciones.sql`, `3-seguridad.sql` | Base de datos: tablas, funciones y reglas de seguridad (RLS). |
| `_headers` | Cabeceras de seguridad para Cloudflare Pages. |

## Puesta en marcha

### 1. Supabase (base de datos)

1. Creá un proyecto en [supabase.com](https://supabase.com).
2. Corré los 3 archivos de la carpeta `supabase/` **en orden** (1, 2, 3). Para cada uno:
   - En GitHub abrí el archivo y usá el botón **Copy raw file** (el ícono de copiar arriba a la
     derecha del código), así se copia completo.
   - En Supabase: **SQL Editor → New query**, pegá, y apretá **Run**. Tiene que decir *Success*.
   - Se pueden volver a correr sin problema si algo falla a mitad de camino.
3. **Project Settings → API**: copiá la **Project URL** y la clave **anon public** (o *publishable*)
   y ponelas en `config.js`. Esa clave es pública por diseño; lo que protege los datos son las
   reglas RLS del esquema. **Nunca** pongas la clave `service_role` / `secret`.
4. **Authentication → Sign In / Providers → Email**: dejalo habilitado. Si no querés confirmar
   el email al registrarte, desactivá *Confirm email*.

### 2. Cloudflare Pages (publicarla en la web)

1. En Cloudflare: **Workers & Pages → Create → Pages → Connect to Git** y elegí este repositorio.
2. Configuración de build:
   - Framework preset: **None**
   - Build command: *(vacío)*
   - Build output directory: `/`
3. **Save and Deploy**. Te da una URL tipo `https://finanzas-personales.pages.dev`.
   Cada push a la rama de producción se publica solo.
4. Volvé a Supabase → **Authentication → URL Configuration** y poné esa URL en **Site URL**
   (así el link del email de confirmación vuelve a tu app).

### 3. Compartir con otra persona

1. Entrá, abrí ⚙ y creá el grupo (por ejemplo "Casa", con el nombre de la otra persona).
2. Pasale el **código para invitar** que aparece en ⚙.
3. La otra persona crea su cuenta, abre ⚙ → **Unirme** con ese código, y ya ven los mismos
   gastos compartidos y el mismo saldo. Los gastos que cargaste a su nombre antes de que se una
   pasan a ser suyos.

## Probar sin Supabase

Con `config.js` vacío la app funciona en **modo local**: los datos quedan solo en ese navegador
(`localStorage`) y arranca con datos de ejemplo. Sirve para abrir `index.html` directo y probar.

## Próximos pasos

- Actualización en tiempo real (Supabase Realtime) en vez de recargar al volver a la pestaña.
- Varios grupos a la vez (hoy la pestaña Grupos muestra el primero).
- Exportar datos.
