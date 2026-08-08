import { createClient } from '@supabase/supabase-js';

import { supabaseAnonKey, supabaseUrl } from '../config/runtime';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
