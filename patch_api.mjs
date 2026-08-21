import fs from 'fs';

const filePath = 'src/lib/conta-azul/api.ts';
let content = fs.readFileSync(filePath, 'utf-8');

const fetchCAFn = `
/**
 * Helper para lidar com os limites de requisição da Conta Azul (Spike Arrest).
 * Intercepta erros 429 e aplica um backoff exponencial.
 */
async function fetchCA(url: string | URL | Request, options?: RequestInit): Promise<Response> {
  const maxRetries = 3;
  for (let i = 0; i < maxRetries; i++) {
    // Delay de segurança mínimo (200ms) entre requisições para evitar bater o spike arrest de 10/segundo em loops apertados
    await new Promise(r => setTimeout(r, 200));
    
    const res = await fetch(url, options);
    if (res.status === 429) {
      const waitTime = (2 ** i) * 1000;
      console.warn(\`[fetchCA] Rate limit atingido (429) na URL \${typeof url === 'string' ? url : '...'} - Tentativa \${i+1}/\${maxRetries}. Aguardando \${waitTime}ms...\`);
      await new Promise(r => setTimeout(r, waitTime));
      continue;
    }
    return res;
  }
  return fetch(url, options);
}

`;

if (!content.includes('function fetchCA(')) {
  // Inserir a função logo abaixo dos imports (ou logo depois das constantes de URL)
  content = content.replace(/(const AUTHORIZE_URL = '[^']+';)/, '$1\n' + fetchCAFn);
}

// Substituir as chamadas de 'await fetch(' por 'await fetchCA('
// Menos aquelas na própria função fetchCA!
content = content.replace(/await fetch\(/g, 'await fetchCA(');

// Corrigir a própria função fetchCA para usar 'fetch' original dentro dela
content = content.replace(/const res = await fetchCA\(url, options\);/g, 'const res = await fetch(url, options);');
content = content.replace(/return fetchCA\(url, options\);/g, 'return fetch(url, options);');

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Arquivo api.ts modificado com sucesso!');
