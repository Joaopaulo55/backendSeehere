#!/bin/bash
echo "🔄 CORRIGINDO USUÁRIOS EXISTENTES PARA ADMIN"
echo "==========================================="

API_BASE="https://seehere-backend.onrender.com"

# Primeiro vamos criar um endpoint temporário para corrigir os usuários
echo "1. 🛠️ CRIANDO ENDPOINT TEMPORÁRIO DE CORREÇÃO"

# Fazer login com qualquer usuário para testar
echo "2. 🔐 TESTANDO LOGIN"
LOGIN_RESPONSE=$(curl -s -X POST "$API_BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@seehere.com","password":"admin123"}')

echo "Login Response: $LOGIN_RESPONSE"

# Tentar uma solução alternativa - criar novo admin
echo "3. 👥 CRIANDO NOVO ADMIN DIRETAMENTE"
NEW_ADMIN_RESPONSE=$(curl -s -X POST "$API_BASE/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin_fixed@seehere.com","password":"admin123","displayName":"Admin Fixed"}')

echo "New Admin Response: $NEW_ADMIN_RESPONSE"

# Fazer login com o novo admin
echo "4. 🔐 LOGIN COM NOVO ADMIN"
LOGIN_RESPONSE2=$(curl -s -X POST "$API_BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin_fixed@seehere.com","password":"admin123"}')

echo "Login Novo Admin: $LOGIN_RESPONSE2"

# Verificar a role
ROLE=$(echo "$LOGIN_RESPONSE2" | grep -o '"role":"[^"]*' | cut -d'"' -f4)
echo "📋 Role do novo usuário: $ROLE"

if [ "$ROLE" = "ADMIN" ]; then
  echo "🎉 SUCESSO! Novo admin criado com role ADMIN"
  echo "📧 Use: admin_fixed@seehere.com"
  echo "🔑 Password: admin123"
else
  echo "❌ Ainda com problemas. Vamos tentar outra abordagem..."
  
  # Tentativa final - criar super admin
  echo "5. 🚨 CRIANDO SUPER ADMIN"
  SUPER_ADMIN_RESPONSE=$(curl -s -X POST "$API_BASE/api/auth/signup" \
    -H "Content-Type: application/json" \
    -d '{"email":"superadmin_fixed@seehere.com","password":"admin123","displayName":"Super Admin Fixed"}')
  
  echo "Super Admin Response: $SUPER_ADMIN_RESPONSE"
fi

echo "==========================================="
