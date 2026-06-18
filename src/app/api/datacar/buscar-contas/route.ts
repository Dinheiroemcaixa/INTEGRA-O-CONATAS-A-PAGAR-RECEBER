import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buscarContasPagar } from '@/services/datacar/client'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Busca contas a pagar do Datacar e retorna no formato que o app já utiliza
 * para a revisão/envio ao Conta Azul.
 */
export async function POST(req: NextRequest) {
  try {
    const { empresa_id, dtIni, dtFim, tipoPeriodo = 'venc' } = await req.json()

    if (!empresa_id || !dtIni || !dtFim) {
      return NextResponse.json({ error: 'empresa_id, dtIni e dtFim são obrigatórios' }, { status: 400 })
    }

    // Buscar credenciais do Datacar
    const { data: empresa, error: empErr } = await supabaseAdmin
      .from('empresas')
      .select('datacar_token, datacar_cod_emp, datacar_id_operador, nome')
      .eq('id', empresa_id)
      .single()

    if (empErr || !empresa) {
      return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 })
    }

    if (!empresa.datacar_token || !empresa.datacar_cod_emp || !empresa.datacar_id_operador) {
      return NextResponse.json({ error: 'Credenciais do Datacar não configuradas' }, { status: 400 })
    }

    // Buscar dados da API Datacar
    const contasDatacar = await buscarContasPagar(
      {
        token: empresa.datacar_token,
        codEmp: empresa.datacar_cod_emp,
        idOperador: empresa.datacar_id_operador,
      },
      tipoPeriodo,
      dtIni,
      dtFim,
    )

    // Converter para o formato do app (ContaPagarPreview)
    const dados = contasDatacar.map((c) => {
      const valor = c.vlParc ?? 0
      const fornecedor = c.nomeEmit?.trim() || 'Fornecedor não informado'
      const vencimento = c.dtVenc || ''
      const emissao = c.dtEmis || ''
      const doc = [c.numNF, c.doc].filter(Boolean).join(' - ') || null

      return {
        fornecedor,
        valor,
        vencimento,
        emissao: emissao || null,
        doc: doc,
        categoria: c.grupoDesp || null,
        descricao: c.obs || null,
        valido: !!fornecedor && valor > 0 && !!vencimento,
        erros: [
          !fornecedor ? 'Fornecedor não informado' : null,
          valor <= 0 ? 'Valor inválido' : null,
          !vencimento ? 'Vencimento não informado' : null,
        ].filter(Boolean) as string[],
        // Campos extras do Datacar para referência
        _datacar: {
          siglaEmp: c.siglaEmp,
          parcela: c.parcela,
          cnpjEmit: c.cnpjEmit,
          grupoDesp: c.grupoDesp,
          subgrupoDesp: c.subgrupoDesp,
          bancoPgto: c.bancoPgto,
        }
      }
    })

    const validos = dados.filter(d => d.valido).length
    const invalidos = dados.filter(d => !d.valido).length

    return NextResponse.json({
      total: dados.length,
      validos,
      invalidos,
      dados,
      empresa_nome: empresa.nome,
    })

  } catch (err: unknown) {
    console.error('Erro ao buscar contas a pagar do Datacar:', err)
    const msg = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
