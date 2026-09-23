import { createClient } from '@supabase/supabase-js'

export type StatusJustificativa = 'PENDENTE' | 'JUSTIFICADA' | 'CORRIGIDA'

export interface ItemAuditoriaCategoria {
  id: string
  contaAzulId?: string | null
  fornecedor: string
  categoriaEsperada: string
  categoriaAtual: string
  percentualConfianca: number
  totalHistoricoFornecedor: number
  status: 'divergente' | 'consistente' | 'novo_fornecedor'
  valor: number
  dataCompetencia: string
  dataVencimento?: string | null
  descricao?: string | null
  statusDivergencia?: StatusJustificativa
  motivoJustificativa?: string | null
  justificadoPor?: string | null
  justificadoEm?: string | null
}

export interface ResumoAuditoriaCategorias {
  totalAuditado: number
  totalConsistentes: number
  totalDivergentes: number
  totalNovosFornecedores: number
  totalPendentes: number
  totalJustificadas: number
  totalCorrigidas: number
  valorTotalAuditado: number
  valorTotalDivergente: number
  taxaDivergencia: number
  periodoAuditado: {
    inicio: string
    fim: string
  }
  periodoHistoricoAprendizado: {
    inicio: string
    fim: string
  }
  itens: ItemAuditoriaCategoria[]
}

/**
 * Subtrai exatamente N meses de uma data no formato YYYY-MM-DD
 */
export function subtrairMeses(dataIso: string, meses: number): string {
  const [ano, mes, dia] = dataIso.split('-').map(Number)
  const d = new Date(ano, mes - 1 - meses, dia || 1)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Normaliza nomes de strings para comparação confiável
 */
export function normalizarTexto(texto?: string | null): string {
  if (!texto) return ''
  return texto
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/**
 * Executa a auditoria de consistência de categorias por fornecedor
 * 100% READ ONLY - Consulta exclusivamente a tabela public.contas_pagar_contaazul_espelho.
 * Não realiza nenhuma operação de escrita (INSERT, UPDATE ou UPSERT) no banco.
 */
export async function executarAuditoriaCategorias(params: {
  empresaId: string
  dataInicio: string
  dataFim: string
}): Promise<ResumoAuditoriaCategorias> {
  const { empresaId, dataInicio, dataFim } = params

  if (!empresaId) {
    throw new Error('O parâmetro empresaId é obrigatório.')
  }
  if (!dataInicio || !dataFim) {
    throw new Error('As datas de início e fim são obrigatórias.')
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const supabase = createClient(supabaseUrl, supabaseKey)

  // 1. Define janela de histórico de 6 meses anteriores ao início do período auditado
  const dataHistoricoInicio = subtrairMeses(dataInicio, 6)

  // 2. Busca lançamentos a auditar no período selecionado (exclusivamente SELECT em contas_pagar_contaazul_espelho)
  const { data: lancamentosAuditados, error: errAuditados } = await supabase
    .from('contas_pagar_contaazul_espelho')
    .select('*')
    .eq('empresa_id', empresaId)
    .gte('data_competencia', dataInicio)
    .lte('data_competencia', dataFim)
    .order('data_competencia', { ascending: false })
    .limit(50000)

  if (errAuditados) {
    console.error('[AuditoriaCategorias] Erro ao buscar lançamentos a auditar:', errAuditados)
    throw new Error(`Erro ao consultar base espelho do Conta Azul: ${errAuditados.message}`)
  }

  const registrosAuditados = lancamentosAuditados || []

  // Se não houver lançamentos no período
  if (registrosAuditados.length === 0) {
    return {
      totalAuditado: 0,
      totalConsistentes: 0,
      totalDivergentes: 0,
      totalNovosFornecedores: 0,
      totalPendentes: 0,
      totalJustificadas: 0,
      totalCorrigidas: 0,
      valorTotalAuditado: 0,
      valorTotalDivergente: 0,
      taxaDivergencia: 0,
      periodoAuditado: { inicio: dataInicio, fim: dataFim },
      periodoHistoricoAprendizado: { inicio: dataHistoricoInicio, fim: dataInicio },
      itens: []
    }
  }

  // 3. Identifica fornecedores distintos do período auditado
  const fornecedoresAuditados = Array.from(
    new Set(
      registrosAuditados
        .map(r => r.fornecedor_nome?.trim())
        .filter((nome): nome is string => Boolean(nome && nome.length > 0))
    )
  )

  // 4. Busca histórico de lançamentos dos últimos 6 meses anteriores (SELECT em contas_pagar_contaazul_espelho)
  const { data: historicoRows, error: errHistorico } = await supabase
    .from('contas_pagar_contaazul_espelho')
    .select('fornecedor_nome, categoria_nome, data_competencia')
    .eq('empresa_id', empresaId)
    .gte('data_competencia', dataHistoricoInicio)
    .lt('data_competencia', dataInicio)
    .in('fornecedor_nome', fornecedoresAuditados)
    .limit(50000)

  if (errHistorico) {
    console.warn('[AuditoriaCategorias] Aviso ao buscar histórico de fornecedores:', errHistorico.message)
  }

  // 5. Agrupa histórico por fornecedor e calcula categoria predominante 100% em memória
  const mapaHistorico = new Map<string, { total: number; categorias: Map<string, number> }>()

  for (const row of (historicoRows || [])) {
    const fn = (row.fornecedor_nome || '').trim()
    const cat = (row.categoria_nome || '').trim()
    if (!fn || !cat) continue

    if (!mapaHistorico.has(fn)) {
      mapaHistorico.set(fn, { total: 0, categorias: new Map() })
    }

    const info = mapaHistorico.get(fn)!
    info.total += 1
    info.categorias.set(cat, (info.categorias.get(cat) || 0) + 1)
  }

  // 6. Estrutura o aprendizado estatístico por fornecedor em memória
  interface PadraoFornecedor {
    categoriaPadrao: string
    percentualConfianca: number
    totalHistorico: number
  }

  const mapaPadrao = new Map<string, PadraoFornecedor>()

  for (const [fornecedorNome, info] of mapaHistorico.entries()) {
    let catMaisFrequente = ''
    let maxOcorrencias = 0

    for (const [catNome, count] of info.categorias.entries()) {
      if (count > maxOcorrencias) {
        maxOcorrencias = count
        catMaisFrequente = catNome
      }
    }

    const confianca = info.total > 0
      ? Math.round((maxOcorrencias / info.total) * 10000) / 100
      : 0

    mapaPadrao.set(fornecedorNome, {
      categoriaPadrao: catMaisFrequente,
      percentualConfianca: confianca,
      totalHistorico: info.total
    })
  }

  // 7. Classifica cada lançamento do período auditado em relação ao padrão histórico
  let totalConsistentes = 0
  let totalDivergentes = 0
  let totalNovos = 0
  let valorTotalAuditado = 0
  let valorTotalDivergente = 0

  const itens: ItemAuditoriaCategoria[] = registrosAuditados.map(r => {
    const fornecedorNome = (r.fornecedor_nome || 'NÃO INFORMADO').trim()
    const categoriaAtual = (r.categoria_nome || 'SEM CATEGORIA').trim()
    const valor = Number(r.valor) || 0
    valorTotalAuditado += valor

    const padrao = mapaPadrao.get(fornecedorNome)

    if (!padrao || padrao.totalHistorico === 0) {
      totalNovos += 1
      return {
        id: r.id,
        contaAzulId: r.conta_azul_id,
        fornecedor: fornecedorNome,
        categoriaEsperada: 'Sem Histórico Prévio (6 meses)',
        categoriaAtual: categoriaAtual,
        percentualConfianca: 0,
        totalHistoricoFornecedor: 0,
        status: 'novo_fornecedor',
        valor: valor,
        dataCompetencia: r.data_competencia || r.data_vencimento || '',
        dataVencimento: r.data_vencimento,
        descricao: r.descricao
      }
    }

    const matchCategoria = normalizarTexto(categoriaAtual) === normalizarTexto(padrao.categoriaPadrao)

    if (matchCategoria) {
      totalConsistentes += 1
      return {
        id: r.id,
        contaAzulId: r.conta_azul_id,
        fornecedor: fornecedorNome,
        categoriaEsperada: padrao.categoriaPadrao,
        categoriaAtual: categoriaAtual,
        percentualConfianca: padrao.percentualConfianca,
        totalHistoricoFornecedor: padrao.totalHistorico,
        status: 'consistente',
        valor: valor,
        dataCompetencia: r.data_competencia || r.data_vencimento || '',
        dataVencimento: r.data_vencimento,
        descricao: r.descricao
      }
    } else {
      totalDivergentes += 1
      valorTotalDivergente += valor
      return {
        id: r.id,
        contaAzulId: r.conta_azul_id,
        fornecedor: fornecedorNome,
        categoriaEsperada: padrao.categoriaPadrao,
        categoriaAtual: categoriaAtual,
        percentualConfianca: padrao.percentualConfianca,
        totalHistoricoFornecedor: padrao.totalHistorico,
        status: 'divergente',
        valor: valor,
        dataCompetencia: r.data_competencia || r.data_vencimento || '',
        dataVencimento: r.data_vencimento,
        descricao: r.descricao
      }
    }
  })

  // 8. Consulta status de governanca e justificativas registradas no Supabase
  const idsDivergentes = itens
    .filter(function(i) { return i.status === 'divergente' && i.contaAzulId; })
    .map(function(i) { return i.contaAzulId; });

  const mapaStatusJustificativa = new Map();

  if (idsDivergentes.length > 0) {
    try {
      const { data: rowsStatus, error: errStatus } = await supabase
        .from('auditoria_divergencias_status')
        .select('conta_azul_id, status_divergencia, motivo_justificativa, usuario_email, atualizado_em')
        .eq('empresa_id', empresaId)
        .in('conta_azul_id', idsDivergentes);

      if (!errStatus && rowsStatus) {
        for (const row of rowsStatus) {
          mapaStatusJustificativa.set(row.conta_azul_id, {
            status: row.status_divergencia,
            motivo: row.motivo_justificativa,
            usuarioEmail: row.usuario_email,
            atualizadoEm: row.atualizado_em
          });
        }
      }
    } catch (e) {
      console.warn('[AuditoriaCategorias] Tabela de justificativas pendente ou erro na busca:', e);
    }
  }

  let totalPendentes = 0;
  let totalJustificadas = 0;
  let totalCorrigidas = 0;

  for (const item of itens) {
    if (item.status === 'divergente') {
      const just = item.contaAzulId ? mapaStatusJustificativa.get(item.contaAzulId) : undefined;
      if (just) {
        item.statusDivergencia = just.status;
        item.motivoJustificativa = just.motivo;
        item.justificadoPor = just.usuarioEmail;
        item.justificadoEm = just.atualizadoEm;
      } else {
        item.statusDivergencia = 'PENDENTE';
      }

      if (item.statusDivergencia === 'JUSTIFICADA') totalJustificadas++;
      else if (item.statusDivergencia === 'CORRIGIDA') totalCorrigidas++;
      else totalPendentes++;
    }
  }

  const totalAuditado = itens.length;
  const taxaDivergencia = totalAuditado > 0
    ? Math.round((totalDivergentes / totalAuditado) * 10000) / 100
    : 0;

  return {
    totalAuditado,
    totalConsistentes,
    totalDivergentes,
    totalNovosFornecedores: totalNovos,
    totalPendentes,
    totalJustificadas,
    totalCorrigidas,
    valorTotalAuditado: Math.round(valorTotalAuditado * 100) / 100,
    valorTotalDivergente: Math.round(valorTotalDivergente * 100) / 100,
    taxaDivergencia,
    periodoAuditado: { inicio: dataInicio, fim: dataFim },
    periodoHistoricoAprendizado: { inicio: dataHistoricoInicio, fim: dataInicio },
    itens
  };
}

export interface LancamentoHistoricoItem {
  id: string
  contaAzulId?: string | null
  categoria: string
  valor: number
  dataCompetencia: string
  dataVencimento?: string | null
  descricao?: string | null
  status?: string | null
}

export interface CategoriaDistribuicaoItem {
  categoria: string
  quantidade: number
  valorTotal: number
  percentual: number
}

export interface HistoricoFornecedorDetalhado {
  fornecedor: string
  totalHistorico: number
  distribuicaoCategorias: CategoriaDistribuicaoItem[]
  ultimosLancamentos: LancamentoHistoricoItem[]
}

/**
 * Consulta o histórico completo e os últimos lançamentos de um fornecedor
 * 100% READ ONLY - Consulta apenas a base espelho do Conta Azul.
 */
export async function buscarHistoricoFornecedor(params: {
  empresaId: string
  fornecedor: string
  limite?: number
}): Promise<HistoricoFornecedorDetalhado> {
  const { empresaId, fornecedor, limite = 20 } = params

  if (!empresaId) {
    throw new Error('O parâmetro empresaId é obrigatório.')
  }
  if (!fornecedor || fornecedor.trim() === '') {
    throw new Error('O parâmetro fornecedor é obrigatório.')
  }

  const fornecedorNome = fornecedor.trim()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const supabase = createClient(supabaseUrl, supabaseKey)

  // 1. Busca os últimos lançamentos do fornecedor
  const { data: ultimosRows, error: errUltimos } = await supabase
    .from('contas_pagar_contaazul_espelho')
    .select('id, conta_azul_id, fornecedor_nome, categoria_nome, valor, data_competencia, data_vencimento, descricao, status')
    .eq('empresa_id', empresaId)
    .eq('fornecedor_nome', fornecedorNome)
    .order('data_competencia', { ascending: false })
    .limit(limite)

  if (errUltimos) {
    console.error('[AuditoriaCategorias] Erro ao buscar últimos lançamentos:', errUltimos)
    throw new Error(`Erro ao consultar histórico: ${errUltimos.message}`)
  }

  // 2. Busca todos os lançamentos para distribuição de categorias
  const { data: todasRows, error: errTodas } = await supabase
    .from('contas_pagar_contaazul_espelho')
    .select('categoria_nome, valor')
    .eq('empresa_id', empresaId)
    .eq('fornecedor_nome', fornecedorNome)
    .limit(10000)

  if (errTodas) {
    console.warn('[AuditoriaCategorias] Aviso ao buscar distribuição de categorias:', errTodas.message)
  }

  const rows = todasRows || []
  const totalHistorico = rows.length

  const mapaCategorias = new Map<string, { quantidade: number; valorTotal: number }>()
  for (const r of rows) {
    const cat = (r.categoria_nome || 'SEM CATEGORIA').trim()
    const v = Number(r.valor) || 0
    const atual = mapaCategorias.get(cat) || { quantidade: 0, valorTotal: 0 }
    atual.quantidade += 1
    atual.valorTotal += v
    mapaCategorias.set(cat, atual)
  }

  const distribuicaoCategorias: CategoriaDistribuicaoItem[] = Array.from(mapaCategorias.entries())
    .map(([categoria, dados]) => ({
      categoria,
      quantidade: dados.quantidade,
      valorTotal: Math.round(dados.valorTotal * 100) / 100,
      percentual: totalHistorico > 0 ? Math.round((dados.quantidade / totalHistorico) * 10000) / 100 : 0
    }))
    .sort((a, b) => b.quantidade - a.quantidade)

  const ultimosLancamentos: LancamentoHistoricoItem[] = (ultimosRows || []).map(r => ({
    id: r.id,
    contaAzulId: r.conta_azul_id,
    categoria: r.categoria_nome || 'SEM CATEGORIA',
    valor: Number(r.valor) || 0,
    dataCompetencia: r.data_competencia || r.data_vencimento || '',
    dataVencimento: r.data_vencimento,
    descricao: r.descricao,
    status: r.status
  }))

  return {
    fornecedor: fornecedorNome,
    totalHistorico,
    distribuicaoCategorias,
    ultimosLancamentos
  }
}

export interface SalvarJustificativaParams {
  empresaId: string;
  contaAzulId: string;
  fornecedorNome: string;
  categoriaOriginal: string;
  categoriaSugerida?: string | null;
  statusDivergencia: StatusJustificativa;
  motivoJustificativa?: string | null;
  usuarioEmail?: string | null;
}

/**
 * Salva ou atualiza a justificativa/governanca de uma divergencia contábil
 */
export async function salvarJustificativaDivergencia(params: SalvarJustificativaParams) {
  const {
    empresaId,
    contaAzulId,
    fornecedorNome,
    categoriaOriginal,
    categoriaSugerida,
    statusDivergencia,
    motivoJustificativa,
    usuarioEmail
  } = params;

  if (!empresaId) throw new Error('O parametro empresaId e obrigatorio.');
  if (!contaAzulId) throw new Error('O parametro contaAzulId e obrigatorio.');
  if (!statusDivergencia) throw new Error('O parametro statusDivergencia e obrigatorio.');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const payload = {
    empresa_id: empresaId,
    conta_azul_id: contaAzulId,
    fornecedor_nome: fornecedorNome,
    categoria_original: categoriaOriginal,
    categoria_sugerida: categoriaSugerida || null,
    status_divergencia: statusDivergencia,
    motivo_justificativa: motivoJustificativa ? motivoJustificativa.trim() : null,
    usuario_email: usuarioEmail || null,
    atualizado_em: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('auditoria_divergencias_status')
    .upsert(payload, { onConflict: 'empresa_id,conta_azul_id' })
    .select()
    .single();

  if (error) {
    console.error('[AuditoriaCategorias] Erro ao salvar justificativa:', error);
    throw new Error('Erro ao salvar justificativa no banco: ' + error.message);
  }

  return data;
}
