import { NextRequest, NextResponse } from 'next/server'
import { XMLParser } from 'fast-xml-parser'

export const dynamic = 'force-dynamic'

// ─── Padrões de Código de Barras Code 128C para Chave de 44 Dígitos ──────────
const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112"
]

function generateBarcodeSVG(chave: string): string {
  const digits = chave.replace(/\D/g, '')
  if (digits.length !== 44) return ''

  const symbols: number[] = [105] // START C
  let checksum = 105

  for (let i = 0; i < 44; i += 2) {
    const pair = parseInt(digits.substring(i, i + 2), 10)
    symbols.push(pair)
    checksum += pair * (i / 2 + 1)
  }

  const checkSymbol = checksum % 103
  symbols.push(checkSymbol)
  symbols.push(106) // STOP

  let patternStr = ''
  for (const sym of symbols) {
    patternStr += CODE128_PATTERNS[sym] || ''
  }

  let svgBars = ''
  let posX = 10
  let isBar = true

  for (let i = 0; i < patternStr.length; i++) {
    const width = parseInt(patternStr[i], 10) * 1.5
    if (isBar) {
      svgBars += `<rect x="${posX}" y="0" width="${width}" height="42" fill="#000000" />`
    }
    posX += width
    isBar = !isBar
  }

  const totalWidth = posX + 10
  return `<svg viewBox="0 0 ${totalWidth} 42" width="100%" height="42" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">${svgBars}</svg>`
}

function formatCpfCnpj(doc: any): string {
  if (!doc) return ''
  const d = String(doc).replace(/\D/g, '')
  if (d.length === 11) {
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  }
  if (d.length === 14) {
    return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  }
  return String(doc)
}

function formatMoeda(val: any): string {
  const num = Number(val) || 0
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatData(dt: any): string {
  if (!dt) return ''
  try {
    const s = String(dt).trim()
    if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) return s.substring(0, 10)
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const [ano, mes, diaResto] = s.split('-')
      const dia = diaResto.substring(0, 2)
      return `${dia}/${mes}/${ano}`
    }
    const d = new Date(s)
    if (!isNaN(d.getTime())) {
      const dia = String(d.getDate()).padStart(2, '0')
      const mes = String(d.getMonth() + 1).padStart(2, '0')
      const ano = d.getFullYear()
      return `${dia}/${mes}/${ano}`
    }
    return s
  } catch { return String(dt) }
}

function formatDataHora(dt: any): string {
  if (!dt) return ''
  try {
    const s = String(dt).trim()
    if (s.includes('T')) {
      const [dataPart, horaPart] = s.split('T')
      const [ano, mes, dia] = dataPart.split('-')
      const hora = horaPart.substring(0, 8)
      return `${dia}/${mes}/${ano} ${hora}`
    }
    return formatData(dt)
  } catch { return String(dt) }
}

function formatCep(cep: any): string {
  if (!cep) return ''
  const c = String(cep).replace(/\D/g, '')
  if (c.length === 8) {
    return c.replace(/(\d{5})(\d{3})/, '$1-$2')
  }
  return String(cep)
}

// ─── GET: Renderizar DANFE Oficial ──────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const empresa_id = searchParams.get('empresa_id')
    const chaveRaw = searchParams.get('chave') || searchParams.get('chave_acesso')
    const autoPrint = searchParams.get('print') === '1' || searchParams.get('auto_print') === '1'

    if (!empresa_id || !chaveRaw) {
      return new NextResponse('<h3>Erro: empresa_id e chave de acesso são obrigatórios.</h3>', {
        status: 400,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      })
    }

    const chave = chaveRaw.replace(/\D/g, '')
    if (chave.length !== 44) {
      return new NextResponse('<h3>Erro: Chave de acesso inválida (deve conter 44 dígitos).</h3>', {
        status: 400,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      })
    }

    const { getValidToken } = await import('@/lib/conta-azul/token-manager')

    let accessToken: string
    try {
      const tokenRes = await getValidToken(empresa_id, 'vendas')
      accessToken = tokenRes.accessToken
    } catch {
      const tokenRes = await getValidToken(empresa_id, 'financeiro')
      accessToken = tokenRes.accessToken
    }

    const CA_BASE = 'https://api-v2.contaazul.com/v1'
    const urlXml = `${CA_BASE}/notas-fiscais/${chave}`

    const resCa = await fetch(urlXml, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })

    if (!resCa.ok) {
      const errTxt = await resCa.text().catch(() => '')
      return new NextResponse(`<h3>Erro ao obter XML da NF-e no Conta Azul (${resCa.status}):</h3><p>${errTxt}</p>`, {
        status: resCa.status,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      })
    }

    const xml = await resCa.text()

    // Parse XML
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text'
    })

    const parsed = parser.parse(xml)
    const nfeProc = parsed.nfeProc || parsed
    const nfe = nfeProc.NFe || parsed.NFe
    const infNFe = nfe?.infNFe || {}
    const ide = infNFe?.ide || {}
    const emit = infNFe?.emit || {}
    const enderEmit = emit?.enderEmit || {}
    const dest = infNFe?.dest || {}
    const enderDest = dest?.enderDest || {}
    const total = infNFe?.total?.ICMSTot || {}
    const protNFe = nfeProc.protNFe?.infProt || {}
    const transp = infNFe?.transp || {}
    const transporta = transp?.transporta || {}
    const vol = transp?.vol || {}
    const infAdic = infNFe?.infAdic || {}

    let det = infNFe?.det || []
    if (!Array.isArray(det)) det = [det]

    const chaveFormatada = chave.replace(/(\d{4})/g, '$1 ').trim()
    const barcodeSvg = generateBarcodeSVG(chave)

    const numNF = String(ide.nNF || '').padStart(9, '0').replace(/(\d{3})(\d{3})(\d{3})/, '$1.$2.$3')
    const serieNF = ide.serie || '1'
    const tipoOperacao = String(ide.tpNF) === '0' ? '0 - ENTRADA' : '1 - SAÍDA'
    const natOperacao = ide.natOp || 'VENDA DE MERCADORIAS'
    const protocoloAuth = protNFe.nProt 
      ? `${protNFe.nProt} - ${formatDataHora(protNFe.dhRecbto || ide.dhEmi)}`
      : 'EMITIDA EM HOMOLOGAÇÃO / CONTINGÊNCIA'

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DANFE - NF-e nº ${ide.nNF || 'S/N'}</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 8pt;
      color: #000;
      background: #334155;
      padding: 20px 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* Barra Superior */
    .toolbar {
      position: sticky;
      top: 0;
      z-index: 1000;
      max-width: 210mm;
      margin: -20px auto 15px auto;
      background: #0f172a;
      padding: 10px 16px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      color: #fff;
    }
    .toolbar .title {
      font-weight: bold;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .toolbar .btn-group {
      display: flex;
      gap: 8px;
    }
    .toolbar button, .toolbar a {
      background: #2563eb;
      color: white;
      border: none;
      padding: 7px 14px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: bold;
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 0.2s;
    }
    .toolbar button:hover, .toolbar a:hover {
      background: #1d4ed8;
    }
    .toolbar .btn-xml {
      background: #334155;
    }
    .toolbar .btn-xml:hover {
      background: #475569;
    }

    /* Folha A4 */
    .danfe-page {
      background: #fff;
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      padding: 6mm 8mm;
      box-shadow: 0 4px 25px rgba(0,0,0,0.25);
    }

    /* Elementos do DANFE */
    .box {
      border: 1px solid #000;
      padding: 2px 4px;
      position: relative;
    }
    .box-title {
      font-size: 5.5pt;
      font-weight: bold;
      text-transform: uppercase;
      color: #222;
      display: block;
      margin-bottom: 1px;
    }
    .box-value {
      font-size: 7.5pt;
      font-weight: normal;
      color: #000;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .box-value-bold {
      font-weight: bold;
    }
    .section-title {
      font-size: 6.5pt;
      font-weight: bold;
      text-transform: uppercase;
      margin-top: 4px;
      margin-bottom: 1px;
      letter-spacing: 0.3px;
    }

    .flex { display: flex; }
    .flex-col { display: flex; flex-direction: column; }
    .flex-1 { flex: 1; }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .bold { font-weight: bold; }
    .border-b { border-bottom: 1px solid #000; }
    .border-r { border-right: 1px solid #000; }

    /* Canhoto */
    .canhoto {
      border: 1px solid #000;
      margin-bottom: 4px;
    }

    /* Cabeçalho */
    .header-grid {
      display: grid;
      grid-template-columns: 82mm 36mm 76mm;
      gap: 0;
      border: 1px solid #000;
      margin-bottom: 3px;
    }
    .emitente-info {
      padding: 4px;
      border-right: 1px solid #000;
    }
    .danfe-badge {
      padding: 4px;
      border-right: 1px solid #000;
      text-align: center;
    }
    .chave-box {
      padding: 3px;
    }

    /* Tabela de Produtos */
    table.produtos {
      width: 100%;
      border-collapse: collapse;
      font-size: 6.5pt;
      margin-top: 2px;
      border: 1px solid #000;
    }
    table.produtos th {
      border: 1px solid #000;
      background: #e5e7eb;
      font-size: 5.5pt;
      padding: 2px 1px;
      text-transform: uppercase;
      font-weight: bold;
    }
    table.produtos td {
      border-left: 1px solid #000;
      border-right: 1px solid #000;
      padding: 2px 2px;
      line-height: 1.1;
    }
    table.produtos tr:nth-child(even) {
      background: #fafafa;
    }

    /* Regras de Impressão */
    @media print {
      body {
        background: transparent;
        padding: 0;
      }
      .no-print {
        display: none !important;
      }
      .danfe-page {
        width: 100%;
        margin: 0;
        padding: 0;
        box-shadow: none;
      }
      @page {
        size: A4 portrait;
        margin: 5mm;
      }
    }
  </style>
</head>
<body>

  <!-- Barra Superior Flutuante -->
  <div class="toolbar no-print">
    <div class="title">
      <span>📄 DANFE NF-e Nº ${ide.nNF || 'S/N'}</span>
      <span style="font-size: 11px; opacity: 0.7; font-weight: normal;">• Chave: ${chave.substring(0, 4)}...${chave.substring(40)}</span>
    </div>
    <div class="btn-group">
      <button onclick="window.print()">🖨️ Imprimir / Salvar em PDF</button>
      <a href="/api/notas-emitidas/xml?empresa_id=${empresa_id}&chave=${chave}" target="_blank" class="btn-xml">⬇️ Baixar XML Oficial</a>
      <button onclick="window.close()" style="background: #475569;">✕ Fechar</button>
    </div>
  </div>

  <!-- Página DANFE -->
  <div class="danfe-page">

    <!-- CANHOTO DE RECEBIMENTO -->
    <div class="canhoto">
      <div class="flex" style="min-height: 28px;">
        <div style="width: 82%; padding: 3px; font-size: 6pt; border-right: 1px solid #000;">
          RECEBEMOS DE <b>${emit.xNome || 'EMITENTE'}</b> OS PRODUTOS/SERVIÇOS CONSTANTES DA NOTA FISCAL INDICADA AO LADO
        </div>
        <div style="width: 18%; padding: 3px; text-align: center;">
          <span style="font-size: 6pt; font-weight: bold; display: block;">NF-e</span>
          <span style="font-size: 8pt; font-weight: bold;">Nº ${ide.nNF || 'S/N'}</span><br>
          <span style="font-size: 6pt;">SÉRIE ${serieNF}</span>
        </div>
      </div>
      <div class="flex" style="border-top: 1px solid #000; min-height: 24px;">
        <div style="width: 25%; padding: 2px 4px; border-right: 1px solid #000;">
          <span class="box-title">DATA DE RECEBIMENTO</span>
        </div>
        <div style="width: 57%; padding: 2px 4px; border-right: 1px solid #000;">
          <span class="box-title">IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR</span>
        </div>
        <div style="width: 18%; padding: 2px 4px; text-align: center;">
          <span class="box-title">DESTINO</span>
          <span style="font-size: 6.5pt; font-weight: bold;">${dest.xNome ? String(dest.xNome).substring(0, 18) : ''}</span>
        </div>
      </div>
    </div>

    <!-- CABEÇALHO / EMITENTE / DANFE / CHAVE -->
    <div class="header-grid">
      <!-- Emitente -->
      <div class="emitente-info flex flex-col justify-between">
        <div>
          <div style="font-size: 9.5pt; font-weight: bold; line-height: 1.1;">${emit.xNome || 'RAZÃO SOCIAL DO EMITENTE'}</div>
          ${emit.xFant ? `<div style="font-size: 7.5pt; color: #333;">${emit.xFant}</div>` : ''}
          <div style="font-size: 7pt; margin-top: 4px; line-height: 1.2;">
            ${enderEmit.xLgr || ''}, ${enderEmit.nro || ''} ${enderEmit.xCpl ? '- ' + enderEmit.xCpl : ''}<br>
            ${enderEmit.xBairro || ''} - ${enderEmit.xMun || ''} / ${enderEmit.UF || ''}<br>
            CEP: ${formatCep(enderEmit.CEP)} ${enderEmit.fone ? ' - Fone: ' + enderEmit.fone : ''}
          </div>
        </div>
      </div>

      <!-- DANFE Badge -->
      <div class="danfe-badge flex flex-col justify-between">
        <div style="font-size: 11pt; font-weight: 900; letter-spacing: 0.5px;">DANFE</div>
        <div style="font-size: 5.5pt; line-height: 1.1;">Documento Auxiliar da<br>Nota Fiscal Eletrônica</div>
        <div style="font-size: 6.5pt; margin: 2px 0;">
          <div style="display: inline-block; border: 1px solid #000; padding: 1px 3px; font-weight: bold;">
            ${ide.tpNF || '1'}
          </div>
          <span style="font-size: 5.5pt; display: block; margin-top: 1px;">0-Entrada / 1-Saída</span>
        </div>
        <div style="font-size: 7pt;">
          <b>Nº ${numNF}</b><br>
          <b>SÉRIE: ${serieNF}</b><br>
          <span style="font-size: 6pt;">FOLHA 01/01</span>
        </div>
      </div>

      <!-- Chave de Acesso e Código de Barras -->
      <div class="chave-box flex flex-col justify-between">
        <div style="text-align: center; margin-bottom: 2px;">
          ${barcodeSvg}
        </div>
        <div class="box" style="border: 1px solid #000; padding: 2px; text-align: center;">
          <span class="box-title">CHAVE DE ACESSO</span>
          <span style="font-size: 7pt; font-weight: bold; font-family: monospace; letter-spacing: 0.5px;">
            ${chaveFormatada}
          </span>
        </div>
        <div style="font-size: 6pt; text-align: center; margin-top: 2px; line-height: 1.1;">
          Consulta de autenticidade no portal nacional da NF-e<br>
          <b>www.nfe.fazenda.gov.br/portal</b> ou no site da Sefaz Autorizadora
        </div>
      </div>
    </div>

    <!-- NATUREZA DA OPERAÇÃO / PROTOCOLO -->
    <div class="flex" style="border: 1px solid #000; margin-bottom: 3px;">
      <div class="box flex-1 border-r">
        <span class="box-title">NATUREZA DA OPERAÇÃO</span>
        <span class="box-value box-value-bold">${natOperacao}</span>
      </div>
      <div class="box" style="width: 76mm;">
        <span class="box-title">PROTOCOLO DE AUTORIZAÇÃO DE USO</span>
        <span class="box-value box-value-bold">${protocoloAuth}</span>
      </div>
    </div>

    <!-- INSCRIÇÃO ESTADUAL DO EMITENTE -->
    <div class="flex" style="border: 1px solid #000; margin-bottom: 4px;">
      <div class="box flex-1 border-r">
        <span class="box-title">INSCRIÇÃO ESTADUAL</span>
        <span class="box-value">${emit.IE || 'ISENTO'}</span>
      </div>
      <div class="box flex-1 border-r">
        <span class="box-title">INSC. ESTADUAL DO SUBST. TRIB.</span>
        <span class="box-value">${emit.IEST || ''}</span>
      </div>
      <div class="box flex-1">
        <span class="box-title">CNPJ / CPF</span>
        <span class="box-value box-value-bold">${formatCpfCnpj(emit.CNPJ || emit.CPF)}</span>
      </div>
    </div>

    <!-- DESTINATÁRIO / REMETENTE -->
    <div class="section-title">DESTINATÁRIO / REMETENTE</div>
    <div style="border: 1px solid #000; margin-bottom: 4px;">
      <div class="flex border-b">
        <div class="box flex-1 border-r" style="flex: 2;">
          <span class="box-title">NOME / RAZÃO SOCIAL</span>
          <span class="box-value box-value-bold">${dest.xNome || 'CONSUMIDOR FINAL'}</span>
        </div>
        <div class="box flex-1 border-r">
          <span class="box-title">CNPJ / CPF</span>
          <span class="box-value box-value-bold">${formatCpfCnpj(dest.CNPJ || dest.CPF)}</span>
        </div>
        <div class="box" style="width: 25mm;">
          <span class="box-title">DATA DE EMISSÃO</span>
          <span class="box-value box-value-bold">${formatData(ide.dhEmi)}</span>
        </div>
      </div>
      <div class="flex border-b">
        <div class="box flex-1 border-r" style="flex: 2;">
          <span class="box-title">ENDEREÇO</span>
          <span class="box-value">${enderDest.xLgr || ''}, ${enderDest.nro || ''} ${enderDest.xCpl ? '- ' + enderDest.xCpl : ''}</span>
        </div>
        <div class="box flex-1 border-r">
          <span class="box-title">BAIRRO / DISTRITO</span>
          <span class="box-value">${enderDest.xBairro || ''}</span>
        </div>
        <div class="box" style="width: 25mm; border-right: 1px solid #000;">
          <span class="box-title">CEP</span>
          <span class="box-value">${formatCep(enderDest.CEP)}</span>
        </div>
        <div class="box" style="width: 25mm;">
          <span class="box-title">DATA SAÍDA/ENTRADA</span>
          <span class="box-value">${formatData(ide.dhSaiEnt || ide.dhEmi)}</span>
        </div>
      </div>
      <div class="flex">
        <div class="box flex-1 border-r" style="flex: 2;">
          <span class="box-title">MUNICÍPIO</span>
          <span class="box-value">${enderDest.xMun || ''}</span>
        </div>
        <div class="box border-r" style="width: 15mm;">
          <span class="box-title">UF</span>
          <span class="box-value">${enderDest.UF || ''}</span>
        </div>
        <div class="box flex-1 border-r">
          <span class="box-title">FONE / FAX</span>
          <span class="box-value">${enderDest.fone || ''}</span>
        </div>
        <div class="box flex-1 border-r">
          <span class="box-title">INSCRIÇÃO ESTADUAL</span>
          <span class="box-value">${dest.IE || 'ISENTO'}</span>
        </div>
        <div class="box" style="width: 25mm;">
          <span class="box-title">HORA SAÍDA</span>
          <span class="box-value">${ide.dhSaiEnt ? String(ide.dhSaiEnt).substring(11, 19) : ''}</span>
        </div>
      </div>
    </div>

    <!-- CÁLCULO DO IMPOSTO -->
    <div class="section-title">CÁLCULO DO IMPOSTO</div>
    <div style="border: 1px solid #000; margin-bottom: 4px;">
      <div class="flex border-b">
        <div class="box flex-1 border-r text-right">
          <span class="box-title text-left">BASE DE CÁLC. DO ICMS</span>
          <span class="box-value">${formatMoeda(total.vBC)}</span>
        </div>
        <div class="box flex-1 border-r text-right">
          <span class="box-title text-left">VALOR DO ICMS</span>
          <span class="box-value">${formatMoeda(total.vICMS)}</span>
        </div>
        <div class="box flex-1 border-r text-right">
          <span class="box-title text-left">BASE CÁLC. ICMS S.T.</span>
          <span class="box-value">${formatMoeda(total.vBCST)}</span>
        </div>
        <div class="box flex-1 border-r text-right">
          <span class="box-title text-left">VALOR DO ICMS S.T.</span>
          <span class="box-value">${formatMoeda(total.vST)}</span>
        </div>
        <div class="box flex-1 text-right">
          <span class="box-title text-left">V. TOTAL PRODUTOS</span>
          <span class="box-value box-value-bold">${formatMoeda(total.vProd)}</span>
        </div>
      </div>
      <div class="flex">
        <div class="box flex-1 border-r text-right">
          <span class="box-title text-left">VALOR DO FRETE</span>
          <span class="box-value">${formatMoeda(total.vFrete)}</span>
        </div>
        <div class="box flex-1 border-r text-right">
          <span class="box-title text-left">VALOR DO SEGURO</span>
          <span class="box-value">${formatMoeda(total.vSeg)}</span>
        </div>
        <div class="box flex-1 border-r text-right">
          <span class="box-title text-left">DESCONTO</span>
          <span class="box-value">${formatMoeda(total.vDesc)}</span>
        </div>
        <div class="box flex-1 border-r text-right">
          <span class="box-title text-left">OUTRAS DESPESAS</span>
          <span class="box-value">${formatMoeda(total.vOutro)}</span>
        </div>
        <div class="box flex-1 border-r text-right">
          <span class="box-title text-left">VALOR DO IPI</span>
          <span class="box-value">${formatMoeda(total.vIPI)}</span>
        </div>
        <div class="box flex-1 text-right" style="background: #f3f4f6;">
          <span class="box-title text-left">VALOR TOTAL DA NOTA</span>
          <span class="box-value box-value-bold" style="font-size: 8.5pt;">${formatMoeda(total.vNF)}</span>
        </div>
      </div>
    </div>

    <!-- TRANSPORTADOR / VOLUMES TRANSPORTADOS -->
    <div class="section-title">TRANSPORTADOR / VOLUMES TRANSPORTADOS</div>
    <div style="border: 1px solid #000; margin-bottom: 4px;">
      <div class="flex border-b">
        <div class="box flex-1 border-r" style="flex: 2;">
          <span class="box-title">RAZÃO SOCIAL</span>
          <span class="box-value">${transporta.xNome || 'O MESMO'}</span>
        </div>
        <div class="box border-r" style="width: 35mm;">
          <span class="box-title">FRETE POR CONTA</span>
          <span class="box-value">${transp.modFrete === '0' ? '0 - EMITENTE' : (transp.modFrete === '1' ? '1 - DESTINATÁRIO' : '9 - SEM FRETE')}</span>
        </div>
        <div class="box border-r" style="width: 25mm;">
          <span class="box-title">CÓDIGO ANTT</span>
          <span class="box-value">${transp.veicTransp?.RNTC || ''}</span>
        </div>
        <div class="box border-r" style="width: 20mm;">
          <span class="box-title">PLACA VEÍCULO</span>
          <span class="box-value">${transp.veicTransp?.placa || ''}</span>
        </div>
        <div class="box border-r" style="width: 10mm;">
          <span class="box-title">UF</span>
          <span class="box-value">${transp.veicTransp?.UF || ''}</span>
        </div>
        <div class="box flex-1">
          <span class="box-title">CNPJ / CPF</span>
          <span class="box-value">${formatCpfCnpj(transporta.CNPJ || transporta.CPF)}</span>
        </div>
      </div>
      <div class="flex">
        <div class="box flex-1 border-r">
          <span class="box-title">QUANTIDADE</span>
          <span class="box-value">${vol.qVol || ''}</span>
        </div>
        <div class="box flex-1 border-r">
          <span class="box-title">ESPÉCIE</span>
          <span class="box-value">${vol.esp || 'VOLUMES'}</span>
        </div>
        <div class="box flex-1 border-r">
          <span class="box-title">MARCA</span>
          <span class="box-value">${vol.marca || ''}</span>
        </div>
        <div class="box flex-1 border-r text-right">
          <span class="box-title text-left">PESO BRUTO</span>
          <span class="box-value">${vol.pesoB ? formatMoeda(vol.pesoB) : ''}</span>
        </div>
        <div class="box flex-1 text-right">
          <span class="box-title text-left">PESO LÍQUIDO</span>
          <span class="box-value">${vol.pesoL ? formatMoeda(vol.pesoL) : ''}</span>
        </div>
      </div>
    </div>

    <!-- DADOS DOS PRODUTOS / SERVIÇOS -->
    <div class="section-title">DADOS DOS PRODUTOS / SERVIÇOS</div>
    <table class="produtos">
      <thead>
        <tr>
          <th style="width: 22mm;">CÓDIGO</th>
          <th>DESCRIÇÃO DO PRODUTO / SERVIÇO</th>
          <th style="width: 14mm;">NCM/SH</th>
          <th style="width: 8mm;">CST</th>
          <th style="width: 9mm;">CFOP</th>
          <th style="width: 7mm;">UN</th>
          <th style="width: 10mm;">QTD</th>
          <th style="width: 14mm;">V. UNIT</th>
          <th style="width: 15mm;">V. TOTAL</th>
          <th style="width: 14mm;">BC ICMS</th>
          <th style="width: 12mm;">V. ICMS</th>
          <th style="width: 10mm;">%ICMS</th>
        </tr>
      </thead>
      <tbody>
        ${det.map((item: any, idx: number) => {
          const prod = item.prod || {}
          const imp = item.imposto || {}
          const icmsWrapper = imp.ICMS || {}
          const icmsObj = Object.values(icmsWrapper)[0] as any || {}
          const cst = icmsObj.CST || icmsObj.CSOSN || ''
          const bcIcms = icmsObj.vBC || 0
          const vIcms = icmsObj.vICMS || 0
          const pIcms = icmsObj.pICMS || 0

          return `<tr>
            <td class="bold">${prod.cProd || ''}</td>
            <td>${prod.xProd || ''}</td>
            <td class="text-center">${prod.NCM || ''}</td>
            <td class="text-center">${cst}</td>
            <td class="text-center">${prod.CFOP || ''}</td>
            <td class="text-center">${prod.uCom || 'UN'}</td>
            <td class="text-right">${formatMoeda(prod.qCom)}</td>
            <td class="text-right">${formatMoeda(prod.vUnCom)}</td>
            <td class="text-right bold">${formatMoeda(prod.vProd - (prod.vDesc || 0))}</td>
            <td class="text-right">${bcIcms ? formatMoeda(bcIcms) : '0,00'}</td>
            <td class="text-right">${vIcms ? formatMoeda(vIcms) : '0,00'}</td>
            <td class="text-right">${pIcms ? formatMoeda(pIcms) + '%' : '0,00%'}</td>
          </tr>`
        }).join('')}
      </tbody>
    </table>

    <!-- DADOS ADICIONAIS -->
    <div class="section-title" style="margin-top: 5px;">DADOS ADICIONAIS</div>
    <div class="flex" style="border: 1px solid #000; min-height: 24mm;">
      <div class="box flex-1 border-r" style="flex: 3; padding: 4px;">
        <span class="box-title">INFORMAÇÕES COMPLEMENTARES</span>
        <div style="font-size: 6.5pt; line-height: 1.3; color: #111; margin-top: 2px;">
          ${infAdic.infCpl || 'Documento emitido por ME ou EPP optante pelo Simples Nacional ou Regime Normal.'}
        </div>
      </div>
      <div class="box flex-1" style="padding: 4px;">
        <span class="box-title">RESERVADO AO FISCO</span>
      </div>
    </div>

  </div>

  ${autoPrint ? `<script>window.onload = function() { setTimeout(function() { window.print(); }, 500); }</script>` : ''}
</body>
</html>`

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=86400'
      }
    })

  } catch (err: any) {
    console.error('[notas-emitidas/danfe] Erro fatal:', err)
    return new NextResponse(`<h3>Erro interno ao renderizar DANFE:</h3><p>${err.message}</p>`, {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    })
  }
}
