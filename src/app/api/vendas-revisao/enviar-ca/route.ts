import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buscarOuCriarProduto, criarVenda, VendaPayload, refreshToken as refreshCA, buscarOuCriarCliente } from '@/lib/conta-azul/api'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { empresa_id, ids } = await req.json()

    if (!empresa_id || !ids || !Array.isArray(ids) || ids.length === 0) {
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

    // Renovação automática de token
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

    // Busca as OS da tabela de revisão
    const { data: vendasRevisao, error: revErr } = await supabaseAdmin
      .from('vendas_revisao')
      .select('*')
      .in('id', ids)
      .eq('empresa_id', empresa_id)

    if (revErr || !vendasRevisao) {
      return NextResponse.json({ error: 'Erro ao buscar OS em revisão' }, { status: 500 })
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

    const mapOpcaoCondicao = (forma: string): { opcao: string; numParcelas: number } => {
      const f = forma?.toLowerCase() || ''
      const matchParcelas = f.match(/(\d+)\s*x/)
      if (matchParcelas) {
        const n = parseInt(matchParcelas[1], 10)
        if (n > 1) return { opcao: `${n}x`, numParcelas: n }
      }
      return { opcao: 'À vista', numParcelas: 1 }
    }

    for (const venda of vendasRevisao) {
      try {
        // 1. Busca/Cria Cliente enviando também o CPF/CNPJ se existir
        const idCliente = await buscarOuCriarCliente(
          accessToken, 
          venda.cliente, 
          venda.cliente_cpf_cnpj
        )
        if (!idCliente) throw new Error(`Não foi possível criar/encontrar o cliente: ${venda.cliente}`)

        // 2. Busca/Cria Produtos
        const itensPayload = []
        let totalLiquidoItens = 0
        const itensRevisao = venda.itens || []

        for (const item of itensRevisao) {
          const valorUnitarioLiquido = item.valor_unitario
          const totalItem = parseFloat((item.quantidade * valorUnitarioLiquido).toFixed(2))
          const valorUnitarioOriginal = item.valor_unitario_original ?? item.valor_unitario
          const idProduto = await buscarOuCriarProduto(accessToken, item.codigo, item.descricao, valorUnitarioOriginal)
          
          itensPayload.push({
            descricao: '',
            quantidade: 1, 
            valor: totalItem, 
            id: idProduto
          })
          totalLiquidoItens = parseFloat((totalLiquidoItens + totalItem).toFixed(2))
        }

        const dataVendaFormatada = venda.data_venda
          ? new Date(venda.data_venda).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0]

        // 3. Monta Payload
        const { opcao, numParcelas } = mapOpcaoCondicao(venda.forma_pagamento || '')
        const valorLiquido = totalLiquidoItens
        const valorParcela = parseFloat((valorLiquido / numParcelas).toFixed(2))
        const parcelasPayload = Array.from({ length: numParcelas }, (_, i) => {
          const dataVenc = new Date(dataVendaFormatada)
          dataVenc.setMonth(dataVenc.getMonth() + i)
          return {
            data_vencimento: dataVenc.toISOString().split('T')[0],
            valor: i === numParcelas - 1
              ? parseFloat((valorLiquido - valorParcela * (numParcelas - 1)).toFixed(2))
              : valorParcela
          }
        })

        const payload: VendaPayload = {
          id_cliente: idCliente,
          numero: undefined,
          situacao: 'APROVADO',
          data_venda: dataVendaFormatada,
          itens: itensPayload,
          condicao_pagamento: {
            tipo_pagamento: mapPagamento(venda.forma_pagamento || ''),
            opcao_condicao_pagamento: opcao,
            parcelas: parcelasPayload
          }
        }

        // 4. Cria Venda no Conta Azul
        const vendaCriada = await criarVenda(accessToken, payload)

        // 5. Atualiza no banco
        await supabaseAdmin
          .from('vendas_revisao')
          .update({
            status: 'concluido',
            conta_azul_id: vendaCriada.id,
            erro_envio: null
          })
          .eq('id', venda.id)

        // Grava também no histórico de vendas_importadas para manter compatibilidade com relatórios/etc
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
        console.error(`Erro ao enviar venda ${venda.os_numero} da revisão:`, msgErro)

        await supabaseAdmin
          .from('vendas_revisao')
          .update({
            status: 'erro',
            erro_envio: msgErro
          })
          .eq('id', venda.id)
      }
    }

    return NextResponse.json({ sucessos, erros, detalhesErros })

  } catch (error: any) {
    console.error('Erro geral no endpoint vendas-revisao/enviar-ca:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
