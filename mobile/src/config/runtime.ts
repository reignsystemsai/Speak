export interface RuntimeConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  backendUrl: string;
}

function getRequiredEnv(name: keyof RuntimeConfig): string {
  const value = process.env[name === 'supabaseUrl' ? 'EXPO_PUBLIC_SUPABASE_URL' : name === 'supabaseAnonKey' ? 'EXPO_PUBLIC_SUPABASE_ANON_KEY' : 'EXPO_PUBLIC_BACKEND_URL'];

  if (!value) {
    throw new Error(`Missing required runtime configuration: ${name}`);
  }

  return value;
}

export const runtimeConfig: RuntimeConfig = {
  supabaseUrl: getRequiredEnv('supabaseUrl'),
  supabaseAnonKey: getRequiredEnv('supabaseAnonKey'),
  backendUrl: getRequiredEnv('backendUrl'),
};

export const { supabaseUrl, supabaseAnonKey, backendUrl } = runtimeConfig;
