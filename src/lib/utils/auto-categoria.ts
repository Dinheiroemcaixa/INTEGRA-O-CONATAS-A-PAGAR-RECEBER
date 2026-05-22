/**
 * Mapeamento automático de categorias baseado em palavras-chave
 * Ajuda a preencher o DRE do Conta Azul automaticamente
 */

export const REGRAS_CATEGORIA_PALAVRA_CHAVE: Record<string, string[]> = {
  'Aluguel': ['ALUGUEL', 'LOCAÇÃO'],
  'Energia Elétrica': ['ENERGIA', 'LUZ', 'CEMIG', 'ENEL', 'EQUATORIAL', 'CPFL'],
  'Água e Saneamento': ['AGUA', 'COPASA', 'SABESP', 'CASAN', 'CEDAE'],
  'Telefonia e Internet': ['INTERNET', 'VIVO', 'CLARO', 'OI', 'TIM', 'TELEFONE', 'NET'],
  'Simples Nacional - DAS': ['SIMPLES NACIONAL', 'DAS'],
  'Marketing e Publicidade': ['MARKETING', 'FACEBOOK', 'GOOGLE ADS', 'PROPAGANDA', 'INSTAGRAM'],
  'Tarifas Bancárias': ['TARIFA', 'BANCO', 'MENSALIDADE CONTA', 'DOC/TED', 'BOLETO'],
  'Combustíveis': ['POSTO', 'GASOLINA', 'COMBUSTIVEL', 'DIESEL', 'ETANOL'],
  'Pedágios': ['PEDAGIO', 'SEM PARAR', 'CONECTCAR', 'VELOE'],
  'INSS sobre Salários - GPS': ['GPS', 'INSS'],
  'FGTS e Multa de FGTS': ['FGTS'],
  'IRRF s/ Salários - DARF 0561': ['DARF 0561', 'IRRF SALARIO'],
  'Salários': ['SALARIO', 'PAGTO SALARIO', 'FOLHA'],
  'Pró-labore': ['PRO LABORE', 'PRO-LABORE'],
  'Vale-Alimentação': ['ALIMENTACAO', 'VALE REFEICAO', 'VR', 'VA', 'SODEXO', 'TICKET'],
  'Vale-Transporte': ['VALE TRANSPORTE', 'VT'],
  'Seguros de Veículos': ['SEGURO', 'PORTO SEGURO', 'AZUL SEGUROS', 'BRADESCO SEGURO'],
  'Manutenção de Veículos': ['OFICINA', 'MECANICA', 'PEÇAS', 'CONSERTO'],
  'Honorários Contábeis': ['CONTABILIDADE', 'CONTABIL', 'ESCRITORIO CONTABIL'],
  'Software / Licença de Uso': ['SOFTWARE', 'LICENÇA', 'SAAS', 'MICROSOFT', 'ADOBE', 'AWS', 'AZURE'],
  'Limpeza e Conservação': ['LIMPEZA', 'CONSERVACAO', 'FAXINA'],
};

/**
 * Tenta sugerir uma categoria baseada no nome do fornecedor ou descrição
 */
export function sugerirCategoria(texto: string): string | null {
  if (!texto) return null;
  const textoUpper = texto.toUpperCase();

  for (const [categoria, keywords] of Object.entries(REGRAS_CATEGORIA_PALAVRA_CHAVE)) {
    if (keywords.some(kw => textoUpper.includes(kw))) {
      return categoria;
    }
  }

  return null;
}
