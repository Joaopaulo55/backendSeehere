#!/bin/bash
echo "🚀 Iniciando instalação do Seehere no Termux..."

# Verificar se está no Termux
if [ ! -d "/data/data/com.termux" ]; then
    echo "❌ Este script deve ser executado no Termux!"
    exit 1
fi

# Atualizar pacotes
echo "📦 Atualizando pacotes..."
pkg update -y && pkg upgrade -y

# Instalar dependências
echo "📥 Instalando dependências..."
pkg install -y nodejs python git wget curl postgresql redis ffmpeg

# Configurar PostgreSQL
echo "🐘 Configurando PostgreSQL..."
pg_ctl -D $PREFIX/var/lib/postgresql start
sleep 2

# Criar database e usuário
echo "🗄️ Criando database..."
createuser seehere_user || true
createdb seehere || true
psql -c "ALTER USER seehere_user WITH PASSWORD 'seehere_pass';" || true
psql -c "GRANT ALL PRIVILEGES ON DATABASE seehere TO seehere_user;" || true

# Clonar ou criar estrutura do projeto
cd ~
if [ -d "seehere-streaming" ]; then
    echo "📁 Diretório já existe, atualizando..."
    cd seehere-streaming
else
    echo "📁 Criando estrutura do projeto..."
    mkdir seehere-streaming
    cd seehere-streaming
fi

# Criar estrutura de pastas
mkdir -p backend/uploads
mkdir -p frontend/public
mkdir -p painel-admin/css
mkdir -p painel-admin/js

echo "✅ Instalação básica concluída!"
echo "📝 Agora copie os arquivos do projeto para as pastas correspondentes"
