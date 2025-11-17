// fix-users.js - NA MESMA PASTA QUE admin.js
import { prisma } from '../lib/prisma.js';

export async function fixUserRoles() {
  try {
    console.log('🔧 CORRIGINDO ROLES DOS USUÁRIOS...');
    
    // Lista de emails que devem ser ADMIN
    const adminEmails = [
      'admin@seehere.com',
      'superadmin@seehere.com', 
      'emergency_admin@seehere.com',
      'admin_fixed@seehere.com',
      'superadmin_fixed@seehere.com'
    ];
    
    const results = [];
    
    for (const email of adminEmails) {
      const user = await prisma.user.findUnique({
        where: { email }
      });
      
      if (user) {
        if (user.role !== 'ADMIN') {
          // Atualizar para ADMIN
          const updatedUser = await prisma.user.update({
            where: { email },
            data: { role: 'ADMIN' }
          });
          results.push({
            email,
            action: 'UPDATED',
            oldRole: user.role,
            newRole: 'ADMIN'
          });
          console.log(`✅ ${email} atualizado de ${user.role} para ADMIN`);
        } else {
          results.push({
            email, 
            action: 'ALREADY_ADMIN',
            role: 'ADMIN'
          });
          console.log(`✅ ${email} já é ADMIN`);
        }
      } else {
        results.push({
          email,
          action: 'NOT_FOUND'
        });
        console.log(`⚠️ ${email} não encontrado`);
      }
    }
    
    console.log('🎉 Correção de roles concluída!');
    return results;
    
  } catch (error) {
    console.error('❌ Erro ao corrigir roles:', error);
    throw error;
  }
}