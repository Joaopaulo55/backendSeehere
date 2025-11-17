// megaService.js - VERSÃO COMPLETAMENTE CORRIGIDA
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
    
    // 🔥 CORREÇÃO: Configurações muito mais conservadoras
    this.rateLimit = {
      maxRequestsPerMinute: 5, // MUITO reduzido
      minTimeBetweenRequests: 10000, // 10 segundos entre requests
      retryDelay: 30000, // 30 segundos entre tentativas
      maxRetries: 1, // Apenas 1 tentativa extra
      connectionTimeout: 45000 // 45 segundos
    };

    // 🔥 CORREÇÃO: Verificar credenciais mais cedo
    this.credentials = {
      email: process.env.MEGA_EMAIL || 'xhanckin@gmail.com',
      password: process.env.MEGA_PASSWORD || 'Xhackin@2025/500'
    };

    // Validar credenciais imediatamente
    if (!this.credentials.email || !this.credentials.password) {
      console.error('❌ CREDENCIAIS MEGA NÃO CONFIGURADAS');
      this.isBlocked = true;
    }

    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 1; // Apenas 1 tentativa
  }

  // 🔥 CORREÇÃO: Método simplificado sem rate limiting complexo
  async executeWithRateLimit(operation) {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    // Aguardar tempo mínimo entre requests
    if (timeSinceLastRequest < this.rateLimit.minTimeBetweenRequests) {
      console.log(`⏳ Aguardando ${(this.rateLimit.minTimeBetweenRequests - timeSinceLastRequest)/1000}s...`);
      await new Promise(resolve => 
        setTimeout(resolve, this.rateLimit.minTimeBetweenRequests - timeSinceLastRequest)
      );
    }

    this.lastRequestTime = Date.now();
    
    try {
      if (this.isBlocked) {
        throw new Error('Conta MEGA temporariamente bloqueada. Aguarde 1-6 horas.');
      }
      
      console.log(`🔗 Executando operação MEGA...`);
      const result = await operation();
      return result;
      
    } catch (error) {
      console.error(`❌ Erro MEGA:`, error.message);
      
      // 🔥 CORREÇÃO: Detectar melhor os tipos de erro
      if (error.message.includes('ESID') || 
          error.message.includes('session') || 
          error.message.includes('relogin') ||
          error.message.includes('EBLOCKED') ||
          error.message.includes('blocked')) {
        this.isBlocked = true;
        console.error('🚫 CONTA MEGA BLOQUEADA - Sessão inválida/expirada');
        console.error('💡 SOLUÇÃO: Aguarde 1-6 horas ou use credenciais diferentes');
      }
      
      throw error;
    }
  }

  async connect() {
    if (this.connectionAttempts >= this.maxConnectionAttempts) {
      throw new Error('Número máximo de tentativas de conexão excedido');
    }

    this.connectionAttempts++;

    return this.executeWithRateLimit(async () => {
      try {
        console.log(`🔗 Tentativa de conexão MEGA (${this.connectionAttempts}/${this.maxConnectionAttempts})...`);
        
        // 🔥 CORREÇÃO: Validar formato do email
        if (!this.credentials.email || !this.credentials.email.includes('@')) {
          throw new Error('Email MEGA inválido');
        }

        if (!this.credentials.password || this.credentials.password.length < 6) {
          throw new Error('Senha MEGA muito curta');
        }

        // Limpar conexão anterior
        if (this.storage) {
          try {
            this.storage.close();
          } catch (e) {
            console.log('🔄 Conexão anterior fechada');
          }
          this.storage = null;
        }

        // 🔥 CORREÇÃO: Configurações MEGA mais compatíveis
        this.storage = new Storage({
          email: this.credentials.email,
          password: this.credentials.password,
          autologin: false,
          keepalive: false,
          timeout: this.rateLimit.connectionTimeout
        });

        // Conexão simplificada
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error(`Timeout na conexão MEGA (${this.rateLimit.connectionTimeout/1000}s)`));
          }, this.rateLimit.connectionTimeout);

          this.storage.once('ready', () => {
            clearTimeout(timeout);
            this.isConnected = true;
            this.isBlocked = false;
            this.connectionAttempts = 0;
            console.log('✅ Conectado ao MEGA.nz com sucesso!');
            
            // 🔥 CORREÇÃO: Log de informações da conta
            if (this.storage.usedSpace !== undefined) {
              console.log(`📊 Espaço usado: ${this.formatBytes(this.storage.usedSpace)}`);
              console.log(`💾 Espaço total: ${this.formatBytes(this.storage.totalSpace)}`);
            }
            
            resolve(true);
          });

          this.storage.once('error', (error) => {
            clearTimeout(timeout);
            console.error('❌ Erro de conexão MEGA:', error.message);
            
            // 🔥 CORREÇÃO: Melhor detecção de erros
            if (error.message.includes('ESID') || error.message.includes('session')) {
              this.isBlocked = true;
              reject(new Error('Sessão MEGA inválida/expirada. Credenciais incorretas ou conta bloqueada.'));
            } else if (error.message.includes('credentials') || error.message.includes('login')) {
              reject(new Error('Credenciais MEGA inválidas - verifique email/senha'));
            } else if (error.message.includes('blocked') || error.message.includes('EBLOCKED')) {
              this.isBlocked = true;
              reject(new Error('Conta MEGA temporariamente bloqueada. Aguarde 1-6 horas.'));
            } else {
              reject(error);
            }
          });
        });

      } catch (error) {
        console.error('❌ Falha na conexão com MEGA:', error.message);
        this.isConnected = false;
        
        // 🔥 CORREÇÃO: Não tentar reconectar automaticamente
        throw error;
      }
    });
  }

  async ensureConnection() {
    if (this.isBlocked) {
      throw new Error('Conta MEGA bloqueada. Aguarde 1-6 horas ou use credenciais diferentes.');
    }
    
    if (!this.isConnected || !this.storage) {
      await this.connect();
    }
    
    return true;
  }

  // 🔥 CORREÇÃO: Busca MEGA simplificada - apenas pasta específica
  async listAllVideoFilesRecursive() {
    return this.executeWithRateLimit(async () => {
      try {
        await this.ensureConnection();
        
        console.log('🔍 Buscando vídeos no MEGA (modo seguro)...');
        
        // 🔥 CORREÇÃO: Tentar apenas pastas específicas primeiro
        const foldersToTry = [
          'Videos',
          'videos', 
          'Vídeos',
          'seehere-videos',
          'Mega/seehere-videos',
          'root/Videos'
        ];
        
        let megaFiles = [];
        
        for (const folder of foldersToTry) {
          console.log(`🔍 Tentando pasta: ${folder}`);
          try {
            const files = await this.listVideosInFolder(folder);
            if (files.length > 0) {
              console.log(`✅ Encontrados ${files.length} vídeos em ${folder}`);
              megaFiles = files;
              break;
            }
          } catch (error) {
            console.log(`📁 Pasta ${folder} não encontrada ou sem vídeos`);
          }
        }
        
        // Se não encontrou em pastas específicas, tentar busca limitada
        if (megaFiles.length === 0) {
          console.log('🔍 Buscando vídeos em toda a conta (limitado)...');
          megaFiles = await this.safeRecursiveSearch();
        }
        
        console.log(`✅ Total de vídeos encontrados: ${megaFiles.length}`);
        return megaFiles;
        
      } catch (error) {
        console.error('❌ Erro na busca de vídeos:', error.message);
        return [];
      }
    });
  }

  // 🔥 CORREÇÃO: Busca recursiva segura e limitada
  async safeRecursiveSearch(maxFolders = 10) {
    const allVideoFiles = [];
    let foldersScanned = 0;
    
    const searchInFolder = async (folder, currentPath = 'root', depth = 0) => {
      if (foldersScanned >= maxFolders || depth > 3) {
        return; // Limitar para evitar timeout
      }
      
      try {
        const children = await new Promise((resolve, reject) => {
          folder.children((error, children) => {
            if (error) reject(error);
            else resolve(children || []);
          });
        });
        
        for (const item of children) {
          if (item.directory) {
            foldersScanned++;
            if (foldersScanned < maxFolders) {
              await searchInFolder(item, `${currentPath}/${item.name}`, depth + 1);
            }
          } else {
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
    return allVideoFiles;
  }

  // BUSCA EM PASTA ESPECÍFICA (mantida)
  async listVideosInFolder(folderPath = 'Videos') {
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

  // 🔥 CORREÇÃO: Health check mais informativo
  async healthCheck() {
    try {
      // Teste de conexão básico
      await this.ensureConnection();
      const storageInfo = await this.getStorageInfo();
      
      return {
        status: 'healthy',
        mega: {
          connected: true,
          blocked: false,
          account: this.credentials.email,
          storage: storageInfo
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      let status = 'unhealthy';
      let message = error.message;
      
      if (error.message.includes('blocked') || error.message.includes('ESID') || this.isBlocked) {
        status = 'blocked';
        message = 'Conta MEGA bloqueada - Sessão expirada/inválida';
      } else if (error.message.includes('credentials')) {
        status = 'invalid_credentials';
        message = 'Credenciais MEGA inválidas';
      }
      
      return {
        status: status,
        mega: {
          connected: false,
          blocked: this.isBlocked,
          error: message,
          account: this.credentials.email
        },
        timestamp: new Date().toISOString(),
        solution: 'Verifique credenciais ou aguarde desbloqueio automático (1-6 horas)'
      };
    }
  }

  // 🔥 NOVO: Método para testar credenciais sem operações complexas
  async testCredentials() {
    try {
      console.log('🧪 Testando credenciais MEGA...');
      
      if (!this.credentials.email || !this.credentials.password) {
        return {
          valid: false,
          error: 'Credenciais não fornecidas'
        };
      }
      
      // Tentar conexão simples
      await this.connect();
      
      return {
        valid: true,
        account: this.credentials.email,
        storage: await this.getStorageInfo()
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message,
        account: this.credentials.email
      };
    }
  }

  // Manter outros métodos como estão, mas com tratamento de erro melhorado
  async getStorageInfo() {
    try {
      if (!this.isConnected) {
        throw new Error('Não conectado ao MEGA');
      }

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
      console.error('❌ Erro ao buscar info storage:', error.message);
      return {
        usedSpace: 0,
        totalSpace: 0,
        freeSpace: 0,
        usedPercentage: '0',
        isConnected: false,
        error: error.message
      };
    }
  }

  // Manter outros métodos (uploadFile, generatePublicLink, etc) como na versão anterior

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

  formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
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
}

// Singleton
const megaService = new MegaService();

export default megaService;