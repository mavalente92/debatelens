#!/usr/bin/env node
// ============================================================================
// Script di Installazione Whisper per DebateLens
// Installa automaticamente Python Whisper per la trascrizione locale
// ============================================================================

const { spawn } = require('child_process');
const fs = require('fs');

console.log('🚀 Installazione Whisper per DebateLens...\n');

// Verifica se Python è installato
function checkPython() {
    return new Promise((resolve) => {
        const pythonProcess = spawn('python', ['--version']);
        
        pythonProcess.on('close', (code) => {
            if (code === 0) {
                console.log('✅ Python trovato');
                resolve(true);
            } else {
                console.log('❌ Python non trovato. Provo con python3...');
                
                const python3Process = spawn('python3', ['--version']);
                python3Process.on('close', (code3) => {
                    if (code3 === 0) {
                        console.log('✅ Python3 trovato');
                        resolve(true);
                    } else {
                        console.log('❌ Python non installato');
                        resolve(false);
                    }
                });
            }
        });
        
        pythonProcess.on('error', () => {
            console.log('❌ Python non trovato. Provo con python3...');
            
            const python3Process = spawn('python3', ['--version']);
            python3Process.on('close', (code3) => {
                if (code3 === 0) {
                    console.log('✅ Python3 trovato');
                    resolve(true);
                } else {
                    console.log('❌ Python non installato');
                    resolve(false);
                }
            });
            
            python3Process.on('error', () => {
                console.log('❌ Python non installato');
                resolve(false);
            });
        });
    });
}

// Verifica se pip è installato
function checkPip() {
    return new Promise((resolve) => {
        const pipProcess = spawn('pip', ['--version']);
        
        pipProcess.on('close', (code) => {
            if (code === 0) {
                console.log('✅ pip trovato');
                resolve('pip');
            } else {
                console.log('❌ pip non trovato. Provo con pip3...');
                
                const pip3Process = spawn('pip3', ['--version']);
                pip3Process.on('close', (code3) => {
                    if (code3 === 0) {
                        console.log('✅ pip3 trovato');
                        resolve('pip3');
                    } else {
                        console.log('❌ pip non installato');
                        resolve(false);
                    }
                });
            }
        });
        
        pipProcess.on('error', () => {
            console.log('❌ pip non trovato. Provo con pip3...');
            
            const pip3Process = spawn('pip3', ['--version']);
            pip3Process.on('close', (code3) => {
                if (code3 === 0) {
                    console.log('✅ pip3 trovato');
                    resolve('pip3');
                } else {
                    console.log('❌ pip non installato');
                    resolve(false);
                }
            });
            
            pip3Process.on('error', () => {
                console.log('❌ pip non installato');
                resolve(false);
            });
        });
    });
}

// Installa Whisper
function installWhisper(pipCommand) {
    return new Promise((resolve, reject) => {
        console.log('📦 Installazione Whisper in corso...');
        console.log('⚠️  Questa operazione può richiedere alcuni minuti\n');
        
        const installProcess = spawn(pipCommand, ['install', 'openai-whisper'], {
            stdio: 'inherit'
        });
        
        installProcess.on('close', (code) => {
            if (code === 0) {
                console.log('\n✅ Whisper installato con successo!');
                resolve(true);
            } else {
                console.log('\n❌ Errore durante l\'installazione di Whisper');
                reject(new Error('Installazione fallita'));
            }
        });
        
        installProcess.on('error', (error) => {
            console.log('\n❌ Errore durante l\'installazione:', error.message);
            reject(error);
        });
    });
}

// Verifica installazione Whisper
function verifyWhisper() {
    return new Promise((resolve) => {
        console.log('🧪 Verifica installazione Whisper...');
        
        const testProcess = spawn('python', ['-m', 'whisper', '--help']);
        
        testProcess.on('close', (code) => {
            if (code === 0) {
                console.log('✅ Whisper installato e funzionante!');
                resolve(true);
            } else {
                console.log('❌ Whisper non funziona correttamente');
                resolve(false);
            }
        });
        
        testProcess.on('error', () => {
            console.log('❌ Impossibile verificare Whisper');
            resolve(false);
        });
    });
}

// Crea directory necessarie
function createDirectories() {
    const dirs = ['./temp', './uploads', './data'];
    
    dirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`📁 Creata directory: ${dir}`);
        }
    });
}

// Funzione principale
async function main() {
    try {
        // Verifica prerequisiti
        const hasPython = await checkPython();
        if (!hasPython) {
            console.log('\n❌ ERRORE: Python non è installato');
            console.log('📋 Per installare Python:');
            console.log('   Windows: https://www.python.org/downloads/');
            console.log('   macOS: brew install python');
            console.log('   Linux: sudo apt install python3 python3-pip');
            process.exit(1);
        }
        
        const pipCommand = await checkPip();
        if (!pipCommand) {
            console.log('\n❌ ERRORE: pip non è installato');
            console.log('📋 pip dovrebbe essere incluso con Python');
            process.exit(1);
        }
        
        // Crea directory
        console.log('\n📁 Creazione directory...');
        createDirectories();
        
        // Installa Whisper
        console.log('\n📦 Installazione dipendenze...');
        await installWhisper(pipCommand);
        
        // Verifica installazione
        console.log('\n🧪 Verifica finale...');
        const isWorking = await verifyWhisper();
        
        if (isWorking) {
            console.log('\n🎉 INSTALLAZIONE COMPLETATA!');
            console.log('✨ Whisper è pronto per l\'uso');
            console.log('🚀 Ora puoi avviare DebateLens con: npm start');
        } else {
            console.log('\n⚠️  Installazione completata ma potrebbero esserci problemi');
            console.log('🔧 Prova a eseguire manualmente: python -m whisper --help');
        }
        
    } catch (error) {
        console.error('\n❌ ERRORE DURANTE L\'INSTALLAZIONE:', error.message);
        console.log('🔧 Prova a installare manualmente: pip install openai-whisper');
        process.exit(1);
    }
}

// Avvia l'installazione
main(); 