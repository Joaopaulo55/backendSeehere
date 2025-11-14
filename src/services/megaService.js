// megaService.js - Versão corrigida com melhor tratamento de conexão
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
    
    // Configurações de rate limiting mais conservadoras para free plan
    this.rateLimit = {
      maxRequestsPerMinute: 20, // Reduzido ainda mais para free plan
      minTimeBetweenRequests: 3000, // 3 segundos entre requests
      retryDelay: 10000, // 10 segundos entre tentativas
      maxRetries: 2, // Menos tentativas
      connectionTimeout: 45000 // 45 segundos para conexão
    };

    this.credentials = {
      email: process.env.MEGA_EMAIL || 'xhanckin@gmail.com',
      password: process.env.MEGA_PASSWORD || 'Xhackin@2025/500'
    };

    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 3;
  }

  // Método com rate limiting e queue melhorado
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
        
        // Aguardar antes da próxima tentativa com backoff exponencial
        if (attempt < this.rateLimit.maxRetries) {
          const delay = this.rateLimit.retryDelay * Math.pow(2, attempt - 1);
          console.log(`⏳ Aguardando ${delay/1000} segundos antes da próxima tentativa...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }

  async connect() {
    if (this.connectionAttempts >= this.maxConnectionAttempts) {
      throw new Error('Número máximo de tentativas de conexão excedido');
    }

    this.connectionAttempts++;

    return this.executeWithRateLimit(async () => {
      try {
        console.log(`🔗 Tentativa ${this.connectionAttempts}/${this.maxConnectionAttempts} - Conectando ao MEGA.nz...`);
        
        if (!this.credentials.email || !this.credentials.password) {
          throw new Error('Credenciais MEGA não configuradas');
        }

        // Limpar conexão anterior se existir
        if (this.storage) {
          try {
            this.storage.close();
          } catch (e) {
            // Ignorar erros ao fechar conexão anterior
          }
          this.storage = null;
        }

        // Criar nova instância do storage com configurações otimizadas
        this.storage = new Storage({
          email: this.credentials.email,
          password: this.credentials.password,
          autologin: true, // Mudar para true para melhor compatibilidade
          keepalive: true, // Manter ativo para free plan
          timeout: this.rateLimit.connectionTimeout
        });

        // Aguardar conexão com timeout melhorado
        const connectionPromise = new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error(`Timeout na conexão com MEGA após ${this.rateLimit.connectionTimeout/1000} segundos`));
          }, this.rateLimit.connectionTimeout);

          const readyHandler = () => {
            clearTimeout(timeout);
            this.storage.off('error', errorHandler);
            this.isConnected = true;
            this.isBlocked = false;
            this.connectionAttempts = 0; // Resetar contador em sucesso
            console.log('✅ Conectado ao MEGA.nz com sucesso!');
            if (this.storage.usedSpace !== undefined && this.storage.totalSpace !== undefined) {
              console.log(`📁 Espaço usado: ${this.formatBytes(this.storage.usedSpace)}`);
              console.log(`📊 Espaço total: ${this.formatBytes(this.storage.totalSpace)}`);
            }
            resolve();
          };

          const errorHandler = (error) => {
            clearTimeout(timeout);
            this.storage.off('ready', readyHandler);
            console.error('❌ Erro na conexão MEGA:', error.message);
            
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
        
        if (error.message.includes('blocked') || error.message.includes('EBLOCKED')) {
          this.isBlocked = true;
        }
        
        // Se não for bloqueio, tentar novamente depois
        if (!this.isBlocked && this.connectionAttempts < this.maxConnectionAttempts) {
          console.log(`🔄 Nova tentativa de conexão em ${this.rateLimit.retryDelay/1000} segundos...`);
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
    } else {
      // Verificar se a conexão ainda está ativa
      try {
        // Tentar uma operação simples para verificar a conexão
        if (this.storage.root && typeof this.storage.root === 'object') {
          return; // Conexão parece estar ok
        }
      } catch (error) {
        console.warn('⚠️ Conexão MEGA pode estar inativa, reconectando...');
        this.isConnected = false;
        await this.connect();
      }
    }
  }

  async uploadFile(filePath, fileName, options = {}) {
    return this.executeWithRateLimit(async () => {
      try {
        await this.ensureConnection();

        console.log(`📤 Iniciando upload: ${fileName}`);
        
        // Verificar se arquivo existe
        try {
          await fs.promises.access(filePath);
        } catch (error) {
          throw new Error(`Arquivo não encontrado: ${filePath}`);
        }
        
        // Obter stats do arquivo
        const stats = await fs.promises.stat(filePath);
        console.log(`📊 Tamanho do arquivo: ${this.formatBytes(stats.size)}`);
        
        // Ler arquivo do sistema de arquivos
        const fileBuffer = await readFile(filePath);
        
        // Fazer upload com tratamento de progresso
        const uploadedFile = await new Promise((resolve, reject) => {
          const upload = this.storage.upload(fileName, fileBuffer, (error, file) => {
            if (error) {
              reject(error);
            } else {
              resolve(file);
            }
          });

          // Opcional: adicionar listener de progresso
          upload.on('progress', (info) => {
            const percent = ((info.bytesLoaded / info.bytesTotal) * 100).toFixed(1);
            console.log(`📤 Upload progresso: ${percent}%`);
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
        console.error(`❌ Erro no upload de ${fileName}:`, error.message);
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
        console.error('❌ Erro ao gerar link público:', error.message);
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
        console.error(`❌ Erro ao criar pasta ${folderName}:`, error.message);
        throw error;
      }
    });
  }

  // megaService.js - VERSÃO CORRIGIDA

// Adicione estas funções dentro da classe MegaService:

async listAllVideoFilesRecursive() {
    return this.executeWithRateLimit(async () => {
      try {
        await this.ensureConnection();
        
        console.log('🔍 Buscando todos os arquivos de vídeo no MEGA (recursivo)...');
        
        const allVideoFiles = [];
        
        // Função recursiva para buscar em todas as pastas
        const searchInFolder = async (folder) => {
          try {
            // Listar conteúdo da pasta atual
            const children = await new Promise((resolve, reject) => {
              folder.children((error, children) => {
                if (error) reject(error);
                else resolve(children || []);
              });
            });
            
            for (const item of children) {
              if (item.directory) {
                // É uma pasta - buscar recursivamente
                console.log(`📁 Buscando na pasta: ${item.name}`);
                await searchInFolder(item);
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
                    path: folder.name || 'root'
                  });
                }
              }
            }
          } catch (error) {
            console.error(`❌ Erro ao buscar na pasta ${folder.name}:`, error.message);
          }
        };
        
        // Começar busca a partir da pasta raiz
        await searchInFolder(this.storage.root);
        
        console.log(`✅ Encontrados ${allVideoFiles.length} arquivos de vídeo no MEGA (recursivo)`);
        return allVideoFiles;
        
      } catch (error) {
        console.error('❌ Erro ao listar arquivos de vídeo recursivamente:', error.message);
        return [];
      }
    });
}

async listVideosInFolder(folderPath = 'Mega/seehere-videos') {
    return this.executeWithRateLimit(async () => {
      try {
        await this.ensureConnection();
        
        console.log(`🔍 Buscando vídeos na pasta: ${folderPath}`);
        
        // Navegar para a pasta específica
        let currentFolder = this.storage.root;
        const pathParts = folderPath.split('/').filter(part => part.trim());
        
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
            console.log(`❌ Pasta não encontrada: ${part} em ${folderPath}`);
            return []; // Retorna array vazio se pasta não existe
          }
          
          currentFolder = nextFolder;
        }
        
        // Listar arquivos de vídeo na pasta encontrada
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
        console.error(`❌ Erro ao buscar vídeos em ${folderPath}:`, error.message);
        return [];
      }
    });
}

// Atualize a função original para usar a recursiva (opcional)
async listAllVideoFiles() {
    return await this.listVideosInFolder('Mega/seehere-videos'); // Ou use a recursiva se preferir
}

// Atualizar a função original para usar a recursiva
async function listAllVideoFiles() {
    return await this.listAllVideoFilesRecursive();
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
        console.error(`❌ Erro ao gerar link para ${fileId}:`, error.message);
        
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
        console.error(`❌ Erro ao deletar arquivo ${fileId}:`, error.message);
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
        console.error(`❌ Erro ao buscar info do arquivo ${fileId}:`, error.message);
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
        console.error('❌ Erro ao buscar info do storage:', error.message);
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

  // Método para resetar conexão
  async resetConnection() {
    console.log('🔄 Resetando conexão MEGA...');
    this.isConnected = false;
    this.isBlocked = false;
    this.connectionAttempts = 0;
    
    if (this.storage) {
      try {
        this.storage.close();
      } catch (error) {
        // Ignorar erros ao fechar
      }
      this.storage = null;
    }
    
    return this.connect();
  }
}

// Criar instância única (Singleton)
const megaService = new MegaService();

// Conectar automaticamente ao iniciar com retry


// Delay inicial de 10 segundos para dar tempo ao servidor iniciar

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