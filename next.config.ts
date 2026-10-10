import type { NextConfig } from 'next';
const config: NextConfig = {
  poweredByHeader: false,
  // PDF.js imports a sibling worker at runtime; bundling breaks that lookup.
  serverExternalPackages: ['pdfjs-dist', 'pdf-parse', '@napi-rs/canvas'],
  outputFileTracingIncludes: {
    '/api/imports': [
      // PDF.js loads canvas through process.getBuiltinModule/createRequire,
      // which automatic tracing misses. Include its native Linux bindings.
      './node_modules/@napi-rs/canvas/**/*',
      './node_modules/@napi-rs/canvas-linux-*/**/*',
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
