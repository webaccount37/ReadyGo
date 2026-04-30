/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  // API proxy: use middleware.ts so BACKEND_URL is read at runtime (Azure ACA env).
  // rewrites() here would bake the Docker build default (backend:8000) into the image.
}

module.exports = nextConfig


