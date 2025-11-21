import express from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// Aplicar middleware de admin para todas as rotas
router.use(authenticateToken);
router.use(requireAdmin);

// Listar todos os usuários
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, search, role } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let where = {};

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { displayName: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (role) {
      where.role = role;
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        role: true,
        isActive: true,
        isVerified: true,
        lastLogin: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            videos: true,
            comments: true,
            likes: true
          }
        }
      },
      skip,
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' }
    });

    const total = await prisma.user.count({ where });

    res.json({
      success: true,
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Erro ao buscar usuários:', error);
    res.status(500).json({
      success: false,
      error: 'Falha ao buscar usuários'
    });
  }
});

// Obter usuário específico
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        role: true,
        isActive: true,
        isVerified: true,
        lastLogin: true,
        createdAt: true,
        updatedAt: true,
        videos: {
          include: {
            _count: {
              select: { likes: true, comments: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        },
        collections: {
          orderBy: { createdAt: 'desc' }
        },
        _count: {
          select: {
            videos: true,
            comments: true,
            likes: true
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuário não encontrado'
      });
    }

    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error('Erro ao buscar usuário:', error);
    res.status(500).json({
      success: false,
      error: 'Falha ao buscar usuário'
    });
  }
});

// Atualizar usuário
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { displayName, role, isActive, isVerified } = req.body;

    // Verificar se o usuário está tentando modificar a si mesmo
    if (id === req.user.id && (role !== 'ADMIN' || isActive === false)) {
      return res.status(403).json({
        success: false,
        error: 'Não é possível modificar seu próprio papel ou desativar sua própria conta'
      });
    }

    const user = await prisma.user.findUnique({
      where: { id }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuário não encontrado'
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        displayName,
        role,
        isActive,
        isVerified
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        role: true,
        isActive: true,
        isVerified: true,
        lastLogin: true,
        createdAt: true
      }
    });

    // Log de auditoria
    console.log(`👤 Usuário ${user.email} atualizado por ${req.user.email}`);

    res.json({
      success: true,
      user: updatedUser,
      message: 'Usuário atualizado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao atualizar usuário:', error);
    res.status(500).json({
      success: false,
      error: 'Falha ao atualizar usuário'
    });
  }
});

// Criar usuário (apenas admin)
router.post('/', async (req, res) => {
  try {
    const { email, password, displayName, role, isActive, isVerified } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email e senha são obrigatórios'
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'Usuário já existe'
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        displayName: displayName || email.split('@')[0],
        role: role || 'USER',
        isActive: isActive !== undefined ? isActive : true,
        isVerified: isVerified || false
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        role: true,
        isActive: true,
        isVerified: true,
        createdAt: true
      }
    });

    // Log de auditoria
    console.log(`👤 Novo usuário criado por admin: ${user.email} por ${req.user.email}`);

    res.status(201).json({
      success: true,
      user,
      message: 'Usuário criado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao criar usuário:', error);
    res.status(500).json({
      success: false,
      error: 'Falha ao criar usuário'
    });
  }
});

// Deletar usuário
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Impedir que o usuário delete a si mesmo
    if (id === req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Não é possível deletar sua própria conta'
      });
    }

    const user = await prisma.user.findUnique({
      where: { id }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuário não encontrado'
      });
    }

    await prisma.user.delete({
      where: { id }
    });

    // Log de auditoria
    console.log(`🗑️ Usuário ${user.email} deletado por ${req.user.email}`);

    res.json({
      success: true,
      message: 'Usuário deletado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao deletar usuário:', error);
    res.status(500).json({
      success: false,
      error: 'Falha ao deletar usuário'
    });
  }
});

// Estatísticas de usuários
router.get('/stats/overview', async (req, res) => {
  try {
    const [
      totalUsers,
      activeUsers,
      verifiedUsers,
      usersByRole,
      recentRegistrations
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.count({ where: { isVerified: true } }),
      prisma.user.groupBy({
        by: ['role'],
        _count: true
      }),
      prisma.user.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          createdAt: true
        }
      })
    ]);

    const roleStats = usersByRole.reduce((acc, item) => {
      acc[item.role] = item._count;
      return acc;
    }, {});

    res.json({
      success: true,
      stats: {
        totalUsers,
        activeUsers,
        verifiedUsers,
        roleStats,
        recentRegistrations
      }
    });
  } catch (error) {
    console.error('Erro ao buscar estatísticas:', error);
    res.status(500).json({
      success: false,
      error: 'Falha ao buscar estatísticas'
    });
  }
});

export default router;

