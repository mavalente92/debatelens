// ============================================================================
// Cleanup Utility - Pulizia automatica file e dati temporanei
// ============================================================================

const fs = require('fs').promises;
const path = require('path');
const schedule = require('node-schedule');
const { getDatabase } = require('./database');

/**
 * Configura il job di pulizia automatica
 */
function setupCleanupJob() {
    const cleanupInterval = process.env.CLEANUP_INTERVAL_HOURS || 24;
    const maxFileAge = process.env.MAX_FILE_AGE_HOURS || 48;

    // Esegui pulizia ogni giorno alle 2:00 AM
    const rule = new schedule.RecurrenceRule();
    rule.hour = 2;
    rule.minute = 0;

    schedule.scheduleJob(rule, async () => {
        console.log('🧹 Inizio pulizia automatica...');
        
        try {
            await performCleanup(parseInt(maxFileAge));
            console.log('✅ Pulizia automatica completata');
        } catch (error) {
            console.error('❌ Errore durante pulizia automatica:', error);
        }
    });

    console.log(`🔄 Job di pulizia configurato: ogni ${cleanupInterval}h, file più vecchi di ${maxFileAge}h`);
}

/**
 * Esegue la pulizia completa
 */
async function performCleanup(maxAgeHours = 48) {
    const stats = {
        files_removed: 0,
        analyses_removed: 0,
        space_freed: 0,
        temp_files_removed: 0
    };

    try {
        // 1. Pulizia database
        console.log('🗄️ Pulizia database...');
        const db = getDatabase();
        const analysesRemoved = await db.cleanup(maxAgeHours);
        stats.analyses_removed = analysesRemoved;

        // 2. Pulizia file caricati orfani
        console.log('📁 Pulizia file caricati...');
        const uploadStats = await cleanupUploadedFiles();
        stats.files_removed += uploadStats.files_removed;
        stats.space_freed += uploadStats.space_freed;

        // 3. Pulizia file temporanei
        console.log('🗑️ Pulizia file temporanei...');
        const tempStats = await cleanupTempFiles();
        stats.temp_files_removed = tempStats.files_removed;
        stats.space_freed += tempStats.space_freed;

        // 4. Log risultati
        console.log('📊 Risultati pulizia:');
        console.log(`  - Analisi rimosse: ${stats.analyses_removed}`);
        console.log(`  - File rimossi: ${stats.files_removed}`);
        console.log(`  - File temporanei rimossi: ${stats.temp_files_removed}`);
        console.log(`  - Spazio liberato: ${formatBytes(stats.space_freed)}`);

        return stats;

    } catch (error) {
        console.error('❌ Errore durante pulizia:', error);
        throw error;
    }
}

/**
 * Pulisce i file caricati che non hanno più analisi associate
 */
async function cleanupUploadedFiles() {
    const stats = { files_removed: 0, space_freed: 0 };
    const uploadDir = process.env.UPLOAD_DIR || './uploads';

    try {
        const db = getDatabase();

        // Ottieni tutti i file caricati dal database
        const dbFiles = await db.all('SELECT file_path, file_size FROM uploaded_files');
        const dbFilePaths = new Set(dbFiles.map(f => f.file_path));

        // Leggi tutti i file nella directory uploads
        let files;
        try {
            files = await fs.readdir(uploadDir);
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('📁 Directory uploads non esiste, salto pulizia file caricati');
                return stats;
            }
            throw error;
        }

        // Rimuovi file non presenti nel database
        for (const fileName of files) {
            const filePath = path.join(uploadDir, fileName);
            
            if (!dbFilePaths.has(filePath)) {
                try {
                    const fileStats = await fs.stat(filePath);
                    await fs.unlink(filePath);
                    
                    stats.files_removed++;
                    stats.space_freed += fileStats.size;
                    
                    console.log(`🗑️ File orfano rimosso: ${fileName}`);
                } catch (unlinkError) {
                    console.warn(`⚠️ Impossibile rimuovere file ${fileName}:`, unlinkError.message);
                }
            }
        }

        return stats;

    } catch (error) {
        console.error('❌ Errore pulizia file caricati:', error);
        return stats;
    }
}

/**
 * Pulisce i file temporanei vecchi
 */
async function cleanupTempFiles() {
    const stats = { files_removed: 0, space_freed: 0 };
    const tempDir = process.env.TEMP_DIR || './temp';
    const maxAge = 24 * 60 * 60 * 1000; // 24 ore in millisecondi

    try {
        let files;
        try {
            files = await fs.readdir(tempDir);
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('📁 Directory temp non esiste, salto pulizia file temporanei');
                return stats;
            }
            throw error;
        }

        const now = Date.now();

        for (const fileName of files) {
            const filePath = path.join(tempDir, fileName);
            
            try {
                const fileStats = await fs.stat(filePath);
                const fileAge = now - fileStats.mtime.getTime();

                if (fileAge > maxAge) {
                    await fs.unlink(filePath);
                    
                    stats.files_removed++;
                    stats.space_freed += fileStats.size;
                    
                    console.log(`🗑️ File temporaneo rimosso: ${fileName} (età: ${Math.round(fileAge / 1000 / 60 / 60)}h)`);
                }
            } catch (error) {
                console.warn(`⚠️ Impossibile elaborare file temporaneo ${fileName}:`, error.message);
            }
        }

        return stats;

    } catch (error) {
        console.error('❌ Errore pulizia file temporanei:', error);
        return stats;
    }
}

/**
 * Pulizia manuale (endpoint API)
 */
async function manualCleanup() {
    console.log('🧹 Pulizia manuale avviata...');
    
    try {
        const stats = await performCleanup();
        return {
            success: true,
            stats: stats,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error('❌ Errore pulizia manuale:', error);
        return {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Ottiene statistiche sui file e spazio utilizzato
 */
async function getStorageStats() {
    const stats = {
        upload_dir: {
            path: process.env.UPLOAD_DIR || './uploads',
            files: 0,
            size: 0,
            exists: false
        },
        temp_dir: {
            path: process.env.TEMP_DIR || './temp',
            files: 0,
            size: 0,
            exists: false
        },
        database: {
            path: process.env.DB_PATH || './data/debatelens.db',
            size: 0,
            exists: false
        },
        total_size: 0
    };

    try {
        // Upload directory
        try {
            const uploadFiles = await fs.readdir(stats.upload_dir.path);
            stats.upload_dir.exists = true;
            stats.upload_dir.files = uploadFiles.length;
            
            for (const file of uploadFiles) {
                try {
                    const filePath = path.join(stats.upload_dir.path, file);
                    const fileStats = await fs.stat(filePath);
                    stats.upload_dir.size += fileStats.size;
                } catch (error) {
                    // Ignora errori per singoli file
                }
            }
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.warn('⚠️ Errore lettura upload directory:', error.message);
            }
        }

        // Temp directory
        try {
            const tempFiles = await fs.readdir(stats.temp_dir.path);
            stats.temp_dir.exists = true;
            stats.temp_dir.files = tempFiles.length;
            
            for (const file of tempFiles) {
                try {
                    const filePath = path.join(stats.temp_dir.path, file);
                    const fileStats = await fs.stat(filePath);
                    stats.temp_dir.size += fileStats.size;
                } catch (error) {
                    // Ignora errori per singoli file
                }
            }
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.warn('⚠️ Errore lettura temp directory:', error.message);
            }
        }

        // Database
        try {
            const dbStats = await fs.stat(stats.database.path);
            stats.database.exists = true;
            stats.database.size = dbStats.size;
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.warn('⚠️ Errore lettura database:', error.message);
            }
        }

        // Totale
        stats.total_size = stats.upload_dir.size + stats.temp_dir.size + stats.database.size;

        // Formatta dimensioni
        stats.upload_dir.size_formatted = formatBytes(stats.upload_dir.size);
        stats.temp_dir.size_formatted = formatBytes(stats.temp_dir.size);
        stats.database.size_formatted = formatBytes(stats.database.size);
        stats.total_size_formatted = formatBytes(stats.total_size);

        return stats;

    } catch (error) {
        console.error('❌ Errore calcolo statistiche storage:', error);
        throw error;
    }
}

/**
 * Pulisce file specifici per un'analisi
 */
async function cleanupAnalysisFiles(analysisId) {
    try {
        const db = getDatabase();
        
        // Ottieni file associati all'analisi
        const files = await db.all(
            'SELECT file_path FROM uploaded_files WHERE analysis_id = ?',
            [analysisId]
        );

        let removedCount = 0;
        let freedSpace = 0;

        for (const file of files) {
            try {
                const fileStats = await fs.stat(file.file_path);
                await fs.unlink(file.file_path);
                
                removedCount++;
                freedSpace += fileStats.size;
                
                console.log(`🗑️ File rimosso per analisi ${analysisId}: ${path.basename(file.file_path)}`);
            } catch (error) {
                console.warn(`⚠️ Impossibile rimuovere file ${file.file_path}:`, error.message);
            }
        }

        return {
            files_removed: removedCount,
            space_freed: freedSpace
        };

    } catch (error) {
        console.error(`❌ Errore pulizia file analisi ${analysisId}:`, error);
        throw error;
    }
}

/**
 * Formatta i bytes in formato leggibile
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Verifica lo spazio disponibile su disco
 */
async function checkDiskSpace() {
    try {
        const { execSync } = require('child_process');
        
        // Su Windows usa fsutil, su Unix usa df
        let command, parser;
        
        if (process.platform === 'win32') {
            command = `fsutil volume diskfree ${process.cwd().split(':')[0]}:`;
            parser = (output) => {
                const lines = output.split('\n');
                const freeBytesLine = lines.find(line => line.includes('Free bytes'));
                if (freeBytesLine) {
                    const match = freeBytesLine.match(/:\s*(\d+)/);
                    return match ? parseInt(match[1]) : null;
                }
                return null;
            };
        } else {
            command = `df ${process.cwd()}`;
            parser = (output) => {
                const lines = output.split('\n');
                if (lines.length > 1) {
                    const parts = lines[1].split(/\s+/);
                    return parts.length > 3 ? parseInt(parts[3]) * 1024 : null;
                }
                return null;
            };
        }

        const output = execSync(command, { encoding: 'utf-8' });
        const freeSpace = parser(output);

        return {
            free_space: freeSpace,
            free_space_formatted: freeSpace ? formatBytes(freeSpace) : 'N/A',
            platform: process.platform
        };

    } catch (error) {
        console.warn('⚠️ Impossibile ottenere spazio libero su disco:', error.message);
        return {
            free_space: null,
            free_space_formatted: 'N/A',
            platform: process.platform,
            error: error.message
        };
    }
}

module.exports = {
    setupCleanupJob,
    performCleanup,
    manualCleanup,
    getStorageStats,
    cleanupAnalysisFiles,
    checkDiskSpace,
    formatBytes
}; 