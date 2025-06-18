/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";
import path from 'path';

/** @type {import("next").NextConfig} */
const config = {
    reactStrictMode: false, 
    output: 'export',
    webpack: (config) => {
        config.resolve.alias = {
            ...(config.resolve.alias || {}),
            '~': path.resolve(__dirname, 'src'),
        };
        return config;
    },
};

export default config;
