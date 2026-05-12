/* eslint-disable no-console */
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const argSchema = z.tuple([
  z.string().email('Email inválido'),
  z.string().min(12, 'Password debe tener al menos 12 caracteres'),
]);

async function main() {
  const args = process.argv.slice(2);
  const parsed = argSchema.safeParse(args);
  if (!parsed.success) {
    console.error('Uso: npm run create-admin -- <email> <password>');
    console.error(parsed.error.issues.map((i) => `  - ${i.message}`).join('\n'));
    process.exit(1);
  }

  const [emailRaw, password] = parsed.data;
  const email = emailRaw.toLowerCase();

  const prisma = new PrismaClient();
  try {
    const passwordHash = await bcrypt.hash(password, 12);

    const admin = await prisma.admin.upsert({
      where: { email },
      update: { passwordHash },
      create: { email, passwordHash },
    });

    console.log(`✔ Admin ${admin.email} creado/actualizado (id: ${admin.id})`);
    console.log('');
    console.log('Recuerda añadir este email a la variable ADMIN_EMAILS si no estaba.');
  } catch (err) {
    console.error('Error creando admin:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
