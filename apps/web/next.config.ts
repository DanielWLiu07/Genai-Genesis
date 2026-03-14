import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    SUPABASE_URL: process.env.SUPABASE_URL || '',
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY || '',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  },
};

export default nextConfig;
