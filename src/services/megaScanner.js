// services/megaScanner.js
import fetch from 'node-fetch';

export class MegaScanner {
  constructor() {
    this.baseUrl = 'https://g.api.mega.co.nz';
  }

  async scanMegaFolder(folderUrl) {
    try {
      console.log('🔍 Iniciando scan da pasta MEGA:', folderUrl);
      
      // Extrair ID e chave da URL
      const { folderId, folderKey } = this.parseMegaUrl(folderUrl);
      
      if (!folderId || !folderKey) {
        throw new Error('URL do MEGA inválida. Formato esperado: https://mega.nz/folder/ID#CHAVE');
      }

      // Fazer request para API do MEGA
      const files = await this.fetchFolderContents(folderId, folderKey);
      
      console.log(`✅ Encontrados ${files.length} arquivos na pasta`);
      return files;
      
    } catch (error) {
      console.error('❌ Erro no scan do MEGA:', error.message);
      throw error;
    }
  }

  parseMegaUrl(url) {
    try {
      // Suporta formatos:
      // https://mega.nz/folder/ID#CHAVE
      // https://mega.nz/folder/ID#CHAVE/outra-coisa
      const match = url.match(/mega\.nz\/folder\/([^#\s]+)#([^\/\s]*)/);
      
      if (!match) {
        throw new Error('Formato de URL inválido');
      }

      return {
        folderId: match[1],
        folderKey: match[2]
      };
    } catch (error) {
      throw new Error(`Erro ao parsear URL: ${error.message}`);
    }
  }

  async fetchFolderContents(folderId, folderKey) {
    try {
      const url = `${this.baseUrl}/cs?id=0&n=${folderId}`;
      
      const payload = [{
        a: 'f',
        c: 1,
        r: 1,
        ca: 1
      }];

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data || !data[0] || !data[0].f) {
        throw new Error('Resposta inválida da API do MEGA');
      }

      return this.processFiles(data[0].f, folderKey);
      
    } catch (error) {
      throw new Error(`Falha ao buscar conteúdo: ${error.message}`);
    }
  }

  processFiles(files, folderKey) {
    const videoFiles = [];
    
    for (const file of files) {
      try {
        // Verificar se é arquivo (não pasta)
        if (file.t === 0) {
          const fileName = this.decryptAttribute(file.a, folderKey);
          const fileSize = file.s;
          
          // Verificar se é vídeo
          if (this.isVideoFile(fileName)) {
            const fileId = file.h;
            const downloadUrl = this.generateDownloadUrl(fileId, folderKey);
            
            videoFiles.push({
              name: fileName,
              size: fileSize,
              formattedSize: this.formatBytes(fileSize),
              downloadId: fileId,
              downloadUrl: downloadUrl,
              timestamp: file.ts * 1000, // Converter para milliseconds
              type: 'file',
              path: '/'
            });
          }
        }
      } catch (error) {
        console.warn('⚠️ Ignorando arquivo inválido:', error.message);
      }
    }

    return videoFiles;
  }

  decryptAttribute(attributes, key) {
    try {
      // Simples decodificação - em produção usar biblioteca apropriada
      if (typeof attributes === 'string') {
        return attributes;
      }
      return attributes.n || 'unknown_file';
    } catch (error) {
      return 'decrypted_file';
    }
  }

  isVideoFile(filename) {
    if (!filename) return false;
    
    const videoExtensions = [
      '.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv', 
      '.webm', '.m4v', '.3gp', '.mpeg', '.mpg', '.ts'
    ];
    
    const lowerName = filename.toLowerCase();
    return videoExtensions.some(ext => lowerName.endsWith(ext));
  }

  generateDownloadUrl(fileId, fileKey) {
    return `https://mega.nz/file/${fileId}#${fileKey}`;
  }

  formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
}

export const megaScanner = new MegaScanner();

