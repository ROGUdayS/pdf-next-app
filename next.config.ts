import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Environment variables for Firebase deployment
  env: {
    // Firebase client config (public)
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID:
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID:
      process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,

    // Email config
    EMAIL_USER: process.env.EMAIL_USER,
    EMAIL_APP_PASSWORD: process.env.EMAIL_APP_PASSWORD,

    // Firebase admin config (server-side)
    FIREBASE_PRIVATE_KEY_ID: process.env.FIREBASE_PRIVATE_KEY_ID,
    FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY,
    FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
    FIREBASE_CLIENT_ID: process.env.FIREBASE_CLIENT_ID,
    FIREBASE_AUTH_URI: process.env.FIREBASE_AUTH_URI,
    FIREBASE_TOKEN_URI: process.env.FIREBASE_TOKEN_URI,
    FIREBASE_AUTH_PROVIDER_X509_CERT_URL:
      process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
    FIREBASE_CERT_URL: process.env.FIREBASE_CERT_URL,

    // Redis config
    REDIS_URL: process.env.REDIS_URL,
  },
  webpack: (config, { webpack, isServer }) => {
    // Configure fallbacks for client-side
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        canvas: false,
        fs: false,
        path: false,
        os: false,
        crypto: false,
        stream: false,
        assert: false,
        http: false,
        https: false,
        url: false,
        zlib: false,
        util: false,
        buffer: false,
      };

      // Exclude problematic modules from client bundle
      config.externals = [...(config.externals || []), "canvas"];
    }

    // Handle PDF.js worker and react-pdf
    config.resolve.alias = {
      ...config.resolve.alias,
      "pdfjs-dist/build/pdf.worker.js": "pdfjs-dist/build/pdf.worker.min.js",
      "pdfjs-dist/build/pdf.worker.mjs": "pdfjs-dist/build/pdf.worker.min.js",
    };

    // Ignore problematic modules in PDF.js
    config.plugins = [...(config.plugins || [])];

    // Add comprehensive ignore patterns for canvas dependencies
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^canvas$/,
        contextRegExp: /pdfjs-dist/,
      }),
      new webpack.IgnorePlugin({
        resourceRegExp: /canvas\.node$/,
      }),
      new webpack.IgnorePlugin({
        resourceRegExp: /^canvas$/,
        contextRegExp: /canvas/,
      })
    );

    return config;
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
        port: "",
        pathname: "/v0/b/**",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        port: "",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
