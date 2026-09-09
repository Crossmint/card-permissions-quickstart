// Hosts that reach the app through a tunnel or proxy, e.g. a Cloudflare
// Tunnel in front of `next dev`. Comma separated, no scheme.
const proxiedHosts = (process.env.SERVER_ACTIONS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  allowedDevOrigins: proxiedHosts,
  logging: {
    serverFunctions: false,
  },
  experimental: {
    serverActions: {
      allowedOrigins: proxiedHosts,
    },
  },
}

export default nextConfig
