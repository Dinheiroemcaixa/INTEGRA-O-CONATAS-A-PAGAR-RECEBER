import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { executarConsistencia } from '@/lib/auditoria/consistencia'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * POST /api/auditoria/regras/auto-homologar
 * Executa a homologação automática por exceção de todos os fornecedores
 * que atendem aos critérios de segurança contábil configurados.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      empresa_id,
      confianca_minima = 98,
      amostra_minima = 50,
      periodo = '12m'
    } = body

    if (!empresa_id) {
      return NextResponse.json({ error: 'empresa_id é obrigatório' }, { status: 400 })
    }

    // 1. Executar o motor de consistência para identificar o estado atual
    const auditoria = await executarConsistencia(supabaseAdmin, {
      empresa_id,
      periodo,
      confianca_minima: Number(confianca_minima),
      amostra_minima: Number(amostra_minima)
    })

    const pendentes = auditoria.fornecedores_pendentes || []

    // 2. Filtrar fornecedores elegíveis para homologação automática
    const elegiveis = pendentes.filter(
      (p) =>
        p.confianca_percentual >= Number(confianca_minima) &&
        p.total_lancamentos >= Number(amostra_minima) &&
        p.categoria_predominante &&
        p.categoria_predominante !== 'Indefinida'
    )

    if (elegiveis.length === 0) {
      return NextResponse.json({
        success: true,
        total_homologados: 0,
        valor_total_homologado: 0,
        mensagem: 'Nenhum fornecedor pendente atende aos critérios para homologação automática.'
      })
    }

    // 3. Preparar inserção das novas regras PADRAO
    const novasRegras = elegiveis.map((p) => ({
      empresa_id,
      fornecedor_id_conta_azul: p.fornecedor_id_conta_azul || null,
      fornecedor_nome: p.fornecedor_original.trim(),
      categoria_nome: p.categoria_predominante.trim(),
      tipo_regra: 'PADRAO',
      prioridade: 10,
      ativo: true,
      observacao: `Homologação Automática (Confiança: ${p.confianca_percentual}%, ${p.total_lancamentos} contas)`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }))

    // Desativar regras anteriores desses fornecedores
    const nomes = novasRegras.map((r) => r.fornecedor_nome)
    await supabaseAdmin
      .from('fornecedor_regras')
      .update({ ativo: false, updated_at: new Date().toISOString() })
      .eq('empresa_id', empresa_id)
      .eq('tipo_regra', 'PADRAO')
      .in('fornecedor_nome', nomes)

    // Inserir as novas regras
    const { data: regrasInseridas, error: errInsert } = await supabaseAdmin
      .from('fornecedor_regras')
      .insert(novasRegras)
      .select()

    if (errInsert) {
      throw new Error(`Erro ao inserir regras de homologação automática: ${errInsert.message}`)
    }

    // 4. Registrar logs no histórico de governança
    const logs = elegiveis.map((p) => ({
      empresa_id,
      fornecedor_nome: p.fornecedor_original,
      acao: 'HOMOLOGACAO_AUTOMATICA',
      categoria_nova: p.categoria_predominante,
      usuario_email: 'Sistema de Automação Contábil (IA)',
      detalhes: `Critérios atendidos: ${p.confianca_percentual}% confiança e ${p.total_lancamentos} lançamentos`,
      created_at: new Date().toISOString()
    }))

    try {
      await supabaseAdmin.from('fornecedor_regras_log').insert(logs)
    } catch (e) {
      // Ignora se tabela de logs não existir
    }

    const valorTotalHomologado = elegiveis.reduce((acc, p) => acc + p.total_valor, 0)

    return NextResponse.json({
      success: true,
      total_homologados: regrasInseridas?.length || 0,
      valor_total_homologado: valorTotalHomologado,
      fornecedores: elegiveis.map((p) => ({
        nome: p.fornecedor_original,
        categoria: p.categoria_predominante,
        confianca: p.confianca_percentual,
        lancamentos: p.total_lancamentos,
        valor: p.total_valor
      }))
    })
  } catch (err: any) {
    console.error('Erro na rota de auto-homologar:', err)
    return NextResponse.json(
      { error: err.message || 'Erro interno ao executar homologação automática' },
      { status: 500 }
    )
  }
}
