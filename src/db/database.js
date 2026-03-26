const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function initDB() {
  const bcrypt = require('bcryptjs');
  const count = await prisma.user.count();
  if (count === 0) {
    const hash = await bcrypt.hash('admin123', 10);
    await prisma.user.create({
      data: { email: 'admin@acervo.com', password: hash, name: 'Administrador', role: 'admin' },
    });
    console.log('✓ Admin criado: admin@acervo.com / admin123');
  }
}

module.exports = { prisma, initDB };
