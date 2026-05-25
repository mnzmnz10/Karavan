// Load configuration from environment or config file
const path = require('path');

// Environment variable overrides
const config = {
  disableHotReload: process.env.DISABLE_HOT_RELOAD === 'true',
};

module.exports = {
  webpack: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    configure: (webpackConfig, { env }) => {
      
      // PERFORMANCE: Development mode optimizations
      if (env === 'development') {
        // Reduce compilation time
        webpackConfig.optimization = {
          ...webpackConfig.optimization,
          removeAvailableModules: false,
          removeEmptyChunks: false,
          splitChunks: false,
        };
        
        // Speed up builds
        webpackConfig.resolve.symlinks = false;
        webpackConfig.resolve.cacheWithContext = false;
        
        // Less aggressive source maps for faster builds
        webpackConfig.devtool = 'eval-cheap-module-source-map';
      }
      
      // Production optimizations
      if (env === 'production') {
        // Enable additional optimizations
        webpackConfig.optimization = {
          ...webpackConfig.optimization,
          splitChunks: {
            chunks: 'all',
            cacheGroups: {
              vendor: {
                test: /[\\/]node_modules[\\/]/,
                name: 'vendors',
                chunks: 'all',
                priority: 20,
              },
              common: {
                name: 'common',
                minChunks: 2,
                chunks: 'all',
                priority: 10,
                reuseExistingChunk: true,
              },
              radixUI: {
                test: /[\\/]node_modules[\\/]@radix-ui[\\/]/,
                name: 'radix-ui',
                chunks: 'all',
                priority: 30,
              },
            },
          },
          usedExports: true,
          sideEffects: false,
        };

        // Minimize bundle size
        webpackConfig.resolve.alias = {
          ...webpackConfig.resolve.alias,
          '@': path.resolve(__dirname, 'src'),
        };
      }
      
      // PERFORMANCE: Optimize watch options for both modes
      webpackConfig.watchOptions = {
        ...webpackConfig.watchOptions,
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/build/**',
          '**/dist/**',
          '**/coverage/**',
          '**/public/**',
          '**/*.test.js',
          '**/*.spec.js',
        ],
        aggregateTimeout: 300,  // Faster response
        poll: false, // Use native file watching
      };

      // Disable hot reload completely if environment variable is set
      if (config.disableHotReload) {
        // Remove hot reload related plugins
        webpackConfig.plugins = webpackConfig.plugins.filter(plugin => {
          return !(plugin.constructor.name === 'HotModuleReplacementPlugin');
        });
        
        // Disable watch mode
        webpackConfig.watch = false;
        webpackConfig.watchOptions = {
          ignored: /.*/, // Ignore all files
        };
      }
      
      return webpackConfig;
    },
  },
};