import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buscarOSPedidos } from '@/services/datacar/client'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Busca OS/Pedidos (vendas) do Datacar e retorna no formato do app.
 * Busca todas as páginas automaticamente.
 */
export async function POST(req: NextRequest) {
  try {
    const { empresa_id, dtIni, dtFim, tipoPeriodo = 'encerramento' } = await req.json()

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

    const credentials = {
      token: empresa.datacar_token,
      codEmp: empresa.datacar_cod_emp,
      idOperador: empresa.datacar_id_operador,
    }

    // Buscar todas as páginas (Datacar retorna max 50 por página)
    let allOS: Awaited<ReturnType<typeof buscarOSPedidos>> = []
    let pagina = 1
    let continuar = true

    while (continuar) {
      const resultado = await buscarOSPedidos(credentials, tipoPeriodo, dtIni, dtFim, String(pagina))
      if (resultado && resultado.length > 0) {
        allOS = [...allOS, ...resultado]
        pagina++
        // Se retornou menos de 50, é a última página
        if (resultado.length < 50) continuar = false
      } else {
        continuar = false
      }
    }

    // Filtrar OS canceladas (sem data de cancelamento)
    const osAtivas = allOS.filter(os => !os.venda_DtCancelamento)

    // Converter para o formato VendaPreview do app
    const dados = osAtivas.map((os) => {
      const cliente = os.cliente_Nome?.trim() || os.cliente_RazaoSocial?.trim() || 'Cliente não informado'
      const osNumero = String(os.venda_Numero || '')
      const dataVenda = os.venda_DtEncerramento || os.venda_DtConclusao || os.venda_DtCriacao || ''

      // Calcular valor total dos produtos + serviços
      const totalProdutos = (os.produtos || []).reduce((sum: number, p: Record<string, unknown>) => {
        const val = Number(p.valorTotal || p.vlTotal || p.valor || 0)
        return sum + val
      }, 0)

      const totalServicos = (os.servicos || []).reduce((sum: number, s: Record<string, unknown>) => {
        const val = Number(s.valorTotal || s.vlTotal || s.valor || 0)
        return sum + val
      }, 0)

      const valorTotal = totalProdutos + totalServicos + (os.frete_Valor || 0)

      // Montar itens para o Conta Azul
      const itens = [
        ...(os.produtos || []).map((p: Record<string, unknown>) => ({
          codigo: String(p.codigo || ''),
          descricao: String(p.descricao || 'Produto'),
          quantidade: Number(p.quantidade || p.qtde || 1),
          valor_unitario: Number(p.valorUnitario || p.vlUnitario || p.valor || 0),
        })),
        ...(os.servicos || []).map((s: Record<string, unknown>) => ({
          codigo: String(s.codigo || ''),
          descricao: String(s.descricao || 'Serviço'),
          quantidade: Number(s.quantidade || s.qtde || 1),
          valor_unitario: Number(s.valorUnitario || s.vlUnitario || s.valor || 0),
        })),
      ]

      return {
        cliente,
        os_numero: osNumero,
        data_venda: dataVenda,
        valor_total: valorTotal,
        forma_pagamento: os.venda_Parcelamento || undefined,
        itens,
        valido: !!cliente && valorTotal > 0,
        erros: [
          !cliente ? 'Cliente não informado' : null,
          valorTotal <= 0 ? 'Valor total zerado' : null,
        ].filter(Boolean) as string[],
        // Dados extras para referência
        _datacar: {
          venda_Id: os.venda_Id,
          empresa_sigla: os.empresa_sigla,
          vendedor: os.vendedor_Nome,
          veiculo: os.veiculo_Placa ? `${os.veiculo_Marca || ''} ${os.veiculo_Modelo || ''} - ${os.veiculo_Placa}`.trim() : null,
          cliente_cpf_cnpj: os.cliente_Cpf_Cnpj,
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
    console.error('Erro ao buscar OS/Pedidos do Datacar:', err)
    const msg = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
