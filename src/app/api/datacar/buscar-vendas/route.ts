import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buscarOSPedidos, buscarProdutos, DatacarProdutoResponse } from '@/services/datacar/client'
import { buscarCnpj, buscarCep, enriquecerEndereco, EnderecoDatacar } from '@/services/brasil-api/client'
import { buscarVendasContaAzul, verificarNfeEmitidaDaVenda } from '@/lib/conta-azul/api'
import { getValidToken } from '@/lib/conta-azul/token-manager'

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
    const body = await req.json()
    const empresa_id = body.empresa_id
    let dtIni = body.dtIni || body.data_inicio
    let dtFim = body.dtFim || body.data_fim
    let tipoPeriodo = body.tipoPeriodo || body.tipo_periodo || "encerramento"
    let situacao = body.situacao || "todas"
    let numeroOS = body.numeroOS || body.numero_os
    const tipoItens = body.tipo_itens || body.tipoItens

    if (tipoPeriodo === "abertura") tipoPeriodo = "criacao"

    if (!empresa_id) {
      return NextResponse.json({ error: "empresa_id é obrigatório" }, { status: 400 })
    }

    // Se datas não forem passadas, assume a data de hoje por padrão
    if (!numeroOS && (!dtIni || !dtFim)) {
      const hoje = new Date().toISOString().split("T")[0]
      if (!dtIni) dtIni = hoje
      if (!dtFim) dtFim = hoje
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

    // Se um número de OS específico foi informado, usamos o tipo de período 'criacao'
    // e buscamos em uma margem segura de 180 dias para evitar timeouts, ou no período customizado caso seja maior.
    if (numeroOS) {
      tipoPeriodo = 'criacao'
      if (dtIni && dtFim) {
        const dataIniDate = new Date(dtIni)
        const hoje = new Date()
        const limiteDiferenca = 180 * 24 * 60 * 60 * 1000 // 180 dias
        
        // Se o período for menor que 180 dias, ampliamos para 180 dias por segurança
        if (hoje.getTime() - dataIniDate.getTime() < limiteDiferenca) {
          const seisMesesAtras = new Date()
          seisMesesAtras.setDate(hoje.getDate() - 180)
          const diaI = String(seisMesesAtras.getDate()).padStart(2, '0')
          const mesI = String(seisMesesAtras.getMonth() + 1).padStart(2, '0')
          const anoI = seisMesesAtras.getFullYear()
          dtIni = `${anoI}-${mesI}-${diaI}`
        }
      } else {
        const hoje = new Date()
        const seisMesesAtras = new Date()
        seisMesesAtras.setDate(hoje.getDate() - 180)
        
        const diaI = String(seisMesesAtras.getDate()).padStart(2, '0')
        const mesI = String(seisMesesAtras.getMonth() + 1).padStart(2, '0')
        const anoI = seisMesesAtras.getFullYear()
        dtIni = `${anoI}-${mesI}-${diaI}`
        
        const diaF = String(hoje.getDate()).padStart(2, '0')
        const mesF = String(hoje.getMonth() + 1).padStart(2, '0')
        const anoF = hoje.getFullYear()
        dtFim = `${anoF}-${mesF}-${diaF}`
      }
    }

    // Buscar todas as páginas (Datacar retorna max 50 por página)
    let allOS: Awaited<ReturnType<typeof buscarOSPedidos>> = []
    let pagina = 1
    let continuar = true

    while (continuar) {
      const resultado = await buscarOSPedidos(credentials, tipoPeriodo, dtIni, dtFim, String(pagina))
      if (resultado && resultado.length > 0) {
        
        // Se estamos buscando uma OS específica, paramos logo que encontrá-la
        if (numeroOS) {
          const found = resultado.find(os => String(os.venda_Numero) === String(numeroOS))
          if (found) {
            allOS = [found]
            break
          }
        }

        allOS = [...allOS, ...resultado]
        pagina++
        // Se retornou menos de 50, é a última página
        if (resultado.length < 50) continuar = false
      } else {
        continuar = false
      }
    }

    // Garante que só retorne a OS buscada, caso tenha percorrido tudo e achado no meio
    if (numeroOS) {
      allOS = allOS.filter(os => String(os.venda_Numero) === String(numeroOS))
    }

    // === LOG DE DIAGNÓSTICO REMOVIDO PARA MELHORAR PERFORMANCE ===
    const codigosProdutos = new Set<string>()
    const descricoesProdutos = new Map<string, string>() // Para a busca na Brasil API
    allOS.forEach(os => {
      os.produtos?.forEach(p => {
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
    
    // Lotes de 20 para evitar timeouts e sobrecarga
    for (let i = 0; i < codigosArray.length; i += 20) {
      const chunk = codigosArray.slice(i, i + 20)
      const promessas = chunk.map(async (codigo) => {
        try {
          const res = await buscarProdutos(credentials, codigo)
          if (res && res.length > 0) {
            const match = res.find(p => p.codigo?.trim() === codigo)
            if (match) produtosMetadata.set(codigo, match)
          }
        } catch (e) {
          console.warn(`Erro ao buscar metadados do produto ${codigo} no Datacar:`, e)
        }
      })
      await Promise.all(promessas)
    }

    // --- INTELIGÊNCIA FISCAL ROBUSTA (CÓDIGO EXATO + FAMÍLIA + CORRELAÇÃO CEST + DICIONÁRIO PADRÃO) ---
    const mapaExata: Record<string, any> = {}
    const mapaFamilia: Record<string, any> = {}
    const ncmParaCest = new Map<string, string>()

    // Função de auxílio padrão para sugerir CEST
    const sugerirCestPadrao = (ncmStr?: string | null): string => {
      if (!ncmStr) return ''
      const limpo = ncmStr.replace(/\D/g, '').trim()
      const cap4 = limpo.slice(0, 4)
      const mapa: Record<string, string> = {
        '4011': '1600100', '4012': '1600100', '4013': '1600200', '8708': '0107500',
        '8421': '0101700', '8413': '0103200', '6813': '0100700', '8482': '0102500',
        '8483': '0102600', '8511': '0104300', '8512': '0104700', '7320': '0101100',
        '7326': '1006200', '4016': '0100900', '4010': '0100600', '8544': '0107300',
        '3917': '0100200', '3926': '1002000', '3208': '2400100', '2710': '0600100',
        '3819': '0600400', '3820': '0600500', '3824': '1600100',
      }
      return mapa[cap4] || ''
    }

    try {
      // 1. Carrega a base geral compartilhada (fallback)
      const { data: todasFamilias } = await supabaseAdmin
        .from('memoria_fiscal_familia')
        .select('*')
        .limit(3000)

      if (todasFamilias) {
        for (const item of todasFamilias) {
          if (item.palavra_chave) {
            const k = item.palavra_chave.toUpperCase().trim()
            mapaFamilia[k] = item
          }
          if (item.ncm && item.cest) {
            ncmParaCest.set(item.ncm.replace(/\D/g, ''), item.cest.replace(/\D/g, ''))
          }
        }
      }

      if (codigosProdutos.size > 0) {
        const listaCodigos = Array.from(codigosProdutos).map(c => c.toUpperCase().trim())
        const { data: todosCodigos } = await supabaseAdmin
          .from('memoria_fiscal')
          .select('*')
          .in('codigo', listaCodigos)

        if (todosCodigos) {
          for (const item of todosCodigos) {
            if (item.codigo) mapaExata[item.codigo.toUpperCase().trim()] = item
            if (item.ncm && item.cest) {
              ncmParaCest.set(item.ncm.replace(/\D/g, ''), item.cest.replace(/\D/g, ''))
            }
          }
        }
      }

      // 2. Sobrescreve com as regras específicas da empresa atual (prioridade máxima)
      const { data: dataFamiliaEmpresa } = await supabaseAdmin
        .from('memoria_fiscal_familia')
        .select('*')
        .eq('empresa_id', empresa_id)

      if (dataFamiliaEmpresa) {
        for (const item of dataFamiliaEmpresa) {
          if (item.palavra_chave) {
            const k = item.palavra_chave.toUpperCase().trim()
            mapaFamilia[k] = item
          }
          if (item.ncm && item.cest) {
            ncmParaCest.set(item.ncm.replace(/\D/g, ''), item.cest.replace(/\D/g, ''))
          }
        }
      }

      if (codigosProdutos.size > 0) {
        const listaCodigos = Array.from(codigosProdutos).map(c => c.toUpperCase().trim())
        const { data: dataExataEmpresa } = await supabaseAdmin
          .from('memoria_fiscal')
          .select('*')
          .eq('empresa_id', empresa_id)
          .in('codigo', listaCodigos)

        if (dataExataEmpresa) {
          for (const item of dataExataEmpresa) {
            if (item.codigo) mapaExata[item.codigo.toUpperCase().trim()] = item
            if (item.ncm && item.cest) {
              ncmParaCest.set(item.ncm.replace(/\D/g, ''), item.cest.replace(/\D/g, ''))
            }
          }
        }
      }
    } catch (e) {
      console.warn('Erro ao carregar base de memória fiscal:', e)
    }

    const inteligenciaFiscal = new Map<string, any>()
    for (const codigo of Array.from(codigosProdutos)) {
      const codLimpo = codigo.toUpperCase().trim()
      const descricao = descricoesProdutos.get(codigo) || ''
      const descNorm = descricao.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
      const palavras = descNorm.split(/[\s/,;()-]+/).filter(Boolean)

      let ncm = null
      let cest = null
      let tipo = '00 - Merc. para Revenda'
      let origem = '0 - Nacional'
      let unidade = 'UN'

      // 1. Busca por código exato na memória fiscal
      if (mapaExata[codLimpo]) {
        const mem = mapaExata[codLimpo]
        ncm = mem.ncm ? mem.ncm.replace(/\D/g, '') : null
        cest = mem.cest ? mem.cest.replace(/\D/g, '') : null
        if (mem.tipo_produto) tipo = mem.tipo_produto
        if (mem.origem) origem = mem.origem
        if (mem.unidade_medida) unidade = mem.unidade_medida
      }

      // 2. Se não achou por código, busca por família/prefixo da descrição
      if (!ncm) {
        let matchFamilia = null
        for (let i = palavras.length; i > 0; i--) {
          const prefixo = palavras.slice(0, i).join(' ')
          if (mapaFamilia[prefixo]) {
            matchFamilia = mapaFamilia[prefixo]
            break
          }
        }

        if (!matchFamilia && palavras.length > 0) {
          const prim = palavras[0]
          if (mapaFamilia[prim]) {
            matchFamilia = mapaFamilia[prim]
          }
        }

        if (matchFamilia) {
          ncm = matchFamilia.ncm ? matchFamilia.ncm.replace(/\D/g, '') : null
          cest = matchFamilia.cest ? matchFamilia.cest.replace(/\D/g, '') : null
          if (matchFamilia.tipo_produto) tipo = matchFamilia.tipo_produto
          if (matchFamilia.origem) origem = matchFamilia.origem
          if (matchFamilia.unidade_medida) unidade = matchFamilia.unidade_medida
        }
      }

      // 3. Se ainda não achou, consulta metadados vindos da API do Datacar
      const metadados = produtosMetadata.get(codigo)
      if (!ncm && metadados?.ncm) ncm = metadados.ncm.replace(/\D/g, '')
      if (!cest && metadados?.cest) cest = metadados.cest.replace(/\D/g, '')
      if (metadados?.origem) origem = metadados.origem
      if (metadados?.unidade_medida) unidade = metadados.unidade_medida

      // 4. Se tem NCM mas não tem CEST, resolve automaticamente
      if (ncm && !cest) {
        const ncmLimpo = ncm.replace(/\D/g, '')
        cest = ncmParaCest.get(ncmLimpo) || sugerirCestPadrao(ncmLimpo) || null
      }

      inteligenciaFiscal.set(codigo, { ncm, cest, tipo, origem, unidade })
    }

    // --- INTELIGÊNCIA DE CLIENTES (BRASIL API) ---
    const cpfsCnpjsUnicos = new Set<string>()
    const cepsUnicos = new Set<string>()

    allOS.forEach(os => {
      if (os.cliente_Cpf_Cnpj) cpfsCnpjsUnicos.add(os.cliente_Cpf_Cnpj.replace(/\D/g, ''))
      const cep = os.end_Cep || os.cliente_Cep || os.cliente_CEP
      if (cep) cepsUnicos.add(cep.replace(/\D/g, ''))
    })

    const dadosCnpjMap = new Map<string, any>()
    const dadosCepMap = new Map<string, any>()

    const cnpjsArray = Array.from(cpfsCnpjsUnicos).filter(c => c.length === 14)
    for (let i = 0; i < cnpjsArray.length; i += 20) {
      const chunk = cnpjsArray.slice(i, i + 20)
      await Promise.all(chunk.map(async (cnpj) => {
        const dados = await buscarCnpj(cnpj)
        if (dados) dadosCnpjMap.set(cnpj, dados)
      }))
    }

    const cepsArray = Array.from(cepsUnicos).filter(c => c.length === 8)
    for (let i = 0; i < cepsArray.length; i += 20) {
      const chunk = cepsArray.slice(i, i + 20)
      await Promise.all(chunk.map(async (cep) => {
        const dados = await buscarCep(cep)
        if (dados) dadosCepMap.set(cep, dados)
      }))
    }

    const dados = await Promise.all(allOS.map(async (os) => {
      let situacao: 'em_andamento' | 'concluida' | 'encerrada' | 'cancelada' = 'em_andamento'
      if (os.venda_DtCancelamento) situacao = 'cancelada'
      else if (os.venda_DtEncerramento) situacao = 'encerrada'
      else if (os.venda_DtConclusao) situacao = 'concluida'
      
      const cliente = os.cliente_Nome?.trim() || os.cliente_RazaoSocial?.trim() || 'Cliente não informado'
      const cliente_cpf_cnpj = os.cliente_Cpf_Cnpj || null
      
      const cnpjLimpo = cliente_cpf_cnpj ? cliente_cpf_cnpj.replace(/\D/g, '') : ''
      const dadosCnpjEncontrados = cnpjLimpo.length === 14 ? dadosCnpjMap.get(cnpjLimpo) : null

      const osNumero = String(os.venda_Numero || '')
      const dataVenda = os.venda_DtEncerramento || os.venda_DtConclusao || os.venda_DtCriacao || ''

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

      const totalProdutos = itens.filter(i => i.tipo === 'produto').reduce((sum, i) => sum + i.valor_total, 0)
      const totalServicos = itens.filter(i => i.tipo === 'servico').reduce((sum, i) => sum + i.valor_total, 0)
      const valorTotal = parseFloat((totalProdutos + totalServicos).toFixed(2))

      // Calcular o desconto total da venda
      const descontoTotal = itens.reduce((sum, i) => sum + ((i.desconto || 0) * i.quantidade), 0)
      const descontoTotalFormatado = parseFloat(descontoTotal.toFixed(2))

      // Lógica para obter a forma de pagamento enriquecida dos recebimentos
      let formaPagamento = os.venda_Parcelamento || undefined
      if (os.recebimentos && Array.isArray(os.recebimentos) && os.recebimentos.length > 0) {
        const formasUnicas = Array.from(new Set(os.recebimentos.map((r: any) => r.forma).filter(Boolean))) as string[]
        if (formasUnicas.length > 0) {
          const formasTexto = formasUnicas.join(', ')
          const qtParcelas = Number(os.venda_qtParcelas || 1)
          if (qtParcelas > 1 && !formasTexto.toLowerCase().includes('parcela') && !formasTexto.toLowerCase().includes(' x')) {
            formaPagamento = `${formasTexto} (${qtParcelas}x)`
          } else {
            formaPagamento = formasTexto
          }
        }
      }

      const enderecoBase: EnderecoDatacar = {
        logradouro: os.end_Rua || os.cliente_Logradouro || os.cliente_Endereco || null,
        numero: os.end_Numero || os.cliente_Numero || null,
        complemento: os.end_Complemento || os.cliente_Complemento || null,
        bairro: os.end_Bairro || os.cliente_Bairro || null,
        cidade: os.end_Cidade || os.cliente_Cidade || os.cliente_Municipio || null,
        estado: os.end_Uf || os.cliente_Uf || os.cliente_Estado || os.cliente_UF || null,
        cep: os.end_Cep || os.cliente_Cep || os.cliente_CEP || null,
      }

      if (enderecoBase.cep && enderecoBase.cep.length >= 8) {
        const cepLimpo = enderecoBase.cep.replace(/\D/g, '')
        const dadosCep = dadosCepMap.get(cepLimpo)
        if (dadosCep) {
          enderecoBase.logradouro = dadosCep.street || enderecoBase.logradouro
          enderecoBase.bairro = dadosCep.neighborhood || enderecoBase.bairro
          enderecoBase.cidade = dadosCep.city || enderecoBase.cidade
          enderecoBase.estado = dadosCep.state || enderecoBase.estado
        }
      }
      
      if (dadosCnpjEncontrados) {
        enderecoBase.logradouro = dadosCnpjEncontrados.logradouro || enderecoBase.logradouro
        enderecoBase.numero = dadosCnpjEncontrados.numero || enderecoBase.numero
        enderecoBase.complemento = dadosCnpjEncontrados.complemento || enderecoBase.complemento
        enderecoBase.bairro = dadosCnpjEncontrados.bairro || enderecoBase.bairro
        enderecoBase.cidade = dadosCnpjEncontrados.municipio || enderecoBase.cidade
        enderecoBase.estado = dadosCnpjEncontrados.uf || enderecoBase.estado
        enderecoBase.cep = dadosCnpjEncontrados.cep || enderecoBase.cep
      }

      return {
        cliente,
        cliente_cpf_cnpj: os.cliente_Cpf_Cnpj || null,
        cliente_endereco: enderecoBase,
        os_numero: osNumero,
        data_venda: dataVenda,
        valor_total: valorTotal,
        desconto_total: descontoTotalFormatado,
        forma_pagamento: formaPagamento,
        situacao,
        itens,
        valido: !!cliente && valorTotal > 0,
        erros: [
          !cliente ? 'Cliente não informado' : null,
          valorTotal <= 0 ? `Valor total zerado (Produtos: ${totalProdutos}, Serviços: ${totalServicos})` : null,
        ].filter(Boolean) as string[],
        _datacar: {
          venda_Id: os.venda_Id,
          empresa_sigla: os.empresa_sigla,
          vendedor: os.vendedor_Nome,
          veiculo: os.veiculo_Placa ? `${os.veiculo_Marca || ''} ${os.veiculo_Modelo || ''} - ${os.veiculo_Placa}`.trim() : null,
          cliente_cpf_cnpj: os.cliente_Cpf_Cnpj,
          cliente_logradouro: os.end_Rua || os.cliente_Logradouro || os.cliente_Endereco || null,
          cliente_numero: os.end_Numero || os.cliente_Numero || null,
          cliente_complemento: os.end_Complemento || os.cliente_Complemento || null,
          cliente_bairro: os.end_Bairro || os.cliente_Bairro || null,
          cliente_cidade: os.end_Cidade || os.cliente_Cidade || os.cliente_Municipio || null,
          cliente_uf: os.end_Uf || os.cliente_Uf || os.cliente_Estado || os.cliente_UF || null,
          cliente_cep: os.end_Cep || os.cliente_Cep || os.cliente_CEP || null,
          raw: os
        }
      }
    }))

    const dadosFiltrados = dados.filter(d => situacao === 'todas' || d.situacao === situacao)

    // --- DETECÇÃO DE DUPLICIDADE NO CONTA AZUL ---
    try {
      const { accessToken: caToken } = await getValidToken(empresa_id, 'vendas')

      let dtIniISO = dtIni
      let dtFimISO = dtFim
      if (dtIni.includes('/')) {
        const [d, m, y] = dtIni.split('/')
        dtIniISO = `${y}-${m}-${d}`
      }
      if (dtFim.includes('/')) {
        const [d, m, y] = dtFim.split('/')
        dtFimISO = `${y}-${m}-${d}`
      }

      const vendasCA = await buscarVendasContaAzul(caToken, dtIniISO, dtFimISO)
      console.log(`[duplicidade] Encontradas ${vendasCA.length} vendas no CA para o período ${dtIniISO} a ${dtFimISO}`)

      if (vendasCA.length > 0) {
        const vendasCAMap = new Map<string, { id: string; valor: number }[]>()
        for (const vc of vendasCA) {
          const docRaw = (vc as any).documento_cliente || vc.cliente?.documento || (vc.cliente as any)?.cpf_cnpj || ''
          const cpfCnpj = docRaw.replace(/\D/g, '')
          const dataVenda = vc.data_venda?.split('T')[0] || ''
          const valor = Math.round(((vc as any).valor_composicao?.valor_liquido || vc.valor_total || 0) * 100)
          if (cpfCnpj && dataVenda) {
            const chave = `${cpfCnpj}_${dataVenda}_${valor}`
            if (!vendasCAMap.has(chave)) vendasCAMap.set(chave, [])
            vendasCAMap.get(chave)!.push({ id: vc.id, valor })
          }
        }

        const vendasComNfe: string[] = []
        for (const venda of dadosFiltrados) {
          const cpfCnpj = (venda as any).cliente_cpf_cnpj?.replace(/\D/g, '') || ''
          let dataVendaISO = venda.data_venda?.split('T')[0]?.split(' ')[0] || ''
          if (dataVendaISO.includes('/')) {
            const [d, m, y] = dataVendaISO.split('/')
            dataVendaISO = `${y}-${m}-${d}`
          }
          const valor = Math.round((venda.valor_total || 0) * 100)

          if (cpfCnpj && dataVendaISO) {
            const chave = `${cpfCnpj}_${dataVendaISO}_${valor}`
            const match = vendasCAMap.get(chave)
            if (match && match.length > 0) {
              ;(venda as any).ca_status = 'enviado_sem_nota'
              ;(venda as any)._ca_venda_id = match[0].id
              vendasComNfe.push(match[0].id)
            }
          }
        }

        for (let i = 0; i < vendasComNfe.length; i += 10) {
          const chunk = vendasComNfe.slice(i, i + 10)
          const resultados = await Promise.all(
            chunk.map(vendaId => verificarNfeEmitidaDaVenda(caToken, vendaId))
          )
          for (let j = 0; j < chunk.length; j++) {
            if (resultados[j].temNfe) {
              const vendaEncontrada = dadosFiltrados.find((v: any) => v._ca_venda_id === chunk[j])
              if (vendaEncontrada) {
                ;(vendaEncontrada as any).ca_status = 'enviado_com_nota'
                ;(vendaEncontrada as any).ca_nfe_numero = resultados[j].numeroNota || null
              }
            }
          }
        }
      }

      // --- DETECÇÃO DE CLIENTE COM CADASTRO OU VENDAS ANTERIORES NO CA ---
      const cpfsCnpjsParaVerificar = Array.from(new Set(
        dadosFiltrados
          .filter((d: any) => !d.ca_status)
          .map((d: any) => d.cliente_cpf_cnpj?.replace(/\D/g, ''))
          .filter(Boolean)
      )) as string[]

      if (cpfsCnpjsParaVerificar.length > 0) {
        const clientesExistentesCA = new Set<string>()
        const urlBaseCA = 'https://api-v2.contaazul.com/v1/venda/busca'
        
        for (let i = 0; i < cpfsCnpjsParaVerificar.length; i += 10) {
          const chunk = cpfsCnpjsParaVerificar.slice(i, i + 10)
          await Promise.all(chunk.map(async (doc) => {
            try {
              // 1. Busca no cadastro de clientes/pessoas do CA e nas vendas
              const urlPessoas = `https://api-v2.contaazul.com/v1/pessoas?cpf_cnpj=${doc}&pagina=1&tamanho_pagina=1`
              const urlVendas = `${urlBaseCA}?termo_busca=${doc}&tamanho_pagina=1`
              
              const [resPessoas, resVendas] = await Promise.all([
                fetch(urlPessoas, { headers: { 'Authorization': `Bearer ${caToken}` } }).catch(() => null),
                fetch(urlVendas, { headers: { 'Authorization': `Bearer ${caToken}` } }).catch(() => null)
              ])
              
              let existe = false

              if (resPessoas && resPessoas.ok) {
                const dataP = await resPessoas.json()
                const listaP = dataP.itens || dataP.items || dataP.content || dataP.data || (Array.isArray(dataP) ? dataP : [])
                if (listaP.length > 0) {
                  const match = listaP.find((p: any) => {
                    const pDoc = (p.cpf || p.cnpj || p.documento || p.cpf_cnpj || '').replace(/\D/g, '')
                    return pDoc === doc
                  })
                  if (match || listaP.length > 0) existe = true
                }
              }

              if (!existe && resVendas && resVendas.ok) {
                const dataV = await resVendas.json()
                const listaV = dataV.itens || dataV.items || dataV.content || dataV.data || (Array.isArray(dataV) ? dataV : [])
                if (listaV.length > 0) {
                  const matchV = listaV.find((v: any) => {
                    const pDoc = (v.documento_cliente || v.cliente?.documento || '').replace(/\D/g, '')
                    return pDoc === doc || pDoc.includes(doc) || doc.includes(pDoc)
                  })
                  if (matchV || listaV.length > 0) existe = true
                }
              }

              if (existe) {
                console.log(`[duplicidade-cliente] Cliente identificado com cadastro/venda no CA para CPF/CNPJ ${doc}`)
                clientesExistentesCA.add(doc)
              }
            } catch (err) {
              console.warn(`[duplicidade-cliente] Erro ao buscar vendas/cliente ${doc} no CA:`, err)
            }
          }))
        }
        
        for (const venda of dadosFiltrados) {
          if (!(venda as any).ca_status) {
            const doc = (venda as any).cliente_cpf_cnpj?.replace(/\D/g, '') || ''
            if (clientesExistentesCA.has(doc)) {
              ;(venda as any).ca_status = 'cliente_existente'
            }
          }
        }
      }

    } catch (caErr) {
      console.log('[duplicidade] Não foi possível verificar duplicidade no CA (pode não estar conectado):', (caErr as any)?.message || caErr)
    }

    const validos = dadosFiltrados.filter(d => d.valido).length
    const invalidos = dadosFiltrados.filter(d => !d.valido).length

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
