// ============================================================================
// Database Utility - SQLite
// Gestisce la memorizzazione delle analisi e dei risultati
// ============================================================================

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises;

class Database {
    constructor() {
        this.dbPath = process.env.DB_PATH || './data/debatelens.db';
        this.db = null;
    }

    /**
     * Inizializza la connessione al database
     */
    async initialize() {
        try {
            // Crea directory se non esiste
            const dbDir = path.dirname(this.dbPath);
            try {
                await fs.access(dbDir);
            } catch {
                await fs.mkdir(dbDir, { recursive: true });
            }

            // Connetti al database
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('❌ Errore connessione database:', err);
                    throw err;
                } else {
                    console.log('✅ Database SQLite connesso');
                }
            });

            // Abilita foreign keys
            await this.run('PRAGMA foreign_keys = ON');

            // Crea le tabelle
            await this.createTables();

        } catch (error) {
            console.error('❌ Errore inizializzazione database:', error);
            throw error;
        }
    }

    /**
     * Crea le tabelle del database
     */
    async createTables() {
        const tables = [
            // Tabella per le analisi principali
            `CREATE TABLE IF NOT EXISTS analyses (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                topic TEXT,
                source_type TEXT NOT NULL CHECK (source_type IN ('text', 'video', 'youtube')),
                source_data TEXT,
                speakers TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'error')),
                error_message TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                completed_at DATETIME,
                metadata TEXT
            )`,

            // Tabella per i risultati delle analisi individuali
            `CREATE TABLE IF NOT EXISTS speaker_analyses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                analysis_id TEXT NOT NULL,
                speaker_name TEXT NOT NULL,
                rigore_tecnico REAL NOT NULL,
                uso_dati REAL NOT NULL,
                stile_comunicativo REAL NOT NULL,
                focalizzazione REAL NOT NULL,
                orientamento_pratico REAL NOT NULL,
                approccio_divulgativo REAL NOT NULL,
                explanations TEXT,
                highlights TEXT,
                improvements TEXT,
                overall_assessment TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (analysis_id) REFERENCES analyses (id) ON DELETE CASCADE
            )`,

            // Tabella per i confronti
            `CREATE TABLE IF NOT EXISTS comparisons (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                analysis_id TEXT NOT NULL,
                winner_overall TEXT,
                category_winners TEXT,
                summary TEXT,
                key_differences TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (analysis_id) REFERENCES analyses (id) ON DELETE CASCADE
            )`,

            // Tabella per i file caricati
            `CREATE TABLE IF NOT EXISTS uploaded_files (
                id TEXT PRIMARY KEY,
                analysis_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                original_name TEXT NOT NULL,
                file_path TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                mime_type TEXT NOT NULL,
                uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (analysis_id) REFERENCES analyses (id) ON DELETE CASCADE
            )`,

            // Tabella per le trascrizioni
            `CREATE TABLE IF NOT EXISTS transcriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                analysis_id TEXT NOT NULL,
                text TEXT NOT NULL,
                language TEXT DEFAULT 'it',
                duration REAL,
                source TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (analysis_id) REFERENCES analyses (id) ON DELETE CASCADE
            )`
        ];

        for (const tableSQL of tables) {
            await this.run(tableSQL);
        }

        // Crea indici per performance
        const indices = [
            'CREATE INDEX IF NOT EXISTS idx_analyses_status ON analyses (status)',
            'CREATE INDEX IF NOT EXISTS idx_analyses_created_at ON analyses (created_at)',
            'CREATE INDEX IF NOT EXISTS idx_speaker_analyses_analysis_id ON speaker_analyses (analysis_id)',
            'CREATE INDEX IF NOT EXISTS idx_uploaded_files_analysis_id ON uploaded_files (analysis_id)'
        ];

        for (const indexSQL of indices) {
            await this.run(indexSQL);
        }

        console.log('✅ Tabelle database create/verificate');
    }

    /**
     * Esegue una query senza risultati
     */
    async run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) {
                    console.error('❌ Errore query:', err, sql);
                    reject(err);
                } else {
                    resolve({ lastID: this.lastID, changes: this.changes });
                }
            });
        });
    }

    /**
     * Esegue una query che ritorna una riga
     */
    async get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) {
                    console.error('❌ Errore query:', err, sql);
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    /**
     * Esegue una query che ritorna più righe
     */
    async all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    console.error('❌ Errore query:', err, sql);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // ========================================================================
    // Metodi per le Analisi
    // ========================================================================

    /**
     * Crea una nuova analisi
     */
    async createAnalysis(analysisData) {
        const {
            id,
            title,
            topic,
            sourceType,
            sourceData,
            speakers,
            metadata = {}
        } = analysisData;

        const sql = `
            INSERT INTO analyses (id, title, topic, source_type, source_data, speakers, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        const params = [
            id,
            title,
            topic,
            sourceType,
            sourceData,
            JSON.stringify(speakers),
            JSON.stringify(metadata)
        ];

        await this.run(sql, params);
        console.log(`✅ Analisi creata: ${id}`);
        return id;
    }

    /**
     * Aggiorna lo status di un'analisi
     */
    async updateAnalysisStatus(analysisId, status, errorMessage = null) {
        const sql = `
            UPDATE analyses 
            SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP,
                completed_at = CASE WHEN ? = 'completed' THEN CURRENT_TIMESTAMP ELSE completed_at END
            WHERE id = ?
        `;

        await this.run(sql, [status, errorMessage, status, analysisId]);
        console.log(`📊 Status analisi ${analysisId}: ${status}`);
    }

    /**
     * Salva i risultati dell'analisi di un speaker
     */
    async saveSpeakerAnalysis(analysisId, speakerData) {
        const {
            speaker,
            scores,
            explanations,
            highlights,
            improvements,
            overall_assessment
        } = speakerData;

        const sql = `
            INSERT INTO speaker_analyses (
                analysis_id, speaker_name, rigore_tecnico, uso_dati, 
                stile_comunicativo, focalizzazione, orientamento_pratico, 
                approccio_divulgativo, explanations, highlights, 
                improvements, overall_assessment
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const params = [
            analysisId,
            speaker,
            scores.rigore_tecnico,
            scores.uso_dati,
            scores.stile_comunicativo,
            scores.focalizzazione,
            scores.orientamento_pratico,
            scores.approccio_divulgativo,
            JSON.stringify(explanations),
            JSON.stringify(highlights),
            JSON.stringify(improvements),
            overall_assessment
        ];

        await this.run(sql, params);
        console.log(`✅ Analisi speaker salvata: ${speaker}`);
    }

    /**
     * Salva il confronto tra speaker
     */
    async saveComparison(analysisId, comparisonData) {
        const {
            winner_overall,
            category_winners,
            summary,
            key_differences
        } = comparisonData;

        const sql = `
            INSERT INTO comparisons (
                analysis_id, winner_overall, category_winners, 
                summary, key_differences
            ) VALUES (?, ?, ?, ?, ?)
        `;

        const params = [
            analysisId,
            winner_overall,
            JSON.stringify(category_winners),
            summary,
            JSON.stringify(key_differences)
        ];

        await this.run(sql, params);
        console.log(`✅ Confronto salvato per analisi: ${analysisId}`);
    }

    /**
     * Salva informazioni su un file caricato
     */
    async saveUploadedFile(fileData) {
        const {
            id,
            analysisId,
            filename,
            originalName,
            filePath,
            fileSize,
            mimeType
        } = fileData;

        const sql = `
            INSERT INTO uploaded_files (
                id, analysis_id, filename, original_name, 
                file_path, file_size, mime_type
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        const params = [
            id,
            analysisId,
            filename,
            originalName,
            filePath,
            fileSize,
            mimeType
        ];

        await this.run(sql, params);
        console.log(`✅ File salvato: ${originalName}`);
    }

    /**
     * Salva una trascrizione
     */
    async saveTranscription(transcriptionData) {
        const {
            analysisId,
            text,
            language,
            duration,
            source
        } = transcriptionData;

        const sql = `
            INSERT INTO transcriptions (
                analysis_id, text, language, duration, source
            ) VALUES (?, ?, ?, ?, ?)
        `;

        const params = [
            analysisId,
            text,
            language,
            duration,
            source
        ];

        await this.run(sql, params);
        console.log(`✅ Trascrizione salvata per analisi: ${analysisId}`);
    }

    // ========================================================================
    // Metodi di Lettura
    // ========================================================================

    /**
     * Ottiene un'analisi completa
     */
    async getAnalysis(analysisId) {
        // Analisi principale
        const analysis = await this.get(
            'SELECT * FROM analyses WHERE id = ?',
            [analysisId]
        );

        if (!analysis) {
            return null;
        }

        // Parser dei JSON
        analysis.speakers = JSON.parse(analysis.speakers);
        analysis.metadata = JSON.parse(analysis.metadata || '{}');

        // Analisi speaker
        const speakerAnalyses = await this.all(
            `SELECT * FROM speaker_analyses WHERE analysis_id = ? ORDER BY speaker_name`,
            [analysisId]
        );

        // Parser dei JSON per ogni speaker
        speakerAnalyses.forEach(speaker => {
            speaker.explanations = JSON.parse(speaker.explanations || '{}');
            speaker.highlights = JSON.parse(speaker.highlights || '[]');
            speaker.improvements = JSON.parse(speaker.improvements || '[]');
        });

        // Confronto
        const comparison = await this.get(
            'SELECT * FROM comparisons WHERE analysis_id = ?',
            [analysisId]
        );

        if (comparison) {
            comparison.category_winners = JSON.parse(comparison.category_winners || '{}');
            comparison.key_differences = JSON.parse(comparison.key_differences || '[]');
        }

        // Trascrizione
        const transcription = await this.get(
            'SELECT * FROM transcriptions WHERE analysis_id = ?',
            [analysisId]
        );

        // File caricati
        const files = await this.all(
            'SELECT * FROM uploaded_files WHERE analysis_id = ?',
            [analysisId]
        );

        return {
            ...analysis,
            speaker_analyses: speakerAnalyses,
            comparison: comparison,
            transcription: transcription,
            files: files
        };
    }

    /**
     * Lista tutte le analisi con paginazione
     */
    async getAnalysesList(page = 1, limit = 10, status = null) {
        const offset = (page - 1) * limit;
        
        let sql = `
            SELECT id, title, topic, source_type, speakers, status, 
                   created_at, completed_at, metadata
            FROM analyses
        `;
        
        let params = [];
        
        if (status) {
            sql += ' WHERE status = ?';
            params.push(status);
        }
        
        sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const analyses = await this.all(sql, params);
        
        // Parser JSON per ogni analisi
        analyses.forEach(analysis => {
            analysis.speakers = JSON.parse(analysis.speakers);
            analysis.metadata = JSON.parse(analysis.metadata || '{}');
        });

        // Conta totale
        let countSql = 'SELECT COUNT(*) as total FROM analyses';
        let countParams = [];
        
        if (status) {
            countSql += ' WHERE status = ?';
            countParams.push(status);
        }
        
        const { total } = await this.get(countSql, countParams);

        return {
            analyses,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        };
    }

    /**
     * Elimina un'analisi e tutti i dati correlati
     */
    async deleteAnalysis(analysisId) {
        // SQLite con foreign keys abilitate eliminerà automaticamente i dati correlati
        await this.run('DELETE FROM analyses WHERE id = ?', [analysisId]);
        console.log(`🗑️ Analisi eliminata: ${analysisId}`);
    }

    /**
     * Ottiene statistiche generali
     */
    async getStats() {
        const stats = {};

        // Totale analisi
        const { total_analyses } = await this.get(
            'SELECT COUNT(*) as total_analyses FROM analyses'
        );
        stats.total_analyses = total_analyses;

        // Analisi per status
        const statusCounts = await this.all(`
            SELECT status, COUNT(*) as count 
            FROM analyses 
            GROUP BY status
        `);
        stats.by_status = {};
        statusCounts.forEach(({ status, count }) => {
            stats.by_status[status] = count;
        });

        // Analisi per tipo di sorgente
        const sourceCounts = await this.all(`
            SELECT source_type, COUNT(*) as count 
            FROM analyses 
            GROUP BY source_type
        `);
        stats.by_source = {};
        sourceCounts.forEach(({ source_type, count }) => {
            stats.by_source[source_type] = count;
        });

        // Analisi più recenti
        const recent = await this.all(`
            SELECT id, title, status, created_at 
            FROM analyses 
            ORDER BY created_at DESC 
            LIMIT 5
        `);
        stats.recent_analyses = recent;

        return stats;
    }

    /**
     * Pulizia dei dati vecchi
     */
    async cleanup(maxAgeHours = 48) {
        const cutoffDate = new Date(Date.now() - (maxAgeHours * 60 * 60 * 1000));
        const cutoffString = cutoffDate.toISOString();

        const result = await this.run(`
            DELETE FROM analyses 
            WHERE status IN ('completed', 'error') 
            AND created_at < ?
        `, [cutoffString]);

        console.log(`🧹 Pulizia database: ${result.changes} analisi rimosse`);
        return result.changes;
    }

    /**
     * Chiude la connessione al database
     */
    async close() {
        if (this.db) {
            await new Promise((resolve, reject) => {
                this.db.close((err) => {
                    if (err) {
                        console.error('❌ Errore chiusura database:', err);
                        reject(err);
                    } else {
                        console.log('✅ Database chiuso correttamente');
                        resolve();
                    }
                });
            });
        }
    }
}

// Singleton instance
let dbInstance = null;

/**
 * Inizializza il database
 */
async function initializeDatabase() {
    if (!dbInstance) {
        dbInstance = new Database();
        await dbInstance.initialize();
    }
    return dbInstance;
}

/**
 * Ottiene l'istanza del database
 */
function getDatabase() {
    if (!dbInstance) {
        throw new Error('Database non inizializzato. Chiama initializeDatabase() prima.');
    }
    return dbInstance;
}

module.exports = {
    initializeDatabase,
    getDatabase,
    Database
}; 