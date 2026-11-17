import { readFileSync } from "node:fs";

import type { NextConfig } from "next";

import { libelleVersion } from "./src/lib/version";

// Version exposée dans la balise meta `version` (convention 10 §5), figée au
// build depuis package.json et les variables de déploiement Vercel.
const { version } = JSON.parse(readFileSync("./package.json", "utf8")) as { version: string };

const nextConfig: NextConfig = {
  env: {
    VERSION_APPLICATION: libelleVersion(version, process.env),
  },
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
