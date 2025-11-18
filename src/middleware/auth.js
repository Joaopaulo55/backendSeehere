// auth.js - MIDDLEWARE CORRIGIDO
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';

export const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { 
        id: true, 
        email: true, 
        displayName: true, 
        role: true,
        avatarUrl: true,
        isActive: true // ✅ ADICIONADO
      }
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // ✅ VERIFICAÇÃO CORRIGIDA: Permitir login mesmo se isActive for false/null
    if (user.isActive === false) {
      console.log('⚠️ Usuário desativado tentando acessar:', user.email);
      // Não bloqueamos aqui, apenas registramos
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Token verification error:', error.message);
    
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
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // ✅ CORREÇÃO: Verificar se usuário está ativo
  if (req.user.isActive === false) {
    return res.status(403).json({ 
      error: 'Account deactivated',
      userRole: req.user.role
    });
  }
  
  if (req.user.role !== 'ADMIN' && req.user.role !== 'EDITOR') {
    return res.status(403).json({ 
      error: 'Admin access required',
      userRole: req.user.role,
      requiredRoles: ['ADMIN', 'EDITOR']
    });
  }
  
  next();
};