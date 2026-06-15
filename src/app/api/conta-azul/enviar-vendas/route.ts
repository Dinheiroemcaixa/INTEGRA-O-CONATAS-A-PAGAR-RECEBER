import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { buscarOuCriarCliente, buscarOuCriarProduto, criarVenda, VendaPayload } from '@/lib/conta-azul/api'
import type { VendaPreview } from '@/types'

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { empresa_id, vendas } = await req.json()

    if (!empresa_id || !vendas || !Array.isArray(vendas)) {
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
    }

    const { data: empresa, error: empErr } = await supabase
      .from('empresas')
      .select('access_token_conta_azul')
      .eq('id', empresa_id)
      .single()

    if (empErr || !empresa?.access_token_conta_azul) {
      return NextResponse.json({ error: 'Empresa não conectada ao Conta Azul' }, { status: 400 })
    }

    const accessToken = empresa.access_token_conta_azul

    let sucessos = 0
    let erros = 0

    // Mapeamento de formas de pagamento para o CA
    // Depende da configuração do CA, por padrão vamos usar DINHEIRO e à vista para simplificar se não houver de-para
    const mapPagamento = (forma: string) => {
      const f = forma?.toLowerCase() || ''
      if (f.includes('cred') || f.includes('créd')) return 'CARTAO_CREDITO'
      if (f.includes('deb') || f.includes('déb')) return 'CARTAO_DEBITO'
      if (f.includes('pix')) return 'PIX'
      if (f.includes('boleto')) return 'BOLETO'
      if (f.includes('transf')) return 'TRANSFERENCIA_BANCARIA'
      return 'DINHEIRO'
    }

    for (const venda of vendas as VendaPreview[]) {
      try {
        // 1. Busca/Cria Cliente
        const idCliente = await buscarOuCriarCliente(accessToken, venda.cliente)
        if (!idCliente) throw new Error(`Não foi possível criar/encontrar o cliente: ${venda.cliente}`)

        // 2. Busca/Cria Produtos
        const itensPayload = []
        for (const item of venda.itens) {
          const idProduto = await buscarOuCriarProduto(accessToken, item.codigo, item.descricao, item.valor_unitario)
          itensPayload.push({
            descricao: item.descricao || item.codigo || 'Produto Importado',
            quantidade: item.quantidade,
            valor: item.valor_unitario,
            id: idProduto
          })
        }

        const dataVendaFormatada = venda.data_venda 
          ? new Date(venda.data_venda).toISOString() 
          : new Date().toISOString()

        // 3. Monta Payload Venda
        const payload: VendaPayload = {
          id_cliente: idCliente,
          numero: venda.os_numero ? Number(venda.os_numero.replace(/\D/g, '')) : undefined,
          situacao: 'APROVADO',
          data_venda: dataVendaFormatada,
          itens: itensPayload,
          condicao_pagamento: {
            tipo_pagamento: mapPagamento(venda.forma_pagamento || ''),
            opcao_condicao_pagamento: 'A_VISTA',
            parcelas: [
              {
                data_vencimento: dataVendaFormatada,
                valor: venda.valor_total
              }
            ]
          }
        }

        // 4. Cria Venda no Conta Azul
        const vendaCriada = await criarVenda(accessToken, payload)

        // 5. Salva na tabela vendas_importadas
        await supabase.from('vendas_importadas').insert({
          empresa_id: empresa_id,
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
        console.error(`Erro ao criar venda ${venda.os_numero}:`, e.message)
        // Salva registro com erro
        await supabase.from('vendas_importadas').insert({
          empresa_id: empresa_id,
          cliente: venda.cliente,
          valor_total: venda.valor_total,
          data_venda: venda.data_venda,
          os_numero: venda.os_numero,
          forma_pagamento: venda.forma_pagamento,
          status: 'erro',
          erros_importacao: [e.message]
        })
      }
    }

    return NextResponse.json({ sucessos, erros })

  } catch (error: any) {
    console.error('Erro geral no endpoint enviar-vendas:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
