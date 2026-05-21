import { LegalLayout } from './LegalLayout.jsx';
import { getPublicSiteOrigin } from '../constants/publicSite.js';

export function TermsPage() {
  const origin = getPublicSiteOrigin() || 'https://omnira-saas-application.vercel.app';

  return (
    <LegalLayout
      variant="terms"
      titleBefore="Términos de"
      titleAccent="uso"
      meta="Última actualización: 9 de mayo de 2026 · Léelos antes de usar Omnira"
    >
      <div className="legal-section">
        <p>
          Estos Términos de uso («Términos») regulan el acceso y uso de la plataforma y los servicios de Omnira. Al crear
          una cuenta o utilizar Omnira, aceptas quedar vinculado por estos Términos. Si no estás de acuerdo, no utilices
          el servicio.
        </p>
      </div>

      <div className="legal-section">
        <h2>1. Descripción del servicio</h2>
        <p>
          Omnira es una plataforma SaaS que permite a negocios automatizar comunicaciones por WhatsApp, gestionar la
          interacción con clientes y organizar citas de forma continua. El servicio puede integrarse con la API de
          WhatsApp Business de Meta Platforms, Inc.
        </p>
      </div>

      <div className="legal-section">
        <h2>2. Elegibilidad</h2>
        <p>
          Debes tener al menos 18 años y la capacidad legal para obligarte en nombre propio o de tu empresa. Al usar
          Omnira declaras que cumples estos requisitos.
        </p>
      </div>

      <div className="legal-section">
        <h2>3. Registro de cuenta</h2>
        <p>Para usar Omnira debes crear una cuenta y proporcionar información veraz y completa. Eres responsable de:</p>
        <ul>
          <li>Mantener la confidencialidad de tus credenciales de acceso.</li>
          <li>Todas las actividades realizadas con tu cuenta.</li>
          <li>Notificarnos de inmediato cualquier uso no autorizado.</li>
        </ul>
      </div>

      <div className="legal-section">
        <h2>4. Uso aceptable</h2>
        <p>Te comprometes a usar Omnira solo para fines lícitos y empresariales legítimos. No debes:</p>
        <ul>
          <li>Enviar spam, mensajes no solicitados o comunicaciones engañosas.</li>
          <li>Infringir las políticas de WhatsApp o de Meta.</li>
          <li>Utilizar la plataforma para acosar, amenazar o dañar a terceros.</li>
          <li>Intentar vulnerar, descompilar o interrumpir el servicio de forma indebida.</li>
          <li>Revender o sublicenciar el servicio sin autorización previa por escrito.</li>
          <li>Usar Omnira para actividades ilícitas.</li>
        </ul>
        <div className="legal-highlight">
          El incumplimiento grave de estas reglas puede conllevar la suspensión o baja inmediata de la cuenta, sin
          perjuicio de otras acciones que correspondan según ley o contrato.
        </div>
      </div>

      <div className="legal-section">
        <h2>5. Cumplimiento con WhatsApp Business API</h2>
        <p>
          Al usar la integración con WhatsApp, aceptas cumplir la política comercial y de mensajería aplicable de Meta,
          así como la normativa sectorial que te resulte aplicable. Eres responsable del contenido y del uso que hagas
          de la API a través de Omnira.
        </p>
      </div>

      <div className="legal-section">
        <h2>6. Suscripciones y pagos</h2>
        <ul>
          <li>Omnira ofrece planes de suscripción de pago con periodicidad indicada en la web o en el panel.</li>
          <li>Los pagos se procesan mediante proveedores externos seguros.</li>
          <li>Las suscripciones pueden renovarse automáticamente salvo cancelación antes del siguiente ciclo.</li>
          <li>Los precios pueden actualizarse con un preaviso razonable (por ejemplo, 30 días) cuando la ley lo permita.</li>
          <li>Las políticas de reembolso se aplicarán según lo indicado en el momento de la contratación o la normativa aplicable.</li>
        </ul>
      </div>

      <div className="legal-section">
        <h2>7. Propiedad intelectual</h2>
        <p>
          El software, la marca, los textos de la interfaz y demás contenidos de Omnira están protegidos por la
          legislación aplicable. No puedes copiar, modificar, distribuir ni crear obras derivadas sin autorización
          expresa.
        </p>
      </div>

      <div className="legal-section">
        <h2>8. Limitación de responsabilidad</h2>
        <p>
          En la medida máxima permitida por la ley, Omnira no será responsable de daños indirectos, lucro cesante,
          pérdida de datos o interrupción del negocio derivados del uso del servicio, salvo que la normativa imperativa
          disponga lo contrario.
        </p>
        <div className="legal-highlight">
          En cualquier caso, la responsabilidad global de Omnira frente a un usuario por un mismo hecho quedará limitada,
          en la medida en que la ley lo permita, al importe abonado por ese usuario a Omnira en los doce (12) meses
          anteriores al hecho causante, salvo dolo o culpa grave.
        </div>
      </div>

      <div className="legal-section">
        <h2>9. Disponibilidad del servicio</h2>
        <p>
          Procuramos mantener el servicio disponible, pero no garantizamos un acceso ininterrumpido. Podremos suspender
          temporalmente el servicio por mantenimiento, actualizaciones o causas de fuerza mayor, procurando avisar con
          antelación cuando sea razonablemente posible.
        </p>
      </div>

      <div className="legal-section">
        <h2>10. Baja y terminación</h2>
        <p>
          Puedes dejar de usar Omnira y solicitar la baja según las opciones del panel o contactando con soporte. Nos
          reservamos suspender o terminar el acceso si incumples estos Términos, con o sin preaviso según la gravedad
          del incumplimiento.
        </p>
      </div>

      <div className="legal-section">
        <h2>11. Modificaciones</h2>
        <p>
          Podremos actualizar estos Términos. Los cambios sustanciales se comunicarán por correo o aviso en la
          plataforma. El uso continuado tras la entrada en vigor implica la aceptación de la nueva versión, sin perjuicio
          de los derechos que te asisten como consumidor.
        </p>
      </div>

      <div className="legal-section">
        <h2>12. Ley aplicable y jurisdicción</h2>
        <p>
          Estos Términos se rigen por la ley aplicable en función del prestador y del usuario. Las partes someterán las
          controversias a los tribunales que correspondan según dicha ley, sin perjuicio de normas imperativas sobre
          consumidores.
        </p>
      </div>

      <div className="legal-section">
        <h2>13. Contacto</h2>
        <p>
          Para cualquier consulta sobre estos Términos o la{' '}
          <a href="/privacidad">Política de privacidad</a>:
        </p>
        <div className="legal-contact">
          <p>
            <strong>Omnira</strong>
          </p>
          <p>
            Correo: <a href="mailto:ayuda@omnira.chat">ayuda@omnira.chat</a>
          </p>
          <p>
            Sitio web:{' '}
            <a href={origin || '/'}>{origin.replace(/^https?:\/\//, '') || 'omnira'}</a>
          </p>
        </div>
      </div>
    </LegalLayout>
  );
}
