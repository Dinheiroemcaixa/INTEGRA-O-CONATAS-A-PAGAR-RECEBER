import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buscarOSPedidos, buscarProdutos, DatacarProdutoResponse } from '@/services/datacar/client'

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
    const { empresa_id, dtIni, dtFim, tipoPeriodo = 'encerramento', situacao = 'todas' } = await req.json()

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

    // Extrair códigos únicos de produtos
    const codigosProdutos = new Set<string>()
    allOS.forEach(os => {
      os.produtos?.forEach(p => {
        const cod = String(p.produto_CodigoFabric || p.produto_Codigo || p.codigo || '').trim()
        if (cod) codigosProdutos.add(cod)
      })
    })

    // Buscar metadados dos produtos no Datacar (NCM, Origem)
    const produtosMetadata = new Map<string, DatacarProdutoResponse>()
    const codigosArray = Array.from(codigosProdutos)
    
    // Chunk requests in groups of 10 para evitar timeouts e sobrecarga
    for (let i = 0; i < codigosArray.length; i += 10) {
      const chunk = codigosArray.slice(i, i + 10)
      const promessas = chunk.map(async (codigo) => {
        try {
          const res = await buscarProdutos(credentials, codigo)
          if (res && res.length > 0) {
            // Find exact match just in case
            const match = res.find(p => p.codigo?.trim() === codigo)
            if (match) produtosMetadata.set(codigo, match)
          }
        } catch (e) {
          console.warn(`Erro ao buscar metadados do produto ${codigo} no Datacar:`, e)
        }
      })
      await Promise.all(promessas)
    }

    // Converter para o formato VendaPreview do app (sem filtrar canceladas — o frontend filtra pela situação)
    const dados = allOS.map((os) => {
      // Determinar situação da OS com base nas datas disponíveis
      let situacao: 'em_andamento' | 'concluida' | 'encerrada' | 'cancelada' = 'em_andamento'
      if (os.venda_DtCancelamento) situacao = 'cancelada'
      else if (os.venda_DtEncerramento) situacao = 'encerrada'
      else if (os.venda_DtConclusao) situacao = 'concluida'
      const cliente = os.cliente_Nome?.trim() || os.cliente_RazaoSocial?.trim() || 'Cliente não informado'
      const osNumero = String(os.venda_Numero || '')
      const dataVenda = os.venda_DtEncerramento || os.venda_DtConclusao || os.venda_DtCriacao || ''

      // Montar itens para o Conta Azul
      // Campos reais da API Datacar:
      //   Produtos: produto_Codigo, produto_CodigoFabric, produto_Descricao, venda_Qtde, venda_VlBruto, venda_VlDesc, venda_Custo
      //   Serviços: servico_Codigo, servico_Descricao, venda_Qtde, venda_VlBruto, venda_Custo
      // venda_VlBruto = valor unitário bruto (antes do desconto)
      // venda_VlDesc = valor do desconto unitário
      // Valor líquido unitário = venda_VlBruto - venda_VlDesc
      // Valor total do item = quantidade * valor líquido unitário
      const itens = [
        ...(os.produtos || []).map((p: Record<string, unknown>) => {
          const qtde = Number(p.venda_Qtde || p.quantidade || p.qtde || 1)
          const vlBruto = Number(p.venda_VlBruto || p.valorUnitario || p.vlUnitario || 0)
          const vlDesc = Number(p.venda_VlDesc || 0)
          const valorUnitarioLiquido = parseFloat(Math.max(0, vlBruto - vlDesc).toFixed(4))
          const totalItem = parseFloat((qtde * valorUnitarioLiquido).toFixed(2))
          const codigoItem = String(p.produto_CodigoFabric || p.produto_Codigo || p.codigo || '').trim()
          const metadata = produtosMetadata.get(codigoItem)

          return {
            codigo: codigoItem,
            descricao: String(p.produto_Descricao || p.descricao || 'Produto'),
            quantidade: qtde,
            valor_unitario: valorUnitarioLiquido,
            valor_unitario_original: vlBruto,
            desconto: vlDesc,
            valor_total: totalItem,
            tipo: 'produto',
            ncm: metadata?.ncm || undefined,
            origem: metadata?.origem || undefined,
            cest: metadata?.cest || undefined,
            unidade_medida: metadata?.unidade_medida || 'UN'
          }
        }),
        ...(os.servicos || []).map((s: Record<string, unknown>) => {
          const qtde = Number(s.venda_Qtde || s.quantidade || s.qtde || 1)
          const vlBruto = Number(s.venda_VlBruto || s.valorUnitario || s.vlUnitario || 0)
          const vlDesc = Number(s.venda_VlDesc || 0)
          const valorUnitarioLiquido = parseFloat(Math.max(0, vlBruto - vlDesc).toFixed(4))
          const totalItem = parseFloat((qtde * valorUnitarioLiquido).toFixed(2))
          return {
            codigo: String(s.servico_Codigo || s.codigo || ''),
            descricao: String(s.servico_Descricao || s.descricao || 'Serviço'),
            quantidade: qtde,
            valor_unitario: valorUnitarioLiquido,
            valor_unitario_original: vlBruto,
            desconto: vlDesc,
            valor_total: totalItem,
            tipo: 'servico',
          }
        }),
      ]

      // Valor total da venda = soma dos valores totais de cada item
      const totalProdutos = itens.filter(i => i.tipo === 'produto').reduce((sum, i) => sum + i.valor_total, 0)
      const totalServicos = itens.filter(i => i.tipo === 'servico').reduce((sum, i) => sum + i.valor_total, 0)
      const valorTotal = parseFloat((totalProdutos + totalServicos).toFixed(2))

      return {
        cliente,
        cliente_cpf_cnpj: os.cliente_Cpf_Cnpj || null,
        cliente_endereco: {
          logradouro: os.end_Rua || os.cliente_Logradouro || os.cliente_Endereco || null,
          numero: os.end_Numero || os.cliente_Numero || null,
          complemento: os.end_Complemento || os.cliente_Complemento || null,
          bairro: os.end_Bairro || os.cliente_Bairro || null,
          cidade: os.end_Cidade || os.cliente_Cidade || os.cliente_Municipio || null,
          estado: os.end_Uf || os.cliente_Uf || os.cliente_Estado || os.cliente_UF || null,
          cep: os.end_Cep || os.cliente_Cep || os.cliente_CEP || null,
        },
        os_numero: osNumero,
        data_venda: dataVenda,
        valor_total: valorTotal,
        forma_pagamento: os.venda_Parcelamento || undefined,
        situacao,
        itens,
        valido: !!cliente && valorTotal > 0,
        erros: [
          !cliente ? 'Cliente não informado' : null,
          valorTotal <= 0 ? `Valor total zerado (Produtos: ${totalProdutos}, Serviços: ${totalServicos})` : null,
        ].filter(Boolean) as string[],
        // Dados extras para referência
        _datacar: {
          venda_Id: os.venda_Id,
          empresa_sigla: os.empresa_sigla,
          vendedor: os.vendedor_Nome,
          veiculo: os.veiculo_Placa ? `${os.veiculo_Marca || ''} ${os.veiculo_Modelo || ''} - ${os.veiculo_Placa}`.trim() : null,
          cliente_cpf_cnpj: os.cliente_Cpf_Cnpj,
          // Endereço completo do cliente (Datacar usa prefixo end_ para OS/Pedidos)
          cliente_logradouro: os.end_Rua || os.cliente_Logradouro || os.cliente_Endereco || null,
          cliente_numero: os.end_Numero || os.cliente_Numero || null,
          cliente_complemento: os.end_Complemento || os.cliente_Complemento || null,
          cliente_bairro: os.end_Bairro || os.cliente_Bairro || null,
          cliente_cidade: os.end_Cidade || os.cliente_Cidade || os.cliente_Municipio || null,
          cliente_uf: os.end_Uf || os.cliente_Uf || os.cliente_Estado || os.cliente_UF || null,
          cliente_cep: os.end_Cep || os.cliente_Cep || os.cliente_CEP || null,
          raw: os // Salvando o raw completo para a revisão
        }
      }
    })

    // Filtra pela situação solicitada antes de contar
    const dadosFiltrados = dados.filter(d => situacao === 'todas' || d.situacao === situacao)

    const validos = dadosFiltrados.filter(d => d.valido).length
    const invalidos = dadosFiltrados.filter(d => !d.valido).length

    return NextResponse.json({
      total: dadosFiltrados.length,
      validos,
      invalidos,
      dados: dadosFiltrados,
      empresa_nome: empresa.nome,
    })

  } catch (err: unknown) {
    console.error('Erro ao buscar OS/Pedidos do Datacar:', err)
    const msg = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
