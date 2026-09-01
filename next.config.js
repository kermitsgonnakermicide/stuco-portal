/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // ESLint isn't configured in this reference implementation yet; keep
  // builds green until a shared config is added.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
