// ============================================================================
// Transcription Service
// Gestisce la trascrizione di video e audio in testo usando Whisper locale
// ============================================================================

const fs = require('fs').promises;
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');

// Configurazione FFmpeg
const os = require('os');
if (os.platform() === 'win32') {
    // Possibili percorsi per FFmpeg su Windows
    const possiblePaths = [
        'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
        'C:\\ffmpeg\\bin\\ffmpeg.exe',
        'C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe',
        process.env.USERPROFILE + '\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-7.1.1-full_build\\bin\\ffmpeg.exe'
    ];
    
    for (const ffmpegPath of possiblePaths) {
        try {
            require('fs').accessSync(ffmpegPath);
            ffmpeg.setFfmpegPath(ffmpegPath);
            console.log(`✅ FFmpeg trovato: ${ffmpegPath}`);
            break;
        } catch (e) {
            // Continua con il prossimo percorso
        }
    }
}

// Prova prima ytdl-core, poi fallback a @distube/ytdl-core
let ytdl;
try {
    ytdl = require('@distube/ytdl-core');
    console.log('✅ Usando @distube/ytdl-core');
} catch (e) {
    try {
        ytdl = require('ytdl-core');
        console.log('✅ Usando ytdl-core standard');
    } catch (e2) {
        console.error('❌ Nessuna libreria YouTube disponibile');
    }
}

class TranscriptionService {
    constructor() {
        this.tempDir = process.env.TEMP_DIR || './temp';
        this.maxFileSize = 100 * 1024 * 1024; // 100MB
        this.whisperModel = 'base'; // small, base, large per accuratezza crescente
        this.pythonPath = 'C:\\Users\\allin\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe';
    }

    /**
     * Trascrive un file audio/video usando Whisper locale
     * @param {string} filePath - Percorso del file da trascrivere  
     * @param {string} language - Lingua del contenuto (opzionale)
     * @returns {Promise<Object>} Risultato della trascrizione
     */
    async transcribeFile(filePath, language = 'it') {
        try {
            console.log(`🎙️ Inizio trascrizione file: ${path.basename(filePath)}`);
            
            // Verifica esistenza file
            await this.validateFile(filePath);
            
            // Converte in formato audio se necessario
            const audioPath = await this.convertToAudio(filePath);
            
            // Effettua la trascrizione con Whisper locale
            const transcription = await this.callLocalWhisper(audioPath, language);
            
            // Pulizia file temporanei
            await this.cleanupTempFiles([audioPath]);
            
            return {
                success: true,
                text: transcription,
                language: language,
                duration: await this.getAudioDuration(audioPath),
                timestamp: new Date().toISOString(),
                model: this.whisperModel
            };
            
        } catch (error) {
            console.error('❌ Errore trascrizione:', error);
            throw new Error(`Errore durante la trascrizione: ${error.message}`);
        }
    }

    /**
     * Trascrive un video da URL YouTube
     * @param {string} youtubeUrl - URL del video YouTube
     * @param {string} language - Lingua del contenuto
     * @returns {Promise<Object>} Risultato della trascrizione
     */
    async transcribeYouTubeVideo(youtubeUrl, language = 'it') {
        try {
            console.log(`📺 Inizio trascrizione video YouTube: ${youtubeUrl}`);
            
            // Scarica l'audio dal video YouTube
            const audioPath = await this.downloadYouTubeAudio(youtubeUrl);
            
            // Trascrive l'audio scaricato
            const result = await this.transcribeFile(audioPath, language);
            
            // Pulizia file temporaneo
            await this.cleanupTempFiles([audioPath]);
            
            return {
                ...result,
                source: 'youtube',
                url: youtubeUrl
            };
            
        } catch (error) {
            console.error('❌ Errore trascrizione YouTube:', error);
            throw new Error(`Errore durante la trascrizione del video YouTube: ${error.message}`);
        }
    }

    /**
     * Valida il file prima della trascrizione
     */
    async validateFile(filePath) {
        try {
            const stats = await fs.stat(filePath);
            
            if (!stats.isFile()) {
                throw new Error('Il percorso specificato non è un file valido');
            }
            
            if (stats.size === 0) {
                throw new Error('Il file è vuoto');
            }
            
            if (stats.size > 100 * 1024 * 1024) { // 100MB
                throw new Error('Il file è troppo grande (massimo 100MB)');
            }
            
            // Verifica estensione
            const ext = path.extname(filePath).toLowerCase();
            const supportedFormats = ['.mp3', '.mp4', '.wav', '.flac', '.m4a', '.ogg', '.webm', '.avi', '.mov'];
            
            if (!supportedFormats.includes(ext)) {
                throw new Error(`Formato file non supportato. Formati supportati: ${supportedFormats.join(', ')}`);
            }
            
        } catch (error) {
            throw new Error(`Errore validazione file: ${error.message}`);
        }
    }

    /**
     * Converte il file in formato audio
     */
    async convertToAudio(inputPath) {
        return new Promise((resolve, reject) => {
            const ext = path.extname(inputPath).toLowerCase();
            const audioFormats = ['.mp3', '.wav', '.flac', '.m4a', '.ogg'];
            
            // Se è già un file audio, ritorna il percorso originale
            if (audioFormats.includes(ext)) {
                resolve(inputPath);
                return;
            }
            
            // Converte video in audio
            const outputPath = path.join(this.tempDir, `${uuidv4()}.mp3`);
            
            ffmpeg(inputPath)
                .toFormat('mp3')
                .audioCodec('libmp3lame')
                .audioBitrate('128k')
                .audioChannels(1) // Mono per ridurre dimensioni
                .audioFrequency(16000) // 16kHz per Whisper
                .on('end', () => {
                    console.log('✅ Conversione audio completata');
                    resolve(outputPath);
                })
                .on('error', (err) => {
                    console.error('❌ Errore conversione audio:', err);
                    reject(new Error(`Errore durante la conversione: ${err.message}`));
                })
                .save(outputPath);
        });
    }

    /**
     * Chiama Whisper locale tramite Python
     */
    async callLocalWhisper(audioPath, language) {
        return new Promise(async (resolve, reject) => {
            console.log(`🤖 Trascrizione con Whisper locale (modello: ${this.whisperModel})`);
            
            const outputDir = path.join(this.tempDir, `whisper_${uuidv4()}`);
            
            // Crea directory output se non esistente
            await fs.mkdir(outputDir, { recursive: true });
            
            // Usa percorsi assoluti per evitare problemi
            const absoluteAudioPath = path.resolve(audioPath);
            const absoluteOutputDir = path.resolve(outputDir);
            
            const args = [
                absoluteAudioPath,
                '--model', this.whisperModel,
                '--language', language,
                '--output_dir', absoluteOutputDir,
                '--output_format', 'txt',
                '--verbose', 'False'
            ];

            // Se la lingua è italiana, aggiungi parametri specifici
            if (language === 'it') {
                args.push('--task', 'transcribe');
            }

            // Usa sempre python -m whisper per compatibilità
            console.log('🐍 Usando python -m whisper');
            
            // Configura l'ambiente per Whisper con il percorso di FFmpeg
            const env = { ...process.env };
            const ffmpegDir = path.dirname(process.env.USERPROFILE + '\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-7.1.1-full_build\\bin\\ffmpeg.exe');
            env.PATH = `${ffmpegDir};${env.PATH}`;
            env.FFMPEG_BINARY = path.join(ffmpegDir, 'ffmpeg.exe');
            
            console.log(`🔧 FFmpeg path configurato: ${ffmpegDir}`);
            
                          // Usa il percorso completo di Python configurato
              const whisperProcess = spawn(this.pythonPath, ['-m', 'whisper', ...args], { env });
            
            let stdout = '';
            let stderr = '';
            
            whisperProcess.stdout.on('data', (data) => {
                stdout += data.toString();
                console.log('🔍 Whisper stdout:', data.toString().trim());
                // Mostra progresso se disponibile
                const progress = data.toString().match(/(\d+)%/);
                if (progress) {
                    console.log(`📊 Progresso trascrizione: ${progress[1]}%`);
                }
            });
            
            whisperProcess.stderr.on('data', (data) => {
                stderr += data.toString();
                console.log('🔍 Whisper stderr:', data.toString().trim());
            });
            
            whisperProcess.on('close', async (code) => {
                try {
                    if (code !== 0) {
                        console.error('❌ Errore Whisper:', stderr);
                        reject(new Error(`Whisper terminato con codice ${code}: ${stderr}`));
                        return;
                    }
                    
                    // Trova il file di trascrizione generato (Whisper potrebbe usare nomi diversi)
                    const files = await fs.readdir(outputDir);
                    const txtFiles = files.filter(file => file.endsWith('.txt'));
                    
                    if (txtFiles.length === 0) {
                        console.error(`❌ Nessun file .txt trovato in ${outputDir}. File presenti:`, files);
                        reject(new Error('Nessun file di trascrizione trovato'));
                        return;
                    }
                    
                    // Prendi il primo file .txt trovato
                    const transcriptionFile = path.join(outputDir, txtFiles[0]);
                    console.log(`📄 File trascrizione trovato: ${txtFiles[0]}`);
                    
                    const transcription = await fs.readFile(transcriptionFile, 'utf8');
                    
                    // Pulizia directory temporanea
                    await this.cleanupDirectory(outputDir);
                    
                    console.log('✅ Trascrizione completata con Whisper locale');
                    resolve(transcription.trim());
                    
                } catch (error) {
                    console.error('❌ Errore lettura trascrizione:', error);
                    reject(new Error(`Errore lettura risultato: ${error.message}`));
                }
            });
            
            whisperProcess.on('error', (error) => {
                console.error('❌ Errore avvio Whisper:', error);
                reject(new Error(`Impossibile avviare Whisper: ${error.message}. Assicurati che Python e Whisper siano installati.`));
            });
        });
    }

    /**
     * Scarica l'audio da un video YouTube usando yt-dlp
     */
    async downloadYouTubeAudio(youtubeUrl) {
        return new Promise((resolve, reject) => {
            try {
                console.log(`📺 Download YouTube con yt-dlp: ${youtubeUrl}`);
                
                const outputPath = path.join(this.tempDir, `${uuidv4()}_youtube.%(ext)s`);
                const finalPath = path.join(this.tempDir, `${uuidv4()}_youtube.mp3`);
                
                // Usa il percorso di FFmpeg configurato
                const ffmpegPath = process.env.USERPROFILE + '\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-7.1.1-full_build\\bin';
                
                // Usa yt-dlp per scaricare l'audio
                const ytDlpArgs = [
                    '-m', 'yt_dlp',
                    '--extract-audio',
                    '--audio-format', 'mp3',
                    '--audio-quality', '128K',
                    '--no-playlist',
                    '--no-warnings',
                    '--quiet',
                    '--output', outputPath,
                ];
                
                // Aggiungi percorso FFmpeg
                ytDlpArgs.push('--ffmpeg-location', ffmpegPath);
                
                ytDlpArgs.push(youtubeUrl);
                
                                  // Usa il percorso completo di Python configurato
                  const ytDlpProcess = spawn(this.pythonPath, ytDlpArgs);
                
                let stderr = '';
                
                ytDlpProcess.stderr.on('data', (data) => {
                    stderr += data.toString();
                });
                
                ytDlpProcess.on('close', async (code) => {
                    try {
                        if (code !== 0) {
                            console.error('❌ Errore yt-dlp:', stderr);
                            
                            // Fallback con ytdl-core se disponibile
                            if (ytdl) {
                                console.log('🔄 Tentativo fallback con ytdl-core...');
                                return this.downloadYouTubeAudioFallback(youtubeUrl)
                                    .then(resolve)
                                    .catch(reject);
                            }
                            
                            reject(new Error(`yt-dlp failed (code ${code}): ${stderr}`));
                            return;
                        }
                        
                        // Trova il file scaricato
                        const tempDir = path.dirname(outputPath);
                        const files = await fs.readdir(tempDir);
                        const downloadedFile = files.find(file => 
                            file.includes(path.basename(outputPath, path.extname(outputPath))) && 
                            file.endsWith('.mp3')
                        );
                        
                        if (!downloadedFile) {
                            reject(new Error('File audio non trovato dopo il download'));
                            return;
                        }
                        
                        const downloadedPath = path.join(tempDir, downloadedFile);
                        console.log('✅ Download YouTube completato con yt-dlp');
                        resolve(downloadedPath);
                        
                    } catch (error) {
                        reject(new Error(`Errore post-download: ${error.message}`));
                    }
                });
                
                ytDlpProcess.on('error', (error) => {
                    console.error('❌ Errore avvio yt-dlp:', error);
                    
                    // Fallback con ytdl-core se disponibile
                    if (ytdl) {
                        console.log('🔄 Tentativo fallback con ytdl-core...');
                        return this.downloadYouTubeAudioFallback(youtubeUrl)
                            .then(resolve)
                            .catch(reject);
                    }
                    
                    reject(new Error(`Impossibile avviare yt-dlp: ${error.message}`));
                });
                
            } catch (error) {
                reject(new Error(`Errore inizializzazione download YouTube: ${error.message}`));
            }
        });
    }

    /**
     * Fallback per download YouTube con ytdl-core
     */
    async downloadYouTubeAudioFallback(youtubeUrl) {
        return new Promise((resolve, reject) => {
            try {
                if (!ytdl || !ytdl.validateURL(youtubeUrl)) {
                    reject(new Error('URL YouTube non valido o libreria non disponibile'));
                    return;
                }
                
                const outputPath = path.join(this.tempDir, `${uuidv4()}_youtube_fallback.mp3`);
                
                const stream = ytdl(youtubeUrl, {
                    quality: 'highestaudio',
                    filter: 'audioonly'
                });
                
                ffmpeg(stream)
                    .toFormat('mp3')
                    .audioCodec('libmp3lame')
                    .audioBitrate('128k')
                    .audioChannels(1)
                    .audioFrequency(16000)
                    .on('end', () => {
                        console.log('✅ Download YouTube completato (fallback)');
                        resolve(outputPath);
                    })
                    .on('error', (err) => {
                        console.error('❌ Errore download YouTube (fallback):', err);
                        reject(new Error(`Errore durante il download fallback: ${err.message}`));
                    })
                    .save(outputPath);
                
            } catch (error) {
                reject(new Error(`Errore fallback: ${error.message}`));
            }
        });
    }

    /**
     * Ottiene la durata di un file audio
     */
    async getAudioDuration(audioPath) {
        return new Promise((resolve, reject) => {
            ffmpeg.ffprobe(audioPath, (err, metadata) => {
                if (err) {
                    console.warn('⚠️ Impossibile ottenere durata audio:', err);
                    resolve(null);
                } else {
                    resolve(metadata.format.duration);
                }
            });
        });
    }

    /**
     * Pulizia file temporanei
     */
    async cleanupTempFiles(filePaths) {
        for (const filePath of filePaths) {
            try {
                if (filePath && filePath !== '' && filePath.includes(this.tempDir)) {
                    await fs.unlink(filePath);
                    console.log(`🗑️ File temporaneo rimosso: ${path.basename(filePath)}`);
                }
            } catch (error) {
                console.warn(`⚠️ Impossibile rimuovere file temporaneo ${filePath}:`, error.message);
            }
        }
    }

    /**
     * Testa la connessione a Whisper locale
     */
    async testConnection() {
        try {
            console.log('🧪 Test connessione Whisper locale...');
            
            // Verifica se Whisper è installato
                          // Usa il percorso completo di Python configurato
              const whisperProcess = spawn(this.pythonPath, ['-m', 'whisper', '--help']);
            
            return new Promise((resolve, reject) => {
                whisperProcess.on('close', (code) => {
                    if (code === 0) {
                        console.log('✅ Whisper locale disponibile');
                        resolve(true);
                    } else {
                        console.log('❌ Whisper locale non disponibile');
                        resolve(false);
                    }
                });
                
                whisperProcess.on('error', () => {
                    console.log('❌ Python o Whisper non installato');
                    resolve(false);
                });
            });
            
        } catch (error) {
            console.error('❌ Errore test Whisper:', error);
            return false;
        }
    }

    /**
     * Installa Whisper se non presente
     */
    async installWhisper() {
        return new Promise((resolve, reject) => {
            console.log('📦 Installazione Whisper...');
            
            const installProcess = spawn('pip', ['install', 'openai-whisper']);
            
            installProcess.stdout.on('data', (data) => {
                console.log(data.toString());
            });
            
            installProcess.stderr.on('data', (data) => {
                console.log(data.toString());
            });
            
            installProcess.on('close', (code) => {
                if (code === 0) {
                    console.log('✅ Whisper installato con successo');
                    resolve(true);
                } else {
                    console.log('❌ Errore installazione Whisper');
                    reject(new Error('Impossibile installare Whisper'));
                }
            });
        });
    }

    /**
     * Pulisce una directory temporanea
     */
    async cleanupDirectory(dirPath) {
        try {
            const files = await fs.readdir(dirPath);
            for (const file of files) {
                await fs.unlink(path.join(dirPath, file));
            }
            await fs.rmdir(dirPath);
            console.log(`🧹 Directory ${dirPath} pulita`);
        } catch (error) {
            console.error(`❌ Errore pulizia directory ${dirPath}:`, error);
        }
    }

    /**
     * Segmenta un audio lungo in chunks più piccoli
     */
    async segmentAudio(audioPath, segmentDuration = 600) { // 10 minuti
        const segments = [];
        const duration = await this.getAudioDuration(audioPath);
        
        if (!duration || duration <= segmentDuration) {
            return [audioPath]; // Non serve segmentazione
        }
        
        const numSegments = Math.ceil(duration / segmentDuration);
        
        for (let i = 0; i < numSegments; i++) {
            const start = i * segmentDuration;
            const segmentPath = path.join(this.tempDir, `${uuidv4()}_segment_${i}.mp3`);
            
            await new Promise((resolve, reject) => {
                ffmpeg(audioPath)
                    .seekInput(start)
                    .duration(segmentDuration)
                    .toFormat('mp3')
                    .on('end', resolve)
                    .on('error', reject)
                    .save(segmentPath);
            });
            
            segments.push(segmentPath);
        }
        
        return segments;
    }

    /**
     * Trascrive un audio lungo segmentandolo
     */
    async transcribeLongAudio(audioPath, language = 'it') {
        try {
            const segments = await this.segmentAudio(audioPath);
            
            if (segments.length === 1) {
                return await this.transcribeFile(audioPath, language);
            }
            
            console.log(`📂 Trascrizione di ${segments.length} segmenti...`);
            
            const transcriptions = [];
            
            for (let i = 0; i < segments.length; i++) {
                console.log(`🔄 Trascrizione segmento ${i + 1}/${segments.length}...`);
                const segmentResult = await this.transcribeFile(segments[i], language);
                transcriptions.push(segmentResult.text);
            }
            
            // Pulizia segmenti temporanei
            await this.cleanupTempFiles(segments);
            
            return {
                success: true,
                text: transcriptions.join(' '),
                language: language,
                segments: transcriptions.length,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            console.error('❌ Errore trascrizione audio lungo:', error);
            throw error;
        }
    }
}

module.exports = TranscriptionService; 