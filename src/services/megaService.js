// megaService.js - VERSÃO COMPLETA E CORRIGIDA
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
      maxRequestsPerMinute: 20,
      minTimeBetweenRequests: 3000,
      retryDelay: 10000,
      maxRetries: 2,
      connectionTimeout: 45000
    };

    this.credentials = {
      email: process.env.MEGA_EMAIL || 'xhanckin@gmail.com',
      password: process.env.MEGA_PASSWORD || 'Xhackin@2025/500'
    };

    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 3;
  }

  // ========== FUNÇÃO QUE BUSCA EM TODAS AS PASTAS ==========
  async listAllVideoFilesRecursive() {
    return this.executeWithRateLimit(async () => {
      try {
        await this.ensureConnection();
        
        console.log('🔍 Buscando TODOS os arquivos de vídeo no MEGA (recursivo)...');
        
        const allVideoFiles = [];
        
        // Função recursiva para buscar em TODAS as pastas
        const searchInFolder = async (folder, currentPath = 'root') => {
          try {
            // Listar conteúdo da pasta