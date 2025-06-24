// ============================================================================
// DebateLens - Configurazione di Esempio
// Copia questo file in config.js e personalizza le impostazioni
// ============================================================================

module.exports = {
    // Server Configuration
    server: {
        port: 3000,
        host: 'localhost',
        env: 'development'
    },

    // OpenRouter API Configuration
    // IMPORTANTE: Sostituisci con le tue chiavi API reali
    openrouter: {
        apiKey: 'your_openrouter_api_key_here',
        baseURL: 'https://openrouter.ai/api/v1',
        defaultModel: 'google/gemini-2.0-flash-exp:free',
        fallbackModel: 'google/gemini-1.5-flash:free',
        maxTokens: 8000,
        temperature: 0.1
    },

    // Whisper Configuration (locale)
    whisper: {
        model: 'base', // tiny, base, small, medium, large
        language: 'it'
    },

    // Database Configuration
    database: {
        path: './data/debatelens.db'
    },

    // File Upload Configuration
    upload: {
        maxFileSize: 100 * 1024 * 1024, // 100MB
        uploadDir: './uploads',
        tempDir: './temp'
    },

    // Security Configuration
    security: {
        rateLimitWindowMs: 15 * 60 * 1000, // 15 minuti
        rateLimitMaxRequests: 100
    },

    // Cleanup Configuration
    cleanup: {
        intervalHours: 24,
        maxFileAgeHours: 48
    }
}; 