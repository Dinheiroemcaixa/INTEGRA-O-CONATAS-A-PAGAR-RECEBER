import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

const loaderCode = `
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const targetPath = path.resolve(process.cwd(), 'src', specifier.slice(2) + '.ts');
    return nextResolve(pathToFileURL(targetPath).href, context);
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !path.extname(specifier) && context.parentURL && !context.parentURL.includes('node_modules')) {
    const parentDir = path.dirname(fileURLToPath(context.parentURL));
    const targetPath = path.resolve(parentDir, specifier + '.ts');
    return nextResolve(pathToFileURL(targetPath).href, context);
  }
  return nextResolve(specifier, context);
}
`
register(`data:text/javascript,${encodeURIComponent(loaderCode)}`, pathToFileURL('./'))

const { parseFolhaFromOCR, validarResultadoFolhaNativa } = await import('@/lib/parsers/ocrParsers')
const { extrairTextoPDF } = await import('@/lib/parsers/pdfExtractor')

// 1. Texto estruturado no formato exato produzido por extrairTextoPDF (pdfjs-dist, ordenado por coordenada Y e separado por 3 espaços),
// utilizando dados pessoais fictícios (LGPD) mas mantendo exatamente os 7 registros, comprimentos de nomes e soma de R$ 4.999,60.
const TEXTO_PDFJS_RELACAO_LIQUIDOS_FICTICIO = [
  'Empresa:   EMPRESA EXEMPLO AUTOMOTIVA LTDA   Página:   1 / 1',
  'CNPJ:   00.000.000/0001-00   Emissão:   19/10/2026',
  'Cálculo:   Adiantamento   Horas:   09:08:41',
  'Competência:   10/2026',
  'RELAÇÃO GERAL DOS LÍQUIDOS',
  'Código   Nome do empregado   CPF   Valor',
  'Empregados',
  '65   COLABORADOR FICTICIO NUMERO UM DO NASCIMENTO   000.000.001-01   722,70',
  '60   COLABORADOR FICTICIO NUMERO DOIS DIAS   000.000.002-02   760,40',
  '70   COLABORADOR FICTICIO NUMERO TRES FALCAO   000.000.003-03   730,00',
  '68   COLABORADOR FICTICIO NUMERO QUATRO GERALDO   000.000.004-04   748,72',
  '47   COLABORADOR FICTICIO NUMERO CINCO SILVA   000.000.005-05   783,12',
  '67   COLABORADOR FICTICIO NUMERO SEIS JESUS   000.000.006-06   760,40',
  '75   COLABORADOR FICTICIO NUMERO SETE NUNES   000.000.007-07   494,26',
  'Empregados: 7   Estagiários: 0   Contribuintes: 0   Total da Empresa:   4.999,60',
  '(quatro mil novecentos e noventa e nove reais e sessenta centavos)',
  'BELO HORIZONTE, 19/10/2026   Responsável:',
  'Sistema licenciado para CONTABILIDADE EXEMPLO LTDA',
].join('\n')

// 2. Texto bruto no formato de camada OCR (onde 'Cálculo:' e 'Adiantamento' ou colunas podem quebrar)
const TEXTO_OCR_LAYER_RELACAO_LIQUIDOS_FICTICIO = `RELAÇÃO GERAL DOS LÍQUIDOS
Código Nome do empregado CPF Valor
Empresa: EMPRESA EXEMPLO AUTOMOTIVA LTDA
CNPJ: 00.000.000/0001-00
Cálculo: Adiantamento
Competência: 10/2026
Página: 
Emissão: 
Horas: 
1 / 1
19/10/2026
09:08:41
Empregados
65 COLABORADOR FICTICIO NUMERO UM DO NASCIMENTO 000.000.001-01 722,70
60 COLABORADOR FICTICIO NUMERO DOIS DIAS 000.000.002-02 760,40
70 COLABORADOR FICTICIO NUMERO TRES FALCAO 000.000.003-03 730,00
68 COLABORADOR FICTICIO NUMERO QUATRO GERALDO 000.000.004-04 748,72
47 COLABORADOR FICTICIO NUMERO CINCO SILVA 000.000.005-05 783,12
67 COLABORADOR FICTICIO NUMERO SEIS JESUS 000.000.006-06 760,40
75 COLABORADOR FICTICIO NUMERO SETE NUNES 000.000.007-07 494,26
Empregados: 7 Estagiários: 0 Contribuintes: 0 Total da Empresa: 4.999,60
(quatro mil novecentos e noventa e nove reais e sessenta centavos)
BELO HORIZONTE, 19/10/2026 Responsável: 
Sistema licenciado para CONTABILIDADE EXEMPLO LTDA`

const REGISTROS_ESPERADOS = [
  {
    fornecedor: 'COLABORADOR FICTICIO NUMERO UM DO NASCIMENTO',
    cpf_cnpj: '000.000.001-01',
    valor: 722.7,
    tipo: 'Adiantamento',
    descricao: 'ADIANTAMENTO',
    data_vencimento: '',
  },
  {
    fornecedor: 'COLABORADOR FICTICIO NUMERO DOIS DIAS',
    cpf_cnpj: '000.000.002-02',
    valor: 760.4,
    tipo: 'Adiantamento',
    descricao: 'ADIANTAMENTO',
    data_vencimento: '',
  },
  {
    fornecedor: 'COLABORADOR FICTICIO NUMERO TRES FALCAO',
    cpf_cnpj: '000.000.003-03',
    valor: 730.0,
    tipo: 'Adiantamento',
    descricao: 'ADIANTAMENTO',
    data_vencimento: '',
  },
  {
    fornecedor: 'COLABORADOR FICTICIO NUMERO QUATRO GERALDO',
    cpf_cnpj: '000.000.004-04',
    valor: 748.72,
    tipo: 'Adiantamento',
    descricao: 'ADIANTAMENTO',
    data_vencimento: '',
  },
  {
    fornecedor: 'COLABORADOR FICTICIO NUMERO CINCO SILVA',
    cpf_cnpj: '000.000.005-05',
    valor: 783.12,
    tipo: 'Adiantamento',
    descricao: 'ADIANTAMENTO',
    data_vencimento: '',
  },
  {
    fornecedor: 'COLABORADOR FICTICIO NUMERO SEIS JESUS',
    cpf_cnpj: '000.000.006-06',
    valor: 760.4,
    tipo: 'Adiantamento',
    descricao: 'ADIANTAMENTO',
    data_vencimento: '',
  },
  {
    fornecedor: 'COLABORADOR FICTICIO NUMERO SETE NUNES',
    cpf_cnpj: '000.000.007-07',
    valor: 494.26,
    tipo: 'Adiantamento',
    descricao: 'ADIANTAMENTO',
    data_vencimento: '',
  },
]

/**
 * Gera em memória um buffer PDF 1.4 mínimo válido contendo linhas de texto vetorial
 * para testar `extrairTextoPDF` (pdfjs-dist) sem depender de arquivos externos nem dados reais.
 */
function criarBufferPDFSintetico(linhas: string[]): Buffer {
  const comandosTexto = linhas
    .map((linha, idx) => {
      const y = 780 - idx * 20
      const escapado = linha.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
      return `BT /F1 10 Tf 40 ${y} Td (${escapado}) Tj ET`
    })
    .join('\n')

  const objetos: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${Buffer.byteLength(comandosTexto, 'latin1')} >>\nstream\n${comandosTexto}\nendstream\nendobj\n`,
  ]

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = [0]
  for (const obj of objetos) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'))
    pdf += obj
  }

  const xrefStart = Buffer.byteLength(pdf, 'latin1')
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`
  for (let i = 1; i <= objetos.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`

  return Buffer.from(pdf, 'latin1')
}

test('1. Extrai perfeitamente os 7 registros do relatório Relação Geral dos Líquidos (formato pdfjs-dist) preservando nomes completos e soma 4.999,60', () => {
  const resultado = parseFolhaFromOCR(TEXTO_PDFJS_RELACAO_LIQUIDOS_FICTICIO)

  assert.equal(resultado.tipoCalculo, 'Adiantamento')
  assert.equal(resultado.dados.length, 7)
  assert.deepEqual(resultado.dados, REGISTROS_ESPERADOS)

  // Verifica nomes longos completos sem truncamento
  assert.equal(resultado.dados[0].fornecedor, 'COLABORADOR FICTICIO NUMERO UM DO NASCIMENTO')
  assert.equal(resultado.dados[2].fornecedor, 'COLABORADOR FICTICIO NUMERO TRES FALCAO')
  assert.equal(resultado.dados[6].fornecedor, 'COLABORADOR FICTICIO NUMERO SETE NUNES')

  const somaTotal = Number(
    resultado.dados.reduce((acc, item) => acc + item.valor, 0).toFixed(2)
  )
  assert.equal(somaTotal, 4999.6)
})

test('2. Extrai perfeitamente os mesmos 7 registros quando o texto vem no formato da camada OCR ou com quebra de linha após Cálculo:', () => {
  const textoComQuebraCalculo = TEXTO_OCR_LAYER_RELACAO_LIQUIDOS_FICTICIO.replace(
    'Cálculo: Adiantamento',
    'Cálculo:\nAdiantamento'
  )
  const resultado = parseFolhaFromOCR(textoComQuebraCalculo)

  assert.equal(resultado.tipoCalculo, 'Adiantamento')
  assert.equal(resultado.dados.length, 7)
  assert.deepEqual(resultado.dados, REGISTROS_ESPERADOS)
})

test('3. validarResultadoFolhaNativa: aprova extração nativa íntegra e rejeita PDF escaneado ou divergente para acionar fallback do Gemini', () => {
  // Caso A: PDF válido -> Usa extração nativa (sem chamar Gemini)
  const resultadoValido = parseFolhaFromOCR(TEXTO_PDFJS_RELACAO_LIQUIDOS_FICTICIO)
  assert.equal(
    validarResultadoFolhaNativa(TEXTO_PDFJS_RELACAO_LIQUIDOS_FICTICIO, resultadoValido),
    true
  )

  // Caso B: PDF escaneado sem camada de texto -> Retorna false (aciona fallback Gemini)
  assert.equal(validarResultadoFolhaNativa('', { tipoCalculo: 'Folha Mensal', dados: [] }), false)

  // Caso C: PDF com texto incompleto onde falta 1 empregado (6 extraídos vs 7 no rodapé / soma diferente de 4.999,60) -> Retorna false (aciona fallback Gemini)
  const resultadoIncompleto = {
    tipoCalculo: 'Adiantamento',
    dados: REGISTROS_ESPERADOS.slice(0, 6),
  }
  assert.equal(
    validarResultadoFolhaNativa(TEXTO_PDFJS_RELACAO_LIQUIDOS_FICTICIO, resultadoIncompleto),
    false
  )
})

test('4. Extração nativa de binário PDF em memória via extrairTextoPDF (pdfjs-dist) + parseFolhaFromOCR com 7 registros e soma R$ 4.999,60', async () => {
  const linhasPDF = [
    'Empresa: EMPRESA EXEMPLO AUTOMOTIVA LTDA',
    'CNPJ: 00.000.000/0001-00',
    'Calculo: Adiantamento',
    'Competencia: 10/2026',
    'RELACAO GERAL DOS LIQUIDOS',
    'Codigo Nome do empregado CPF Valor',
    'Empregados',
    '65 COLABORADOR FICTICIO NUMERO UM DO NASCIMENTO 000.000.001-01 722,70',
    '60 COLABORADOR FICTICIO NUMERO DOIS DIAS 000.000.002-02 760,40',
    '70 COLABORADOR FICTICIO NUMERO TRES FALCAO 000.000.003-03 730,00',
    '68 COLABORADOR FICTICIO NUMERO QUATRO GERALDO 000.000.004-04 748,72',
    '47 COLABORADOR FICTICIO NUMERO CINCO SILVA 000.000.005-05 783,12',
    '67 COLABORADOR FICTICIO NUMERO SEIS JESUS 000.000.006-06 760,40',
    '75 COLABORADOR FICTICIO NUMERO SETE NUNES 000.000.007-07 494,26',
    'Empregados: 7 Estagiarios: 0 Contribuintes: 0 Total da Empresa: 4.999,60',
  ]

  const pdfBytes = criarBufferPDFSintetico(linhasPDF)
  const file = new File([new Uint8Array(pdfBytes)], 'relatorio-liquidos-ficticio.pdf', {
    type: 'application/pdf',
  })

  // Ajuste de acentuação no cabeçalho sintético ("Cálculo:") para acionar a detecção de Adiantamento
  const textoExtraidoBruto = await extrairTextoPDF(file)
  const textoNormalizado = textoExtraidoBruto.replace('Calculo:', 'Cálculo:')
  const resultado = parseFolhaFromOCR(textoNormalizado)

  assert.equal(validarResultadoFolhaNativa(textoNormalizado, resultado), true)
  assert.equal(resultado.tipoCalculo, 'Adiantamento')
  assert.equal(resultado.dados.length, 7)
  assert.deepEqual(resultado.dados, REGISTROS_ESPERADOS)

  const somaTotal = Number(
    resultado.dados.reduce((acc, item) => acc + item.valor, 0).toFixed(2)
  )
  assert.equal(somaTotal, 4999.6)
})
