// Las variables NEXT_PUBLIC_* se leen de forma literal para que Next.js
// pueda incluirlas en el bundle del navegador.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabasePublishableKey);
}

export function getSupabaseEnv(): { url: string; publishableKey: string } {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL y/o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. " +
        "Copiá .env.example como .env.local y completalo.",
    );
  }
  return { url: supabaseUrl, publishableKey: supabasePublishableKey };
}
