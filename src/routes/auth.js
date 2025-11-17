// auth.js - VERSÃO CORRIGIDA COM ROLE ADMIN
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Signup - 🔥 CORREÇÃO: Admin tem role ADMIN
router.post('/signup', async (req, res) => {
  try {
    const { email, password, displayName } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // 🔥 CORREÇÃO CRÍTICA: Definir role como ADMIN para email específico
    const isAdminEmail = email === 'admin@seehere.com' || 
                        email === 'superadmin@seehere.com' || 
                        email === 'emergency_admin@seehere.com';
    
    const userRole = isAdminEmail ? 'ADMIN' : 'USER';

    console.log(`👤 Criando usuário: ${email} com role: ${userRole}`);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName: displayName || email.split('@')[0],
        role: userRole, // 🔥 AGORA SERÁ ADMIN PARA EMAILS ESPECÍFICOS
        preferences: {
          theme: 'system',
          notifications: true
        }
      },
      select: { id: true, email: true, displayName: true, role: true }
    });

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '7d' }
    );

    console.log(`✅ Usuário criado: ${user.email} com role: ${user.role}`);

    res.status(201).json({ user, token });
  } catch (error) {
    console.error('Error in signup:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Login - Mantém igual
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '7d' }
    );

    res.json({
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
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
router.get('/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

export default router;