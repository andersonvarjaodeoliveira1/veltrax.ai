import { LegalLead as Lead, LegalSection as Section } from "@/components/legal/legal-section";
import { OPERATOR_NAME } from "@/lib/site";

/**
 * Termos de serviço em português: tradução fiel do texto em inglês que fica logo abaixo na mesma página.
 * Mudou um dos dois? Mude o outro junto.
 */
export function TermsPortuguese({ contactEmail }: { contactEmail: string }) {
  const mail = <a className="text-foreground underline" href={`mailto:${contactEmail}`}>{contactEmail}</a>;
  return (
    <div className="mt-12 space-y-10">
      <Section title="Aceitação">
        <p>
          Estes Termos de Serviço (“Termos”) regem o uso dos aplicativos e do serviço hospedado do ClipGringa (o
          “Serviço”), que transformam vídeos longos em cortes curtos com legenda. Ao criar uma conta ou usar o
          Serviço, você concorda com estes Termos. Se não concorda, não use o Serviço. O Serviço é operado por{" "}
          {OPERATOR_NAME}.
        </p>
        <p>
          O ClipGringa também existe como software de código aberto que você pode hospedar por conta própria. Estes
          Termos valem para o serviço hospedado operado pelo ClipGringa; as instalações próprias são regidas pela
          licença de código aberto aplicável e pelos termos do próprio operador.
        </p>
      </Section>

      <Section title="Sua conta">
        <p>
          Você deve informar dados corretos ao criar a conta e manter as suas credenciais em segurança. Você é
          responsável pelo que acontece na sua conta. É preciso ter pelo menos 13 anos (ou a idade mínima exigida
          onde você mora) para usar o Serviço.
        </p>
      </Section>

      <Section title="Seu conteúdo e suas responsabilidades">
        <p>
          Você continua dono dos vídeos que envia e dos cortes que o Serviço gera a partir deles. Você nos concede os
          direitos limitados necessários para processar, guardar e entregar esse conteúdo a você como parte da
          operação do Serviço.
        </p>
        <p>
          Você é o único responsável por ter os direitos necessários sobre o conteúdo que envia, incluindo vídeos
          indicados por link. Você não pode usar o Serviço para processar conteúdo que viole direitos de terceiros,
          que seja ilegal ou que descumpra os termos de uma plataforma aos quais você está sujeito.
        </p>
      </Section>

      <Section title="Contas de teste e uso aceitável">
        <p>
          As contas de teste servem apenas para avaliação pessoal e são desativadas automaticamente quando o período
          de teste termina. Você não pode usar robôs ou scripts para extrair, raspar, revender ou redistribuir o
          serviço, nem fazer engenharia reversa do aplicativo hospedado ou dos seus prompts e fluxos de trabalho.
          Podemos suspender as contas que fizerem isso. Nada aqui limita os direitos que a licença de código aberto do
          código-fonte publicado dá a você sobre esse código.
        </p>
      </Section>

      <Section title="Assinaturas e cobrança">
        <p>
          Os planos pagos (por exemplo, Pro e Scale) liberam limites mensais maiores de geração de cortes. O mesmo
          direito de plano vale para a sua conta, não importa onde você comprou.
        </p>
        <Lead>Compras pelo site.</Lead>
        <p>
          As assinaturas feitas pelo site são cobradas mensalmente pela Stripe, nosso processador de pagamentos. Elas
          se renovam automaticamente até serem canceladas. Você pode cancelar quando quiser pelo portal de cobrança em
          Configurações; o acesso continua até o fim do período pago.
        </p>
        <Lead>Compras no aplicativo para iOS.</Lead>
        <p>
          As assinaturas compradas no aplicativo para iOS são cobradas no seu Apple ID como assinaturas com renovação
          automática. O pagamento é cobrado na confirmação da compra, e a assinatura se renova automaticamente, a
          menos que seja cancelada pelo menos 24 horas antes do fim do período atual. Você pode administrar ou
          cancelar as assinaturas da App Store nos ajustes de assinatura do seu aparelho; elas não podem ser
          administradas pelo site. Os reembolsos de compras da App Store são tratados pela Apple.
        </p>
        <p>
          A assinatura é administrada pela plataforma onde foi comprada. Os preços podem mudar mediante aviso; as
          mudanças valem a partir da renovação seguinte. Exceto quando a lei ou a política de reembolso da plataforma
          exigir, os valores pagos não são reembolsáveis.
        </p>
      </Section>

      <Section title="Uso aceitável">
        <ul className="list-disc space-y-2 pl-6">
          <li>Nada de conteúdo ilegal, prejudicial ou que viole direitos de terceiros.</li>
          <li>Nada de tentar sondar, interromper ou sobrecarregar o Serviço, nem burlar os limites de uso.</li>
          <li>
            Nada de usar robôs, raspadores, rastreadores ou agentes de IA para varrer, copiar, clonar ou fazer
            engenharia reversa do Serviço hospedado, das suas telas, prompts, fluxos de trabalho ou dados, e nada de
            usar o conteúdo dele para treinar modelos de IA. Por segurança, registramos sinais como tentativas de
            abrir as ferramentas de desenvolvedor, ver o código-fonte ou copiar grandes partes da interface (nunca o
            texto que você digita ou cola), e podemos avisar os operadores.
          </li>
          <li>Nada de revender o Serviço hospedado ou oferecê-lo com outra marca sem a nossa permissão por escrito.</li>
          <li>Nada de usar o Serviço para descumprir os termos de plataformas de terceiros que valem para você.</li>
        </ul>
        <p>Podemos suspender ou encerrar as contas que descumprirem estes Termos.</p>
      </Section>

      <Section title="Propriedade intelectual">
        <p>
          O Serviço, incluindo o software, o design e a marca, pertence ao ClipGringa ou aos seus licenciadores. Os
          componentes de código aberto são licenciados pelas respectivas licenças. Estes Termos não dão a você
          nenhum direito sobre as nossas marcas.
        </p>
      </Section>

      <Section title="Isenções de garantia">
        <p>
          O Serviço é oferecido “como está” e “conforme disponível”. O conteúdo gerado por IA (transcrições, legendas,
          escolha de cortes, estimativas de viralidade) pode conter erros e é oferecido sem garantia de exatidão. Na
          máxima medida permitida pela lei, não damos nenhuma garantia, expressa ou implícita, incluindo adequação a
          um fim específico e não violação de direitos.
        </p>
      </Section>

      <Section title="Limitação de responsabilidade">
        <p>
          Na máxima medida permitida pela lei, o ClipGringa não responde por danos indiretos, incidentais, especiais,
          consequentes ou punitivos, nem por perda de lucros, de dados ou de reputação. A nossa responsabilidade total
          por reclamações ligadas ao Serviço é limitada ao valor que você nos pagou nos doze meses anteriores ao fato
          que deu origem à reclamação.
        </p>
      </Section>

      <Section title="Encerramento">
        <p>
          Você pode parar de usar o Serviço e excluir a sua conta a qualquer momento. Podemos suspender ou encerrar o
          seu acesso por descumprimento destes Termos ou quando a lei exigir. As seções que, pela sua natureza, devem
          continuar valendo depois do encerramento (como propriedade, isenções de garantia e limitação de
          responsabilidade) continuam valendo.
        </p>
      </Section>

      <Section title="Mudanças nestes Termos">
        <p>
          Podemos atualizar estes Termos de tempos em tempos. Quando isso acontecer, mudaremos a data de “Última
          atualização” acima e, quando for o caso, avisaremos de outra forma. Continuar usando o Serviço depois de uma
          atualização significa que você aceita os Termos revisados.
        </p>
      </Section>

      <Section title="Fale conosco">
        <p>Dúvidas sobre estes Termos? Escreva para {mail}.</p>
      </Section>
    </div>
  );
}
