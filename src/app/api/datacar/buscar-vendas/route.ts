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

    // === LOG DE DIAGNÓSTICO: ver campos reais retornados pelo Datacar ===
    if (allOS.length > 0 && allOS[0].produtos?.length > 0) {
      const primeiroProduto = allOS[0].produtos[0]
      console.log('[DIAG] Campos do primeiro produto Datacar:', JSON.stringify(Object.keys(primeiroProduto)))
      console.log('[DIAG] Valores do primeiro produto Datacar:', JSON.stringify(primeiroProduto))
    }
    if (allOS.length > 0 && allOS[0].servicos?.length > 0) {
      const primeiroServico = allOS[0].servicos[0]
      console.log('[DIAG] Campos do primeiro servico Datacar:', JSON.stringify(Object.keys(primeiroServico)))
      console.log('[DIAG] Valores do primeiro servico Datacar:', JSON.stringify(primeiroServico))
    }
    // === FIM LOG DE DIAGNÓSTICO ===
    const codigosProdutos = new Set<string>()
    const descricoesProdutos = new Map<string, string>() // Para a busca na Brasil API
    allOS.forEach(os => {
      os.produtos?.forEach(p => {
        // CORREÇÃO: Priorizando o código interno (produto_Codigo) sobre o código do fabricante (produto_CodigoFabric)
        const cod = String(p.produto_Codigo || p.produto_CodigoFabric || p.codigo || '').trim()
        if (cod) {
          codigosProdutos.add(cod)
          descricoesProdutos.set(cod, String(p.produto_Descricao || p.descricao || ''))
        }
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

    // --- NOVA LÓGICA DE INTELIGÊNCIA FISCAL ---
    // Buscar memória fiscal para todos os produtos encontrados nestas OS
    let memoriaFiscalExata: Record<string, any> = {}
    let memoriaFiscalFamilia: Record<string, any> = {}
    if (codigosProdutos.size > 0) {
      try {
        const codigosQuery = Array.from(codigosProdutos).join(',')
        const host = req.headers.get('host')
        const protocol = req.headers.get('x-forwarded-proto') || 'http'
        const baseUrl = `${protocol}://${host}`
        const urlMemoria = new URL('/api/memoria-fiscal', baseUrl)
        urlMemoria.searchParams.set('empresa_id', empresa_id)
        urlMemoria.searchParams.set('codigos', codigosQuery)
        
        const resMemoria = await fetch(urlMemoria.toString())
        if (resMemoria.ok) {
          const dataMem = await resMemoria.json()
          if (dataMem.memoria) memoriaFiscalExata = dataMem.memoria
          if (dataMem.memoria_familia) memoriaFiscalFamilia = dataMem.memoria_familia
        }
      } catch (e) {
        console.warn('Erro ao buscar memória fiscal via API:', e)
      }
    }

    // Preparar um mapa de NCM para CEST usando a memória fiscal inteira da empresa (para dedução)
    const ncmParaCest = new Map<string, string>()
    try {
      const { data: todosMemoria } = await supabaseAdmin.from('memoria_fiscal').select('ncm, cest').eq('empresa_id', empresa_id).not('cest', 'is', null)
      if (todosMemoria) {
        todosMemoria.forEach(m => {
          if (m.ncm && m.cest) ncmParaCest.set(m.ncm, m.cest)
        })
      }
    } catch (e) {}

    // Pré-calcular dados fiscais de cada produto
    const inteligenciaFiscal = new Map<string, any>()
    for (const codigo of Array.from(codigosProdutos)) {
      let ncm = null
      let cest = null
      let tipo = null
      let origem = null
      let unidade = 'UN'
      const descricao = descricoesProdutos.get(codigo) || ''
      const primeiraPalavra = descricao.split(' ')[0]?.toUpperCase()

      // Prioridade 1: Nossa Memória Fiscal Exata (por código)
      if (memoriaFiscalExata[codigo]) {
        const mem = memoriaFiscalExata[codigo]
        ncm = mem.ncm
        cest = mem.cest
        tipo = mem.tipo_produto
        origem = mem.origem
        unidade = mem.unidade_medida || 'UN'
      } 
      // Prioridade 2: Nossa Memória Fiscal por Família (primeira palavra)
      else if (primeiraPalavra && memoriaFiscalFamilia[primeiraPalavra]) {
        const mem = memoriaFiscalFamilia[primeiraPalavra]
        ncm = mem.ncm
        cest = mem.cest
        tipo = mem.tipo_produto
        origem = mem.origem
        unidade = mem.unidade_medida || 'UN'
      }
      else {
        // Prioridade 3: Brasil API (apenas para NCM se não temos na memória)
        if (descricao) {
          try {
            const firstWord = descricao.split(' ')[0]
            const termoBusca = encodeURIComponent(firstWord)
            const brasilRes = await fetch(`https://brasilapi.com.br/api/ncm/v1?search=${termoBusca}`)
            if (brasilRes.ok) {
              const resultados = await brasilRes.json()
              if (resultados && Array.isArray(resultados) && resultados.length > 0) {
                const ncmValido = resultados.find((r: any) => r.codigo && r.codigo.replace(/\./g, '').length === 8)
                if (ncmValido) {
                  ncm = ncmValido.codigo.replace(/\./g, '')
                  
                  // Se achou NCM na Brasil API, verifica se temos um CEST conhecido para esse NCM
                  if (ncm && ncmParaCest.has(ncm)) {
                    cest = ncmParaCest.get(ncm)
                  }
                }
              }
            }
          } catch (e) {
             console.warn(`Erro na Brasil API para ${descricao}:`, e)
          }
        }
      }

      // Prioridade 4: Datacar (último caso)
      const metadados = produtosMetadata.get(codigo)
      if (!ncm) ncm = metadados?.ncm || undefined
      if (!cest) cest = metadados?.cest || undefined
      if (!origem) origem = metadados?.origem || undefined
      if (!unidade) unidade = metadados?.unidade_medida || 'UN'

      inteligenciaFiscal.set(codigo, { ncm, cest, tipo, origem, unidade })
    }
    // --- FIM DA NOVA LÓGICA ---

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
          const codigoItem = String(p.produto_Codigo || p.produto_CodigoFabric || p.codigo || '').trim()
          
          const infoFiscal = inteligenciaFiscal.get(codigoItem) || {}

          return {
            codigo: codigoItem,
            descricao: String(p.produto_Descricao || p.descricao || 'Produto'),
            quantidade: qtde,
            valor_unitario: valorUnitarioLiquido,
            valor_unitario_original: vlBruto,
            desconto: vlDesc,
            valor_total: totalItem,
            tipo: 'produto',
            ncm: infoFiscal.ncm || undefined,
            origem: infoFiscal.origem || undefined,
            cest: infoFiscal.cest || undefined,
            tipo_produto: infoFiscal.tipo || undefined,
            unidade_medida: infoFiscal.unidade || 'UN'
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

    // Montar diagnóstico dos campos reais vindos do Datacar
    const _diagnostico: Record<string, unknown> = {}
    if (allOS.length > 0) {
      if (allOS[0].produtos?.length > 0) {
        _diagnostico.primeiro_produto_campos = Object.keys(allOS[0].produtos[0])
        _diagnostico.primeiro_produto_valores = allOS[0].produtos[0]
      }
      if (allOS[0].servicos?.length > 0) {
        _diagnostico.primeiro_servico_campos = Object.keys(allOS[0].servicos[0])
        _diagnostico.primeiro_servico_valores = allOS[0].servicos[0]
      }
    }

    return NextResponse.json({
      total: dadosFiltrados.length,
      validos,
      invalidos,
      dados: dadosFiltrados,
      empresa_nome: empresa.nome,
      _diagnostico,
    })

  } catch (err: unknown) {
    console.error('Erro ao buscar OS/Pedidos do Datacar:', err)
    const msg = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
