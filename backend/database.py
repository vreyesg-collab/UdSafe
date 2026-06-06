import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Faltan credenciales de Supabase en el archivo .env (se requiere SUPABASE_SERVICE_KEY)")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Instancia separada exclusiva para operaciones de storage/admin.
# NUNCA llamar auth.sign_in / sign_up aquí — eso contaminaría su sesión interna
# y haría que storage use el JWT del usuario en vez del service role key.
supabase_admin: Client = create_client(SUPABASE_URL, SUPABASE_KEY)