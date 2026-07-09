/**
 * Cliente da API do Conta Azul - NOVA API v2
 * Documentação: https://developers.contaazul.com/
 * Base URL: https://api-v2.contaazul.com/v1/
 * Auth URL: https://auth.contaazul.com/oauth2/
 *
 * ATENÇÃO: A API legada foi desligada em Out/2025. Este client usa a nova API v2.
 */

const BASE_URL = 'https://api-v2.contaazul.com/v1'
const AUTH_URL = 'https://auth.contaazul.com/oauth2/token'
const AUTHORIZE_URL = 'https://auth.contaazul.com/login'

export interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
}

export interface ContaFinanceira {
  id: string
  descricao: string
  tipo?: string
}

export interface ContatoCA {
  id: string
  nome: string
}

export interface ContaPagarPayload {
  data_competencia: string
  valor: number
  observacao?: string
  descricao: string
  contato?: string
  conta_financeira?: string
  condicao_pagamento: {
    parcelas: Array<{
      descricao: string
      data_vencimento: string
      nota?: string
      detalhe_valor: {
        valor_bruto: number
        valor_liquido: number
        multa?: number
        juros?: number
        desconto?: number
        taxa?: number
      }
    }>
  }
  rateio: Array<{
    id_categoria?: string
    categoria_id?: string
    valor?: number
    value?: number
  }>
}

export interface ContaPagarResponse {
  protocolId: string
  status: 'PENDING' | 'SUCCESS' | 'ERROR'
  createdAt: string
}

export async function getTokenComCodigo(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string
): Promise<TokenResponse> {
  const credenciais = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const res = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${credenciais}` },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
  })
  if (!res.ok) { const err = await res.text(); throw new Error(`Erro ao obter token: ${res.status} - ${err}`) }
  return res.json()
}

export async function refreshToken(
  refreshTokenStr: string,
  clientId: string,
  clientSecret: string
): Promise<TokenResponse> {
  const credenciais = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const res = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${credenciais}` },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshTokenStr }),
  })
  if (!res.ok) { const err = await res.text(); throw new Error(`Erro ao renovar token: ${res.status} - ${err}`) }
  return res.json()
}

export async function listarContasFinanceiras(accessToken: string): Promise<ContaFinanceira[]> {
  const todasContas = new Map<string, ContaFinanceira>()
  const endpoints = [
    `${BASE_URL}/conta-financeira?pagina=1&tamanho_pagina=100`,
    `${BASE_URL}/financeiro/conta-financeira?pagina=1&tamanho_pagina=100`,
    `${BASE_URL}/contas-financeiras?pagina=1&tamanho_pagina=100`,
    `${BASE_URL}/financeiro/contas-financeiras?pagina=1&tamanho_pagina=100`,
  ]
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, { headers: { 'Authorization': `Bearer ${accessToken}` } })
      if (!res.ok) {
        if (res.status === 401) throw new Error('TOKEN_EXPIRADO')
        continue
      }
      const data = await res.json()
      const listaRaw = data.itens || data.items || data.content || data.data || (Array.isArray(data) ? data : [])
      for (const item of listaRaw) {
        const id = item.id || item.uuid || item.bankAccountId || item.guid
        if (id && !todasContas.has(id)) {
          todasContas.set(id, { id, descricao: item.descricao || item.nome || item.name || item.description || 'Conta Sem Nome', tipo: item.tipo || item.type })
        }
      }
    } catch (e: any) { 
      if (e.message === 'TOKEN_EXPIRADO') throw e;
      console.warn(`[contas-financeiras] erro em ${endpoint}:`, e) 
    }
  }
  return Array.from(todasContas.values())
}

export async function listarCategorias(accessToken: string): Promise<Array<{ id: string; nome: string }>> {
  const todasCategoriasEncontradas = new Map<string, { id: string; nome: string; tipo?: string }>()
  const endpoints = [
    `${BASE_URL}/categorias?tipo=DESPESA&permite_apenas_filhos=true`,
    `${BASE_URL}/categorias?permite_apenas_filhos=true`,
    `${BASE_URL}/categorias?tipo=DESPESA&permite_apenas_filhos=false`,
    `${BASE_URL}/categorias?permite_apenas_filhos=false`,
    `${BASE_URL}/categorias`,
    `${BASE_URL}/financeiro/categorias`,
  ]
  const errosDaApi: string[] = []
  
  for (const endpoint of endpoints) {
    try {
      for (let page = 1; page <= 10; page++) {
        const sep = endpoint.includes('?') ? '&' : '?'
        const urlComPagina = `${endpoint}${sep}pagina=${page}&tamanho_pagina=100`
        const res = await fetch(urlComPagina, { headers: { 'Authorization': `Bearer ${accessToken}` } })
        
        if (!res.ok) {
          if (res.status === 401) throw new Error('TOKEN_EXPIRADO')
          const errText = await res.text()
          errosDaApi.push(`[${endpoint}] ${res.status}: ${errText}`)
          break // Falhou, tenta o próximo endpoint
        }
        
        const data = await res.json()
        let listaRaw: any[] = []
        if (data.itens && Array.isArray(data.itens)) listaRaw = data.itens
        else if (Array.isArray(data)) listaRaw = data
        else if (data.content && Array.isArray(data.content)) listaRaw = data.content
        else if (data.items && Array.isArray(data.items)) listaRaw = data.items
        else if (data.data && Array.isArray(data.data)) listaRaw = data.data
        
        if (listaRaw.length === 0) break
        
        const achatarCategorias = (itens: any[]): any[] => {
          let resultado: any[] = []
          for (const item of itens) {
            resultado.push({ id: item.id || item.uuid || item.categoryId || item.guid, nome: item.nome || item.name || item.descricao || item.description || 'Categoria', tipo: item.tipo || item.type })
            const filhos = item.children || item.sub_categories || item.subcategorias || item.itens || item.items || item.nodes
            if (filhos && Array.isArray(filhos) && filhos.length > 0) resultado = resultado.concat(achatarCategorias(filhos))
          }
          return resultado
        }
        
        const achatadas = achatarCategorias(listaRaw)
        for (const cat of achatadas) {
          if (cat.id && !todasCategoriasEncontradas.has(cat.id)) {
            const ehReceita = cat.tipo === 'RECEITA' || cat.tipo === 'REVENUE' || cat.tipo === 'INCOME'
            if (!ehReceita) todasCategoriasEncontradas.set(cat.id, cat)
          }
        }
        
        if (listaRaw.length < 100) break
      }
    } catch (e: any) { 
      if (e.message === 'TOKEN_EXPIRADO') throw e;
      errosDaApi.push(`[${endpoint}] Falha no fetch: ${e.message}`)
    }
  }
  
  const resultadoFinal = Array.from(todasCategoriasEncontradas.values())
  console.log(`[categorias] Total carregado: ${resultadoFinal.length}`)
  
  if (resultadoFinal.length === 0) {
    throw new Error(`Nenhuma categoria no Conta Azul. Detalhes da API: ${errosDaApi.join(' | ')}`)
  }
  
  return resultadoFinal
}

/**
 * Busca ou cria um Fornecedor no Conta Azul.
 * Prioriza busca por CPF/CNPJ para evitar duplicatas.
 */
export async function buscarOuCriarContato(
  accessToken: string,
  nome: string,
  cpfCnpj?: string | null
): Promise<string | undefined> {
  const docLimpo = cpfCnpj ? cpfCnpj.replace(/\D/g, '') : ''
  const tipoPessoa = docLimpo.length === 14 ? 'Jurídica' : 'Física'

  try {
    // 1. Busca por CPF/CNPJ se disponível (mais preciso)
    if (docLimpo) {
      const urlDoc = `${BASE_URL}/pessoas?pagina=1&tamanho_pagina=10&cpf_cnpj=${docLimpo}&tipo_perfil=Fornecedor`
      try {
        const busca = await fetch(urlDoc, { headers: { 'Authorization': `Bearer ${accessToken}` } })
        if (busca.ok) {
          const data = await busca.json()
          const lista: any[] = data.itens || data.items || data.content || data.data || (Array.isArray(data) ? data : [])
          if (lista.length > 0) {
            const matchDoc = lista.find(p => {
              const pDoc = (p.cpf || p.cnpj || p.documento || '').replace(/\D/g, '')
              return pDoc === docLimpo
            })
            if (matchDoc) return matchDoc.id || matchDoc.uuid
          }
        }
      } catch (e) { console.warn('[fornecedor] erro na busca por doc:', e) }
    }

    // 2. Busca por nome
    const endpointsBusca = [
      `${BASE_URL}/pessoas?pagina=1&tamanho_pagina=100&busca=${encodeURIComponent(nome)}&tipo_perfil=Fornecedor`,
      `${BASE_URL}/pessoas?pagina=1&tamanho_pagina=100&busca=${encodeURIComponent(nome)}`,
    ]
    for (const url of endpointsBusca) {
      try {
        const busca = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } })
        if (busca.ok) {
          const data = await busca.json()
          const lista: any[] = data.itens || data.items || data.content || data.data || (Array.isArray(data) ? data : [])
          if (lista.length > 0) {
            const nomeBusca = nome.toLowerCase().trim()
            const matchExato = lista.find(p => (p.nome || p.name || '').toLowerCase().trim() === nomeBusca)
            if (matchExato) return matchExato.id || matchExato.uuid
          }
        }
      } catch (e) { console.warn(`[fornecedor] erro na busca em ${url}:`, e) }
    }

    // 3. Criar como Fornecedor
    const bodyFornecedor: Record<string, unknown> = {
      nome,
      tipo_pessoa: tipoPessoa,
      perfis: [{ tipo_perfil: 'Fornecedor' }],
      ativo: true,
    }
    if (docLimpo) {
      if (tipoPessoa === 'Jurídica') bodyFornecedor.cnpj = docLimpo
      else bodyFornecedor.cpf = docLimpo
    }
    const criar = await fetch(`${BASE_URL}/pessoas`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyFornecedor),
    })
    if (criar.ok) { const novo: any = await criar.json(); return novo.id }
    // Fallback legado
    const criarLegado = await fetch(`${BASE_URL}/contatos`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, tipo_pessoa: tipoPessoa === 'Jurídica' ? 'PJ' : 'PF', ativo: true }),
    })
    if (criarLegado.ok) { const novo: any = await criarLegado.json(); return novo.id }
    const errText = await criar.text()
    throw new Error(`Erro ao criar contato '${nome}': ${criar.status} - ${errText}`)
  } catch (e: any) { console.error(`[buscarOuCriarContato] erro:`, e); throw e }
}

export async function criarContaPagar(accessToken: string, payload: ContaPagarPayload): Promise<ContaPagarResponse> {
  const res = await fetch(`${BASE_URL}/financeiro/eventos-financeiros/contas-a-pagar`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (res.status === 401) throw new Error('TOKEN_EXPIRADO')
  if (!res.ok) { const errBody = await res.text(); throw new Error(`[${res.status}] ${errBody}`) }
  return res.json()
}

export function getUrlAutorizacao(clientId: string, redirectUri: string, state?: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'openid profile aws.cognito.signin.user.admin',
    ...(state ? { state } : {}),
  })
  return `${AUTHORIZE_URL}?${params}`
}

export async function listarFornecedores(accessToken: string): Promise<Array<{ id: string; nome: string; documento: string }>> {
  const todosFornecedoresEncontrados = new Map<string, { id: string; nome: string; documento: string }>()
  const errosDaApi: string[] = []
  
  // Como as APIs da CA podem mudar ou falhar com parâmetros específicos, vamos tentar listar todos
  // e tratar a extração de CNPJ/CPF da resposta.
  // A request na documentação sugere: /v1/pessoas?tipo_perfil=Fornecedor
  const endpoints = [
    `${BASE_URL}/pessoas?tipo_perfil=Fornecedor`,
    `${BASE_URL}/v1/pessoas?tipo_perfil=Fornecedor`
  ]

  for (const endpoint of endpoints) {
    try {
      // Loop de paginação
      for (let page = 1; page <= 50; page++) {
        const sep = endpoint.includes('?') ? '&' : '?'
        const urlComPagina = `${endpoint}${sep}pagina=${page}&tamanho_pagina=100`
        const res = await fetch(urlComPagina, { headers: { 'Authorization': `Bearer ${accessToken}` } })
        
        if (!res.ok) {
          if (res.status === 401) throw new Error('TOKEN_EXPIRADO')
          const errText = await res.text()
          errosDaApi.push(`[${endpoint}] ${res.status}: ${errText}`)
          break // Falhou, tenta o próximo endpoint
        }
        
        const data = await res.json()
        let listaRaw: any[] = []
        if (data.itens && Array.isArray(data.itens)) listaRaw = data.itens
        else if (data.items && Array.isArray(data.items)) listaRaw = data.items
        else if (Array.isArray(data)) listaRaw = data
        else if (data.content && Array.isArray(data.content)) listaRaw = data.content
        else if (data.data && Array.isArray(data.data)) listaRaw = data.data
        
        if (listaRaw.length === 0) break
        
        for (const item of listaRaw) {
          const id = item.id || item.uuid || item.guid
          const nome = item.nome || item.name || item.nome_fantasia || ''
          const documentoRaw = item.cnpj || item.cpf || item.documento || ''
          const documento = documentoRaw.replace(/\D/g, '')

          if (id && nome && !todosFornecedoresEncontrados.has(id)) {
            todosFornecedoresEncontrados.set(id, { id, nome, documento })
          }
        }
        
        if (listaRaw.length < 100) break // Última página
      }
      
      // Se já achou fornecedores em um endpoint, não precisa tentar o próximo
      if (todosFornecedoresEncontrados.size > 0) break
    } catch (e: any) { 
      if (e.message === 'TOKEN_EXPIRADO') throw e;
      errosDaApi.push(`[${endpoint}] Falha no fetch: ${e.message}`)
    }
  }
  
  const resultadoFinal = Array.from(todosFornecedoresEncontrados.values())
  console.log(`[fornecedores] Total carregado via sincronização: ${resultadoFinal.length}`)
  
  if (resultadoFinal.length === 0 && errosDaApi.length > 0) {
    console.warn(`Nenhum fornecedor encontrado no Conta Azul. Detalhes da API: ${errosDaApi.join(' | ')}`)
  }
  
  return resultadoFinal
}

export interface VendaPayload {
  id_cliente: string
  numero?: number
  situacao: 'EM_ANDAMENTO' | 'APROVADO'
  data_venda: string
  id_categoria?: string
  id_centro_custo?: string
  id_vendedor?: string
  observacoes?: string
  observacoes_pagamento?: string
  itens: Array<{
    descricao: string
    quantidade: number
    valor: number
    id?: string // uuid do produto
    valor_custo?: number
  }>
  composicao_de_valor?: {
    frete?: number
    desconto?: {
      tipo: 'PORCENTAGEM' | 'VALOR'
      valor: number
    }
  }
  condicao_pagamento: {
    tipo_pagamento: string
    id_conta_financeira?: string
    opcao_condicao_pagamento: string
    nsu?: string
    parcelas: Array<{
      data_vencimento: string
      valor: number
      descricao?: string
    }>
  }
}

export async function criarVenda(accessToken: string, payload: VendaPayload): Promise<{ id: string, id_legado: number }> {
  // Busca o próximo número de venda para não haver conflito se não informarmos
  if (!payload.numero) {
    try {
      const proximo = await fetch(`${BASE_URL}/venda/proximo-numero`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })
      if (proximo.ok) {
        payload.numero = Number(await proximo.text())
      }
    } catch (e) {
      console.warn('Erro ao obter proximo numero de venda', e)
    }
  }

  const res = await fetch(`${BASE_URL}/venda`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (res.status === 401) throw new Error('TOKEN_EXPIRADO')
  if (!res.ok) { const errBody = await res.text(); throw new Error(`[${res.status}] ${errBody}`) }
  return res.json()
}

export async function buscarOuCriarProduto(
  accessToken: string,
  codigo: string,
  descricao: string,
  valor: number,
  metadata?: { ncm?: string, origem?: string, unidade_medida?: string, cest?: string }
): Promise<string | undefined> {
  // Tenta buscar o produto pelo código ou descrição
  const urlBusca = `${BASE_URL}/produtos?termo_busca=${encodeURIComponent(codigo || descricao)}&tamanho_pagina=100`
  try {
    const busca = await fetch(urlBusca, { headers: { 'Authorization': `Bearer ${accessToken}` } })
    if (busca.ok) {
      const data = await busca.json()
      const lista: any[] = data.itens || data.items || (Array.isArray(data) ? data : [])
      
      let match = null
      if (codigo) {
        // Se temos código, buscar exatamente pelo código (SKU) - Prioridade máxima
        const codigoTrim = codigo.trim()
        match = lista.find(p => p.codigo?.trim() === codigoTrim)
      }
      
      if (!match) {
        // Fallback para nome exato caso o código não tenha encontrado (ou não exista código)
        const searchName = (descricao || '').toLowerCase().trim()
        match = lista.find(p => (p.nome || p.name || '').toLowerCase().trim() === searchName)
      }
      
      if (match) {
        return match.id || match.uuid
      }
    }
  } catch (e) { console.warn(`[buscarOuCriarProduto] erro na busca em ${urlBusca}:`, e) }

  // Tenta criar o produto se não existir
  try {
    const payloadProduto: any = {
      nome: descricao || codigo || 'Produto sem nome',
      codigo: codigo || undefined,
      codigo_sku: codigo || undefined,
      valor: valor,
      valor_venda: valor,
      situacao: 'ATIVO',
      tipo: 'PRODUTO'
    }
    
    if (metadata) {
      if (metadata.unidade_medida) {
        try {
          const res = await fetch(`${BASE_URL}/produtos?tamanho_pagina=50`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          })
          if (res.ok) {
            const data = await res.json()
            const lista: any[] = data.itens || data.items || (Array.isArray(data) ? data : [])
            const siglaBusca = metadata.unidade_medida.toUpperCase().trim()
            
            const produtoComUnidade = lista.find(p => 
              p.unidade_medida && 
              p.unidade_medida.id && 
              (p.unidade_medida.sigla?.toUpperCase() === siglaBusca || p.unidade_medida.descricao?.toUpperCase() === siglaBusca)
            )
            const produtoFallback = lista.find(p => p.unidade_medida && p.unidade_medida.id)
            const unidadeAlvo = produtoComUnidade?.unidade_medida || produtoFallback?.unidade_medida
            
            if (unidadeAlvo && unidadeAlvo.id) {
              payloadProduto.unidade_medida = { id: unidadeAlvo.id }
            }
          }
        } catch (e) {
          console.warn('[buscarOuCriarProduto] Falha ao tentar buscar ID da unidade de medida:', e)
        }
      }
      if (metadata.cest) payloadProduto.cest = metadata.cest;
      
      if (metadata.ncm) payloadProduto.ncm = metadata.ncm
      
      // Origem no CA deve ser um enum (0 a 8 geralmente), mas tentamos enviar o que vem.
      // Se for algo como '0 - Nacional', precisamos pegar apenas o número.
      if (metadata.origem) {
        const origemNum = parseInt(metadata.origem.split('-')[0].trim(), 10)
        if (!isNaN(origemNum)) {
          payloadProduto.origem = origemNum
        }
      }
    }
    const criar = await fetch(`${BASE_URL}/produtos`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadProduto),
    })
    if (criar.ok) {
      const novo: any = await criar.json()
      return novo.id || novo.uuid
    } else {
      const errBody = await criar.text()
      console.error(`[buscarOuCriarProduto] falha ao criar produto "${descricao}" (${codigo}):`, criar.status, errBody)
      
      let msg = `Não foi possível criar o produto "${descricao}" no Conta Azul: [${criar.status}] ${errBody}`
      if (errBody.includes('O ID da unidade de medida é obrigatório')) {
        msg = `Erro no Conta Azul: Para cadastrar impostos (NCM/CEST) no produto "${descricao}", é obrigatório enviar o ID da Unidade de Medida. Como solução paliativa, crie ao menos 1 produto manualmente no Conta Azul com a unidade 'UN' para que o sistema consiga mapear o ID automaticamente nas próximas vendas.`
      }
      
      throw new Error(msg)
    }
  } catch (e) {
    // Re-lança erros informativos (como falha na criação)
    if (e instanceof Error) throw e
    console.warn(`[buscarOuCriarProduto] erro ao tentar criar:`, e)
  }
  
  return undefined
}

/**
 * Busca ou cria um Cliente no Conta Azul.
 * Prioriza busca por CPF/CNPJ para evitar duplicatas.
 * @param cpfCnpj - CPF (11 dígitos) ou CNPJ (14 dígitos) sem máscara, ou com máscara (será limpo)
 */
export async function buscarOuCriarCliente(
  accessToken: string,
  nome: string,
  cpfCnpj?: string | null,
  endereco?: {
    logradouro?: string | null
    numero?: string | null
    bairro?: string | null
    cidade?: string | null
    estado?: string | null
    cep?: string | null
    complemento?: string | null
  }
): Promise<string | undefined> {
  const docLimpo = cpfCnpj ? cpfCnpj.replace(/\D/g, '') : ''
  // CPF = 11 dígitos, CNPJ = 14 dígitos
  const tipoPessoa = docLimpo.length === 14 ? 'Jurídica' : 'Física'

  try {
    // 1. Busca por CPF/CNPJ se disponível (mais preciso, evita duplicatas)
    if (docLimpo) {
      const urlDoc = `${BASE_URL}/pessoas?pagina=1&tamanho_pagina=10&cpf_cnpj=${docLimpo}&tipo_perfil=Cliente`
      try {
        const busca = await fetch(urlDoc, { headers: { 'Authorization': `Bearer ${accessToken}` } })
        if (busca.ok) {
          const data = await busca.json()
          const lista: any[] = data.itens || data.items || data.content || data.data || (Array.isArray(data) ? data : [])
          if (lista.length > 0) {
            const matchDoc = lista.find(p => {
              const pDoc = (p.cpf || p.cnpj || p.documento || '').replace(/\D/g, '')
              return pDoc === docLimpo
            })
            if (matchDoc) return matchDoc.id || matchDoc.uuid
          }
        }
      } catch (e) { console.warn('[cliente] erro na busca por doc:', e) }
    }

    // 2. Busca por nome
    const endpointsBusca = [
      `${BASE_URL}/pessoas?pagina=1&tamanho_pagina=100&busca=${encodeURIComponent(nome)}&tipo_perfil=Cliente`,
      `${BASE_URL}/pessoas?pagina=1&tamanho_pagina=100&busca=${encodeURIComponent(nome)}`,
    ]
    for (const url of endpointsBusca) {
      try {
        const busca = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } })
        if (busca.ok) {
          const data = await busca.json()
          const lista: any[] = data.itens || data.items || data.content || data.data || (Array.isArray(data) ? data : [])
          if (lista.length > 0) {
            const nomeBusca = nome.toLowerCase().trim()
            const matchExato = lista.find(p => (p.nome || p.name || '').toLowerCase().trim() === nomeBusca)
            if (matchExato) return matchExato.id || matchExato.uuid
          }
        }
      } catch (e) { console.warn(`[cliente] erro na busca em ${url}:`, e) }
    }

    // 3. Criar como Cliente com CPF/CNPJ
    const bodyCliente: Record<string, unknown> = {
      nome,
      tipo_pessoa: tipoPessoa,
      perfis: [{ tipo_perfil: 'Cliente' }],
      ativo: true,
    }
    if (docLimpo) {
      if (tipoPessoa === 'Jurídica') bodyCliente.cnpj = docLimpo
      else bodyCliente.cpf = docLimpo
    }
    if (endereco && (endereco.logradouro || endereco.cidade || endereco.cep)) {
      const endCA: any = {};
      if (endereco.logradouro) endCA.logradouro = endereco.logradouro;
      endCA.numero = endereco.numero || 'S/N';
      if (endereco.complemento) endCA.complemento = endereco.complemento;
      if (endereco.bairro) endCA.bairro = endereco.bairro;
      if (endereco.cidade) endCA.cidade = endereco.cidade;
      if (endereco.estado) endCA.estado = endereco.estado;
      if (endereco.cep) {
        let cepStr = endereco.cep.replace(/\D/g, '');
        if (cepStr.length === 8) {
          cepStr = `${cepStr.substring(0, 5)}-${cepStr.substring(5)}`;
        }
        endCA.cep = cepStr;
      }
      endCA.pais = 'Brasil';
      bodyCliente.enderecos = [endCA];
    }
    const criar = await fetch(`${BASE_URL}/pessoas`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyCliente),
    })
    if (criar.ok) { const novo: any = await criar.json(); return novo.id }

    const errTextPrincipal = await criar.text()
    console.error('[buscarOuCriarCliente] Erro POST /pessoas:', criar.status, errTextPrincipal)

    // Se o erro for "já existe pessoa com esse CPF/CNPJ", buscar essa pessoa pelo doc
    if (criar.status === 400 && errTextPrincipal.includes('CPF') && docLimpo) {
      console.log('[buscarOuCriarCliente] CPF/CNPJ duplicado, tentando buscar pessoa existente...')
      // Busca sem filtro de perfil para encontrar qualquer pessoa com esse doc
      const urlBuscaDoc = `${BASE_URL}/pessoas?pagina=1&tamanho_pagina=10&cpf_cnpj=${docLimpo}`
      try {
        const buscaDoc = await fetch(urlBuscaDoc, { headers: { 'Authorization': `Bearer ${accessToken}` } })
        if (buscaDoc.ok) {
          const dataDoc = await buscaDoc.json()
          const listaDoc: any[] = dataDoc.itens || dataDoc.items || dataDoc.content || dataDoc.data || (Array.isArray(dataDoc) ? dataDoc : [])
          if (listaDoc.length > 0) {
            console.log('[buscarOuCriarCliente] Pessoa encontrada por CPF/CNPJ duplicado:', listaDoc[0].id, listaDoc[0].nome)
            return listaDoc[0].id || listaDoc[0].uuid
          }
        }
      } catch (e) { console.warn('[buscarOuCriarCliente] erro ao buscar por doc duplicado:', e) }
    }

    // Se o erro for por CPF inválido, tentar criar sem CPF
    if (criar.status === 400 && (errTextPrincipal.includes('CPF') || errTextPrincipal.includes('CNPJ')) && errTextPrincipal.includes('inválido')) {
      console.log('[buscarOuCriarCliente] CPF/CNPJ inválido, criando sem documento...')
      const bodySemDoc = { nome, tipo_pessoa: tipoPessoa, perfis: [{ tipo_perfil: 'Cliente' }], ativo: true }
      const criarSemDoc = await fetch(`${BASE_URL}/pessoas`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(bodySemDoc),
      })
      if (criarSemDoc.ok) { const novo: any = await criarSemDoc.json(); return novo.id }
      const errSemDoc = await criarSemDoc.text()
      console.error('[buscarOuCriarCliente] Erro criar sem doc:', criarSemDoc.status, errSemDoc)
    }

    throw new Error(`Erro ao criar cliente '${nome}': ${criar.status} - ${errTextPrincipal}`)
  } catch (e: any) { console.error(`[buscarOuCriarCliente] erro:`, e); throw e }
}
