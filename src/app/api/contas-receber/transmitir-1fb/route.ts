import { NextRequest, NextResponse } from 'next/server'
import { getValidToken, TokenError } from '@/lib/conta-azul/token-manager'
import { createAdminClient } from '@/lib/supabase/admin'
import { validarAutorizacaoContasReceber } from '@/lib/contas-receber/auth-receber'
import {
  criarRepositorioIdempotenciaSupabase1FB,
  executarTransmissaoControladaEtapa1FB,
  sanitizarMensagemErroSegura,
  verificarTransmissaoReal1FBHabilitada,
} from '@/lib/contas-receber/transmissor-conta-azul-1fb'
import type {
  RequisicaoTransmissao1FBDTO,
  RespostaTransmissao1FBDTO,
} from '@/types/contas-receber'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

/**
 * Endpoint isolado e endurecido da Etapa 1F-B do Módulo Contas a Receber:
 * - Valida sessão (`supabase.auth.getUser()`), perfil aprovado, permissão `contas_receber` (ou `is_master`)
 *   e vínculo autorizado à `empresa_id` solicitada ANTES de usar `createAdminClient()`.
 * - GET: Consulta o estado de idempotência persistido para chaves de Receita Bruta / Despesa MDR.
 * - POST: Executa o fluxo de validação de confirmação explícita, lock atômico de concorrência,
 *         idempotência persistente, validação autoritativa na Conta Azul e transmissão controlada
 *         (mantendo qualquer envio real bloqueado por padrão enquanto a trava de segurança da etapa estiver ativa).
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const empresaId = searchParams.get('empresa_id')?.trim() || ''
    const chavesRaw = searchParams.get('chaves')?.trim() || ''
    const chaves = chavesRaw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    const transmissaoRealHabilitada = verificarTransmissaoReal1FBHabilitada()

    const authResult = await validarAutorizacaoContasReceber({
      req,
      empresaId,
    })

    if (!authResult.autorizado || !authResult.empresaAutorizada) {
      return NextResponse.json(
        {
          etapa: '1F-B',
          transmissao_real_habilitada: transmissaoRealHabilitada,
          registros_idempotencia: [],
          codigo_erro: authResult.codigoErro,
          aviso:
            authResult.mensagemErro ||
            'Acesso não autorizado ao módulo Contas a Receber.',
        },
        { status: authResult.statusHttp }
      )
    }

    if (chaves.length === 0) {
      return NextResponse.json({
        etapa: '1F-B',
        transmissao_real_habilitada: transmissaoRealHabilitada,
        registros_idempotencia: [],
      })
    }

    // Somente após validação completa de sessão, perfil e empresa autorizada instancia o cliente administrativo
    const supabaseAdmin = createAdminClient()
    const repositorio = criarRepositorioIdempotenciaSupabase1FB(supabaseAdmin)
    const registros = await repositorio.listarOperacoesPorChaves(
      authResult.empresaAutorizada.id,
      chaves
    )

    return NextResponse.json({
      etapa: '1F-B',
      transmissao_real_habilitada: transmissaoRealHabilitada,
      registros_idempotencia: registros,
    })
  } catch (err: unknown) {
    const msgSegura = sanitizarMensagemErroSegura(err)
    return NextResponse.json(
      {
        etapa: '1F-B',
        transmissao_real_habilitada: verificarTransmissaoReal1FBHabilitada(),
        registros_idempotencia: [],
        aviso: `Não foi possível consultar registros prévios de idempotência: ${msgSegura}`,
      },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  let body: RequisicaoTransmissao1FBDTO | null = null
  try {
    body = (await req.json()) as RequisicaoTransmissao1FBDTO
  } catch {
    return NextResponse.json(
      {
        etapa: '1F-B',
        situacao: 'BLOQUEADO_VALIDACAO_PRE_VOO',
        transmissao_real_habilitada: verificarTransmissaoReal1FBHabilitada(),
        sucesso: false,
        bloqueado: true,
        reconciliacao_necessaria: false,
        empresa_id: '',
        empresa_nome: '',
        chave_lote: '',
        mensagem: 'Payload JSON inválido na requisição da Etapa 1F-B.',
        receita_bruta: null,
        despesa_mdr: null,
      } satisfies RespostaTransmissao1FBDTO,
      { status: 400 }
    )
  }

  const empresaIdSolicitada = String(body?.empresa_id || '').trim()

  // 1. Validar sessão, aprovação, permissão `contas_receber` e acesso à empresa solicitada ANTES de qualquer operação administrativa
  const authResult = await validarAutorizacaoContasReceber({
    req,
    empresaId: empresaIdSolicitada,
  })

  if (!authResult.autorizado || !authResult.empresaAutorizada) {
    return NextResponse.json(
      {
        etapa: '1F-B',
        situacao: 'BLOQUEADO_VALIDACAO_PRE_VOO',
        transmissao_real_habilitada: verificarTransmissaoReal1FBHabilitada(),
        sucesso: false,
        bloqueado: true,
        reconciliacao_necessaria: false,
        empresa_id: empresaIdSolicitada,
        empresa_nome: body?.empresa_nome || '',
        chave_lote: '',
        mensagem:
          authResult.mensagemErro ||
          'Acesso negado para executar transmissão na Etapa 1F-B.',
        receita_bruta: null,
        despesa_mdr: null,
      } satisfies RespostaTransmissao1FBDTO,
      { status: authResult.statusHttp }
    )
  }

  try {
    // 2. Somente após autorização comprovada no servidor instancia o cliente administrativo
    const supabaseAdmin = createAdminClient()
    const repositorioIdempotencia =
      criarRepositorioIdempotenciaSupabase1FB(supabaseAdmin)

    const empresaAutorizada = authResult.empresaAutorizada

    const resultado = await executarTransmissaoControladaEtapa1FB(body!, {
      repositorioIdempotencia,
      empresaAutorizadaServidor: {
        id: empresaAutorizada.id,
        nome: empresaAutorizada.nome,
      },
      obterTokenValido: async (
        _empresaId: string,
        forcarRefresh?: boolean,
        failedAccessToken?: string
      ) => {
        // Garante uso exclusivo do ID da empresa autorizada no servidor
        const res = await getValidToken(
          empresaAutorizada.id,
          'financeiro',
          Boolean(forcarRefresh),
          failedAccessToken ? { failedAccessToken } : undefined
        )
        return { accessToken: res.accessToken }
      },
    })

    return NextResponse.json(resultado)
  } catch (err: unknown) {
    const ehErroToken = err instanceof TokenError
    const msgSegura = sanitizarMensagemErroSegura(err)

    const respostaErro: RespostaTransmissao1FBDTO = {
      etapa: '1F-B',
      situacao: 'FALHA_COMPLETA',
      transmissao_real_habilitada: verificarTransmissaoReal1FBHabilitada(),
      sucesso: false,
      bloqueado: ehErroToken,
      reconciliacao_necessaria: false,
      empresa_id: authResult.empresaAutorizada.id,
      empresa_nome: authResult.empresaAutorizada.nome,
      chave_lote: '',
      mensagem: ehErroToken
        ? `Falha de autenticação Conta Azul para a loja selecionada: ${msgSegura}`
        : `Erro inesperado no processamento da Etapa 1F-B: ${msgSegura}`,
      receita_bruta: null,
      despesa_mdr: null,
    }

    return NextResponse.json(respostaErro, { status: 200 })
  }
}
