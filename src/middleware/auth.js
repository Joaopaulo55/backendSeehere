// auth.js - MIDDLEWARE CORRIGIDO E MELHORADO
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';

export const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    console.log('❌ Token não fornecido');
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
    console.log('🔐 Token decodificado para userId:', decoded.userId);
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { 
        id: true, 
        email: true, 
        displayName: true, 
        role: true,
        avatarUrl: true 
      }
    });

    if (!user) {
      console.log('❌ Usuário não encontrado no banco');
      return res.status(401).json({ error: 'User not found' });
    }

    console.log('✅ Usuário autenticado:', user.email, 'Role:', user.role);
    req.user = user;
    next();
  } catch (error) {
    console.error('❌ Token verification error:', error.message);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({ error: 'Invalid token' });
    }
    
    return res.status(403).json({ error: 'Token verification failed' });
  }
};

export const requireAdmin = (req, res, next) => {
  console.log('🔐 Verificando permissões admin para:', req.user?.email);
  console.log('👤 Role do usuário:', req.user?.role);
  
  if (!req.user) {
    console.log('❌ Usuário não autenticado');
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // 🔥 CORREÇÃO: Verificar se o usuário é ADMIN ou EDITOR
  if (req.user.role !== 'ADMIN' && req.user.role !== 'EDITOR') {
    console.log('❌ Acesso negado: usuário não é ADMIN ou EDITOR');
    return res.status(403).json({ 
      error: 'Admin access required',
      userRole: req.user.role,
      requiredRoles: ['ADMIN', 'EDITOR']
    });
  }
  
  console.log('✅ Acesso admin permitido');
  next();
};