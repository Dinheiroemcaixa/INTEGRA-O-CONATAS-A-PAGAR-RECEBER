import * as XLSX from 'xlsx';
import { ItemDDA } from './geminiExtractor';

/**
 * Parser especializado para planilhas DDA em formato Excel (.xlsx / .xls)
 * emitidas pelo Banco Itaú (ex: ConsultaBoletosRecebidos).
 */
export function parseItauDDAXlsx(buffer: Buffer | ArrayBuffer | Uint8Array): ItemDDA[] {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });

  if (!wb.SheetNames || wb.SheetNames.length === 0) {
    throw new Error('O arquivo Excel não contém abas legíveis.');
  }

  // 1. Localizar a aba correta: prioriza aba com nome "Boletos" ou que contenha "boleto"
  let targetSheetName = wb.SheetNames.find(
    (name) => name.trim().toLowerCase() === 'boletos'
  );

  if (!targetSheetName) {
    targetSheetName = wb.SheetNames.find((name) =>
      name.trim().toLowerCase().includes('boleto')
    );
  }

  // Se ainda não encontrou, busca a primeira aba que possua as colunas da tabela DDA
  if (!targetSheetName) {
    for (const name of wb.SheetNames) {
      const sheet = wb.Sheets[name];
      if (!sheet) continue;
      const sampleRows = XLSX.utils.sheet_to_json<string[]>(sheet, {
        header: 1,
        defval: '',
        blankrows: false,
      });
      const hasDdaHeaders = sampleRows.some((row) => {
        const text = row.map((cell) => String(cell).toLowerCase()).join(' ');
        return (
          text.includes('benefici') &&
          (text.includes('venc') || text.includes('pagar') || text.includes('barra'))
        );
      });
      if (hasDdaHeaders) {
        targetSheetName = name;
        break;
      }
    }
  }

  if (!targetSheetName) {
    targetSheetName = wb.SheetNames[0];
  }

  const ws = wb.Sheets[targetSheetName];
  if (!ws) {
    throw new Error(`Aba "${targetSheetName}" não pôde ser lida no arquivo Excel.`);
  }

  const rawRows = XLSX.utils.sheet_to_json<any[]>(ws, {
    header: 1,
    defval: '',
    blankrows: false,
  });

  if (!rawRows || rawRows.length === 0) {
    throw new Error('A planilha está vazia ou sem dados válidos.');
  }

  // 2. Localizar dinamicamente a linha do cabeçalho da tabela (ignorando cabeçalhos institucionais)
  let headerIndex = -1;
  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i].map((cell) => String(cell || '').trim().toLowerCase());
    const hasBeneficiario = row.some((cell) => cell.includes('benefici'));
    const hasVencOuValor = row.some(
      (cell) => cell.includes('venc') || cell.includes('pagar') || cell.includes('barra')
    );

    if (hasBeneficiario && hasVencOuValor) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    throw new Error('Não foi possível identificar o cabeçalho da tabela de boletos DDA.');
  }

  const headerRow = rawRows[headerIndex].map((cell) =>
    String(cell || '').trim().toLowerCase()
  );

  // Mapeamento flexível dos índices de cada coluna
  const colIndex = {
    pagador: headerRow.findIndex((c) => c.includes('pagador') || c.includes('agregado')),
    beneficiario: headerRow.findIndex((c) => c.includes('benefici')),
    cpfCnpj: headerRow.findIndex((c) => c.includes('cpf') || c.includes('cnpj')),
    vencimento: headerRow.findIndex(
      (c) => c.startsWith('venc') || c.includes('venc.') || c.includes('vencimento')
    ),
    numDoc: headerRow.findIndex(
      (c) =>
        c.includes('nº doc') ||
        c.includes('n° doc') ||
        c.includes('n. doc') ||
        c.includes('número doc') ||
        c.includes('documento') ||
        c.includes('doc.')
    ),
    valorAteVenc: headerRow.findIndex(
      (c) => c.includes('até venc') || c.includes('ate venc')
    ),
    valorAPagar: headerRow.findIndex((c) => c.includes('a pagar')),
    tipoBoleto: headerRow.findIndex(
      (c) => c.includes('tipo de boleto') || c.includes('tipo boleto') || c.includes('tipo')
    ),
    banco: headerRow.findIndex((c) => c.includes('banco')),
    observacoes: headerRow.findIndex((c) => c.includes('observa')),
    codigoBarras: headerRow.findIndex(
      (c) =>
        c.includes('código de barras') ||
        c.includes('codigo de barras') ||
        c.includes('linha digit') ||
        c.includes('barras') ||
        c.includes('barra')
    ),
  };

  const itens: ItemDDA[] = [];

  // 3. Iterar sobre as linhas de dados
  for (let i = headerIndex + 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row || row.length === 0) continue;

    const beneficiarioRaw =
      colIndex.beneficiario !== -1 ? String(row[colIndex.beneficiario] || '').trim() : '';

    // Prioriza coluna "A Pagar", caso vazia ou não encontrada busca "Até Venc."
    const valorRaw =
      colIndex.valorAPagar !== -1 && row[colIndex.valorAPagar] !== ''
        ? row[colIndex.valorAPagar]
        : colIndex.valorAteVenc !== -1
        ? row[colIndex.valorAteVenc]
        : 0;

    let valor = 0;
    if (typeof valorRaw === 'number') {
      valor = Number.isFinite(valorRaw) ? valorRaw : 0;
    } else if (typeof valorRaw === 'string') {
      const vLimpo = valorRaw
        .replace(/R\$\s*/gi, '')
        .replace(/\./g, '')
        .replace(',', '.')
        .trim();
      valor = parseFloat(vLimpo) || 0;
    }

    // Ignora linhas de totalizador ou vazias
    if (!beneficiarioRaw && valor === 0) continue;
    if (beneficiarioRaw.toLowerCase().startsWith('total')) continue;

    // Normalização da data de vencimento para YYYY-MM-DD
    let dataVencimento = '';
    const vencRaw = colIndex.vencimento !== -1 ? row[colIndex.vencimento] : '';

    if (typeof vencRaw === 'string' && vencRaw.includes('/')) {
      const parts = vencRaw.trim().split('/');
      if (parts.length === 3) {
        const dia = parts[0].padStart(2, '0');
        const mes = parts[1].padStart(2, '0');
        const ano = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
        dataVencimento = `${ano}-${mes}-${dia}`;
      }
    } else if (typeof vencRaw === 'number') {
      // Data em formato numérico serial do Excel
      const parsed = XLSX.SSF.parse_date_code(vencRaw);
      if (parsed) {
        const dia = String(parsed.d).padStart(2, '0');
        const mes = String(parsed.m).padStart(2, '0');
        dataVencimento = `${parsed.y}-${mes}-${dia}`;
      }
    } else if (vencRaw instanceof Date) {
      dataVencimento = vencRaw.toISOString().split('T')[0];
    } else if (typeof vencRaw === 'string') {
      dataVencimento = vencRaw.trim();
    }

    const cpfCnpj =
      colIndex.cpfCnpj !== -1 ? String(row[colIndex.cpfCnpj] || '').trim() : '';

    const documento =
      colIndex.numDoc !== -1 && String(row[colIndex.numDoc] || '').trim()
        ? String(row[colIndex.numDoc]).trim()
        : 'S/N';

    const tipoBoleto =
      colIndex.tipoBoleto !== -1 ? String(row[colIndex.tipoBoleto] || '').trim() : '';

    const banco =
      colIndex.banco !== -1 ? String(row[colIndex.banco] || '').trim() : '';

    const observacoes =
      colIndex.observacoes !== -1 ? String(row[colIndex.observacoes] || '').trim() : '';

    // Limpa código de barras removendo espaços e caracteres não numéricos
    let codigoBarras =
      colIndex.codigoBarras !== -1 ? String(row[colIndex.codigoBarras] || '').trim() : '';
    codigoBarras = codigoBarras.replace(/[^0-9]/g, '');

    itens.push({
      beneficiario: beneficiarioRaw || 'Não identificado',
      documento,
      cpf_cnpj: cpfCnpj,
      valor: Math.round(valor * 100) / 100,
      data_vencimento: dataVencimento,
      banco: banco || undefined,
      tipo_boleto: tipoBoleto || undefined,
      codigo_barras: codigoBarras || undefined,
      observacoes: observacoes || undefined,
    });
  }

  return itens;
}
