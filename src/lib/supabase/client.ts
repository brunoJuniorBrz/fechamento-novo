
import { createBrowserClient } from '@supabase/ssr';

// Define a function to create a Supabase client for client-side operations
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // The createBrowserClient function itself will throw an error if these are missing.
  // No need for redundant checks here if we trust the SDK's error handling.
  return createBrowserClient(
    supabaseUrl!,
    supabaseAnonKey!
  );
}
