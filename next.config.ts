import type { NextConfig } from 'next';
const config: NextConfig = {
  poweredByHeader: false,
  // PDF.js imports a sibling worker at runtime; bundling breaks that lookup.
  serverExternalPackages: ['pdfjs-dist', 'pdf-parse', '@napi-rs/canvas'],
  outputFileTracingIncludes: {
    '/api/imports': [
      './node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
      './node_modules/pdfjs-dist/standard_fonts/**/*',
      './node_modules/pdfjs-dist/cmaps/**/*',
    ],
  },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    ] }];
  },
};
export default config;
