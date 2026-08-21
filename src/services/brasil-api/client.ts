export interface BrasilApiCnpjResponse {
  cnpj: string
  identificador_matriz_filial: number
  descricao_matriz_filial: string
  razao_social: string
  nome_fantasia: string
  situacao_cadastral: number
  descricao_situacao_cadastral: string
  data_situacao_cadastral: string
  motivo_situacao_cadastral: number
  nome_cidade_no_exterior: string
  codigo_natureza_juridica: number
  data_inicio_atividade: string
  cnae_fiscal: number
  cnae_fiscal_descricao: string
  descricao_tipo_de_logradouro: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cep: string
  uf: string
  codigo_municipio: number
  municipio: string
  ddd_telefone_1: string
  ddd_telefone_2: string
  ddd_fax: string
  qualificacao_do_responsavel: number
  capital_social: number
  porte: number
  descricao_porte: string
  opcao_pelo_simples: boolean
  data_opcao_pelo_simples: string | null
  data_exclusao_do_simples: string | null
  opcao_pelo_mei: boolean
  situacao_especial: string | null
  data_situacao_especial: string | null
}

export interface BrasilApiCepResponse {
  cep: string
  state: string
  city: string
  neighborhood: string
  street: string
  service: string
}

export async function buscarCnpj(cnpj: string): Promise<BrasilApiCnpjResponse | null> {
  const cnpjLimpo = cnpj.replace(/\D/g, '')
  if (cnpjLimpo.length !== 14) return null

  // Provider 1: Brasil API
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 4000)
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`, { signal: controller.signal })
    clearTimeout(timeoutId)
    if (res.ok) {
      const data = await res.json()
      if (data && (data.razao_social || data.nome_fantasia)) {
        return data as BrasilApiCnpjResponse
      }
    }
  } catch (err) {
    console.warn(`[buscarCnpj] Brasil API falhou ou expirou para ${cnpjLimpo}:`, err)
  }

  // Provider 2: Minha Receita (APIs públicas da Receita Federal)
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 4000)
    const res = await fetch(`https://minhareceita.org/${cnpjLimpo}`, { signal: controller.signal })
    clearTimeout(timeoutId)
    if (res.ok) {
      const data = await res.json()
      if (data && (data.razao_social || data.nome_fantasia)) {
        return {
          cnpj: data.cnpj || cnpjLimpo,
          identificador_matriz_filial: 1,
          descricao_matriz_filial: data.descricao_matriz_filial || 'MATRIZ',
          razao_social: data.razao_social || '',
          nome_fantasia: data.nome_fantasia || data.razao_social || '',
          situacao_cadastral: data.situacao_cadastral || 2,
          descricao_situacao_cadastral: data.descricao_situacao_cadastral || 'ATIVA',
          data_situacao_cadastral: data.data_situacao_cadastral || '',
          motivo_situacao_cadastral: 0,
          nome_cidade_no_exterior: '',
          codigo_natureza_juridica: 0,
          data_inicio_atividade: data.data_inicio_atividade || '',
          cnae_fiscal: data.cnae_fiscal || 0,
          cnae_fiscal_descricao: data.cnae_fiscal_descricao || '',
          descricao_tipo_de_logradouro: data.descricao_tipo_de_logradouro || '',
          logradouro: data.logradouro || '',
          numero: data.numero || '',
          complemento: data.complemento || '',
          bairro: data.bairro || '',
          cep: data.cep || '',
          uf: data.uf || '',
          codigo_municipio: 0,
          municipio: data.municipio || '',
          ddd_telefone_1: data.ddd_telefone_1 || data.telefone || '',
          ddd_telefone_2: data.ddd_telefone_2 || '',
          ddd_fax: '',
          qualificacao_do_responsavel: 0,
          capital_social: data.capital_social || 0,
          porte: 0,
          descricao_porte: data.porte || '',
          opcao_pelo_simples: Boolean(data.opcao_pelo_simples),
          data_opcao_pelo_simples: null,
          data_exclusao_do_simples: null,
          opcao_pelo_mei: Boolean(data.opcao_pelo_mei),
          situacao_especial: null,
          data_situacao_especial: null,
        }
      }
    }
  } catch (err) {
    console.warn(`[buscarCnpj] Minha Receita falhou para ${cnpjLimpo}:`, err)
  }

  // Provider 3: CNPJ.ws pública
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 4000)
    const res = await fetch(`https://publica.cnpj.ws/cnpj/${cnpjLimpo}`, { signal: controller.signal })
    clearTimeout(timeoutId)
    if (res.ok) {
      const data = await res.json()
      const est = data.estabelecimento || {}
      return {
        cnpj: est.cnpj || cnpjLimpo,
        identificador_matriz_filial: 1,
        descricao_matriz_filial: 'MATRIZ',
        razao_social: data.razao_social || '',
        nome_fantasia: est.nome_fantasia || data.razao_social || '',
        situacao_cadastral: 2,
        descricao_situacao_cadastral: est.situacao_cadastral || 'ATIVA',
        data_situacao_cadastral: '',
        motivo_situacao_cadastral: 0,
        nome_cidade_no_exterior: '',
        codigo_natureza_juridica: 0,
        data_inicio_atividade: '',
        cnae_fiscal: est.atividade_principal?.id || 0,
        cnae_fiscal_descricao: est.atividade_principal?.descricao || '',
        descricao_tipo_de_logradouro: est.tipo_logradouro || '',
        logradouro: est.logradouro || '',
        numero: est.numero || '',
        complemento: est.complemento || '',
        bairro: est.bairro || '',
        cep: est.cep || '',
        uf: est.estado?.sigla || '',
        codigo_municipio: 0,
        municipio: est.cidade?.nome || '',
        ddd_telefone_1: est.ddd1 && est.telefone1 ? `${est.ddd1}${est.telefone1}` : '',
        ddd_telefone_2: '',
        ddd_fax: '',
        qualificacao_do_responsavel: 0,
        capital_social: 0,
        porte: 0,
        descricao_porte: data.porte?.descricao || '',
        opcao_pelo_simples: Boolean(data.simples?.simples === 'Sim'),
        data_opcao_pelo_simples: null,
        data_exclusao_do_simples: null,
        opcao_pelo_mei: Boolean(data.simples?.mei === 'Sim'),
        situacao_especial: null,
        data_situacao_especial: null,
      }
    }
  } catch (err) {
    console.warn(`[buscarCnpj] CNPJ.ws falhou para ${cnpjLimpo}:`, err)
  }

  return null
}

export async function buscarCep(cep: string): Promise<BrasilApiCepResponse | null> {
  const cepLimpo = cep.replace(/\D/g, '')
  if (cepLimpo.length !== 8) return null

  try {
    const res = await fetch(`https://brasilapi.com.br/api/cep/v1/${cepLimpo}`)
    if (!res.ok) return null
    return await res.json()
  } catch (error) {
    console.warn(`Erro ao buscar CEP ${cepLimpo} na Brasil API:`, error)
    return null
  }
}

export interface EnderecoDatacar {
  logradouro?: string | null
  numero?: string | null
  bairro?: string | null
  cidade?: string | null
  estado?: string | null
  cep?: string | null
  complemento?: string | null
}

/**
 * Enriquecer o endereço do Datacar usando dados da Brasil API.
 * Preserva o número e o complemento originais do Datacar,
 * pois a busca por CEP não fornece esses dados específicos da residência.
 */
export async function enriquecerEndereco(
  enderecoBase: EnderecoDatacar,
  dadosCnpj?: BrasilApiCnpjResponse | null
): Promise<EnderecoDatacar> {
  // Se já temos dados completos do CNPJ (que inclui endereço preciso), usamos eles
  if (dadosCnpj && dadosCnpj.logradouro) {
    return {
      logradouro: dadosCnpj.logradouro || enderecoBase.logradouro,
      numero: enderecoBase.numero || dadosCnpj.numero, // Prioriza o número que já tínhamos se existir
      bairro: dadosCnpj.bairro || enderecoBase.bairro,
      cidade: dadosCnpj.municipio || enderecoBase.cidade,
      estado: dadosCnpj.uf || enderecoBase.estado,
      cep: dadosCnpj.cep || enderecoBase.cep,
      complemento: enderecoBase.complemento || dadosCnpj.complemento
    }
  }

  // Se não temos dados do CNPJ, mas temos um CEP, tentamos enriquecer pelo CEP
  if (enderecoBase.cep) {
    const dadosCep = await buscarCep(enderecoBase.cep)
    if (dadosCep) {
      return {
        logradouro: dadosCep.street || enderecoBase.logradouro,
        numero: enderecoBase.numero, // CEP nunca retorna número
        bairro: dadosCep.neighborhood || enderecoBase.bairro,
        cidade: dadosCep.city || enderecoBase.cidade,
        estado: dadosCep.state || enderecoBase.estado,
        cep: dadosCep.cep || enderecoBase.cep,
        complemento: enderecoBase.complemento // CEP nunca retorna complemento
      }
    }
  }

  // Se nada funcionou, retorna o original
  return enderecoBase
}
