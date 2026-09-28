// Configuración de Supabase.
// Supabase → Project Settings → API: copiá la "Project URL" y la clave "anon public"
// (o "publishable"). Son públicas por diseño: la seguridad la dan las reglas RLS
// de supabase/schema.sql. NUNCA pongas acá la clave "service_role" / "secret".
//
// Si las dejás vacías, la app funciona en modo local (datos solo en este navegador).
window.APP_CONFIG = {
  supabaseUrl: "https://qfmxdtwjexiobxpysrag.supabase.co",
  supabaseAnonKey: "sb_publishable_H55ciM5m49Q7FuRfV5U4kA_BwnqnVTM"
};
