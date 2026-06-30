import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buscarOuCriarProduto, criarVenda, VendaPayload, buscarOuCriarCliente, refreshToken as refreshCA } from '@/lib/conta-azul/api'
import type { VendaPreview } from '@/types'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// URL base da API v2 do Conta Azul (sem duplicação de /v1)
const CA_BASE = 'https://api-v2.contaazul.com/v1'


export async function POST(req: NextRequest) {
  try {
    const { empresa_id, vendas } = await req.json()

    if (!empresa_id || !vendas || !Array.isArray(vendas)) {
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
    }

    const { data: empresa, error: empErr } = await supabaseAdmin
      .from('empresas')
      .select('*')
      .eq('id', empresa_id)
      .single()

    if (empErr || !empresa?.access_token_conta_azul) {
      return NextResponse.json({ error: 'Empresa não conectada ao Conta Azul' }, { status: 400 })
    }

    // Renovação automática de token (igual ao módulo Contas a Pagar)
    let accessToken = empresa.access_token_conta_azul
    const expiracao = empresa.data_expiracao_token ? new Date(empresa.data_expiracao_token) : null
    const agora = new Date()
    const tokenExpirado = expiracao && expiracao <= new Date(agora.getTime() + 5 * 60 * 1000)

    if (tokenExpirado && empresa.refresh_token_conta_azul) {
      try {
        const novosTokens = await refreshCA(
          empresa.refresh_token_conta_azul,
          process.env.CONTA_AZUL_CLIENT_ID!,
          process.env.CONTA_AZUL_CLIENT_SECRET!
        )
        accessToken = novosTokens.access_token
        await supabaseAdmin
          .from('empresas')
          .update({
            access_token_conta_azul: novosTokens.access_token,
            refresh_token_conta_azul: novosTokens.refresh_token || empresa.refresh_token_conta_azul,
            data_expiracao_token: new Date(Date.now() + (novosTokens.expires_in || 3600) * 1000).toISOString(),
          })
          .eq('id', empresa_id)
      } catch {
        return NextResponse.json({ error: 'Token Conta Azul expirado. Acesse as Configurações e reconecte.' }, { status: 401 })
      }
    }

    let sucessos = 0
    let erros = 0
    let detalhesErros: string[] = []

    const mapPagamento = (forma: string) => {
      const f = forma?.toLowerCase() || ''
      if (f.includes('cred') || f.includes('créd')) return 'CARTAO_CREDITO'
      if (f.includes('deb') || f.includes('déb')) return 'CARTAO_DEBITO'
      if (f.includes('pix')) return 'PIX'
      if (f.includes('boleto')) return 'BOLETO'
      if (f.includes('transf')) return 'TRANSFERENCIA_BANCARIA'
      return 'DINHEIRO'
    }

    // Determina a opcao_condicao_pagamento conforme exigido pela API do Conta Azul:
    // 'À vista', '2x', '3x', ... ou padrão de dias '30', '30,60', etc.
    const mapOpcaoCondicao = (forma: string): { opcao: string; numParcelas: number } => {
      const f = forma?.toLowerCase() || ''
      // Detecta parcelamentos do tipo "2x", "3x", "12x" etc.
      const matchParcelas = f.match(/(\d+)\s*x/)
      if (matchParcelas) {
        const n = parseInt(matchParcelas[1], 10)
        if (n > 1) return { opcao: `${n}x`, numParcelas: n }
      }
      // Pagamento padrão → à vista
      return { opcao: 'À vista', numParcelas: 1 }
    }

    for (const venda of vendas as VendaPreview[]) {
      try {
        // 1. Busca/Cria Cliente com função dedicada e URLs corretas
        const idCliente = await buscarOuCriarCliente(accessToken, venda.cliente, (venda as any).cliente_cpf_cnpj)
        if (!idCliente) throw new Error(`Não foi possível criar/encontrar o cliente: ${venda.cliente}`)

        // 2. Busca/Cria Produtos
        const itensPayload = []
        let totalDescontoVenda = 0
        let totalLiquidoItens = 0

        for (const item of venda.itens) {
          const valorUnitarioOriginal = item.valor_unitario_original ?? item.valor_unitario
          const descontoUnitario = item.desconto ?? 0
          
          totalDescontoVenda += (descontoUnitario * item.quantidade)
          
          const idProduto = await buscarOuCriarProduto(
            accessToken, 
            item.codigo, 
            item.descricao, 
            valorUnitarioOriginal,
            {
              ncm: item.ncm,
              origem: item.origem,
              unidade_medida: item.unidade_medida
            }
          )
          itensPayload.push({
            descricao: item.descricao || '',
            quantidade: item.quantidade,
            valor: valorUnitarioOriginal,
            id: idProduto
          })
          
          const totalItem = parseFloat((item.quantidade * item.valor_unitario).toFixed(2))
          totalLiquidoItens = parseFloat((totalLiquidoItens + totalItem).toFixed(2))
        }
        
        totalDescontoVenda = parseFloat(totalDescontoVenda.toFixed(2))

        // Conta Azul exige formato YYYY-MM-DD (apenas data, sem horário)
        const dataVendaFormatada = venda.data_venda
          ? new Date(venda.data_venda).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0]

        // 3. Monta Payload
        const { opcao, numParcelas } = mapOpcaoCondicao(venda.forma_pagamento || '')

        // totalLiquidoItens = sum(1 × totalItem) = exatamente o que o Conta Azul vai calcular
        const valorLiquido = totalLiquidoItens

        // Gera parcelas dividindo o valor líquido pelo número de parcelas
        const valorParcela = parseFloat((valorLiquido / numParcelas).toFixed(2))
        const parcelasPayload = Array.from({ length: numParcelas }, (_, i) => {
          // Cada parcela vence 30 dias após a anterior (para parcelado) ou na data da venda (à vista)
          const dataVenc = new Date(dataVendaFormatada)
          dataVenc.setMonth(dataVenc.getMonth() + i)
          return {
            data_vencimento: dataVenc.toISOString().split('T')[0],
            valor: i === numParcelas - 1
              ? parseFloat((valorLiquido - valorParcela * (numParcelas - 1)).toFixed(2)) // última parcela absorve centavos
              : valorParcela
          }
        })

        const payload: VendaPayload = {
          id_cliente: idCliente,
          // 01 - Número da venda: NÃO enviamos o número da OS.
          // A função criarVenda() busca automaticamente o próximo número disponível no Conta Azul.
          numero: undefined,
          situacao: 'APROVADO',
          data_venda: dataVendaFormatada,
          // 03 - Vendedor responsável: deixado em branco (sem id_vendedor)
          desconto: totalDescontoVenda > 0 ? totalDescontoVenda : undefined,
          itens: itensPayload,
          condicao_pagamento: {
            tipo_pagamento: mapPagamento(venda.forma_pagamento || ''),
            opcao_condicao_pagamento: opcao,
            parcelas: parcelasPayload
          }
        }

        // 4. Cria Venda no Conta Azul
        const vendaCriada = await criarVenda(accessToken, payload)

        // 5. Salva no banco
        await supabaseAdmin.from('vendas_importadas').insert({
          empresa_id,
          cliente: venda.cliente,
          valor_total: venda.valor_total,
          data_venda: venda.data_venda,
          os_numero: venda.os_numero,
          forma_pagamento: venda.forma_pagamento,
          status: 'concluido',
          conta_azul_id: vendaCriada.id,
          payload_contaazul: payload
        })

        sucessos++
      } catch (e: any) {
        erros++
        const msgErro = e.message || 'Erro desconhecido'
        detalhesErros.push(`OS ${venda.os_numero || 'S/N'}: ${msgErro}`)
        console.error(`Erro ao criar venda ${venda.os_numero}:`, msgErro)

        await supabaseAdmin.from('vendas_importadas').insert({
          empresa_id,
          cliente: venda.cliente,
          valor_total: venda.valor_total,
          data_venda: venda.data_venda,
          os_numero: venda.os_numero,
          forma_pagamento: venda.forma_pagamento,
          status: 'erro',
          erros_importacao: [msgErro]
        })
      }
    }

    return NextResponse.json({ sucessos, erros, detalhesErros })

  } catch (error: any) {
    console.error('Erro geral no endpoint enviar-vendas:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
