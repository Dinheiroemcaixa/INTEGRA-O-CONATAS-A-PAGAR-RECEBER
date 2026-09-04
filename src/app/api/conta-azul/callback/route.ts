import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTokenComCodigo, obterInfoContaConectada } from '@/lib/conta-azul/api'
import { formatCNPJ } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const rawState = searchParams.get('state') // empresa_id:modulo
  const error = searchParams.get('error')

  const [state, modulo = 'financeiro'] = (rawState || '').split(':')
  const isVendas = modulo === 'vendas'
  const moduloDescricao = isVendas ? 'Vendas / Emissao de NF-e' : 'Financeiro (Contas a Pagar e Receber)'

  const renderHtml = (
    titulo: string,
    mensagem: string,
    isError = false,
    detalhes?: { loja?: string; modulo?: string; cnpj?: string; conta?: string; email?: string }
  ) => {
    const corBgBadge = isError ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)'
    const corBordaBadge = isError ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'
    const icone = isError ? '⚠️' : '✅'

    let detalhesHtml = ''
    if (detalhes) {
      detalhesHtml = '<div class="details">'
      if (detalhes.loja) detalhesHtml += '<div class="details-row"><span>Loja do Sistema:</span><span>' + detalhes.loja + '</span></div>'
      if (detalhes.cnpj) detalhesHtml += '<div class="details-row"><span>CNPJ:</span><span>' + detalhes.cnpj + '</span></div>'
      if (detalhes.modulo) detalhesHtml += '<div class="details-row"><span>Modulo:</span><span>' + detalhes.modulo + '</span></div>'
      if (detalhes.conta) detalhesHtml += '<div class="details-row"><span>Conta CA:</span><span>' + detalhes.conta + '</span></div>'
      if (detalhes.email) detalhesHtml += '<div class="details-row"><span>E-mail:</span><span>' + detalhes.email + '</span></div>'
      detalhesHtml += '</div>'
    }

    const html = '<!DOCTYPE html>' +
      '<html lang="pt-BR">' +
      '<head>' +
      '<meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>' + titulo + ' | Integracao Conta Azul</title>' +
      '<style>' +
      '* { box-sizing: border-box; }' +
      'body { margin: 0; padding: 1.5rem; display: flex; justify-content: center; align-items: center; min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #09090b; color: #fafafa; }' +
      '.card { background: #18181b; padding: 2.5rem 2rem; border-radius: 1.5rem; border: 1px solid #27272a; text-align: center; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7); max-width: 480px; width: 100%; position: relative; overflow: hidden; }' +
      '.icon-box { width: 60px; height: 60px; border-radius: 1rem; background: ' + corBgBadge + '; border: 1px solid ' + corBordaBadge + '; display: flex; align-items: center; justify-content: center; font-size: 28px; margin: 0 auto 1.5rem auto; }' +
      'h1 { color: #ffffff; margin: 0 0 0.75rem 0; font-size: 1.35rem; font-weight: 700; }' +
      '.msg { color: #a1a1aa; line-height: 1.6; font-size: 0.925rem; margin-bottom: 1.5rem; }' +
      '.msg strong { color: #f4f4f5; }' +
      '.details { background: #09090b; border: 1px solid #27272a; border-radius: 0.75rem; padding: 0.875rem; margin-bottom: 1.5rem; text-align: left; font-size: 0.825rem; }' +
      '.details-row { display: flex; justify-content: space-between; padding: 0.25rem 0; color: #71717a; }' +
      '.details-row span:last-child { color: #e4e4e7; font-weight: 600; text-align: right; margin-left: 0.5rem; }' +
      '.footer-note { font-size: 0.75rem; color: #71717a; margin-top: 1rem; }' +
      '</style>' +
      '</head>' +
      '<body>' +
      '<div class="card">' +
      '<div class="icon-box">' + icone + '</div>' +
      '<h1>' + titulo + '</h1>' +
      '<div class="msg">' + mensagem + '</div>' +
      detalhesHtml +
      '<div class="footer-note">Voce ja pode fechar esta pagina.</div>' +
      '</div>' +
      '</body>' +
      '</html>'

    return new NextResponse(html, {
      status: isError ? 400 : 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  if (error) {
    return renderHtml(
      'Autorizacao Cancelada',
      'Voce nao concedeu permissao de acesso a Conta Azul. Nenhuma alteracao foi realizada.',
      true
    )
  }

  if (!code || !state) {
    return renderHtml(
      'Parametros Invalidos',
      'O link de retorno nao possui os parametros necessarios de validacao.',
      true
    )
  }

  try {
    // 1. Busca os dados da empresa cadastrada no banco
    const { data: empresa, error: empErr } = await supabaseAdmin
      .from('empresas')
      .select('*')
      .eq('id', state)
      .single()

    if (empErr || !empresa) {
      return renderHtml(
        'Empresa Nao Localizada',
        'Nao foi possivel encontrar a empresa de destino no sistema para concluir o vinculo.',
        true
      )
    }

    // 2. Troca o codigo temporario pelos tokens de acesso oficiais
    const tokens = await getTokenComCodigo(
      code,
      process.env.CONTA_AZUL_REDIRECT_URI!,
      process.env.CONTA_AZUL_CLIENT_ID!,
      process.env.CONTA_AZUL_CLIENT_SECRET!
    )

    const expires_in = tokens.expires_in || 3600
    const expiracao = new Date(Date.now() + expires_in * 1000).toISOString()

    // 3. Consulta informacoes da conta conectada na API Conta Azul (para validar CNPJ e capturar e-mail)
    let infoCa: {
      id: string
      nome: string
      cnpj?: string
      razao_social?: string
      nome_fantasia?: string
      email?: string
    } | null = null
    try {
      infoCa = await obterInfoContaConectada(tokens.access_token)
    } catch (e) {
      console.warn('[conta-azul/callback] Nao foi possivel obter info detalhada da conta conectada via API.', e)
    }

    const nomeContaLogada = (infoCa?.nome || infoCa?.razao_social || infoCa?.nome_fantasia || empresa.nome).trim()
    const emailLoginCapturado = infoCa?.email || undefined

    // 4. TRAVA DE SEGURANÇA POR CNPJ:
    // Se a Conta Azul retornou CNPJ com 14 dígitos e a empresa cadastrada possui CNPJ com 14 dígitos,
    // eles DEVEM ser rigorosamente iguais para evitar troca acidental de lojas.
    const cnpjEmpresaLimpo = (empresa.cnpj || '').replace(/\D/g, '')
    const cnpjCaLimpo = (infoCa?.cnpj || '').replace(/\D/g, '')

    if (cnpjEmpresaLimpo.length === 14 && cnpjCaLimpo.length === 14 && cnpjEmpresaLimpo !== cnpjCaLimpo) {
      return renderHtml(
        'Loja Incorreta (CNPJ Divergente)',
        'Este link era destinado para a loja <strong>' + empresa.nome + '</strong> (CNPJ: ' + formatCNPJ(cnpjEmpresaLimpo) + '), mas a conta selecionada na Conta Azul pertence ao CNPJ <strong>' + formatCNPJ(cnpjCaLimpo) + '</strong> (' + nomeContaLogada + ').<br><br>A conexao foi bloqueada com seguranca para evitar misturar lancamentos de empresas diferentes.',
        true,
        {
          loja: empresa.nome + ' (' + formatCNPJ(cnpjEmpresaLimpo) + ')',
          modulo: moduloDescricao,
          conta: nomeContaLogada + ' (' + formatCNPJ(cnpjCaLimpo) + ')',
          email: emailLoginCapturado
        }
      )
    }

    // 5. Salva os tokens no modulo correspondente
    const payloadUpdate: Record<string, any> = isVendas
      ? {
          access_token_conta_azul_vendas: tokens.access_token,
          refresh_token_conta_azul_vendas: tokens.refresh_token,
          data_expiracao_token_vendas: expiracao,
          conta_azul_vendas_connected: true,
          ...(emailLoginCapturado ? { email_login_vendas: emailLoginCapturado } : {}),
        }
      : {
          access_token_conta_azul: tokens.access_token,
          refresh_token_conta_azul: tokens.refresh_token,
          data_expiracao_token: expiracao,
          conta_azul_connected: true,
          ...(emailLoginCapturado ? { email_login: emailLoginCapturado } : {}),
        }

    await supabaseAdmin.from('empresas').update(payloadUpdate).eq('id', state)

    await supabaseAdmin.from('logs_integracao').insert({
      empresa_id: state,
      acao: 'conectar_conta_azul_' + modulo,
      status: 'sucesso',
      detalhes: {
        expiracao,
        modulo,
        conta_conectada: nomeContaLogada || undefined,
        cnpj_validado: cnpjEmpresaLimpo.length === 14 ? formatCNPJ(cnpjEmpresaLimpo) : undefined,
        email: emailLoginCapturado || undefined,
      },
    })

    return renderHtml(
      'Autenticado com Sucesso!',
      'A integracao da loja <strong>' + empresa.nome + '</strong> com o Conta Azul foi autorizada e concluida com sucesso!<br><br>O sistema ja esta pronto para sincronizar dados desta unidade.',
      false,
      {
        loja: empresa.nome,
        cnpj: cnpjEmpresaLimpo.length === 14 ? formatCNPJ(cnpjEmpresaLimpo) : undefined,
        modulo: moduloDescricao,
        conta: nomeContaLogada || 'Conectada',
        email: emailLoginCapturado
      }
    )
  } catch (err) {
    console.error('[conta-azul/callback]', err)
    const msg = err instanceof Error ? err.message : 'erro_desconhecido'
    return renderHtml('Erro na Integracao', 'Ocorreu um erro ao processar a autorizacao da Conta Azul: ' + msg, true)
  }
}
