// scripts/seed.js
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...');

  try {
    // Criar usuário admin principal
    const adminPassword = await bcrypt.hash('admin123', 12);
    const admin = await prisma.user.upsert({
      where: { email: 'admin@seehere.com' },
      update: {
        passwordHash: adminPassword,
        role: 'ADMIN',
        isActive: true,
        isVerified: true,
        displayName: 'Administrador Principal'
      },
      create: {
        email: 'admin@seehere.com',
        passwordHash: adminPassword,
        displayName: 'Administrador Principal',
        role: 'ADMIN',
        isActive: true,
        isVerified: true
      }
    });

    // Criar usuário editor de exemplo
    const editorPassword = await bcrypt.hash('editor123', 12);
    const editor = await prisma.user.upsert({
      where: { email: 'editor@seehere.com' },
      update: {
        passwordHash: editorPassword,
        role: 'EDITOR',
        isActive: true,
        isVerified: true,
        displayName: 'Editor Exemplo'
      },
      create: {
        email: 'editor@seehere.com',
        passwordHash: editorPassword,
        displayName: 'Editor Exemplo',
        role: 'EDITOR',
        isActive: true,
        isVerified: true
      }
    });

    // Criar usuário comum de exemplo
    const userPassword = await bcrypt.hash('user123', 12);
    const user = await prisma.user.upsert({
      where: { email: 'user@seehere.com' },
      update: {
        passwordHash: userPassword,
        role: 'USER',
        isActive: true,
        isVerified: false,
        displayName: 'Usuário Exemplo'
      },
      create: {
        email: 'user@seehere.com',
        passwordHash: userPassword,
        displayName: 'Usuário Exemplo',
        role: 'USER',
        isActive: true,
        isVerified: false
      }
    });

    // Criar algumas coleções de exemplo
    const collections = await Promise.all([
      prisma.collection.upsert({
        where: { name: 'Filmes Populares' },
        update: {},
        create: {
          name: 'Filmes Populares',
          description: 'Os filmes mais populares da plataforma',
          thumbnailUrl: 'https://images.unsplash.com/photo-1489599809505-7c8e45128ffd?w=300',
          isFeatured: true,
          isPublic: true,
          createdById: admin.id
        }
      }),
      prisma.collection.upsert({
        where: { name: 'Documentários' },
        update: {},
        create: {
          name: 'Documentários',
          description: 'Documentários educativos e informativos',
          thumbnailUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=300',
          isFeatured: false,
          isPublic: true,
          createdById: admin.id
        }
      })
    ]);

    console.log('✅ Seed concluído com sucesso!');
    console.log('👤 Usuários criados:');
    console.log(`   - Admin: admin@seehere.com / admin123`);
    console.log(`   - Editor: editor@seehere.com / editor123`);
    console.log(`   - User: user@seehere.com / user123`);
    console.log(`📚 Coleções criadas: ${collections.length}`);

  } catch (error) {
    console.error('❌ Erro no seed:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error('❌ Falha no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });