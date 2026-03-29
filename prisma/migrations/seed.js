const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const db = new PrismaClient();

function hash(p) {
  return crypto.createHash('sha256').update(p).digest('hex');
}

async function main() {
  // Admin user
  const admin = await db.user.upsert({
    where: { phone: '+250700000001' },
    update: {},
    create: {
      phone: '+250700000001',
      name: 'Admin',
      role: 'ADMIN',
      passwordHash: hash('admin123'),
    },
  });
  console.log('Admin:', admin.phone, '/ password: admin123');

  // Owner user
  const owner = await db.user.upsert({
    where: { phone: '+250700000002' },
    update: {},
    create: {
      phone: '+250700000002',
      name: 'Fleet Owner',
      role: 'OWNER',
      passwordHash: hash('owner123'),
    },
  });
  console.log('Owner:', owner.phone, '/ password: owner123');

  // Sample motorcycle assigned to owner
  const moto = await db.motorcycle.upsert({
    where: { plateNumber: 'RAD 001A' },
    update: {},
    create: {
      plateNumber: 'RAD 001A',
      make: 'TVS',
      model: 'Apache 200',
      year: 2022,
      totalPrice: 1800000,
      status: 'AVAILABLE',
      ownerId: owner.id,
    },
  });
  console.log('Motorcycle:', moto.plateNumber);
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
