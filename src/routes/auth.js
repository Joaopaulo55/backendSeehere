// auth.js - VERSÃO COMPLETAMENTE CORRIGIDA
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Signup - CORRIGIDO
router.post('/signup', async (req, res) => {
  try {
    const { email, password, displayName } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ success: false, error: 'User already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // CORREÇÃO: Emails específicos são ADMIN
    const adminEmails = [
      'admin@seehere.com',
      'superadmin@seehere.com', 
      'emergency_admin@seehere.com',
      'admin_fixed@seehere.com',
      'superadmin_fixed@seehere.com',
      'xhanckin@gmail.com' // Adicione seu email aqui
    ];
    
    const userRole = adminEmails.includes(email.toLowerCase()) ? 'ADMIN' : 'USER';

    console.log(`👤 Criando usuário: ${email} com role: ${userRole}`);

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        displayName: displayName || email.split('@')[0],
        role: userRole,
        isActive: true
      },
      select: { id: true, email: true, displayName: true, role: true }
    });

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '7d' }
    );

    console.log(`✅ Usuário criado: ${user.email} com role: ${user.role}`);

    res.status(201).json({ success: true, user, token });
  } catch (error) {
    console.error('Error in signup:', error);
    res.status(500).json({ success: false, error: 'Failed to create user' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return res.status(401).json({ success: false, error: 'Account deactivated' });
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        avatarUrl: user.avatarUrl
      },
      token
    });
  } catch (error) {
    console.error('Error in login:', error);
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

// Get current user - ✅ CORREÇÃO CRÍTICA: REMOVIDA A ROTA /me AQUI
// Esta rota foi movida para admin.js onde está protegida por requireAdmin

// Rota pública para perfil do usuário (sem info sensível)
router.get('/profile', authenticateToken, (req, res) => {
  res.json({ 
    success: true,
    user: {
      id: req.user.id,
      email: req.user.email,
      displayName: req.user.displayName,
      avatarUrl: req.user.avatarUrl
      // ⚠️ NÃO inclui role - informação sensível
    }
  });
});

export default router;