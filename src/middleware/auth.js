import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';

export const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ 
      success: false,
      error: 'Token de acesso necessário' 
    });
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
        isActive: true,
        isVerified: true
      }
    });

    if (!user) {
      return res.status(401).json({ 
        success: false,
        error: 'Usuário não encontrado' 
      });
    }

    if (!user.isActive) {
      return res.status(403).json({ 
        success: false,
        error: 'Conta desativada' 
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Erro na verificação do token:', error.message);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false,
        error: 'Token expirado' 
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({ 
        success: false,
        error: 'Token inválido' 
      });
    }
    
    return res.status(403).json({ 
      success: false,
      error: 'Falha na verificação do token' 
    });
  }
};

export const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      success: false,
      error: 'Autenticação necessária' 
    });
  }
  
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ 
      success: false,
      error: 'Acesso de administrador necessário',
      userRole: req.user.role
    });
  }
  
  next();
};

export const requireEditor = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      success: false,
      error: 'Autenticação necessária' 
    });
  }
  
  if (!['ADMIN', 'EDITOR'].includes(req.user.role)) {
    return res.status(403).json({ 
      success: false,
      error: 'Acesso de editor necessário',
      userRole: req.user.role
    });
  }
  
  next();
};