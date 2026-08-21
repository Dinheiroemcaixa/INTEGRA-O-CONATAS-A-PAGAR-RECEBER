const fs = require('fs');

const filePath = 'src/lib/conta-azul/api.ts';
let content = fs.readFileSync(filePath, 'utf-8');

const fetchCAFn = `
/**
 * Helper para lidar com os limites de requisicao da Conta Azul (Spike Arrest).
 * Intercepta erros 429 e aplica um backoff exponencial.
 */
async function fetchCA(url, options) {
  const maxRetries = 3;
  for (let i = 0; i < maxRetries; i++) {
    await new Promise(r => setTimeout(r, 200));
    const res = await fetch(url, options);
    if (res.status === 429) {
      const waitTime = (2 ** i) * 1000;
      console.warn(\`[fetchCA] Rate limit atingido (429) - Tentativa \${i+1}/\${maxRetries}. Aguardando \${waitTime}ms...\`);
      await new Promise(r => setTimeout(r, waitTime));
      continue;
    }
    return res;
  }
  return fetch(url, options);
}
`;

if (!content.includes('function fetchCA(')) {
  content = content.replace("const AUTHORIZE_URL = 'https://auth.contaazul.com/login'", "const AUTHORIZE_URL = 'https://auth.contaazul.com/login'\n" + fetchCAFn);
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log('Funcao inserida com sucesso!');
} else {
  console.log('A funcao ja existe.');
}
