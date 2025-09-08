/**
 * Node-RED settings for E2E testing
 * Optimized for Node-RED v4.x features and testing environment
 */

module.exports = {
  // Basic server settings
  uiPort: 1880,
  uiHost: '127.0.0.1',

  // API settings for testing
  httpAdminRoot: '/admin',
  httpNodeRoot: '/api',
  httpStatic: false,

  // Disable authentication for testing
  adminAuth: false,
  httpNodeAuth: false,

  // Enhanced security for production-like testing
  requireHttps: false,

  // Editor settings optimized for v4
  editorTheme: {
    projects: {
      enabled: true, // Enable project mode in v4
      workflow: {
        mode: 'manual', // Manual project switching
      },
    },
    codeEditor: {
      lib: 'monaco', // Use Monaco editor (v4 feature)
      options: {
        theme: 'vs-dark',
      },
    },
    menu: {
      'menu-item-palette-manager': false,
      'menu-item-import-library': false,
    },
    palette: {
      editable: true,
      catalogues: ['https://catalogue.nodered.org/catalogue.json'],
      theme: [{ category: 'subflows', type: 'subflow', color: '#da7b46' }],
    },
  },

  // Logging configuration for testing
  logging: {
    console: {
      level: 'warn',
      metrics: false,
      audit: false,
    },
  },

  // Context storage for persistent testing
  contextStorage: {
    default: 'memory',
    memory: { module: 'memory' },
    file: {
      module: 'localfilesystem',
      config: {
        dir: 'e2e/node-red-data/context',
        cache: false,
      },
    },
  },

  // Function node settings (v4 enhancements)
  functionGlobalContext: {
    testMode: true,
    mcpServerUrl: 'http://localhost:3000',
  },

  // Export settings for testing
  exportGlobalContextKeys: false,

  // Flow file settings
  flowFile: 'e2e-flows.json',
  flowFilePretty: true,

  // User directory for test isolation
  userDir: './e2e/node-red-data',

  // Node-RED v4 specific settings
  runtimeState: {
    enabled: false,
    ui: false,
  },

  // Debug settings for E2E testing
  debugMaxLength: 1000,
  debugUseColors: true,

  // Node settings
  nodeSettings: {
    'node-red': {
      version: '4.x',
    },
  },

  // Disable unnecessary features for testing
  disableEditor: false,
  httpRoot: '/',

  // CORS settings for testing
  httpNodeCors: {
    origin: '*',
    methods: 'GET,PUT,POST,DELETE',
  },

  // Test-specific flows directory
  nodesDir: './e2e/test-nodes',

  // Performance settings for testing
  apiMaxLength: '5mb',

  // Security settings (relaxed for testing)
  httpRequestTimeout: 120000,
  httpAdminMiddleware: function (req, res, next) {
    // Add test headers
    res.setHeader('X-Test-Environment', 'e2e');
    next();
  },
};
