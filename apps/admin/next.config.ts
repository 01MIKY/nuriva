import type { NextConfig } from 'next';

/** Staff-only app. Served from its own origin (admin.nuriva.com) so its session cookie is isolated. */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@nuriva/ui', '@nuriva/i18n', '@nuriva/domain'],
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        { key: 'Cache-Control', value: 'no-store' },
      ],
    }];
  },
  webpack(config) {
    config.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] };
    return config;
  },
};

export default nextConfig;
