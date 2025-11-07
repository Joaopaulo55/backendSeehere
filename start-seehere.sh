#!/bin/bash
echo "🎬 Iniciando Seehere Streaming..."

# Iniciar PostgreSQL
echo "🐘 Iniciando PostgreSQL..."
pg_ctl -D $PREFIX/var/lib/postgresql start

# Iniciar Redis
echo "🔴 Iniciando Redis..."
redis-server --daemonize yes

# Aguardar serviços iniciarem
sleep 3

# Navegar para o backend
cd ~/seehere-streaming/backend

# Instalar dependências se necessário
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependências do backend..."
    npm install
    npx prisma generate
fi

# Configurar database
echo "🗄️ Configurando database..."
npx prisma db push
npm run db:seed

# Iniciar servidor
echo "🚀 Iniciando servidor backend..."
npm start
