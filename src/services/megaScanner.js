// megaScanner.js
import * as mega from 'megajs';


export class MegaScanner {
  constructor() {
    this.myFolderUrl = 'https://mega.nz/folder/3JEWzDiK';
    this.myFolderKey = 'bkz17tKGgFIN6YFBQc1l_A';
  }

  async scanMegaFolder(folderUrl) {
    try {
      console.log('🔍 Iniciando scan da pasta MEGA:', folderUrl);

      // corrige automaticamente sua pasta
      if (folderUrl === this.myFolderUrl) {
        folderUrl = `${folderUrl}#${this.myFolderKey}`;
      }

      // MODO CORRETO de abrir pasta
      const folder = mega.File.fromURL(folderUrl);

      await folder.loadAttributes();
      await folder.children();

      const children = folder.children;

      const videoExtensions =
        /\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v|3gp|mpeg|mpg|ts)$/i;

      const videoFiles = [];

      for (const file of children) {
        if (!file.name || !videoExtensions.test(file.name)) continue;

        // pega o link correto
        const link = await file.link();

        videoFiles.push({
          name: file.name,
          size: file.size,
          formattedSize: this.formatBytes(file.size),
          downloadUrl: link,
          downloadId: this.extractFileId(link),
          timestamp: file.ts ? file.ts * 1000 : null
        });
      }

      console.log(`✅ Encontrados ${videoFiles.length} vídeos na pasta`);
      return videoFiles;

    } catch (err) {
      console.error('❌ Erro no scan:', err);
      throw err;
    }
  }

  extractFileId(url) {
    if (!url) return null;
    const match = url.match(/\/file\/([^#]+)/);
    return match ? match[1] : null;
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / 1024 ** i).toFixed(2) + ' ' + sizes[i];
  }
}

export const megaScanner = new MegaScanner();