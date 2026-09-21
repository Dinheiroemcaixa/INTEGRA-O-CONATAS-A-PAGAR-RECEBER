import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildDPSXml, type DadosDPS } from '@/lib/nfse/xml-builder'
import { extrairCertificadoPfx, assinarXmlNfse } from '@/lib/nfse/xml-signer'
import { decryptPasswordCompact } from '@/lib/crypto/cert-crypto'
import { transmitirDpsAdn } from '@/lib/nfse/adn-client'

export const maxDuration = 60 // Extensão de timeout para transmissão fiscal segura

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const empresa_id = body.empresa_id
    const itens = body.itens || body.vendas // Aceita os dois formatos
    
    if (!empresa_id || !itens || itens.length === 0) {
      return NextResponse.json({ error: 'empresa_id e itens são obrigatórios' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // 1. Busca a configuração fiscal e as credenciais
    const { data: configFiscal, error: configError } = await supabase
      .from('empresa_config_fiscal')
      .select('*')
      .eq('empresa_id', empresa_id)
      .maybeSingle()

    if (configError || !configFiscal) {
      return NextResponse.json({ error: 'Configuração fiscal da empresa não encontrada.' }, { status: 404 })
    }

    if (!configFiscal.certificado_storage_path || !configFiscal.certificado_senha_encriptada) {
      return NextResponse.json({ error: 'Certificado digital não foi configurado para esta empresa.' }, { status: 400 })
    }

    // 2. Faz o download do arquivo PFX do cofre (Storage)
    const { data: fileData, error: fileError } = await supabase.storage
      .from('certificados_fiscais')
      .download(configFiscal.certificado_storage_path)

    if (fileError || !fileData) {
      return NextResponse.json({ error: 'Erro ao baixar o certificado do cofre de segurança.' }, { status: 500 })
    }

    // 3. Descriptografa a senha usando a Master Key
    let senhaCertificado: string
    try {
      senhaCertificado = decryptPasswordCompact(configFiscal.certificado_senha_encriptada)
    } catch (err) {
      console.error('[gov-br] Falha ao descriptografar senha:', err)
      return NextResponse.json({ error: 'Falha na segurança: A Master Key do servidor é inválida ou incompatível.' }, { status: 500 })
    }

    // 4. Converte o certificado (extrai chave privada e PEM)
    const pfxBuffer = Buffer.from(await fileData.arrayBuffer())
    const certData = await extrairCertificadoPfx(pfxBuffer, senhaCertificado)

    // Resultados de processamento
    const resultados = []

    // 5. Processa cada venda importada
    for (const item of itens) {
      try {
        const f = item._fiscal || {}
        const osNum = String(item.os_numero || Date.now().toString())
        const ambienteEmissao = (configFiscal.ambiente_nfse as any) || 'homologacao'
        
        const dadosDps: DadosDPS = {
          numeroOS: osNum,
          numeroDPS: item.dados_datacar?.numero_dps || osNum,
          serie: '900',
          ambiente: ambienteEmissao,
          dataCompetencia: new Date().toISOString(), // Emissão na data atual
          valorServico: Number(item.valor_total) || 0,
          descricao: Array.isArray(item.itens) 
            ? item.itens.map((i: any) => `${i.quantidade || 1}x ${i.descricao}`).join(' | ') 
            : (f.descricaoServico || 'Serviços automotivos e mão de obra'),
          cliente: {
            documento: f.clienteCpfCnpj || item.cliente_cpf_cnpj || '00000000000', 
            nome: f.clienteNome || item.cliente || 'Consumidor Final',
            cidade: configFiscal.cidade_ibge || '3106200', // Padrão Belo Horizonte
            cep: f.clienteCep || item.cliente_endereco_cep,
            logradouro: f.clienteLogradouro || item.cliente_endereco_logradouro,
            numero: f.clienteNumero || item.cliente_endereco_numero,
            bairro: f.clienteBairro || item.cliente_endereco_bairro,
          },
          emitente: {
            cnpj: configFiscal.cnpj || '',
            inscricaoMunicipal: configFiscal.inscricao_municipal || '',
            regimeTributario: f.regime === 'simples' ? 1 : configFiscal.regime_tributario || 1
          },
          codigoTributarioNacional: f.codigoTributarioNacional || '14.01.01',
          codigoComplementarMunicipal: f.codigoComplementar || '14.01.01.001',
          itemNBS: f.nbs || '120013110',
          aliquotaSimplesNacional: f.aliquotaSimples ? parseFloat(f.aliquotaSimples) : (configFiscal.aliquota_simples_nacional || 11.34),
          aliquotaIssqn: f.aliquotaIssqn ? parseFloat(f.aliquotaIssqn) : (configFiscal.aliquota_issqn || undefined),
        }

        // 6. Constrói o XML oficial da DPS
        const xmlBase = buildDPSXml(dadosDps)
        
        // Identifica o Id oficial gerado na tag infDPS para a assinatura digital
        const matchId = xmlBase.match(/infDPS\s+[^>]*@?_?Id="([^"]+)"/) || xmlBase.match(/Id="([^"]+)"/)
        const referenceId = matchId ? matchId[1] : `DPS${osNum}`

        // 7. Assina digitalmente o XML usando o Certificado ICP-Brasil
        const xmlAssinado = assinarXmlNfse(xmlBase, certData, referenceId)

        // 8. TRANSMISSÃO REAL PARA O AMBIENTE NACIONAL DA NFS-E (ADN)
        console.log(`[gov-br] Transmitindo DPS ${referenceId} via mTLS para o ADN (${ambienteEmissao})...`)
        const adnResultado = await transmitirDpsAdn({
          dpsXmlAssinado: xmlAssinado,
          certPem: certData.certPem,
          keyPem: certData.keyPem,
          ambiente: ambienteEmissao,
          timeoutMs: 25000
        })

        if (adnResultado.sucesso) {
          const numeroNfse = adnResultado.numeroNfse || osNum
          const chaveAcesso = adnResultado.chaveAcesso || referenceId

          const dadosSalvar = {
            empresa_id: empresa_id,
            cliente: dadosDps.cliente.nome,
            os_numero: osNum,
            data_venda: item.data_venda || new Date().toISOString().split('T')[0],
            valor_total: dadosDps.valorServico,
            forma_pagamento: item.forma_pagamento || 'Boleto',
            itens: Array.isArray(item.itens) ? item.itens : [],
            status: 'enviado',
            conta_azul_id: numeroNfse,
            erro_mensagem: adnResultado.mensagem || `NFS-e #${numeroNfse} autorizada via ADN`,
            dados_datacar: {
              ...(item.dados_datacar || {}),
              numero_nfse: numeroNfse,
              chave_acesso: chaveAcesso,
              codigo_verificacao: adnResultado.codigoVerificacao,
              xml_assinado: xmlAssinado,
              xml_autorizado: adnResultado.xmlNfse,
              dados_dps: dadosDps,
              fiscal: f,
              cliente_cpf_cnpj: dadosDps.cliente.documento
            },
            updated_at: new Date().toISOString()
          }

          if (item.id && typeof item.id === 'string' && item.id.length > 20) {
            await supabase
              .from('vendas_importadas')
              .update(dadosSalvar)
              .eq('id', item.id)
          } else {
            await supabase
              .from('vendas_importadas')
              .upsert(dadosSalvar, { onConflict: 'empresa_id,os_numero' })
          }

          resultados.push({
            id: item.id || osNum,
            sucesso: true,
            os_numero: osNum,
            numero_nfse: numeroNfse,
            chave_acesso: chaveAcesso,
            mensagem: adnResultado.mensagem || `NFS-e #${numeroNfse} autorizada com sucesso via ADN`
          })
        } else {
          // Rejeição formal retornada pela Receita Federal
          console.warn(`[gov-br] Rejeição do ADN para OS ${osNum}:`, adnResultado.mensagem)
          const dadosErro = {
            empresa_id: empresa_id,
            cliente: dadosDps.cliente.nome,
            os_numero: osNum,
            data_venda: item.data_venda || new Date().toISOString().split('T')[0],
            valor_total: dadosDps.valorServico,
            forma_pagamento: item.forma_pagamento || 'Boleto',
            itens: Array.isArray(item.itens) ? item.itens : [],
            status: 'erro',
            erro_mensagem: adnResultado.mensagem || 'Rejeição do Ambiente Nacional da NFS-e',
            dados_datacar: {
              ...(item.dados_datacar || {}),
              xml_assinado: xmlAssinado,
              dados_dps: dadosDps,
              fiscal: f,
              erros_adn: adnResultado.erros || [],
              raw_response: adnResultado.rawResponse,
              cliente_cpf_cnpj: dadosDps.cliente.documento
            },
            updated_at: new Date().toISOString()
          }

          if (item.id && typeof item.id === 'string' && item.id.length > 20) {
            await supabase
              .from('vendas_importadas')
              .update(dadosErro)
              .eq('id', item.id)
          } else {
            await supabase
              .from('vendas_importadas')
              .upsert(dadosErro, { onConflict: 'empresa_id,os_numero' })
          }

          resultados.push({
            id: item.id || osNum,
            sucesso: false,
            os_numero: osNum,
            erro: adnResultado.mensagem || 'Rejeição do Ambiente Nacional da NFS-e'
          })
        }

      } catch (itemErr: any) {
        console.error(`[gov-br] Falha ao processar a venda ${item.id || item.os_numero}: `, itemErr)
        resultados.push({
          id: item.id || item.os_numero,
          sucesso: false,
          os_numero: item.os_numero,
          erro: itemErr.message || 'Erro desconhecido ao gerar/assinar/transmitir o XML'
        })
      }
    }

    const sucessos = resultados.filter(r => r.sucesso).length
    const errosCount = resultados.filter(r => !r.sucesso).length
    const detalhesErros = resultados.filter(r => !r.sucesso).map(r => `OS ${r.os_numero}: ${r.erro}`)

    return NextResponse.json({
      success: sucessos > 0,
      mensagem: `Processamento de NFS-e concluído: ${sucessos} autorizada(s), ${errosCount} com rejeição/erro.`,
      sucessos,
      erros: errosCount,
      detalhesErros,
      resultados
    })

  } catch (err: unknown) {
    console.error('[gov-br] Falha fatal no endpoint:', err)
    return NextResponse.json({ error: 'Erro interno no servidor ao tentar emitir notas' }, { status: 500 })
  }
}
