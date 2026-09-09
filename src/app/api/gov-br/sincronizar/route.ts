import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { extrairCertificadoPfx } from '@/lib/nfse/xml-signer'
import { decryptPasswordCompact } from '@/lib/crypto/cert-crypto'
import { consultarDfeGovBr } from '@/lib/nfse/govbr-sync'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { empresa_id, data_inicio, data_fim } = body

    if (!empresa_id) {
      return NextResponse.json({ error: 'empresa_id é obrigatório.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // 1. Busca a configuração fiscal e o certificado da empresa
    const { data: configFiscal, error: configError } = await supabase
      .from('empresa_config_fiscal')
      .select('*')
      .eq('empresa_id', empresa_id)
      .maybeSingle()

    if (configError || !configFiscal) {
      return NextResponse.json({ error: 'Configuração fiscal da empresa não encontrada.' }, { status: 404 })
    }

    if (!configFiscal.certificado_storage_path || !configFiscal.certificado_senha_encriptada) {
      return NextResponse.json({ error: 'Certificado Digital A1 não cadastrado para esta empresa.' }, { status: 400 })
    }

    // 2. Download do PFX do storage
    const { data: fileData, error: fileError } = await supabase.storage
      .from('certificados_fiscais')
      .download(configFiscal.certificado_storage_path)

    if (fileError || !fileData) {
      return NextResponse.json({ error: 'Erro ao obter o Certificado Digital do cofre seguro.' }, { status: 500 })
    }

    // 3. Descriptografa a senha e extrai chaves
    let senhaCertificado: string
    try {
      senhaCertificado = decryptPasswordCompact(configFiscal.certificado_senha_encriptada)
    } catch (err) {
      return NextResponse.json({ error: 'Falha na descriptografia da senha do certificado.' }, { status: 500 })
    }

    const pfxBuffer = Buffer.from(await fileData.arrayBuffer())
    const { certPem, keyPem } = await extrairCertificadoPfx(pfxBuffer, senhaCertificado)

    // 4. Consulta a API de DF-e do Gov.br
    const consulta = await consultarDfeGovBr({
      cnpj: configFiscal.cnpj || '',
      certPem,
      keyPem,
      dataInicio: data_inicio,
      dataFim: data_fim,
      ambiente: configFiscal.ambiente || 'producao',
    })

    if (!consulta.sucesso && consulta.notas.length === 0) {
      // Se não houver novas notas retornadas pela API nacional
      return NextResponse.json({
        sucesso: true,
        totalSincronizadas: 0,
        mensagem: consulta.mensagem || 'Nenhuma nova nota fiscal de serviços encontrada no Gov.br para o período.',
      })
    }

    // 5. Salva/Atualiza as notas encontradas no Supabase (vendas_importadas)
    let sincronizadasCount = 0

    for (const nota of consulta.notas) {
      const osNum = `NFS-${nota.numeroNfse}`
      const dataVenda = nota.dataEmissao ? nota.dataEmissao.split('T')[0] : new Date().toISOString().split('T')[0]

      // Verifica se já existe nota com este número para a empresa
      const { data: existente } = await supabase
        .from('vendas_importadas')
        .select('id')
        .eq('empresa_id', empresa_id)
        .eq('tipo', 'servicos')
        .or(`numero_nfse.eq.${nota.numeroNfse},os_numero.eq.${osNum},chave_acesso.eq.${nota.chaveAcesso}`)
        .maybeSingle()

      const registro = {
        empresa_id,
        tipo: 'servicos',
        os_numero: osNum,
        cliente: nota.clienteNome,
        cliente_cpf_cnpj: nota.clienteCpfCnpj,
        valor_total: nota.valorTotal,
        data_venda: dataVenda,
        status: nota.status === 'cancelada' ? 'cancelado' : 'enviado',
        numero_nfse: nota.numeroNfse,
        chave_acesso: nota.chaveAcesso,
        retorno_api: {
          fonte: 'gov_br_sincronizacao',
          protocolo: `SYNC-${nota.chaveAcesso.substring(0, 15)}`,
          status_emissao: nota.status === 'cancelada' ? 'Cancelada' : 'Autorizada',
          mensagem: 'Sincronizado diretamente do Emissor Nacional Gov.br',
          chave_acesso: nota.chaveAcesso,
          data_autorizacao: nota.dataEmissao,
        },
        dados_dps: {
          numeroOS: osNum,
          dataCompetencia: nota.dataCompetencia,
          valorServico: nota.valorTotal,
          descricao: nota.descricao,
          cliente: {
            nome: nota.clienteNome,
            documento: nota.clienteCpfCnpj,
          },
          emitente: {
            cnpj: configFiscal.cnpj || '',
          },
          aliquotaSimplesNacional: nota.aliquota || configFiscal.aliquota_simples_nacional || 0,
        },
        xml_assinado: nota.xmlRaw || null,
        enviado_em: nota.dataEmissao || new Date().toISOString(),
      }

      if (existente?.id) {
        await supabase
          .from('vendas_importadas')
          .update(registro)
          .eq('id', existente.id)
      } else {
        await supabase
          .from('vendas_importadas')
          .insert({
            ...registro,
            origem: 'gov_br',
            itens: [{
              descricao: nota.descricao,
              quantidade: 1,
              valor_unitario: nota.valorTotal,
              valor_total: nota.valorTotal,
            }],
          })
      }
      sincronizadasCount++
    }

    return NextResponse.json({
      sucesso: true,
      totalSincronizadas: sincronizadasCount,
      mensagem: `${sincronizadasCount} notas fiscais de serviços sincronizadas do Gov.br com sucesso!`,
    })
  } catch (err: any) {
    console.error('[gov-br/sincronizar] Erro:', err)
    return NextResponse.json({ error: err.message || 'Erro ao sincronizar com o Gov.br' }, { status: 500 })
  }
}
