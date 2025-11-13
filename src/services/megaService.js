// megaService.js - Versão com proteção contra bloqueios
import { Storage } from 'megajs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readFile = promisify(fs.readFile);
const unlink = promisify(fs.unlink);

class MegaService {
  constructor() {
    this.storage = null;
    this.isConnected = false;
    this.isBlocked = false;
    this.lastRequestTime = 0;
    this.requestQueue = [];
    this.processingQueue = false;
    
    // Configurações de rate limiting
    this.rateLimit = {
      maxRequestsPerMinute: 30, // Reduzido para segurança
      minTimeBetweenRequests: 2000, // 2 segundos entre requests
      retryDelay: 5000, // 5 segundos entre tentativas
      maxRetries: 3
    };

    this.credentials = {
      email: process.env.MEGA_EMAIL || 'xhanckin@gmail.com',
      password: process.env.MEGA_PASSWORD || 'Xhackin@2025/500'
    };
  }

  // Método com rate limiting e queue
  async executeWithRateLimit(operation) {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    // Aguardar tempo mínimo entre requests
    if (timeSinceLastRequest < this.rateLimit.minTimeBetweenRequests) {
      await new Promise(resolve => 
        setTimeout(resolve, this.rateLimit.minTimeBetweenRequests - timeSinceLastRequest)
      );
    }

    this.lastRequestTime = Date.now();
    
    // Executar com retry logic
    let lastError;
    for (let attempt = 1; attempt <= this.rateLimit.maxRetries; attempt++) {
      try {
        if (this.isBlocked) {
          throw new Error('Conta MEGA temporariamente bloqueada');
        }
        
        const result = await operation();
        return result;
        
      } catch (error) {
        lastError = error;
        console.warn(`⚠️ Tentativa ${attempt}/${this.rateLimit.maxRetries} falhou:`, error.message);
        
        // Verificar se é bloqueio permanente
        if (error.message.includes('EBLOCKED') || error.message.includes('blocked')) {
          this.isBlocked = true;
          console.error('🚫 Conta MEGA bloqueada. Aguarde algumas horas.');
          break;
        }
        
        // Aguardar antes da próxima tentativa
        if (attempt < this.rateLimit.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, this.rateLimit.retryDelay * attempt));
        }
      }
    }
    
    throw lastError;
  }

  async connect() {
    return this.executeWithRateLimit(async () => {
      try {
        console.log('🔗 Conectando ao MEGA.nz...');
        
        if (!this.credentials.email || !this.credentials.password) {
          throw new Error('Credenciais MEGA não configuradas');
        }

        // Criar nova instância do storage
        this.storage = new Storage({
          email: this.credentials.email,
          password: this.credentials.password,
          autologin: false, // Mudar para false para mais controle
          keepalive: false, // Desativar keepalive
          //timeout: 30000 // Timeout de 30 segundos
        });

        // Aguardar conexão com timeout
        const connectionPromise = new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Timeout na conexão com MEGA'));
          }, 30000);

          this.storage.on('ready', () => {
            clearTimeout(timeout);
            this.isConnected = true;
            this.isBlocked = false;
            console.log('✅ Conectado ao MEGA.nz com sucesso!');
            console.log(`📁 Espaço usado: ${this.formatBytes(this.storage.usedSpace)}`);
            console.log(`📊 Espaço total: ${this.formatBytes(this.storage.totalSpace)}`);
            resolve();
          });

          this.storage.on('error', (error) => {
            clearTimeout(timeout);
            console.error('❌ Erro na conexão MEGA:', error.message);
            
            if (error.message.includes('blocked') || error.message.includes('EBLOCKED')) {
              this.isBlocked = true;
              reject(new Error('Conta MEGA bloqueada. Aguarde algumas horas.'));
            } else {
              reject(error);
            }
          });
        });

        await connectionPromise;
        return true;

      } catch (error) {
        console.error('❌ Falha na conexão com MEGA:', error.message);
        this.isConnected = false;
        
        if (error.message.includes('blocked') || error.message.includes('EBLOCKED')) {
          this.isBlocked = true;
        }
        
        throw error;
      }
    });
  }

  async ensureConnection() {
    if (this.isBlocked) {
      throw new Error('Conta MEGA temporariamente bloqueada. Tente novamente mais tarde.');
    }
    
    if (!this.isConnected || !this.storage) {
      await this.connect();
    }
  }

  async uploadFile(filePath, fileName, options = {}) {
    return this.executeWithRateLimit(async () => {
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
    });
  }

  async generatePublicLink(file) {
    return this.executeWithRateLimit(async () => {
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
    });
  }

  async createFolder(folderName) {
    return this.executeWithRateLimit(async () => {
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
    });
  }

  async listAllVideoFiles() {
    return this.executeWithRateLimit(async () => {
      try {
        await this.ensureConnection();
        
        console.log('🔍 Buscando todos os arquivos de vídeo no MEGA...');
        
        const allFiles = this.storage.files || [];
        
        // Filtrar apenas arquivos de vídeo
        const videoFiles = allFiles.filter(file => {
          const fileName = file.name || '';
          const isVideo = /\.(mp4|avi|mov|mkv|wmv|flv|webm|m4v|3gp|mpeg|mpg)$/i.test(fileName);
          
          return isVideo && file.size > 0;
        }).map(file => ({
          name: file.name,
          size: file.size,
          formattedSize: this.formatBytes(file.size),
          downloadId: file.downloadId,
          nodeId: file.nodeId,
          downloadUrl: null,
          timestamp: file.timestamp || Date.now(),
          isInDatabase: false
        }));

        console.log(`✅ Encontrados ${videoFiles.length} arquivos de vídeo no MEGA`);
        return videoFiles;
        
      } catch (error) {
        console.error('❌ Erro ao listar arquivos de vídeo:', error.message);
        
        if (error.message.includes('blocked') || error.message.includes('EBLOCKED')) {
          this.isBlocked = true;
        }
        
        return [];
      }
    });
  }

  async getFileDownloadLink(fileId) {
    return this.executeWithRateLimit(async () => {
      try {
        await this.ensureConnection();

        const file = this.storage.files.find(f => 
          f.downloadId === fileId || f.nodeId === fileId
        );
        
        if (!file) {
          throw new Error(`Arquivo não encontrado: ${fileId}`);
        }

        const downloadUrl = await this.generatePublicLink(file);
        return downloadUrl;

      } catch (error) {
        console.error(`❌ Erro ao gerar link para ${fileId}:`, error);
        
        if (error.message.includes('blocked') || error.message.includes('EBLOCKED')) {
          this.isBlocked = true;
        }
        
        throw error;
      }
    });
  }
  
  async listFiles() {
    return this.executeWithRateLimit(async () => {
      try {
        await this.ensureConnection();
        
        console.log('🔍 Listando arquivos do MEGA...');
        
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
          console.log('📁 Nenhum arquivo encontrado');
          return [];
        }
        
      } catch (error) {
        console.error('❌ Erro ao listar arquivos:', error.message);
        
        if (error.message.includes('blocked') || error.message.includes('EBLOCKED')) {
          this.isBlocked = true;
        }
        
        return [];
      }
    });
  }

  async deleteFile(fileId) {
    return this.executeWithRateLimit(async () => {
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
    });
  }

  async getFileInfo(fileId) {
    return this.executeWithRateLimit(async () => {
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
    });
  }

  async getStorageInfo() {
    return this.executeWithRateLimit(async () => {
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
    });
  }

  // Método para verificar status da conta
  async checkAccountStatus() {
    try {
      await this.ensureConnection();
      const storageInfo = await this.getStorageInfo();
      
      return {
        status: 'active',
        isBlocked: false,
        storage: storageInfo,
        canUpload: true
      };
    } catch (error) {
      if (error.message.includes('blocked') || this.isBlocked) {
        return {
          status: 'blocked',
          isBlocked: true,
          message: 'Conta temporariamente bloqueada. Aguarde algumas horas.',
          canUpload: false
        };
      }
      
      return {
        status: 'error',
        isBlocked: false,
        message: error.message,
        canUpload: false
      };
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
      const accountStatus = await this.checkAccountStatus();
      const storageInfo = accountStatus.isBlocked ? null : await this.getStorageInfo();
      
      return {
        status: accountStatus.isBlocked ? 'blocked' : 'healthy',
        mega: {
          connected: !accountStatus.isBlocked,
          blocked: accountStatus.isBlocked,
          account: this.credentials.email,
          storage: storageInfo,
          message: accountStatus.message
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        mega: {
          connected: false,
          blocked: this.isBlocked,
          error: error.message
        },
        timestamp: new Date().toISOString()
      };
    }
  }
}

// Criar instância única (Singleton)
const megaService = new MegaService();

// Conectar automaticamente ao iniciar (mas não travar o startup)
setTimeout(() => {
  megaService.connect().catch(error => {
    console.error('❌ Falha na conexão automática com MEGA:', error.message);
  });
}, 5000); // Delay inicial de 5 segundos

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