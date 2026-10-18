import { config } from 'dotenv';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

config();

const supabaseUrl = process.env['SUPABASE_URL'];
const publishableKey = process.env['SUPABASE_PUBLISHABLE_KEY'];

if (!supabaseUrl || !publishableKey) {
  console.error('Defina SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY no ambiente ou no arquivo .env.');
  process.exit(1);
}

try {
  const parsedUrl = new URL(supabaseUrl);
  if (parsedUrl.protocol !== 'https:' && parsedUrl.hostname !== 'localhost') {
    throw new Error('A URL do Supabase deve usar HTTPS (exceto localhost).');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'SUPABASE_URL inválida.');
  process.exit(1);
}

if (publishableKey.startsWith('sb_secret_')) {
  console.error('Uma chave sb_secret não pode ser usada no cliente Angular. Use uma publishable key.');
  process.exit(1);
}

const jwtPayload = publishableKey.split('.')[1];
if (jwtPayload) {
  try {
    const decodedPayload = JSON.parse(Buffer.from(jwtPayload, 'base64url').toString('utf8'));
    if (decodedPayload.role === 'service_role') {
      console.error('Uma chave service_role não pode ser usada no cliente Angular. Use uma publishable/anon key.');
      process.exit(1);
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error('SUPABASE_PUBLISHABLE_KEY contém um JWT inválido.');
      process.exit(1);
    }
    throw error;
  }
}

const generatedSource = [
  'export const supabaseEnvironment = {',
  `  url: ${JSON.stringify(supabaseUrl)},`,
  `  publishableKey: ${JSON.stringify(publishableKey)},`,
  '};',
  '',
].join('\n');

await writeFile(
  resolve('src/app/core/data/supabase-environment.generated.mjs'),
  generatedSource,
  'utf8',
);

console.log('Configuração do Supabase gerada para este build.');