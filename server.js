// ============================================================================
// DebateLens - Server Backend API
// Progetto didattico Rizzo AI Academy
// ============================================================================

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs').promises;
require('dotenv').config();

// Import routes
const analysisRoutes = require('./routes/analysis');
const uploadRoutes = require('./routes/upload');
const resultsRoutes = require('./routes/results');

// Import utilities
const { initializeDatabase } = require('./utils/database');
const { setupCleanupJob } = require('./utils/cleanup');

// Initialize Express app
const app = express();

// ============================================================================
// Configuration
// ============================================================================

const config = {
    port: process.env.PORT || 3000,
    host: process.env.HOST || 'localhost',
    env: process.env.NODE_ENV || 'development',
    uploadDir: process.env.UPLOAD_DIR || './uploads',
    tempDir: process.env.TEMP_DIR || './temp'
};

// ============================================================================
// Middleware Setup
// ============================================================================

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://unpkg.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"]
        }
    }
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minuti
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
    message: {
        error: 'Troppi tentativi. Riprova tra 15 minuti.',
        retryAfter: '15 minuti'
    },
    standardHeaders: true,
    legacyHeaders: false
});

app.use('/api/', limiter);

// CORS configuration
app.use(cors({
    origin: config.env === 'development' ? '*' : ['https://yourdomain.com'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
if (config.env === 'development') {
    app.use(morgan('dev'));
} else {
    app.use(morgan('combined'));
}

// Serve static files (frontend)
app.use(express.static('./', {
    index: 'index.html',
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        } else if (path.endsWith('.css')) {
            // Disabilita completamente la cache per CSS durante lo sviluppo
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        } else if (path.endsWith('.js')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));

// ============================================================================
// API Routes
// ============================================================================

// Favicon handler
app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
});

// CSS refresh handler per forzare il reload del CSS
app.get('/refresh-css', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.redirect('/');
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: require('./package.json').version,
        environment: config.env
    });
});

// API routes
app.use('/api/analysis', analysisRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/results', resultsRoutes);

// ============================================================================
// Error Handling
// ============================================================================

// 404 handler for API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({
        error: 'Endpoint non trovato',
        path: req.path,
        method: req.method
    });
});

// Serve frontend for all other routes (SPA fallback)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('❌ Error:', err);
    
    // Don't leak error details in production
    const isDev = config.env === 'development';
    
    res.status(err.status || 500).json({
        error: err.message || 'Errore interno del server',
        ...(isDev && { stack: err.stack, details: err })
    });
});

// ============================================================================
// Server Startup
// ============================================================================

async function startServer() {
    try {
        // Create required directories
        await ensureDirectories();
        
        // Initialize database
        await initializeDatabase();
        console.log('✅ Database inizializzato');
        
        // Setup cleanup job
        setupCleanupJob();
        console.log('✅ Job di pulizia configurato');
        
        // Start server
        const server = app.listen(config.port, config.host, () => {
            console.log(`
🔍 DebateLens Server avviato!
📍 URL: http://${config.host}:${config.port}
🌍 Ambiente: ${config.env}
⏰ Avviato alle: ${new Date().toLocaleString('it-IT')}
            `);
        });
        
        // Graceful shutdown
        process.on('SIGTERM', () => {
            console.log('🛑 SIGTERM ricevuto, spegnimento graceful...');
            server.close(() => {
                console.log('✅ Server chiuso correttamente');
                process.exit(0);
            });
        });
        
        process.on('SIGINT', () => {
            console.log('🛑 SIGINT ricevuto, spegnimento graceful...');
            server.close(() => {
                console.log('✅ Server chiuso correttamente');
                process.exit(0);
            });
        });
        
    } catch (error) {
        console.error('❌ Errore durante l\'avvio del server:', error);
        process.exit(1);
    }
}

async function ensureDirectories() {
    const dirs = [config.uploadDir, config.tempDir, './data'];
    
    for (const dir of dirs) {
        try {
            await fs.access(dir);
        } catch {
            await fs.mkdir(dir, { recursive: true });
            console.log(`📁 Creata directory: ${dir}`);
        }
    }
}

// ============================================================================
// Export for testing
// ============================================================================

module.exports = app;

// Start server if this file is run directly
if (require.main === module) {
    startServer();
} 