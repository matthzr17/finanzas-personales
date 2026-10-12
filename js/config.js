// Configuración de conexión a Supabase.
// Copia los valores de: Supabase → Project Settings → API (Data API / API Keys).
// Si los dejas vacíos, la app funciona en "modo demo" (datos solo en este navegador).
//
// La llave publishable/anon es pública por diseño: tus datos los protege el
// inicio de sesión + las políticas RLS de supabase/schema.sql.
// NUNCA pongas aquí la llave "service_role" / "secret".
window.APP_CONFIG = {
  SUPABASE_URL: 'https://enmqirfghjdxpkdqxnvz.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVubXFpcmZnaGpkeHBrZHF4bnZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4MzY4NTUsImV4cCI6MjEwNzQxMjg1NX0.zfoNRI7_dGq3HRoHQRgTpOWIbb0M71k2ufvK1mDHmcw'
};
