// megaService.js - VERSÃO FUNCIONAL
import mega from 'megajs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class MegaService {
  constructor() {
    this.storage = null;
    this.isConnected = false;
    this.credentials = {
      email: process.env.MEGA_EMAIL || 'xhanckin@gmail.com',
      password: process.env.MEGA_PASSWORD || 'Xhackin@2025'
    };
  }

  async connect() {
    return new Promise((resolve, reject) => {
      try {
        console.log('🔗 Conectando ao MEGA.nz...');
        
        this.storage = new mega.Storage({
          email: this.credentials.email,
          password: this.credentials.password
        });

        this.storage.on('ready', () => {
          this.isConnected = true;
          console.log('✅ Conectado ao MEGA.nz com sucesso!');
          resolve(true);
        });

        this.storage.on('error', (error) => {
          console.error('❌ Erro na conexão MEGA:', error);
          reject(error);
        });

        setTimeout(() => {
          reject(new Error('Timeout na conexão com MEGA'));
        }, 30000);

      } catch (error) {
        reject(error);
      }
    });
  }

  async uploadFile(filePath, fileName, options = {}) {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      console.log(`📤 Iniciando upload: ${fileName}`);
      
      return new Promise((resolve, reject) => {
        // ✅ CORRETO: passar filePath diretamente
        this.storage.upload({
          name: fileName,
          attributes: {
            description: options.description || 'Uploaded via Seehere'
          }
        }, filePath, (error, file) => {
          if (error) {
            console.error('❌ Erro no upload:', error);
            reject(error);
            return;
          }

          console.log('✅ Upload concluído, gerando link...');

          // ✅ CORRETO: usar file.link sem callback
          const downloadUrl = file.link;
          
          console.log(`🔗 Link gerado: ${downloadUrl}`);
            
          resolve({
            fileId: file.downloadId,
            downloadUrl: downloadUrl,
            size: file.size,
            name: file.name,
            timestamp: new Date().toISOString()
          });
        });
      });

    } catch (error) {
      console.error(`❌ Erro no upload de ${fileName}:`, error);
      throw error;
    }
  }

  async ensureConnection() {
    if (!this.isConnected) {
      await this.connect();
    }
  }

  // Método health check simplificado
  async healthCheck() {
    try {
      await this.ensureConnection();
      return {
        status: 'healthy',
        connected: this.isConnected,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        connected: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

const megaService = new MegaService();
export default megaService;