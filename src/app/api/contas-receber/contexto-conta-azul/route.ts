import { NextRequest, NextResponse } from 'next/server'
import { getValidToken, TokenError } from '@/lib/conta-azul/token-manager'
import {
  consultarAvaliacaoPeriodoStoneSatelite,
  listarCategoriasReceitaEDespesaSatelite,
  listarContasFinanceirasSatelite,
} from '@/lib/contas-receber/conta-azul-receber-satelite'
import type { RespostaContextoContaAzulReceberDTO } from '@/types/contas-receber'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

function validarDataIso(data: string | null): string | null {
  if (!data) return null
  const limpo = data.trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(limpo) ? limpo : null
}

/**
 * Endpoint EXCLUSIVAMENTE DE LEITURA (GET) da Etapa 1E do Módulo Contas a Receber.
 * Consulta no Conta Azul para a empresa selecionada:
 * - Contas financeiras ativas
 * - Categorias de RECEITA (identificando dinamicamente "Receitas de Vendas")
 * - Categorias de DESPESA (identificando dinamicamente "Tarifas de Cartão de Créditos")
 * - Lançamentos de Contas a Receber e Contas a Pagar existentes no período filtrado (quando data_de e data_ate são informados)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const empresaId = searchParams.get('empresa_id')?.trim() || ''

  if (!empresaId) {
    const vazia: RespostaContextoContaAzulReceberDTO = {
      connected: false,
      status_conexao: 'DESCONECTADA',
      reconectar: false,
      empresa_id: '',
      aviso: 'Selecione uma empresa para consultar os dados reais do Conta Azul.',
      contas_financeiras: [],
      categorias_receita: [],
      categorias_despesa: [],
      sugestao_categoria_receita_vendas: null,
      sugestao_categoria_despesa_mdr: null,
      avaliacao_periodo: null,
    }
    return NextResponse.json(vazia)
  }

  const dataDeIso = validarDataIso(searchParams.get('data_de'))
  const dataAteIso = validarDataIso(searchParams.get('data_ate'))
  const valorBrutoCentavos = Number(searchParams.get('valor_bruto_centavos') || '0') || 0
  const valorMdrCentavos = Number(searchParams.get('valor_mdr_centavos') || '0') || 0
  const valorLiquidoCentavos = Number(searchParams.get('valor_liquido_centavos') || '0') || 0
  const idsRaw = searchParams.get('identificadores') || ''
  const identificadoresDeterministicos = idsRaw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  const executarLeituraSatelite = async (accessToken: string) => {
    const [contasFinanceiras, categoriasResult, avaliacaoPeriodo] =
      await Promise.all([
        listarContasFinanceirasSatelite(accessToken),
        listarCategoriasReceitaEDespesaSatelite(accessToken),
        dataDeIso && dataAteIso
          ? consultarAvaliacaoPeriodoStoneSatelite({
              accessToken,
              dataDeIso,
              dataAteIso,
              valorBrutoEsperadoCentavos: valorBrutoCentavos,
              valorMdrEsperadoCentavos: valorMdrCentavos,
              valorLiquidoEsperadoCentavos: valorLiquidoCentavos,
              identificadoresDeterministicos,
            })
          : Promise.resolve(null),
      ])

    const payload: RespostaContextoContaAzulReceberDTO = {
      connected: true,
      status_conexao: 'CONECTADA',
      reconectar: false,
      empresa_id: empresaId,
      aviso: null,
      contas_financeiras: contasFinanceiras,
      categorias_receita: categoriasResult.categorias_receita,
      categorias_despesa: categoriasResult.categorias_despesa,
      sugestao_categoria_receita_vendas:
        categoriasResult.sugestao_categoria_receita_vendas,
      sugestao_categoria_despesa_mdr:
        categoriasResult.sugestao_categoria_despesa_mdr,
      avaliacao_periodo: avaliacaoPeriodo,
    }

    return payload
  }

  try {
    const tokenRes = await getValidToken(empresaId, 'financeiro')
    try {
      const resposta = await executarLeituraSatelite(tokenRes.accessToken)
      return NextResponse.json(resposta)
    } catch (firstErr: unknown) {
      const msg = firstErr instanceof Error ? firstErr.message : String(firstErr)
      if (
        msg === 'TOKEN_EXPIRADO' ||
        /401|unauthorized|token_expirado/i.test(msg)
      ) {
        const refreshed = await getValidToken(empresaId, 'financeiro', true, { failedAccessToken: tokenRes.accessToken })
        const respostaRetry = await executarLeituraSatelite(
          refreshed.accessToken
        )
        return NextResponse.json(respostaRetry)
      }
      throw firstErr
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(
      `[contas-receber/contexto-conta-azul] Falha na consulta GET para empresa ${empresaId}:`,
      msg
    )

    if (err instanceof TokenError && err.statusCode === 401) {
      const desconectada: RespostaContextoContaAzulReceberDTO = {
        connected: false,
        status_conexao: 'DESCONECTADA',
        reconectar: true,
        empresa_id: empresaId,
        aviso: err.message,
        contas_financeiras: [],
        categorias_receita: [],
        categorias_despesa: [],
        sugestao_categoria_receita_vendas: null,
        sugestao_categoria_despesa_mdr: null,
        avaliacao_periodo: null,
      }
      return NextResponse.json(desconectada)
    }

    const atencao: RespostaContextoContaAzulReceberDTO = {
      connected: true,
      status_conexao: 'ATENCAO',
      reconectar: false,
      empresa_id: empresaId,
      aviso:
        msg ||
        'Falha temporária ao consultar dados somente-leitura do Conta Azul.',
      contas_financeiras: [],
      categorias_receita: [],
      categorias_despesa: [],
      sugestao_categoria_receita_vendas: null,
      sugestao_categoria_despesa_mdr: null,
      avaliacao_periodo: null,
    }
    return NextResponse.json(atencao)
  }
}
