from supabase import create_client
from config import SUPABASE_URL, SUPABASE_KEY

# Initialize Supabase client
supabase = create_client(SUPABASE_URL, SUPABASE_KEY) 