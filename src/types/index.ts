export type StatusIntegracao = 'pendente' | 'enviado' | 'erro'

export interface Empresa {
  id: string
  nome: string
  cnpj: string
  access_token_conta_azul: string | null
  refresh_token_conta_azul: string | null
  data_expiracao_token: string | null
  conta_azul_connected: boolean
  created_at: string
  /** E-mail de login vinculado a esta empresa no Conta Azul */
  email_login: string | null
}

export interface UsuarioEmpresa {
  id: string
  user_id: string
  empresa_id: string
  empresa?: Empresa
}

export interface ContaPagarImportada {
  id: string
  empresa_id: string
  fornecedor: string
  valor: number
  vencimento: string
  categoria: string | null
  conta_financeira: string | null
  descricao: string | null
  doc: string | null
  emissao: string | null
  status: StatusIntegracao
  conta_azul_id: string | null
  erro_mensagem: string | null
  tentativas: number
  importacao_id: string | null
  created_at: string
  updated_at: string
}

export interface LogIntegracao {
  id: string
  empresa_id: string
  conta_pagar_id: string | null
  acao: string
  status: 'sucesso' | 'erro'
  detalhes: Record<string, unknown> | null
  created_at: string
}

export interface MatchFornecedorInfo {
  nomeOriginal: string
  nomeCorrigido: string
  cnpj: string
  categoria?: string
  confianca: 'exato' | 'alto' | 'medio' | 'baixo' | 'nenhum'
  score: number
}

export interface ContaPagarPreview {
  fornecedor: string
  valor: number
  vencimento: string
  categoria?: string
  conta_financeira?: string
  descricao?: string
  /** Número do documento / NF original do Datacar */
  doc?: string
  /** Data de emissão do documento */
  emissao?: string
  linha_original?: string
  valido: boolean
  erros?: string[]
  /** Resultado do match automático com fornecedores do ContaAzul */
  matchFornecedor?: MatchFornecedorInfo
}

export interface ResultadoImportacao {
  total: number
  validos: number
  invalidos: number
  dados: ContaPagarPreview[]
  aviso?: string
}
