// megaService.js
import { Storage } from 'megajs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Promisify para usar async/await
const readFile = promisify(fs.readFile);
const unlink = promisify(fs.unlink);

class MegaService {
  constructor() {
    this.storage = null;
    this.isConnected = false;
    this.credentials = {
      email: process.env.MEGA_EMAIL || 'xhanckin@gmail.com',
      password: process.env.MEGA_PASSWORD || 'Xhackin@025' // SENHA CORRIGIDA
    };
  }

  async connect() {
    try {
      console.log('🔗 Conectando ao MEGA.nz...');
      
      if (!this.credentials.email || !this.credentials.password) {
        throw new Error('Credenciais MEGA não configuradas');
      }

      // Criar nova instância do storage
      this.storage = new Storage({
        email: this.credentials.email,
        password: this.credentials.password,
        autologin: true,
        keepalive: true
      });

      // Aguardar conexão
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout na conexão com MEGA'));
        }, 30000);

        this.storage.on('ready', () => {
          clearTimeout(timeout);
          this.isConnected = true;
          console.log('✅ Conectado ao MEGA.nz com sucesso!');
          console.log(`📁 Espaço usado: ${this.formatBytes(this.storage.usedSpace)}`);
          console.log(`📊 Espaço total: ${this.formatBytes(this.storage.totalSpace)}`);
          resolve();
        });

        this.storage.on('error', (error) => {
          clearTimeout(timeout);
          console.error('❌ Erro na conexão MEGA:', error);
          reject(error);
        });
      });

      return true;
    } catch (error) {
      console.error('❌ Falha na conexão com MEGA:', error.message);
      this.isConnected = false;
      throw error;
    }
  }

  async ensureConnection() {
    if (!this.isConnected || !this.storage) {
      await this.connect();
    }
  }

  async uploadFile(filePath, fileName, options = {}) {
    try {
      await this.ensureConnection();

      console.log(`📤 Iniciando upload: ${fileName}`);
      
      // Ler arquivo do sistema de arquivos
      const fileBuffer = await readFile(filePath);
      
      // Fazer upload
      const uploadedFile = await new Promise((resolve, reject) => {
        this.storage.upload(fileName, fileBuffer, (error, file) => {
          if (error) {
            reject(error);
          } else {
            resolve(file);
          }
        });
      });

      console.log(`✅ Upload concluído: ${uploadedFile.name} (${this.formatBytes(uploadedFile.size)})`);

      // Gerar link público
      const downloadUrl = await this.generatePublicLink(uploadedFile);
      
      // Limpar arquivo temporário se solicitado
      if (options.cleanup !== false) {
        try {
          await unlink(filePath);
          console.log(`🧹 Arquivo temporário removido: ${filePath}`);
        } catch (cleanupError) {
          console.warn('⚠️ Não foi possível remover arquivo temporário:', cleanupError.message);
        }
      }

      return {
        fileId: uploadedFile.downloadId,
        downloadUrl: downloadUrl,
        size: uploadedFile.size,
        name: uploadedFile.name,
        timestamp: new Date().toISOString(),
        megaNode: uploadedFile.nodeId
      };

    } catch (error) {
      console.error(`❌ Erro no upload de ${fileName}:`, error);
      throw new Error(`Falha no upload: ${error.message}`);
    }
  }

  async generatePublicLink(file) {
    try {
      const link = await new Promise((resolve, reject) => {
        file.link((error, url) => {
          if (error) {
            reject(error);
          } else {
            resolve(url);
          }
        });
      });

      console.log(`🔗 Link gerado: ${link}`);
      return link;

    } catch (error) {
      console.error('❌ Erro ao gerar link público:', error);
      throw new Error(`Não foi possível gerar link público: ${error.message}`);
    }
  }

  async createFolder(folderName) {
    try {
      await this.ensureConnection();

      const folder = await new Promise((resolve, reject) => {
        this.storage.mkdir(folderName, (error, folder) => {
          if (error) {
            reject(error);
          } else {
            resolve(folder);
          }
        });
      });

      console.log(`📁 Pasta criada: ${folderName}`);
      return folder;

    } catch (error) {
      console.error(`❌ Erro ao criar pasta ${folderName}:`, error);
      throw error;
    }
  }

  async listFiles() {
  try {
    await this.ensureConnection();
    
    console.log('🔍 Listando arquivos do MEGA (método simples)...');
    
    // Método mais direto - verificar se há files no storage
    if (this.storage.files && Array.isArray(this.storage.files)) {
      const files = this.storage.files.slice(0, 50).map(file => ({
        name: file.name || `file_${file.nodeId}`,
        size: file.size || 0,
        type: 'file',
        downloadId: file.downloadId,
        nodeId: file.nodeId,
        timestamp: file.timestamp || Date.now()
      }));
      
      console.log(`✅ Encontrados ${files.length} arquivos`);
      return files;
    } else {
      console.log('📁 Nenhum arquivo encontrado (storage vazio)');
      return [];
    }
    
  } catch (error) {
    console.error('❌ Erro ao listar arquivos:', error.message);
    return [];
  }
}

  async deleteFile(fileId) {
    try {
      await this.ensureConnection();

      const file = this.storage.files.find(f => f.downloadId === fileId || f.nodeId === fileId);
      
      if (!file) {
        throw new Error(`Arquivo não encontrado: ${fileId}`);
      }

      await new Promise((resolve, reject) => {
        file.delete(true, (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });

      console.log(`🗑️ Arquivo deletado: ${file.name} (${fileId})`);
      return true;

    } catch (error) {
      console.error(`❌ Erro ao deletar arquivo ${fileId}:`, error);
      throw error;
    }
  }

  async getFileInfo(fileId) {
    try {
      await this.ensureConnection();

      const file = this.storage.files.find(f => f.downloadId === fileId || f.nodeId === fileId);
      
      if (!file) {
        throw new Error(`Arquivo não encontrado: ${fileId}`);
      }

      const downloadUrl = await this.generatePublicLink(file);

      return {
        fileId: file.downloadId,
        nodeId: file.nodeId,
        name: file.name,
        size: file.size,
        downloadUrl: downloadUrl,
        timestamp: file.timestamp,
        attributes: file.attributes
      };

    } catch (error) {
      console.error(`❌ Erro ao buscar info do arquivo ${fileId}:`, error);
      throw error;
    }
  }

  async getStorageInfo() {
    try {
      await this.ensureConnection();

      return {
        usedSpace: this.storage.usedSpace,
        totalSpace: this.storage.totalSpace,
        freeSpace: this.storage.totalSpace - this.storage.usedSpace,
        usedPercentage: ((this.storage.usedSpace / this.storage.totalSpace) * 100).toFixed(2),
        isConnected: this.isConnected,
        account: this.credentials.email
      };

    } catch (error) {
      console.error('❌ Erro ao buscar info do storage:', error);
      throw error;
    }
  }

  async disconnect() {
    if (this.storage) {
      try {
        this.storage.close();
        this.isConnected = false;
        console.log('🔌 Desconectado do MEGA.nz');
      } catch (error) {
        console.error('❌ Erro ao desconectar:', error);
      }
    }
  }

  // Utilitários
  formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  // Health check
  async healthCheck() {
    try {
      const isConnected = await this.ensureConnection();
      const storageInfo = await this.getStorageInfo();
      
      return {
        status: 'healthy',
        mega: {
          connected: isConnected,
          account: this.credentials.email,
          storage: storageInfo
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        mega: {
          connected: false,
          error: error.message
        },
        timestamp: new Date().toISOString()
      };
    }
  }
} // ⬅️ ESTA CHAVE FECHA A CLASSE (ESTAVA FALTANDO!)

// Criar instância única (Singleton)
const megaService = new MegaService();

// Conectar automaticamente ao iniciar (mas não travar o startup)
megaService.connect().catch(error => {
  console.error('❌ Falha na conexão automática com MEGA:', error.message);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🔄 Desconectando do MEGA...');
  await megaService.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🔄 Desconectando do MEGA...');
  await megaService.disconnect();
  process.exit(0);
});

export default megaService;