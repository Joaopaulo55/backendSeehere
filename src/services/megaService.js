import mega from 'megajs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class MegaService {
  constructor() {
    this.storage = null;
    this.isConnected = false;
    this.init();
  }

  async init() {
    try {
      const email = process.env.MEGA_EMAIL;
      const password = process.env.MEGA_PASSWORD;
      
      if (!email || !password) {
        console.warn('⚠️  Credenciais MEGA não configuradas. Uploads desabilitados.');
        return;
      }

      this.storage = new mega.Storage({
        email: email,
        password: password,
        userAgent: 'Seehere/1.0'
      });

      await new Promise((resolve, reject) => {
        this.storage.on('ready', resolve);
        this.storage.on('error', reject);
      });

      this.isConnected = true;
      console.log('✅ Conectado ao MEGA.nz');
    } catch (error) {
      console.error('❌ Erro ao conectar com MEGA:', error);
      this.isConnected = false;
    }
  }

  async uploadFile(filePath, fileName) {
    if (!this.isConnected) {
      throw new Error('Serviço MEGA não disponível');
    }

    try {
      console.log(`📤 Enviando ${fileName} para MEGA...`);
      
      const file = await new Promise((resolve, reject) => {
        fs.readFile(filePath, (err, data) => {
          if (err) reject(err);
          
          this.storage.upload({
            name: fileName,
            size: data.length
          }, data, (err, file) => {
            if (err) reject(err);
            resolve(file);
          });
        });
      });

      // Gerar link público
      const link = await new Promise((resolve, reject) => {
        file.link((err, url) => {
          if (err) reject(err);
          resolve(url);
        });
      });

      // Limpar arquivo temporário
      fs.unlinkSync(filePath);

      return {
        fileId: file.downloadId,
        downloadUrl: link,
        size: file.size,
        name: file.name
      };
    } catch (error) {
      console.error('❌ Erro no upload para MEGA:', error);
      throw error;
    }
  }

  async deleteFile(fileId) {
    if (!this.isConnected) return;

    try {
      const file = this.storage.files.find(f => f.downloadId === fileId);
      if (file) {
        await file.delete();
        console.log(`🗑️ Arquivo ${fileId} removido do MEGA`);
      }
    } catch (error) {
      console.error('❌ Erro ao deletar arquivo do MEGA:', error);
    }
  }
}

export default new MegaService();

