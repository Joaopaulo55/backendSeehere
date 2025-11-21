// megaScanner.js
import { Folder } from 'megajs';

export class MegaScanner {
  constructor() {
    // Dados da sua pasta pessoal (para verificação automática)
    this.myFolderUrl = 'https://mega.nz/folder/3JEWzDiK';
    this.myFolderKey = 'bkz17tKGgFIN6YFBQc1l_A';
  }

  /**
   * Função principal para escanear qualquer pasta pública do MEGA
   * @param {string} folderUrl - URL da pasta MEGA
   */
  async scanMegaFolder(folderUrl) {
    try {
      console.log('🔍 Iniciando scan da pasta MEGA:', folderUrl);

      // Se for a sua pasta, usa a chave interna
      if (folderUrl === this.myFolderUrl) {
        folderUrl = `${folderUrl}#${this.myFolderKey}`;
        console.log('✅ Pasta reconhecida como sua pasta pessoal');
      }

      // Cria a pasta com megajs
      const folder = new Folder({ url: folderUrl });

      // Carrega atributos dos arquivos (faz descriptografia automaticamente)
      await folder.loadAttributes();

      const videoFiles = folder.files
        .filter(file => file.name && /\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v|3gp|mpeg|mpg|ts)$/i.test(file.name))
        .map(file => ({
          name: file.name,
          size: file.size,
          formattedSize: this.formatBytes(file.size),
          downloadUrl: file.link,
          timestamp: file.ts ? file.ts * 1000 : null
        }));

      console.log(`✅ Encontrados ${videoFiles.length} vídeos na pasta`);
      return videoFiles;

    } catch (error) {
      console.error('❌ Erro no scan do MEGA:', error.message);
      throw error;
    }
  }

  /**
   * Formata bytes para KB, MB, GB...
   */
  formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
}

// Exemplo de uso
(async () => {
  const megaScanner = new MegaScanner();

  // Pode testar tanto com sua pasta quanto com qualquer pasta pública
  const folderUrl = 'https://mega.nz/folder/3JEWzDiK'; // ou qualquer outra pasta pública

  const videos = await megaScanner.scanMegaFolder(folderUrl);
  console.log('🎬 Lista de vídeos encontrados:');
  console.table(videos);
})();
