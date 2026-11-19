import Link from "next/link";
import { LegalLead as Lead, LegalSection as Section } from "@/components/legal/legal-section";
import { OPERATOR_NAME } from "@/lib/site";

/**
 * Política de privacidade em português: tradução fiel do texto em inglês que fica logo abaixo na mesma página.
 * Mudou um dos dois? Mude o outro junto.
 */
export function PrivacyPortuguese({ contactEmail }: { contactEmail: string }) {
  const mail = <a className="text-foreground underline" href={`mailto:${contactEmail}`}>{contactEmail}</a>;
  return (
    <div className="mt-12 space-y-10">
      <Section title="Visão geral">
        <p>
          Esta Política de Privacidade explica como o ClipGringa (“ClipGringa”, “nós”) coleta, usa, compartilha e
          protege informações quando você usa os aplicativos e o serviço hospedado do ClipGringa (o “Serviço”), que
          transformam vídeos longos em cortes curtos com legenda. O Serviço é operado por {OPERATOR_NAME}.
        </p>
        <p>
          O ClipGringa também existe como software de código aberto que você pode hospedar por conta própria. Se você
          usa uma instalação operada por você ou por terceiros, o responsável pelos dados tratados nela é esse
          operador, e não o ClipGringa. Esta política descreve o serviço hospedado operado pelo ClipGringa.
        </p>
      </Section>

      <Section title="Informações que coletamos">
        <Lead>Informações da conta.</Lead>
        <p>
          Quando você cria uma conta, coletamos seu nome, seu e-mail, seu CPF, seu telefone e uma senha guardada de forma
          protegida (hash). O CPF e o telefone servem para confirmar quem está pedindo o acesso, liberar a conta e falar
          com você pelo suporte. A autenticação é feita pelo nosso provedor de autenticação; não guardamos senhas em texto
          puro.
        </p>
        <Lead>Conteúdo que você envia.</Lead>
        <p>
          Para gerar os cortes, processamos os links de vídeo que você informa (por exemplo, links de vídeos que você
          tem autorização para usar) e os arquivos de vídeo que você envia. Guardamos os cortes, as transcrições, as
          legendas e os dados de processamento para que você possa ver, editar e exportar. Você é responsável por ter
          os direitos sobre o conteúdo que envia.
        </p>
        <Lead>Informações de cobrança.</Lead>
        <p>
          Os planos pagos são processados pela Stripe, nosso processador de pagamentos. Não guardamos o número
          completo do seu cartão; mantemos a situação da assinatura e um identificador de cliente necessário para
          administrar a cobrança.
        </p>
        <Lead>Dados de uso, de dispositivo e registros.</Lead>
        <p>
          Coletamos identificadores de sessão, endereço IP e registros técnicos básicos para operar, proteger e
          corrigir o Serviço. Se a análise de acessos estiver ativada no site hospedado, usamos um provedor que
          respeita a privacidade e não monta perfis de publicidade entre sites.
        </p>
        <Lead>Informações de campanha e de indicação.</Lead>
        <p>
          Quando você visita o site sem estar conectado, o seu navegador guarda por até 90 dias um registro de como
          você chegou pela primeira vez. Esse registro fica no armazenamento local do navegador, não em um cookie. Ele
          inclui as marcações de campanha do link que você seguiu (como <code>utm_source</code>,{" "}
          <code>utm_campaign</code> ou um código <code>ref</code>), o domínio do site de origem (não o endereço
          completo), a página em que você entrou e o horário da visita. Os endereços das páginas são reduzidos à rota,
          de modo que links de compartilhamento e identificadores de projeto nunca são registrados. Nada é registrado
          enquanto você está conectado.
        </p>
        <p>
          A primeira conta que entrar nesse navegador fica com o registro, que então é apagado do navegador para que
          nenhuma outra conta o use. Se a conta for nova, salvamos o registro nela uma única vez, logo depois do
          cadastro. Também anotamos quando você baixa ou exporta um corte pela primeira vez. Usamos isso para saber
          quais canais trazem pessoas que acham o ClipGringa útil. Se a análise de acessos estiver ativada, os
          eventos de cadastro e de exportação de corte enviados ao provedor incluem os mesmos campos de campanha. Não
          usamos essas informações para publicidade nem as vendemos. Você pode remover o registro do navegador
          limpando os dados do site clipgringa.gringatools.com.
        </p>
      </Section>

      <Section title="Como usamos as suas informações">
        <ul className="list-disc space-y-2 pl-6">
          <li>Prestar o Serviço: processar os seus vídeos e gerar, editar e exportar cortes.</li>
          <li>Autenticar você e manter a sua conta segura.</li>
          <li>Processar pagamentos e administrar assinaturas.</li>
          <li>Enviar e-mails de serviço (por exemplo, confirmação de cadastro, avisos de conclusão e recibos de cobrança).</li>
          <li>Manter, corrigir, proteger e melhorar o Serviço.</li>
          <li>Entender quais campanhas e sites de origem levam a cadastros e às primeiras exportações de cortes.</li>
          <li>Cumprir obrigações legais e fazer valer os nossos termos.</li>
        </ul>
      </Section>

      <Section title="Prestadores de serviço e suboperadores">
        <p>
          Compartilhamos dados com fornecedores que os tratam em nosso nome, apenas na medida necessária para prestar
          o Serviço:
        </p>
        <ul className="list-disc space-y-2 pl-6">
          <li><span className="text-foreground">Transcrição</span>: para transcrever o áudio dos seus vídeos.</li>
          <li><span className="text-foreground">Provedores de IA</span>: para analisar as transcrições e identificar os trechos que rendem cortes.</li>
          <li><span className="text-foreground">Stripe</span>: processamento de pagamentos.</li>
          <li><span className="text-foreground">Envio de e-mail</span>: e-mails de serviço.</li>
          <li><span className="text-foreground">Hospedagem e infraestrutura</span>: para manter o Serviço no ar.</li>
          <li><span className="text-foreground">Análise de acessos</span>: quando ativada, para medir visitas ao site, cadastros e exportações de cortes.</li>
        </ul>
        <p>
          Não vendemos as suas informações pessoais e não as usamos para publicidade comportamental entre contextos.
          Podemos divulgar informações se a lei exigir ou para proteger os direitos e a segurança dos nossos usuários
          e do Serviço.
        </p>
      </Section>

      <Section title="Extensão de navegador ClipGringa Flow">
        <p>
          A extensão opcional “ClipGringa · Flow” para o Chrome ajuda você a rodar os prompts de um pacote do
          ClipGringa dentro do seu próprio projeto no Google Flow. Ela só funciona em <code>flow.google.com</code>, em{" "}
          <code>labs.google</code> (apenas nas páginas do Flow) e no próprio site do ClipGringa, onde responde se a sua
          conta do Flow está conectada.
        </p>
        <p>
          A extensão não vende dados pessoais e não faz pedidos de rede por conta própria. Enquanto você está
          conectado ao ClipGringa, ela informa ao site se a sua conta do Google está conectada ao Flow e, quando o
          Flow mostra na tela, o nome do seu plano do Flow e o seu saldo de créditos. O ClipGringa guarda apenas esses
          valores e o horário da última verificação, para que você e o administrador do ClipGringa vejam a situação
          da conexão. O pacote que você cola nela (prompts e nomes de arquivo) e o andamento ficam apenas no
          armazenamento local da extensão no seu navegador, para que uma execução continue depois de recarregar a
          página; você pode removê-los excluindo a extensão. Não recebemos a sua senha nem o seu e-mail do Google, nem
          os seus projetos do Flow, prompts ou mídias geradas.
        </p>
        <p>
          A permissão “debugger” é usada apenas para enviar um clique de mouse real à aba do Flow que você está
          usando (o Flow ignora cliques simulados), e a permissão “downloads” é usada apenas para dar nome aos vídeos
          que você baixa (por exemplo, Video01_Cena01.mp4). Nenhuma das duas é usada para ler outros sites ou abas.
        </p>
      </Section>

      <Section title="Páginas do Facebook e dados da Meta">
        <p>
          Se você decidir conectar uma Página do Facebook, você entra com o Facebook e a Meta compartilha conosco o
          seu ID de usuário e o seu nome no Facebook, a lista de Páginas que você administra e um token de acesso de
          cada Página que você selecionar. Usamos esses dados apenas para fazer o que você pede dentro do ClipGringa:
          publicar e agendar as suas postagens; ler as postagens e os vídeos das suas próprias Páginas e as
          visualizações deles, para você ver qual formato está funcionando; ler os comentários das suas postagens para
          enviar o link que você configurou a quem comentar a palavra-chave que você escolheu; e, se você ativar,
          responder as mensagens enviadas à sua Página.
        </p>
        <p>
          Para essas respostas automáticas, guardamos o texto do comentário ou da mensagem, o ID dele, e o ID e o nome
          que o Facebook entrega à sua Página sobre quem escreveu, para que ninguém seja respondido duas vezes. O
          ClipSpy pesquisa a Biblioteca de Anúncios pública da Meta; ele guarda informações públicas dos anúncios (a
          Página anunciante, o texto e as datas do anúncio) e nenhum dado pessoal de quem viu esses anúncios.
        </p>
        <p>
          Os tokens de acesso ficam criptografados no nosso servidor e nunca voltam a ser mostrados no aplicativo nem
          enviados ao seu navegador. Não vendemos dados recebidos da Meta, não os usamos para publicidade e não os
          compartilhamos com ninguém além dos prestadores de serviço que hospedam o ClipGringa. Você pode remover um
          login do Facebook ou uma Página a qualquer momento na área Facebook do aplicativo, o que apaga do nosso
          servidor o token, os comentários, as mensagens e as estatísticas. O passo a passo está na{" "}
          <Link className="text-foreground underline" href="/data-deletion">página de exclusão de dados</Link>.
        </p>
      </Section>

      <Section title="Por quanto tempo guardamos os dados">
        <p>
          Guardamos as informações da sua conta, incluindo as informações de campanha e de indicação salvas no
          cadastro, enquanto a conta estiver ativa. As suas tarefas, os vídeos enviados e os cortes gerados ficam
          guardados até você excluí-los ou excluir a conta. Os arquivos temporários de processamento são apagados
          automaticamente depois do processamento. Podemos manter registros limitados quando exigido para fins legais,
          de segurança ou contábeis.
        </p>
      </Section>

      <Section title="Seus direitos e escolhas">
        <p>
          Você pode ver e atualizar as informações da sua conta no aplicativo. Pode excluir tarefas e cortes a
          qualquer momento. Pode excluir a sua conta, o que remove os dados ligados a ela, pelo aplicativo ou
          escrevendo para {mail}.
        </p>
        <p>
          Dependendo de onde você mora (por exemplo, sob o GDPR ou a CCPA/CPRA), você pode ter direito de acessar,
          corrigir, excluir ou portar os seus dados pessoais, e de se opor a certos tratamentos ou restringi-los. Para
          exercer esses direitos, escreva para o endereço abaixo. Não tratamos você de forma diferente por exercer os
          seus direitos.
        </p>
      </Section>

      <Section title="Segurança">
        <p>
          Usamos proteções padrão do setor, incluindo criptografia em trânsito (HTTPS). Em dispositivos móveis, as
          credenciais de sessão ficam no cofre de chaves do sistema operacional. Nenhum método de transmissão ou de
          armazenamento é totalmente seguro, mas trabalhamos para proteger as suas informações com medidas técnicas e
          organizacionais razoáveis.
        </p>
      </Section>

      <Section title="Transferências internacionais">
        <p>
          Podemos tratar e guardar informações em países diferentes daquele onde você mora. Quando exigido, usamos
          salvaguardas adequadas para essas transferências.
        </p>
      </Section>

      <Section title="Privacidade de crianças">
        <p>
          O Serviço não é direcionado a crianças com menos de 13 anos (ou a idade mínima exigida onde você mora), e
          não coletamos intencionalmente informações pessoais delas. Se você acredita que uma criança nos forneceu
          informações pessoais, escreva para nós e nós as apagaremos.
        </p>
      </Section>

      <Section title="Mudanças nesta política">
        <p>
          Podemos atualizar esta Política de Privacidade de tempos em tempos. Quando isso acontecer, mudaremos a data
          de “Última atualização” acima e, quando for o caso, avisaremos de outra forma. Continuar usando o Serviço
          depois de uma atualização significa que você aceita a política revisada.
        </p>
      </Section>

      <Section title="Fale conosco">
        <p>Dúvidas sobre esta política ou sobre os seus dados? Escreva para {mail}.</p>
      </Section>
    </div>
  );
}
