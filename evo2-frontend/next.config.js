/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'export',
    trailingSlash: true,
    images: {
      unoptimized: true
    },
    typescript: {
      ignoreBuildErrors: true,
    },
    // Note: eslint configuration moved to eslint.config.js in Next.js 16
}

export default nextConfig
