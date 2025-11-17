// megaService.js - VERSÃO COMPLETA OTIMIZADA
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
    
    // Configurações otimizadas
    this.rateLimit = {
      maxRequestsPerMinute: 15, // Reduzido para evitar bloqueio
      minTimeBetweenRequests: 4000, // Aumentado
      retryDelay: 15000, // Aumentado
      maxRetries: 2,
      connectionTimeout: 60000 // Aumentado
    };

    this.credentials = {
      email: process.env.MEGA_EMAIL || 'xhanckin@gmail.com',
      password: process.env.MEGA_PASSWORD || 'Xhackin@2025/500'
    };

    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 2; // Reduzido
  }

  // Método de rate limiting melhorado
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
          throw new Error('Conta MEGA temporariamente bloqueada. Aguarde algumas horas.');
        }
        
        console.log(`🔗 Tentativa ${attempt}/${this.rateLimit.maxRetries}`);
        const result = await operation();
        return result;
        
      } catch (error) {
        lastError = error;
        console.warn(`⚠️ Tentativa ${attempt} falhou:`, error.message);
        
        // Verificar se é bloqueio
        if (error.message.includes('EBLOCKED') || error.message.includes('blocked')) {
          this.isBlocked = true;
          console.error('🚫 Conta MEGA bloqueada. Aguarde algumas horas.');
          break;
        }
        
        // Aguardar antes da próxima tentativa
        if (attempt < this.rateLimit.maxRetries) {
          const delay = this.rateLimit.retryDelay * attempt; // Linear, não exponencial
          console.log(`⏳ Aguardando ${delay/1000} segundos...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError || new Error('Todas as tentativas falharam');
  }

  async connect() {
    if (this.connectionAttempts >= this.maxConnectionAttempts) {
      throw new Error('Número máximo de tentativas de conexão excedido');
    }

    this.connectionAttempts++;

    return this.executeWithRateLimit(async () => {
      try {
        console.log(`🔗 Tentando conexão MEGA (${this.connectionAttempts}/${this.maxConnectionAttempts})...`);
        
        if (!this.credentials.email || !this.credentials.password) {
          throw new Error('Credenciais MEGA não configuradas');
        }

        // Limpar conexão anterior
        if (this.storage) {
          try {
            this.storage.close();
          } catch (e) {}
          this.storage = null;
        }

        // Nova instância com configurações otimizadas
        this.storage = new Storage({
          email: this.credentials.email,
          password: this.credentials.password,
          autologin: false, // Desativado para mais controle
          keepalive: false, // Desativado para evitar timeout
          timeout: this.rateLimit.connectionTimeout
        });

        // Conexão com timeout
        const connectionPromise = new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error(`Timeout na conexão MEGA (${this.rateLimit.connectionTimeout/1000}s)`));
          }, this.rateLimit.connectionTimeout);

          const readyHandler = () => {
            clearTimeout(timeout);
            this.storage.off('error', errorHandler);
            this.isConnected = true;
            this.isBlocked = false;
            this.connectionAttempts = 0;
            console.log('✅ Conectado ao MEGA.nz com sucesso!');
            resolve();
          };

          const errorHandler = (error) => {
            clearTimeout(timeout);
            this.storage.off('ready', readyHandler);
            
            if (error.message.includes('blocked') || error.message.includes('EBLOCKED')) {
              this.isBlocked = true;
              reject(new Error('Conta MEGA bloqueada. Aguarde algumas horas.'));
            } else if (error.message.includes('credentials') || error.message.includes('login')) {
              reject(new Error('Credenciais MEGA inválidas'));
            } else {
              reject(error);
            }
          };

          this.storage.once('ready', readyHandler);
          this.storage.once('error', errorHandler);
        });

        await connectionPromise;
        return true;

      } catch (error) {
        console.error('❌ Falha na conexão com MEGA:', error.message);
        this.isConnected = false;
        
        if (error.message.includes('blocked')) {
          this.isBlocked = true;
        }
        
        // Tentar novamente se não for bloqueio
        if (!this.isBlocked && this.connectionAttempts < this.maxConnectionAttempts) {
          console.log(`🔄 Nova tentativa em ${this.rateLimit.retryDelay/1000}s...`);
          await new Promise(resolve => setTimeout(resolve, this.rateLimit.retryDelay));
          return this.connect();
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
    
    return true;
  }

  // BUSCA RECURSIVA OTIMIZADA
  async listAllVideoFilesRecursive() {
    return this.executeWithRateLimit(async () => {
      try {
        await this.ensureConnection();
        
        console.log('🔍 Buscando TODOS os arquivos de vídeo no MEGA (recursivo)...');
        
        const allVideoFiles = [];
        let foldersScanned = 0;
        
        const searchInFolder = async (folder, currentPath = 'root') => {
          try {
            const children = await new Promise((resolve, reject) => {
              folder.children((error, children) => {
                if (error) reject(error);
                else resolve(children || []);
              });
            });
            
            for (const item of children) {
              if (item.directory) {
                // É uma pasta - buscar recursivamente
                foldersScanned++;
                const folderPath = `${currentPath}/${item.name}`;
                
                // Limitar profundidade para evitar timeout
                if (foldersScanned < 50) { // Limite de segurança
                  await searchInFolder(item, folderPath);
                }
              } else {
                // É um arquivo - verificar se é vídeo
                const fileName = item.name || '';
                const isVideo = /\.(mp4|avi|mov|mkv|wmv|flv|webm|m4v|3gp|mpeg|mpg)$/i.test(fileName);
                
                if (isVideo && item.size > 0) {
                  allVideoFiles.push({
                    name: item.name,
                    size: item.size,
                    formattedSize: this.formatBytes(item.size),
                    downloadId: item.downloadId,
                    nodeId: item.nodeId,
                    downloadUrl: null,
                    timestamp: item.timestamp || Date.now(),
                    isInDatabase: false,
                    path: currentPath
                  });
                }
              }
            }
          } catch (error) {
            console.warn(`⚠️ Erro na pasta ${currentPath}:`, error.message);
          }
        };
        
        await searchInFolder(this.storage.root);
        
        console.log(`✅ Encontrados ${allVideoFiles.length} vídeos em ${foldersScanned} pastas`);
        return allVideoFiles;
        
      } catch (error) {
        console.error('❌ Erro na busca recursiva:', error.message);
        throw error;
      }
    });
  }

  // BUSCA EM PASTA ESPECÍFICA
  async listVideosInFolder(folderPath = 'Mega/seehere-videos') {
    return this.executeWithRateLimit(async () => {
      try {
        await this.ensureConnection();
        
        console.log(`🔍 Buscando vídeos em: ${folderPath}`);
        
        let currentFolder = this.storage.root;
        const pathParts = folderPath.split('/').filter(part => part.trim());
        
        // Navegar para a pasta
        for (const part of pathParts) {
          const children = await new Promise((resolve, reject) => {
            currentFolder.children((error, children) => {
              if (error) reject(error);
              else resolve(children || []);
            });
          });
          
          const nextFolder = children.find(child => 
            child.directory && child.name === part
          );
          
          if (!nextFolder) {
            console.log(`📁 Pasta não encontrada: ${part}`);
            return [];
          }
          
          currentFolder = nextFolder;
        }
        
        // Listar arquivos na pasta
        const children = await new Promise((resolve, reject) => {
          currentFolder.children((error, children) => {
            if (error) reject(error);
            else resolve(children || []);
          });
        });
        
        const videoFiles = children
          .filter(item => !item.directory)
          .filter(item => {
            const fileName = item.name || '';
            const isVideo = /\.(mp4|avi|mov|mkv|wmv|flv|webm|m4v|3gp|mpeg|mpg)$/i.test(fileName);
            return isVideo && item.size > 0;
          })
          .map(item => ({
            name: item.name,
            size: item.size,
            formattedSize: this.formatBytes(item.size),
            downloadId: item.downloadId,
            nodeId: item.nodeId,
            downloadUrl: null,
            timestamp: item.timestamp || Date.now(),
            isInDatabase: false,
            path: folderPath
          }));
        
        console.log(`✅ Encontrados ${videoFiles.length} vídeos em ${folderPath}`);
        return videoFiles;
        
      } catch (error) {
        console.error(`❌ Erro ao buscar em ${folderPath}:`, error.message);
        return [];
      }
    });
  }

  // UPLOAD OTIMIZADO
  async uploadFile(filePath, fileName, options = {}) {
    return this.executeWithRateLimit(async () => {
      try {
        await this.ensureConnection();

        console.log(`📤 Iniciando upload: ${fileName}`);
        
        // Verificar arquivo
        try {
          await fs.promises.access(filePath);
        } catch (error) {
          throw new Error(`Arquivo não encontrado: ${filePath}`);
        }
        
        const stats = await fs.promises.stat(filePath);
        console.log(`📊 Tamanho: ${this.formatBytes(stats.size)}`);
        
        // Ler arquivo
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

        console.log(`✅ Upload concluído: ${uploadedFile.name}`);
        
        // Gerar link
        const downloadUrl = await this.generatePublicLink(uploadedFile);
        
        // Limpar arquivo temporário
        if (options.cleanup !== false) {
          try {
            await unlink(filePath);
          } catch (cleanupError) {
            console.warn('⚠️ Não foi possível limpar arquivo temporário');
          }
        }

        return {
          fileId: uploadedFile.downloadId,
          downloadUrl: downloadUrl,
          size: uploadedFile.size,
          name: uploadedFile.name
        };

      } catch (error) {
        console.error(`❌ Erro no upload:`, error.message);
        throw error;
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

        return link;

      } catch (error) {
        console.error('❌ Erro ao gerar link:', error.message);
        throw error;
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
        console.error(`❌ Erro ao buscar link:`, error.message);
        throw error;
      }
    });
  }
  
  async listFiles() {
    return this.executeWithRateLimit(async () => {
      try {
        await this.ensureConnection();
        
        if (this.storage.files && Array.isArray(this.storage.files)) {
          const files = this.storage.files.slice(0, 30).map(file => ({
            name: file.name || `file_${file.nodeId}`,
            size: file.size || 0,
            type: 'file',
            downloadId: file.downloadId,
            nodeId: file.nodeId
          }));
          
          return files;
        }
        
        return [];
        
      } catch (error) {
        console.error('❌ Erro ao listar arquivos:', error.message);
        return [];
      }
    });
  }

  async getStorageInfo() {
    return this.executeWithRateLimit(async () => {
      try {
        await this.ensureConnection();

        return {
          usedSpace: this.storage.usedSpace || 0,
          totalSpace: this.storage.totalSpace || 0,
          freeSpace: (this.storage.totalSpace || 0) - (this.storage.usedSpace || 0),
          usedPercentage: this.storage.usedSpace && this.storage.totalSpace ? 
            ((this.storage.usedSpace / this.storage.totalSpace) * 100).toFixed(2) : '0',
          isConnected: this.isConnected,
          account: this.credentials.email
        };

      } catch (error) {
        console.error('❌ Erro ao buscar info:', error.message);
        throw error;
      }
    });
  }

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
          message: 'Conta temporariamente bloqueada',
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
        console.log('🔌 Desconectado do MEGA');
      } catch (error) {
        console.error('❌ Erro ao desconectar:', error.message);
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
          storage: storageInfo
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

  async resetConnection() {
    console.log('🔄 Resetando conexão MEGA...');
    this.isConnected = false;
    this.isBlocked = false;
    this.connectionAttempts = 0;
    
    if (this.storage) {
      try {
        this.storage.close();
      } catch (error) {}
      this.storage = null;
    }
    
    return this.connect();
  }
}

// Singleton
const megaService = new MegaService();

// Graceful shutdown
process.on('SIGINT', async () => {
  await megaService.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await megaService.disconnect();
  process.exit(0);
});

export default megaService;