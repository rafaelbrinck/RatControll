import { createClient } from '@supabase/supabase-js';
import { supabaseEnvironment } from './supabase-environment.generated.mjs';

export const supabase = createClient(supabaseEnvironment.url, supabaseEnvironment.publishableKey);
