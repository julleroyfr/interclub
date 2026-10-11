import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Import des licenciés (spec #13) : l'upload .xlsx transite par une Server
    // Action (multipart). 1 Mo par défaut est trop juste pour un export complet ;
    // on élargit à 10 Mo.
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
