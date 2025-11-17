// fix-users.js - SCRIPT PARA CORRIGIR ROLES
import { prisma } from '../lib/prisma.js';

async function fixUserRoles() {
  try {
    console.log('🔧 CORRIGINDO ROLES DOS USUÁRIOS...');
    
    // Lista de emails que devem ser ADMIN
    const adminEmails = ['admin@seehere.com', 'superadmin@seehere.com'];
    
    for (const email of adminEmails) {
      const user = await prisma.user.findUnique({
        where: { email }
      });
      
      if (user && user.role !== 'ADMIN') {
        console.log(`🔄 Atualizando ${email} de ${user.role} para ADMIN`);
        
        await prisma.user.update({
          where: { email },
          data: { role: 'ADMIN' }
        });
        
        console.log(`✅ ${email} agora é ADMIN`);
      } else if (user) {
        console.log(`✅ ${email} já é ADMIN`);
      } else {
        console.log(`⚠️ ${email} não encontrado`);
      }
    }
    
    console.log('🎉 Correção de roles concluída!');
  } catch (error) {
    console.error('❌ Erro ao corrigir roles:', error);
    throw error;
  }
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  fixUserRoles()
    .then(() => {
      console.log('✨ Script executado com sucesso!');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Erro no script:', error);
      process.exit(1);
    });
}

export { fixUserRoles };

