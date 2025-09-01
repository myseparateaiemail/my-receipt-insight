import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Test all environment variables
    const apiKey = Deno.env.get('GOOGLE_CLOUD_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    const result = {
      google_api_key_present: !!apiKey,
      google_api_key_length: apiKey?.length || 0,
      google_api_key_first_10: apiKey?.substring(0, 10) || 'undefined',
      supabase_url_present: !!supabaseUrl,
      service_key_present: !!serviceKey,
      all_env_vars: Object.keys(Deno.env.toObject()),
      timestamp: new Date().toISOString()
    };

    console.log('Environment test result:', JSON.stringify(result, null, 2));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in test-env function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});