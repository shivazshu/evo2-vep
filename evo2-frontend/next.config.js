/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
/** @type {import('next').NextConfig} */
const nextConfig = {
    // output: 'export',
    distDir: 'out',
    images: {
      unoptimized: true
    },
    typescript: {
      ignoreBuildErrors: true,
    },
    eslint: {
      ignoreDuringBuilds: true,
    }
  }
  
  export default nextConfig
