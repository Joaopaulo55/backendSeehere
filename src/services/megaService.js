// megaService.js - VERSÃO COM CREDENCIAIS DIRETAS NO CÓDIGO
import { Storage } from 'megajs';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const execAsync = promisify(exec);
const readFile = promisify(fs.readFile);
const unlink = promisify(fs.unlink);
const accessAsync = promisify(fs.access);
const statAsync = promisify(fs.stat);

class MegaService {
  constructor() {
    this.storage = null;
    this.isConnected = false;
    this.isBlocked = false;
    this.lastRequestTime = 0;
    
    // Configurações de rate limiting
    this.rateLimit = {
      maxRequestsPerMinute: 20,
      minTimeBetweenRequests: 3000,
      retryDelay: 10000,
      maxRetries: 2,
      connectionTimeout: 45000
    };

    // ✅ CREDENCIAIS DIRETAS NO CÓDIGO
    this.credentials = {
      email: 'xhanckin@gmail.com',
      password: 'Xhackin@2025/500'
    };

    console.log('🔑 Credenciais MEGA configuradas para:', this.credentials.email);

    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 3;
    
    // Configuração de fallback
    this.fallbackPriority = ['mega', 'mega-cmd'];
    this.currentMethod = 'mega';
    
    // Conectar automaticamente na inicialização
    this.initializeConnection();
  }

  // ✅ NOVO MÉTODO: Inicialização automática
  async initializeConnection() {
    try {
      console.log('🚀 Inicializando conexão MEGA automaticamente...');
      await this.connectMega();
    } catch (error) {
      console.warn('⚠️ Conexão automática falhou, mas o serviço continuará:', error.message);
    }
  }

  // ✅ CORREÇÃO: Adicionar método ensureConnection que estava faltando
  async ensureConnection() {
    if (this.isConnected && this.storage) {
      return true;
    }

    console.log('🔄 Garantindo conexão MEGA...');
    try {
      await this.connectMega();
      return this.isConnected;
    } catch (error) {
      console.error('❌ Falha ao garantir conexão:', error);
      return false;
    }
  }

  // ========== SISTEMA DE FALLBACK AUTOMÁTICO ==========
  async executeWithFallback(operationName, operation) {
    let lastError = null;
    
    for (const method of this.fallbackPriority) {
      try {
        console.log(`🔄 Tentando ${operationName} via ${method.toUpperCase()}...`);
        
        let result;
        switch (method) {
          case 'mega':
            result = await this.executeWithRateLimit(() => operation('mega'));
            break;
          case 'mega-cmd':
            result = await this.executeMegaCmdOperation(operationName, operation);
            break;
          default:
            throw new Error(`Método não suportado: ${method}`);
        }
        
        this.currentMethod = method;
        console.log(`✅ ${operationName} realizado com sucesso via ${method.toUpperCase()}`);
        return result;
        
      } catch (error) {
        console.warn(`❌ Falha no ${method.toUpperCase()} para ${operationName}:`, error.message);
        lastError = error;
        
        if (method !== this.fallbackPriority[this.fallbackPriority.length - 1]) {
          console.log(`🔄 Alternando para próximo método...`);
          continue;
        }
      }
    }
    
    throw new Error(`Todos os métodos falharam para ${operationName}: ${lastError?.message}`);
  }

  // ========== MEGA SDK (MÉTODO PRINCIPAL) ==========
  async executeWithRateLimit(operation) {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.rateLimit.minTimeBetweenRequests) {
      await new Promise(resolve => 
        setTimeout(resolve, this.rateLimit.minTimeBetweenRequests - timeSinceLastRequest)
      );
    }

    this.lastRequestTime = Date.now();
    
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
        
        if (this.isAccountBlockedError(error)) {
          this.isBlocked = true;
          console.error('🚫 Conta MEGA bloqueada. Aguarde algumas horas.');
          break;
        }
        
        if (attempt < this.rateLimit.maxRetries) {
          const delay = this.rateLimit.retryDelay * Math.pow(2, attempt - 1);
          console.log(`⏳ Aguardando ${delay/1000} segundos antes da próxima tentativa...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }

  // ✅ CORREÇÃO: Detecção robusta de bloqueio
  isAccountBlockedError(error) {
    const blockedIndicators = [
      'blocked', 'EBLOCKED', 'EAGAIN', 'ETEMPUNAVAIL', 
      'EOVERQUOTA', 'over quota', 'temporarily unavailable'
    ];
    
    return blockedIndicators.some(indicator => 
      error.message?.toLowerCase().includes(indicator.toLowerCase())
    );
  }

  async connectMega() {
    if (this.connectionAttempts >= this.maxConnectionAttempts) {
      throw new Error('Número máximo de tentativas de conexão excedido');
    }

    this.connectionAttempts++;

    return this.executeWithRateLimit(async () => {
      try {
        console.log(`🔗 Tentativa ${this.connectionAttempts}/${this.maxConnectionAttempts} - Conectando ao MEGA.nz...`);
        
        console.log('📧 Usando email:', this.credentials.email);

        if (this.storage) {
          try {
            this.storage.close();
          } catch (e) {}
          this.storage = null;
        }

        this.storage = new Storage({
          email: this.credentials.email,
          password: this.credentials.password,
          autologin: true,
          keepalive: true,
          timeout: this.rateLimit.connectionTimeout
        });

        const connectionPromise = new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error(`Timeout na conexão com MEGA após ${this.rateLimit.connectionTimeout/1000} segundos`));
          }, this.rateLimit.connectionTimeout);

          const readyHandler = () => {
            clearTimeout(timeout);
            this.storage.off('error', errorHandler);
            this.isConnected = true;
            this.isBlocked = false;
            this.connectionAttempts = 0;
            console.log('✅ Conectado ao MEGA.nz com sucesso!');
            
            this.updateStorageInfo().then(resolve).catch(resolve);
          };

          const errorHandler = (error) => {
            clearTimeout(timeout);
            this.storage.off('ready', readyHandler);
            console.error('❌ Erro na conexão MEGA:', error.message);
            
            if (this.isAccountBlockedError(error)) {
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
        
        if (this.isAccountBlockedError(error)) {
          this.isBlocked = true;
        }
        
        if (!this.isBlocked && this.connectionAttempts < this.maxConnectionAttempts) {
          console.log(`🔄 Nova tentativa de conexão em ${this.rateLimit.retryDelay/1000} segundos...`);
          await new Promise(resolve => setTimeout(resolve, this.rateLimit.retryDelay));
          return this.connectMega();
        }
        
        throw error;
      }
    });
  }

  // ✅ CORREÇÃO: Obter informações de storage de forma correta
  async updateStorageInfo() {
    if (!this.storage) return;
    
    try {
      await this.storage.reloadAccountData();
      console.log('📊 Informações de storage atualizadas');
    } catch (error) {
      console.warn('⚠️ Não foi possível atualizar informações de storage:', error.message);
    }
  }

  async ensureMegaConnection() {
    if (this.isBlocked) {
      throw new Error('Conta MEGA temporariamente bloqueada. Tente novamente mais tarde.');
    }
    
    if (!this.isConnected || !this.storage) {
      await this.connectMega();
    } else {
      try {
        await this.storage.reloadAccountData();
      } catch (error) {
        console.warn('⚠️ Conexão MEGA pode estar inativa, reconectando...');
        this.isConnected = false;
        await this.connectMega();
      }
    }
  }

  // ========== MEGA-CMD (FALLBACK) ==========
  async checkMegaCmdAvailable() {
    try {
      await execAsync('mega-version');
      return true;
    } catch (error) {
      console.warn('⚠️ MEGA-CMD não está disponível no sistema');
      return false;
    }
  }

  async executeMegaCmdOperation(operationName, operation) {
    const isAvailable = await this.checkMegaCmdAvailable();
    if (!isAvailable) {
      throw new Error('MEGA-CMD não disponível');
    }

    switch (operationName) {
      case 'listFiles':
        return await this.listFilesWithMegaCmd();
      case 'uploadFile':
        return await operation('mega-cmd');
      case 'downloadFile':
        return await operation('mega-cmd');
      case 'storageInfo':
        return await this.getStorageInfoWithMegaCmd();
      default:
        throw new Error(`Operação não suportada via MEGA-CMD: ${operationName}`);
    }
  }

  async listFilesWithMegaCmd() {
    try {
      const { stdout } = await execAsync('mega-ls -l --time-format=iso');
      return this.parseMegaCmdList(stdout);
    } catch (error) {
      throw new Error(`MEGA-CMD list failed: ${error.message}`);
    }
  }

  // ✅ CORREÇÃO: Parser robusto para output do MEGA-CMD
  parseMegaCmdList(output) {
    const lines = output.split('\n').filter(line => line.trim());
    const files = [];
    
    for (const line of lines) {
      const patterns = [
        /^\[.*\]\s+([\d.]+)\s+(\w+)\s+([\dT:-]+)\s+(.+)$/,
        /^-\S+\s+([\d.]+)\s+(\w+)\s+([\dT:-]+)\s+(.+)$/,
        /^([\d.]+)\s+(\w+)\s+(.+)$/
      ];
      
      let match = null;
      for (const pattern of patterns) {
        match = line.match(pattern);
        if (match) break;
      }
      
      if (match) {
        const size = parseFloat(match[1]);
        const unit = match[2];
        const name = match[match.length - 1];
        const timestamp = match[3] ? new Date(match[3]).getTime() : Date.now();
        const sizeInBytes = this.convertToBytes(size, unit);
        
        files.push({
          name,
          size: sizeInBytes,
          formattedSize: this.formatBytes(sizeInBytes),
          timestamp,
          type: 'file',
          path: '/',
          via: 'mega-cmd'
        });
      }
    }
    
    return files;
  }

  convertToBytes(size, unit) {
    const units = {
      'B': 1,
      'KB': 1024,
      'MB': 1024 * 1024,
      'GB': 1024 * 1024 * 1024,
      'TB': 1024 * 1024 * 1024 * 1024
    };
    
    const normalizedUnit = unit.toUpperCase();
    return size * (units[normalizedUnit] || 1);
  }

  // ✅ CORREÇÃO: Upload robusto com MEGA-CMD
  async uploadWithMegaCmd(filePath, remotePath = '/') {
    try {
      await accessAsync(filePath);
      
      const escapedFilePath = this.escapeShellArg(filePath);
      const escapedRemotePath = this.escapeShellArg(remotePath);
      
      const { stdout, stderr } = await execAsync(
        `mega-put ${escapedFilePath} ${escapedRemotePath}`
      );
      
      if (stderr && !stderr.includes('warning')) {
        throw new Error(stderr);
      }
      
      console.log(`✅ Upload via MEGA-CMD realizado: ${stdout}`);
      
      return {
        success: true,
        filePath,
        remotePath,
        via: 'mega-cmd'
      };
    } catch (error) {
      throw new Error(`Upload via MEGA-CMD falhou: ${error.message}`);
    }
  }

  // ✅ NOVO: Escape seguro para argumentos de shell
  escapeShellArg(arg) {
    return `'${arg.replace(/'/g, "'\\''")}'`;
  }

  // ========== OPERAÇÕES UNIFICADAS COM FALLBACK ==========
  async listAllVideoFiles() {
    return this.executeWithFallback('listFiles', async (method) => {
      if (method === 'mega') {
        await this.ensureMegaConnection();
        
        const allVideoFiles = [];
        
        const traverseFolder = async (folder, currentPath = '') => {
          try {
            await folder.reload();
            const children = Array.isArray(folder.children) ? folder.children : [];
            
            for (const item of children) {
              if (item.directory) {
                const folderPath = currentPath ? `${currentPath}/${item.name}` : item.name;
                await traverseFolder(item, folderPath);
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
                    timestamp: item.timestamp || Date.now(),
                    path: currentPath || '/',
                    via: 'mega'
                  });
                }
              }
            }
          } catch (error) {
            console.error(`❌ Erro ao buscar na pasta ${currentPath}:`, error.message);
          }
        };
        
        await traverseFolder(this.storage.root);
        return allVideoFiles;
        
      } else if (method === 'mega-cmd') {
        const allFiles = await this.listFilesWithMegaCmd();
        return allFiles.filter(file => {
          const isVideo = /\.(mp4|avi|mov|mkv|wmv|flv|webm|m4v|3gp|mpeg|mpg)$/i.test(file.name);
          return isVideo && file.size > 0;
        });
      }
    });
  }

  // ✅ NOVO: Método específico para listAllVideoFilesRecursive (usado no admin.js)
  async listAllVideoFilesRecursive() {
    return await this.listAllVideoFiles();
  }

  // ✅ NOVO: Método específico para listVideosInFolder (usado no admin.js)
  async listVideosInFolder(folderPath = 'Mega/seehere-videos') {
    try {
      const allVideos = await this.listAllVideoFiles();
      return allVideos.filter(video => 
        video.path.includes(folderPath) || folderPath === ''
      );
    } catch (error) {
      console.error('Erro ao listar vídeos na pasta:', error);
      return [];
    }
  }

  // ✅ NOVO: Método específico para getFileDownloadLink (usado no admin.js)
  async getFileDownloadLink(fileId) {
    return this.executeWithFallback('downloadFile', async (method) => {
      if (method === 'mega') {
        await this.ensureMegaConnection();
        
        const findFileById = (node, targetId) => {
          if (!node.children) return null;
          
          for (const child of node.children) {
            if (child.downloadId === targetId) {
              return child;
            }
            if (child.directory) {
              const found = findFileById(child, targetId);
              if (found) return found;
            }
          }
          return null;
        };
        
        const file = findFileById(this.storage.root, fileId);
        if (!file) {
          throw new Error('Arquivo não encontrado no MEGA');
        }
        
        const downloadUrl = await this.generatePublicLink(file);
        return downloadUrl;
        
      } else if (method === 'mega-cmd') {
        // Fallback para MEGA-CMD
        throw new Error('Download por fileId não suportado via MEGA-CMD');
      }
    });
  }

  async uploadFile(filePath, fileName, options = {}) {
    return this.executeWithFallback('uploadFile', async (method) => {
      if (method === 'mega') {
        await this.ensureMegaConnection();

        console.log(`📤 Iniciando upload via MEGA SDK: ${fileName}`);
        
        await accessAsync(filePath);
        const stats = await statAsync(filePath);
        console.log(`📊 Tamanho do arquivo: ${this.formatBytes(stats.size)}`);
        
        return new Promise((resolve, reject) => {
          const uploadStream = fs.createReadStream(filePath);
          
          const upload = this.storage.upload({
            name: fileName,
            size: stats.size
          }, uploadStream);

          upload.on('complete', async (file) => {
            console.log(`✅ Upload concluído: ${file.name} (${this.formatBytes(file.size)})`);

            try {
              const downloadUrl = await this.generatePublicLink(file);
              
              if (options.cleanup !== false) {
                try {
                  await unlink(filePath);
                  console.log(`🧹 Arquivo temporário removido: ${filePath}`);
                } catch (cleanupError) {
                  console.warn('⚠️ Não foi possível remover arquivo temporário:', cleanupError.message);
                }
              }

              resolve({
                fileId: file.downloadId,
                downloadUrl: downloadUrl,
                size: file.size,
                name: file.name,
                timestamp: new Date().toISOString(),
                megaNode: file.nodeId,
                via: 'mega'
              });
            } catch (error) {
              reject(error);
            }
          });

          upload.on('error', (error) => {
            reject(new Error(`Upload falhou: ${error.message}`));
          });

          upload.on('progress', (info) => {
            const percent = ((info.bytesLoaded / info.bytesTotal) * 100).toFixed(1);
            console.log(`📤 Upload progresso: ${percent}%`);
          });

          upload.on('transfer', (data) => {
            console.log(`📦 Transferindo: ${this.formatBytes(data.transferred)}`);
          });
        });

      } else if (method === 'mega-cmd') {
        return await this.uploadWithMegaCmd(filePath, '/');
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

  async getStorageInfo() {
    return this.executeWithFallback('storageInfo', async (method) => {
      if (method === 'mega') {
        await this.ensureMegaConnection();

        await this.updateStorageInfo();
        
        return {
          usedSpace: this.storage.usedSpace || 0,
          totalSpace: this.storage.totalSpace || 0,
          freeSpace: (this.storage.totalSpace || 0) - (this.storage.usedSpace || 0),
          usedPercentage: this.storage.totalSpace ? 
            ((this.storage.usedSpace / this.storage.totalSpace) * 100).toFixed(2) : '0',
          isConnected: this.isConnected,
          account: this.credentials.email,
          via: 'mega'
        };

      } else if (method === 'mega-cmd') {
        return await this.getStorageInfoWithMegaCmd();
      }
    });
  }

  async getStorageInfoWithMegaCmd() {
    try {
      const { stdout } = await execAsync('mega-df -h');
      return this.parseMegaCmdDf(stdout);
    } catch (error) {
      throw new Error(`MEGA-CMD storage info failed: ${error.message}`);
    }
  }

  parseMegaCmdDf(output) {
    const lines = output.split('\n');
    let total = 0, used = 0, free = 0;
    
    for (const line of lines) {
      if (line.includes('Total') && line.includes('space')) {
        const match = line.match(/Total\s+space:\s*([\d.]+)\s*(\w+)/i);
        if (match) total = this.convertToBytes(parseFloat(match[1]), match[2]);
      } else if (line.includes('Used') && line.includes('space')) {
        const match = line.match(/Used\s+space:\s*([\d.]+)\s*(\w+)/i);
        if (match) used = this.convertToBytes(parseFloat(match[1]), match[2]);
      } else if (line.includes('Free') && line.includes('space')) {
        const match = line.match(/Free\s+space:\s*([\d.]+)\s*(\w+)/i);
        if (match) free = this.convertToBytes(parseFloat(match[1]), match[2]);
      }
    }
    
    const usedPercentage = total > 0 ? ((used / total) * 100).toFixed(2) : '0';
    
    return {
      usedSpace: used,
      totalSpace: total,
      freeSpace: free,
      usedPercentage,
      account: this.credentials.email,
      via: 'mega-cmd'
    };
  }

  // ========== MÉTODOS AUXILIARES ==========
  async connect() {
    try {
      await this.connectMega();
      return { success: true, method: 'mega' };
    } catch (error) {
      console.warn('❌ Conexão MEGA falhou, verificando MEGA-CMD...');
      
      const isMegaCmdAvailable = await this.checkMegaCmdAvailable();
      if (isMegaCmdAvailable) {
        console.log('✅ MEGA-CMD disponível como fallback');
        return { success: true, method: 'mega-cmd' };
      }
      
      throw new Error('Nenhum método de conexão disponível');
    }
  }

  async healthCheck() {
    try {
      const storageInfo = await this.getStorageInfo();
      const accountStatus = await this.checkAccountStatus();
      
      return {
        status: 'healthy',
        currentMethod: this.currentMethod,
        mega: {
          connected: this.isConnected,
          blocked: this.isBlocked,
          account: this.credentials.email,
          storage: storageInfo
        },
        megaCmd: {
          available: await this.checkMegaCmdAvailable()
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        currentMethod: this.currentMethod,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  async checkAccountStatus() {
    try {
      const storageInfo = await this.getStorageInfo();
      
      return {
        status: 'active',
        isBlocked: false,
        storage: storageInfo,
        canUpload: true,
        method: this.currentMethod
      };
    } catch (error) {
      if (this.isAccountBlockedError(error) || this.isBlocked) {
        return {
          status: 'blocked',
          isBlocked: true,
          message: 'Conta temporariamente bloqueada',
          canUpload: false,
          method: this.currentMethod
        };
      }
      
      return {
        status: 'error',
        isBlocked: false,
        message: error.message,
        canUpload: false,
        method: this.currentMethod
      };
    }
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
        console.log('🔌 Desconectado do MEGA.nz');
      } catch (error) {
        console.error('❌ Erro ao desconectar:', error.message);
      }
    }
  }

  getCurrentMethod() {
    return this.currentMethod;
  }

  setFallbackPriority(priority) {
    this.fallbackPriority = priority;
    console.log(`🎯 Ordem de fallback atualizada: ${priority.join(' → ')}`);
  }

  // ✅ NOVO: Método para verificar status rápido
  getStatus() {
    return {
      isConnected: this.isConnected,
      isBlocked: this.isBlocked,
      account: this.credentials.email,
      currentMethod: this.currentMethod,
      connectionAttempts: this.connectionAttempts
    };
  }
}

// Criar instância única (Singleton)
const megaService = new MegaService();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🔄 Desconectando serviços MEGA...');
  await megaService.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🔄 Desconectando serviços MEGA...');
  await megaService.disconnect();
  process.exit(0);
});

export default megaService;